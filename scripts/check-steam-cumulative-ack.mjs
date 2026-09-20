// Explicit synchronous reference fixture; real-worker coverage lives in check-steam-snapshot-prepare.mjs.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { SteamGateway, STEAM_INPUT_ACK_DELAY_MS } from '../server/steam/gateway.mjs';
import { SteamSendWindow, SteamReliableQueue } from '../server/steam/reliable-queue.mjs';
import { SteamPacketCodec } from '../server/steam/packet-codec.mjs';
import protocol from '../src/network/protocol.json' with { type: 'json' };

// Small synchronous transport tests only: no Steam SDK, shared-link model,
// benchmark, real sockets or sleeps. Advancing Date.now never delays execution.
const host = '76561198000000001', guest = '76561198000000002', other = '76561198000000003';
const connection = 'a'.repeat(32), nextConnection = 'b'.repeat(32), lobby = '10977524000000001';
const input = (seq, actions = []) => ({
  type: 'input', matchId: 'battle', syncId: 'sync',
  input: { seq, keys: 0, aim: [0, 0], pointerActive: true, firing: false, actions },
});
const state = seq => JSON.stringify({ type: 'state', seq });
const keys = map => [...map.keys()];

function clock(t, initial = 100) {
  const time = { now: initial };
  t.mock.method(Date, 'now', () => time.now);
  return time;
}
function transport(t, local = host) {
  const frames = [], packets = [], incoming = [], codec = new SteamPacketCodec();
  let failure = null;
  const g = new SteamGateway({ snapshotPreparation: false, build: 'test', client: { networking: {
    isP2PPacketAvailable: () => incoming[0]?.data.length ?? 0,
    readP2PPacket: () => incoming.shift(),
    sendP2PPacket(remote, type, packet) {
      packets.push({ remote: String(remote), type });
      if (local === host) assert.equal(type, 2, 'host must not duplicate input receipts');
      if (failure === 'throw') throw Error('injected reliable send failure');
      if (failure === 'false') return false;
      const message = codec.receive(local, packet);
      if (message && type === 2) frames.push({ remote: String(remote), ...message });
      return true;
    },
  } } });
  t.after(() => {
    g.wss.close();
    // Check outside production's best-effort catch: an assertion thrown inside
    // sendP2PPacket could otherwise be swallowed with an optional fast copy.
    if (local === host) assert.ok(packets.every(packet => packet.type === 2), 'host receipts must stay reliable-only');
  });
  g.owner = local;
  g.selected = { id: lobby, owner: host, lobby: { getMembers: () => [host, guest, other], getOwner: () => host } };
  return {
    g, frames, packets, incoming,
    get acks() { return frames.filter(frame => frame.op === 'ack').map(frame => frame.data); },
    fail: mode => { failure = mode; },
  };
}
function hostFixture(t, capabilities = { cumulativeInputAck: 1 }) {
  const f = transport(t), applied = [];
  f.g.relay = { acceptTransport: peer => peer.on('message', raw => applied.push(JSON.parse(raw))) };
  const open = (nonce = connection, flags = capabilities, remote = guest) => {
    f.g.dispatch(remote, { op: 'open', connection: nonce, data: { lobby, build: 'test', protocol: protocol.version, ...flags } });
    return f.g.peers.get(remote);
  };
  return Object.assign(f, {
    applied, open, peer: open(),
    send: (id, data, nonce = connection, remote = guest) => f.g.dispatch(remote, { op: 'data', id, connection: nonce, data }),
    ack: (data, nonce = connection) => f.g.dispatch(guest, { op: 'ack', connection: nonce, data }),
  });
}
function browser() {
  const ws = new EventEmitter();
  Object.assign(ws, {
    readyState: 1, bufferedAmount: 0, sent: [], closes: [],
    send(text, callback) { this.sent.push(JSON.parse(text)); callback?.(); },
    close(code = 1000, reason = '') {
      if (this.readyState !== 1) return;
      this.readyState = 3; this.closes.push({ code, reason }); this.emit('close', code, reason);
    },
  });
  return ws;
}
function guestFixture(t) {
  const f = transport(t, guest);
  f.g.initialized = true;
  const connect = () => {
    const ws = browser();
    f.g.connectBrowser(ws, new URL(`http://localhost/steam/ws?lobby=${lobby}`));
    assert.equal(ws.readyState, 1);
    return ws;
  };
  return Object.assign(f, {
    connect, ws: connect(),
    send: data => f.g.renderer.emit('message', Buffer.from(JSON.stringify(data)), false),
    ack: (data, nonce = f.g.guestConnection, remote = host) => f.g.dispatch(remote, { op: 'ack', connection: nonce, data }),
  });
}
function windowSnapshot(w) { return { entries: [...w.pending], bytes: w.bytes }; }
function queueSnapshot(q) {
  return { window: windowSnapshot(q.window), pending: q.pending.map(item => item.text), ...q.diagnostics() };
}

