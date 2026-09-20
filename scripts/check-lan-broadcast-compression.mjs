import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLanServer } from '../server/lan-server.mjs';
import { lanTransportMetrics } from '../server/LanTransportDiagnostics.mjs';
import protocol from '../src/network/protocol.json' with { type: 'json' };
import WebSocket, { WebSocketServer } from 'ws';
import { LanBroadcastCompression, LAN_COMPRESSION_LIMITS, lanCompressionStats } from '../server/LanBroadcastCompression.mjs';
import { lanPerMessageDeflate } from '../server/lan-websocket.mjs';
import { LanDeltaSender, lanDeltaTarget } from '../server/LanDeltaTransport.mjs';
import { encodeLanPacket, LanDeltaReceiver } from '../src/network/LanBinaryDelta.mjs';
import { encodeBinaryState, encodeProjectedBinaryFrame, decodeBinaryState } from '../src/network/BinarySnapshot.mjs';
import { motionFrame } from './lib/motion-reference-fixture.mjs';
const owned = size => Buffer.from(new ArrayBuffer(size));
const target = seq => lanDeltaTarget(encodeBinaryState('shared-packet', seq, encodeProjectedBinaryFrame({ ...motionFrame(), tick: seq })), seq);
function fake({ context = false, server = true, bits = 15, options = {} } = {}) {
  const calls = [], delivered = [];
  const ext = { _isServer: server, _options: { ...lanPerMessageDeflate(), ...options }, params: { server_no_context_takeover: !context, server_max_window_bits: bits },
    compress(data, fin, callback) { calls.push({ data, fin, callback }); } };
  const ws = { _isServer: server, readyState: 1, _socket: { destroyed: false }, _extensions: { 'permessage-deflate': ext },
    _sender: { _extensions: { 'permessage-deflate': ext } }, terminate() { this.readyState = 3; this._socket.destroyed = true; } };
  return { ws, ext, calls, delivered, send(data, fin = true) { ext.compress(data, fin, (error, result) => delivered.push({ error, result })); } };
}
test('equal full/delta packets are immutable shared broadcast outputs, not shared peer bases', () => {
  const senders = Array.from({ length: 9 }, () => new LanDeltaSender({ ordered: true, motionReference: true }));
  const receivers = senders.map(() => new LanDeltaReceiver({ motionReference: true }));
  for (let seq = 1; seq <= 4; seq++) {
    const t = target(seq), choices = senders.map(s => s.prepare(t));
    assert.equal(t.packetBuilds, 1); assert.ok(choices.every(c => c.packet === choices[0].packet));
    for (const [i, c] of choices.entries()) {
      assert.deepEqual(c.packet, encodeLanPacket(t, senders[i].base, c.delta ? t.motionPatches.get(senders[i].base.bytes).patch : null, c.anchor, c.motionSteps));
      assert.deepEqual(receivers[i].decode(c.packet), t.bytes); assert.equal(senders[i].commit(c), true);
    }
    assert.equal(senders[0].commit(choices[1]), false);
  }
  senders[0].reset(); assert.ok(senders.slice(1).every(s => s.base !== null));
});
test('packet sharing distinguishes base metadata, anchor flags and negotiation', () => {
  const senders = [new LanDeltaSender({ ordered: true }), new LanDeltaSender({ ordered: false }), new LanDeltaSender({ ordered: true, motionReference: true })];
  const first = target(1); for (const s of senders) { s.commit(s.prepare(first)); s.ack(1); }
  const second = target(2); const pending = senders[1].prepare(second); senders[1].commit(pending); // leaves an unconfirmed anchor
  const next = target(3), choices = senders.map(s => s.prepare(next));
  assert.notEqual(choices[0].packet, choices[1].packet); assert.notEqual(choices[0].packet, choices[2].packet);
  assert.equal(choices[0].anchor, true); assert.equal(choices[1].anchor, false);
  const a = new LanDeltaSender({ ordered: true }), b = new LanDeltaSender({ ordered: true });
  for (const s of [a, b]) s.commit(s.prepare(first)); b.base.seq = 0;
  const shared = target(4); assert.notEqual(a.prepare(shared).packet, b.prepare(shared).packet);
});
test('nine equal pending compressions share one job, never cache completed output', () => {
  const c = new LanBroadcastCompression(), peers = Array.from({ length: 9 }, () => fake()), data = c.share(owned(8192));
  for (const p of peers) { assert.equal(c.attach(p.ws), true); p.send(data); }
  assert.equal(peers.reduce((n, p) => n + p.calls.length, 0), 1); assert.equal(c.stats().shared, 8);
  const compressed = Buffer.from('compressed'); peers[0].calls.shift().callback(null, compressed);
  assert.ok(peers.every(p => p.delivered[0].result === compressed)); assert.equal(c.stats().activeJobs, 0); assert.equal(c.stats().activeBytes, 0);
  peers[0].send(data); assert.equal(peers[0].calls.length, 1); assert.equal(c.stats().jobs, 2);
  peers[0].calls.shift().callback(null, compressed);
  assert.equal(c.attach(peers[0].ws), false); assert.equal(lanCompressionStats(peers[0].ws).shared, 8);
});
test('unmarked, partial pooled views, fragmented, context-takeover and unknown shapes retain stock behavior', () => {
  const c = new LanBroadcastCompression();
  for (const args of [{ context: true }, { server: false }, { bits: 20 }, { options: { zlibDeflateOptions: { level: 6 } } }]) {
    const p = fake(args); assert.equal(c.attach(p.ws), false);
  }
  assert.equal(c.attach({}), false); assert.equal(c.attach(null), false);
  const p = fake(); c.attach(p.ws); const packet = c.share(owned(8192));
  p.send(owned(8192)); p.send(c.share(packet.subarray(1))); p.send(packet, false); p.send(packet, true);
  assert.equal(p.calls.length, 4); assert.equal(c.stats().jobs, 0); assert.equal(c.stats().fallback, 4);
});
test('negotiated window sizes never share compressed output', () => {
  const c = new LanBroadcastCompression(), data = c.share(owned(8192)), a = fake(), b = fake({ bits: 12 });
  for (const p of [a, b]) { c.attach(p.ws); p.send(data); }
  assert.equal(c.stats().jobs, 2); assert.equal(c.stats().shared, 0);
  a.calls[0].callback(null, Buffer.from('a')); b.calls[0].callback(null, Buffer.from('b'));
  assert.equal(a.delivered[0].result.toString(), 'a'); assert.equal(b.delivered[0].result.toString(), 'b');
});
test('owner failure retries healthy followers through their own streams, without closing them', () => {
  const c = new LanBroadcastCompression(), data = c.share(owned(8192)), peers = [fake(), fake(), fake()];
  for (const p of peers) { c.attach(p.ws); p.send(data); }
  peers[0].ws.terminate(); peers[0].calls[0].callback(Error('owner closed'));
  assert.equal(peers[0].delivered.length, 1); assert.equal(c.stats().activeJobs, 0); assert.equal(c.stats().retries, 2);
  for (const p of peers.slice(1)) { assert.equal(p.ws.readyState, 1); assert.equal(p.calls.length, 1); p.calls[0].callback(null, Buffer.from('ok')); assert.equal(p.delivered[0].result.toString(), 'ok'); }
});
test('sharing bounds do not build a second queue; excess requests use original ws admission', () => {
  const c = new LanBroadcastCompression(), data = c.share(owned(8192)), peers = Array.from({ length: LAN_COMPRESSION_LIMITS.waiters + 1 }, () => fake());
  for (const p of peers) { c.attach(p.ws); p.send(data); }
  assert.equal(c.stats().shared, LAN_COMPRESSION_LIMITS.waiters - 1); assert.equal(c.stats().fallback, 1);
  peers[0].calls[0].callback(null, Buffer.from('ok')); peers.at(-1).calls[0].callback(null, Buffer.from('ok'));
  const p = fake(); c.attach(p.ws);
  for (let i = 0; i <= LAN_COMPRESSION_LIMITS.jobs; i++) p.send(c.share(owned(2048)));
  assert.equal(c.stats().activeJobs, LAN_COMPRESSION_LIMITS.jobs); assert.equal(c.stats().fallback, 2);
  for (const call of p.calls) call.callback(null, Buffer.from('ok'));
  assert.equal(c.stats().activeJobs, 0); assert.equal(c.stats().activeBytes, 0);
});
test('real PMD peers receive exact bytes with mixed windows, controls and owner closure', async () => {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0, perMessageDeflate: lanPerMessageDeflate() }); await once(server, 'listening');
  const compression = new LanBroadcastCompression(), peers = [], clients = [], rows = [], errors = [];
  try {
    for (let i = 0; i < 9; i++) {
      const accepted = once(server, 'connection'), client = new WebSocket('ws://127.0.0.1:' + server.address().port, { perMessageDeflate: { ...lanPerMessageDeflate(), ...(i === 8 ? { serverMaxWindowBits: 12 } : {}) } });
      clients.push(client); const opened = once(client, 'open'), [peer] = await accepted; peers.push(peer); await opened;
      rows.push([]); client.on('message', (data, binary) => rows[i].push({ data, binary })); client.on('error', e => errors.push(e)); peer.on('error', e => errors.push(e));
      assert.equal(compression.attach(peer), true);
    }
    const waitFor = async fn => { const until = performance.now() + 5000; while (!fn()) { if (performance.now() > until) throw Error('Real WS timeout'); await new Promise(r => setTimeout(r, 5)); } };
    const first = compression.share(Uint8Array.from(randomBytes(96 * 1024)));
    for (const p of peers) p.send(first);
    await waitFor(() => rows.every(r => r.length === 1));
    assert.equal(compression.stats().jobs, 2); assert.equal(compression.stats().shared, 7);
    for (const r of rows) { assert.equal(r[0].binary, true); assert.deepEqual(r[0].data, Buffer.from(first)); }
    for (const p of peers) p.send('control');
    const second = compression.share(Uint8Array.from(randomBytes(96 * 1024)));
    for (const p of peers) p.send(second);
    peers[0].terminate();
    await waitFor(() => rows.slice(1).every(r => r.length === 3));
    for (const r of rows.slice(1)) { assert.equal(r[1].data.toString(), 'control'); assert.deepEqual(r[2].data, Buffer.from(second)); }
    await waitFor(() => compression.stats().activeJobs === 0);
    assert.equal(compression.stats().activeBytes, 0); assert.deepEqual(errors, []);
    assert.ok(peers.slice(1).every(p => p.readyState === 1));
  } finally { for (const p of [...clients, ...peers]) p.terminate(); await new Promise(r => server.close(r)); }
});

