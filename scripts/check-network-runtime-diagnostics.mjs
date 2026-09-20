// Renderer telemetry + allowlist regression tests; no desktop logger, browser or Steam SDK required.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import { normalizeNetworkRecord, NetworkDiagnosticBuffer, NETWORK_LOG_PREFIX, MAX_RECORD_BYTES } from '../desktop/network-diagnostic-record.mjs';
import { SteamReliableQueue } from '../server/steam/reliable-queue.mjs';
import { SteamSnapshotSender, SteamSnapshotReceiver } from '../server/steam/snapshot-delta.mjs';
import { LanDeltaSender } from '../server/LanDeltaTransport.mjs';

const runtimeSource = await readFile(new URL('../src/network/NetworkRuntimeDiagnostics.ts', import.meta.url), 'utf8');
const { code } = await transform(runtimeSource, { loader: 'ts', format: 'esm', target: 'es2023' });
const { NetworkRuntimeDiagnostics } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
function observerMock({ types = ['longtask'], observeError = false } = {}) {
  return class {
    static supportedEntryTypes = types;
    static instance;
    pending = []; disconnects = 0;
    constructor(callback) { this.callback = callback; this.constructor.instance = this; }
    observe(options) { this.options = options; if (observeError) throw Error('unavailable'); }
    disconnect() { this.disconnects++; this.pending = []; }
    takeRecords() { const entries = this.pending; this.pending = []; return entries; }
    deliver(entries) { this.callback({ getEntriesByType: type => { assert.equal(type, 'longtask'); return entries; },
      getEntries: () => { throw Error('Must not inspect unrelated entry types'); } }); }
  };
}
const task = duration => ({ entryType: 'longtask', duration,
  get name() { throw Error('No identity/name collection'); },
  get attribution() { throw Error('No attribution collection'); } });
const sample = extra => ({ version: 1, event: 'sample', transport: 'lan', wallTimeMs: 2000, monotonicMs: 1000,
  hudAgeMs: 0, pipelineAgeMs: 0, steamAgeMs: 0, ...extra });

test('longtask totals/max are mount-cumulative, pending records drain once, disposal blocks late callbacks', () => {
  const Observer = observerMock();
  const diagnostics = new NetworkRuntimeDiagnostics(100, {}, Observer);
  assert.deepEqual(Observer.instance.options, { entryTypes: ['longtask'] }); // Not buffered.
  assert.equal(diagnostics.sample(100, false).longTaskCount, 0);
  Observer.instance.deliver([task(75), task(120), task(NaN), task(-1), { entryType: 'resource', duration: 5000 }]);
  Observer.instance.pending.push(task(60));
  const first = diagnostics.sample(1100, true);
  assert.equal(first.longTaskSupported, true);
  assert.equal(first.longTaskCount, 3); assert.equal(first.longTaskTotalMs, 255); assert.equal(first.longTaskMaxMs, 120);
  const second = diagnostics.sample(2100, true);
  assert.equal(second.longTaskCount, 3); assert.equal(second.longTaskTotalMs, 255);
  diagnostics.dispose(); diagnostics.dispose();
  assert.equal(Observer.instance.disconnects, 1);
  Observer.instance.deliver([task(1000)]);
  assert.equal(diagnostics.sample(3100, true).longTaskCount, 3);
  const next = new NetworkRuntimeDiagnostics(3100, {}, Observer);
  assert.equal(next.sample(4100, true).longTaskCount, 0);
  next.dispose();
});

test('timer delay uses actual 1 Hz intervals without backfill; lifecycle writes do not reset the sample clock', () => {
  const diagnostics = new NetworkRuntimeDiagnostics(100, {}, observerMock({ types: [] }));
  assert.equal(diagnostics.sample(500, false).sampleIntervalMs, null);
  assert.equal(diagnostics.sample(1100, true).sampleDelayMs, 0);
  diagnostics.sample(1500, false);
  const delayed = diagnostics.sample(3600, true);
  assert.equal(delayed.sampleIntervalMs, 2500); assert.equal(delayed.sampleDelayMs, 1500);
  assert.equal(diagnostics.sample(3601, true).sampleDelayMs, 0);
  assert.equal(diagnostics.sample(100, true).sampleIntervalMs, null);
  diagnostics.dispose();
});

