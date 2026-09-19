import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const outfile=path.resolve('artifacts/cosmetic-sync-20260919/check-explosion-puff-recipes.mjs');
await build({entryPoints:['scripts/check-explosion-puff-recipes.mts'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',define:{__LAN_BUILD_ID__:'"cosmetic-test"','import.meta.env':'{"BASE_URL":"/","DEV":false}'},logLevel:'warning'});
await import(pathToFileURL(outfile).href);
