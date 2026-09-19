// Lossless Steam state transport; deterministic fixtures, no Steam account or artifact dependency.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { SteamPacketCodec } from '../server/steam/packet-codec.mjs';
import { createStateDelta, applyStateDelta, SteamSnapshotEncoder, SteamSnapshotSender, SteamSnapshotReceiver, DELTA_MAX_BYTES, DELTA_MAX_NODES } from '../server/steam/snapshot-delta.mjs';
const nonce = '1'.repeat(32);
const json = JSON.stringify;
const clone = v => JSON.parse(json(v));
let seed = 918;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const noise = count => Array.from({ length: count }, () => String.fromCharCode(32 + Math.floor(random() * 90))).join('');
const ballast = noise(14000);
const state = (seq, extra = {}) => ({ type: 'state', matchId: 'fixture', seq, frame: { tick: seq, ballast, ...extra } });
function fixture() {
  const codec = new SteamPacketCodec(), decoder = new SteamPacketCodec(), encoder = new SteamSnapshotEncoder(), sender = new SteamSnapshotSender(), receiver = new SteamSnapshotReceiver();
  const decode = choice => {
    const framed = codec.frame(nonce, 'data', choice.prepared);
    let message;
    for (const packet of framed.packets) message = decoder.receive('peer', packet, choice.now);
    assert.ok(message); assert.equal(decoder.bytes, 0); assert.equal(message.connection, nonce);
    return message.data;
  };
  const send = (value, now = 100, stream = sender, destination = receiver) => {
    const choice = stream.prepare(json(value), encoder, codec, now), wire = decode(choice);
    stream.commit(choice);
    const result = destination.receive(wire);
    assert.equal(result.needsFull, false); assert.equal(json(result.data), json(value));
    return { choice, wire };
  };
  return { codec, decoder, encoder, sender, receiver, decode, send };
}
function envelope(body, overrides = {}) {
  const canonical = json(body);
  return { type: 'steam-state', v: 1, token: 1, base: null, size: Buffer.byteLength(canonical), hash: createHash('sha256').update(canonical).digest('hex'), body, ...overrides };
}
function checkTree(a, b) {
  const savedA = json(a), savedB = json(b);
  const patch = JSON.parse(json(createStateDelta(a, b)));
  const actual = applyStateDelta(a, patch);
  assert.equal(json(actual), savedB); assert.deepEqual(actual, b);
  assert.equal(json(a), savedA); assert.equal(json(b), savedB);
}
test('tree codec preserves order, deletion, arrays, Unicode and exact numeric values', () => {
  const values = [null, true, false, 0, 1.2345678901234567, -1e-200, Number.MAX_VALUE, '', '中文😀\ud800\udfff', [], {}, [1, null, false], { a: 1, b: 2 }, { b: 2, a: 1 }, JSON.parse('{"__proto__":{"polluted":1},"constructor":{"x":2},"prototype":null,"3":"n","0":"m"}')];
  for (const a of values) for (const b of values) checkTree(a, b);
  checkTree([1, 2, 3], [1]); checkTree([1], [1, 2, 3]);
  checkTree({ a: 1, b: 2, c: 3 }, { c: 3, a: 1 });
  assert.equal({}.polluted, undefined);
});
test('deterministic randomized tree property replay', () => {
  const tree = depth => {
    const pick = Math.floor(random() * (depth ? 7 : 5));
    if (pick === 0) return null;
    if (pick === 1) return random() > .5;
    if (pick === 2) return random() * 2e10 - 1e10;
    if (pick === 3) return noise(Math.floor(random() * 24));
    if (pick === 4) return Math.floor(random() * 100);
    if (pick === 5) return Array.from({ length: Math.floor(random() * 8) }, () => tree(depth - 1));
    const object = Object.create(null);
    for (let i = 0; i < Math.floor(random() * 8); i++) object[['__proto__', 'constructor', 'x', '汉字', '0', 'z'][Math.floor(random() * 6)]] = tree(depth - 1);
    return object;
  };
  for (let i = 0; i < 1200; i++) checkTree(clone(tree(4)), clone(tree(4)));
});
test('full SWSP round trip, deltas, keyframes, new match and legacy fallback', () => {
  const f = fixture();
  assert.equal(f.send(state(1), 100).choice.delta, false);
  assert.equal(f.send(state(2, { position: [Math.PI, -1e-200], text: '😀\ud800' }), 120).choice.delta, true);
  assert.equal(f.send(state(3), 1099).choice.delta, true);
  assert.equal(f.send(state(4), 1100).choice.delta, true); // cheap deltas do not justify a costly 1s checkpoint
  assert.equal(f.send({ ...state(5), matchId: 'next' }, 1110).choice.delta, false);
  const legacy = { type: 'state', seq: 6, frame: {} };
  assert.equal(f.send(legacy, 1120).choice.target, null); assert.equal(f.sender.base, null); assert.equal(f.receiver.base, null);
  assert.equal(f.send(state(7), 1130).choice.delta, false);
  const oversized = state(8, { ballast: 'x'.repeat(DELTA_MAX_BYTES) });
  assert.equal(f.send(oversized, 1140).choice.target, null);
  f.receiver.receive({ type: 'ping' }); assert.equal(f.receiver.base, null);
});
test('skipped preparations and native failure do not advance baseline or stats', () => {
  const f = fixture(); f.send(state(1), 100);
  const previous = f.sender.base;
  for (let seq = 2; seq < 35; seq++) f.sender.prepare(json(state(seq)), f.encoder, f.codec, 100 + seq);
  assert.equal(f.sender.base, previous); assert.equal(f.sender.fullStates, 1); assert.equal(f.sender.deltaStates, 0);
  const choice = f.sender.prepare(json(state(35)), f.encoder, f.codec, 150);
  assert.equal(f.decode(choice).base, previous.token);
  assert.equal(f.send(state(36), 160).choice.delta, true);
  assert.equal(f.sender.base.value.seq, 36);
});
test('shared broadcast preparation with independent peer baselines and reset', () => {
  const f = fixture(), b = new SteamSnapshotSender(), r = new SteamSnapshotReceiver();
  const a1 = f.send(state(1), 100), b1 = f.send(state(1), 100, b, r);
  assert.equal(a1.choice.target, b1.choice.target); assert.equal(a1.choice.prepared, b1.choice.prepared);
  const a2 = f.send(state(2), 120), b2 = f.send(state(2), 120, b, r);
  assert.equal(a2.choice.prepared, b2.choice.prepared);
  f.send(state(3), 140); const a4 = f.send(state(4), 160), b4 = f.send(state(4), 160, b, r);
  assert.equal(a4.choice.target, b4.choice.target); assert.notEqual(a4.wire.base, b4.wire.base);
  b.reset(); assert.equal(f.send(state(5), 180, b, r).choice.delta, false);
  assert.equal(f.send(state(5), 180).choice.delta, true);
  f.encoder.clear(); assert.equal(f.encoder.current, null);
  assert.ok(f.sender.diagnostics().baselineBytes < DELTA_MAX_BYTES);
});
test('missing baseline drops undecodable states until a new full frame', () => {
  const f = fixture(); f.send(state(1), 100); f.receiver.base = null;
  const choice = f.sender.prepare(json(state(2)), f.encoder, f.codec, 120);
  assert.equal(choice.delta, true); f.sender.commit(choice);
  assert.deepEqual(f.receiver.receive(f.decode(choice)), { data: null, needsFull: true });
  assert.equal(f.receiver.base, null); assert.equal(f.receiver.misses, 1);
  f.sender.reset(); assert.equal(f.send(state(3), 140).choice.delta, false);
  assert.equal(f.send(state(4), 160).choice.delta, true);
});
test('larger deltas and over-budget patch nodes/depth fall back to full without rejection', () => {
  const f = fixture(); f.send(state(1), 100);
  assert.equal(f.send(state(2, { ballast: noise(14000) }), 120).choice.delta, false);
  const nested = n => { let v = n; for (let i = 0; i < 75; i++) v = { child: v }; return v; };
  f.send(state(3, { nested: nested(1) }), 140);
  assert.equal(f.send(state(4, { nested: nested(2) }), 160).choice.delta, false);
  f.send(state(5, { many: Array.from({ length: 17000 }, () => 0) }), 180);
  assert.equal(f.send(state(6, { many: Array.from({ length: 17000 }, () => 1) }), 200).choice.delta, false);
  assert.equal(f.send(state(7, { many: new Array(DELTA_MAX_NODES).fill(0) }), 220).choice.target, null);
  let deep = 0; for (let i = 0; i < 98; i++) deep = [deep];
  assert.equal(f.send(state(8, { deep }), 240).choice.target, null);
});
test('invalid envelopes, corrupted hashes and reconstructed size are rejected without changing base', () => {
  const f = fixture(); f.send(state(1)); const base = f.receiver.base;
  for (const edit of [{ v: 2 }, { token: -1 }, { token: 1.1 }, { base: -1 }, { size: 0 }, { size: DELTA_MAX_BYTES + 1 }, { hash: 'f'.repeat(64) }, { hash: 'x' }, { size: 1 }, { body: { type: 'state' } }]) {
    assert.throws(() => f.receiver.receive(envelope(state(2), edit)), /差分/);
    assert.equal(f.receiver.base, base);
  }
  const frame = envelope(state(2), { base: base.token, body: [2, { seq: [0, 99] }] });
  assert.throws(() => f.receiver.receive(frame), /差分/); assert.equal(f.receiver.base, base);
});
test('malformed patch indices, keys, types and expansion are rejected', () => {
  for (const change of [[1, 3, 1, [0, 2], 1, [0, 3]], [1, 3, 2, [0, 2], 1, [0, 3]], [1, 4, 3, [0, 1]], [1, 4294967295], [1, 2], [1, 1, -1, [0, 0]], [1, 1, .5, [0, 0]], [3], [0], [0, 1, 2], [1, 1, 0], {}]) assert.throws(() => applyStateDelta([0], change), /差分/);
  for (const change of [[2, {}, ['a', 'a']], [2, { b: [0, 2] }], [2, {}, ['missing']], [2, {}, [1]], [2, null], [2, {}, [], 0], [2, { a: null }, ['a']]]) assert.throws(() => applyStateDelta({}, change), /差分/);
  assert.throws(() => applyStateDelta(undefined, null), /差分/);
  const f = fixture(); f.send(state(1));
  const base = f.receiver.base.token;
  assert.throws(() => f.receiver.receive(envelope(state(2), { base, body: [0, new Array(DELTA_MAX_NODES).fill(0)] })), /差分/);
  let body = [0, 0]; for (let i = 0; i < 100; i++) body = [2, { nested: body }];
  assert.throws(() => f.receiver.receive(envelope(state(2), { base, body })), /差分/);
  assert.equal({}.polluted, undefined);
});
test('proto-looking fields remain own JSON data through production wire', () => {
  const f = fixture(); f.send(state(1));
  const data = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"x":1}},"toString":"value"}');
  f.send(state(2, { data }), 120);
  const changed = clone(data); Object.defineProperty(changed, '__proto__', { value: { safe: '汉字' }, enumerable: true });
  f.send(state(3, { data: changed }), 140); assert.equal({}.polluted, undefined);
});

