// Rejected Phase46 experiment: the final fallback-side-effect regression is intentionally failing.
// Not part of the production network check suite; see the phase46 report before attempting adoption.
import assert from 'node:assert/strict';import {test} from 'node:test';
import {captureCombat as oldCapture,applyCombatSnapshots} from 'receiver-fields-control';
import {captureCombat as newCapture,fusedCaptureDiagnostics} from 'receiver-fields-candidate';
import {encodeProjectedBinaryFrame as oldEncode,decodeBinaryFrame} from '../src/network/BinarySnapshot.mjs';
import {encodeProjectedBinaryFrame as newEncode,encodeBinaryFrame as legacyEncode,captureProjectionFragment,captureFragmentStats} from 'capture-sink-codec';
import {normalizedProjection} from './lib/damage-view-oracle.mts';
import {assets,world} from './lib/native-projectile-fixture.mts';
import {Vector2} from '../src/engine/math/Vector2';
await assets();
const take=(e:any,t=1,fn:any=oldCapture,native=true,fused=true)=>fn(e,t,{0:t,1:t},0,true,true,true,native,true,fused);
const bytes=(e:any,t=1,arm='control',native=true,fused=true)=>(arm==='control'?oldEncode:newEncode)(take(e,t,arm==='control'?oldCapture:newCapture,native,fused),true)!;
const canonical=(b:any)=>normalizedProjection(decodeBinaryFrame(b));
function same(e:any){assert.deepEqual(canonical(bytes(e,1,'candidate')),canonical(bytes(e)));}
test('complete P1 values, not a reduced view; default/non-native callers remain byte-identical',()=>{
 const e=world(2);same(e);assert.ok(captureFragmentStats(take(e,1,newCapture).ships[0].state));
 for(const native of [true,false])assert.deepEqual(bytes(e,1,'candidate',native,false),bytes(e,1,'control',native,false));
 assert.deepEqual(bytes(e,1,'candidate',false,true),bytes(e,1,'control',false,true));
 assert.throws(()=>JSON.stringify(take(e,1,newCapture)),/Opaque/);assert.equal(legacyEncode(take(e,1,newCapture)),null);
 assert.deepEqual(newEncode(take(e,1,newCapture),false),newEncode(take(e,1,newCapture),true));
});
test('all fields: tags, numbers, shape/function transitions, references/cycles, sparse/mixed/custom arrays',()=>{
 const e=world(2),s:any=e.allCapitalShips[0];
 const rows=()=>Array.from({length:4},(_,i)=>({a:i,b:-i,c:NaN,d:new Vector2(i,2),e:'姿态',f:false,g:[-Infinity,Infinity]}));
 s.fusedProbe={rows:rows(),data:new Float32Array([1,2,3]),set:new Set([1,2]),map:new Map([['ship',s]]),ref:s,undefined:undefined,numbers:[-0,Number.MIN_VALUE,Number.MAX_VALUE,-Number.MAX_VALUE,2**32,Number.MAX_SAFE_INTEGER],long:'x'.repeat(200),astral:'🚀'};
 same(e);
 s.fusedProbe.data[0]=NaN;assert.equal(bytes(e),null);assert.equal(bytes(e,1,'candidate'),null);assert.deepEqual(take(e,1,newCapture),take(e));s.fusedProbe.data[0]=1;
 s.fusedProbe.rows[1].fn=()=>3;s.fusedProbe.rows[2].a=()=>4;s.fusedProbe.rows[3]={...s.fusedProbe.rows[3],z:8};same(e);
 const cycle:any={x:1};cycle.self=cycle;s.fusedProbe={cycle,same:cycle};same(e);
 const sparse:any[]=new Array(7);sparse[2]={a:1,b:2,c:3,d:4,e:5,f:6};sparse[5]=s;s.fusedProbe=sparse;same(e);
 class CustomArray extends Array{};const custom=new CustomArray(...rows());s.fusedProbe=custom;same(e);
 const mapped:any=rows();mapped.map=function(fn:any){return [fn(this[1]),fn(this[0])];};s.fusedProbe=mapped;same(e);
 s.fusedProbe=rows();s.fusedProbe[3].back=s.fusedProbe;same(e);
});
test('unsupported encoding atomically recaptures the ordinary graph; exceptions leave the sink reusable',()=>{
 const e=world(2),s:any=e.allCapitalShips[0];s.extra='\ud800';
 assert.equal(oldEncode(take(e),true),null);assert.equal(newEncode(take(e,1,newCapture),true),null);
 assert.equal(captureFragmentStats(take(e,1,newCapture).ships[0].state),null);
 assert.deepEqual(take(e,1,newCapture),take(e));delete s.extra;same(e);
 assert.throws(()=>captureProjectionFragment((w:any)=>{w.array(1);throw Error('sentinel');}),/sentinel/);same(e);
 assert.throws(()=>captureProjectionFragment(()=>captureProjectionFragment((w:any)=>w.value(null))),/Reentrant/);same(e);
});
test('owned fragment/output lifetime, late metadata, and depth bounds match the original whole encoding',()=>{
 const e=world(2),frame=take(e,1,newCapture),before=newEncode(frame,true);const transferred=structuredClone(before,{transfer:[before.buffer]});assert.equal(before.byteLength,0);
 for(let i=2;i<30;i++){e.allCapitalShips[0].pos.x++;bytes(e,i,'candidate');}
 assert.deepEqual(newEncode(frame,true),transferred);frame.sounds=[{id:1,foo:'mutable-late'}];assert.notDeepEqual(newEncode(frame,true),transferred);
 for(const levels of [0,1,64,125,126,127,128,129]){
  let value:any=7;for(let i=0;i<levels;i++)value=[value];const direct={a:{b:value}} as any;
  let expected:any,actual:any,errorA=false,errorB=false;
  try{expected=newEncode(direct,true);}catch{errorA=true;}
  try{const fragment=captureProjectionFragment((w:any)=>w.value(value));actual=newEncode({a:{b:fragment}},true);}catch{errorB=true;}
  assert.equal(errorB,errorA,'depth '+levels);if(!errorA)assert.deepEqual(actual,expected);
 }
});
test('22 ships 900 ticks: entire P1 wire and restore, exact RNG/state, cold/skipped/repeated/backward frames',()=>{
 const source=world(),a=world(),b=world();for(const s of source.allCapitalShips){s.pos.scale(.2);s.prevPos.copy(s.pos);s.fireControlMode='AI';}
 let retained:any,saved:any,peak=0;
 for(let tick=0;tick<=900;tick++){
  if(tick)source.fixedUpdate(1/60);if(tick%15)continue;
  const rng=JSON.stringify([source.random,source.visualRandom]),control=bytes(source,tick),candidate=bytes(source,tick,'candidate');
  assert.deepEqual(canonical(candidate),canonical(control),'all fields '+tick);assert.ok(candidate.length<=control.length,'wire grew '+tick+' '+candidate.length+'>'+control.length);
  assert.equal(JSON.stringify([source.random,source.visualRandom]),rng);assert.deepEqual(bytes(source,tick),control);
  peak=Math.max(peak,source.projectiles.length);if(tick===450){retained=take(source,tick,newCapture);saved=newEncode(retained,true).slice();}
  if(tick%105===0&&tick>0)continue;
  applyCombatSnapshots(a,[decodeBinaryFrame(control)],tick===0,undefined,{nativeTargeting:true,nativeProjection:true});applyCombatSnapshots(b,[decodeBinaryFrame(candidate)],tick===0,undefined,{nativeTargeting:true,nativeProjection:true});
  assert.deepEqual(canonical(bytes(a,tick)),canonical(bytes(b,tick)),'whole warm restored '+tick);
  if(tick%300===0){const c=world(),d=world();applyCombatSnapshots(c,[decodeBinaryFrame(control)],true,undefined,{nativeTargeting:true,nativeProjection:true});applyCombatSnapshots(d,[decodeBinaryFrame(candidate)],true,undefined,{nativeTargeting:true,nativeProjection:true});assert.deepEqual(canonical(bytes(c,tick)),canonical(bytes(d,tick)));}
 }
 assert.ok(peak>20);assert.ok(fusedCaptureDiagnostics().batches>1000);assert.deepEqual(newEncode(retained,true),saved);
 for(const tick of [902,902,400]){applyCombatSnapshots(a,[decodeBinaryFrame(bytes(source,tick))],true,undefined,{nativeTargeting:true,nativeProjection:true});applyCombatSnapshots(b,[decodeBinaryFrame(bytes(source,tick,'candidate'))],true,undefined,{nativeTargeting:true,nativeProjection:true});assert.deepEqual(canonical(bytes(a,tick)),canonical(bytes(b,tick)));}
});

