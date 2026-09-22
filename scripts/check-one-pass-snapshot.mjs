import {onePassReference} from './lib/one-pass-reference.mjs';
import {build} from 'esbuild';import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {onePassPlugin,control} from './lib/one-pass-candidate.mjs';import {scannerCodecPlugin} from './lib/scanner-codec-test.mjs';
const original=onePassReference('binary');
// Keep the historic fixture integrity check, but compare today's SWF3 fast path
// with today's independent preflight + legacy-reader path, not a pre-SWF3 file.
if(!original.includes('function preflight(bytes)'))throw Error('Invalid frozen historical control');
const reference=control(fs.readFileSync('src/network/BinarySnapshot.mjs','utf8'));
if(reference.includes('BoundedSnapshotReader'))throw Error('Control reused the tested fast parser');
const outfile=path.resolve('artifacts/network-stream-20260921/phase32/check.mjs');
await build({entryPoints:['scripts/check-one-pass-snapshot.mts'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',plugins:[onePassPlugin,scannerCodecPlugin],define:{__LAN_BUILD_ID__:'"onepass-test"','import.meta.env':'{"BASE_URL":"/","DEV":false,"VITE_LAN_AI_WORKERS":"false"}'},logLevel:'warning'});
await import(pathToFileURL(outfile).href);
