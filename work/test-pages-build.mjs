import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,readdir,stat} from 'node:fs/promises';
import {extname,join,normalize,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isStandaloneDisplay} from '../shared/platform.js';

const root=fileURLToPath(new URL('../dist/',import.meta.url));
const gamesRoot=fileURLToPath(new URL('../games/',import.meta.url));
const prefix='/sample-repo/';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};

const server=createServer(async(request,response)=>{
  try{
    const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
    if(!pathname.startsWith(prefix)){response.writeHead(404).end();return}
    const requested=normalize(pathname.slice(prefix.length)).replace(/^(\.\.[/\\])+/, '');
    let file=join(root,requested);
    if((await stat(file)).isDirectory())file=join(file,'index.html');
    const body=await readFile(file);
    response.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream'}).end(body);
  }catch{response.writeHead(404).end()}
});

await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const address=server.address();
const base=`http://127.0.0.1:${address.port}${prefix}`;

try{
  const gameDirectories=[];
  for(const entry of await readdir(gamesRoot,{withFileTypes:true})){
    if(!entry.isDirectory())continue;
    try{if((await stat(join(gamesRoot,entry.name,'index.html'))).isFile())gameDirectories.push(entry.name)}catch{}
  }
  gameDirectories.sort();
  const routes=['',...gameDirectories.map(name=>`games/${name}/`)];
  for(const route of routes){
    const pageUrl=new URL(route,base);
    const response=await fetch(pageUrl);
    assert.equal(response.status,200,`${route||'hub'} must load below a repository base path`);
    const html=await response.text();
    const refs=[...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match=>match[1]).filter(ref=>!ref.startsWith('http'));
    for(const ref of refs){
      const asset=await fetch(new URL(ref,pageUrl));
      assert.equal(asset.status,200,`${route}${ref} must resolve from its own page`);
    }
    if(route)assert.equal(html.includes('manifest.webmanifest'),false,'only the hub may expose the PWA manifest');
  }

  const manifestUrl=new URL('manifest.webmanifest',base);
  const manifest=await (await fetch(manifestUrl)).json();
  assert.equal(manifest.scope,'./');
  assert.equal(manifest.start_url,'./?source=pwa');
  assert.equal(manifest.display,'standalone');
  assert.equal(new URL(manifest.scope,manifestUrl).href,base,'manifest scope must resolve to the repository root');
  assert.equal(new URL(manifest.start_url,manifestUrl).href,`${base}?source=pwa`,'manifest start_url must stay below the repository root');

  const serviceWorkerUrl=new URL('sw.js',base);
  const serviceWorkerScope=new URL('./',serviceWorkerUrl).href;
  assert.equal(serviceWorkerScope,base);
  for(const route of routes)assert.ok(new URL(route,base).href.startsWith(serviceWorkerScope),`${route||'hub'} must be inside the service worker scope`);

  const offline=await (await fetch(new URL('offline-assets.json',base))).json();
  for(const file of offline){
    const response=await fetch(new URL(file,base));
    assert.equal(response.status,200,`${file} in the offline manifest must exist`);
  }
  for(const name of gameDirectories)assert.ok(offline.includes(`./games/${name}/`),`${name} must be included automatically in the offline manifest`);

  const builtFiles=(await walk(root)).filter(file=>{
    const path=relative(root,file).split(sep).join('/');
    return path!=='.assetsignore'&&path!=='offline-assets.json'&&!path.startsWith('.openai/')&&!path.startsWith('client/')&&!path.startsWith('server/');
  });
  const expectedOffline=builtFiles.map(browserUrl).sort();
  assert.deepEqual([...offline].sort(),expectedOffline,'offline manifest must cover every deployable build file');

  const serviceWorker=await readFile(join(root,'sw.js'),'utf8');
  assert.match(serviceWorker,/const CACHE_VERSION='game-hub-[a-f0-9]{12}'/,'cache version must be a build content hash');
  assert.equal(serviceWorker.includes('__BUILD_VERSION__'),false,'the cache placeholder must not reach production');
  assert.ok(serviceWorker.includes('key.startsWith(CACHE_PREFIX)&&key!==CACHE_VERSION'),'old Game Hub caches must be removed on activation');
  assert.ok(serviceWorker.includes('LEGACY_PREFIXES.some'),'legacy game caches must be removed on activation');

  assert.equal(isStandaloneDisplay({mediaQuery:()=>({matches:true}),navigatorObject:{}}),true,'Android installed display mode must be detected');
  assert.equal(isStandaloneDisplay({mediaQuery:()=>({matches:false}),navigatorObject:{standalone:true}}),true,'iPad Safari standalone mode must be detected');
  assert.equal(isStandaloneDisplay({mediaQuery:()=>({matches:false}),navigatorObject:{}}),false,'a normal browser tab must not be treated as standalone');
  console.log(`GitHub Pages base-path test passed (${offline.length} offline files)`);
}finally{
  await new Promise(resolve=>server.close(resolve));
}

async function walk(directory){
  const entries=await readdir(directory,{withFileTypes:true});
  const files=[];
  for(const entry of entries){
    const path=join(directory,entry.name);
    if(entry.isDirectory())files.push(...await walk(path));
    else if(entry.isFile())files.push(path);
  }
  return files;
}

function browserUrl(file){
  const path=relative(root,file).split(sep).join('/');
  if(path==='index.html')return './';
  if(path.endsWith('/index.html'))return `./${path.slice(0,-'index.html'.length)}`;
  return `./${path}`;
}
