import {build} from 'esbuild';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {pathToFileURL} from 'node:url';import {entityCodecPlugin} from './lib/projectile-entity-candidate.mjs';
const out=path.resolve('artifacts/network-stream-20260921/phase31/benchmark');fs.mkdirSync(out,{recursive:true});const outfile=path.join(out,'benchmark.mjs');
const r=await build({entryPoints:['scripts/benchmark-projectile-entities.mts'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',plugins:[entityCodecPlugin],metafile:true,define:{__LAN_BUILD_ID__:'"entity-benchmark"','import.meta.env':'{"BASE_URL":"/","DEV":false,"VITE_LAN_AI_WORKERS":"false"}'},logLevel:'warning'});
if(Object.keys(r.metafile.inputs).some(p=>/(^|\/)campaign(\/|\.)/.test(p)))throw Error('Campaign import');
const inputs=Object.keys(r.metafile.inputs).filter(p=>fs.existsSync(p)).map(p=>({file:p,sha256:crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}));
fs.writeFileSync(path.join(out,'source.json'),JSON.stringify({bundleSha256:crypto.createHash('sha256').update(fs.readFileSync(outfile)).digest('hex'),inputs},null,2));
await import(pathToFileURL(outfile).href);
