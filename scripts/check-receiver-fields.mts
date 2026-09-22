import assert from 'node:assert/strict';import {test} from 'node:test';
import {assets,world} from './lib/native-projectile-fixture.mts';
import {captureCombat,applyCombatSnapshots as oldApply} from 'receiver-fields-control';
import {applyCombatSnapshots as apply} from 'receiver-fields-candidate';
import {encodeProjectedBinaryFrame,decodeBinaryFrame} from '../src/network/BinarySnapshot.mjs';
await assets();
const take=(e:any,t=1)=>captureCombat(e,t,{0:t,1:t},0,true,true,true,true,true);
const wire=(f:any)=>encodeProjectedBinaryFrame(f,true)!;
const frame=(e:any,t=1)=>decodeBinaryFrame(wire(take(e,t)));
const pair=(f:any,reset=false)=>{const a=world(2),b=world(2);oldApply(a,[f],reset,undefined,{nativeTargeting:true,nativeProjection:true});apply(b,[f],reset,undefined,{nativeTargeting:true,nativeProjection:true});assert.deepEqual(wire(take(a)),wire(take(b)));return {a,b};};
test('DTO restore matches generic for nested fields, tags, sparse updates and live target mutations',()=>{
 const source=world(2),f=frame(source);f.ships[0].state.auditFixture={n:1,vec:{$vector:[1.5,2.5]},empty:{$undefined:1},inf:{$number:'Infinity'},array:[1,{x:2}],typed:{$typed:'Float32Array',values:[1,2]},map:{$map:[['x',{a:1}]]},set:{$set:['a','b']}};
 const {a,b}=pair(f,true),v=(b.allCapitalShips[0] as any).auditFixture.vec,arr=(b.allCapitalShips[0] as any).auditFixture.array;
 (a.allCapitalShips[0] as any).auditFixture.n=(b.allCapitalShips[0] as any).auditFixture.n=999;v.x=888;(a.allCapitalShips[0] as any).auditFixture.vec.x=888;
 oldApply(a,[f],false,undefined,{nativeTargeting:true,nativeProjection:true});apply(b,[f],false,undefined,{nativeTargeting:true,nativeProjection:true});
 assert.equal((b.allCapitalShips[0] as any).auditFixture.vec,v);assert.equal((b.allCapitalShips[0] as any).auditFixture.array,arr);assert.equal(v.x,1.5);assert.deepEqual(wire(take(a)),wire(take(b)));
 const sparse=structuredClone(f);sparse.tick=2;sparse.ships[0].state.auditFixture={n:5};oldApply(a,[sparse]);apply(b,[sparse],false,undefined,{nativeProjection:true});assert.deepEqual(wire(take(a)),wire(take(b)));
});
test('generic path retains Object.entries getter and Proxy evaluation ordering',()=>{
 for(const fn of [oldApply,apply]){
  const e=world(2),f=frame(e),events:string[]=[];const value:any={};Object.defineProperty(value,'a',{enumerable:true,get(){events.push('get:a');return 1;}});Object.defineProperty(value,'b',{enumerable:true,get(){events.push('get:b');return 2;}});
  f.ships[0].state.auditFixture=new Proxy(value,{ownKeys(t){events.push('keys');return Reflect.ownKeys(t);},getOwnPropertyDescriptor(t,k){events.push('descriptor:'+String(k));return Reflect.getOwnPropertyDescriptor(t,k);}});
  const target:any={};Object.defineProperty(target,'a',{enumerable:true,set(){events.push('set:a')}});Object.defineProperty(target,'b',{enumerable:true,set(){events.push('set:b')}});(e.allCapitalShips[0] as any).auditFixture=target;
  fn(e,[f]);assert.deepEqual(events.filter(x=>x.startsWith('get:')||x.startsWith('set:')),['get:a','get:b','set:a','set:b']);
 }
});
test('batch endpoints, callbacks, reset and error prefixes match old restore',()=>{
 const source=world(2),frames=[frame(source,1),frame(source,2),frame(source,3)];frames[1].ships[0].state.pos={$vector:[30,40]};frames[2].ships[0].state.pos={$vector:[50,60]};
 const a=world(2),b=world(2),seenA:any[]=[],seenB:any[]=[];
 const record=(e:any,seen:any[])=>f=>{seen.push([f.tick,e.allCapitalShips[0].pos.x]);};
 oldApply(a,frames,true,record(a,seenA),{nativeTargeting:true,nativeProjection:true});apply(b,frames,true,record(b,seenB),{nativeTargeting:true,nativeProjection:true});assert.deepEqual(seenA,seenB);assert.deepEqual(wire(take(a)),wire(take(b)));
 const bad=structuredClone(frames[2]);bad.ships[0].state.auditFixture={bad:{$vector:[1]}};
 for(const [engine,fn,opts] of [[a,oldApply,{}],[b,apply,{nativeProjection:true}]] as any[]){let count=0;assert.throws(()=>fn(engine,[frames[0],bad,frames[2]],false,()=>count++,opts),/Invalid vector/);assert.equal(count,1);}
});
test('depth and denied keys have identical outcomes',()=>{
 const source=world(2);for(const depth of [60,64,65]){const f=frame(source);let v:any={n:1};for(let i=0;i<depth;i++)v={next:v};f.ships[0].state.auditFixture=v;const outcome=(fn:any,opt:any)=>{try{fn(world(2),[f],false,undefined,opt);return null;}catch(e){return [(e as Error).name,(e as Error).message];}};assert.deepEqual(outcome(oldApply,{}),outcome(apply,{nativeProjection:true}));}
 const f=frame(source);f.ships[0].state.auditFixture=JSON.parse('{"__proto__":{"bad":1},"constructor":1,"ok":2}');const {b}=pair(f);assert.equal((b.allCapitalShips[0] as any).auditFixture.ok,2);assert.equal(({} as any).bad,undefined);
});

