import {build} from 'esbuild';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {pathToFileURL} from 'node:url';import {nativeFieldsPlugin} from './lib/native-fields-comparison.mjs';
const out=path.resolve(process.env.NATIVE_FIELDS_OUT??'artifacts/network-stream-20260922/phase33/benchmark');fs.mkdirSync(out,{recursive:true});const outfile=path.join(out,'benchmark.mjs');
const r=await build({entryPoints:['scripts/benchmark-native-fields.mts'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',plugins:[nativeFieldsPlugin],metafile:true,define:{__LAN_BUILD_ID__:'"native-fields-benchmark"','import.meta.env':'{"BASE_URL":"/","DEV":false,"VITE_LAN_AI_WORKERS":"false"}'},logLevel:'warning'});
if(Object.keys(r.metafile.inputs).some(p=>/(^|\/)campaign(\/|\.)/.test(p)))throw Error('Campaign import');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');const inputs=Object.keys(r.metafile.inputs).filter(p=>fs.existsSync(p)).map(p=>({file:p,sha256:sha(p)}));
fs.writeFileSync(path.join(out,'source.json'),JSON.stringify({bundleSha256:sha(outfile),candidateSha256:sha(process.env.NATIVE_FIELDS_SOURCE??'src/network/CombatSnapshot.ts'),inputs},null,2));
await import(pathToFileURL(outfile).href);
