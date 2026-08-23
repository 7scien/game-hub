import {defineConfig} from 'vite';
import {sites} from '@openai/sites-vite-plugin';
import {cloudflare} from '@cloudflare/vite-plugin';

export default defineConfig({
  plugins:[
    sites(),
    cloudflare({viteEnvironment:{name:'server'}}),
  ],
});
