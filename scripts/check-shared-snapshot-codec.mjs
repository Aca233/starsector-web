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

// SWF3 is a deliberate protocol extension, not permission for arbitrary blobs.
import { PackedSnapshotNumbers } from '../src/network/PackedSnapshotNumbers.mjs';
import { encodeBinaryFrame, encodeBinaryState, decodeBinaryStateForRelay, ProjectionEncodingCache } from '../src/network/BinarySnapshot.mjs';
import { SnapshotTapeWriter, readSnapshotTape } from '../src/network/SnapshotTape.mjs';
const jsonShape = value => JSON.parse(JSON.stringify(value));
const numericFrame = numbers => ({tick:1,ships:[{id:'s',state:{teamId:0,armor:{$typed:numbers.type,values:numbers}}}],crafts:[],craftSpecs:[],world:{}});
test('packed native numbers preserve all widths, subviews, JSON/tape fallback and byte ownership', () => {
  for (const Type of [Float32Array,Float64Array,Uint8Array,Uint8ClampedArray,Uint16Array,Uint32Array,Int8Array,Int16Array,Int32Array]) {
    for (const length of [0,1,17,17000]) {
      const native = new Type(length + 2);
      for (let i=0;i<native.length;i++) native[i]=i%2 ? -(i+1)/7 : (i+1)*13.25;
      const values=PackedSnapshotNumbers.capture(native.subarray(1,length+1)), frame=numericFrame(values), expected=jsonShape(frame);
      const bytes=encodeProjectedBinaryFrame(frame,true); assert.equal(bytes[3],51);
      assert.deepEqual(bytes,encodeProjectedBinaryFrame(frame,false));
      assert.equal(encodeBinaryFrame(frame),null,'generic entry retains JSON fallback');
      const decoded=decodeBinaryFrame(bytes);
      assert.deepEqual(jsonShape(decoded),expected);
      assert.deepEqual(jsonShape(readSnapshotTape(new SnapshotTapeWriter().encode(frame))),expected);
      native.fill(0); bytes.fill(0); assert.deepEqual(jsonShape(frame),expected); assert.deepEqual(jsonShape(decoded),expected);
      assert.equal(encodeProjectedBinaryFrame(new Type(2)),null,'unmarked raw views remain unsupported');
    }
  }
  for(const Type of [Float32Array,Float64Array]){
    assert.equal(PackedSnapshotNumbers.capture(new Type([NaN])),null);
    assert.equal(PackedSnapshotNumbers.capture(new Type([Infinity])),null);
    assert.equal(Object.is(PackedSnapshotNumbers.capture(new Type([-0])).numbers[0],-0),false);
  }
});
test('packed fragments retain their wire revision on reuse and relay skips only validated blocks',()=>{
  const frame=numericFrame(PackedSnapshotNumbers.capture(new Float32Array([.25,1024.5])));
  const cache=new ProjectionEncodingCache(frame), first=encodeProjectedBinaryFrame(frame,true,cache);
  const second=encodeProjectedBinaryFrame({...frame,sounds:[]},true,cache); assert.ok(cache.hits>0); assert.equal(second[3],51);
  assert.deepEqual(jsonShape(decodeBinaryFrame(second)),jsonShape({...frame,sounds:[]}));
  const relay=decodeBinaryStateForRelay(encodeBinaryState('packed',1,first));
  assert.deepEqual(relay.frame.ships,[{id:'s',state:{teamId:0}}]);
  const downgraded=first.slice();downgraded[3]=50;assert.throws(()=>decodeBinaryFrame(downgraded),/Unsupported/);
});
test('all decode paths reject malformed numeric blocks, including skipped relay fields',()=>{
  const payload=PackedSnapshotNumbers.capture(new Float64Array([1.25])).bytes;
  const wrap=block=>Buffer.concat([Buffer.from('SWF3'),new Encoder().encode({world:{ignored:block}})]);
  const invalid=[];
  const type=payload.slice();type[0]=255;invalid.push(type);
  const reserved=payload.slice();reserved[1]=1;invalid.push(reserved);
  const nan=payload.slice();new DataView(nan.buffer).setFloat64(8,NaN,true);invalid.push(nan);
  invalid.push(payload.slice(0,-1),payload.slice(0,7),new Uint8Array());
  for(const data of invalid){const bytes=wrap(data);assert.throws(()=>decodeBinaryFrame(bytes));assert.throws(()=>decodeBinaryStateForRelay(encodeBinaryState('bad',1,bytes)));}
  for(const bytes of [Buffer.from([83,87,70,51,0xc6,255,255,255,255]),wrap(payload).subarray(0,-1)]){
    assert.throws(()=>decodeBinaryFrame(bytes));assert.throws(()=>decodeBinaryStateForRelay(encodeBinaryState('bad',1,bytes)));
  }
  // Short invalid UTF8 takes the pinned decoder's fallback, still restoring blocks.
  const malformed=Buffer.concat([Buffer.from('SWF3'),Buffer.from([0x82,0xa1,0xff,0xc0]),new Encoder().encode('values'),new Encoder().encode(payload)]);
  assert.ok(decodeBinaryFrame(malformed).values instanceof PackedSnapshotNumbers);
});

