import {build} from 'esbuild';
import {componentWriteEsbuildPlugin} from './component-write-transform.mjs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const outfile=path.resolve('artifacts/guest-hz-20260920/check-native-capture.mjs');
await build({plugins:[componentWriteEsbuildPlugin()],entryPoints:['scripts/check-native-capture.mts'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',define:{__LAN_BUILD_ID__:'"native-capture-test"','import.meta.env':'{"BASE_URL":"/","DEV":false,"VITE_LAN_AI_WORKERS":"false"}'},logLevel:'warning'});
await import(pathToFileURL(outfile).href);
