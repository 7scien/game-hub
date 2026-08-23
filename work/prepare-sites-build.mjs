import {copyFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
mkdirSync(resolve(root,'dist/server'),{recursive:true});
copyFileSync(resolve(root,'server/index.js'),resolve(root,'dist/server/index.js'));
