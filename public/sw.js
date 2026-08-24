// The build replaces this token with a content hash. Keep the token in source control.
const CACHE_VERSION='game-hub-__BUILD_VERSION__';
const CACHE_PREFIX='game-hub-';
const LEGACY_PREFIXES=['duo-party-offline-'];
const FALLBACK_URLS=['./','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-512.png','./icons/apple-touch-icon.png','./games/duo-party/','./games/catan/','./games/hexo/'];
const scoped=url=>new URL(url,self.registration.scope).href;

async function assetList(){
  try{
    const response=await fetch(scoped('./offline-assets.json'),{cache:'reload'});
    if(!response.ok)throw new Error(`asset manifest ${response.status}`);
    const files=await response.json();
    return [...new Set([...FALLBACK_URLS,'./offline-assets.json',...files])];
  }catch{return FALLBACK_URLS}
}

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE_VERSION);
    const urls=await assetList();
    await Promise.all(urls.map(url=>cache.add(new Request(scoped(url),{cache:'reload'}))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>(key.startsWith(CACHE_PREFIX)&&key!==CACHE_VERSION)||LEGACY_PREFIXES.some(prefix=>key.startsWith(prefix))).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message',event=>{if(event.data==='SKIP_WAITING')self.skipWaiting()});

async function networkFirst(request){
  const cache=await caches.open(CACHE_VERSION);
  try{
    const response=await fetch(request);
    if(response.ok)await cache.put(request,response.clone());
    return response;
  }catch{
    const exact=await cache.match(request,{ignoreSearch:true});
    if(exact)return exact;
    const url=new URL(request.url);
    const directory=url.pathname.endsWith('/')?url:new URL('./',url);
    return (await cache.match(directory.href,{ignoreSearch:true}))||(await cache.match(scoped('./')))||Response.error();
  }
}

async function cacheFirst(request){
  const cache=await caches.open(CACHE_VERSION);
  const cached=await cache.match(request,{ignoreSearch:true});
  if(cached)return cached;
  try{
    const response=await fetch(request);
    if(response.ok)await cache.put(request,response.clone());
    return response;
  }catch{return Response.error()}
}

self.addEventListener('fetch',event=>{
  const {request}=event;
  if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
  event.respondWith(request.mode==='navigate'?networkFirst(request):cacheFirst(request));
});
