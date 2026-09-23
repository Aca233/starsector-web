import {build} from 'esbuild';
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {pathToFileURL} from 'node:url';
import {entityCodecPlugin} from './lib/projectile-entity-candidate.mjs';
const out=path.resolve('artifacts/network-stream-20260921/phase31');fs.mkdirSync(out,{recursive:true});const outfile=path.join(out,'check.mjs');
const result=await build({entryPoints:['scripts/check-projectile-entities.mts'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',plugins:[entityCodecPlugin],metafile:true,define:{__LAN_BUILD_ID__:'"entity-test"','import.meta.env':'{"BASE_URL":"/","DEV":false,"VITE_LAN_AI_WORKERS":"false"}'},logLevel:'warning'});
if(Object.keys(result.metafile.inputs).some(p=>/(^|\/)campaign(\/|\.)/.test(p)))throw Error('Campaign import');
fs.writeFileSync(path.join(out,'check-source.json'),JSON.stringify({bundleSha256:crypto.createHash('sha256').update(fs.readFileSync(outfile)).digest('hex'),inputs:result.metafile.inputs},null,2));
await import(pathToFileURL(outfile).href);