test('multi-fragment full frames and 500 evolving states reconstruct exactly', () => {
  const f = fixture();
  const large = state(1, { ballast: noise(100000) });
  const first = f.sender.prepare(json(large), f.encoder, f.codec, 0);
  assert.ok(f.codec.frame(nonce, 'data', first.prepared).packets.length > 1);
  f.send(large, 0);
  let previous = large;
  for (let seq = 2; seq <= 501; seq++) {
    const data = clone(previous); data.seq = seq; data.frame.tick = seq;
    data.frame.projectiles = Array.from({ length: seq % 19 }, (_, i) => ({ id: i, pos: [random(), random()], ttl: random() * 10 }));
    if (seq % 7 === 0) delete data.frame.projectiles;
    data.frame.extra = seq % 5 === 0 ? null : { a: noise(seq % 20), b: seq % 9 };
    f.send(data, seq * 17); previous = data;
  }
  assert.ok(f.sender.deltaStates > 450); assert.ok(f.sender.fullStates >= 1);
  assert.equal(f.decoder.pending.size, 0); assert.equal(f.receiver.misses, 0);
});

test('small delta envelopes are compressed without changing control-message threshold', () => {
  const codec = new SteamPacketCodec();
  const delta = codec.prepare('data', json({ type: 'steam-state', body: 'x'.repeat(2000) }));
  const control = codec.prepare('data', json({ type: 'control', body: 'x'.repeat(2000) }));
  assert.equal(delta.zipped, true); assert.equal(control.zipped, false);
  assert.equal(codec.prepare('data', json({ type: 'steam-state', body: 'tiny' })).zipped, false);
});