// Pin 32, not just the exported constant: changing the bound must fail here.
test('continuous inputs execute immediately; the 32ms oldest deadline never slides under sustained traffic', t => {
  const time = clock(t, 0), f = hostFixture(t);
  assert.equal(STEAM_INPUT_ACK_DELAY_MS, 32);
  for (let ms = 0; ms < 32; ms++) {
    time.now = ms;
    f.send(10 + ms * 3, input(ms)); // Packet IDs can skip other wire operations.
    assert.deepEqual(f.applied.at(-1), input(ms));
    assert.equal(f.applied.length, ms + 1);
    assert.deepEqual(f.peer.inputAck, { id: 10 + ms * 3, since: 0 });
    f.g.poll();
    assert.deepEqual(f.acks, []);
  }
  time.now = 32; f.g.poll();
  assert.deepEqual(f.acks, [{ id: 103, cumulative: true }]);
  assert.equal(f.peer.inputAck, null);
  time.now = 100; f.g.poll();
  assert.equal(f.acks.length, 1, 'an empty batch must not emit repeated ACKs');
});

test('an input arriving at the deadline flushes the latest ID without waiting for poll', t => {
  const time = clock(t), f = hostFixture(t);
  f.send(0xffffffff, input(1));
  time.now = 131; f.send(0, input(2));
  assert.deepEqual(f.acks, []);
  time.now = 132; f.send(2, input(3));
  assert.deepEqual(f.applied, [input(1), input(2), input(3)]);
  assert.deepEqual(f.acks, [{ id: 2, cumulative: true }]);
  f.g.poll(); assert.equal(f.acks.length, 1);
  time.now = 133; f.send(5, input(4));
  time.now = 164; f.g.poll(); assert.equal(f.acks.length, 1);
  time.now = 165; f.g.poll();
  assert.deepEqual(f.acks.at(-1), { id: 5, cumulative: true });
});

test('action and control barriers execute before their immediate ACK and start a fresh deadline', t => {
  const time = clock(t), f = hostFixture(t);
  const action = input(2, [{ id: 1, kind: 'vent' }]), ping = { type: 'ping', sent: 149 };
  const seenBeforeAck = [];
  f.peer.on('message', () => seenBeforeAck.push(f.acks.length));
  f.send(1, input(1)); time.now = 116; f.send(2, action);
  assert.deepEqual(f.acks, [{ id: 2, cumulative: true }]);
  assert.equal(f.peer.inputAck, null);
  time.now = 117; f.send(3, input(3));
  time.now = 132; f.g.poll(); assert.equal(f.acks.length, 1, 'cancel the prior batch deadline');
  time.now = 148; f.g.poll(); assert.equal(f.acks.length, 1);
  time.now = 149; f.send(4, ping);
  assert.deepEqual(f.acks.at(-1), { id: 4, cumulative: true });
  assert.deepEqual(f.applied, [input(1), action, input(3), ping]);
  assert.deepEqual(seenBeforeAck, [0, 0, 1, 1]);
  time.now = 181; f.g.poll(); assert.equal(f.acks.length, 2);
});

test('only numeric cumulativeInputAck:1 negotiates; absent and lookalike flags keep immediate exact receipts', t => {
  clock(t);
  for (const value of [undefined, null, false, true, 0, 2, '1', {}, []]) {
    const f = hostFixture(t, value === undefined ? {} : { cumulativeInputAck: value });
    f.send(1, input(1)); f.send(4, input(2));
    assert.equal(f.peer.cumulativeInputAck, false, JSON.stringify(value));
    assert.deepEqual(f.applied, [input(1), input(2)]);
    assert.deepEqual(f.acks, [{ id: 1 }, { id: 4 }]);
    assert.equal(f.peer.inputAck, null);
  }
});

