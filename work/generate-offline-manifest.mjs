import {createHash} from 'node:crypto';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {join,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const staticRoot=fileURLToPath(new URL('../dist/',import.meta.url));

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
  const path=relative(staticRoot,file).split(sep).join('/');
  if(path==='index.html')return './';
  if(path.endsWith('/index.html'))return `./${path.slice(0,-'index.html'.length)}`;
  return `./${path}`;
}

const buildFiles=(await walk(staticRoot)).filter(file=>{
  const path=relative(staticRoot,file).split(sep).join('/');
  return path!=='.assetsignore'&&path!=='offline-assets.json'&&!path.startsWith('.openai/');
}).sort();
const files=buildFiles.map(browserUrl);
const hash=createHash('sha256');
for(const file of buildFiles){
  hash.update(relative(staticRoot,file).split(sep).join('/'));
  hash.update('\0');
  hash.update(await readFile(file));
  hash.update('\0');
}
const buildVersion=hash.digest('hex').slice(0,12);
const serviceWorkerPath=join(staticRoot,'sw.js');
const serviceWorker=await readFile(serviceWorkerPath,'utf8');
if(!serviceWorker.includes('__BUILD_VERSION__'))throw new Error('Service worker build-version token is missing');
await writeFile(serviceWorkerPath,serviceWorker.replaceAll('__BUILD_VERSION__',buildVersion));
await writeFile(join(staticRoot,'offline-assets.json'),`${JSON.stringify(files,null,2)}\n`);
console.log(`Offline asset manifest: ${files.length} files · cache ${buildVersion}`);
