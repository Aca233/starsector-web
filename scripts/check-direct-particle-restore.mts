// Reuse all existing hostile/native receiver contracts; only add recipe-specific cases.
import './check-receiver-fields.mts';
import assert from 'node:assert/strict';import {test} from 'node:test';
import {world} from './lib/native-projectile-fixture.mts';
import {captureCombat,applyCombatSnapshots as before} from 'receiver-fields-control';
import {applyCombatSnapshots as after} from 'receiver-fields-candidate';
import {DynamicParticleDecoder as OldDecoder,particleRecipeBudget} from '../src/engine/visual/DynamicParticleRecipe';
import {DynamicParticleDecoder as NewDecoder,directParticleRestoreCounts} from 'direct-particle-recipe';
import {encodeProjectedBinaryFrame,decodeBinaryFrame} from '../src/network/BinarySnapshot.mjs';
import {Vector2} from '../src/engine/math/Vector2';
const native={nativeTargeting:true,nativeProjection:true};
const take=(e:any,t=1)=>captureCombat(e,t,{},0,true,true,true,true,true);
const wire=(e:any,t=1)=>encodeProjectedBinaryFrame(take(e,t),true)!;
const recipes=[
 [1,0,917,10.25,-12.5,100,0,0,0,0,0],
 [1,1,919,10.25,-12.5,8,255,100,50,300,2],
 [1,2,921,10.25,-12.5,8,255,100,50,0,0],
 [1,3,923,10.25,-12.5,8,0,0,0,0,0],
];
const packet=(source:any,tick:number,steps=0,residual=false)=>{
 const f:any=decodeBinaryFrame(wire(source,tick));
 const rows=recipes.flatMap((r,k)=>Array.from({length:8},(_,i)=>[k,i,steps,residual?[15|16|128,0,42,7,0]:[-0,42,7,-0]]));
 f.world.fxSystem={particles:{$dynamicParticles:[2,structuredClone(recipes),rows]}};return f;
};
const applyPair=(a:any,b:any,f:any,reset=false)=>{
 before(a,[f],reset,undefined,native);after(b,[f],reset,undefined,native);
 assert.deepEqual(wire(b),wire(a));assert.deepEqual(b.fxSystem.particles,a.fxSystem.particles);
};
test('complete 22-ship trajectory uses direct recipe restore without changing the authority or restored world',()=>{
 const source=world(),a=world(),b=world();for(const s of source.allCapitalShips){s.pos.scale(.2);s.prevPos.copy(s.pos);s.fireControlMode='AI';}
 const oldCount=directParticleRestoreCounts.rows;
 for(let tick=1;tick<=900;tick++){
  source.fixedUpdate(1/60);if(tick%6)continue;
  const frame=decodeBinaryFrame(wire(source,tick)),rng=JSON.stringify([source.random,source.visualRandom]);applyPair(a,b,frame,tick===6);
  assert.equal(JSON.stringify([source.random,source.visualRandom]),rng);assert.deepEqual(encodeProjectedBinaryFrame(frame,true),wire(source,tick));
 }
 assert.ok(directParticleRestoreCounts.rows-oldCount>1000);console.log('direct restored rows',directParticleRestoreCounts.rows-oldCount);
});
test('all four families, absolute/residual signed-zero motion, cold/repeated/skipped/backward restore',()=>{
 const source=world(2);for(const residual of [false,true]){
  const a=world(2),b=world(2);
  for(const [n,steps]of [0,1,17,17,90,3,0,256].entries()){
   const f=packet(source,n+1,steps,residual);applyPair(a,b,f,n===0);
   assert.ok(Object.is(b.fxSystem.particles[0].pos.x,-0));assert.ok(Object.is(b.fxSystem.particles[0].vel.y,-0));
   const coldA=world(2),coldB=world(2);applyPair(coldA,coldB,f,true);
  }
 }
});
test('recipe cache never aliases colors/points/vectors or peer/packet objects; reused target identities survive',()=>{
 const source=world(2),a=world(2),b=world(2),other=world(2),f=packet(source,1,17,true),copy=structuredClone(f);
 applyPair(a,b,f,true);after(other,[f],true,undefined,native);
 const p=b.fxSystem.particles[8],pos=p.pos,color=p.color,points=p.points;
 p.pos.x=1234;p.color[0]=1234;if(p.points.length)p.points[0].x=1234;
 assert.notEqual(other.fxSystem.particles[8].pos.x,1234);assert.notEqual(other.fxSystem.particles[8].color[0],1234);assert.deepEqual(f,copy);
 applyPair(a,b,f);assert.equal(b.fxSystem.particles[8].pos,pos);assert.equal(b.fxSystem.particles[8].color,color);assert.equal(b.fxSystem.particles[8].points,points);
});
test('bad later rows retain identical applied prefix, error and recovery; budgets are not loosened',()=>{
 const source=world(2);
 for(const corrupt of [
  (v:any)=>{v[2][5][0]=999;},(v:any)=>{v[2][5][1]=128;},(v:any)=>{v[2][5][2]=257;},
  (v:any)=>{v[2][5][3]=[Infinity,0,0,0];},(v:any)=>{v[2][5][3]=[16,0,0,0,0];},
  (v:any)=>{v[1][1][5]=129;},(v:any)=>{v[1]=Array(129).fill(recipes[0]);},
  (v:any)=>{v[2]=Array.from({length:4097},()=>[0,0,0,[0,0,0,0]]);},
  (v:any)=>{v[1]=Array.from({length:10},(_,i)=>[1,1,917+i,0,0,128,255,100,50,0,0]);v[2]=v[1].map((_:any,i:number)=>[i,0,256,[0,0,0,0]]);},
 ]){
  const a=world(2),b=world(2),f=packet(source,1);corrupt(f.world.fxSystem.particles.$dynamicParticles);
  const run=(fn:any,e:any)=>{try{fn(e,[f],false,undefined,native);return null;}catch(err){return [err.name,err.message];}};
  const old=run(before,a),next=run(after,b);assert.ok(old);assert.deepEqual(next,old);assert.deepEqual(wire(b),wire(a));
  applyPair(a,b,packet(source,2,1),true);
 }
});
test('depth errors and custom retained Vector2.set callbacks preserve ordering and prefix',()=>{
 const source=world(2);
 for(const depth of [58,59,60,61,62,63,64,65]){
  const f=packet(source,1),leaf=f.world.fxSystem.particles;delete f.world.fxSystem;let nested=leaf;for(let i=0;i<depth;i++)nested={nested};f.world.fixture=nested;
  const run=(fn:any)=>{const e:any=world(2);let error=null;try{fn(e,[f],false,undefined,native);}catch(err){error=[err.name,err.message];}return {error,fixture:e.fixture};};assert.deepEqual(run(after),run(before));
 }
 for(const throwing of [false,true]){
  const run=(fn:any)=>{const e:any=world(2),f=packet(source,1,3,true),calls:any[]=[];fn(e,[f],true,undefined,native);const p=e.fxSystem.particles[0],set=Vector2.prototype.set;
   p.pos.set=function(x:number,y:number){calls.push(['pos',x,y]);return set.call(this,x,y);};p.vel.set=function(x:number,y:number){calls.push(['vel',x,y]);if(throwing)throw Error('fixture set failure');return set.call(this,x,y);};
   let error=null;try{fn(e,[f],false,undefined,native);}catch(err){error=[err.name,err.message];}return {calls,error,wire:wire(e)};};assert.deepEqual(run(after),run(before));
 }
});
test('default decoder API and generic snapshot application remain unchanged',()=>{
 const a=new OldDecoder(),b=new NewDecoder();
 for(const r of recipes)for(const steps of [0,8,80,2])for(const motion of [undefined,[1,2,3,4],[15,1,2,3,4]]){
  const ba=particleRecipeBudget(),bb=particleRecipeBudget();assert.deepEqual(b.expand(r,0,steps,bb,motion),a.expand(r,0,steps,ba,motion));assert.deepEqual(bb,ba);
 }
 const source=world(2),ea=world(2),eb=world(2),f=packet(source,1),count=directParticleRestoreCounts.rows;
 before(ea,[f]);after(eb,[f]);assert.deepEqual(wire(eb),wire(ea));assert.equal(directParticleRestoreCounts.rows,count);
});
test('frame-local recipe plans revalidate every scalar mutation and retain custom array operations',()=>{
 const source=world(2);
 for(const mutation of ['seed','invalid','zero','map','iterator']){
  const run=(fn:any)=>{
   const e:any=world(2),f=packet(source,1,3,true),calls:any[]=[];fn(e,[f],true,undefined,native);
   const r=f.world.fxSystem.particles.$dynamicParticles[1][0];const p=e.fxSystem.particles[0],set=Vector2.prototype.set;
   p.pos.set=function(x:number,y:number){calls.push('set');
    if(mutation==='seed')r[2]=925;else if(mutation==='invalid')r[5]=0;else if(mutation==='zero')r[6]=-0;
    else if(mutation==='map')r.map=function(...args:any[]){calls.push('map');return Array.prototype.map.apply(this,args);};
    else r[Symbol.iterator]=function*(){calls.push('iterator');yield* Array.prototype[Symbol.iterator].call(this);};
    return set.call(this,x,y);
   };
   let error=null;try{fn(e,[f],false,undefined,native);}catch(err){error=[err.name,err.message];}
   return {calls,error,wire:wire(e)};
  };
  assert.deepEqual(run(after),run(before),mutation);
 }
 assert.ok(directParticleRestoreCounts.recipeHits>0);assert.ok(directParticleRestoreCounts.recipeMisses>0);
 console.log('recipe plans',directParticleRestoreCounts);
});
