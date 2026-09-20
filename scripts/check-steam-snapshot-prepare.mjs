import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { Worker } from 'node:worker_threads';
import { SnapshotPrepareState, SNAPSHOT_PREPARE_LIMITS } from '../server/steam/snapshot-prepare-state.mjs';
import { SnapshotPrepareBroker } from '../server/steam/snapshot-prepare-broker.mjs';
import { SNAPSHOT_PREPARE_WORKER_URL, SNAPSHOT_PREPARE_WORKER_KIND } from '../server/steam/snapshot-prepare-worker.mjs';
import { SteamGateway } from '../server/steam/gateway.mjs';
import { SteamPacketCodec } from '../server/steam/packet-codec.mjs';
import { SteamBinarySnapshotReceiver } from '../server/steam/binary-snapshot.mjs';
import { SteamSnapshotReceiver } from '../server/steam/snapshot-delta.mjs';
import { encodeBinaryState, encodeProjectedBinaryFrame } from '../src/network/BinarySnapshot.mjs';
import protocol from '../src/network/protocol.json' with { type: 'json' };
import { motionFrame } from './lib/motion-reference-fixture.mjs';
const state = seq => ({ type: 'state', matchId: 'worker-match', seq, frame: { ...motionFrame(), tick: seq } });
const snapshot = seq => { const s = state(seq); return { state: s, bytes: encodeBinaryState(s.matchId, seq, encodeProjectedBinaryFrame(s.frame)) }; };
const input = (seq, binary = true) => binary ? { kind: 'binary', data: snapshot(seq).bytes } : { kind: 'json', data: JSON.stringify(state(seq)) };
const peers = [{ key: 1, epoch: 0, binary: true }, { key: 2, epoch: 0, binary: false }];
const prepare = (kernel, id, options = {}) => kernel.handle({ op: 'prepare', id, now: 1000 + id * 16, peers, input: input(id), ...options });
const commit = (kernel, id, accepted) => kernel.handle({ op: 'commit', id, accepted });
function restore(result, receiver) {
  const codec = new SteamPacketCodec({ binaryStates: true });
  const f = codec.frame('a'.repeat(32), 'data', { ...result.prepared, payload: Buffer.from(result.prepared.payload) });
  let incoming;
  for (const packet of f.packets) incoming = codec.receive('remote', packet) ?? incoming;
  const restored = receiver.receive(incoming.data); assert.equal(restored.needsFull, false); return restored.data;
}
async function until(predicate) {
  const deadline = performance.now() + 5000;
  while (!predicate()) { if (performance.now() > deadline) throw Error('Worker test timeout'); await new Promise(r => setTimeout(r, 5)); }
}

