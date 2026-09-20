import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Encoder, Decoder } from '@msgpack/msgpack';
import { encodeProjectedBinaryFrame, decodeBinaryFrame } from '../src/network/BinarySnapshot.mjs';
import { KEY_DICTIONARY } from '../src/network/KeyDictionary.mjs';
import protocol from '../src/network/protocol.json' with { type: 'json' };

const prefix = Uint8Array.of(83, 87, 70, 50);
const framed = bytes => Uint8Array.from([...prefix, ...bytes]);
const reference = bytes => new Decoder({
  mapKeyConverter: key => typeof key === 'number' ? KEY_DICTIONARY[key] : key,
}).decode(bytes.subarray(4));
const outcome = fn => { try { return { value: fn() }; } catch (e) { return { error: e.message, type: e.name }; } };
const compare = make => assert.deepEqual(outcome(() => encodeProjectedBinaryFrame(make(), true)), outcome(() => encodeProjectedBinaryFrame(make())));

test('shared fast arrays preserve library widths, bytes and independently decoded values', () => {
  const scalars = [0, -0, 127, 128, 255, 256, 65535, 65536, 2 ** 32, -32, -33, -128, -129,
    -32768, -32769, -(2 ** 31), -(2 ** 31) - 1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER,
    1 / 3, Number.MIN_VALUE, Number.MAX_VALUE, null, undefined, true, false, '测试', { pos: [1.25, -3.5] }];
  for (const n of [0, 1, 15, 16, 255, 256, 65535, 65536]) {
    const frame = { tick: 7, values: Array.from({ length: n }, (_, i) => scalars[i % scalars.length]) };
    const fast = encodeProjectedBinaryFrame(frame, true);
    assert.deepEqual(fast, encodeProjectedBinaryFrame(frame));
    assert.deepEqual(decodeBinaryFrame(fast), reference(fast));
  }
});

test('seeded mixed array/map projections match conservative bytes and library decoding', () => {
  let seed = 0x517cc1b7;
  const next = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
  const value = depth => {
    const n = next();
    if (depth > 5 || n % 4 === 0) return [null, undefined, true, false, n / 7, -n, '舰船', ''][n % 8];
    if (n % 4 === 1) return { pos: value(depth + 1), vel: value(depth + 1), tick: n };
    return Array.from({ length: n % 7 }, () => value(depth + 1));
  };
  for (let i = 0; i < 600; i++) {
    const frame = { tick: i, values: value(0) }, fast = encodeProjectedBinaryFrame(frame, true);
    assert.deepEqual(fast, encodeProjectedBinaryFrame(frame));
    assert.deepEqual(decodeBinaryFrame(fast), reference(fast));
  }
});

test('iterator side effects, holes, map getters and depth failure order stay unchanged', () => {
  const run = (fast, depth, yields) => {
    const seen = [], leaf = [];
    leaf[Symbol.iterator] = function* () { try { for (const v of yields) { seen.push('next'); yield v; } } finally { seen.push('close'); } };
    let frame = leaf; for (let i = 0; i < depth; i++) frame = [frame];
    return { result: outcome(() => encodeProjectedBinaryFrame(frame, fast)), seen };
  };
  for (const depth of [127, 128, 129]) for (const values of [[], [0], [null], [undefined], ['x'], [NaN], [[]]]) {
    assert.deepEqual(run(true, depth, values), run(false, depth, values));
  }
  compare(() => {
    const a = Array(3); Object.defineProperty(a, 0, { get() { a[1] = 9; a.push(12); return .25; } }); return { a };
  });
  compare(() => {
    const a = [1, 2, 3]; Object.defineProperty(a, 0, { get() { a.length = 1; return 4; } }); return { a };
  });
  compare(() => new Proxy([], { get(target, key, receiver) { return key === 'length' ? 2 ** 32 : Reflect.get(target, key, receiver); } }));
  for (const fast of [false, true]) {
    let reads = 0; const frame = { get values() { reads++; return [reads, 2.5]; } };
    assert.deepEqual(decodeBinaryFrame(encodeProjectedBinaryFrame(frame, fast)), { values: [2, 2.5] }); assert.equal(reads, 2);
  }
});

