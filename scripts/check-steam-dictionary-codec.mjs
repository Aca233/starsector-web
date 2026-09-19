import test from 'node:test';
import assert from 'node:assert/strict';
import { encode } from '@msgpack/msgpack';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { SteamPacketCodec } from '../server/steam/packet-codec.mjs';
import { SteamSocketStateCodec, SOCKET_PACKED_MAX, unpackSocketState } from '../server/steam/sockets-state-codec.mjs';
import { SteamAnchorDictionaryCodec, unpackAnchorDictionaryState } from '../server/steam/experimental/anchor-dictionary-state-codec.mjs';
import { SteamDictionaryStateCodec, packDictionaryState, unpackDictionaryState, DICTIONARY_STATE_MAX } from '../server/steam/experimental/dictionary-state-codec.mjs';
import { SteamSnapshotEncoder } from '../server/steam/snapshot-delta.mjs';
import { SteamAnchoredSender, SteamAnchoredReceiver } from '../server/steam/anchored-snapshots.mjs';
const text = value => JSON.stringify(value);
const envelope = body => ({ type: 'steam-state', v: 1, token: 1, base: null, size: 10, hash: 'a'.repeat(64), body });
const exact = value => { const raw = text(value), bytes = packDictionaryState(raw); assert.equal(text(unpackDictionaryState(bytes)), raw); return bytes; };
const decodePrepared = p => {
  const raw = p.zipped ? inflateRawSync(p.payload, { maxOutputLength: p.rawBytes }) : p.payload;
  return p.dictionaryState ? unpackDictionaryState(raw) : JSON.parse(raw.toString());
};
const bodyPacket = body => {
  const packet = Buffer.concat([exact({}).subarray(0, 24), Buffer.from('SWF2'), Buffer.from(body)]);
  packet.writeUInt32LE(10, 4); return packet;
};

