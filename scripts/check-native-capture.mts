import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {createLanWorld} from '../src/network/LanWorld';
import {assetManager} from '../src/engine/assets/AssetResolver';
import {captureHostCombat,captureAuthorityCombat,configureHostCosmetics} from '../src/network/HostSnapshot';
import {captureCombat,applyCombatSnapshot} from '../src/network/CombatSnapshot';
import {projectileColumnPlan} from '../src/network/ProjectileColumns';
import {encodeProjectedBinaryFrame,decodeBinaryFrame} from '../src/network/BinarySnapshot.mjs';
import {summarizeCombatFrame} from '../src/network/CombatFrameSummary.mjs';
const publicRoot=path.resolve('public');
globalThis.fetch=async(input:any)=>{const p=path.resolve(publicRoot,String(input).replace(/^\//,''));if(!p.startsWith(publicRoot+path.sep))throw Error('Outside assets');return new Response(fs.readFileSync(p));};
await assetManager.ensureManifestLoaded();
const match=(ships=32,hull='hammerhead'):any=>({id:'capture-test',seed:1511506142,hostId:'a',snapshotHz:60,players:[{id:'a',seat:0,team:0,hull:'onslaught'},{id:'b',seat:1,team:1,hull:'onslaught'}],options:{assignment:'teams',battleSize:3200,aiHulls:[Array((ships-2)/2).fill(hull),Array((ships-2)/2).fill(hull)]}});
function expanded(frame:any){
 const expand=(v:any):any=>{
  if(v===null||typeof v!=='object')return v;
  if(Array.isArray(v))return v.map(expand);
  if(Object.hasOwn(v,'$record'))return Object.fromEntries(frame.layouts[v.$record].map((k:string,i:number)=>[k,expand(v.values[i])]));
  if(Object.hasOwn(v,'$records'))return v.values.map((row:any)=>Object.fromEntries(frame.layouts[v.$records].map((k:string,i:number)=>[k,expand(row[i])])));
  if(Object.hasOwn(v,'$projectileColumns')){
   const plan=projectileColumnPlan(v,frame.layouts);
   return plan.rows.map((row:any)=>{
    if(!Array.isArray(row))return expand(row);
    const t=plan.templates[row[0]],values=t.fixed.slice();t.dynamic.forEach((col,i)=>values[col]=row[i+1]);
    return Object.fromEntries(t.keys.map((k,i)=>[k,expand(values[i])]));
   });
  }
  return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,expand(x)]));
 };
 const {layouts:_layouts,...rest}=frame;return expand(rest);
}
const engine=createLanWorld(match()).engine,muzzle=configureHostCosmetics(engine);
const capture=(tick:number,native:boolean)=>native ? captureAuthorityCombat(engine,tick,{0:tick,1:tick},0,muzzle) : captureHostCombat(engine,tick,{0:tick,1:tick},0,muzzle);
test('native capture retains complete visible projection, event windows and real receiver state through 32-ship combat',()=>{
 const a=createLanWorld(match()).engine,b=createLanWorld(match()).engine;
 let events=0,projectiles=0,damage=0;
 for(let tick=0;tick<=1200;tick++){
  if(tick)engine.fixedUpdate(1/60);
  if(tick%60)continue;
  const rng=JSON.stringify([engine.random,engine.visualRandom]);
  const old=capture(tick,false),fast=capture(tick,true);
  assert.equal(JSON.stringify([engine.random,engine.visualRandom]),rng);
  assert.deepEqual(expanded(fast),expanded(old),'projection at '+tick);
  assert.deepEqual(summarizeCombatFrame(fast,32,tick-1),summarizeCombatFrame(old,32,tick-1));
  const oldBytes=encodeProjectedBinaryFrame(old)!,fastBytes=encodeProjectedBinaryFrame(fast)!;
  applyCombatSnapshot(a,decodeBinaryFrame(oldBytes),tick%180===0);applyCombatSnapshot(b,decodeBinaryFrame(fastBytes),tick%180===0);
  assert.deepEqual(expanded(captureHostCombat(a,tick,{0:tick,1:tick},0,null)),expanded(captureHostCombat(b,tick,{0:tick,1:tick},0,null)),'restored at '+tick);
  assert.deepEqual(capture(tick,false),old,'fast capture must not mutate authority');
  projectiles+=engine.projectiles.length;events+=fast.muzzleEvents?.events.length??0;damage+=engine.ships.reduce((n,s)=>n+s.damageDecals.marks.length,0);
 }
 assert.ok(projectiles>0&&events>0&&damage>0,{projectiles,events,damage} as any);
});
test('generic path retains two-pass omitted getters and reference discovery; arbitrary names elsewhere remain',()=>{
 const e=createLanWorld(match(2)).engine;
 const decals=e.playerShip.damageDecals as any,armor=decals.armor;let reads=0;
 Object.defineProperty(decals,'armor',{enumerable:true,configurable:true,get(){reads++;return armor;}});
 captureCombat(e,0,{0:0},0,true,true,true);assert.equal(reads,2);
 Object.defineProperty(decals,'armor',{enumerable:true,configurable:true,get(){throw Error('original getter');}});
 assert.throws(()=>captureCombat(e,0,{0:0},0,true,true,true),/original getter/);
 Object.defineProperty(decals,'armor',{enumerable:true,configurable:true,value:armor});
 (e.playerShip as any).customFixture={healthTracker:{armor:17,cells:[1,2]},spawnLocation:9};
 const frame=captureHostCombat(e,0,{0:0},0,null,true,true,true);
 assert.deepEqual(expanded(frame).ships[0].state.customFixture,{healthTracker:{armor:17,cells:[1,2]},spawnLocation:9});
});
test('dynamic carrier craft projections match',()=>{
 const e=createLanWorld(match(16,'drover')).engine,m=configureHostCosmetics(e);
 let craft=0;
 for(let tick=0;tick<=360;tick++){
  if(tick)e.fixedUpdate(1/60);if(tick%60)continue;
  const a=captureHostCombat(e,tick,{0:tick},0,m,true,true,false),b=captureHostCombat(e,tick,{0:tick},0,m,true,true,true);
  craft+=b.crafts.length;assert.deepEqual(expanded(b),expanded(a));
 }
 assert.ok(craft>0);
});
test('reserve deployment and destruction preserve authoritative state',()=>{
 const fixture=match(16);fixture.options.initialDeploymentLimit=0;
 const e=createLanWorld(fixture).engine,m=configureHostCosmetics(e);
 const check=(tick:number)=>{
  const a=captureHostCombat(e,tick,{0:tick},0,m,true,true,false),b=captureHostCombat(e,tick,{0:tick},0,m,true,true,true);
  assert.deepEqual(expanded(b),expanded(a));
  assert.deepEqual(summarizeCombatFrame(b,16,tick-1),summarizeCombatFrame(a,16,tick-1));
 };
 const reserve=e.allCapitalShips.find(s=>e.deployment.isReserve(s.id));assert.ok(reserve);check(0);
 e.deployment.deploy([reserve.id],reserve.teamId);assert.equal(e.deployment.isReserve(reserve.id),false);check(1);
 reserve.hullHp=0;reserve.isDead=true;check(2);
 e.enemyShip.hullHp=0;e.enemyShip.isDead=true;check(3);
});
test('paired fixed-world capture cost (diagnostic, no CI speed threshold)',()=>{
 const med=(xs:number[])=>xs.sort((a,b)=>a-b)[Math.floor(xs.length/2)];
 for(let i=0;i<40;i++){capture(1200,false);capture(1200,true);}
 const timing:any[]=[];
 for(const native of [false,true,true,false]){
  const times:number[]=[];let bytes=0,layouts=0;
  for(let i=0;i<100;i++){const at=performance.now(),frame=capture(1200,native);times.push(performance.now()-at);if(!i){bytes=encodeProjectedBinaryFrame(frame)!.length;layouts=frame.layouts!.length;}}
  timing.push({native,medianMs:med(times),bytes,layouts});
 }
 fs.mkdirSync('artifacts/guest-hz-20260920',{recursive:true});fs.writeFileSync('artifacts/guest-hz-20260920/capture-timings.json',JSON.stringify({timing},null,2));console.log(JSON.stringify({timing}));
});

