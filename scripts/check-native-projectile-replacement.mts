import assert from 'node:assert/strict';import {test} from 'node:test';
import {captureCombat as oldCapture,applyCombatSnapshots as oldApply} from 'projectiles-reference';
import {captureCombat,applyCombatSnapshots} from '../src/network/CombatSnapshot';
import {nativeProjectileCaptureDiagnostics} from '../src/network/NativeProjectileCapture';
import {compileProjectileFixed,restoreProjectileFixed} from '../src/network/ProjectileFixedRestore';
import {encodeProjectedBinaryFrame,decodeBinaryFrame} from '../src/network/BinarySnapshot.mjs';
import {Vector2} from '../src/engine/math/Vector2';
import {assets,world} from './lib/native-projectile-fixture.mts';
await assets();
const take=(e:any,tick=0,fn:any=captureCombat)=>fn(e,tick,{0:tick,1:tick},0,true,true,true,true,true);
const bytes=(f:any)=>encodeProjectedBinaryFrame(f,true)!;
const decoded=(f:any)=>decodeBinaryFrame(bytes(f));
const dump=(rows:any)=>JSON.stringify(rows);
function bullets(n=24):any[]{return Array.from({length:n},(_,i)=>({id:(i+.25)/100,sourceShipId:'p0',slotId:'test',specId:'test',pos:new Vector2(i*3,7),prevPos:new Vector2(0,0),vel:new Vector2(100,1),elapsedTime:i/60,
 spawnType:'BALLISTIC',radius:2,rangeRemaining:1000-i,totalRange:1000,damage:40,empDamage:3,fadeTime:.3,projLength:40,fadeProgress:0,color:[255,100,100],didDamage:false,
 missileTrailSpec:{width:5,color:[1,2,3],duration:1},custom:{nested:[1,2,3]},sourceVelocity:new Vector2(0,1),sourceMoveSpeed:100}));}
function compare(e:any,tick=0){const before=oldCapture(e,tick,{0:tick,1:tick},0,true,true,true,true,true),after=take(e,tick);assert.deepEqual(bytes(after),bytes(before),'complete SWF2 bytes');return after;}
function restorePair(e:any,tick=0,reset=false){const frame=compare(e,tick),old=world(2),next=world(2);oldApply(old,[decoded(frame)],reset,undefined,{nativeTargeting:true});applyCombatSnapshots(next,[decoded(frame)],reset,undefined,{nativeTargeting:true,nativeProjectiles:true});assert.equal(dump(next.projectiles),dump(old.projectiles));return next;}

test('evolving real 22-ship host has byte-identical whole frames and actual skipped recursive fields',()=>{
 const e=world(),start=nativeProjectileCaptureDiagnostics(),rng=()=>JSON.stringify([e.random,e.visualRandom]);for(const s of e.allCapitalShips){s.pos.scale(.2);s.prevPos.copy(s.pos);s.fireControlMode='AI';}
 let projectiles=0;for(let tick=0;tick<=300;tick++){if(tick)e.fixedUpdate(1/60);if(tick%6===0){const prior=rng();compare(e,tick);assert.equal(rng(),prior);projectiles=Math.max(projectiles,e.projectiles.length);}}
 const end=nativeProjectileCaptureDiagnostics();assert.ok(projectiles>=30);assert.ok(end.frames>start.frames);assert.ok(end.reusedFields>start.reusedFields);assert.ok(end.packedFields>start.packedFields);
});

test('birth/delete/reorder and mutable nested fields, shapes and function transitions use current values',()=>{
 const e=world(2);e.projectiles=bullets();const old=world(2),next=world(2);
 for(let tick=0;tick<12;tick++){
  if(tick===1)e.projectiles[0].color[0]=7;
  if(tick===2)e.projectiles.reverse();
  if(tick===3)e.projectiles[0].missileTrailSpec.color[1]=99;
  if(tick===4)e.projectiles.splice(0,4);
  if(tick===5)e.projectiles.push(...bullets(8));
  if(tick===6){e.projectiles[0].custom={a:1,b:2,c:3,d:4,e:5,f:6};e.projectiles[1].custom={a:1,b:2,c:3,d:4,e:5,f:6};}
  if(tick===7)e.projectiles[0].custom=()=>{};
  if(tick===8)delete e.projectiles[0].custom;
  if(tick===9)for(const p of e.projectiles){p.pos.x+=70;p.didDamage=true;}
  if(tick===10)e.projectiles.length=3;
  if(tick===11)e.projectiles=[];
  const f=decoded(compare(e,tick));oldApply(old,[f],tick===0,undefined,{nativeTargeting:true});applyCombatSnapshots(next,[f],tick===0,undefined,{nativeTargeting:true,nativeProjectiles:true});assert.equal(dump(next.projectiles),dump(old.projectiles));
 }
});

