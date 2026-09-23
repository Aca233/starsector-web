import assert from 'node:assert/strict';
import {test} from 'node:test';
import {captureCombat as control, applyCombatSnapshots} from 'native-fields-control';
import {captureCombat as candidate} from 'native-fields-candidate';
import {encodeProjectedBinaryFrame, decodeBinaryFrame} from '../src/network/BinarySnapshot.mjs';
import {Vector2} from '../src/engine/math/Vector2';
import {assets,world} from './lib/native-projectile-fixture.mts';
await assets();
const capture=(fn:any,e:any,tick=1,native=true)=>fn(e,tick,{0:tick,1:tick},0,true,true,true,native,true);
const wire=(frame:any)=>encodeProjectedBinaryFrame(frame,true)!;
function compare(e:any,tick=1,native=true){
 const rng=JSON.stringify([e.random,e.visualRandom]);
 const a=capture(control,e,tick,native),b=capture(candidate,e,tick,native);
 assert.deepEqual(b,a);assert.deepEqual(wire(b),wire(a));
 assert.equal(JSON.stringify([e.random,e.visualRandom]),rng,'capture must not consume randomness');
 return b;
}
function fixture(){const e=world(2);const row:any={a:1,b:2,c:3,d:4,e:5,f:6,g:7,h:8};(e.allCapitalShips[0] as any).nativeFieldsFixture=row;return {e,row};}
test('native field indices follow additions, deletions, reordering and numeric own keys',()=>{
 const {e,row}=fixture();compare(e);row.extra=9;compare(e);delete row.c;compare(e);row.c=31;compare(e);
 row['2']='second';row['1']='first';row['0']='zero';compare(e);delete row['1'];compare(e);
 Object.defineProperty(row,'b',{enumerable:false});compare(e);Object.defineProperty(row,'b',{enumerable:true});compare(e);
 for(let i=0;i<300;i++)row['wide'+i]=i;compare(e); // established wide-shape fallback
});
test('plans retain function/value transitions, special numbers, undefined and symbol handling',()=>{
 const {e,row}=fixture();for(const value of [()=>1,undefined,null,NaN,Infinity,-Infinity,-0,Symbol('not-on-wire'),new Vector2(3,-0)]){
  row.b=value;row.g=()=>2;
  // Symbols are supported by capture, not a wire value; compare capture directly.
  if(typeof value==='symbol')assert.deepEqual(capture(candidate,e),capture(control,e));else compare(e);
 }
 row.b=12;row.g=13;row[Symbol('hidden')]='ignored';compare(e);
});
test('sparse/custom arrays, typed data, containers, cycles and repeated references keep existing semantics',()=>{
 const {e,row}=fixture();const nested:any={one:1,two:undefined,three:-0};nested.self=nested;
 const sparse:any[]=[];sparse[2]=nested;sparse[5]=new Vector2(7,8);
 row.a=sparse;row.b=nested;row.c=nested;row.d=new Float64Array([1,-0,Infinity,NaN]);
 row.e=new Map([[new Vector2(1,2),nested]]);row.f=new Set([nested]);row.g=e.allCapitalShips[1];compare(e);
 row.a=Object.assign([1,2,3],{map:Array.prototype.map});compare(e);
});
test('prototype/path omissions still validate live shape and do not omit similarly named unrelated fields',()=>{
 const {e,row}=fixture();row.armor={a:2};row.cells=[1,2];row.prevPos=new Vector2(4,5);row.healthTracker={hp:3};compare(e);
 Object.setPrototypeOf(row,{inherited:91});compare(e);
 row.prevPos.x=45;row.healthTracker.hp=14;compare(e);
});
test('captured frames retain ownership across later mutation and recapture',()=>{
 const {e,row}=fixture();row.a={nested:[1,2,new Vector2(3,4)]};const frame=compare(e),bytes=wire(frame).slice();
 row.a.nested[0]=999;row.a.nested[2].x=777;row.a.newField=18;row.c=()=>1;compare(e,2);
 assert.deepEqual(wire(frame),bytes,'no alias to live authority or retained shape arrays');
});
test('generic getter and Proxy observations, including failures, preserve original read order',()=>{
 const {e}=fixture();const reads:string[]=[];let fail=false;const data:any={a:1,b:2,c:3,d:4,e:5,f:6,g:7};
 Object.defineProperty(data,'b',{enumerable:true,get(){reads.push('getter:b');if(fail)throw Error('probe');return 2;}});
 (e.allCapitalShips[0] as any).nativeFieldsFixture=new Proxy(data,{ownKeys(t){reads.push('keys');return Reflect.ownKeys(t);},get(t,k,r){reads.push('get:'+String(k));return Reflect.get(t,k,r);}});
 reads.length=0;const a=capture(control,e,1,false),order=reads.slice();reads.length=0;
 const b=capture(candidate,e,1,false);assert.deepEqual(b,a);assert.deepEqual(reads,order);
 fail=true;reads.length=0;assert.throws(()=>capture(control,e,1,false),/probe/);const prefix=reads.slice();reads.length=0;
 assert.throws(()=>capture(candidate,e,1,false),/probe/);assert.deepEqual(reads,prefix);
});
test('22-ship live combat has exact full projection, full binary and restored receivers after skipped ticks',()=>{
 const e=world(),a=world(),b=world();for(const s of e.allCapitalShips){s.pos.scale(.2);s.prevPos.copy(s.pos);s.fireControlMode='AI';}
 let maxProjectiles=0;
 for(let tick=0;tick<=180;tick++){
  if(tick)e.fixedUpdate(1/60);maxProjectiles=Math.max(maxProjectiles,e.projectiles.length);if(tick%9)continue;
  const old=capture(control,e,tick),next=compare(e,tick);
  for(const [viewer,f] of [[a,old],[b,next]] as const)applyCombatSnapshots(viewer,[decodeBinaryFrame(wire(f))],tick===0,undefined,{nativeTargeting:true,nativeProjection:true});
  assert.deepEqual(wire(capture(control,b,tick)),wire(capture(control,a,tick)));
 }
 assert.ok(maxProjectiles>=30,'real projectile combat is required');
});
