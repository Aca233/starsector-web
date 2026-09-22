import {build} from 'esbuild';import path from 'node:path';import {pathToFileURL} from 'node:url';import {receiverFieldsPlugin} from './lib/receiver-fields-comparison.mjs';
const outfile=path.resolve('artifacts/network-stream-20260922/phase35/check.mjs');
await build({entryPoints:['scripts/check-receiver-fields.mts'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',plugins:[receiverFieldsPlugin()],define:{__LAN_BUILD_ID__:'"native-fields-test"','import.meta.env':'{"BASE_URL":"/","DEV":false,"VITE_LAN_AI_WORKERS":"false"}'},logLevel:'warning'});
await import(pathToFileURL(outfile).href);