import {readPackedNumbers,packedNumberCacheStats} from '../src/network/PackedSnapshotNumbers.mjs';
test('component numeric cache is immutable, bounded and validates hash collisions',()=>{
 const values=new Float32Array(64).fill(.25),raw=PackedSnapshotNumbers.capture(values).bytes;
 const first=readPackedNumbers(raw),second=readPackedNumbers(raw.slice());assert.equal(second,first);
 const original=first.toJSON();first.numbers.fill(0);first.bytes.fill(0);raw.fill(0);
 assert.deepEqual(first.toJSON(),original,'inspectors never expose retained storage');
 const copied=new Float32Array(64),wireCopy=new Uint8Array(first.byteLength);
 copied.set=wireCopy.set=()=>assert.fail('overridden copy target must not receive private storage');
 first.copyNumbersTo(copied);first.copyBytesTo(wireCopy,0);
 assert.deepEqual(Array.from(copied),original);assert.deepEqual(Array.from(wireCopy),Array.from(first.bytes));
 assert.throws(()=>first.copyNumbersTo({set:()=>assert.fail('untrusted target')}),TypeError);
 assert.throws(()=>first.copyBytesTo({set:()=>assert.fail('untrusted target')},0),TypeError);
 const valid=first.bytes,bad=valid.slice();new DataView(bad.buffer).setFloat32(16,NaN,true);
 assert.throws(()=>readPackedNumbers(bad),/Invalid/,'same sparse hash is not trusted');
 assert.equal(readPackedNumbers(valid),first,'failed validation cannot poison a valid cache entry');
 const frame=numericFrame(first),a=decodeBinaryFrame(encodeProjectedBinaryFrame(frame,true)),b=decodeBinaryFrame(encodeProjectedBinaryFrame(frame,true));
 assert.equal(a.ships[0].state.armor.values,b.ships[0].state.armor.values);
 for(let i=0;i<180;i++)readPackedNumbers(PackedSnapshotNumbers.capture(new Uint8Array(40000+i).fill(i)).bytes);
 const stats=packedNumberCacheStats();assert.ok(stats.entries<=128&&stats.bytes<=4*1024*1024);assert.ok(stats.hits>0);
 assert.deepEqual(first.toJSON(),original,'eviction does not alter live frames');
});
// Optional exact pre-change codec, sharing the native numeric block class and
// dependency instances. With no baseline, explicit rejection/trace checks remain.
import fs from 'node:fs';
const codecUrl=new URL('../src/network/BinarySnapshot.mjs',import.meta.url);
const boundedControlUrl=process.env.BOUNDED_SNAPSHOT_BASELINE
 ? 'data:text/javascript;base64,'+Buffer.from(fs.readFileSync(process.env.BOUNDED_SNAPSHOT_BASELINE,'utf8')).toString('base64') : null;
