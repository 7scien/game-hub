import {copyFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const workerOutput=resolve(root,'.wrangler','build','server');
mkdirSync(workerOutput,{recursive:true});
copyFileSync(resolve(root,'server/index.js'),resolve(workerOutput,'index.js'));
