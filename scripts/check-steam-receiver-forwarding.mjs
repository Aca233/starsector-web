// Production legacy dispatch with a deferred WS callback; no Steam account or listener.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { SteamGateway } from '../server/steam/gateway.mjs';
import { SteamSnapshotReceiver, createStateDelta } from '../server/steam/snapshot-delta.mjs';
import { SteamRendererReceipts } from '../server/steam/state-consumption.mjs';
import protocol from '../src/network/protocol.json' with { type: 'json' };
const json = JSON.stringify;
const state = seq => ({ type: 'state', matchId: 'forwarding', seq, frame: { tick: seq,
  values: [Math.PI, -1e-200, Number.MAX_VALUE, Number.MIN_VALUE, Number.MAX_SAFE_INTEGER],
  text: '中文😀\ud800', data: JSON.parse('{"__proto__":{"safe":true},"constructor":2,"0":"n"}') } });
function envelope(value, overrides = {}) {
  const text = json(value);
  return { type: 'steam-state', v: 1, token: value.seq, base: null, size: Buffer.byteLength(text),
    hash: createHash('sha256').update(text).digest('hex'), body: value, ...overrides };
}
function fixture() {
  const sends = [], acks = [], closes = [];
  const ws = { readyState: 1, bufferedAmount: 0,
    send(text, callback) { sends.push({ text, callback }); },
    close(...args) { closes.push(args); } };
  const gateway = Object.assign(Object.create(SteamGateway.prototype), {
    owner: 'guest', selected: { owner: 'host', lobby: { getMembers: () => ['host', 'guest'] } },
    renderer: ws, guestConnection: 'connection', snapshotReceiver: new SteamSnapshotReceiver(),
    receivedStates: 0, lastStateAt: 0, report() {},
    transmit(...args) { acks.push(args); }
  });
  const dispatch = (data, extra = {}) => gateway.dispatch('host', { connection: 'connection', op: 'data', id: 7, data, ...extra });
  return { gateway, ws, sends, acks, closes, dispatch };
}
function countStringify(work) {
  let calls = 0; JSON.stringify = (...args) => { calls++; return json(...args); };
  try { work(); } finally { JSON.stringify = json; }
  return calls;
}
for (const kind of ['full', 'delta']) test(kind + ': verified bytes are reused; ACK waits for successful WS callback', () => {
  const f = fixture(), before = state(1), after = state(2);
  if (kind === 'delta') f.gateway.snapshotReceiver.receive(envelope(before));
  const wire = envelope(after, kind === 'delta' ? { base: 1, body: createStateDelta(before, after) } : {});
  // Neither untrusted text-like fields nor the network representation may become output.
  wire.canonicalText = '{"attacker":true}';
  const networkText = json(wire, null, 2).replace('3.141592653589793', '3.1415926535897930');
  const parsed = JSON.parse(networkText), expected = json(after);
  const calls = countStringify(() => f.dispatch(parsed));
  assert.equal(f.sends.length, 1);
  assert.equal(f.sends[0].text, expected);
  assert.deepEqual(Buffer.from(f.sends[0].text), Buffer.from(expected));
  assert.notEqual(f.sends[0].text, networkText);
  assert.deepEqual(f.acks, [], 'no optimistic ACK');
  f.sends[0].callback();
  assert.deepEqual(f.acks, [['host', 'connection', 'ack', { id: 7 }]]);
  assert.equal(calls, 1, 'only receiver verification stringifies; gateway reuses canonical text');
});

test('ordinary legacy state/control fallback still serializes original data', () => {
  for (const value of [state(1), { type: 'notice', text: 'hello', canonicalText: 'untrusted' }]) {
    const f = fixture(); f.gateway.snapshotReceiver.receive(envelope(state(0)));
    assert.equal(countStringify(() => f.dispatch(value)), 1);
    assert.equal(f.sends[0].text, json(value)); assert.deepEqual(f.acks, []);
    f.sends[0].callback();
    assert.equal(f.acks.length, value.type === 'state' ? 1 : 0);
    assert.equal(f.gateway.snapshotReceiver.base === null, value.type === 'state');
  }
});

