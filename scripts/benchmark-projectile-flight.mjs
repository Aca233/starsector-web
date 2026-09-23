import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const outfile=path.resolve('artifacts/network-stream-20260921/phase29/benchmark-projectile-flight.mjs');
await build({entryPoints:['scripts/benchmark-projectile-flight.mts'],outfile,bundle:true,platform:'node',format:'esm',logLevel:'warning'});
await import(pathToFileURL(outfile).href);