test('unsupported/failed observers report unknown rather than zero and clean partially initialized observers', () => {
  for (const Observer of [observerMock({ types: [] }), observerMock({ observeError: true }), class { static supportedEntryTypes = ['longtask']; constructor() { throw Error('no'); } }]) {
    const diagnostics = new NetworkRuntimeDiagnostics(0, {}, Observer);
    const row = diagnostics.sample(1000, true);
    assert.equal(row.longTaskSupported, false); assert.equal(row.longTaskCount, null);
    assert.equal(row.longTaskTotalMs, null); assert.equal(row.longTaskMaxMs, null);
    diagnostics.dispose();
    if (Observer.instance) assert.equal(Observer.instance.disconnects, 1);
  }
});

test('heap is optional, finite-only, re-read at sampling time and never serializes the performance object', () => {
  const clock = { memory: { usedJSHeapSize: 0, totalJSHeapSize: 2048, jsHeapSizeLimit: 4096 },
    get getEntries() { throw Error('No global performance scans'); } };
  const diagnostics = new NetworkRuntimeDiagnostics(0, clock, observerMock({ types: [] }));
  const row = diagnostics.sample(1000, true);
  assert.equal(row.jsHeapAvailable, true); assert.equal(row.jsHeapUsedBytes, 0);
  assert.equal(row.jsHeapTotalBytes, 2048); assert.equal(row.jsHeapLimitBytes, 4096);
  clock.memory = { usedJSHeapSize: NaN, totalJSHeapSize: -1, jsHeapSizeLimit: Infinity };
  const missing = diagnostics.sample(2000, true);
  assert.equal(missing.jsHeapAvailable, false); assert.equal(missing.jsHeapUsedBytes, null);
  Object.defineProperty(clock, 'memory', { get() { throw Error('restricted'); } });
  assert.equal(diagnostics.sample(3000, true).jsHeapAvailable, false);
  diagnostics.dispose();
});

test('actual producer queue/delta diagnostic fields survive the allowlist with zero and null intact', () => {
  const queue = new SteamReliableQueue(() => { throw Error('Do not send'); });
  const sender = new SteamSnapshotSender(), receiver = new SteamSnapshotReceiver(), lan = new LanDeltaSender();
  const row = normalizeNetworkRecord(sample({ steam: { mode: 'legacy-p2p', outbound: queue.diagnostics(),
    incomingSnapshots: receiver.diagnostics(), peers: [{ delta: sender.diagnostics() }] },
    lan: { mode: 'lan-websocket', receivers: [{ delta: lan.stats() }] } }));
  assert.deepEqual(row.steam.outbound, queue.diagnostics());
  assert.deepEqual(row.steam.incomingSnapshots, { ...receiver.diagnostics(), binaryFullStates: null, binaryDeltaStates: null, motionDeltas: null });
  assert.deepEqual(row.steam.peers[0].delta, { ...sender.diagnostics(), binaryFullStates: null, binaryDeltaStates: null, motionDeltas: null, budgetFallbacks: null });
  assert.deepEqual(row.lan.receivers[0].delta, lan.stats());
});