test('complete canonical tree/key order and actual LAN dictionary survive exactly', () => {
  const value = envelope({ shipSystems: [0.1, -1.23456789012345, Number.MIN_VALUE, Number.MAX_VALUE], uniqueKey: '中文😀', arr: [null, false, true], object: { z: 1, a: 2 } });
  const packed = exact(value); assert.equal(packed.toString('ascii', 24, 28), 'SWF2');
  assert.equal(DICTIONARY_STATE_MAX, SOCKET_PACKED_MAX);
});
test('5000 deterministic finite doubles including subnormals preserve JSON exactly', () => {
  let seed = 412, n = () => (seed = Math.imul(seed, 1664525) + 1013904223 >>> 0);
  const view = new DataView(new ArrayBuffer(8)), a = [];
  while (a.length < 5000) { view.setUint32(0, n()); view.setUint32(4, n()); const v = view.getFloat64(0); if (Number.isFinite(v)) a.push(v); }
  exact(envelope(a));
});
test('unsupported key/string cases preserve original JSON fallback, not lossy LAN text', () => {
  for (const body of [JSON.parse('{"__proto__":{"x":1}}'), { constructor: 3 }, { prototype: 5 }, { value: '\ud800' }, { value: '\ufeff' + '字'.repeat(210) }, { ['\ufeffkey']: 1 }]) {
    const raw = text(envelope(body)); assert.throws(() => packDictionaryState(raw));
    const prepared = new SteamDictionaryStateCodec().prepare('data', raw);
    assert.equal(prepared.dictionaryState, undefined); assert.equal(text(decodePrepared(prepared)), raw);
  }
});
test('noncanonical JSON and malformed input rejected', () => {
  for (const value of [null, {}, '', 'NaN', '[1, ]', '{ "a":1}', '-0', '1e400', '{"a":1,"a":2}']) assert.throws(() => packDictionaryState(value));
});
test('header magic, dictionary fingerprint, byte count, truncation, trailing data rejected', () => {
  const packed = exact(envelope({ x: 0.1 }));
  for (let end = 0; end < packed.length; end++) assert.throws(() => unpackDictionaryState(packed.subarray(0, end)));
  for (const offset of [0, 4, 8, 16, 24]) { const bad = Buffer.from(packed); bad[offset] ^= 255; assert.throws(() => unpackDictionaryState(bad)); }
  assert.throws(() => unpackDictionaryState(Buffer.concat([packed, Buffer.from([0])])));
  assert.throws(() => unpackDictionaryState(new Uint8Array(packed)));
});
test('preflight forbids allocation bombs, unsafe map keys and unsupported binary/ext', () => {
  for (const body of [[0xdd, 255, 255, 255, 255], [0xdf, 0, 1, 0, 0], [0xdb, 255, 255, 255, 255], [0xc4, 0], [0xd4, 0, 0],
    [0x81, 0xc3, 0xc0], [0x81, 0xff, 0xc0], [0x81, 0xcc, 128, 0xc0], [0x81, ...encode('__proto__'), 0], [0xa2, 0xed, 0xa0]]) {
    assert.throws(() => unpackDictionaryState(bodyPacket(body)));
  }
});
test('preflight forbids nonfinite, negative zero and unsafe int64 numbers', () => {
  for (const value of [NaN, Infinity, -Infinity, -0]) {
    const raw = Buffer.alloc(9); raw[0] = 0xcb; raw.writeDoubleBE(value, 1);
    assert.throws(() => unpackDictionaryState(bodyPacket(raw)));
  }
  assert.throws(() => unpackDictionaryState(bodyPacket([0xcf, ...new Array(8).fill(255)])));
});
test('Steam byte/node/depth ceilings retained instead of LAN larger limits', () => {
  assert.throws(() => packDictionaryState(text('x'.repeat(DICTIONARY_STATE_MAX))));
  assert.throws(() => unpackDictionaryState(Buffer.alloc(DICTIONARY_STATE_MAX + 1)));
  let value = 1; for (let i = 0; i < 96; i++) value = [value]; exact(value);
  assert.throws(() => packDictionaryState(text([value])));
  exact(new Array(65535).fill(null));
  assert.throws(() => packDictionaryState(text(new Array(65536).fill(null))));
});
test('controls, input, legacy full state and tiny states preserve original codec bytes', () => {
  for (const [op, value] of [['ping', { at: 1 }], ['open', { lobby: 'x' }], ['data', text({ type: 'input', x: 1 })], ['data', text({ type: 'state', frame: {} })], ['data', text({ type: 'steam-state', a: 1 })]]) {
    const a = new SteamPacketCodec().prepare(op, value), b = new SteamDictionaryStateCodec().prepare(op, value);
    assert.deepEqual(b, a);
  }
});
test('shared cache prepares once per immutable source and releases on clear', () => {
  const codec = new SteamDictionaryStateCodec();
  const raw = text(envelope(Array.from({ length: 400 }, (_, i) => ({ shipSystems: ['abc', i + .12345], selectedWeaponGroups: [i], linearAcceleration: i * .32 }))));
  const a = codec.prepare('data', raw); assert.equal(a.dictionaryState, true);
  for (let i = 0; i < 9; i++) assert.equal(codec.prepare('data', raw), a);
  assert.equal(codec.dictionaryPreparations, 1); const owned = Buffer.from(a.payload);
  codec.prepare('data', raw.replace('0.12345', '0.12346')); assert.deepEqual(a.payload, owned);
  codec.clear(); assert.equal(codec.cache, null); assert.equal(codec.dictionaryCache, null);
});
test('default SMF1 decoder and legacy framing cannot silently accept this format', () => {
  assert.throws(() => unpackSocketState(exact(envelope({ x: 0.2 }))));
  const codec = new SteamDictionaryStateCodec(); assert.throws(() => codec.encode()); assert.throws(() => codec.frame());
});
test('complete anchored snapshot flow keeps hash, base, match, token and exact state contract', () => {
  for (const Codec of [SteamDictionaryStateCodec, SteamSocketStateCodec, SteamAnchorDictionaryCodec]) {
    const codec = new Codec(), encoder = new SteamSnapshotEncoder(), sender = new SteamAnchoredSender({ adaptive: true }), receiver = new SteamAnchoredReceiver();
    let first = null;
    for (let seq = 1; seq < 16; seq++) {
      const raw = text({ type: 'state', matchId: 'exact-match', seq, frame: { tick: seq, ships: Array.from({ length: 50 }, (_, i) => ({ id: i, linearAcceleration: Math.sin(seq + i), selectedWeaponGroups: [i], name: 'ship-' + i })) } });
      const choice = sender.prepare(raw, encoder, codec, seq * 17); assert.ok(sender.commit(choice));
      const p = choice.prepared, bytes = p.zipped ? inflateRawSync(p.payload, { maxOutputLength: p.rawBytes }) : p.payload;
      const value = p.dictionaryState ? unpackDictionaryState(bytes) : p.packedState ? unpackSocketState(bytes) : JSON.parse(bytes.toString());
      const result = choice.kind === 'anchor' ? receiver.receiveAnchor(value) : receiver.receiveSnapshot(value);
      assert.equal(text(result.data), raw);
      if (choice.kind === 'anchor') { assert.ok(sender.acknowledgeAnchor(choice.target.token)); first = value; }
      assert.equal(receiver.receiveSnapshot(value).data, null);
    }
    const bad = structuredClone(first); bad.hash = '0'.repeat(64); assert.throws(() => new SteamAnchoredReceiver().receiveAnchor(bad));
  }
});
test('bounded inflate remains the responsibility of the unchanged wire layer', () => {
  const payload = deflateRawSync(Buffer.alloc(DICTIONARY_STATE_MAX + 1));
  assert.throws(() => inflateRawSync(payload, { maxOutputLength: DICTIONARY_STATE_MAX }));
});
test('deterministic mutations reject or return bounded canonical JSON', () => {
  const good = exact(envelope({ ships: Array.from({ length: 30 }, (_, i) => ({ id: i, x: i + .2, label: 'ship' })) }));
  for (let i = 0; i < Math.min(500, good.length); i++) {
    const bad = Buffer.from(good); bad[i] ^= 255;
    let value;
    try { value = unpackDictionaryState(bad); }
    catch (error) { assert.ok(error instanceof Error); continue; }
    assert.ok(Buffer.byteLength(text(value)) <= DICTIONARY_STATE_MAX);
  }
});

