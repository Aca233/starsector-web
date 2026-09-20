import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(root, process.argv.slice(2).find(arg => !arg.startsWith('--')) ?? 'artifacts/server-authority-20260920/runtime');
await fs.mkdir(out, {recursive:true});
const common = {bundle:true, platform:'node', format:'esm', target:'node22',
  external:['bufferutil','utf-8-validate'],
  define:{__LAN_BUILD_ID__:'"dedicated-node"','import.meta.env':'{"BASE_URL":"/","DEV":false,"VITE_LAN_AI_WORKERS":"false"}'},
  banner:{js:'import { createRequire as __nodeRequire } from "node:module"; const require = __nodeRequire(import.meta.url);'}, logLevel:'info', metafile:true};
const result = await build({...common, absWorkingDir:root, entryPoints:['server/authority-worker.mjs'], outfile:path.join(out,'authority-worker.mjs')});
if(Object.keys(result.metafile.inputs).some(name=>/(^|\/)campaign(\/|\.)/.test(name)))throw Error('Campaign leaked into authority bundle');
await fs.writeFile(path.join(out,'authority-build-inputs.json'),JSON.stringify(Object.keys(result.metafile.inputs),null,2));
for (const [entry, name] of [
  ...(!process.argv.includes('--worker-only') ? [['server/battle-server.mjs', 'battle-server.mjs']] : []),
  ...(process.argv.includes('--benchmarks') ? [['scripts/benchmark-server-rooms.mjs', 'room-benchmark.mjs'], ['scripts/benchmark-server-peer.mjs', 'benchmark-server-peer.mjs'], ['scripts/check-server-authority-service.mjs', 'service-smoke.mjs']] : []),
]) {
  const output = await build({...common,absWorkingDir:root,entryPoints:[entry],outfile:path.join(out,name)});
  if(Object.keys(output.metafile.inputs).some(file=>/(^|\/)campaign(\/|\.)/.test(file)))throw Error('Campaign leaked into '+name);
}
console.log('Dedicated runtime:', out);
