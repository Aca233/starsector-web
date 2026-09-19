// Offline model only: no listener, native SDK, login, invite, or Steam process.
// Packed bit substitution on both ends is NOT real protocol negotiation.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildSelectiveModel } from './lib/steam-selective-model.mjs';
import { decodeBinaryState } from '../src/network/BinarySnapshot.mjs';
const dir = path.resolve(process.argv[2] ?? `artifacts/steam-selective-state-20260919/link-${Date.now()}`);
fs.mkdirSync(dir, { recursive: true });
const write = (name, value) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const protectedPaths = [
  "src/network/protocol.json",
  "src/network/BinarySnapshot.mjs",
  "server/steam/anchored-snapshots.mjs",
  "server/steam/snapshot-delta.mjs",
  "server/steam/sockets-wire.mjs",
  "server/steam/sockets-state-codec.mjs",
  "src/network/protocol.ts",
  "server/steam/sockets-flight-budget.mjs",
  "scripts/steam-sockets-link-model.mjs",
  "server/steam/sockets-room.mjs",
  "server/steam/sockets-room-pacer.mjs",
  "src/network/host.worker.ts",
  "src/network/KeyDictionary.mjs",
  "server/steam/sockets-session.mjs",
  "server/steam/packet-codec.mjs",
  "package.json",
  "server/steam/gateway.mjs"
];
const paths = [...protectedPaths, 'scripts/check-steam-selective-link.mjs', 'scripts/lib/steam-selective-model.mjs', 'server/steam/experimental/selective-state-codec.mjs', 'server/steam/experimental/selective-anchored-sender.mjs'];
const hash = b => createHash('sha256').update(b).digest('hex');
const hashes = () => Object.fromEntries(paths.map(p => [p, hash(fs.readFileSync(p))]));
const before = hashes(), reportOnly = process.argv.includes('--report-only');
// Report-only reads completed scenario artifacts, never treats partial runs as success.
// Validate the original runner snapshot and exact bundles before reusing evidence.
if (reportOnly) {
  const plan = JSON.parse(fs.readFileSync(path.join(dir, 'plan.json'), 'utf8'));
  for (const [p, expected] of Object.entries(plan.sourceHashes)) {
    const input = p === 'scripts/check-steam-selective-link.mjs' ? path.join(dir, 'check-steam-selective-link.mjs.run-source') : p;
    assert.equal(hash(fs.readFileSync(input)), expected, 'simulation provenance changed: ' + p);
  }
  for (const variant of ['packed', 'selective']) {
    const info = JSON.parse(fs.readFileSync(path.join(dir, variant + '-bundle.json'), 'utf8'));
    assert.equal(hash(fs.readFileSync(path.join(dir, 'offline-' + variant + '-model.mjs'))), info.sha256);
  }
} else fs.copyFileSync('scripts/check-steam-selective-link.mjs', path.join(dir, 'check-steam-selective-link.mjs.run-source'), fs.constants.COPYFILE_EXCL);
const scenarios = [
  ['healthy-three', { guests: 3, durationMs: 30000 }],
  ['healthy-nine', { guests: 9, durationMs: 40000 }],
  ['collapse-nine', { guests: 9, durationMs: 50000, changeAtMs: 12000, afterBytesPerSecond: 32000 }],
  ['low-start-nine', { guests: 9, durationMs: 50000, upBytesPerSecond: 64000 }],
  ['recorded-healthy-three', { guests: 3, durationMs: 25000 }],
  ['recorded-collapse-three', { guests: 3, durationMs: 35000, changeAtMs: 12000, afterBytesPerSecond: 32000, lossEvery: 37, reorderEvery: 23 }],
];
const source = 'artifacts/lan-worker-latency/snapshot-32-0.bin', bytes = fs.readFileSync(source), recorded = decodeBinaryState(bytes);
const replayState = (seq, now) => ({ ...recorded, matchId: 'shared-battle', seq, frame: { ...recorded.frame, tick: seq, marker: 'exact-' + seq, producedAt: now } });
if (!reportOnly) write('plan.json', { sourceHashes: before, scenarios, defaultEnabled: false, gatesUnchanged: true,
  scope: 'Original room/session/wire/pacer, modeled native lanes/shared FIFO, identical artifact instrumentation on both variants. Closed test uses packed bit for SKD1, not compatible negotiation.',
  recordedFixture: { source, sha256: hash(bytes), ships: recorded.frame.ships.length, canonicalBytes: Buffer.byteLength(JSON.stringify(recorded)), preservedAllFields: true, note: 'Complete recorded tree + seq/matchId/clock metadata replay, NOT live battle simulation. All delivered replay trees checked in full.' } });