test('production numeric/enumerated latency fields are retained; arbitrary identity/world/entry data is not', () => {
  const secret = { ip: 'SECRET', steamId: 'SECRET', roomId: 'SECRET', world: 'SECRET', name: 'SECRET' };
  const row = normalizeNetworkRecord(sample({ runtime: { ...secret, longTaskSupported: true, longTaskCount: 2, longTaskTotalMs: 125,
    longTaskMaxMs: 75, sampleIntervalMs: 2000, sampleDelayMs: 1000, jsHeapAvailable: false },
    hud: { input: { ...secret, sentSequence: 11, acknowledgedSequence: 8, trackedPending: 3, oldestTrackedPendingMs: 77, pendingActions: 0 },
      authority: { ageMs: 0, simulationMs: 8, captureMs: 2, encodeMs: 1, lastStepMs: 9, maxStepMs: 15, realtimeRatio: .9, combatRate: .8 } },
    lan: { receivers: [{ credits: { idleCapacity: 5, capacity: 3, deliveryHz: 6.125, peakCount: 3, peakBytes: 12000, sent: 40, acked: 38, rejected: 2 }, delta: { motionDeltas: 31 }, flow: { lastSeq: 99 } }] },
    steam: { sharedSnapshots: { estimatedQueueBytes: 100 }, peers: [{ ...secret, byteLimit: 98304, preparation: { ...secret, attempts: 60, discarded: 40, totalMs: 500, discardedMs: 350, maxMs: 15 }, queueAckMs: 110, probing: 'drain',
      lastSnapshot: { ...secret, format: 'delta', rawBytes: 300000, wireBytes: 10000 }, delta: { savedBytes: 99, baselineBytes: 123 } }] } }));
  assert.equal(row.hud.authority.simulationMs, 8); assert.equal(row.hud.authority.encodeMs, 1);
  assert.equal(row.hud.authority.realtimeRatio, .9); assert.equal(row.hud.authority.combatRate, .8);
  assert.equal(row.hud.input.trackedPending, 3); assert.equal(row.hud.input.pendingActions, 0);
  assert.equal(row.hud.input.acknowledgedSequence, 8); assert.equal(row.hud.input.oldestTrackedPendingMs, 77);
  assert.equal(row.steam.peers[0].lastSnapshot.format, 'delta'); assert.equal(row.steam.peers[0].queueAckMs, 110);
  assert.equal(row.steam.peers[0].byteLimit, 98304); assert.deepEqual(row.steam.peers[0].preparation, { attempts: 60, discarded: 40, totalMs: 500, discardedMs: 350, maxMs: 15 });
  assert.equal(row.steam.peers[0].probing, 'drain'); assert.equal(row.steam.sharedSnapshots.estimatedQueueBytes, 100);
  assert.equal(row.lan.receivers[0].credits.idleCapacity, 5); assert.equal(row.lan.receivers[0].credits.capacity, 3); assert.equal(row.lan.receivers[0].credits.deliveryHz, 6.125);
  assert.equal(row.lan.receivers[0].delta.motionDeltas, 31); assert.equal(row.lan.receivers[0].credits.acked, 38); assert.equal(row.lan.receivers[0].flow.lastSeq, 99);
  assert.equal(row.runtime.sampleDelayMs, 1000); assert.equal(row.runtime.longTaskTotalMs, 125);
  assert.ok(!JSON.stringify(row).includes('SECRET'));
  for (const format of ['full', 'delta', 'legacy-full', 'binary-full', 'binary-delta', 'SECRET']) {
    const r = normalizeNetworkRecord(sample({ steam: { peers: [{ probing: 'SECRET', lastSnapshot: { format } }] } }));
    assert.equal(r.steam.peers[0].lastSnapshot.format, format === 'SECRET' ? null : format);
    assert.equal(r.steam.peers[0].probing, null);
  }
});

test('runtime is independent of stale HUD/heartbeat; missing and invalid values stay unknown', () => {
  const r = normalizeNetworkRecord(sample({ hudAgeMs: 9999, pipelineAgeMs: 9999, steamAgeMs: 9999,
    hud: { input: { trackedPending: 10 } }, steam: { outbound: { queuedBytes: 1000 } }, lan: {}, pipeline: {},
    runtime: { longTaskCount: -1, longTaskTotalMs: Infinity, jsHeapUsedBytes: 'SECRET', sampleDelayMs: 500 } }));
  assert.equal(r.hud, null); assert.equal(r.steam, null); assert.equal(r.lan, null); assert.equal(r.pipeline, null);
  assert.equal(r.runtime.sampleDelayMs, 500); assert.equal(r.runtime.longTaskCount, null);
  assert.equal(r.runtime.longTaskTotalMs, null); assert.equal(r.runtime.jsHeapUsedBytes, null);
  assert.equal(normalizeNetworkRecord(sample()).runtime, null);
});