test('preparation is not commit; only exact accepted peer subset advances', () => {
  const k = new SnapshotPrepareState(); const first = prepare(k, 1);
  assert.ok(k.stats().every(s => s.lastSeq === null)); assert.equal(k.pending.choices.size, 2);
  assert.deepEqual(restore(first.response.results[0], new SteamBinarySnapshotReceiver()), state(1));
  assert.deepEqual(restore(first.response.results[1], new SteamSnapshotReceiver()), state(1));
  commit(k, 1, [1]); assert.deepEqual(k.stats().map(s => s.lastSeq), [1, null]);
  prepare(k, 2); commit(k, 2, []); assert.deepEqual(k.stats().map(s => s.lastSeq), [1, null]);
  assert.equal(commit(k, 2, [1]).response.op, 'ignored');
});
test('legacy-first mixed order never reuses previous binary canonical text', () => {
  const k = new SnapshotPrepareState(), binary = new SteamBinarySnapshotReceiver(), legacy = new SteamSnapshotReceiver();
  for (let seq = 1; seq <= 6; seq++) {
    const r = prepare(k, seq, { peers: seq % 2 ? peers : [...peers].reverse() });
    for (const result of r.response.results) assert.deepEqual(restore(result, result.key === 1 ? binary : legacy), state(seq));
    commit(k, seq, [1, 2]);
  }
  assert.deepEqual(k.stats().map(s => s.lastSeq), [6, 6]);
});
test('stale or forged decisions do not release a transaction or advance a base', () => {
  const k = new SnapshotPrepareState(); prepare(k, 1);
  assert.throws(() => prepare(k, 2)); assert.throws(() => commit(k, 1, [99])); assert.throws(() => commit(k, 1, [1, 1]));
  assert.equal(commit(k, 99, [1]).response.op, 'ignored'); assert.equal(k.pending.id, 1);
  assert.ok(k.stats().every(s => s.lastSeq === null)); commit(k, 1, []);
});
test('reset and retire invalidate late commit; new epoch starts full', () => {
  const k = new SnapshotPrepareState(); prepare(k, 1);
  k.handle({ op: 'reset', key: 1, epoch: 1 }); k.handle({ op: 'retire', key: 2 }); commit(k, 1, [1, 2]);
  assert.deepEqual(k.stats().map(s => s.lastSeq), [null]);
  const next = prepare(k, 2, { peers: [{ ...peers[0], epoch: 1 }, peers[1]] });
  for (const r of next.response.results) assert.deepEqual(restore(r, r.key === 1 ? new SteamBinarySnapshotReceiver() : new SteamSnapshotReceiver()), state(2));
  commit(k, 2, [1, 2]); assert.deepEqual(k.stats().map(s => s.lastSeq), [2, 2]);
});
test('JSON, small and special-field fallbacks use the same transaction stream', () => {
  const k = new SnapshotPrepareState(), receivers = [new SteamBinarySnapshotReceiver(), new SteamSnapshotReceiver()];
  for (const [i, s] of [state(1), { type: 'state', matchId: 'worker-match', seq: 2, frame: { tick: 2 } },
    { ...state(3), extension: 'must survive' }, state(4)].entries()) {
    const r = prepare(k, i + 1, { input: { kind: 'json', data: JSON.stringify(s) } });
    for (const result of r.response.results) assert.deepEqual(restore(result, receivers[result.key - 1]), s);
    commit(k, i + 1, [1, 2]);
  }
});
test('peer/input bounds, immutable capability and shared transferred payload ownership', () => {
  const k = new SnapshotPrepareState();
  assert.throws(() => prepare(k, 1, { peers: Array.from({ length: 10 }, (_, i) => ({ key: i + 1, epoch: 0, binary: true })) }));
  assert.throws(() => prepare(k, 1, { input: { kind: 'binary', data: new Uint8Array(SNAPSHOT_PREPARE_LIMITS.inputBytes + 1) } }));
  assert.throws(() => prepare(k, 1, { peers: [peers[0], peers[0]] }));
  const request = input(1); const length = request.data.byteLength;
  const r = prepare(k, 1, { peers: [peers[0], { ...peers[0], key: 2 }], input: request });
  assert.equal(r.transfer.length, 1); assert.equal(r.response.results[0].prepared.payload, r.response.results[1].prepared.payload);
  structuredClone(r.response, { transfer: r.transfer }); assert.equal(request.data.byteLength, length);
  commit(k, 1, [1, 2]); assert.equal(k.stats()[0].lastSeq, 1);
  assert.throws(() => prepare(k, 2, { peers: [{ ...peers[0], binary: false }] }));
});

