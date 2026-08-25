import {defineConfig} from 'vite';
import {sites} from '@openai/sites-vite-plugin';
import react from '@vitejs/plugin-react';
import {existsSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';

const gamesRoot=resolve(import.meta.dirname,'games');
const staticOutput=resolve(import.meta.dirname,'dist');
const workerOutput=resolve(import.meta.dirname,'.wrangler','build','server');
const gamePages=Object.fromEntries(readdirSync(gamesRoot,{withFileTypes:true})
  .filter(entry=>entry.isDirectory()&&existsSync(resolve(gamesRoot,entry.name,'index.html')))
  .map(entry=>[`game_${entry.name.replace(/[^a-zA-Z0-9_-]/g,'_')}`,resolve(gamesRoot,entry.name,'index.html')]));

const pages={
  hub:resolve(import.meta.dirname,'index.html'),
  ...gamePages,
};

const hubPages={
  name:'game-hub-pages',
  configEnvironment(name){
    if(name==='client')return {build:{rollupOptions:{input:pages}}};
  },
};

export default defineConfig(async()=>{
  process.env.WRANGLER_WRITE_LOGS??='false';
  process.env.WRANGLER_LOG_PATH??='.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH??='.wrangler/registry';
  const {cloudflare}=await import('@cloudflare/vite-plugin');
  return {
    base:'./',
    build:{outDir:staticOutput},
    environments:{
      client:{build:{outDir:staticOutput,emptyOutDir:true}},
      server:{build:{outDir:workerOutput,emptyOutDir:true}},
    },
    plugins:[hubPages,react(),sites(),cloudflare({viteEnvironment:{name:'server'}})],
  };
});
