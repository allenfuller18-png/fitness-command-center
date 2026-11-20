/**
 * Fitness Command Center — Cloudflare Worker backend.
 * FAIL-CLOSED: No valid Cloudflare Access JWT => no site/assets/API access.
 * Google Sheets is the remote source of truth once service-account authorization is configured.
 * No secrets, credentials, or health data are committed to the repository.
 */
const enc = new TextEncoder();
const json = (data, status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const base64url = s => Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
const unbase64url = s => JSON.parse(new TextDecoder().decode(base64url(s)));
const jwtParts = token => {const parts=token?.split('.'); if(parts?.length!==3)throw Error('Invalid JWT');return parts};
let keyCache={key:'',until:0,keys:[]};
async function accessClaims(req,env){
  if(!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.ALLOWED_EMAIL)throw Error('Private Access not configured');
  const token=req.headers.get('Cf-Access-Jwt-Assertion'); if(!token)return null;
  const parts=jwtParts(token),header=unbase64url(parts[0]),payload=unbase64url(parts[1]);
  if(header.alg!=='RS256' || !header.kid || !payload.exp || payload.exp <= Date.now()/1000)return null;
  if(payload.nbf && payload.nbf>Date.now()/1000)return null;
  const issuer=env.ACCESS_TEAM_DOMAIN.replace(/\/$/,'');
  if(!issuer.startsWith('https://') || payload.iss!==issuer || ![].concat(payload.aud||[]).includes(env.ACCESS_AUD))return null;
  const email=String(payload.email||'').toLowerCase().trim();
  if(email !== env.ALLOWED_EMAIL.toLowerCase().trim())return null;
  const url=issuer+'/cdn-cgi/access/certs';
  if(keyCache.key!==issuer || Date.now()>keyCache.until){
    let response=await fetch(url);if(!response.ok)throw Error('Cannot verify Access key');
    let bundle=await response.json(); keyCache={key:issuer,until:Date.now()+5*60*1000,keys:bundle.keys||[]};
  }
  let jwk=keyCache.keys.find(k=>k.kid===header.kid); if(!jwk)return null;
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const signed=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,base64url(parts[2]),enc.encode(parts[0]+'.'+parts[1]));
  return signed?{email,sub:payload.sub}:null;
}
const urlSafe = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
let googleToken=null;
async function getGoogleToken(env){
  if(!env.GOOGLE_SERVICE_ACCOUNT_JSON || !env.GOOGLE_SHEET_ID)throw Error('Google Sheets connection not configured');
  if(googleToken && googleToken.expiry>Date.now()+120000)return googleToken.token;
  const service=JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON),iat=Math.floor(Date.now()/1000);
  if(!service.private_key || !service.client_email)throw Error('Invalid service account configuration');
  const header=urlSafe(enc.encode(JSON.stringify({alg:'RS256',typ:'JWT'})));
  const payload=urlSafe(enc.encode(JSON.stringify({iss:service.client_email,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',iat,exp:iat+3600})));
  const pem=service.private_key.replace(/-----(BEGIN|END) PRIVATE KEY-----/g,'').replace(/\s/g,'');
  const key=await crypto.subtle.importKey('pkcs8',Uint8Array.from(atob(pem),c=>c.charCodeAt(0)),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const sig=new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,enc.encode(header+'.'+payload)));
  const jwt=header+'.'+payload+'.'+urlSafe(sig);
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwt})});
  if(!response.ok)throw Error('Google authorization failed');
  const body=await response.json();googleToken={token:body.access_token,expiry:Date.now()+body.expires_in*1000};return googleToken.token;
}
async function googleValues(env,method,body){
  const sheet=env.GOOGLE_SHEET_ID;
  if(!/^[A-Za-z0-9_-]+$/.test(sheet))throw Error('Invalid sheet ID');
  const base=`https://sheets.googleapis.com/v4/spreadsheets/${sheet}/values/`;
  const range="'App Sync'!A1:B500";
  const path=encodeURIComponent(range);
  const endpoint=base+path+(method==='PUT'?'?valueInputOption=RAW':'');
  const response=await fetch(endpoint,{method:method==='PUT'?'PUT':'GET',headers:{authorization:'Bearer '+await getGoogleToken(env),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  if(!response.ok){let error=await response.text();throw Error(`Google Sheets error ${response.status}: ${error.slice(0,250)}`)}
  return response.json();
}

// Mirror logs into visible spreadsheet tabs for human-readable review and formulas.
// The hidden App Sync tab retains the complete app state (including preferences and versions).
async function mirrorLogs(env,data){
  const base=`https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEET_ID}/values`;
  const auth={authorization:'Bearer '+await getGoogleToken(env),'content-type':'application/json'};
  const arrays=[
    ['Sessions',(data.workouts||[]).map(w=>[w.id,w.date,w.type||'',w.name||'',w.status||'',w.minutes||0,w.effort||'',w.feeling||'',w.postBreath||'',w.notes||''])],
    ['Sets',(data.workouts||[]).flatMap(w=>(w.entries||[]).map((x,i)=>[w.id,x.exerciseId||'',i+1,'',x.reps??'',x.resistance||'','',x.effort??'',x.notes||'']))],
    ['Cardio',(data.cardio||[]).map(x=>[x.date,x.type||'',x.minutes??'',x.distance||'',x.steps||'',x.intensity||'',x.breathing||'',x.heart||'',x.recovery||'',x.notes||''])],
    ['Wellness',(data.wellness||[]).map(x=>[x.date,x.mood??'',x.energy??'',x.sleep??'',x.sleepHours??'',x.knee??'',x.back??'',x.breathing??'',x.soreness??'',x.motivation??'',x.daily??'',x.notes||''])],
    ['Readiness',(data.workouts||[]).filter(x=>x.readiness).map(w=>{const r=w.readiness;return [r.date||w.date,w.id,r.energy??'',r.breath||'',r.knee??'',r.back??'',r.sleep??'',r.sore??'',r.motivation??'',r.result||'']})],
  ];
  const max=arrays.reduce((n,[,rows])=>Math.max(n,rows.length),0);
  if(max>950)throw Error('Visible log tabs require archiving before exceeding 950 rows');
  const ranges=arrays.map(([name])=>`'${name}'!A2:L1000`);
  let response=await fetch(base+':batchClear',{method:'POST',headers:auth,body:JSON.stringify({ranges})});
  if(!response.ok)throw Error('Could not clear spreadsheet mirror');
  const dataRanges=arrays.filter(([,rows])=>rows.length).map(([name,rows])=>({range:`'${name}'!A2`,majorDimension:'ROWS',values:rows}));
  if(!dataRanges.length)return;
  response=await fetch(base+':batchUpdate',{method:'POST',headers:auth,body:JSON.stringify({valueInputOption:'RAW',data:dataRanges})});
  if(!response.ok)throw Error('Could not update spreadsheet mirror');
}

const tag=()=>crypto.randomUUID();
async function readState(env){
  const rows=(await googleValues(env,'GET')).values||[];
  if(rows.length<2 || !rows[0]?.[0])return {version:null,data:null};
  let count=Number(rows[0][1]);if(!Number.isInteger(count)||count<1||count>499)throw Error('Invalid saved chunk count');
  let state=rows.slice(1,count+1).map(x=>x[0]||'').join('');
  if(!state)throw Error('Empty saved state');
  return {version:rows[0][0],data:JSON.parse(state)};
}
async function writeState(env,expected,data){
  const current=await readState(env);
  if((current.version||null)!==(expected||null))return {conflict:true,current:current.version};
  if(!data || !Array.isArray(data.workouts)||!Array.isArray(data.cardio)||!Array.isArray(data.wellness))throw Error('Invalid workout data');
  const str=JSON.stringify(data);if(str.length>1_000_000)throw Error('Backup too large (1 MB limit)');
  let chunks=str.match(/[\s\S]{1,18000}/g)||[];
  if(chunks.length>499)throw Error('Backup too large for this Sheet');
  await mirrorLogs(env,data);
  const version=tag();await googleValues(env,'PUT',{range:"'App Sync'!A1:B"+(chunks.length+1),majorDimension:'ROWS',values:[[version,String(chunks.length)],...chunks.map(x=>[x,''])]});
  return {version};
}
function fail(code,message){return json({error:message},code)}
export default {async fetch(req,env){
  try{
    const user=await accessClaims(req,env);if(!user)return fail(401,'Private sign-in required. Configure Cloudflare Access for this Worker.');
    const u=new URL(req.url);
    if(req.method !== 'GET' && req.method !== 'HEAD'){
      const origin=req.headers.get('origin');
      if(origin && origin!==u.origin)return fail(403,'Cross-origin requests are not permitted');
      if(u.pathname.startsWith('/api/') && !req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return fail(415,'Expected JSON request');
    }
    if(u.pathname==='/api/status')return json({authenticated:true,account:user.email,sheetsConfigured:Boolean(env.GOOGLE_SERVICE_ACCOUNT_JSON && env.GOOGLE_SHEET_ID),liveAiConfigured:false});
    if(u.pathname==='/api/state'){
      if(req.method==='GET')return json(await readState(env));
      if(req.method==='PUT'){
        const raw=await req.text();if(raw.length>1_200_000)return fail(413,'State too large');
        const input=JSON.parse(raw);
        const result=await writeState(env,input.version??null,input.data);
        if(result.conflict)return json({error:'Version conflict. Please export a backup before reloading.',current:result.current},409);
        return json(result);
      }
      return fail(405,'Method not allowed');
    }
    if(u.pathname.startsWith('/api/'))return fail(404,'Unknown API route');
    const response=await env.ASSETS.fetch(req);
    const h=new Headers(response.headers);h.set('cache-control','private, no-store');h.set('x-content-type-options','nosniff');h.set('referrer-policy','same-origin');h.set('x-frame-options','DENY');h.set('permissions-policy','geolocation=(), camera=()');h.set('content-security-policy',"default-src 'self'; connect-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers:h});
  }catch(e){return fail(503,'Service temporarily unavailable: '+String(e.message||e).slice(0,170))}
}};