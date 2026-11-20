/* Offline app shell only. Never cache private API responses or authenticated data. */
const CACHE='fitness-command-center-v4';
const SHELL=['./','./index.html','./app.js','./style.css','./manifest.json','./icon.svg'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(name=>name.startsWith('fitness-command-center-')&&name!==CACHE).map(name=>caches.delete(name)))));
  self.clients.claim();
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/cdn-cgi/'))return;
  const isNavigation=request.mode==='navigate';
  const allowed=new Set(['/','/index.html','/app.js','/style.css','/manifest.json','/icon.svg']);
  if(!isNavigation&&!allowed.has(url.pathname))return;
  event.respondWith((async()=>{
    try{
      const response=await fetch(request);
      if(response.ok&&allowed.has(url.pathname)&&response.type==='basic'){
        const cache=await caches.open(CACHE);
        await cache.put(request,response.clone());
      }
      return response;
    }catch{
      const cache=await caches.open(CACHE);
      const cached=await cache.match(isNavigation?'./index.html':request);
      return cached||new Response('Offline. Reconnect to access this resource.',{status:503,headers:{'content-type':'text/plain'}});
    }
  })());
});