import {build} from 'esbuild';import path from 'node:path';import {pathToFileURL} from 'node:url';
const outfile=path.resolve('artifacts/cosmetic-sync-20260919/bench-cosmetic-sync.mjs');
await build({entryPoints:['scripts/bench-cosmetic-sync.mts'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',define:{__LAN_BUILD_ID__:'"cosmetic-bench"','import.meta.env':'{"BASE_URL":"/","DEV":false}'},logLevel:'warning'});
await import(pathToFileURL(outfile).href);
