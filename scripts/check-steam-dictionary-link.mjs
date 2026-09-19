// Isolated adverse-link A/B. No Steam client/DLL, sockets, listeners, browser or
// native traffic. The production module graph is not changed. The candidate
// codec/decoder are substituted ONLY inside an artifact bundle; its packed bit
// is not a real negotiated capability and this bundle must NEVER be deployed.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { simulateSocketLink } from './steam-sockets-link-model.mjs';
const dir = path.resolve(process.argv[2] ?? `artifacts/steam-lan-dictionary-20260919/link-${Date.now()}`);
fs.mkdirSync(dir, { recursive: true });
const write = (file, value) => fs.writeFileSync(path.join(dir, file), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const sourcePaths = ['scripts/steam-sockets-link-model.mjs', 'scripts/check-steam-dictionary-link.mjs', 'server/steam/sockets-room.mjs',
  'server/steam/sockets-session.mjs', 'server/steam/sockets-wire.mjs', 'server/steam/sockets-state-codec.mjs', 'server/steam/experimental/dictionary-state-codec.mjs',
  'server/steam/sockets-flight-budget.mjs', 'server/steam/sockets-room-pacer.mjs', 'server/steam/experimental/anchor-dictionary-state-codec.mjs', 'server/steam/anchored-snapshots.mjs', 'server/steam/snapshot-delta.mjs', 'src/network/BinarySnapshot.mjs', 'src/network/KeyDictionary.mjs'];
const hashes = () => Object.fromEntries(sourcePaths.map(p => [p, createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
const before = hashes();
const scenarios = [
  ['healthy-three', { guests: 3, durationMs: 30000 }],
  ['healthy-nine', { guests: 9, durationMs: 40000 }],
  ['collapse-nine', { guests: 9, durationMs: 50000, changeAtMs: 12000, afterBytesPerSecond: 32000 }],
  ['low-start-nine', { guests: 9, durationMs: 50000, upBytesPerSecond: 64000 }],
];
write('plan.json', { at: new Date().toISOString(), scenarios, sourceHashes: before, scope: 'Existing deterministic SDK/host-FIFO/native-flight scheduler model. No real Valve routing or native execution.',
  gatesUnchanged: 'healthy-three >=59Hz / age<200ms; healthy-nine each>=40Hz, sum>420Hz / age<250ms; collapse no disconnect / age<3000ms / FIFO<270000B; low-start >=2Hz / age<1600ms',
  candidateProtocol: 'Artifact-only packed payload substitution on both ends. Not compatible with existing packedState capability; no production negotiation claimed.', defaultEnabled: false });
const modulePath = path.resolve('server/steam/experimental/anchor-dictionary-state-codec.mjs').replaceAll('\\', '/');
const result = await build({ entryPoints: ['scripts/steam-sockets-link-model.mjs'], bundle: true, format: 'esm', platform: 'node', packages: 'external',
  write: false, metafile: true, plugins: [{ name: 'offline-dictionary-substitution', setup(b) {
    b.onResolve({ filter: /(?:^|\/)sockets-state-codec\.mjs$/ }, args => args.importer.replaceAll('\\', '/').endsWith('/experimental/anchor-dictionary-state-codec.mjs') ? undefined : ({ path: 'offline-dictionary-codec', namespace: 'candidate' }));
    b.onLoad({ filter: /.*/, namespace: 'candidate' }, () => ({ loader: 'js', resolveDir: process.cwd(), contents:
      `export { SteamAnchorDictionaryCodec as SteamSocketStateCodec, unpackAnchorDictionaryState as unpackSocketState } from ${JSON.stringify(modulePath)};` }));
  } }] });
const output = path.join(dir, 'offline-candidate-model.mjs');
fs.writeFileSync(output, result.outputFiles[0].contents, { flag: 'wx' });
write('bundle-inputs.json', { inputs: Object.keys(result.metafile.inputs), sha256: createHash('sha256').update(result.outputFiles[0].contents).digest('hex') });
assert.ok(Object.keys(result.metafile.inputs).some(p => p.endsWith('experimental/dictionary-state-codec.mjs')));
assert.ok(Object.keys(result.metafile.inputs).some(p => p.endsWith('/sockets-state-codec.mjs')), 'hybrid retains original delta codec');
const candidate = (await import(pathToFileURL(output).href)).simulateSocketLink;
function checks(name, config, r) {
  const errors = [];
  if (r.closed.length) errors.push('disconnect');
  if (r.finalWireBytes !== 0 || r.finalNativePending !== 0) errors.push('retained wire/native queue');
  for (const [i, p] of r.peers.entries()) {
    if (p.decodeFailures || !(p.steadyHz > 0) || !(p.lastStateAt > config.durationMs - 4000)) errors.push(`peer ${i}: decoder/progress`);
    if (name === 'healthy-three' && (!(p.steadyHz >= 59) || !(p.ageP95 < 200))) errors.push(`peer ${i}: healthy-three throughput/age`);
    if (name === 'healthy-nine' && (!(p.steadyHz >= 40) || !(p.ageP95 < 250))) errors.push(`peer ${i}: healthy-nine throughput/age`);
    if (name === 'collapse-nine' && (!(p.ageP95 < 3000) || !(p.maxPongAge < 8000))) errors.push(`peer ${i}: collapse age/protection`);
    if (name === 'low-start-nine' && (!(p.steadyHz >= 2) || !(p.ageP95 < 1600))) errors.push(`peer ${i}: low-start throughput/age`);
  }
  if (name === 'healthy-nine' && !(r.peers.reduce((s, p) => s + p.steadyHz, 0) > 420)) errors.push('healthy-nine aggregate <=420Hz');
  if (name === 'collapse-nine' && !(r.peakExternalHostBytes < 270000)) errors.push('collapse FIFO >=270000B');
  return { passed: !errors.length, errors };
}
const results = [];
for (const [name, config] of scenarios) for (const [variant, fn] of [['packed', simulateSocketLink], ['anchorDictionary', candidate]]) {
  const at = performance.now(), raw = fn(config), gates = checks(name, config, raw);
  const item = { name, variant, wallMs: performance.now() - at, gates, closed: raw.closed,
    hz: raw.peers.map(p => p.steadyHz), ageP95: raw.peers.map(p => p.ageP95), peakExternalHostBytes: raw.peakExternalHostBytes };
  write(`${name}-${variant}.json`, { ...item, config, raw }); results.push(item); console.log(JSON.stringify(item));
}
assert.deepEqual(hashes(), before, 'source changed during model');
const summary = { results, allGatesPassed: results.every(r => r.gates.passed), sourceHashesUnchanged: true,
  defaultEnabled: false, noNativeOrNetworkCalls: true, preservedEightSecondProtection: true };
write('summary.json', summary);
// Preserve known throughput gate failures; do not silently mark the experiment green.
if (!summary.allGatesPassed) process.exitCode = 1;
