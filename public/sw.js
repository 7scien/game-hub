const CACHE='duo-party-offline-v1';
const CORE=['./','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-512.png','./icons/apple-touch-icon.png'];

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);await Promise.allSettled(CORE.map(url=>cache.add(url)));
    try{
      const response=await fetch('./'),html=await response.clone().text();await cache.put('./',response);
      const assets=[...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map(match=>match[1]).filter(url=>!url.startsWith('http')&&!url.startsWith('data:'));
      await Promise.allSettled([...new Set(assets)].map(url=>cache.add(url)));
    }catch{}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)));await self.clients.claim()})());
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    try{const response=await fetch(event.request);if(response.ok)cache.put(event.request,response.clone());return response}
    catch{const cached=await cache.match(event.request,{ignoreSearch:true})||await cache.match('./');return cached||Response.error()}
  })());
});
