import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encode } from '@msgpack/msgpack';
import { crc32 } from 'node:zlib';
import { createMotionReference, motionSnapshotTick, MOTION_REFERENCE_VERSION } from '../src/network/SnapshotMotionReference.mjs';
import { encodeBinaryState, encodeBinaryFrame, decodeBinaryState } from '../src/network/BinarySnapshot.mjs';
import { createLanBytePatch, encodeLanPacket, LanDeltaReceiver } from '../src/network/LanBinaryDelta.mjs';
import { motionFrame as frame, motionBytes as bytes } from './lib/motion-reference-fixture.mjs';
const vector = (x, y) => ({ $vector: [x, y] });
const clone = value => structuredClone(value);
const expectFallback = value => assert.equal(createMotionReference(bytes(value), 1), null);

test('motion reference is frozen v1 and tick prefix is available without assuming seq equals tick', () => {
  assert.equal(MOTION_REFERENCE_VERSION, 1); assert.equal(motionSnapshotTick(bytes()), 100);
  assert.equal(motionSnapshotTick(bytes(frame(), 999)), 100);
  const f = frame(), moved = { ships: f.ships, ...f }; assert.equal(motionSnapshotTick(bytes(moved)), 100);
  assert.equal(motionSnapshotTick(new Uint8Array()), null);
});
test('Buffer, subarray, DataView and ArrayBuffer inputs remain untouched and outputs own their storage', () => {
  const raw = bytes(), padded = Buffer.concat([Buffer.alloc(19), raw, Buffer.alloc(7)]), sub = padded.subarray(19, -7);
  for (const input of [raw, raw.buffer, Buffer.from(raw), sub, new DataView(sub.buffer, sub.byteOffset, sub.length)]) {
    const before = Uint8Array.from(ArrayBuffer.isView(input) ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength) : new Uint8Array(input));
    const result = createMotionReference(input, 12); assert.ok(result); assert.equal(result.length, raw.length);
    assert.notDeepEqual(result, raw); result.fill(0);
    assert.deepEqual(ArrayBuffer.isView(input) ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength) : new Uint8Array(input), before);
  }
});
test('1/3/12/60 steps preserve exact repeated arithmetic and every non-selected field', () => {
  for (const steps of [1, 3, 12, 60]) {
    const f = frame(), raw = bytes(f), output = decodeBinaryState(createMotionReference(raw, steps)).frame;
    const expected = clone(f), dt = 1 / 60;
    const p = expected.world.fxSystem.values[0][0].values, d = expected.world.fxSystem.values[1].values[0];
    const ft = expected.world.fxSystem.values[2].values[0], glow = expected.world.fxSystem.values[3].values[0];
    const bullet = expected.world.projectiles.values[0], hit = expected.world.projectiles.values[1].values;
    const add = (p, v) => { p.$vector[0] += v.$vector[0] * dt; p.$vector[1] += v.$vector[1] * dt; };
    const scale = (v, factor) => { v.$vector[0] *= factor; v.$vector[1] *= factor; };
    for (let i = 0; i < steps; i++) {
      p[2] -= dt; add(p[0], p[1]); p[5] = Math.max(0, p[2] / p[3]);
      d[5] -= dt; add(d[0], d[1]); scale(d[1], Math.max(0, 1 - dt * .4)); d[2] += d[3] * dt;
      ft[3] -= dt; add(ft[1], ft[2]); scale(ft[2], Math.max(0, 1 - dt * 1.1));
      glow[3] -= dt; add(glow[1], glow[2]);
      bullet[2] = clone(bullet[1]); add(bullet[1], expected.world.projectiles.$projectileColumns[0][2][1]);
      bullet[3] += dt; bullet[4] -= dt; bullet[5] = Math.max(0, bullet[5] - dt); bullet[6] -= 25.125 * dt;
      hit[2] = clone(hit[1]); hit[4] += dt; hit[5] -= dt; hit[6] = Math.max(0, hit[6] - dt); hit[8] -= 30.125 * dt;
    }
    assert.deepEqual(output, expected); assert.deepEqual(decodeBinaryState(raw).frame, f);
  }
});
test('shared column references are never modified by per-row forecasts, including fixed float vectors', () => {
  const f = frame(), raw = bytes(f), output = decodeBinaryState(createMotionReference(raw, 6)).frame;
  assert.deepEqual(output.world.projectiles.$projectileColumns, f.world.projectiles.$projectileColumns);
});
test('integer and float32 encodings keep their width and are not rewritten as float64', () => {
  const f = frame(); f.world.fxSystem.values[0][0].values[0] = vector(10, 20);
  const raw = bytes(f), output = decodeBinaryState(createMotionReference(raw, 3)).frame;
  assert.deepEqual(output.world.fxSystem.values[0][0].values[0], vector(10, 20)); assert.equal(createMotionReference(raw, 3).length, raw.length);
  const float32 = encodeBinaryState('motion-test', 1, Uint8Array.from([83,87,70,50,...encode(frame(),{forceFloat32:true})]));
  assert.ok(float32.includes(0xca)); assert.deepEqual(createMotionReference(float32,3),float32);
});
test('exact byte correction, not prediction, is the decoded state even for divergent/missing/dead particles', () => {
  const before = bytes(), source = frame();
  source.tick = 112; source.world.fxSystem.values[0] = []; source.world.fxSystem.values[1].values.reverse();
  source.world.projectiles.values[0][1] = vector(-54321.234, 777.123); source.ships[0].state.pos = vector(900.5, 555.75);
  source.world.unrelated.life = .0125;
  const after = bytes(source, 2), reference = createMotionReference(before, 12), receiver = new LanDeltaReceiver();
  const base = { bytes: reference, seq: 1, crc: crc32(reference) }, target = { bytes: after, seq: 2, crc: crc32(after) };
  receiver.decode(encodeLanPacket(base, null, null, true));
  const patch = createLanBytePatch(reference, after); assert.ok(patch);
  assert.deepEqual(receiver.decode(encodeLanPacket(target, base, patch, true)), after);
});
test('unsupported protocol, custom rows and unordered/repeated/bad layouts fall back instead of changing their contract', () => {
  assert.equal(createMotionReference(encodeBinaryState('motion-test', 1, encodeBinaryFrame(frame())), 1), null);
  for (const alter of [f => f.layouts[0].push('pos'), f => f.layouts[0][0] = '__proto__',
    f => f.world.fxSystem.values[0][0].values.pop(), f => f.world.fxSystem.$record = -1,
    f => f.world.projectiles.$projectileColumns[0][1] = [7, 3], f => f.world.projectiles.values[0][0] = 555,
    f => f.world.projectiles.values[0].pop(), f => f.world.projectiles.$projectileColumns[0][2].pop(),
    f => f.world.fxSystem.values[0][0].values[0] = { $undefined: 1 }]) { const f = frame(); alter(f); expectFallback(f); }
});
test('out-of-order layout references fall back; no property order rewriting or world simulation', () => {
  const f = frame(); const changed = { tick: f.tick, world: f.world, layouts: f.layouts };
  expectFallback(changed); const output = decodeBinaryState(createMotionReference(bytes(f), 1));
  assert.equal(output.frame.tick, 100); assert.deepEqual(output.frame.acknowledged, f.acknowledged);
});
test('step, packet, depth, collection and layout budgets reject before unbounded work', () => {
  for (const step of [-1, 0, 61, 1.5, NaN, Infinity, '1']) assert.equal(createMotionReference(bytes(), step), null);
  for (const input of [null, {}, 'text', new Uint8Array(2 * 1024 * 1024 + 1)]) assert.equal(createMotionReference(input, 1), null);
  const overRows = frame(); overRows.world.fxSystem.values[0] = Array.from({ length: 8193 }, () => clone(overRows.world.fxSystem.values[0][0])); expectFallback(overRows);
  const overLayouts = frame(); overLayouts.layouts = Array.from({ length: 1025 }, () => []); expectFallback(overLayouts);
  const deep = frame(); let nested = deep; for (let i = 0; i < 100; i++) nested = nested.extra = {}; expectFallback(deep);
});
test('all truncated prefixes, invalid SWB headers and binary/ext tags safely fall back', () => {
  const raw = bytes(); for (let n = 0; n < raw.length; n += Math.max(1, Math.floor(raw.length / 100))) assert.equal(createMotionReference(raw.subarray(0, n), 1), null);
  for (const mutate of [b => b[0] = 0, b => new DataView(b.buffer).setUint32(4, 0xffffffff, true), b => b[8 + new DataView(b.buffer).getUint32(4, true) + 4] = 0xc1]) {
    const copy = raw.slice(); mutate(copy); assert.equal(createMotionReference(copy, 1), null);
  }
});
test('malicious map keys cannot recurse in the scanner; duplicate recognized keys fail closed', () => {
  const wrap = body => encodeBinaryState('motion-test', 1, Uint8Array.from([83, 87, 70, 50, ...body]));
  // map(1) with a map key, then nested maps; would evade depth if keys used a generic reader.
  assert.equal(createMotionReference(wrap([0x81, ...Array(120).fill(0x81), 0xa1, 120, 0xc0]), 1), null);
  const f = frame(), entries = Object.entries(f), chunks = [Uint8Array.of(0x80 | (entries.length + 1))];
  for (const [key, value] of [...entries, ['tick', 100]]) { chunks.push(encode(key), encode(value)); }
  assert.equal(createMotionReference(wrap(Buffer.concat(chunks)), 1), null);
});
test('nonfinite numeric dependencies never write nonfinite bytes, and repeated calls are deterministic', () => {
  const f = frame(); f.world.projectiles.values[0][1] = vector(1.234, 2.345);
  f.world.projectiles.$projectileColumns[0][2][1] = vector(Number.MAX_VALUE, -Number.MAX_VALUE);
  const raw = bytes(f), first = createMotionReference(raw, 60); assert.ok(first); assert.doesNotThrow(() => decodeBinaryState(first));
  assert.deepEqual(createMotionReference(raw, 60), first);
});
