import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { SimulationRandom } from '../src/engine/simulation/SimulationRandom';
import { Vector2 } from '../src/engine/math/Vector2';
import { createExplosionPuffs } from '../src/engine/visual/ExplosionVisuals';
import { enableExplosionPuffRecipes, explosionPuffRecipe } from '../src/engine/visual/ExplosionPuffRecipe';
import { ExplosionPuffDecoder, puffRecipeBudget, reservePuffRecipe, MAX_FRAME_RECIPE_PUFFS } from '../src/network/ExplosionPuffCodec';
import { createLanWorld } from '../src/network/LanWorld';
import { assetManager } from '../src/engine/assets/AssetResolver';
import { captureHostCombat, configureHostCosmetics } from '../src/network/HostSnapshot';
import { applyCombatSnapshot, captureCombat } from '../src/network/CombatSnapshot';
import { encodeProjectedBinaryFrame, encodeBinaryState, decodeBinaryState } from '../src/network/BinarySnapshot.mjs';
import { SteamSnapshotEncoder, SteamSnapshotSender, SteamSnapshotReceiver } from '../server/steam/snapshot-delta.mjs';
import { SteamPacketCodec } from '../server/steam/packet-codec.mjs';

const publicRoot=path.resolve('public');
globalThis.fetch=async(input:any)=>{
 const p=path.resolve(publicRoot,String(input).replace(/^\//,''));if(!p.startsWith(publicRoot+path.sep))throw Error('Outside fixture assets');
 return new Response(fs.readFileSync(p),{status:200});
};
await assetManager.ensureManifestLoaded();
const match:any={id:'puff-test',seed:1511506142,hostId:'p0',snapshotHz:60,players:[{id:'p0',name:'a',seat:0,team:0,hull:'hammerhead',design:null},{id:'p1',name:'b',seat:1,team:1,hull:'hammerhead',design:null}],options:{aiHulls:[[],[]],assignment:'teams',battleSize:3200,initialDeploymentLimit:null}};
const make=()=>createLanWorld(match).engine;
function generated(seed=123,diameter=180){const r=new SimulationRandom(seed);enableExplosionPuffRecipes(r);const puffs=createExplosionPuffs(diameter,r,true,new Vector2(14,-29));return{puffs,recipe:explosionPuffRecipe(puffs)!,random:r};}

test('recording/replaying native puffs preserves every number and subsequent RNG samples',()=>{
 for(const cursor of [0,123,0xffffffff,2**53+10])for(const diameter of [1,30,180,1000,1e6])for(const rings of [true,false]){
  const a=SimulationRandom.fromCursor(cursor),b=SimulationRandom.fromCursor(cursor);enableExplosionPuffRecipes(b);
  const expected=createExplosionPuffs(diameter,a,rings,new Vector2(-5,6)),actual=createExplosionPuffs(diameter,b,rings,new Vector2(-5,6));
  assert.deepEqual(actual,expected);const recipe=explosionPuffRecipe(actual);assert.ok(recipe);
  assert.deepEqual(createExplosionPuffs(recipe[1],SimulationRandom.fromCursor(recipe[2]),recipe[3]===1,new Vector2(recipe[4],recipe[5])),expected);
  assert.equal(a.next(),b.next());assert.equal(a.nextNumericId(),b.nextNumericId());
 }
});
test('ordinary non-network effects and custom RNG/vector methods retain ordinary capture',()=>{
 assert.equal(explosionPuffRecipe(createExplosionPuffs(180,new SimulationRandom(1),true)),null);
 const r=new SimulationRandom(1);enableExplosionPuffRecipes(r);r.next=()=>.25;assert.equal(explosionPuffRecipe(createExplosionPuffs(180,r,true)),null);
 const native=new SimulationRandom(1);enableExplosionPuffRecipes(native);const v=new Vector2();v.clone=()=>new Vector2(1,2);
 assert.equal(explosionPuffRecipe(createExplosionPuffs(180,native,true,v)),null);
});
test('mutation, reordered rows, new fields and getters fall back, without freezing mod-owned values',()=>{
 for(const mutate of [(p:any)=>p[0].offset.x++, (p:any)=>p.reverse(),(p:any)=>p[0].extra=7,(p:any)=>Object.defineProperty(p[0],'startSize',{get:()=>19,enumerable:true})]){
  const {puffs}=generated();assert.ok(explosionPuffRecipe(puffs));mutate(puffs);assert.equal(explosionPuffRecipe(puffs),null);
 }
 const {puffs,recipe}=generated();recipe[1]=10;assert.equal(explosionPuffRecipe(puffs)![1],180);
});
test('recipe validation, aggregate amplification limits and private bounded cache',()=>{
 const d=new ExplosionPuffDecoder(),{recipe}=generated();
 for(const bad of [null,[],[2,180,1,1,0,0],[1,Infinity,1,1,0,0],[1,180,1.5,1,0,0],[1,180,1,2,0,0],[1,180,1,1,NaN,0],[1,1e9,1,1,0,0]])assert.throws(()=>d.expand(bad,puffRecipeBudget()));
 const budget=puffRecipeBudget();reservePuffRecipe(budget,MAX_FRAME_RECIPE_PUFFS);assert.throws(()=>d.expand(recipe,budget));
 const wire:any=d.expand(recipe,puffRecipeBudget());assert.throws(()=>wire[0][4].$vector[0]=99);
 for(let i=0;i<400;i++)d.expand([1,10000,i,1,0,0],puffRecipeBudget());
 assert.ok(d.retainedPuffs<=MAX_FRAME_RECIPE_PUFFS);assert.ok(d.retainedRecipes<=128);
});
test('LAN binary and Steam reliable delta restore the same explosion world through shared production capture',()=>{
 const host=make(),baseline=make(),lan=make(),steam=make(),muzzle=configureHostCosmetics(host);
 const encoder=new SteamSnapshotEncoder(),sender=new SteamSnapshotSender(),receiver=new SteamSnapshotReceiver(),codec=new SteamPacketCodec(),decoder=new SteamPacketCodec();
 let recipes=0;
 for(let tick=1;tick<=100;tick++){
  if(tick%7===1)host.fxSystem.spawnAuthenticExplosion(new Vector2(tick,0),90,[250,100,20],true,new Vector2(5,-2));
  host.fxSystem.update(1/60);host.combatTime=tick/60;
  const old=captureHostCombat(host,tick,{0:tick,1:tick},0,muzzle,false),compact=captureHostCombat(host,tick,{0:tick,1:tick},0,muzzle,true);
  if(JSON.stringify(compact).includes('$explosionPuffs'))recipes++;
  const binary=encodeBinaryState(match.id,tick,encodeProjectedBinaryFrame(compact));
  applyCombatSnapshot(baseline,JSON.parse(JSON.stringify(old)));
  applyCombatSnapshot(lan,decodeBinaryState(binary).frame);
  const state={type:'state',matchId:match.id,seq:tick,frame:compact},choice=sender.prepare(JSON.stringify(state),encoder,codec,tick*17);
  let received:any;for(const p of codec.frame('1'.repeat(32),'data',choice.prepared).packets)received=decoder.receive('test',p,tick*17);
  sender.commit(choice);const restored=receiver.receive(received.data);assert.equal(restored.needsFull,false);applyCombatSnapshot(steam,restored.data.frame);
  assert.deepEqual(lan.fxSystem.explosions,baseline.fxSystem.explosions);assert.deepEqual(steam.fxSystem.explosions,baseline.fxSystem.explosions);
  if(tick===20){lan.fxSystem.explosions[0].puffs![0].offset.x=123456;steam.fxSystem.explosions[0].puffs![0].offset.x=123456;}
 }
 assert.ok(recipes>80);
 // New viewer/reconnect and a skipped interval need no previous recipe frame.
 const fresh=make(),last=captureHostCombat(host,200,{0:200,1:200},0,muzzle,true);applyCombatSnapshot(fresh,JSON.parse(JSON.stringify(last)),true);
 assert.deepEqual(fresh.fxSystem.explosions,baseline.fxSystem.explosions);
 host.fxSystem.clear();applyCombatSnapshot(fresh,captureHostCombat(host,201,{0:201,1:201},0,muzzle,true));assert.equal(fresh.fxSystem.explosions.length,0);
});
test('shared host setup preserves existing muzzle events and original full capture fallback',()=>{
 const host=make(),events=configureHostCosmetics(host);host.fxSystem.spawnAuthenticExplosion(new Vector2(),80,[255,0,0]);
 (host.playerShip as any).debugPuffs=host.fxSystem.explosions[0].puffs;
 const frame=captureHostCombat(host,1,{0:0,1:0},0,events);assert.ok(frame.muzzleEvents);assert.equal((JSON.stringify(frame).match(/\$explosionPuffs/g)??[]).length,1); // same array outside the explosion path stays generic.
 assert.ok(!JSON.stringify(captureCombat(host,1,{0:0,1:0},0,true)).includes('$explosionPuffs'));
 host.fxSystem.explosions[0].puffs![0].startSize++;
 const fallback=captureHostCombat(host,2,{0:0,1:0},0,events);assert.ok(!JSON.stringify(fallback).includes('$explosionPuffs'));
 const guest=make(),full=make();applyCombatSnapshot(guest,JSON.parse(JSON.stringify(fallback)));applyCombatSnapshot(full,JSON.parse(JSON.stringify(captureHostCombat(host,2,{0:0,1:0},0,events,false))));assert.deepEqual(guest.fxSystem.explosions,full.fxSystem.explosions);
});


test('getters are not read during recipe validation and replaced vectors are never inspected',()=>{
 for(const field of ['puff','scalar','vector','coordinate']){
  const {puffs}=generated();let reads=0;
  const [object,key,value]=field==='puff'?[puffs,'0',puffs[0]]:field==='scalar'?[puffs[0],'startSize',puffs[0].startSize]:field==='vector'?[puffs[0],'offset',puffs[0].offset]:[puffs[0].offset,'x',puffs[0].offset.x];
  Object.defineProperty(object,key,{enumerable:true,configurable:true,get(){reads++;return value;}});
  assert.equal(explosionPuffRecipe(puffs),null);assert.equal(reads,0,field);
 }
 const {puffs}=generated();let traps=0;
 puffs[0].offset=new Proxy(puffs[0].offset,{get(){traps++;throw Error('must not read replacement');},getPrototypeOf(){traps++;throw Error('must not inspect replacement');}});
 assert.equal(explosionPuffRecipe(puffs),null);assert.equal(traps,0);
 const ordinary=generated();const x=ordinary.puffs[0].offset.x;
 Object.defineProperty(ordinary.puffs[0].offset,'x',{set(_v){},enumerable:true});
 assert.equal(explosionPuffRecipe(ordinary.puffs),null);assert.ok(Number.isFinite(x));
});

test('recipe registration leaves 720 real simulation ticks and subsequent RNG/IDs unchanged',()=>{
 const battle={...match,options:{...match.options,aiHulls:[Array(3).fill('hammerhead'),Array(3).fill('hammerhead')]}};
 const wa=createLanWorld(battle),wb=createLanWorld(battle),a=wa.engine,b=wb.engine,ma=configureHostCosmetics(a,false),mb=configureHostCosmetics(b,true);
 for(const world of [wa,wb])for(const ship of world.controlled.values())world.engine.externallyControlledShipIds.add(ship.id);
 let totalExplosions=0;
 for(let tick=1;tick<=720;tick++){
  for(const engine of [a,b]){
   engine.fixedUpdate(1/60);
   if(tick%120===0)engine.fxSystem.spawnAuthenticExplosion(new Vector2(tick,-tick),700,[255,150,90],true,new Vector2(12,-4));
  }
  if(tick%30===0){
   assert.deepEqual(captureHostCombat(b,tick,{0:0,1:0},0,mb,false),captureHostCombat(a,tick,{0:0,1:0},0,ma,false));
   totalExplosions+=b.fxSystem.explosions.length;
  }
 }
 assert.ok(totalExplosions>0);
 assert.equal(a.visualRandom.next(),b.visualRandom.next());
 assert.equal(a.visualRandom.nextNumericId(),b.visualRandom.nextNumericId());
});
