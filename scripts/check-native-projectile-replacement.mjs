import {build} from 'esbuild';import {pathToFileURL} from 'node:url';import path from 'node:path';import {nativeProjectileCodecPlugin} from './lib/native-projectile-codec-test.mjs';
const outfile=path.resolve('artifacts/network-stream-20260921/phase30/check-native-projectile-replacement.mjs');
await build({entryPoints:['scripts/check-native-projectile-replacement.mts'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',plugins:[nativeProjectileCodecPlugin],define:{__LAN_BUILD_ID__:'"native-projectile-test"','import.meta.env':'{"BASE_URL":"/","DEV":false,"VITE_LAN_AI_WORKERS":"false"}'},logLevel:'warning'});
await import(pathToFileURL(outfile).href);
