import {onePassReference} from './lib/one-pass-reference.mjs';
import {build} from 'esbuild';import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {onePassPlugin,control} from './lib/one-pass-candidate.mjs';import {scannerCodecPlugin} from './lib/scanner-codec-test.mjs';
const original=onePassReference('binary');
if(control(fs.readFileSync('src/network/BinarySnapshot.mjs','utf8'))!==original)throw Error('Frozen control changed');
const outfile=path.resolve('artifacts/network-stream-20260921/phase32/check.mjs');
await build({entryPoints:['scripts/check-one-pass-snapshot.mts'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',plugins:[onePassPlugin,scannerCodecPlugin],define:{__LAN_BUILD_ID__:'"onepass-test"','import.meta.env':'{"BASE_URL":"/","DEV":false,"VITE_LAN_AI_WORKERS":"false"}'},logLevel:'warning'});
await import(pathToFileURL(outfile).href);