// Materialize all allowlisted fields from a projected template, without a second
// hand-maintained list of schema keys. These are size fixtures, not measurements.
function dense(transport, value = 123456.789) {
  const template = normalizeNetworkRecord(sample({ transport, runtime: {},
    hud: { input: {}, authority: { ageMs: 0, flow: { rates: {} } }, localFlow: { rates: {} }, decodeQueue: {} },
    pipeline: { authority: { knownAgeMs: 0, stale: false, performance: { flow: { rates: {} } } }, ingress: { rates: {} },
      receivers: Array.from({ length: 12 }, () => ({ stages: { rates: {} } })) },
    ...(transport === 'lan' ? { lan: { authority: {}, receivers: Array.from({ length: 12 }, () => ({ credits: {}, network: {}, flow: {}, delta: {} })) } }
      : { steam: { receipts: {}, polling: {}, sharedSnapshots: {}, outbound: {}, nativeHostSession: {}, incomingSnapshots: {},
        peers: Array.from({ length: 12 }, () => ({ consumption: {}, lastSnapshot: {}, delta: {}, nativeSession: {} })) } }) }));
  const fill = object => Object.fromEntries(Object.entries(object).map(([key, v]) => [key,
    v === null ? value : Array.isArray(v) ? v.map(fill) : typeof v === 'object' ? fill(v) : v]));
  const r = fill(template);
  r.hudAgeMs = r.pipelineAgeMs = r.steamAgeMs = 0;
  r.hud.authority.ageMs = 0; r.pipeline.authority.knownAgeMs = 0;
  return r;
}

test('nine fully populated peers fit 16384-byte rows; larger numeric extremes are rejected rather than written', () => {
  for (const transport of ['lan', 'steam']) {
    const lines = [], buffer = new NetworkDiagnosticBuffer({ sink: line => lines.push(line) });
    const r = dense(transport);
    assert.equal(buffer.write(r), true, transport + ' full schema must fit');
    const row = JSON.parse(lines[0].slice(NETWORK_LOG_PREFIX.length));
    assert.equal(row.pipeline.receivers.length, 9);
    assert.equal((transport === 'lan' ? row.lan.receivers : row.steam.peers).length, 9);
    assert.ok(Buffer.byteLength(lines[0]) + 1 <= MAX_RECORD_BYTES);
    const extreme = dense(transport, Number.MAX_SAFE_INTEGER);
    extreme.monotonicMs = 2000;
    const accepted = buffer.write(extreme);
    if (!accepted) assert.equal(buffer.dropped, 1);
    for (const { line, bytes } of buffer.rows) {
      assert.equal(bytes, Buffer.byteLength(line) + 1); assert.ok(bytes <= MAX_RECORD_BYTES);
    }
  }
});

test('battle integration keeps the 1Hz timer, cleans observer, and distinguishes desktop session/browser ring copy', async () => {
  const source = await readFile(new URL('../src/network/LanBattle.tsx', import.meta.url), 'utf8');
  assert.match(source, /setInterval\(\(\) => write\('sample'\), 1000\)/);
  assert.match(source, /runtime: runtime\.sample\(now, event === 'sample'\)/);
  assert.match(source, /clearInterval\(timer\).*finally \{ runtime\.dispose\(\); \}/);
  assert.match(source, /桌面端从本次启动到退出保存同一日志/);
  assert.match(source, /普通浏览器仅保留最近约 10 分钟/);
  assert.doesNotMatch(runtimeSource, /setInterval\(|setTimeout\(|performance\.getEntries|buffered: true/);
});


test('local bridge byte/format diagnostics survive without exposing payload or identities',()=>{
 const receipts={rendererBinaryWrites:12,rendererJsonWrites:2,rendererPayloadBytes:20000,rendererCanonicalBytes:47000,payload:'private state',identity:'private identity'};
 const result=normalizeNetworkRecord(sample({transport:'steam',steam:{receipts}}));
 for(const key of ['rendererBinaryWrites','rendererJsonWrites','rendererPayloadBytes','rendererCanonicalBytes'])assert.equal(result.steam.receipts[key],receipts[key]);
 assert.equal(result.steam.receipts.payload,undefined);assert.equal(result.steam.receipts.identity,undefined);
});


test('worker diagnostics preserve bounded timing/counts but no world or identity', () => {
  const snapshotWorker = { offered: 60, replaced: 2, prepared: 57, accepted: 55, stale: 1, faults: 0,
    workMs: 430, maxWorkMs: 12, queueMs: 30, maxQueueMs: 4, maxRetained: 2, active: true, pending: false,
    ready: true, failed: false, state: { private: 'world' }, remote: 'identity' };
  const result = normalizeNetworkRecord(sample({ transport: 'steam', steam: { snapshotWorker } }));
  for (const [key, value] of Object.entries(snapshotWorker)) {
    if (['state', 'remote'].includes(key)) assert.equal(result.steam.snapshotWorker[key], undefined);
    else assert.equal(result.steam.snapshotWorker[key], value);
  }
});