const modules = reportOnly ? { packed: null, selective: null } : { packed: await buildSelectiveModel(dir, false), selective: await buildSelectiveModel(dir, true) };
function checks(name, config, r) {
  const errors = [];
  if (r.closed.length) errors.push('disconnect');
  if (r.finalWireBytes !== 0 || r.finalNativePending !== 0) errors.push('retained wire/native queue');
  const collapse = name.includes('collapse'), healthyThree = name.endsWith('healthy-three');
  for (const p of r.peers) {
    if (p.decodeFailures || !(p.steadyHz > 0) || !(p.lastStateAt > config.durationMs - 4000)) errors.push(`peer ${p.index}: decoder/progress`);
    if (healthyThree && (!(p.steadyHz >= 59) || !(p.ageP95 < 200))) errors.push(`peer ${p.index}: healthy-three throughput/age`);
    if (name === 'healthy-nine' && (!(p.steadyHz >= 40) || !(p.ageP95 < 250))) errors.push(`peer ${p.index}: healthy-nine throughput/age`);
    if (collapse && (!(p.ageP95 < 3000) || !(p.maxPongAge < 8000))) errors.push(`peer ${p.index}: collapse age/protection`);
    if (name === 'low-start-nine' && (!(p.steadyHz >= 2) || !(p.ageP95 < 1600))) errors.push(`peer ${p.index}: low-start throughput/age`);
  }
  if (name === 'healthy-nine' && !(r.peers.reduce((s, p) => s + p.steadyHz, 0) > 420)) errors.push('healthy-nine aggregate <=420Hz');
  if (collapse && !(r.peakExternalHostBytes < 270000)) errors.push('collapse FIFO >=270000B');
  return { passed: !errors.length, errors };
}
const results = [], rawResults = new Map();
for (const [name, config] of scenarios) for (const [variant, module] of Object.entries(modules)) {
  const isReplay = name.startsWith('recorded-'); let exactReplayDeliveries = 0;
  if (reportOnly) {
    const item = JSON.parse(fs.readFileSync(path.join(dir, name + '-' + variant + '.json'), 'utf8'));
    assert.equal(item.name, name); assert.equal(item.variant, variant); assert.deepEqual(item.config, config);
    assert.deepEqual(item.gates, checks(name, config, item.raw));
    assert.deepEqual(item.hz, item.raw.peers.map(p => p.steadyHz));
    assert.deepEqual(item.ageP95, item.raw.peers.map(p => p.ageP95));
    assert.deepEqual(item.formatStats, item.raw.formatStats);
    if (isReplay) {
      assert.ok(item.exactReplayDeliveries > 0);
      assert.equal(item.exactReplayDeliveries, item.raw.peers.reduce((s, p) => s + p.frames, 0));
      if (variant === 'selective') assert.ok(item.decodes.dictionaryDecoded > 0);
    }
    rawResults.set(name + '-' + variant, item.raw);
    const { raw: _raw, config: _config, ...summaryItem } = item;
    results.push(summaryItem); continue;
  }
  const extra = isReplay ? { stateFactory: (seq, now) => JSON.stringify(replayState(seq, now)), stateVerify: m => { assert.equal(JSON.stringify(m), JSON.stringify(replayState(m.seq, m.frame.producedAt))); exactReplayDeliveries++; } } : {};
  const decodesBefore = module.readSelectiveDecodes?.() ?? { dictionaryDecoded: 0, packedDecoded: 0 }, started = performance.now();
  const raw = module.simulateSocketLink({ ...config, ...extra });
  const decodesAfter = module.readSelectiveDecodes?.() ?? decodesBefore;
  const decodes = Object.fromEntries(Object.keys(decodesBefore).map(k => [k, decodesAfter[k] - decodesBefore[k]]));
  if (isReplay && variant === 'selective') assert.ok(decodes.dictionaryDecoded > 0, 'real dictionary path must be exercised');
  if (isReplay) assert.ok(exactReplayDeliveries > 0);
  const item = { name, variant, wallMs: performance.now() - started, gates: checks(name, config, raw), closed: raw.closed, decodes, exactReplayDeliveries,
    formatStats: raw.formatStats, hz: raw.peers.map(p => p.steadyHz), ageP95: raw.peers.map(p => p.ageP95), peakExternalHostBytes: raw.peakExternalHostBytes };
  write(`${name}-${variant}.json`, { ...item, config, raw }); rawResults.set(`${name}-${variant}`, raw); results.push(item); console.log(JSON.stringify(item));
}
// Independent deterministic baseline comparison when no SKD1 reaches a decoder.
// A prepared selection can be replaced before admission; selected != sent/decoded.
const unchangedModels = [];
for (const [name] of scenarios.filter(([n]) => !n.startsWith('recorded-'))) {
  const a = rawResults.get(`${name}-packed`), b = rawResults.get(`${name}-selective`);
  assert.equal(results.find(r => r.name === name && r.variant === 'selective').decodes.dictionaryDecoded, 0, 'standard fixture must not masquerade as a real dictionary test');
  const { formatStats: _a, ...plainA } = a, { formatStats: _b, ...plainB } = b;
  assert.deepEqual(plainB, plainA, 'no decoded dictionary: observed scheduler/model must remain identical'); unchangedModels.push(name);
}
assert.deepEqual(hashes(), before, 'source changed during model');
const summary = { results, unchangedModels, allGatesPassed: results.every(r => r.gates.passed), runtimeSourcesVerified: true, reportOnly, defaultEnabled: false, noNativeOrNetworkCalls: true, preservedEightSecondProtection: true };
if (reportOnly && fs.existsSync(path.join(dir, 'summary.json'))) {
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'summary.json'), 'utf8')), summary, 'existing summary does not match validated artifacts');
} else write('summary.json', summary);
console.log(JSON.stringify({ reportValidated: true, scenarios: results.length, passed: results.filter(r => r.gates.passed).length, failed: results.filter(r => !r.gates.passed).map(r => r.name + ':' + r.variant), defaultEnabled: false }));
if (!summary.allGatesPassed) process.exitCode = 1; // Preserve known failures; never auto-promote.
