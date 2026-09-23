import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {shipPilotCodecPlugin} from './lib/ship-network-view-pilot-codec.mjs';
const outfile=path.resolve('artifacts/network-stream-20260921/phase28/check-ship-network-view.mjs');
const result=await build({entryPoints:['scripts/check-ship-network-view.mts'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',metafile:true,plugins:[shipPilotCodecPlugin],
 define:{__LAN_BUILD_ID__:'"ship-view-pilot"','import.meta.env':'{"BASE_URL":"/","DEV":false,"VITE_LAN_AI_WORKERS":"false"}'},logLevel:'warning'});
if(Object.keys(result.metafile.inputs).some(p=>/(^|\/)campaign(\/|\.)/.test(p)))throw Error('Campaign leaked into pilot');
await import(pathToFileURL(outfile).href);
