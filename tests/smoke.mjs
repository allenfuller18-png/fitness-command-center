import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../src/worker.js';

const fakeAssets={fetch:async()=>new Response('STATIC',{status:200})};
const site='https://fitness.example.com';
for (const path of ['/', '/index.html', '/app.js', '/api/status', '/api/state']) {
  const result=await worker.fetch(new Request(site+path),{ASSETS:fakeAssets});
  assert.equal(result.status,503,`Unconfigured access must deny ${path}`);
  assert.notEqual(await result.text(),'STATIC',`Unconfigured worker served assets at ${path}`);
}
const configured={ASSETS:fakeAssets,ACCESS_TEAM_DOMAIN:'https://example.cloudflareaccess.com',ACCESS_AUD:'test-audience',ALLOWED_EMAIL:'owner@example.com'};
for (const path of ['/', '/api/status', '/api/state']) {
  const result=await worker.fetch(new Request(site+path),configured);
  assert.equal(result.status,401,`A missing JWT must deny ${path}`);
  assert.match(result.headers.get('cache-control')||'',/no-store/,`Unauthorized ${path} should not be cached`);
}
const forgery=await worker.fetch(new Request(site+'/api/state',{headers:{'Cf-Access-Jwt-Assertion':'malformed.fake.jwt'}}),configured);
assert.notEqual(forgery.status,200,'Invalid JWT must not be accepted');
const sw=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
assert.match(sw,/url\.pathname\.startsWith\('\/api\/'\)/,'Service worker must never cache API routes');
assert.match(sw,/request\.method!=='GET'/,'Service worker must not cache writes');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
for(const asset of ['app.js','style.css','manifest.json','icon.svg'])assert.ok(html.includes(asset),`Missing ${asset}`);
assert.doesNotMatch(html,/GOOGLE_SERVICE_ACCOUNT_JSON|CLOUDFLARE_API_TOKEN|-----BEGIN PRIVATE KEY-----/,'Browser HTML contains secret material');
console.log('PASS: privacy and API protections, offline cache exclusions, app shell references');