test('routine checkpoints require amortized byte cost, but have a 10s ceiling', () => {
  const f = fixture(); f.send(state(1), 100);
  for (let seq = 2; seq < 9; seq++) assert.equal(f.send(state(seq), 100 + seq * 1000).choice.delta, true);
  assert.equal(f.send(state(9), 10099).choice.delta, true);
  assert.equal(f.send(state(10), 10100).choice.delta, false);
  assert.equal(f.sender.deltaBytesSinceFull, 0);
  const prepared = f.sender.prepare(json(state(11)), f.encoder, f.codec, 11000);
  f.sender.prepare(json(state(12)), f.encoder, f.codec, 11020);
  assert.equal(f.sender.deltaBytesSinceFull, 0, 'skipped preparations cannot fund checkpoints');
  f.sender.commit(prepared); assert.equal(f.sender.deltaBytesSinceFull, prepared.prepared.payload.length);
  f.sender.reset(); assert.equal(f.sender.deltaBytesSinceFull, 0);
  assert.equal(f.send(state(13), 11040).choice.delta, false, 'explicit repair is never postponed by byte policy');
});
test('busy streams still checkpoint after 1s once prior deltas pay for the full frame', () => {
  const f = fixture(); f.send(state(1), 0);
  let seq = 1;
  for (; seq < 1000 && f.sender.deltaBytesSinceFull < f.encoder.current.full.payload.length * 5; seq++) f.send(state(seq + 1, { noisy: noise(2000) }), 500);
  assert.ok(seq < 1000); assert.ok(f.sender.deltaBytesSinceFull > 0);
  assert.equal(f.send(state(seq + 2), 999).choice.delta, true);
  assert.equal(f.send(state(seq + 3), 1000).choice.delta, false);
});