test('full-envelope-only routing preserves current delta bytes without another codec attempt', () => {
  const codec = new SteamAnchorDictionaryCodec();
  const value = envelope(Array.from({ length: 300 }, (_, i) => ({ linearAcceleration: Math.sin(i), selectedWeaponGroups: [i], shipSystems: ['abc'] })));
  const full = codec.prepare('data', text(value)); assert.equal(full.dictionaryState, true);
  assert.equal(text(unpackAnchorDictionaryState(inflateRawSync(full.payload))), text(value));
  const count = codec.anchorCodec.dictionaryPreparations;
  const delta = { ...value, base: 1, token: 2 };
  const a = new SteamSocketStateCodec().prepare('data', text(delta)), b = codec.prepare('data', text(delta));
  assert.deepEqual(b, a); assert.equal(codec.anchorCodec.dictionaryPreparations, count);
  if (b.packedState) assert.equal(text(unpackAnchorDictionaryState(inflateRawSync(b.payload))), text(delta));
  codec.clear(); assert.equal(codec.cache, null); assert.equal(codec.packedCache, null); assert.equal(codec.anchorCodec.dictionaryCache, null); assert.equal(codec.anchorCodec.cache, null);
  assert.throws(() => codec.encode()); assert.throws(() => codec.frame());
});
test('full-only canonical prefix routing does not reinterpret controls or alternate producer layouts', () => {
  const codec = new SteamAnchorDictionaryCodec();
  for (const [op, value] of [['ping', { at: 1 }], ['data', text({ type: 'input', frame: 1 })], ['data', text({ body: [1], ...envelope([2]) })]]) {
    assert.deepEqual(codec.prepare(op, value), new SteamSocketStateCodec().prepare(op, value));
  }
});
