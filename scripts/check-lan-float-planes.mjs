import test from 'node:test';
import assert from 'node:assert/strict';
import { encode } from '@msgpack/msgpack';
import { encodeProjectedBinaryFrame, decodeBinaryFrame, encodeBinaryState, decodeBinaryState } from '../src/network/BinarySnapshot.mjs';
import { shuffleLanFrame, unshuffleLanFrame } from '../src/network/experimental/LanFloatPlanes.mjs';
import protocol from '../src/network/protocol.json' with { type: 'json' };

const prefix = bytes => new Uint8Array([83, 87, 70, 50, ...bytes]);
const same = (a, b) => assert.deepEqual(new Uint8Array(a), new Uint8Array(b));
const frame = () => ({ tick: 60, ships: [{ id: 'ship', x: 1.2345, y: -2345.678, angle: Number.MIN_VALUE }], custom: '测试😀' });
const roundtrip = bytes => {
  const before = bytes.slice(), packed = shuffleLanFrame(bytes);
  assert.ok(packed); same(bytes, before);
  const restored = unshuffleLanFrame(packed);
  same(restored, bytes);
  assert.equal(restored.byteOffset, 0); assert.equal(restored.byteLength, restored.buffer.byteLength);
  assert.equal(packed.byteOffset, 0); assert.equal(packed.byteLength, packed.buffer.byteLength);
  assert.notEqual(restored.buffer, bytes.buffer);
  return { packed, restored };
};