test('duplicate open with the same nonce cannot renegotiate or reset the oldest receipt', t => {
  const time = clock(t), f = hostFixture(t);
  f.send(7, input(1)); time.now = 131;
  assert.equal(f.open(connection, {}), f.peer);
  assert.equal(f.peer.cumulativeInputAck, true);
  assert.deepEqual(f.peer.inputAck, { id: 7, since: 100 });
  time.now = 132; f.g.poll(); assert.deepEqual(f.acks, [{ id: 7, cumulative: true }]);
  const legacy = hostFixture(t, {});
  assert.equal(legacy.open(connection, { cumulativeInputAck: 1 }), legacy.peer);
  legacy.send(7, input(1)); assert.deepEqual(legacy.acks, [{ id: 7 }]);
});

test('relay closure during input execution discards the pending receipt and cannot ACK a rejected control', t => {
  const time = clock(t), f = hostFixture(t);
  f.send(1, input(1));
  f.peer.once('message', () => f.peer.close(1008, 'relay rejected control'));
  f.send(2, { type: 'ping', sent: 100 });
  assert.equal(f.applied.length, 2);
  assert.equal(f.peer.readyState, 3);
  assert.equal(f.peer.inputAck, null);
  time.now = 200; f.peer.flushInputAck(time.now, true); f.g.poll();
  assert.deepEqual(f.acks, []);
  assert.equal(f.g.peers.has(guest), false);
});

test('host reconnect clears old deferred receipts and rejects stale data, close and colliding state ACKs', t => {
  const time = clock(t), f = hostFixture(t);
  f.send(5, input(1));
  time.now = 116;
  const oldPeer = f.peer, peer = f.open(nextConnection);
  assert.notEqual(peer, oldPeer);
  assert.equal(oldPeer.readyState, 3); assert.equal(oldPeer.inputAck, null);
  // Deliberately reuse IDs: nonce rejection, not accidental non-membership, must protect credit.
  f.send(5, input(2), nextConnection);
  peer.send(state(1)); peer.send(state(2));
  const stateIds = keys(peer.inflight), before = peer.inflightBytes;
  assert.equal(stateIds.length, 2);
  time.now = 132;
  f.send(6, input(3), connection);
  f.send(7, { type: 'ping', sent: 132 }, connection);
  f.ack({ id: stateIds[1], cumulative: true }, connection);
  f.g.dispatch(guest, { op: 'close', connection, data: {} });
  oldPeer.flushInputAck(time.now, true); f.g.poll();
  assert.deepEqual(f.applied, [input(1), input(2)]);
  assert.deepEqual(keys(peer.inflight), stateIds); assert.equal(peer.inflightBytes, before);
  assert.equal(peer.readyState, 1);
  assert.deepEqual(peer.inputAck, { id: 5, since: 116 });
  assert.deepEqual(f.acks, []);
  time.now = 148; f.g.poll();
  assert.deepEqual(f.acks, [{ id: 5, cumulative: true }]);
  assert.equal(f.frames.find(frame => frame.op === 'ack').connection, nextConnection);
  f.ack({ id: stateIds[1], cumulative: true }, nextConnection);
  assert.deepEqual(keys(peer.inflight), [stateIds[0]]);
});

test('receipt deadlines and capability negotiation are per peer, not gateway-wide', t => {
  const time = clock(t), f = hostFixture(t);
  const second = f.open(nextConnection, { cumulativeInputAck: 1 }, other);
  f.send(1, input(1));
  time.now = 116; f.send(1, input(1), nextConnection, other);
  time.now = 132; f.g.poll();
  assert.deepEqual(f.frames.filter(frame => frame.op === 'ack').map(frame => frame.remote), [guest]);
  assert.deepEqual(second.inputAck, { id: 1, since: 116 });
  time.now = 148; f.g.poll();
  assert.deepEqual(f.frames.filter(frame => frame.op === 'ack').map(frame => frame.remote), [guest, other]);
  f.open('c'.repeat(32), {}, other);
  f.send(2, input(2), 'c'.repeat(32), other);
  assert.deepEqual(f.acks.at(-1), { id: 2 });
  assert.equal(f.peer.cumulativeInputAck, true);
});

