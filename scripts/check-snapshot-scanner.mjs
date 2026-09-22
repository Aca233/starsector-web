import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {scannerCodecPlugin} from './lib/scanner-codec-test.mjs';
const outfile=path.resolve('artifacts/network-stream-20260921/phase30/check-snapshot-scanner.mjs');
await build({entryPoints:['scripts/check-snapshot-scanner.mts'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',plugins:[scannerCodecPlugin],logLevel:'warning'});
await import(pathToFileURL(outfile).href);
