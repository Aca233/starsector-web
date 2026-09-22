// Fingerprint the actual Node-side battle dependency graph, not unrelated server
// directories. This also covers src/* modules used directly by the relay, which
// the frozen browser graph does not freeze in the Node process.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {build} from 'esbuild';
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
export async function battleServerInputs(harness='scripts/check-normal-multiplayer-browser.mjs') {
 const entryPoints=['server/lan-server.mjs','server/desktop-lan-bridge.mjs','desktop/network-diagnostic-record.mjs',
  'scripts/lib/multiplayer-texture-probe.mjs','scripts/lib/publication-probe.mjs','scripts/lib/same-tick-skip-fixture.mjs','scripts/lib/multiplayer-measurement.mjs','scripts/lib/steady-multiplayer-fixture.mjs','scripts/lib/host-load-probe.mjs','scripts/lib/host-worker-profiler.mjs','scripts/lib/frozen-vite-sources.mjs'];
 const r=await build({entryPoints,outdir:'artifacts/battle-input-fingerprint',write:false,bundle:true,platform:'node',format:'esm',packages:'external',metafile:true,logLevel:'silent'});
 const inputs=Object.keys(r.metafile.inputs);if(inputs.some(file=>/(^|[\\/])campaign([\\/.]|$)/i.test(file)))throw Error('Campaign dependency in battle-only comparison');
 const files=[...new Set([...inputs,harness,'scripts/benchmark-receiver-fields-browser.mjs','scripts/compare-steady-multiplayer.mjs','scripts/lib/battle-server-inputs.mjs','package.json','package-lock.json'])].sort();
 return files.map(file=>{if(!path.resolve(file).startsWith(process.cwd()+path.sep))throw Error('Input outside repository');return {file,sha256:digest(file)};});
}
export function changedBattleInputs(inputs) {return inputs.filter(r=>!fs.existsSync(r.file)||digest(r.file)!==r.sha256).map(r=>r.file);}
