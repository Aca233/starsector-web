import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const outfile=path.resolve('artifacts/network-stream-20260921/phase16/check-local-fire-prediction.mjs');
const result=await build({entryPoints:['scripts/check-local-fire-prediction.mts'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',metafile:true,
  define:{__LAN_BUILD_ID__:'"local-fire-test"','import.meta.env':'{"BASE_URL":"/","DEV":false,"VITE_LAN_AI_WORKERS":"false"}'},logLevel:'warning'});
if(Object.keys(result.metafile.inputs).some(p=>/(^|\/)campaign(\/|\.)/.test(p)))throw Error('Campaign leaked into prediction test');
await import(pathToFileURL(outfile).href);
