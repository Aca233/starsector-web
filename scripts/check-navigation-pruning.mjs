import {build} from 'esbuild';import path from 'node:path';import {pathToFileURL} from 'node:url';import {navigationPlugin} from './lib/navigation-comparison.mjs';
const outfile=path.resolve('artifacts/network-stream-20260922/phase34/check-navigation.mjs');
await build({entryPoints:['scripts/check-navigation-pruning.mts'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',plugins:[navigationPlugin({instrumentation:true})],define:{__LAN_BUILD_ID__:'"navigation-check"','import.meta.env':'{"BASE_URL":"/","DEV":false,"VITE_LAN_AI_WORKERS":"false"}'},logLevel:'warning'});
await import(pathToFileURL(outfile).href);