for (const kind of ['full', 'delta']) test(kind + ': hash/size/body tampering never sends or ACKs', () => {
  for (const defect of ['hash', 'size', 'body']) {
    const f = fixture(), before = state(1), after = state(2);
    f.gateway.snapshotReceiver.receive(envelope(before)); const saved = f.gateway.snapshotReceiver.base;
    const wire = envelope(after, kind === 'delta' ? { base: 1, body: createStateDelta(before, after) } : {});
    if (defect === 'hash') wire.hash = '0'.repeat(64);
    if (defect === 'size') wire.size++;
    if (defect === 'body') wire.body = kind === 'full' ? { ...after, seq: 999 } : [0, { ...after, seq: 999 }];
    assert.throws(() => f.dispatch(wire), /差分/);
    assert.deepEqual(f.sends, []); assert.deepEqual(f.acks, []);
    assert.equal(f.gateway.snapshotReceiver.base, saved); assert.equal(f.gateway.receivedStates, 0);
  }
});

test('missing base drops data with only the existing repair/consumption ACKs', () => {
  for (const receipts of [false, true]) {
    const f = fixture(); if (receipts) f.gateway.rendererReceipts = {};
    f.dispatch(envelope(state(2), { base: 1, body: null }));
    assert.deepEqual(f.sends, []); assert.equal(f.gateway.receivedStates, 0); assert.equal(f.gateway.lastStateAt, 0);
    assert.deepEqual(f.acks, [['host', 'connection', 'ack', { id: 7, needsFull: true }],
      ...(receipts ? [['host', 'connection', 'ack', { id: 7, consumed: true }]] : [])]);
  }
});

test('WS callback error and synchronous send failure cannot ACK', () => {
  const f = fixture(); f.dispatch(envelope(state(1)));
  assert.deepEqual(f.acks, []); f.sends[0].callback(Error('write failed')); assert.deepEqual(f.acks, []);
  const thrown = fixture(); thrown.ws.send = () => { throw Error('send failed'); };
  assert.throws(() => thrown.dispatch(envelope(state(1))), /send failed/); assert.deepEqual(thrown.acks, []);
});

test('stale WS callbacks and unauthorised/closed destinations cannot ACK or forward', () => {
  for (const key of ['selected', 'renderer', 'guestConnection']) {
    const f = fixture(); f.dispatch(envelope(state(1))); f.gateway[key] = null;
    f.sends[0].callback(); assert.deepEqual(f.acks, []);
  }
  for (const change of [f => { f.ws.readyState = 3; }, f => { f.gateway.guestConnection = 'other'; },
    f => { f.gateway.selected.lobby.getMembers = () => ['guest']; }]) {
    const f = fixture(); change(f); f.dispatch(envelope(state(1)));
    assert.deepEqual(f.sends, []); assert.deepEqual(f.acks, []);
  }
});

test('browser backpressure and receipt byte budget reject without send or ACK', () => {
  const slow = fixture(); slow.ws.bufferedAmount = protocol.maxSnapshotBytes * 2 + 1;
  slow.dispatch(envelope(state(1)));
  assert.deepEqual(slow.sends, []); assert.deepEqual(slow.acks, []); assert.equal(slow.closes[0][0], 1013);
  const f = fixture();
  f.gateway.rendererReceipts = new SteamRendererReceipts({ maxFrames: 1, maxBytes: 1 });
  f.dispatch(envelope(state(1)));
  assert.deepEqual(f.sends, []); assert.deepEqual(f.acks, []); assert.equal(f.closes[0][0], 1013);
});

test('renderer receipt accounting uses exactly the forwarded UTF-8 byte count', () => {
  const f = fixture(), value = state(1); let tracked;
  f.gateway.rendererReceipts = { track(...args) { tracked = args; return true; } };
  f.dispatch(envelope(value));
  assert.deepEqual(tracked, [value, 7, Buffer.byteLength(f.sends[0].text)]);
  assert.deepEqual(f.acks, []); f.sends[0].callback(); assert.equal(f.acks.length, 1);
});