test('later array rows are captured after earlier nested mapper mutations, never from pre-read fields',()=>{
 const create=()=>{const e=world(2),s:any=e.allCapitalShips[0],row=(x:number)=>({a:x,b:2,c:3,d:4,e:5,f:6});
  const later:any=row(7),nested:any=[1];nested.map=function(fn:any){later.a=99;later.changed='later';return [fn(1)];};s.streamProbe=[{...row(1),a:nested},later];return e;};
 const a=create(),b=create();assert.deepEqual(canonical(bytes(b,1,'candidate')),canonical(bytes(a)));
 assert.deepEqual(bytes(b),bytes(a));
});

test('captured array length and single HasProperty semantics survive nested mutations',()=>{
 for(const action of ['grow','shrink','delete-current']){
  const create=()=>{const e=world(2),s:any=e.allCapitalShips[0];const parent:any[]=[null,2,3],nested:any=[1];nested.map=function(fn:any){if(action==='grow')parent.push(4);else if(action==='shrink')parent.length=1;else delete parent[0];return [fn(1)];};parent[0]=nested;s.mutationProbe=parent;return e;};
  const a=create(),b=create();assert.deepEqual(canonical(bytes(b,1,'candidate')),canonical(bytes(a)),action);
 }
});

test('unsupported content must not replay a custom array mapper during fallback',()=>{
 const create=()=>{const e=world(2),s:any=e.allCapitalShips[0];s.captureCalls=0;const array:any=[1];array.map=function(fn:any){s.captureCalls++;return [fn(1)];};s.fallbackProbe={array,last:'\ud800'};return {e,s};};
 const a=create(),b=create();const control=take(a.e),candidate=take(b.e,1,newCapture);
 assert.equal(b.s.captureCalls,a.s.captureCalls,'fallback must not call the mapper twice');
 assert.deepEqual(candidate,control);
});