test('fast scalar arrays retain JSON fallback, owned output and byte-budget recovery', () => {
  for (const bad of [NaN, Infinity, -Infinity, 1n, Symbol(), () => 0, new Date(), new Uint8Array(2), '\ud800']) {
    assert.equal(encodeProjectedBinaryFrame({ a: [0, bad] }, true), null);
  }
  const a = encodeProjectedBinaryFrame({ a: [0.25, null] }, true), copy = a.slice();
  assert.throws(() => encodeProjectedBinaryFrame({ a: Array(Math.ceil(protocol.maxSnapshotBytes / 9) + 1).fill(.25) }, true), /exceeds budget/);
  assert.deepEqual(encodeProjectedBinaryFrame({ a: [0.25, null] }, true), copy); assert.deepEqual(a, copy);
});

test('array reader preserves every numeric tag including float NaN, infinities and negative zero', () => {
  const tags = [0, 127, 224, 255, 0xc0, 0xc2, 0xc3, 0xcc, 0xcd, 0xce, 0xcf, 0xd0, 0xd1, 0xd2, 0xd3, 0xca, 0xcb];
  const widths = { 0xcc: 1, 0xcd: 2, 0xce: 4, 0xcf: 8, 0xd0: 1, 0xd1: 2, 0xd2: 4, 0xd3: 8, 0xca: 4, 0xcb: 8 };
  for (const tag of tags) for (const fill of [0, 0x7f, 0x80, 0xff]) {
    const packet = framed([0x91, tag, ...Array(widths[tag] ?? 0).fill(fill)]);
    assert.deepEqual(decodeBinaryFrame(packet), reference(packet));
  }
  for (const n of [-0, NaN, Infinity, -Infinity, Number.MIN_VALUE]) {
    const bytes = new Uint8Array(10); bytes[0] = 0x91; bytes[1] = 0xcb; new DataView(bytes.buffer).setFloat64(2, n);
    const result = decodeBinaryFrame(framed(bytes)); assert.ok(Object.is(result[0], n));
  }
});

test('array fast decoding keeps preflight bounds, unsupported-tag, depth and safe-key guards', () => {
  const valid = encodeProjectedBinaryFrame({ pos: [1.25, null, 32768, { vel: [-1.5] }] }, true);
  // A single 'S' is also a valid legacy unprefixed positive-fixint frame.
  assert.equal(decodeBinaryFrame(valid.subarray(0, 1)), 83);
  assert.throws(() => decodeBinaryFrame(valid.subarray(0, 0)));
  for (let i = 2; i < valid.length; i++) assert.throws(() => decodeBinaryFrame(valid.subarray(0, i)));
  for (const payload of [[0xdd, 0xff, 0xff, 0xff, 0xff], [0x91, 0xc1], [0x91, 0xc4, 0], [0x91, 0xd4, 0, 0], [0x90, 0], [...Array(129).fill(0x91), 0]]) {
    assert.throws(() => decodeBinaryFrame(framed(payload)));
  }
  const library = new Encoder();
  for (const key of ['__proto__', 'prototype', 'constructor']) {
    const value = JSON.parse('{"' + key + '":1}');
    assert.throws(() => decodeBinaryFrame(framed(library.encode([value]))), /Invalid binary snapshot key/);
  }
  assert.throws(() => decodeBinaryFrame(framed([0x91, 0x81, 0xcd, 0xff, 0xff, 0])), /Invalid binary snapshot key/);
  // A malformed short string must still use the pinned decoder's legacy UTF-8 fallback.
  const malformed = framed([0x93, 1, 0xa1, 0xff, 2]);
  assert.deepEqual(decodeBinaryFrame(malformed), reference(malformed));
});