for (const failure of ['false', 'throw']) {
  test(`a ${failure} reliable send failure on delayed or barrier ACK terminates the peer`, t => {
    const time = clock(t);
    for (const barrier of [false, true]) {
      time.now = 100;
      const f = hostFixture(t);
      f.send(1, input(1)); f.fail(failure);
      if (barrier) {
        // Exercise poll's dispatch error path, rather than calling a throwing dispatch directly.
        const wire = new SteamPacketCodec(); wire.sequence = 1;
        for (const data of wire.encode(connection, 'data', input(2, [{ id: 1, kind: 'vent' }])).packets) {
          f.incoming.push({ steamId: guest, data });
        }
      } else time.now = 132;
      f.g.poll();
      assert.equal(f.applied.length, barrier ? 2 : 1, 'ACK failure must not delay input execution');
      assert.equal(f.peer.readyState, 3); assert.equal(f.peer.inputAck, null);
      assert.equal(f.g.peers.has(guest), false);
      assert.deepEqual(f.acks, []);
    }
  });
}

test('a new guest advertises version 1 but remains compatible with exact ACKs from an old host', t => {
  clock(t);
  const f = guestFixture(t), q = f.g.guestOutbound;
  const opening = f.frames.find(frame => frame.op === 'open');
  assert.equal(opening.data.cumulativeInputAck, 1);
  assert.equal(opening.connection, f.g.guestConnection);
  for (let seq = 1; seq <= 32; seq++) f.send(input(seq));
  f.send(input(33, [{ id: 1, kind: 'vent' }])); f.send({ type: 'ping', sent: 100 });
  const ids = keys(q.window.pending);
  assert.equal(ids.length, 32); assert.equal(q.pending.length, 2);
  f.ack({ id: ids[15] }); // Exact ACK in the middle must free ONE slot, not a prefix.
  assert.deepEqual(keys(q.window.pending).slice(0, 15), ids.slice(0, 15));
  assert.equal(q.window.pending.size, 32); assert.equal(q.pending.length, 1);
  assert.deepEqual(f.frames.at(-1).data, input(33, [{ id: 1, kind: 'vent' }]));
  const before = queueSnapshot(q);
  f.ack({ id: ids[15] }); f.ack({ id: ids[15], cumulative: true });
  assert.deepEqual(queueSnapshot(q), before);
  f.ack({ id: ids[0] });
  assert.deepEqual(f.frames.at(-1).data, { type: 'ping', sent: 100 });
  assert.equal(q.pending.length, 0);
  for (const id of keys(q.window.pending)) f.ack({ id });
  assert.equal(q.window.bytes, 0); assert.equal(q.bytes, 0);
  assert.deepEqual(f.ws.closes, []);
});

test('guest dispatch handles mixed exact/cumulative duplicates and accepts only boolean true as cumulative', t => {
  clock(t);
  const f = guestFixture(t), q = f.g.guestOutbound;
  for (let seq = 1; seq <= 7; seq++) f.send(input(seq));
  const ids = keys(q.window.pending);
  f.ack({ id: ids[2] });
  const before = queueSnapshot(q);
  for (const data of [{ id: ids[2], cumulative: true }, { id: ids[2] }, { id: 999, cumulative: true }, { id: String(ids[3]), cumulative: true }]) f.ack(data);
  assert.deepEqual(queueSnapshot(q), before);
  f.ack({ id: ids[3], cumulative: 'true' });
  f.ack({ id: ids[4], cumulative: 1 });
  assert.deepEqual(keys(q.window.pending), [ids[0], ids[1], ids[5], ids[6]]);
  f.ack({ id: ids[5], cumulative: true });
  assert.deepEqual(keys(q.window.pending), [ids[6]]);
  const remaining = queueSnapshot(q);
  f.ack({ id: ids[5] }); f.ack({ id: ids[5], cumulative: true });
  assert.deepEqual(queueSnapshot(q), remaining);
  f.ack({ id: ids[6] }); assert.equal(q.window.bytes, 0);
});