test('SWF2 dictionary, unknown keys, Unicode and key order survive bit-exact roundtrip', () => {
  const value = frame(), bytes = encodeProjectedBinaryFrame(value), { restored } = roundtrip(bytes);
  assert.deepEqual(decodeBinaryFrame(restored), value);
  assert.deepEqual(Object.keys(decodeBinaryFrame(restored)), Object.keys(value));
});
test('5000 deterministic arbitrary finite IEEE-754 values retain original encoded bytes', () => {
  let seed = 0x7f821a13;
  const next = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
  const scratch = new DataView(new ArrayBuffer(8)), values = [Number.MIN_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE, 0.1, -0.1];
  while (values.length < 5000) {
    scratch.setUint32(0, next()); scratch.setUint32(4, next());
    const n = scratch.getFloat64(0); if (Number.isFinite(n)) values.push(n);
  }
  const bytes = encodeProjectedBinaryFrame({ values });
  const { restored } = roundtrip(bytes);
  assert.deepEqual(decodeBinaryFrame(restored), decodeBinaryFrame(bytes));
});
test('all integer widths, float32, float64 and IEEE special payload bits are only rearranged', () => {
  // The byte transform is not a new numeric validator. Semantic policy stays in
  // the existing decoder; even negative zero / NaN payload bits must not change.
  const floats = new Uint8Array(36), v = new DataView(floats.buffer);
  for (let i = 0; i < 4; i++) floats[i * 9] = 0xcb;
  v.setFloat64(1, -0); v.setFloat64(10, Infinity); v.setUint32(19, 0x7ff80001); v.setUint32(23, 0x12345678); v.setFloat64(28, 0.123);
  const scalar = [0, 0xff, 0xc0, 0xc2, 0xc3, 0xcc, 255, 0xcd, 255, 255, 0xce, 255, 255, 255, 255,
    0xcf, ...new Array(8).fill(255), 0xd0, 128, 0xd1, 128, 0, 0xd2, 128, 0, 0, 0, 0xd3, 128, 0, 0, 0, 0, 0, 0, 0, 0xca, 63, 0, 0, 0];
  roundtrip(prefix([0xdc, 0, 18, ...scalar, ...floats]));
});
test('array16/32, map16/32 and string8/16/32 framing supported', () => {
  const number = [0xcb, 63, 241, 0, 0, 0, 0, 0, 0];
  for (const header of [[0xdc, 0, 2], [0xdd, 0, 0, 0, 2]]) roundtrip(prefix([...header, ...number, ...number]));
  for (const header of [[0xde, 0, 2], [0xdf, 0, 0, 0, 2]]) roundtrip(prefix([...header, 0xa1, 120, ...number, 0xa1, 121, ...number]));
  for (const header of [[0xd9, 3], [0xda, 0, 3], [0xdb, 0, 0, 0, 3]]) {
    roundtrip(prefix([0x93, ...header, 0xcb, 0xc4, 0xdf, ...number, ...number]));
  }
});
test('original encoder JSON fallback and numeric semantics remain unchanged', () => {
  for (const value of [{ bad: '\ud800' }, { bad: NaN }, { bad: Infinity }, { constructor: 1 }, { bad: new Date() }]) {
    assert.equal(encodeProjectedBinaryFrame(value), null);
  }
  const bytes = encodeProjectedBinaryFrame({ values: [undefined, null, false, -0, 1.25, -3.75], omitted: undefined });
  const { restored } = roundtrip(bytes);
  assert.deepEqual(decodeBinaryFrame(restored), decodeBinaryFrame(bytes));
});
test('zero/one float requests original SWF2 fallback without a new format', () => {
  for (const value of [null, {}, { x: 1 }, { x: 0.25 }]) {
    const bytes = encodeProjectedBinaryFrame(value), copy = bytes.slice();
    assert.equal(shuffleLanFrame(bytes), null); same(bytes, copy);
  }
});
test('nonzero byteOffset views / DataView / ArrayBuffer supported with no aliasing', () => {
  const bytes = encodeProjectedBinaryFrame(frame()), parent = new Uint8Array(bytes.length + 19);
  parent.set(bytes, 7);
  for (const source of [new DataView(parent.buffer, 7, bytes.length), parent.subarray(7, 7 + bytes.length), bytes.buffer]) {
    const packed = shuffleLanFrame(source), wrapper = new Uint8Array(packed.length + 17); wrapper.set(packed, 5);
    same(unshuffleLanFrame(new DataView(wrapper.buffer, 5, packed.length)), bytes);
  }
});
test('transfer detach, repeat encode and output mutation cannot corrupt other frames', () => {
  const source = encodeProjectedBinaryFrame(frame()), a = shuffleLanFrame(source), copy = a.slice();
  const moved = structuredClone(a, { transfer: [a.buffer] }); assert.equal(a.buffer.byteLength, 0);
  const b = shuffleLanFrame(source); same(b, copy); same(moved, copy); b.fill(0); same(moved, copy);
  same(unshuffleLanFrame(moved), source);
});
test('malformed lengths, tags, headers, truncations, count mismatch and trailing data rejected', () => {
  const good = shuffleLanFrame(encodeProjectedBinaryFrame(frame()));
  for (let i = 0; i < good.length; i++) assert.throws(() => unshuffleLanFrame(good.subarray(0, i)));
  for (const offset of [0, 4, 8, 12]) {
    const bad = good.slice(); new DataView(bad.buffer).setUint32(offset, 0xffffffff, true);
    assert.throws(() => unshuffleLanFrame(bad));
  }
  assert.throws(() => unshuffleLanFrame(new Uint8Array([...good, 0])));
  for (const body of [[0xdd, 255, 255, 255, 255], [0xdf, 0, 1, 0, 1], [0xdb, 255, 255, 255, 255], [0xc4, 0], [0xd4, 0, 0], [0xc1], [0x92, 1], [0xc0, 0xc0], [0xcb, 0]]) {
    assert.throws(() => shuffleLanFrame(prefix(body)));
  }
  for (const source of [null, {}, 'SWF2', new Uint8Array(), prefix([0xc0]).subarray(1)]) assert.throws(() => shuffleLanFrame(source));
  // Keep total length exact while making skeleton float count disagree.
  const bad = good.slice(), v = new DataView(bad.buffer);
  v.setUint32(4, v.getUint32(4, true) + 8, true); v.setUint32(8, v.getUint32(8, true) - 1, true);
  assert.throws(() => unshuffleLanFrame(bad));
});
test('existing unsafe-key and numeric-dictionary checks still run after restore', () => {
  const f = [0xcb, 63, 241, 0, 0, 0, 0, 0, 0];
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    const bytes = prefix([0x81, ...encode(key), 0x92, ...f, ...f]);
    const restored = roundtrip(bytes).restored;
    assert.throws(() => decodeBinaryFrame(bytes)); assert.throws(() => decodeBinaryFrame(restored));
  }
  const bytes = prefix([0x81, 0xff, 0x92, ...f, ...f]);
  assert.throws(() => decodeBinaryFrame(roundtrip(bytes).restored));
});
test('legacy malformed UTF-8 path stays byte-for-byte equivalent', () => {
  const f = [0xcb, 63, 241, 0, 0, 0, 0, 0, 0], bytes = prefix([0x93, 0xa2, 0xed, 0xa0, ...f, ...f]);
  const { restored } = roundtrip(bytes);
  assert.deepEqual(decodeBinaryFrame(restored), decodeBinaryFrame(bytes));
});
test('LAN depth128 kept, no Steam depth96 or 65536-node ceiling introduced', () => {
  const f = [0xcb, 63, 241, 0, 0, 0, 0, 0, 0];
  const good = prefix([...new Array(126).fill(0x91), 0x92, ...f, ...f]);
  assert.doesNotThrow(() => decodeBinaryFrame(roundtrip(good).restored));
  const bad = prefix([...new Array(127).fill(0x91), 0x92, ...f, ...f]);
  assert.throws(() => decodeBinaryFrame(bad)); assert.throws(() => shuffleLanFrame(bad));
  const values = new Array(70000).fill(0.25), large = encodeProjectedBinaryFrame({ values });
  assert.ok(large.length > 512 * 1024 + 4096);
  assert.deepEqual(decodeBinaryFrame(roundtrip(large).restored), { values });
});
test('16MiB budget includes candidate header, with fallback at original boundary', () => {
  const make = size => {
    const bytes = new Uint8Array(size); bytes.set([83, 87, 70, 50, 0x93, 0xcb], 0); bytes[14] = 0xcb; bytes[23] = 0xdb;
    new DataView(bytes.buffer).setUint32(24, size - 28); return bytes;
  };
  const fits = make(protocol.maxSnapshotBytes - 12);
  const { packed } = roundtrip(fits); assert.equal(packed.length, protocol.maxSnapshotBytes);
  assert.equal(shuffleLanFrame(make(protocol.maxSnapshotBytes)), null);
  assert.throws(() => shuffleLanFrame(make(protocol.maxSnapshotBytes + 1)));
  assert.throws(() => unshuffleLanFrame(new Uint8Array(protocol.maxSnapshotBytes + 1)));
});
test('SWB1 transport header unchanged; default/old decoder explicitly rejects candidate', () => {
  const source = encodeProjectedBinaryFrame(frame()), packed = shuffleLanFrame(source);
  assert.throws(() => decodeBinaryFrame(packed));
  assert.throws(() => decodeBinaryState(encodeBinaryState('test-match', 1, packed)));
  const restored = unshuffleLanFrame(packed);
  assert.deepEqual(decodeBinaryState(encodeBinaryState('test-match', 1, restored)), decodeBinaryState(encodeBinaryState('test-match', 1, source)));
});

