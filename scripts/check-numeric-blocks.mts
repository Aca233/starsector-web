import assert from 'node:assert/strict';import {test} from 'node:test';
import {captureNativeNumericBlock,numericBlockDiagnostics,encodeProjectedBinaryFrame as encode,encodeBinaryFrame as legacy} from 'numeric-block-codec';
import {encodeProjectedBinaryFrame as before,decodeBinaryFrame} from '../src/network/BinarySnapshot.mjs';
import {captureCombat as control} from 'receiver-fields-control';import {captureCombat as candidate,applyCombatSnapshots} from 'receiver-fields-candidate';
import {assets,world} from './lib/native-projectile-fixture.mts';
const frame=(values:any):any=>({tick:1,ships:[],world:{cells:{$typed:'Float32Array',values}}});
const wrapped=(v:Float32Array)=>frame(captureNativeNumericBlock(v)??Array.from(v));
function same(v:Float32Array){const old=frame(Array.from(v)),next=wrapped(v);assert.deepEqual(encode(next,true),before(old,true));assert.deepEqual(encode(next,false),before(old,false));assert.equal(JSON.stringify(next),JSON.stringify(old));return next;}
test('private numeric blocks preserve all Float32 wire widths and JSON values, including negative zero and fallback',()=>{
 for(const a of [[],[0,-0,1,-1,127,128,255,256,65535,65536],[.1,-.1,1e-35,-1e35,1e18],[NaN,Infinity,-Infinity],[Number.MIN_VALUE,Number.MAX_VALUE]])same(new Float32Array(a));
 const v=new Float32Array([1,.5]);const a=captureNativeNumericBlock(v);assert.ok(a);assert.equal(captureNativeNumericBlock(v),a);assert.equal(legacy(frame(a)),null,'legacy encoder must request JSON rather than silently emit an empty map');
});
test('direct array writes, signed zero, buffer views and same-size replacement never yield stale cached values',()=>{
 const base=new Float32Array([.5,1,-0,2,3]),v=base.subarray(1,4);same(v);v[0]=9;same(v);base[2]=0;same(v);v.fill(3);same(v);v.set([5,7,9]);same(v);same(new Float32Array(v));v[2]=NaN;same(v);v[2]=9;same(v);
});
test('output and old captures cannot mutate the authority or cached bytes, including transfer and JSON materialization',()=>{
 const v=new Float32Array([1,2,3]),old=wrapped(v),bytes=encode(old,true)!.slice();v.fill(99);same(v);assert.deepEqual(encode(old,true),bytes);const values=old.world.cells.values;assert.ok(Object.isFrozen(values));const json=values.toJSON();json.fill(77);assert.deepEqual(encode(old,true),bytes);const first=encode(old,true)!;first.fill(5);assert.deepEqual(encode(old,true),bytes);const transferable=encode(old,true)!;structuredClone(transferable,{transfer:[transferable.buffer]});assert.equal(transferable.byteLength,0);assert.deepEqual(encode(old,true),bytes);assert.throws(()=>Object.setPrototypeOf(values,{}));
 const fake=Object.create(Object.getPrototypeOf(values));assert.deepEqual(decodeBinaryFrame(encode(frame(fake),true)!).world.cells.values,{},'a prototype cannot forge private validated bytes');
});
test('custom typed containers/iterators, shared memory and oversized blocks retain the original fallback',()=>{
 class Custom extends Float32Array{};for(const v of [new Custom([1]),new Float64Array([1]),new Uint8Array([1]),new DataView(new ArrayBuffer(4)),new Float32Array(new SharedArrayBuffer(8)),new Float32Array(4097),null])assert.equal(captureNativeNumericBlock(v),null);
 const v=new Float32Array([1,2]);Object.defineProperty(v,Symbol.iterator,{value:function*(){yield 7;yield 8;},configurable:true});assert.equal(captureNativeNumericBlock(v),null);same(v);delete(v as any)[Symbol.iterator];Object.defineProperty(v,'constructor',{value:Float32Array});assert.equal(captureNativeNumericBlock(v),null);same(v);
});
test('maximum depth applies identically to reused arrays, including empty and nonempty terminal containers',()=>{
 for(const size of [0,1])for(const depth of [126,127,128,129,130]){let a:any=Array.from(new Float32Array(size)),b:any=captureNativeNumericBlock(new Float32Array(size));for(let i=0;i<depth;i++){a=[a];b=[b];}let oldError:any,old:any;try{old=before(a,true);}catch(e){oldError=e;}if(oldError)assert.throws(()=>encode(b,true),{message:oldError.message});else assert.deepEqual(encode(b,true),old);}
});
test('cache byte/entry caps reset conservatively and never omit values after eviction',()=>{
 for(let i=0;i<160;i++){const a=new Float32Array(4096);a.fill(i+.123);same(a);const stats=numericBlockDiagnostics();assert.ok(stats.retained<=stats.maxBytes);assert.ok(stats.entries<=stats.maxEntries);}assert.ok(numericBlockDiagnostics().resets>0);same(new Float32Array([11,22,33]));
});
test('22-ship full binary/JSON and reconstructed worlds stay identical through real combat',async()=>{
 await assets();const source=world(),oldViewer=world(),newViewer=world();for(const s of source.allCapitalShips){s.pos.scale(.2);s.prevPos.copy(s.pos);s.fireControlMode='AI';}
 const take=(e:any,t:number,fn=control,native=true)=>fn(e,t,{0:t,1:t},0,true,true,true,native,true);let projectiles=0;
 for(let tick=0;tick<=1200;tick++){if(tick)source.fixedUpdate(1/60);projectiles=Math.max(projectiles,source.projectiles.length);if(tick%30)continue;const random=JSON.stringify([source.random,source.visualRandom]);const old=take(source,tick),next=take(source,tick,candidate);assert.equal(JSON.stringify(next),JSON.stringify(old));const a=before(old,true)!,b=encode(next,true)!;assert.deepEqual(b,a,'complete authority bytes at '+tick);assert.equal(JSON.stringify([source.random,source.visualRandom]),random);applyCombatSnapshots(oldViewer,[decodeBinaryFrame(a)],tick===0,undefined,{nativeTargeting:true,nativeProjection:true});applyCombatSnapshots(newViewer,[decodeBinaryFrame(b)],tick===0,undefined,{nativeTargeting:true,nativeProjection:true});assert.deepEqual(before(take(oldViewer,tick),true),before(take(newViewer,tick),true));}
 assert.ok(projectiles>30);assert.ok(numericBlockDiagnostics().hits>0);assert.deepEqual(take(source,1201,candidate,false),take(source,1201,control,false),'public generic capture remains ordinary mutable projection');
});