class ControlledWorker extends EventEmitter {
  kernel = new SnapshotPrepareState(); requests = []; terminated = false;
  postMessage(message, transfer = []) { this.requests.push(structuredClone(message, { transfer })); }
  unref() {}
  terminate() { this.terminated = true; return Promise.resolve(0); }
  reply() { const request = this.requests.shift(); const { response, transfer } = this.kernel.handle(request); this.emit('message', structuredClone(response, { transfer })); return request; }
}
const owner = binary => ({ binarySnapshots: binary, snapshotWritable: true });
const turn = () => new Promise(r => setImmediate(r));
async function controlled(t, deliver = () => true) {
  const worker = new ControlledWorker(), faults = [];
  const broker = new SnapshotPrepareBroker({ workerFactory: () => worker, deliver, onFault: owners => faults.push(owners) });
  t.after(() => broker.close()); return { worker, broker, faults };
}
test('broker groups broadcast peers, retains one active + one latest, commits before next prepare', async t => {
  const delivered = [], { broker: b, worker: w } = await controlled(t, (o, r) => { delivered.push([o, r]); return true; });
  const a = owner(true), c = owner(false), first = snapshot(1);
  b.offer(a, first); b.offer(c, first); w.emit('message', { op: 'ready' }); await turn();
  assert.equal(w.requests[0].peers.length, 2);
  for (let i = 2; i <= 20; i++) { const s = snapshot(i); b.offer(a, s); b.offer(c, s); }
  assert.equal(b.diagnostics().maxRetained, 2); assert.equal(b.diagnostics().replaced, 18);
  w.reply(); assert.equal(delivered.length, 2); assert.equal(w.requests[0].op, 'commit');
  w.reply(); await turn(); assert.equal(w.requests[0].op, 'prepare'); w.reply(); w.reply();
  assert.equal(b.peerDiagnostics(a).binaryFullStates + b.peerDiagnostics(a).binaryDeltaStates, 2);
  assert.equal(b.active, null); assert.equal(b.latest, null);
});
test('broker drops reset/retired proposals and never commits native rejection', async t => {
  const delivered = [], { broker: b, worker: w } = await controlled(t, (o, r) => { delivered.push(r); return false; });
  const a = owner(true), c = owner(false), s = snapshot(1);
  b.offer(a, s); b.offer(c, s); w.emit('message', { op: 'ready' }); await turn();
  b.reset(a); b.retire(c); w.reply(); assert.equal(delivered.length, 0);
  while (w.requests.length) w.reply();
  b.offer(a, snapshot(2)); await turn(); w.reply(); assert.equal(delivered.length, 1); w.reply();
  assert.equal(w.kernel.stats()[0].lastSeq, null);
});
for (const mode of ['error', 'exit', 'fault', 'unexpected']) test('broker quarantines worker ' + mode, async t => {
  const { broker: b, worker: w, faults } = await controlled(t); const a = owner(true); b.offer(a, snapshot(1));
  if (mode === 'error') w.emit('error', Error('private details'));
  else if (mode === 'exit') w.emit('exit', 1);
  else w.emit('message', mode === 'fault' ? { op: 'fault' } : { op: 'prepared', id: 99 });
  assert.equal(b.failed, true); assert.equal(w.terminated, true); assert.deepEqual(faults, [[a]]);
  assert.equal(b.offer(a, snapshot(2)), false); assert.equal(b.latest, null);
});
test('worker hang expires bounded startup watchdog without falling back to a mismatched base', async () => {
  const worker = new ControlledWorker(); let fault;
  const b = new SnapshotPrepareBroker({ workerFactory: () => worker, timeoutMs: 20, onFault: () => { fault = true; } });
  try { b.offer(owner(true), snapshot(1)); await until(() => fault); assert.equal(worker.terminated, true); }
  finally { await b.close(); }
});
test('real Node worker transfers input, restores exact state and cleanly terminates', async t => {
  const worker = new Worker(SNAPSHOT_PREPARE_WORKER_URL, { workerData: { kind: SNAPSHOT_PREPARE_WORKER_KIND } });
  t.after(() => worker.terminate()); const replies = [], errors = [];
  worker.on('message', m => replies.push(m)); worker.on('error', e => errors.push(e));
  await until(() => replies.length); assert.equal(replies.shift().op, 'ready');
  const bytes = Uint8Array.from(snapshot(1).bytes).buffer;
  worker.postMessage({ op: 'prepare', id: 1, now: 1000, input: { kind: 'binary', data: bytes }, peers }, [bytes]);
  assert.equal(bytes.byteLength, 0); await until(() => replies.length);
  const prepared = replies.shift(); assert.equal(prepared.op, 'prepared');
  for (const r of prepared.results) assert.deepEqual(restore(r, r.key === 1 ? new SteamBinarySnapshotReceiver() : new SteamSnapshotReceiver()), state(1));
  worker.postMessage({ op: 'commit', id: 1, accepted: [1, 2] }); await until(() => replies.length);
  assert.deepEqual(replies.shift().stats.map(s => s.lastSeq), [1, 1]); assert.deepEqual(errors, []);
});
const hostId = '76561198000000001', guestId = '76561198000000002', lobby = '109775240000000001', connection = 'a'.repeat(32);
function gatewayFixture(t, { binary = true, workerFactory, refuse = () => false } = {}) {
  const messages = [], codec = new SteamPacketCodec({ binaryStates: true });
  const g = new SteamGateway({ build: 'worker-test', snapshotWorkerFactory: workerFactory, client: { networking: {
    sendP2PPacket(_id, _type, packet) { if (refuse()) return false; const m = codec.receive(hostId, packet); if (m) messages.push(m); return true; },
  } } });
  g.owner = hostId; g.selected = { id: lobby, owner: hostId, lobby: { getMembers: () => [hostId, guestId] } }; g.relay = { acceptTransport() {} };
  g.dispatch(guestId, { op: 'open', connection, data: { lobby, build: 'worker-test', protocol: protocol.version, binaryState: binary ? 1 : 0, stateConsumption: 1 } });
  const p = g.peers.get(guestId); p.requestedConsumption = true; p.send(JSON.stringify({ type: 'welcome', id: 1 }));
  t.after(async () => { await g.leave(); g.wss.close(); });
  return { g, p, messages, ack(message, consumed = false, needsFull = false) { g.dispatch(guestId, { connection, op: 'ack', data: { id: message.id, consumed, needsFull } }); } };
}
for (const binary of [true, false]) test('default gateway uses real worker with injected SDK and exact ' + (binary ? 'binary' : 'legacy') + ' reception', async t => {
  const f = gatewayFixture(t, { binary }); const receiver = binary ? new SteamBinarySnapshotReceiver() : new SteamSnapshotReceiver();
  for (let seq = 1; seq <= 5; seq++) {
    if (seq % 2) f.p.sendSnapshot(snapshot(seq)); else f.p.send(JSON.stringify(state(seq)));
    await until(() => !f.g.snapshotPreparer.active && !f.g.snapshotPreparer.latest);
    assert.equal(f.p.readyState, 1); assert.equal(f.p.sentStates, seq);
    const m = f.messages.filter(m => m.op === 'data').at(-1);
    assert.deepEqual(receiver.receive(m.data).data, state(seq));
    assert.equal(f.p.consumption.rawBytes, Buffer.byteLength(JSON.stringify(state(seq))));
    f.ack(m); assert.equal(f.p.consumption.pending.size, 1); f.ack(m, true); assert.equal(f.p.consumption.pending.size, 0);
  }
  assert.equal(f.g.snapshotPreparer.diagnostics().accepted, 5); assert.equal(f.p.ackedStates, 5);
});
for (const type of ['ended', 'roomClosed', 'match', 'launch']) test('terminal or sync control cancels pending async state: ' + type, async t => {
  const w = new ControlledWorker(), f = gatewayFixture(t, { workerFactory: () => w });
  f.p.sendSnapshot(snapshot(1)); w.emit('message', { op: 'ready' }); await turn();
  f.p.send(JSON.stringify({ type, matchId: 'worker-match' })); w.reply(); while (w.requests.length) w.reply();
  assert.equal(f.p.sentStates, 0); assert.equal(f.messages.filter(m => m.op === 'data').at(-1).data.type, type);
});
test('admission is rechecked after worker preparation; rejected native send never commits', async t => {
  const w = new ControlledWorker(); let refuse = false;
  const f = gatewayFixture(t, { workerFactory: () => w, refuse: () => refuse });
  f.p.sendSnapshot(snapshot(1)); w.emit('message', { op: 'ready' }); await turn();
  f.p.inflightBytes = f.p.snapshotByteLimit; w.reply(); w.reply();
  assert.equal(f.p.sentStates, 0); assert.equal(w.kernel.stats()[0].lastSeq, null);
  f.p.inflightBytes = 0; f.p.sendSnapshot(snapshot(2)); await turn(); refuse = true;
  w.reply(); while (w.requests.length) w.reply();
  assert.equal(f.p.readyState, 3); assert.equal(w.kernel.stats().length, 0); assert.equal(f.p.sentStates, 0);
});