test('sharing byte budget remains bounded even for maximum-sized marked payloads', () => {
  const c = new LanBroadcastCompression(), p = fake(); c.attach(p.ws);
  for (let i = 0; i < 3; i++) p.send(c.share(owned(protocol.maxSnapshotBytes)));
  assert.equal(c.stats().activeJobs, 2); assert.equal(c.stats().activeBytes, LAN_COMPRESSION_LIMITS.bytes); assert.equal(c.stats().fallback, 1);
  for (const call of p.calls) call.callback(null, Buffer.from('ok'));
  assert.equal(c.stats().activeBytes, 0);
});
test('actual relay room fanout negotiates sharing without changing canonical credits or receipts', async () => {
  const dist = await mkdtemp(join(tmpdir(), 'lan-fanout-')); await writeFile(join(dist, 'lan-build.json'), JSON.stringify({ build: 'fanout-test' }));
  let relay; const clients = [], rows = [], states = [], errors = [];
  const waitFor = async fn => { const deadline = performance.now() + 5000; while (!fn()) { if (performance.now() > deadline) throw Error('Relay integration timeout: ' + JSON.stringify({ errors, received: states.map(s => s.length), rejected: rows.flat().filter(m => m.type === 'error'), ready: clients.map(c => c.readyState), room: [...(relay?.rooms.values() ?? [])].map(r => ({ status: r.status, seq: r.lastSeq, peers: r.peers.map(p => ({ credits: p.stateCredits?.stats(), delta: p.lanDelta?.stats(), flow: p.lanFlow })) })) })); await new Promise(r => setTimeout(r, 5)); } };
  const send = (i, message) => clients[i].send(JSON.stringify(message));
  try {
    // Public-origin selection exercises real compressed LAN endpoints entirely
    // over loopback. No DNS, public listener, original game or desktop needed.
    relay = await createLanServer({ host: '127.0.0.1', port: 0, dist, publicOrigin: 'http://relay.test' });
    for (let i = 0; i < 10; i++) {
      const ws = new WebSocket('ws://127.0.0.1:' + relay.server.address().port + '/lan/ws', {
        headers: { Host: 'relay.test', Origin: 'http://relay.test' }, perMessageDeflate: lanPerMessageDeflate(),
      }); clients.push(ws); rows.push([]); states.push([]); const receiver = new LanDeltaReceiver({ motionReference: true });
      ws.on('error', e => errors.push(String(e)));
      ws.on('message', (data, binary) => { try {
        if (binary) { const bytes = receiver.decode(data), state = decodeBinaryState(bytes); states[i].push({ state, bytes: Buffer.from(bytes) }); send(i, { type: 'state-consumed', matchId: state.matchId, seq: state.seq }); }
        else rows[i].push(JSON.parse(data));
      } catch (error) { errors.push(String(error)); } });
      await once(ws, 'open'); send(i, { type: 'hello', name: 'peer', instance: 'fanout-' + i, build: 'fanout-test', protocol: protocol.version, stateCredits: 1, binaryDelta: 1, motionReference: 1 });
      await waitFor(() => rows[i].some(m => m.type === 'welcome'));
    }
    send(0, { type: 'create', password: '' }); await waitFor(() => relay.rooms.size === 1); const room = [...relay.rooms.values()][0];
    send(0, { type: 'capacity', capacity: 10 }); await waitFor(() => room.capacity === 10);
    for (let i = 1; i < 10; i++) send(i, { type: 'join', code: room.code, password: '' });
    await waitFor(() => room.peers.length === 10);
    for (let i = 1; i < 10; i++) send(i, { type: 'ready', ready: true });
    await waitFor(() => room.peers.slice(1).every(p => p.ready)); send(0, { type: 'start' });
    await waitFor(() => room.status === 'loading');
    for (let i = 0; i < 10; i++) send(i, { type: 'loaded', matchId: room.match.id });
    await waitFor(() => room.status === 'running' && room.peers.every(p => p.ws.bufferedAmount === 0));
    const expected = { ...motionFrame(), tick: 1, ships: Array.from({ length: room.match.players.length + room.match.options.aiHulls.flat().length }, (_, i) => ({ id: 'ship-' + i, state: { teamId: i % 2 } })), crafts: [], craftSpecs: [] };
    const bytes = encodeBinaryState(room.match.id, 1, encodeProjectedBinaryFrame(expected));
    const before = lanTransportMetrics(room.peers[0]).compressionFanout; clients[0].send(bytes);
    await waitFor(() => states.slice(1).every(s => s.length === 1) && room.peers.slice(1).every(p => p.stateCredits.stats().inflight === 0));
    for (const received of states.slice(1)) assert.deepEqual(received[0].bytes, Buffer.from(bytes));
    const after = lanTransportMetrics(room.peers[0]).compressionFanout;
    assert.equal(after.jobs - before.jobs, 1); assert.equal(after.shared - before.shared, 8);
    assert.ok(room.peers.slice(1).every(p => p.stateCredits.stats().acked === 1));
    assert.equal(after.activeBytes, 0); assert.deepEqual(errors, []);
  } finally { for (const c of clients) c.terminate(); await relay?.close(); await unlink(join(dist, 'lan-build.json')); await rmdir(dist); }
});

test('a closing follower cannot write an empty replacement packet on owner failure', () => {
  const c = new LanBroadcastCompression(), data = c.share(owned(8192)), a = fake(), b = fake();
  for (const p of [a, b]) { c.attach(p.ws); p.send(data); }
  a.ws.terminate(); b.ws.readyState = 2; a.calls[0].callback(Error('owner closed'));
  assert.equal(b.ws._socket.destroyed, true); assert.equal(b.calls.length, 0); assert.equal(c.stats().activeJobs, 0);
});