test('browser reconnect creates a fresh queue and rejects old-nonce ACKs even when packet IDs collide', t => {
  clock(t);
  const f = guestFixture(t), oldQueue = f.g.guestOutbound, oldNonce = f.g.guestConnection;
  for (let seq = 1; seq <= 33; seq++) f.send(input(seq));
  const oldIds = keys(oldQueue.window.pending);
  assert.equal(oldQueue.pending.length, 1);
  f.ws.close();
  assert.equal(oldQueue.window.bytes, 0); assert.equal(oldQueue.bytes, 0);
  assert.equal(oldQueue.window.pending.size, 0); assert.equal(oldQueue.pending.length, 0);
  assert.equal(f.g.guestConnection, null);
  // A restart/wrap can reuse wire IDs; do not let increasing IDs mask nonce bugs.
  f.g.codec.sequence = 0;
  const ws = f.connect(), q = f.g.guestOutbound, nonce = f.g.guestConnection;
  assert.notEqual(nonce, oldNonce); assert.notEqual(q, oldQueue);
  for (let seq = 1; seq <= 32; seq++) f.send(input(seq));
  f.send({ type: 'ping', sent: 100 });
  assert.deepEqual(keys(q.window.pending), oldIds);
  const before = queueSnapshot(q), frameCount = f.frames.length;
  f.ack({ id: oldIds[15] }, oldNonce);
  f.ack({ id: oldIds[31], cumulative: true }, oldNonce);
  f.g.dispatch(host, { op: 'close', connection: oldNonce, data: { code: 1001 } });
  f.ws.emit('message', Buffer.from(JSON.stringify(input(999))), false);
  assert.deepEqual(queueSnapshot(q), before); assert.equal(f.frames.length, frameCount);
  assert.deepEqual(ws.closes, []);
  f.ack({ id: oldIds[31], cumulative: true }, nonce);
  assert.equal(q.pending.length, 0); assert.equal(q.window.pending.size, 1);
  assert.deepEqual(f.frames.at(-1).data, { type: 'ping', sent: 100 });
  assert.equal(f.frames.at(-1).connection, nonce);
});

test('ACKs from a non-host lobby member cannot release guest credit even with the current nonce', t => {
  clock(t);
  const f = guestFixture(t), q = f.g.guestOutbound;
  f.send(input(1)); f.send(input(2));
  const ids = keys(q.window.pending), before = queueSnapshot(q);
  f.ack({ id: ids[1], cumulative: true }, f.g.guestConnection, other);
  f.ack({ id: ids[0] }, f.g.guestConnection, other);
  assert.deepEqual(queueSnapshot(q), before);
  f.ack({ id: ids[1], cumulative: true }); assert.equal(q.window.bytes, 0);
});

