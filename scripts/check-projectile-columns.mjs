import { build } from 'esbuild'; import { pathToFileURL } from 'node:url'; import path from 'node:path';
const outfile=path.resolve('artifacts/projectile-columns-20260919/check-projectile-columns.mjs');
await build({entryPoints:['scripts/check-projectile-columns.mts'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',define:{__LAN_BUILD_ID__:'"columns-test"','import.meta.env':'{"BASE_URL":"/","DEV":false}'},logLevel:'warning'});
await import(pathToFileURL(outfile).href);
