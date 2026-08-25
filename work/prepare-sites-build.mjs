import {cpSync,mkdirSync,readdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const workerOutput=resolve(root,'.wrangler','build','server');
const dist=resolve(root,'dist');
const clientOutput=resolve(dist,'client');
const serverOutput=resolve(dist,'server');

rmSync(clientOutput,{recursive:true,force:true});
rmSync(serverOutput,{recursive:true,force:true});
mkdirSync(clientOutput,{recursive:true});
for(const entry of readdirSync(dist,{withFileTypes:true})){
  if(['.openai','client','server'].includes(entry.name))continue;
  cpSync(resolve(dist,entry.name),resolve(clientOutput,entry.name),{recursive:true});
}
cpSync(workerOutput,serverOutput,{recursive:true});
const wranglerPath=resolve(serverOutput,'wrangler.json');
const wrangler=JSON.parse(readFileSync(wranglerPath,'utf8'));
wrangler.assets={...wrangler.assets,directory:'../client'};
writeFileSync(wranglerPath,`${JSON.stringify(wrangler)}\n`);
console.log('Sites package layout: dist/client + dist/server');