test('state delivery and renderer consumption remain separate exact-ID gates despite cumulative flags', t => {
  const time = clock(t), f = hostFixture(t, { cumulativeInputAck: 1, stateConsumption: 1 });
  f.send(1, { type: 'hello', stateCredits: 1 });
  f.peer.send(JSON.stringify({ type: 'welcome', matchId: 'battle' }));
  assert.ok(f.peer.consumption);
  for (let seq = 1; seq <= 3; seq++) f.peer.send(state(seq));
  const ids = keys(f.peer.inflight), consumption = f.peer.consumption;
  assert.equal(ids.length, 3); assert.deepEqual(keys(consumption.pending), ids);
  const consumptionBytes = consumption.bytes, rawBytes = consumption.rawBytes;
  const networkBytes = f.peer.inflightBytes, lastBytes = f.peer.inflight.get(ids[2]).bytes;
  const consumedFrame = consumption.pending.get(ids[1]);
  f.send(20, input(1)); // Opposite-direction ACKs must not force this receipt out early.
  time.now = 116;
  f.ack({ id: ids[2], cumulative: true });
  assert.deepEqual(keys(f.peer.inflight), ids.slice(0, 2));
  assert.equal(f.peer.inflightBytes, networkBytes - lastBytes);
  assert.equal(f.peer.ackedStates, 1);
  assert.deepEqual(keys(consumption.pending), ids);
  assert.equal(consumption.bytes, consumptionBytes); assert.equal(consumption.rawBytes, rawBytes);
  const networkRtt = f.peer.ackMs, controller = JSON.stringify(f.peer.snapshotWindow);
  const budget = JSON.stringify(f.g.snapshotBudget.diagnostics());
  time.now = 120;
  f.ack({ id: ids[1], consumed: true, cumulative: true });
  assert.deepEqual(keys(consumption.pending), [ids[0], ids[2]]);
  assert.equal(consumption.bytes, consumptionBytes - consumedFrame.bytes);
  assert.equal(consumption.rawBytes, rawBytes - consumedFrame.rawBytes);
  assert.equal(consumption.consumed, 1);
  assert.deepEqual(keys(f.peer.inflight), ids.slice(0, 2));
  assert.equal(f.peer.inflightBytes, networkBytes - lastBytes);
  assert.equal(f.peer.ackMs, networkRtt); assert.equal(f.peer.ackedStates, 1);
  assert.equal(JSON.stringify(f.peer.snapshotWindow), controller);
  assert.equal(JSON.stringify(f.g.snapshotBudget.diagnostics()), budget);
  for (const data of [{ id: ids[2], cumulative: true }, { id: ids[1], consumed: true, cumulative: true }, { id: 999, cumulative: true }, { id: 999, consumed: true, cumulative: true }]) f.ack(data);
  assert.deepEqual(keys(f.peer.inflight), ids.slice(0, 2));
  assert.deepEqual(keys(consumption.pending), [ids[0], ids[2]]);
  assert.equal(f.peer.ackedStates, 1); assert.equal(consumption.consumed, 1);
  assert.equal(f.peer.inflightBytes, networkBytes - lastBytes);
  assert.equal(consumption.bytes, consumptionBytes - consumedFrame.bytes);
  assert.equal(consumption.rawBytes, rawBytes - consumedFrame.rawBytes);
  assert.equal(f.peer.ackMs, networkRtt);
  assert.equal(JSON.stringify(f.peer.snapshotWindow), controller);
  assert.deepEqual(f.peer.inputAck, { id: 20, since: 100 });
  assert.deepEqual(f.acks, [{ id: 1, cumulative: true }]);
  time.now = 132; f.g.poll();
  assert.deepEqual(f.acks.at(-1), { id: 20, cumulative: true });
  assert.deepEqual(keys(f.peer.inflight), ids.slice(0, 2));
  assert.deepEqual(keys(consumption.pending), [ids[0], ids[2]]);
});

test('cumulative credit requires exact membership and follows insertion order through uint32 wrap', () => {
  const w = new SteamSendWindow();
  for (const [id, bytes, since] of [[0xfffffffd, 41, 100], [0xffffffff, 53, 110], [0, 67, 120], [2, 79, 130]]) {
    w.track({ id, packets: [Buffer.alloc(bytes - 7), Buffer.alloc(7)] }, since);
  }
  const before = windowSnapshot(w);
  for (const id of [1, 3, '0', null, undefined, -1, 0x100000000, NaN, 0.5]) {
    assert.equal(w.ack(id, true), false);
    assert.deepEqual(windowSnapshot(w), before);
  }
  assert.equal(w.ack(0, true), true);
  assert.deepEqual(keys(w.pending), [2]); assert.equal(w.bytes, 79);
  assert.equal(w.expired(8130), false); assert.equal(w.expired(8131), true);
  assert.equal(w.ack(0, true), false);
  assert.equal(w.ack(2), true); assert.equal(w.bytes, 0); assert.equal(w.expired(99999), false);
});

test('exact ACK holes and duplicate mixed ACKs never release newer Map entries or reset their age', () => {
  const w = new SteamSendWindow();
  for (const [index, id] of [0xfffffffd, 0xffffffff, 0, 2, 7].entries()) {
    w.track({ id, packets: [Buffer.alloc(40 + index)] }, 100 + index * 10);
  }
  assert.equal(w.ack(0), true); assert.equal(w.bytes, 168);
  const before = windowSnapshot(w);
  assert.equal(w.ack(0, true), false); assert.equal(w.ack(0), false);
  assert.deepEqual(windowSnapshot(w), before);
  assert.equal(w.ack(2, true), true);
  assert.deepEqual(keys(w.pending), [7]); assert.equal(w.bytes, 44);
  assert.equal(w.expired(8140), false); assert.equal(w.expired(8141), true);
  assert.equal(w.ack(2), false); assert.equal(w.ack(7, true), true);
  assert.equal(w.bytes, 0); assert.equal(w.pending.size, 0);
});