test('native array dispatch keeps scalar tags, holes, cycles, custom maps/species and typed iterators',()=>{
 const e=createLanWorld(match(2)).engine,m=configureHostCosmetics(e),ship:any=e.allCapitalShips[0];
 const shared={values:[1,2,3]},cycle:any[]=[];cycle.push(cycle);
 const sparse:any[]=[undefined,null,true,false,'字😀',NaN,Infinity,-Infinity,-0,shared,shared,cycle];sparse.length+=2;
 class CustomArray extends Array {}
 let mapCalls=0,iteratorReads=0;
 const mapped:any=[1,2,3];mapped.map=function(fn:any){mapCalls++;return Array.prototype.map.call(this,fn);};
 const numbers=new Float32Array([1,2.5]);Object.defineProperty(numbers,Symbol.iterator,{get(){iteratorReads++;return function*(){yield 7;yield 11;};}});
 ship.dispatchFixture={sparse,subclass:new CustomArray(1,2,3),mapped,numbers,nested:[sparse,[shared]],map:new Map([['k',sparse]]),set:new Set([undefined,shared])};
 const generic=captureHostCombat(e,0,{},0,m),native=captureHostCombat(e,0,{},0,m,true,true,true);
 assert.deepEqual(expanded(native),expanded(generic));assert.equal(mapCalls,2);assert.equal(iteratorReads,2);
 const detached=new Float32Array([1]);structuredClone(detached.buffer,{transfer:[detached.buffer]});ship.dispatchFixture={detached};
 assert.throws(()=>captureHostCombat(e,0,{},0,m),TypeError);assert.throws(()=>captureHostCombat(e,0,{},0,m,true,true,true),TypeError);
});
