import assert from 'node:assert/strict';import {test} from 'node:test';
import {assets,world} from './lib/native-projectile-fixture.mts';
import {applyCombatSnapshots as oldApply} from 'native-apply-control';
import {captureCombat} from 'native-apply-candidate';
import {applyCombatSnapshots as apply} from 'native-apply-candidate';
import {encodeProjectedBinaryFrame,decodeBinaryFrame} from '../src/network/BinarySnapshot.mjs';
await assets();
const take=(e:any,t=1)=>captureCombat(e,t,{0:t,1:t},0,true,true,true,true,true);
const wire=(f:any)=>encodeProjectedBinaryFrame(f,true)!;
const frame=(e:any,t=1)=>decodeBinaryFrame(wire(take(e,t)));
const pair=(f:any,reset=false)=>{const a=world(2),b=world(2);oldApply(a,[f],reset,undefined,{nativeTargeting:true});apply(b,[f],reset,undefined,{nativeTargeting:true,nativeProjection:true});assert.deepEqual(wire(take(a)),wire(take(b)));return {a,b};};
test('DTO restore matches generic for nested fields, tags, sparse updates and live target mutations',()=>{
 const source=world(2),f=frame(source);f.ships[0].state.auditFixture={n:1,vec:{$vector:[1.5,2.5]},empty:{$undefined:1},inf:{$number:'Infinity'},array:[1,{x:2}],typed:{$typed:'Float32Array',values:[1,2]},map:{$map:[['x',{a:1}]]},set:{$set:['a','b']}};
 const {a,b}=pair(f,true),v=(b.allCapitalShips[0] as any).auditFixture.vec,arr=(b.allCapitalShips[0] as any).auditFixture.array;
 (a.allCapitalShips[0] as any).auditFixture.n=(b.allCapitalShips[0] as any).auditFixture.n=999;v.x=888;(a.allCapitalShips[0] as any).auditFixture.vec.x=888;
 oldApply(a,[f],false,undefined,{nativeTargeting:true});apply(b,[f],false,undefined,{nativeTargeting:true,nativeProjection:true});
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
 oldApply(a,frames,true,record(a,seenA),{nativeTargeting:true});apply(b,frames,true,record(b,seenB),{nativeTargeting:true,nativeProjection:true});assert.deepEqual(seenA,seenB);assert.deepEqual(wire(take(a)),wire(take(b)));
 const bad=structuredClone(frames[2]);bad.ships[0].state.auditFixture={bad:{$vector:[1]}};
 for(const [engine,fn,opts] of [[a,oldApply,{}],[b,apply,{nativeProjection:true}]] as any[]){let count=0;assert.throws(()=>fn(engine,[frames[0],bad,frames[2]],false,()=>count++,opts),/Invalid vector/);assert.equal(count,1);}
});
test('depth and denied keys have identical outcomes',()=>{
 const source=world(2);for(const depth of [60,64,65]){const f=frame(source);let v:any={n:1};for(let i=0;i<depth;i++)v={next:v};f.ships[0].state.auditFixture=v;const outcome=(fn:any,opt:any)=>{try{fn(world(2),[f],false,undefined,opt);return null;}catch(e){return [(e as Error).name,(e as Error).message];}};assert.deepEqual(outcome(oldApply,{}),outcome(apply,{nativeProjection:true}));}
 const f=frame(source);f.ships[0].state.auditFixture=JSON.parse('{"__proto__":{"bad":1},"constructor":1,"ok":2}');const {b}=pair(f);assert.equal((b.allCapitalShips[0] as any).auditFixture.ok,2);assert.equal(({} as any).bad,undefined);
});
import fs from 'node:fs';
import {combatRenderView} from '../src/engine/render/CombatRenderView';
import {CombatHudProjector} from '../src/engine/runtime/CombatHudView';
import {TacticalMapViewProjector} from '../src/engine/runtime/TacticalMapView';
import {DeploymentViewProjector} from '../src/engine/runtime/DeploymentView';
import {MotionPrediction} from '../src/network/MotionPrediction';
import {LocalTurretPrediction} from '../src/network/LocalTurretPrediction';
import {LocalFirePrediction} from '../src/network/LocalFirePrediction';
import {blankInput} from '../src/network/protocol';
const nativeOptions={nativeTargeting:true,nativeProjection:true};
const json=(value:any)=>JSON.parse(JSON.stringify(value));
const recipes=[
 [1,0,917,10,20,100,0,0,0,0,0],
 [1,1,917,10,20,3,200,100,50,40,1],
 [1,2,917,10,20,3,200,100,50,0,0],
 [1,3,917,10,20,3,0,0,0,0,0],
];
const dynamic=(kind:number,motion:number[],steps=2)=>({$dynamicParticles:[motion.length===4?1:2,[recipes[kind]],[[0,0,steps,motion],{raw:{pos:{$vector:[9,8]},color:[1,2,3],life:.5}}]]});
test('native recipe rows are exact, owned and correct local edits, rewinds and row reuse',()=>{
 const a=world(2),b=world(2),f=frame(a);
 let previous:any;
 for(const kind of [0,1,2,3,0])for(const motion of [[11,22,33,44],[15,11,22,33,44],[31,0,22,33,44],[0,0,0,0,0]])for(const steps of [5,0,3]){
  f.ships[0].state.auditFixture={particles:dynamic(kind,motion,steps),puffs:{$explosionPuffs:[1,300,917,1,3,4]}};
  oldApply(a,[f],false,undefined,nativeOptions);apply(b,[f],false,undefined,nativeOptions);
  const x=(a.allCapitalShips[0] as any).auditFixture,y=(b.allCapitalShips[0] as any).auditFixture;
  assert.deepEqual(y,x);if(previous){assert.equal(y.particles,previous.array);assert.equal(y.particles[0],previous.row);assert.equal(y.particles[0].pos,previous.pos);assert.equal(y.particles[0].color,previous.color);assert.equal(y.puffs[0].offset,previous.offset);}
  previous={array:y.particles,row:y.particles[0],pos:y.particles[0].pos,color:y.particles[0].color,offset:y.puffs[0].offset};
  for(const v of [x,y]){v.particles[0].pos.x=123456;v.particles[0].color[0]=123456;v.puffs[0].offset.x=123456;v.puffs[0].texture=123456;}
 }
 // Cold viewer cannot observe mutations of another viewer/decoder cache.
 const c=world(2),d=world(2);apply(c,[f],false,undefined,nativeOptions);oldApply(d,[f],false,undefined,nativeOptions);
 assert.deepEqual((c.allCapitalShips[0] as any).auditFixture,(d.allCapitalShips[0] as any).auditFixture);
});
test('recipe budgets, invalid suffixes and depth preserve errors and partially written rows',()=>{
 const source=world(2),base=frame(source);
 const badRecipes=[dynamic(0,[1,2,3,4]),dynamic(1,[15,1,2,3,4]),{$explosionPuffs:[1,300,917,1,3,4]}];
 for(const recipe of badRecipes)for(const depth of [0,57,58,59,60,61,62]){
  const f=structuredClone(base);let v:any=recipe;for(let n=0;n<depth;n++)v={nested:v};f.ships[0].state.auditFixture=v;
  const outcomes:any[]=[];
  for(const fn of [oldApply,apply]){const e=world(2);let error=null;try{fn(e,[f],false,undefined,nativeOptions);}catch(x){error=(x as Error).message;}outcomes.push([error,json((e.allCapitalShips[0] as any).auditFixture??null)]);}
  assert.deepEqual(outcomes[1],outcomes[0]);
 }
 for(const mutation of [(v:any)=>v.$dynamicParticles[2].push([0,999,0,[1,2,3,4]]),(v:any)=>v.$dynamicParticles[2].push([0,0,257,[1,2,3,4]]),(v:any)=>v.$dynamicParticles[2].push([0,0,2,[256,0,0,0,0]]),(v:any)=>{v.$dynamicParticles[2]=Array.from({length:4096},()=>[0,0,0,[1,2,3,4]]); }]){
  const v=dynamic(0,[1,2,3,4]);mutation(v);const f=structuredClone(base);f.ships[0].state.auditFixture={first:v,second:v};
  const results:any[]=[];for(const fn of [oldApply,apply]){const e=world(2);let err=null;try{fn(e,[f],false,undefined,nativeOptions);}catch(x){err=(x as Error).message;}results.push([err,json((e.allCapitalShips[0] as any).auditFixture??null)]);}
  assert.deepEqual(results[1],results[0]);assert.notEqual(results[1][0],null);
 }
});
test('all generated record layouts keep structured tag fallback and list validation',()=>{
 const layouts=JSON.parse(fs.readFileSync('scripts/lib/native-restore-shapes.json','utf8'));
 const a=world(2),b=world(2),f=frame(a);
 for(const keys of [...layouts,['unknownA','unknownB','unknownC','unknownD','unknownE','unknownF']]){
  const id=f.layouts.length;f.layouts.push(keys);
  const values=keys.map((_:any,i:number)=>i%4===0?{$vector:[i,i+1]}:i%4===1?[1,{n:2}]:i%4===2?{$number:'Infinity'}:i);
  f.ships[0].state.auditFixture={$records:id,values:[values,values]};
  oldApply(a,[f],false,undefined,nativeOptions);apply(b,[f],false,undefined,nativeOptions);
  assert.deepEqual((b.allCapitalShips[0] as any).auditFixture,(a.allCapitalShips[0] as any).auditFixture);
  f.ships[0].state.auditFixture.values.push([]);
  for(const [fn,e] of [[oldApply,a],[apply,b]] as any[])assert.throws(()=>fn(e,[f],false,undefined,nativeOptions),/Invalid snapshot record row/);
 }
});
test('actual guest consumers, prediction baselines and non-enumerable visual layers survive every endpoint',()=>{
 const source=world(2),a=world(2),b=world(2),frames=[];
 source.playerShip.playerTargetId=source.enemyShip.id;
 for(let i=1;i<=4;i++){source.fixedUpdate(1/60);const f=frame(source,i);f.world.fxSystem.particles=dynamic(2,[15,i,2,3,4]);frames.push(f);}
 const run=(e:any,fn:any)=>{
  const hud=new CombatHudProjector(),map=new TacticalMapViewProjector(),deployment=new DeploymentViewProjector();
  const motion=new MotionPrediction(),turret=new LocalTurretPrediction(),fire=new LocalFirePrediction(),input={...blankInput(),seq:10,keys:1,aim:[300,-500] as [number,number],pointerActive:true,firing:true};
  const view=combatRenderView(e),seen:any[]=[],events:string[]=[];motion.record(input,0);turret.record(input,0);fire.record(e,input,0,true);
  fn(e,frames,true,(f:any)=>{
   events.push('apply:'+f.tick);motion.receive(e.playerShip,f.acknowledged?.[0]??0,f.tick*20);turret.receive(e,f.tick,0,f.tick*20);fire.receive(e,f.tick,0,f.tick*20);
   motion.render(e.playerShip,input,f.tick*20+5,true);turret.render(e,input,f.tick*20+5,true);fire.render(e,f.tick*20+5,true);
   seen.push(json({hud:hud.capture(e),map:map.capture(e),deployment:deployment.capture(e),fx:e.fxSystem.particles,
    poses:view.ships.map(s=>[s.id,s.interpolatedPos(.5),s.interpolatedFacing(.5),s.getShieldCenter(s.interpolatedPos(.5),s.interpolatedFacing(.5)),s.isVisibleTo(0)]),motion:motion.stats(),fire:fire.stats()}));
   assert.equal(combatRenderView(e),view);
   for(const key of ['movingRayFades','trailStrips','projectileVisuals','projectileFlight','projectilePrediction','localMuzzles','localParticles'])assert.equal(typeof Object.getOwnPropertyDescriptor(view,key)?.get,'function');
  },{...nativeOptions,afterComponentEvents:()=>events.push('components')});
  return {seen,events};
 };
 assert.deepEqual(run(b,apply),run(a,oldApply));
});
test('recipe restore skips unchanged readonly scalar data like native unpack',()=>{
 const f=frame(world(2));f.ships[0].state.auditFixture=dynamic(0,[1,2,3,4]);
 for(const fn of [oldApply,apply]){const e=world(2);fn(e,[f],false,undefined,nativeOptions);const particle=(e.allCapitalShips[0] as any).auditFixture[0];Object.defineProperty(particle,'maxLife',{writable:false});fn(e,[f],false,undefined,nativeOptions);assert.equal(particle.maxLife,1);}
});
test('projectile column direct layouts retain fixed tag precedence, all fields and owned mutable values',()=>{
 const known=JSON.parse(fs.readFileSync('scripts/lib/native-restore-shapes.json','utf8')).filter((k:string[])=>k.includes('ballisticTail'));
 const base=frame(world(2));
 for(const keys of [...known,[...known[0],'unknownExtension']]){
  const f=structuredClone(base),id=f.layouts.length;f.layouts.push(keys);
  const values=keys.map((k:string,i:number)=>k==='id'?10:k==='pos'||k==='vel'||k==='ballisticTail'?{$vector:[3,4]}:k==='facingRad'?0:i%6===0?{$undefined:1}:i%6===1?{$number:'Infinity'}:i%6===2?{nested:[1,2,{$vector:[6,7]}]}:i%6===3?{$vector:[8,9],$undefined:1}:null);
  const cols=keys.map((_:any,i:number)=>i).filter((i:number)=>!['id','pos'].includes(keys[i]));
  const fixed=cols.map((i:number)=>values[i]);
  f.world.projectiles={$projectileColumns:[[id,cols,fixed]],values:[[0,10,{$vector:[3,4]}],[0,11,{$vector:[5,6]}]]};
  const untouched=structuredClone(f.world.projectiles),a=world(2),b=world(2);
  oldApply(a,[f],false,undefined,nativeOptions);apply(b,[f],false,undefined,nativeOptions);assert.deepEqual(b.projectiles,a.projectiles);assert.deepEqual(f.world.projectiles,untouched);
  const first=b.projectiles[0],pos=first.pos;
  for(const e of [a,b]){e.projectiles[0].pos.x=999;const p=e.projectiles[0] as any;for(const key of keys)if(p[key]?.nested)p[key].nested[0]=999;}
  oldApply(a,[f],false,undefined,nativeOptions);apply(b,[f],false,undefined,nativeOptions);assert.equal(b.projectiles[0],first);assert.equal(b.projectiles[0].pos,pos);assert.deepEqual(b.projectiles,a.projectiles);
  // All row widths must be rejected before any projectile gets modified.
  f.world.projectiles.values.push([0]);for(const [fn,e] of [[oldApply,a],[apply,b]] as any[])assert.throws(()=>fn(e,[f],false,undefined,nativeOptions),/Invalid projectile columns/);
 }
});