test('unknown cumulative ACKs cannot bank credit for a future tracked packet', () => {
  const w = new SteamSendWindow();
  w.track({ id: 10, packets: [Buffer.alloc(40)] }, 100);
  assert.equal(w.ack(20, true), false);
  w.track({ id: 20, packets: [Buffer.alloc(60)] }, 110);
  assert.deepEqual(keys(w.pending), [10, 20]); assert.equal(w.bytes, 100);
  assert.equal(w.ack(10, true), true);
  assert.deepEqual(keys(w.pending), [20]); assert.equal(w.bytes, 60);
  w.clear(); assert.equal(w.ack(20, true), false);
  assert.equal(w.bytes, 0); assert.equal(w.pending.size, 0);
});

test('cumulative ACK drains only admitted FIFO, preserving unsent action/control barriers and byte accounting', t => {
  clock(t);
  let id = 0;
  const sent = [], q = new SteamReliableQueue(text => {
    sent.push(JSON.parse(text)); return { id: ++id, packets: [Buffer.alloc(64)] };
  });
  for (let seq = 1; seq <= 34; seq++) q.enqueue(JSON.stringify(input(seq)));
  q.enqueue(JSON.stringify(input(35, [{ id: 1, kind: 'vent' }])));
  q.enqueue(JSON.stringify({ type: 'ping', sent: 1 }));
  for (const seq of [36, 37]) q.enqueue(JSON.stringify(input(seq)));
  assert.equal(sent.length, 32); assert.equal(q.pending.length, 4);
  assert.equal(q.bytes, q.pending.reduce((sum, item) => sum + Buffer.byteLength(item.text), 0));
  const full = queueSnapshot(q);
  q.ack(33, true); // This ID will be assigned after admission; it is not credit yet.
  assert.deepEqual(queueSnapshot(q), full); assert.equal(sent.length, 32);
  q.ack(16, true);
  assert.deepEqual(sent.slice(32).map(m => m.type === 'input' ? m.input.seq : m.type), [34, 35, 'ping', 37]);
  assert.deepEqual(sent[33].input.actions, [{ id: 1, kind: 'vent' }]);
  assert.deepEqual(keys(q.window.pending), Array.from({ length: 20 }, (_, i) => 17 + i));
  assert.equal(q.window.bytes, 20 * 64); assert.equal(q.bytes, 0); assert.equal(q.coalesced, 2);
  const before = queueSnapshot(q);
  q.ack(16); q.ack(16, true); q.ack(999, true);
  assert.deepEqual(queueSnapshot(q), before); assert.equal(sent.length, 36);
  q.ack(id, true); assert.equal(q.window.bytes, 0); assert.equal(q.bytes, 0);
  assert.equal(q.window.pending.size, 0); assert.equal(q.pending.length, 0);
});

test('cumulative release still respects the send byte cap when queued controls drain', () => {
  let id = 0;
  const q = new SteamReliableQueue(() => ({ id: ++id, packets: [Buffer.alloc(128 * 1024)] }));
  for (let i = 0; i < 5; i++) q.enqueue(JSON.stringify({ type: 'ping', sent: i }));
  assert.equal(q.window.full, true); assert.equal(q.window.pending.size, 2); assert.equal(q.pending.length, 3);
  q.ack(2, true);
  assert.deepEqual(keys(q.window.pending), [3, 4]);
  assert.equal(q.window.bytes, 256 * 1024); assert.equal(q.pending.length, 1);
  q.ack(2, true); assert.equal(q.pending.length, 1);
  q.ack(4, true);
  assert.deepEqual(keys(q.window.pending), [5]); assert.equal(q.bytes, 0);
  q.ack(5, true); assert.equal(q.window.bytes, 0);
});