test('native vector leaf preserves marker precedence, sparse validation and retained custom set method',()=>{
 const cases:any[]=[{$vector:[1,2]},{$vector:[-0,2]},{$vector:[1]},{$vector:[1,NaN]},{$vector:[Infinity,2]},{$vector:new Array(2)},{$vector:[1,2],$undefined:1},{$vector:[1,2],$record:0,values:[]},{$vector:[1,2],$ship:'missing'}];
 const source=world(2);
 for(const leaf of cases){
  const f=frame(source);f.ships[0].state.auditFixture={vector:leaf};
  const result=(fn:any)=>{const e=world(2);let err=null;try{fn(e,[f],false,undefined,{nativeProjection:true});}catch(error){err=[error.name,error.message];}return {err,projection:take(e)};};
  assert.deepEqual(result(apply),result(oldApply));
 }
 const f=frame(source);const a=world(2),b=world(2),seenA:any[]=[],seenB:any[]=[];
 for(const [e,seen] of [[a,seenA],[b,seenB]] as any[]){const vector=e.playerShip.pos,original=vector.set;vector.set=function(x:number,y:number){seen.push([x,y]);return original.call(this,x,y);};}
 oldApply(a,[f],false,undefined,{nativeProjection:true});apply(b,[f],false,undefined,{nativeProjection:true});assert.deepEqual(seenB,seenA);assert.deepEqual(wire(take(b)),wire(take(a)));
});

test('layout validation cache cannot be poisoned by input mutation, equal-prefix collisions or eviction',()=>{
 const source=world(2),a=world(2),b=world(2);
 const applyPair=(f:any)=>{
  const run=(fn:any,e:any)=>{try{fn(e,[f],false,undefined,{nativeProjection:true});return null;}catch(error){return [error.name,error.message];}};
  assert.deepEqual(run(apply,b),run(oldApply,a));assert.deepEqual(wire(take(b)),wire(take(a)));
 };
 for(let i=0;i<160;i++){
  const f=frame(source,i+1);f.layouts.push(['receiverFixture'+i,'value','other']);applyPair(f);
  // The same input array was retained by the caller and mutates after restore.
  f.layouts.at(-1)[1]='constructor';applyPair(f);
 }
 for(const keys of [['sameFirst','a','b'],['sameFirst','a','a'],['sameFirst','constructor','b'],['sameFirst','a',3],['sameFirst','z','b']]){
  const f=frame(source);f.layouts.push(keys);applyPair(f);
 }
 for(const count of [0,128,129,2048,2049]){const f=frame(source);f.layouts.push(Array.from({length:count},(_,i)=>'key'+i));applyPair(f);}
});