test('needsFull invalidates pending work only for an exact live network ACK', async t => {
  const w = new ControlledWorker(), f = gatewayFixture(t, { workerFactory: () => w });
  f.p.sendSnapshot(snapshot(1)); w.emit('message', { op: 'ready' }); await turn(); w.reply(); w.reply();
  const sent = f.messages.filter(m => m.op === 'data').at(-1); f.ack(sent, true);
  f.p.sendSnapshot(snapshot(2)); await turn();
  f.ack({ id: sent.id + 100 }, false, true); assert.equal(w.requests.length, 1);
  f.ack(sent, false, true); w.reply(); while (w.requests.length) w.reply();
  assert.equal(f.p.sentStates, 1); assert.equal(w.kernel.stats()[0].lastSeq, null);
  f.p.sendSnapshot(snapshot(3)); await turn(); w.reply(); w.reply();
  const fresh = f.messages.filter(m => m.op === 'data').at(-1);
  assert.deepEqual(new SteamBinarySnapshotReceiver().receive(fresh.data).data, state(3));
});
test('worker fault closes affected peers; a new connection gets a fresh worker and no old result', async t => {
  const workers = []; const f = gatewayFixture(t, { workerFactory: () => { const w = new ControlledWorker(); workers.push(w); return w; } });
  f.p.sendSnapshot(snapshot(1)); workers[0].emit('error', Error('failed'));
  assert.equal(f.p.readyState, 3);
  f.g.dispatch(guestId, { op: 'open', connection, data: { lobby, build: 'worker-test', protocol: protocol.version, binaryState: 1 } });
  const replacement = f.g.peers.get(guestId); assert.notEqual(replacement, f.p);
  replacement.sendSnapshot(snapshot(2)); assert.equal(workers.length, 2);
  workers[1].emit('message', { op: 'ready' }); await turn(); workers[1].reply(); workers[1].reply();
  assert.equal(replacement.sentStates, 1); assert.equal(f.g.snapshotPreparer.failed, false);
});
test('real worker shares one broadcast across nine mixed peers; a stalled renderer remains bounded', async t => {
  const ids = Array.from({ length: 9 }, (_, i) => String(BigInt(guestId) + BigInt(i)));
  const decoders = ids.map(() => new SteamPacketCodec({ binaryStates: true })), messages = ids.map(() => []);
  const g = new SteamGateway({ build: 'multi-worker-test', client: { networking: {
    sendP2PPacket(remote, _type, packet) { const i = ids.indexOf(String(remote)); const m = decoders[i].receive(hostId, packet); if (m) messages[i].push(m); return true; },
  } } });
  g.owner = hostId; g.selected = { id: lobby, owner: hostId, lobby: { getMembers: () => [hostId, ...ids] } }; g.relay = { acceptTransport() {} };
  t.after(async () => { await g.leave(); g.wss.close(); });
  const streams = ids.map((id, i) => {
    g.dispatch(id, { op: 'open', connection, data: { lobby, build: 'multi-worker-test', protocol: protocol.version, binaryState: i % 2 ? 0 : 1, stateConsumption: 1 } });
    const p = g.peers.get(id); p.requestedConsumption = true; p.send(JSON.stringify({ type: 'welcome', id: i })); messages[i] = []; return p;
  });
  const receivers = ids.map((_, i) => i % 2 ? new SteamSnapshotReceiver() : new SteamBinarySnapshotReceiver());
  const counts = ids.map(() => 0);
  for (let seq = 1; seq <= 30; seq++) {
    const s = snapshot(seq); for (const p of streams) p.sendSnapshot(s);
    await until(() => !g.snapshotPreparer.active && !g.snapshotPreparer.latest);
    for (const [i, list] of messages.entries()) {
      for (const m of list.splice(0)) {
        if (m.op !== 'data') continue;
        assert.deepEqual(receivers[i].receive(m.data).data, state(seq)); counts[i]++;
        g.dispatch(ids[i], { op: 'ack', connection, data: { id: m.id } });
        if (i !== 0) g.dispatch(ids[i], { op: 'ack', connection, data: { id: m.id, consumed: true } });
      }
      assert.equal(streams[i].readyState, 1); assert.ok(streams[i].inflight.size <= 32);
      assert.ok(streams[i].consumption.rawBytes <= protocol.maxSnapshotBytes * 2);
    }
  }
  assert.ok(counts[0] < 30); assert.ok(streams[0].consumption.pending.size > 0);
  assert.ok(counts.slice(1).every(n => n >= 28), JSON.stringify(counts));
  assert.ok(g.snapshotPreparer.diagnostics().maxRetained <= 2); assert.equal(g.snapshotPreparer.diagnostics().faults, 0);
});