test('context-dependent cycles, Ship discovery, repeated references and custom prototypes retain old pack semantics',()=>{
 const e=world(2);e.projectiles=bullets();const shared:any={};shared.parent=e.projectiles[0];
 for(const p of e.projectiles){p.custom=shared;p.owner=e.playerShip;p.set=new Set([1,2]);p.map=new Map([['ship',e.enemyShip]]);}
 compare(e);e.projectiles[1]=Object.assign(Object.create({extra:1}),e.projectiles[1]);compare(e,1);
});

test('layout/spec interleaving and nested layout insertion preserve the exact dictionary and template order',()=>{
 const e=world(2);e.projectiles=bullets(60);e.projectiles.forEach((p:any,i:number)=>{p.specId=['a','b','c'][i%3];if(i%2)p.extra='x';p.custom=i%4?{x:1,y:2,z:3,w:4,a:5,b:6}:{a:1,b:2,c:3,d:4,e:5,f:6};});compare(e);
 for(const p of e.projectiles){const v=p.custom;delete p.custom;p.custom=v;}compare(e,1);
});

test('native scalar precision and exceptional markers match legacy (-0, NaN, Infinity, fractional IDs)',()=>{
 const e=world(2);e.projectiles=bullets();for(const [i,p] of e.projectiles.entries()){p.custom={value:i%2?-0:0,nan:NaN,positive:Infinity,negative:-Infinity};p.sourceVelocity.x=i%2?-0:0;}
 assert.deepEqual(take(e),take(e,0,oldCapture));restorePair(e);
});

test('frame and viewer object mutations never contaminate source, another viewer or later fixed restores',()=>{
 const e=world(2);e.projectiles=bullets();const f=take(e),a=world(2),b=world(2);
 applyCombatSnapshots(a,[f],true,undefined,{nativeProjectiles:true});applyCombatSnapshots(b,[f],true,undefined,{nativeProjectiles:true});
 const vector=a.projectiles[0].sourceVelocity,color=a.projectiles[0].color,custom=a.projectiles[0].custom;
 vector.set(999,999);color[0]=999;custom.nested[0]=999;assert.equal(b.projectiles[0].sourceVelocity.x,0);assert.equal(e.projectiles[0].color[0],255);
 applyCombatSnapshots(a,[take(e,2)],false,undefined,{nativeProjectiles:true});assert.equal(a.projectiles[0].sourceVelocity,vector);assert.equal(a.projectiles[0].color,color);assert.equal(a.projectiles[0].custom,custom);assert.equal(vector.x,0);assert.equal(color[0],255);assert.equal(custom.nested[0],1);
 f.world.projectiles.$projectileColumns[0][2][0]='poison';compare(e,3);
});

test('cold restore, skipped frames and interpolation reset need no prior template or event history',()=>{
 const e=world(2);e.projectiles=bullets();for(const tick of [1,60,900])for(const reset of [false,true]){for(const p of e.projectiles)p.pos.x=tick+p.id;restorePair(e,tick,reset);}
});

test('generic getters/custom arrays are never admitted to native optimization implicitly',()=>{
 const e=world(2);e.projectiles=bullets();let reads=0;Object.defineProperty(e.projectiles[0],'custom',{enumerable:true,get:()=>{reads++;return 4;}});
 const start=nativeProjectileCaptureDiagnostics();captureCombat(e,1,{},0,true,true,true,false,true);const currentReads=reads;reads=0;oldCapture(e,1,{},0,true,true,true,false,true);assert.equal(reads,currentReads);assert.deepEqual(nativeProjectileCaptureDiagnostics(),start);
});

test('malformed vector/record and reference tags keep the old validation fallback',()=>{
 for(const value of [{$vector:[1,NaN]},{$vector:[1]},{$record:99,values:[]},{$ship:'missing'},{$typed:'Unknown',values:[]}])assert.equal(compileProjectileFixed(value,[],new Set()),null);
 const p=compileProjectileFixed({a:[1,2],b:{$vector:[3,4]}},[],new Set())!;const a=restoreProjectileFixed(p,undefined),b=restoreProjectileFixed(p,undefined);assert.notEqual(a.a,b.a);assert.notEqual(a.b,b.b);a.b.x=8;assert.equal(b.b.x,3);
});