const loadTestCodec=(source,bounded=null)=>import('data:text/javascript;base64,'+Buffer.from(source.replace(/from (['"])([^'"]+)\1/g,(_all,_quote,spec)=>'from '+JSON.stringify(bounded&&spec==='./BoundedSnapshotReader.mjs'?bounded:spec.startsWith('.')?new URL(spec,codecUrl).href:import.meta.resolve(spec)))+'\nexport { BoundedSnapshotReader };').toString('base64'));
const readerCodec=await loadTestCodec(fs.readFileSync(codecUrl,'utf8'));
const codecControl=process.env.BINARY_SNAPSHOT_BASELINE||boundedControlUrl
 ? await loadTestCodec(fs.readFileSync(process.env.BINARY_SNAPSHOT_BASELINE??codecUrl,'utf8'),boundedControlUrl)
 : readerCodec;

test('map and record scalars retain frozen codec bytes, depth and complete live read order',()=>{
 const values=[undefined,null,true,false,'','汉字😀','\uFEFFtext','x'.repeat(129),'x'.repeat(65536),0,-0,127,128,65535,65536,2**32,Number.MAX_SAFE_INTEGER,-(2**32),Number.MIN_VALUE,Number.MAX_VALUE,.5,NaN,Infinity,-Infinity,'\ud800',2n,Symbol('x'),()=>1,new Date(),new Uint16Array(3)];
 const wrap=(value,depth)=>{for(let i=0;i<depth;i++)value=i%2?{value}:[value];return value;};
 for(const fast of [false,true])for(const value of values)for(const depth of [0,1,2,126,127,128]){
  assert.deepEqual(outcome(()=>encodeProjectedBinaryFrame(wrap(value,depth),fast)),outcome(()=>codecControl.encodeProjectedBinaryFrame(wrap(value,depth),fast)),String(depth)+' '+String(value));
 }
 const run=(encode,fast,depth,late)=>{
  const trace=[];let reads=0;
  const leaf={get value(){trace.push('value'+(++reads));if(reads===2)leaf.tail='changed';return reads===1?1:late;},tail:'old'};
  const proxy=new Proxy(leaf,{ownKeys(target){trace.push('keys');return Reflect.ownKeys(target);},getOwnPropertyDescriptor(target,key){trace.push('descriptor:'+key);return Reflect.getOwnPropertyDescriptor(target,key);},get(target,key,receiver){trace.push('read:'+String(key));return Reflect.get(target,key,receiver);}});
  return {result:outcome(()=>encode(wrap(proxy,depth),fast)),trace,reads};
 };
 for(const fast of [false,true])for(const depth of [0,125,126,127,128])for(const late of [undefined,null,true,'abc',NaN,'\ud800',{nested:1}]){
  const expected=run(codecControl.encodeProjectedBinaryFrame,fast,depth,late),actual=run(encodeProjectedBinaryFrame,fast,depth,late);
  assert.deepEqual(actual,expected);if(depth<127)assert.equal(actual.reads,2);
 }
 for(const key of ['__proto__','prototype','constructor']){
  let reads=0;const bad=Object.defineProperty({},key,{enumerable:true,get(){reads++;return 1;}});
  assert.equal(encodeProjectedBinaryFrame(bad,true),null);assert.equal(reads,0);
 }
});

test('scalar dispatch preserves reentrant encoding and output ownership',()=>{
 const run=encode=>{
  let calls=0;const nested=[];
  const frame={get value(){calls++;nested.push(outcome(()=>encode({inside:[true,'nested',1.25]},true)));return calls===1?false:'outer';}};
  return {result:outcome(()=>encode(frame,true)),nested,calls};
 };
 assert.deepEqual(run(encodeProjectedBinaryFrame),run(codecControl.encodeProjectedBinaryFrame));
 const frame={values:[true,false,null,undefined,'scalar',1.25],world:{positive:4294967296,negative:-4294967296}};
 const packet=encodeProjectedBinaryFrame(frame,true),copy=packet.slice(),transferred=structuredClone(packet,{transfer:[packet.buffer]});
 assert.equal(packet.byteLength,0);assert.deepEqual(transferred,copy);
 assert.deepEqual(encodeProjectedBinaryFrame(frame,true),codecControl.encodeProjectedBinaryFrame(frame,true));
 assert.equal(encodeProjectedBinaryFrame({values:[NaN]},true),null);assert.deepEqual(encodeProjectedBinaryFrame(frame,true),copy);
});

import {encodeProjectedSnapshotTape,replaceProjectedTapeSounds} from '../src/network/BinarySnapshot.mjs';
test('scalar dispatch retains sound splice root depth, byte identity and fallback',()=>{
 const frame={tick:1,world:{x:1},sounds:[]},writer=new SnapshotTapeWriter();
 const before=codecControl.encodeProjectedSnapshotTape(writer.encode(frame)),after=encodeProjectedSnapshotTape(writer.encode(frame));
 for(const sounds of [[],[true,false,'a'],[{id:1,key:'fire',volume:.5,pos:[1,2]}],['\ud800'],[NaN]])assert.deepEqual(outcome(()=>replaceProjectedTapeSounds(after,sounds)),outcome(()=>codecControl.replaceProjectedTapeSounds(before,sounds)));
 for(const leaf of [true,'limit',NaN])for(const depth of [125,126,127,128]){
  let sounds=leaf;for(let i=0;i<depth;i++)sounds=[sounds];
  assert.deepEqual(outcome(()=>replaceProjectedTapeSounds(after,sounds)),outcome(()=>codecControl.replaceProjectedTapeSounds(before,sounds)));
 }
});

// Exercise the actual bounded reader as well as decodeBinaryFrame: the public
// legacy retry must not hide a broken fast path by silently accepting the frame.
const readBounded=(codec,packet,dictionary=true)=>new codec.BoundedSnapshotReader(packet,dictionary,false).complete();
const mapBytes=pairs=>{
 const header=pairs.length<16?Buffer.from([0x80+pairs.length]):Buffer.from([0xde,pairs.length>>8,pairs.length&255]);
 const encoder=new Encoder();return Buffer.concat([header,...pairs.flatMap(([key,value])=>[encoder.encode(key),encoder.encode(value)])]);
};

test('complete map shapes preserve thresholds, data descriptors, duplicates and key order',()=>{
 for(const size of [0,1,15,16,17,20,31,32,128,255,256,257,1024]){
  const pairs=Array.from({length:size},(_,i)=>['field'+i,i%4?i:{nested:[i,'舰船😀',null]}]);
  if(size>16){pairs[1]=['27','index'];pairs[3]=['2','early'];pairs[5]=['4294967295','not-index'];pairs[8]=['field0','last-value'];pairs[12]=['toString','data'];}
  const expected=Object.fromEntries(pairs),packet=mapBytes(pairs);
  for(const dictionary of [true,false]){
   const current=readBounded(readerCodec,packet,dictionary),before=readBounded(codecControl,packet,dictionary);
   assert.deepEqual(current,expected);assert.deepEqual(current,before);assert.deepEqual(Object.keys(current),Object.keys(expected));
   assert.equal(Object.getPrototypeOf(current),Object.prototype);assert.deepEqual(Object.getOwnPropertyDescriptors(current),Object.getOwnPropertyDescriptors(before));
  }
  // Without a prototype-name field, the whole medium map uses shaped creation.
  if(size>16){pairs[12]=['normal12',-0];const bytes=mapBytes(pairs);assert.deepEqual(readBounded(readerCodec,bytes),readBounded(codecControl,bytes));}
 }
 const dictPairs=Array.from({length:128},(_,i)=>[i,i===0?'value':i]);
 const dict=mapBytes(dictPairs),expected=Object.fromEntries(dictPairs.map(([key,value])=>[KEY_DICTIONARY[key],value]));
 assert.deepEqual(readBounded(readerCodec,dict),expected);assert.deepEqual(readBounded(readerCodec,dict),readBounded(codecControl,dict));
});

test('complete map shapes retain malformed, depth and slot limits without legacy masking',()=>{
 const pairs=Array.from({length:20},(_,i)=>['field'+i,{x:i,words:'测试'}]),valid=mapBytes(pairs);
 for(let end=0;end<valid.length;end++){
  const packet=valid.subarray(0,end);assert.throws(()=>readBounded(readerCodec,packet));
  assert.deepEqual(outcome(()=>readBounded(readerCodec,packet)),outcome(()=>readBounded(codecControl,packet)));
  assert.deepEqual(outcome(()=>decodeBinaryFrame(framed(packet))),outcome(()=>codecControl.decodeBinaryFrame(framed(packet))));
 }
 for(const key of ['__proto__','constructor','prototype',null,true,[],{},128,-1]){
  const packet=mapBytes([...pairs,[key,0]]);assert.throws(()=>readBounded(readerCodec,packet));
  assert.deepEqual(outcome(()=>readBounded(readerCodec,packet)),outcome(()=>readBounded(codecControl,packet)));
 }
 for(const packet of [Buffer.from([0xdf,0,1,0,1]),Buffer.from([0xde,255,255]),Buffer.concat([valid,Buffer.from([0])])]){
  assert.throws(()=>readBounded(readerCodec,packet));assert.deepEqual(outcome(()=>readBounded(readerCodec,packet)),outcome(()=>readBounded(codecControl,packet)));
 }
 for(const depth of [124,125,126,127,128]){
  const packet=Buffer.concat([Buffer.alloc(depth,0x91),valid]);
  assert.deepEqual(outcome(()=>readBounded(readerCodec,packet)),outcome(()=>readBounded(codecControl,packet)));
 }
 // Preserve malformed-short-UTF8 legacy recovery, including a large parent map.
 const malformed=Buffer.concat([Buffer.from([0xde,0,21]),valid.subarray(3),Buffer.from([0xa1,0xff,0])]);
 assert.deepEqual(outcome(()=>decodeBinaryFrame(framed(malformed))),outcome(()=>codecControl.decodeBinaryFrame(framed(malformed))));
});

test('complete map shapes preserve inherited assignment and nested prototype mutation order',()=>{
 const trigger='__shapeTestTrigger',late='__shapeTestLate',readOnly='__shapeTestReadOnly';
 const run=decode=>{
  const trace=[];
  try{
   Object.defineProperty(Object.prototype,trigger,{configurable:true,set(value){
    trace.push({kind:'trigger',value,keys:Object.keys(this)});
    Object.defineProperty(this,'triggerResult',{value,writable:true,enumerable:true,configurable:true});
    Object.defineProperty(Object.prototype,late,{configurable:true,set(value){
     trace.push({kind:'late',value,keys:Object.keys(this)});
     Object.defineProperty(this,late,{value,writable:true,enumerable:true,configurable:true});
    }});
   }});
   const pairs=Array.from({length:20},(_,i)=>['field'+i,i]);
   pairs[7]=[late,{[trigger]:3}];pairs[9]=[trigger,7];pairs[11]=[late,8];
   const result=decode(mapBytes(pairs));
   Object.defineProperty(Object.prototype,readOnly,{configurable:true,value:12,writable:false});
   const failed=outcome(()=>decode(mapBytes([...pairs,[readOnly,9]])));
   return{result,trace,failed};
  }finally{delete Object.prototype[trigger];delete Object.prototype[late];delete Object.prototype[readOnly];}
 };
 const current=run(packet=>readBounded(readerCodec,packet)),before=run(packet=>readBounded(codecControl,packet));
 assert.deepEqual(current,before);assert.equal(current.trace[0].kind,'trigger');
 assert.deepEqual(current.trace[1].keys,Array.from({length:7},(_,i)=>'field'+i));assert.equal(current.trace[1].kind,'late');
 assert.equal(current.failed.type,'TypeError');assert.equal(current.result.triggerResult,7);assert.equal(current.result[late],8);
 // This also checks the established retry/error-precedence path with side effects.
 assert.deepEqual(run(packet=>decodeBinaryFrame(framed(packet))),run(packet=>codecControl.decodeBinaryFrame(framed(packet))));
});

test('complete map shapes keep independent frame and transferred-buffer ownership',()=>{
 const frame=Object.fromEntries(Array.from({length:80},(_,i)=>['field'+i,{value:i,trail:[1,2,3]}]));
 const packet=encodeProjectedBinaryFrame(frame,true),a=decodeBinaryFrame(packet),b=decodeBinaryFrame(packet);
 a.field20.value=999;a.field21.trail.push(4);assert.deepEqual(b,frame);
 const transferred=structuredClone(packet,{transfer:[packet.buffer]});assert.equal(packet.byteLength,0);
 assert.deepEqual(decodeBinaryFrame(transferred),frame);transferred.fill(0);assert.deepEqual(b,frame);
 const next=decodeBinaryFrame(encodeProjectedBinaryFrame(frame,true));assert.deepEqual(next,frame);
 assert.notEqual(next.field0,b.field0);assert.notEqual(next.field0.trail,b.field0.trail);
});
