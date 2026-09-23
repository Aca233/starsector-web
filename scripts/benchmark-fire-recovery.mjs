import fs from 'node:fs';import path from 'node:path';import {build} from 'esbuild';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
const base='artifacts/network-stream-20260922/phase37',frozen=JSON.parse(fs.readFileSync(base+'/recheck2/after.json'));
const sources=new Map(frozen.files.map(r=>{if(createHash('sha256').update(r.code).digest('hex')!==r.sha256)throw Error('Checksum '+r.file);return[path.resolve(r.file).toLowerCase(),r.code];}));
const outfile=path.resolve(base+'/receive-cpu.mjs');
await build({entryPoints:['scripts/benchmark-fire-recovery.mts'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',define:{__LAN_BUILD_ID__:'"fire-recovery-cpu"','import.meta.env':'{"BASE_URL":"/","DEV":false,"VITE_LAN_AI_WORKERS":"false"}'},plugins:[{name:'frozen-fire-recovery',setup(b){
 b.onResolve({filter:/^fire-recovery-control$/},()=>({path:'control',namespace:'fire-recovery'}));b.onLoad({filter:/.*/,namespace:'fire-recovery'},()=>({contents:fs.readFileSync(base+'/before.ts','utf8'),loader:'ts',resolveDir:path.resolve('src/network')}));
 b.onLoad({filter:/\.[cm]?[jt]sx?$/},a=>{const code=sources.get(a.path.toLowerCase());if(code!==undefined)return{contents:code,loader:a.path.endsWith('tsx')?'tsx':/\.m?ts$/.test(a.path)?'ts':'js',resolveDir:path.dirname(a.path)};});
}}],logLevel:'warning'});await import(pathToFileURL(outfile).href);