test('hostile compact skeletons reject impossible child counts before restoration', () => {
  for (const body of [[0xdd, 255, 255, 255, 255, 0xcb, 0xcb], [0xdf, 0, 1, 0, 1, 0xcb, 0xcb],
    [0x93, 0xdb, 255, 255, 255, 255, 0xcb, 0xcb], [0x93, 0xc4, 0, 0xcb, 0xcb], [0xc0, 0xcb, 0xcb]]) {
    const skeleton = prefix(body), packet = new Uint8Array(12 + skeleton.length + 16), view = new DataView(packet.buffer);
    view.setUint32(0, 0x53575031); view.setUint32(4, skeleton.length, true); view.setUint32(8, 2, true);
    packet.set(skeleton, 12); assert.throws(() => unshuffleLanFrame(packet));
  }
});
test('valid 65536-entry LAN dictionary map does not inherit Steam node/map limits', () => {
  const number = [0xcb, 63, 241, 0, 0, 0, 0, 0, 0];
  // Duplicate string keys are legal in the existing wire decoder (last wins).
  const body = [0xdf, 0, 1, 0, 0];
  for (let i = 0; i < 65536; i++) body.push(0xa1, 120, ...number);
  const bytes = prefix(body), { restored } = roundtrip(bytes);
  assert.deepEqual(decodeBinaryFrame(restored), decodeBinaryFrame(bytes));
});
