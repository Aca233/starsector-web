import {build} from 'esbuild';import {pathToFileURL} from 'node:url';import path from 'node:path';import fs from 'node:fs';import crypto from 'node:crypto';
import {shipPilotCodecPlugin} from './lib/ship-network-view-pilot-codec.mjs';
const outfile=path.resolve(process.env.SHIP_VIEW_OUT??'artifacts/network-stream-20260921/phase28/benchmark','benchmark-source.mjs');
const result=await build({entryPoints:['scripts/benchmark-ship-network-view.mts'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',metafile:true,plugins:[shipPilotCodecPlugin],define:{__LAN_BUILD_ID__:'"ship-view-pilot"','import.meta.env':'{"BASE_URL":"/","DEV":false,"VITE_LAN_AI_WORKERS":"false"}'},logLevel:'warning'});
if(Object.keys(result.metafile.inputs).some(p=>/(^|\/)campaign(\/|\.)/.test(p)))throw Error('Campaign leaked into pilot');
fs.writeFileSync(outfile+'.inputs.json',JSON.stringify({at:new Date().toISOString(),sha256:crypto.createHash('sha256').update(fs.readFileSync(outfile)).digest('hex'),inputs:Object.keys(result.metafile.inputs).filter(file=>fs.existsSync(file)).map(file=>({file,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}))},null,2));
await import(pathToFileURL(outfile).href);
