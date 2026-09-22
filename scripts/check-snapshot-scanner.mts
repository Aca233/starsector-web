import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encode } from '@msgpack/msgpack';
import { decodeBinaryFrame, decodeBinaryState, encodeBinaryState } from '../src/network/BinarySnapshot.mjs';
import { decodeBinaryFrame as oldFrame, decodeBinaryState as oldState } from 'scanner-reference/src/network/BinarySnapshot.mjs';
import { createMotionReference, motionSnapshotTick } from '../src/network/SnapshotMotionReference.mjs';
import { createMotionReference as oldReference, motionSnapshotTick as oldTick } from 'scanner-reference/src/network/SnapshotMotionReference.mjs';
import { motionFrame, motionBytes } from './lib/motion-reference-fixture.mjs';
import { FIXED_TAG_BYTES } from '../src/network/BinaryTagWidths.mjs';
const result = (fn, value) => { try { return { value: fn(value) }; } catch (error) { return { error: error.constructor.name, message: error.message }; } };
const framePair = bytes => assert.deepEqual(result(decodeBinaryFrame, bytes), result(oldFrame, bytes));
const statePair = bytes => {
  assert.deepEqual(result(decodeBinaryState, bytes), result(oldState, bytes));
  assert.equal(motionSnapshotTick(bytes), oldTick(bytes));
  for (const steps of [1, 12, 60]) assert.deepEqual(createMotionReference(bytes, steps), oldReference(bytes, steps));
};
let seed = 917; const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
const swf = b => Uint8Array.from([83,87,70,50,...b]);
test('all 256 tag widths, truncated scalar payloads and containers preserve old rejection rules', () => {
  assert.ok(Object.isFrozen(FIXED_TAG_BYTES)); assert.equal(FIXED_TAG_BYTES.length, 256);
  for (let tag = 0; tag < 256; tag++) for (let n = 0; n <= 40; n++) {
    const bytes = Uint8Array.from([tag, ...new Array(n).fill(0)]);
    framePair(bytes); framePair(swf(bytes));
  }
});
test('native fixture references and every truncated prefix remain byte-exact', () => {
  const frame = motionFrame(); frame.ballast = '';
  const raw = motionBytes(frame); statePair(raw);
  for (let end = 0; end < raw.length; end++) statePair(raw.subarray(0, end));
  for (const bytes of [Buffer.from(raw), raw.buffer, new DataView(raw.buffer), Buffer.concat([Buffer.alloc(7),raw]).subarray(7)]) statePair(bytes);
});
test('seeded mutations and random packets have exactly the old results, not just no crash', () => {
  const frame = motionFrame(); frame.ballast = ''; const raw = motionBytes(frame);
  for (let i = 0; i < 2500; i++) {
    const altered = raw.slice(); for (let k = 0; k < 1 + i % 4; k++) altered[random() % altered.length] = random() & 255;
    statePair(altered);
    const length = 1 + random() % 96, bytes = Uint8Array.from({length}, () => random() & 255);
    framePair(bytes); framePair(swf(bytes));
  }
});
test('depth, node, impossible length, unsafe-key, duplicate-key and UTF-8 budgets are unchanged', () => {
  for (const depth of [95,96,97,126,127,128,129]) for (const leaf of [0,[],{}]) {
    let value = leaf; for (let n = 0; n < depth; n++) value = [value];
    framePair(encode(value, {maxDepth: 256}));
  }
  for (const tag of [0xdb,0xdd,0xdf]) framePair(Uint8Array.of(tag,255,255,255,255));
  for (const key of ['__proto__','constructor','prototype']) framePair(encode({[key]: 1}));
  for (const bytes of [[0xa1,0xff],[0x82,0xa1,120,1,0xa1,120,2],[0xd9,3,0xef,0xbb,0xbf]]) framePair(Uint8Array.from(bytes));
  for (const count of [262140,262144,262145]) {
    const f = motionFrame(); f.ballast = ''; f.ships = new Array(count).fill(0);
    // Raw SWF2 shape keeps the oversized ignored subtree in the motion scanner.
    statePair(encodeBinaryState('bounds', 1, swf(encode(f))));
  }
});
test('outputs retain ownership; modifying a restored reference never changes source or later calls', () => {
  const bytes = motionBytes(), before = bytes.slice();
  const reference = createMotionReference(bytes, 12); assert.ok(reference); reference.fill(0);
  assert.deepEqual(bytes, before); assert.deepEqual(createMotionReference(bytes, 12), oldReference(bytes, 12));
});
import { crc32 } from 'node:zlib';
import { lanCrc32 } from '../src/network/LanBinaryDelta.mjs';
import { lanCrc32 as oldCrc32 } from 'scanner-reference/src/network/LanBinaryDelta.mjs';
test('slice-by-8 CRC matches old implementation and zlib, including offset/tail boundaries', () => {
  assert.equal(lanCrc32(Buffer.from('123456789')), 0xcbf43926);
  const source = Uint8Array.from({length:131100}, () => random() & 255);
  for (const offset of [0,1,2,3,7,11]) for (const size of [...Array.from({length:72},(_,i)=>i), 255,256,257,4095,4096,4097,65535,65536,131072]) {
    const bytes = source.subarray(offset, offset + size);
    for (const value of [bytes,new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength)]) {
      assert.equal(lanCrc32(value), oldCrc32(value)); assert.equal(lanCrc32(value), crc32(bytes));
    }
  }
});
