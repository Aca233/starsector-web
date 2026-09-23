import fs from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encode } from '@msgpack/msgpack';
import { decodeBinaryFrame, decodeBinaryState, encodeBinaryState } from 'onepass-candidate';
import { decodeBinaryFrame as oldFrame, decodeBinaryState as oldState } from 'onepass-control';
import { createMotionReference, motionSnapshotTick } from '../src/network/SnapshotMotionReference.mjs';
import { createMotionReference as oldReference, motionSnapshotTick as oldTick } from 'scanner-reference/src/network/SnapshotMotionReference.mjs';
import { motionFrame, motionBytes } from './lib/motion-reference-fixture.mjs';
import { FIXED_TAG_BYTES } from '../src/network/BinaryTagWidths.mjs';
const result = (fn, value) => { try { return { value: fn(value) }; } catch (error) { return { error: error.constructor.name, message: error.message }; } };
const framePair = bytes => assert.deepEqual(result(decodeBinaryFrame, bytes), result(oldFrame, bytes), `packet=${Buffer.from(bytes).toString('hex')}`);
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

import {directOnePass,encodeProjectedBinaryFrame} from 'onepass-candidate';
import {assets,world} from './lib/native-projectile-fixture.mts';
import {captureCombat} from '../src/network/AuthorityCombatSnapshot';
await assets();
test('ordinary native frames succeed directly without the compatibility fallback',()=>{
 const engine=world();for(const ship of engine.allCapitalShips){ship.pos.scale(.2);ship.prevPos.copy(ship.pos);ship.fireControlMode='AI';}
 for(let i=0;i<120;i++)engine.fixedUpdate(1/60);
 for(let tick=1;tick<=120;tick++){engine.fixedUpdate(1/60);const frame=captureCombat(engine,tick,{0:tick,1:tick},0,true,true,true,true,true);const bytes=encodeProjectedBinaryFrame(frame,true);assert.ok(bytes);assert.deepEqual(directOnePass(bytes),oldFrame(bytes));}
});
test('direct parser bounds, numeric edges, strings, duplicate keys and ownership',()=>{
 for(const value of [null,true,false,0,-0,NaN,Infinity,-Infinity,Number.MIN_VALUE,Number.MAX_VALUE,Number.MAX_SAFE_INTEGER,{},[],[1,2,3],Array(3000).fill(3),{v:'中文🙂'},'a'.repeat(1000),{empty:[],nested:{a:1}},Object.fromEntries(Array.from({length:2000},(_,i)=>['k'+i,i]))]) {
  const bytes=encode(value);assert.deepEqual(directOnePass(bytes),oldFrame(bytes));
  const buffer=Buffer.concat([Buffer.alloc(7),bytes,Buffer.alloc(4)]).subarray(7,7+bytes.length);assert.deepEqual(directOnePass(buffer),oldFrame(bytes));
 }
 for(let i=0;i<1000;i++){const value=Array.from({length:1+i%100},()=>({n:(random()|0)/3,s:String(random()),v:[random()|0,random()/3],a:random()%2===0}));const bytes=encode(value);assert.deepEqual(directOnePass(bytes),oldFrame(bytes));}
 for(const depth of [126,127,128,129]){let v=0;for(let i=0;i<depth;i++)v=[v];const b=encode(v,{maxDepth:256});const old=result(oldFrame,b);if(old.error)assert.throws(()=>directOnePass(b));else assert.deepEqual(directOnePass(b),old.value);}
 for(const bytes of [Uint8Array.of(0xdd,255,255,255,255),Uint8Array.of(0xdf,0,1,0,1),Uint8Array.of(0x92,1),Uint8Array.of(0xcb,0),Uint8Array.of(0x91,0xc4,0),encode({['__proto__']:1})])assert.throws(()=>directOnePass(bytes));
 const duplicate=Uint8Array.of(0x82,0xa1,120,1,0xa1,120,2);assert.deepEqual(directOnePass(duplicate),{x:2});
 const b=encode({a:[1,2],s:'test'}),before=b.slice(),a=directOnePass(b);a.a[0]=99;b.fill(0);assert.deepEqual(directOnePass(before),{a:[1,2],s:'test'});
});

test('SWF2 hot marker paths retain depth, truncation, mutations and key semantics',()=>{
 for(const value of [{$undefined:1},{$undefined:2},{$vector:[1.25,-2.5]},{$vector:[Infinity,0]},{$record:1,values:[1,2]},{$record:1,values:null},{values:[1],$record:1},{$vector:[1,2],extra:3}]){
  const bytes=encodeProjectedBinaryFrame(value,true);if(!bytes)continue;
  framePair(bytes);assert.deepEqual(directOnePass(bytes),oldFrame(bytes));
  for(let n=0;n<bytes.length;n++)framePair(bytes.subarray(0,n));
  for(let i=0;i<300;i++){const changed=bytes.slice();changed[random()%changed.length]=random()&255;framePair(changed);}
  for(const depth of [124,125,126,127]){const b=Uint8Array.from([83,87,70,50,...Array(depth).fill(0x91),...bytes.subarray(4)]);framePair(b);}
 }
});
