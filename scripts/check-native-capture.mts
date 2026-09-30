import {validateDisplayDefinition as controlDefinition} from 'display-definition-control';
import {validateDisplayDefinition} from '../src/network/display/DisplayDefinition';
import displayRestoreShapes from './lib/display-restore-shapes.json';
import { displayRecordRestorer } from '../src/network/DisplayRecordRestore.generated';
import { initializeLanDisplayWorld as controlDisplayWorld, applyLanDisplaySnapshot as controlDisplayApply } from 'display-snapshot-control';
import { assertDataField as controlDataField, unpackDisplay as controlUnpackDisplay, unpackDisplayProjectiles as controlUnpackProjectiles } from 'display-codec-control';
import { assertDataField, unpackDisplay, unpackDisplayProjectiles, displayLayouts } from '../src/network/DisplaySnapshotCodec';
import { ExplosionPuffDecoder } from '../src/network/ExplosionPuffCodec';
import { serialize } from 'node:v8';
import { LanShipProjection } from '../src/network/display/LanShipProjection';
import { BaselineLanShipProjection } from './lib/lan-ship-projection-baseline';
import { RenderShipProjection } from '../src/engine/runtime/local/RenderShipProjection';
import { captureLanDisplayCombat } from '../src/network/HostSnapshot';
import { applyLanDisplaySnapshot, applyLanDisplaySnapshots, projectileSnapshotTick as displayProjectileTick } from '../src/network/LanDisplaySnapshot';
import { LanDisplayWorld } from '../src/network/LanDisplayWorld';
import { createLanDisplayWorld } from '../src/network/LanDisplayBootstrap';
import { setLanPerspective } from '../src/network/LanWorld';
import { CombatEngine } from '../src/engine/simulation/CombatEngine';
import { ProjectedRenderShip, renderWeaponRange } from '../src/engine/runtime/local/RenderShipProjection';
import { TacticalMapViewProjector } from '../src/engine/runtime/TacticalMapView';
import { DeploymentViewProjector } from '../src/engine/runtime/DeploymentView';
import { setProjectileFlightLayer } from '../src/engine/render/ProjectileFlightLayer';
import { setPredictedProjectileLayer } from '../src/engine/render/PredictedProjectileLayer';
import { setLocalMuzzleLayer } from '../src/engine/render/LocalMuzzleLayer';
import { setLocalParticleLayer } from '../src/engine/render/LocalParticleLayer';
import {combatRenderView} from '../src/engine/render/CombatRenderView';
import {DynamicParticleDecoder,particleRecipeBudget,enableDynamicParticleRecipes,particleRecipeRow} from "../src/engine/visual/DynamicParticleRecipe";
import {SimulationRandom} from "../src/engine/simulation/SimulationRandom";
import {CombatFXSystem} from "../src/engine/simulation/systems/CombatFXSystem";
import {deflateRawSync} from "node:zlib";
import {captureCriticalCombat,CriticalCombatReplica} from "../src/network/CriticalCombatReplica";
import {decodeCombatState} from "../src/network/CriticalCombatState.mjs";
import {withoutBulkProjectiles} from '../src/network/ProjectileBulkVariant.mjs';
import {projectileSnapshotTick} from '../src/network/AuthorityCombatSnapshot';
import {projectileVisualLayer} from '../src/engine/render/ProjectileVisualLayer';
import {missileIdentification} from '../src/engine/visual/IdentificationVisuals';
import {collectCombatTextureUrls} from '../src/engine/assets/CombatAssetClosure';
import {ProjectileVisualReplica} from '../src/network/ProjectileVisualReplica';
import {AnchoredProjectilePublisher} from '../src/network/AnchoredProjectileVisual.mjs';
import {captureProjectileState} from '../src/network/CaptureProjectiles';
import {expandSnapshotProjectiles} from '../src/network/ProjectileProjection';
import {ProjectileEventSender,ProjectileEventReceiver} from '../src/network/ProjectileEventStream.mjs';
import {Vector2} from '../src/engine/math/Vector2';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {createLanWorld} from '../src/network/LanWorld';
import {assetManager} from '../src/engine/assets/AssetResolver';
import {captureHostCombat,captureAuthorityCombat,configureHostCosmetics} from '../src/network/HostSnapshot';
import {captureCombat,applyCombatSnapshot} from '../src/network/AuthorityCombatSnapshot';
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
    const t=plan.templates[row[0]],values=t.fixed.slice();t.dynamic.forEach((offset,col)=>{if(offset)values[col]=row[offset];});
    return Object.fromEntries(t.keys.map((k,i)=>[k,expand(values[i])]));
   });
  }
  return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,expand(x)]));
 };
 const {layouts:_layouts,...rest}=frame;return expand(rest);
}
const engine=createLanWorld(match()).engine,muzzle=configureHostCosmetics(engine);
// This legacy native-vs-generic parity check explicitly retains authority work fields.
// The production pruned read-set is covered by check-native-capture-plans.
const capture=(tick:number,native:boolean)=>native ? captureAuthorityCombat(engine,tick,{0:tick,1:tick},0,muzzle,false,false,false,false,false,false,false) : captureHostCombat(engine,tick,{0:tick,1:tick},0,muzzle);
test('native capture retains complete visible projection, event windows and real receiver state through 32-ship combat',()=>{
 const a=createLanWorld(match()).engine,b=createLanWorld(match()).engine;
 let display:LanDisplayWorld|undefined;
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
  const displayFrame=decodeBinaryFrame(encodeProjectedBinaryFrame(captureLanDisplayCombat(engine,tick,{0:tick,1:tick},0,muzzle,false,true),true)!);
  if(!display)display=createLanDisplayWorld(match(),0,displayFrame).world;
  else applyLanDisplaySnapshot(display,displayFrame,tick%180===0);
  assert.deepEqual(display.ships.map(ship=>[ship.id,ship.pos,ship.prevPos,ship.hullHp,ship.currentTargetShip?.id]),b.ships.map(ship=>[ship.id,ship.pos,ship.prevPos,ship.hullHp,ship.currentTargetShip?.id]),'detached viewer at '+tick);
  assert.deepEqual(display.projectiles,b.projectiles); assert.deepEqual(display.beams,b.beams);
  const render=display.renderView(); assert.ok(render.playerShip instanceof ProjectedRenderShip);
  for(const hulk of render.hulkFragments)assert.ok(hulk.sourceShip instanceof ProjectedRenderShip);
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

test('independent projectile capture and revision events preserve the real authority projection',()=>{
 const sender=new ProjectileEventSender('real-projection'),receiver=new ProjectileEventReceiver('real-projection');let samples=0;
 for(let tick=1201;tick<=1230;tick++){
  engine.fixedUpdate(1/60);if(tick%3)continue;
  const raw=captureProjectileState(engine,tick);assert.ok(raw);
  const full=captureAuthorityCombat(engine,tick,{0:tick},0,null);
  assert.deepEqual(raw.rows,expandSnapshotProjectiles(full));
  const choice=sender.prepare(raw),back=receiver.receive(choice.bytes);assert.deepEqual(back.rows,raw.rows);assert.ok(sender.commit(choice));samples+=back.rows.length;
 }
 assert.ok(samples>0,'real battle must exercise nonempty projectile entities');
});
test('authority interpolation endpoints are redundant: old/new projection restore identical viewer endpoints',()=>{
 const authority=createLanWorld(match(2)).engine,a=createLanWorld(match(2)).engine,b=createLanWorld(match(2)).engine;
 const projectile:any={id:.123456789,specId:'pulse',sourceShipId:authority.playerShip.id,pos:new Vector2(1,2),prevPos:new Vector2(-100,-100),vel:new Vector2(60,0),elapsedTime:0,radius:1,damage:5,damageType:'ENERGY',rangeRemaining:100,totalRange:100,color:[1,2,3],ballisticTail:new Vector2(0,2),prevBallisticTail:new Vector2(-50,-50),fadeProgress:.2,prevFadeProgress:.1};
 authority.projectiles.push(projectile);
 const endpoints=(e:any)=>({ships:e.allCapitalShips.map((s:any)=>[s.id,s.pos,s.prevPos,s.facingRad,s.prevFacingRad]),projectiles:e.projectiles.map((p:any)=>[p.id,p.pos,p.prevPos,p.ballisticTail,p.prevBallisticTail,p.fadeProgress,p.prevFadeProgress])});
 for(let tick=0;tick<5;tick++){
  authority.playerShip.pos.x+=10;if(tick===3)authority.playerShip.teleportSequence++;
  projectile.pos.x+=10;projectile.ballisticTail.x+=8;projectile.fadeProgress+=.1;
  if(tick===2)authority.projectiles.push({...projectile,id:.5,pos:new Vector2(500,500),ballisticTail:new Vector2(400,500)});
  if(tick===3)authority.projectiles.reverse();if(tick===4)authority.projectiles.splice(0,1);
  const modern=captureAuthorityCombat(authority,tick,{0:tick},0,null),rows=expandSnapshotProjectiles(modern);
  for(const row of [...modern.ships,...modern.crafts]){assert.ok(!Object.hasOwn(row.state,'prevPos'));assert.ok(!Object.hasOwn(row.state,'prevFacingRad'));}
  for(const p of rows)for(const key of ['prevPos','prevBallisticTail','prevFadeProgress'])assert.ok(!Object.hasOwn(p,key));
  const legacy=structuredClone(modern);for(const row of [...legacy.ships,...legacy.crafts]){row.state.prevPos={$vector:[-9999,-9999]};row.state.prevFacingRad=-99;}
  legacy.world.projectiles=rows.map(p=>({...p,prevPos:{$vector:[-7777,-7777]},prevBallisticTail:{$vector:[-8888,-8888]},prevFadeProgress:.999}));
  applyCombatSnapshot(a,legacy,tick===0);applyCombatSnapshot(b,modern,tick===0);assert.deepEqual(endpoints(a),endpoints(b),'same first/continuous/new/reordered/deleted/teleported endpoints at '+tick);
 }
});
import {projectProjectileVisual} from '../src/network/ProjectileVisualProjection.mjs';
import {ProjectileVisualSender,ProjectileVisualReceiver} from '../src/network/ProjectileVisualCodec.mjs';
import {packProjectileVisual,unpackProjectileVisual,PROJECTILE_VISUAL_COLUMNS} from '../src/network/ProjectileVisualColumns.mjs';
import {WebGLProjectilePass} from '../src/engine/render/webgl/passes/WebGLProjectilePass';
import {missileEngineVisual} from '../src/engine/visual/MissileEngineVisuals';
import {appendMissileContrail} from '../src/engine/simulation/MissileContrails';
test('visual codec preserves actual native projectile draw dependencies without running guest simulation',()=>{
 const sender=new ProjectileVisualSender('native-visual'),receiver=new ProjectileVisualReceiver('native-visual'),pass=new WebGLProjectilePass();let entities=0,draws=0;const types=new Set();
 const restore=(v:any):any=>{
  if(v===null||typeof v!=='object')return v;if(Array.isArray(v))return v.map(restore);
  if(v.$undefined===1)return undefined;if(v.$vector)return new Vector2(...v.$vector as [number,number]);
  return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,restore(x)]));
 };
 const materialize=(row:any)=>{const p=restore(row);p.prevPos=p.pos.clone();if(p.ballisticTail)p.prevBallisticTail=p.ballisticTail.clone();p.prevFadeProgress=p.fadeProgress;return p;};
 const trace=(projectiles:any[],override?:any)=>{
  const calls:any[]=[],copy=(v:any):any=>v&&typeof v==='object'?(Array.isArray(v)?v.map(copy):Object.fromEntries(Object.entries(v).map(([k,x])=>[k,copy(x)]))):v;
  const record=(name:string)=>(...args:any[])=>calls.push([name,...args.map(copy)]);
  const batcher=new Proxy({currentViewProj:null},{get:(obj,key:string)=>key in obj?(obj as any)[key]:record(key)});
  const ribbon=new Proxy({},{get:(_obj,key:string)=>record(key)});
  const ctx:any={alpha:1,batcher,ribbonBatcher:ribbon,hitGlowTex:'hit',textures:{getTexture:(url:string)=>url,getTextureInfo:(url:string)=>({texture:url,width:32,height:128})}};
  // The detached projection must NOT borrow the source sidecars: otherwise the
  // native and decoded traces would both render the same source projectiles.
  const shadow=Object.create(combatRenderView(engine),{projectiles:{value:projectiles},projectileVisuals:{value:undefined},projectilePrediction:{value:undefined}});pass.renderProjectilesAndMuzzle(override?combatRenderView(override):shadow,ctx);return calls;
 };
 for(let tick=1231;tick<=1260;tick++){
  engine.fixedUpdate(1/60);if(tick%3)continue;
  const rng=JSON.stringify([engine.random,engine.visualRandom]),raw=captureProjectileState(engine,tick)!;assert.ok(raw);
  const exact=raw.rows.map(projectProjectileVisual).map(materialize),nativeCalls=trace(engine.projectiles),projectedCalls=trace(exact);
  // lerp(a,b,1) may differ from lerp(b,b,1) by floating roundoff because
  // the native pass retains its previous simulation endpoint. No broad visual
  // tolerance here: shapes/strings/keys exact, numeric difference <=1e-10.
  const close=(a:any,b:any):void=>{if(typeof a==='number'&&typeof b==='number'){assert.ok(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-10);return;}if(a&&b&&typeof a==='object'&&typeof b==='object'){assert.deepEqual(Object.keys(a),Object.keys(b));for(const k of Object.keys(a))close(a[k],b[k]);}else assert.deepEqual(a,b);};
  close(projectedCalls,nativeCalls);draws+=nativeCalls.length;
  for(let i=0;i<exact.length;i++){
   for(const team of [0,1,2])close(missileIdentification(exact[i],team,1),missileIdentification(engine.projectiles[i],team,1));
   assert.deepEqual(missileEngineVisual(exact[i]),missileEngineVisual(engine.projectiles[i]));
   const a:any[]=[],b:any[]=[];appendMissileContrail({isEnabled:true,addPoint:(...args:any[])=>a.push(args)} as any,engine.projectiles[i]);appendMissileContrail({isEnabled:true,addPoint:(...args:any[])=>b.push(args)} as any,exact[i]);assert.deepEqual(b,a);
   types.add(engine.projectiles[i].spawnType);
  }
  const choice=sender.prepare(raw),back=receiver.receive(choice.bytes);assert.ok(sender.commit(choice));assert.deepEqual(back.rows,raw.rows.map(r=>unpackProjectileVisual(packProjectileVisual(r))));
  for(let i=0;i<back.rows.length;i++)for(const [key,axis,scale]of PROJECTILE_VISUAL_COLUMNS){const before:any=raw.rows[i][key],after=back.rows[i][key];const v=axis===null?before:before?.$vector?.[axis],w=axis===null?after:after?.$vector?.[axis];if(typeof v==='number')assert.ok(Math.abs(v-w)<=.5/scale+1e-9,key);}
  trace(back.rows.map(materialize));
  const beforeArray=engine.projectiles,view=new ProjectileVisualReplica('native-layer'),publication=new AnchoredProjectilePublisher('native-layer').publish(raw);
  view.receive(publication.key,'baseline',publication.baseline,0,0);view.render(engine,0,0);
  close(trace(engine.projectiles,engine),trace(back.rows.map(materialize)));
  assert.equal(engine.projectiles,beforeArray,'render layer never invokes the delegated weapon-system setter');view.clear();
  assert.equal(JSON.stringify([engine.random,engine.visualRandom]),rng);assert.deepEqual(captureProjectileState(engine,tick),raw,'authority not advanced or mutated');entities+=back.rows.length;
 }
 assert.ok(entities>0&&draws>0);assert.ok(types.has('MISSILE')&&types.has('BALLISTIC'),'native source covers guided and straight families');
 console.log(JSON.stringify({visualProjectionEntities:entities,drawCalls:draws,families:[...types],scope:'Actual native objects and draw-call inputs, stub GPU/texture sizes; not pixel/visual equivalence or network Hz'}));
});

test('compact world preserves all non-projectile authority and cannot supersede newer read-only visual entities',()=>{
 const original=captureAuthorityCombat(engine,2000,{},0,null),compact=withoutBulkProjectiles(original),world=createLanWorld(match()).engine,view=new ProjectileVisualReplica('split-world'),publisher=new AnchoredProjectilePublisher('split-world');
 assert.notEqual(compact.world,original.world);assert.equal(compact.ships,original.ships);assert.equal(compact.world.mineSystem,original.world.mineSystem);assert.equal(compact.world.beams,original.world.beams);assert.ok(expandSnapshotProjectiles(original).length>0);
 applyCombatSnapshot(world,original,true);assert.equal(projectileSnapshotTick(world),2000);assert.ok(world.projectiles.length>0);
 const rows=expandSnapshotProjectiles(original),p=publisher.publish({tick:2003,time:original.world.combatTime+.05,rows});view.receive(p.key,'baseline',p.baseline,0,0);
 applyCombatSnapshot(world,{...compact,tick:2006},false);assert.equal(world.projectiles.length,0);assert.equal(projectileSnapshotTick(world),2000);view.render(world,0,projectileSnapshotTick(world));assert.equal(projectileVisualLayer(world)?.projectiles.length,rows.length);
 const images=collectCombatTextureUrls(world);for(const row of rows)if(row.projSpriteUrl&&typeof row.projSpriteUrl==='string')assert.ok(images.includes(row.projSpriteUrl));
 applyCombatSnapshot(world,{...original,tick:2010},false);view.render(world,50,projectileSnapshotTick(world));assert.equal(projectileVisualLayer(world),undefined);assert.ok(world.projectiles.length>0);view.clear();
 assert.throws(()=>applyCombatSnapshot(world,{...compact,world:{...compact.world,projectiles:[{}]}},false));
});

test('critical combat mirror is exact, side-effect free and cannot be rolled back by an older whole-world restore',()=>{
 const source=createLanWorld(match(2)).engine,view=createLanWorld(match(2)).engine,replica=new CriticalCombatReplica();
 const original=captureHostCombat(source,1,{0:1,1:1},0,null);
 const ship=source.playerShip;ship.hullHp=321.123456789;ship.currentCR=.4321;ship.isDead=true;ship.retreating=true;ship.isRetreated=true;
 ship.flux.softFlux=100.123;ship.flux.hardFlux=900.234;ship.flux.isOverloaded=true;ship.flux.overloadTimer=3.25;ship.flux.overloadDuration=5;ship.flux.isVenting=true;ship.flux.ventProgress=.73;
 ship.shield.isActive=false;ship.shield.currentArcDeg=88.125;ship.shield.facingAngleRad=-0;(ship.shield as any).closeTimeRemaining=.2;
 ship.shield.phaseState='OUT';ship.shield.phaseEffectLevel=.45;(ship.shield as any).phaseStageTimer=.125;
 const before=captureHostCombat(source,9,{0:9,1:9},0,null),bytes=captureCriticalCombat(source,9)!;
 assert.ok(bytes);assert.deepEqual(captureHostCombat(source,9,{0:9,1:9},0,null),before,'capture cannot spend RNG/events or alter authority');
 const component=decodeCombatState(bytes);assert.ok(replica.receive(component,100,1));
 const pose=view.playerShip.pos.clone();
 for(const tick of [1,4,8]){applyCombatSnapshot(view,{...original,tick},false);replica.apply(view,tick);assert.deepEqual(decodeCombatState(captureCriticalCombat(view,9)!).ships,component.ships);assert.equal(view.playerShip.shield.visualAlpha,source.playerShip.shield.visualAlpha);assert.equal(view.playerShip.shield.phaseCooldownLevel,source.playerShip.shield.phaseCooldownLevel);}
 assert.equal(view.playerShip.pos.x,pose.x);assert.equal(view.playerShip.pos.y,pose.y);
 // A same/newer full world owns every component; stale component is not replayed.
 applyCombatSnapshot(view,{...original,tick:10},false);replica.apply(view,10);assert.equal(view.playerShip.isDead,false);assert.notEqual(view.playerShip.hullHp,321.123456789);
 assert.equal(replica.receive(component,200,10),false);replica.clear();assert.equal(replica.tick,-1);replica.apply(view,0);assert.equal(view.playerShip.isDead,false);
});
test('critical combat mirrors all phase states and fade timers, unknown ids never spawn entities',()=>{
 const source=createLanWorld(match(2)).engine,view=createLanWorld(match(2)).engine,replica=new CriticalCombatReplica();let tick=1;
 for(const phase of ['IDLE','IN','ACTIVE','OUT','COOLDOWN'] as const){
  source.playerShip.shield.phaseState=phase;source.playerShip.shield.phaseEffectLevel=.125;(source.playerShip.shield as any).phaseStageTimer=.375;
  const frame=decodeCombatState(captureCriticalCombat(source,tick)!);frame.ships.push(['unknown',...frame.ships[0]!.slice(1)] as any);assert.ok(replica.receive(frame,tick*50,0));replica.apply(view,0);
  assert.equal(view.playerShip.shield.phaseState,phase);assert.equal(view.playerShip.shield.phaseCooldownLevel,source.playerShip.shield.phaseCooldownLevel);assert.equal(view.allCapitalShips.length,2);tick++;
 }
});

const particleEnvelopeCount=(v:any):number=>!v||typeof v!=='object'?0:Object.hasOwn(v,'$dynamicParticles')?v.$dynamicParticles[2].filter(Array.isArray).length:Object.values(v).reduce((n:number,x:any)=>n+particleEnvelopeCount(x),0);
test('seeded armor/debris capture and restore equal ordinary particles at every mid-life point, preserving RNG and removal ordering',()=>{
 const e=createLanWorld(match(2)).engine,m=configureHostCosmetics(e,true,true),a=createLanWorld(match(2)).engine,b=createLanWorld(match(2)).engine;
 e.fxSystem.spawnArmorDamageSparks(e.playerShip,new Vector2(-7,2),76);
 for(const category of ['small','medium','large'] as const)e.fxSystem.spawnDebris(new Vector2(-31,29),8,[121,110,99],93,category);
 let encoded=0;
 for(let tick=0;tick<220;tick++){
  if(tick)e.fxSystem.update(1/60);if(tick%7)continue;
  if(tick===35){e.fxSystem.debris.reverse();e.fxSystem.particles.reverse();}
  const before=JSON.stringify(e.visualRandom),ordinary=captureAuthorityCombat(e,tick,{0:tick},0,m,false),compact=captureAuthorityCombat(e,tick,{0:tick},0,m,true);
  encoded+=particleEnvelopeCount(compact);assert.equal(JSON.stringify(e.visualRandom),before);assert.deepEqual(captureAuthorityCombat(e,tick,{0:tick},0,m,false),ordinary);
  applyCombatSnapshot(a,decodeBinaryFrame(encodeProjectedBinaryFrame(ordinary)!),false);applyCombatSnapshot(b,decodeBinaryFrame(encodeProjectedBinaryFrame(compact)!),false);
  assert.deepEqual(a.fxSystem.particles,b.fxSystem.particles,'particles '+tick);assert.deepEqual(a.fxSystem.debris,b.fxSystem.debris,'debris '+tick);
 }
 assert.ok(encoded>100);assert.equal(b.fxSystem.particles.length,0);assert.equal(b.fxSystem.debris.length,0);
});
test('mutated/custom particle rows, unsupported steps and raw rows fall back without dropping or freezing an effect',()=>{
 const e=createLanWorld(match(2)).engine,m=configureHostCosmetics(e,true,true),a=createLanWorld(match(2)).engine,b=createLanWorld(match(2)).engine;
 e.fxSystem.spawnDebris(new Vector2(0,0),8);e.fxSystem.spawnArmorDamageSparks(e.playerShip,new Vector2(0,0),100);e.fxSystem.update(1/60);
 e.fxSystem.debris[0]!.vel.x+=.125;e.fxSystem.debris[1]!.color[0]=12;e.fxSystem.debris[2]!.points.push(new Vector2(1,2));
 (e.fxSystem.debris[3] as any).custom=17;e.fxSystem.particles[0]!.pos.x+=1;
 const ordinary=captureAuthorityCombat(e,1,{},0,m,false),compact=captureAuthorityCombat(e,1,{},0,m,true);assert.ok(particleEnvelopeCount(compact)>0);
 applyCombatSnapshot(a,ordinary,false);applyCombatSnapshot(b,compact,false);assert.deepEqual(a.fxSystem.particles,b.fxSystem.particles);assert.deepEqual(a.fxSystem.debris,b.fxSystem.debris);
 e.fxSystem.update(1/30);assert.equal(particleEnvelopeCount(captureAuthorityCombat(e,2,{},0,m,true)),0);
 const rng=new SimulationRandom(42),fx=new CombatFXSystem(rng);enableDynamicParticleRecipes(rng);(rng as any).next=()=>.5;fx.spawnDebris(new Vector2(0,0));assert.equal(particleRecipeRow(fx.debris[0]!,particleRecipeBudget()),null);
});
test('particle replay validates shape/range/work and keeps templates private across rewinds and cache eviction',()=>{
 const d=new DynamicParticleDecoder(),r=[1,1,123,10,20,128,120,110,100,90,2],budget=particleRecipeBudget();
 const first=d.expand(r,0,2,budget);(first.pos as any).$vector[0]=999;(first.color as number[])[0]=0;const again=d.expand(r,0,2,budget);assert.notEqual((again.pos as any).$vector[0],999);assert.notEqual((again.color as number[])[0],0);
 for(const patch of [[-1,0],[0,-1],[128,0],[0,257],[0,NaN]])assert.throws(()=>d.expand(r,patch[0],patch[1],particleRecipeBudget()));
 for(const value of [[...r,0],r.map((v,i)=>i===0?2:v),r.map((v,i)=>i===5?129:v),r.map((v,i)=>i===6?256:v),r.map((v,i)=>i===2?Infinity:v)])assert.throws(()=>d.expand(value,0,0,particleRecipeBudget()));
 assert.throws(()=>d.expand(r,0,256,{rows:0,groups:0,work:262144}));
 for(let i=0;i<150;i++)d.expand(r.map((v,k)=>k===2?i:v),0,0,particleRecipeBudget());assert.ok(d.stats().groups<=128);assert.ok(d.stats().particles<=4096);
 const fresh=new DynamicParticleDecoder();assert.deepEqual(d.expand(r,0,0,particleRecipeBudget()),fresh.expand(r,0,0,particleRecipeBudget()));
});
test('22-ship actual combat compact dynamic particles preserve complete receivers and save measured full-state bytes',()=>{
 const e=createLanWorld(match(22)).engine,m=configureHostCosmetics(e,true,true),a=createLanWorld(match(22)).engine,b=createLanWorld(match(22)).engine;let rows=0,oldBytes=0,newBytes=0;
 for(let tick=0;tick<=900;tick++){
  if(tick)e.fixedUpdate(1/60);if(tick<480||tick%60)continue;
  const legacy=captureAuthorityCombat(e,tick,{0:tick,1:tick},0,m,false),compact=captureAuthorityCombat(e,tick,{0:tick,1:tick},0,m,true),old=encodeProjectedBinaryFrame(legacy)!,next=encodeProjectedBinaryFrame(compact)!;
  rows+=particleEnvelopeCount(compact);oldBytes+=deflateRawSync(old,{level:1}).length;newBytes+=deflateRawSync(next,{level:1}).length;
  applyCombatSnapshot(a,decodeBinaryFrame(old),false);applyCombatSnapshot(b,decodeBinaryFrame(next),false);
  assert.deepEqual(expanded(captureAuthorityCombat(a,tick,{},0,null,false)),expanded(captureAuthorityCombat(b,tick,{},0,null,false)),'complete replica '+tick);
 }
 assert.ok(rows>100);assert.ok(newBytes<oldBytes,JSON.stringify({rows,oldBytes,newBytes}));
 console.log('dynamic particle native bytes',JSON.stringify({rows,oldBytes,newBytes}));
});

test('spark/explosion recipes retain authority density, branch, drag and alpha at all live steps',()=>{
 for(const kind of [2,3])for(const count of [1,17,60,128]){
  const rng=new SimulationRandom(921+count),fx=new CombatFXSystem(rng),plainRng=new SimulationRandom(921+count),plain=new CombatFXSystem(plainRng);
  enableDynamicParticleRecipes(rng);
  const spawn=(f:CombatFXSystem)=>kind===2?f.spawnSparks(new Vector2(-0,13.5),count,[21,177,250]):f.spawnExplosion(new Vector2(-0,13.5),count);
  spawn(fx);spawn(plain);const decoder=new DynamicParticleDecoder();let encoded=0;
  for(let tick=0;tick<115;tick++){
   assert.deepEqual(fx.particles,plain.particles);assert.deepEqual(rng,plainRng);
   const budget=particleRecipeBudget(),decodeBudget=particleRecipeBudget();
   for(const p of fx.particles){
    const row=particleRecipeRow(p,budget);assert.ok(row);assert.equal(row.recipe[1],kind);encoded++;
    const wire=decoder.expand(row.recipe,row.index,row.steps,decodeBudget,row.motion);
    const actual=Object.fromEntries(Object.entries(p).map(([k,v])=>[k,v instanceof Vector2?{$vector:[v.x,v.y]}:v]));
    assert.deepEqual(wire,actual);
   }
   fx.update(1/60);plain.update(1/60);
  }
  assert.ok(encoded>0);
 }
 const rng=new SimulationRandom(9),fx=new CombatFXSystem(rng);enableDynamicParticleRecipes(rng);
 for(let i=0;i<30;i++)fx.spawnExplosion(new Vector2(0,0),60);
 const before=fx.particles.length;fx.spawnSparks(new Vector2(0,0),60);
 const added=fx.particles.slice(before);assert.ok(added.length<60,'authority density must actually select a smaller count');
 for(const p of added){const row=particleRecipeRow(p,particleRecipeBudget());assert.ok(row);assert.equal(row.recipe[5],added.length);}
 if(added.length){added[0].drag=99;assert.equal(particleRecipeRow(added[0],particleRecipeBudget()),null);}
});
test('warm authority captures stay within cold decoder work and retained member budgets',()=>{
 const e=createLanWorld(match(2)).engine,m=configureHostCosmetics(e,true,true);
 for(let i=0;i<30;i++)e.fxSystem.spawnDebris(new Vector2(i,0),128,[110,100,90],0,'large');
 // Warm all private groups without one shared budget, then capture an old world.
 for(let t=0;t<125;t++)e.fxSystem.update(1/60);
 for(const p of e.fxSystem.debris)particleRecipeRow(p,particleRecipeBudget());
 const frame=captureAuthorityCombat(e,125,{},0,m,true),ordinary=captureAuthorityCombat(e,125,{},0,m,false);
 const a=createLanWorld(match(2)).engine,b=createLanWorld(match(2)).engine;
 applyCombatSnapshot(a,decodeBinaryFrame(encodeProjectedBinaryFrame(frame)!),false);
 applyCombatSnapshot(b,decodeBinaryFrame(encodeProjectedBinaryFrame(ordinary)!),false);
 assert.deepEqual(a.fxSystem.debris,b.fxSystem.debris);assert.ok(particleEnvelopeCount(frame)>0);
});
test('dynamic envelopes reject malformed motion/references and raw cycles preserve ordinary fallback',()=>{
 const e=createLanWorld(match(2)).engine,m=configureHostCosmetics(e,true,true);e.fxSystem.spawnExplosion(new Vector2(1,2),20);
 const capture=()=>captureAuthorityCombat(e,1,{},0,m,true);
 const find=(value:any):any=>{if(!value||typeof value!=='object')return null;if(Object.hasOwn(value,'$dynamicParticles'))return value;for(const v of Object.values(value)){const hit=find(v);if(hit)return hit;}return null;};
 for(const mutate of [
  (data:any)=>data[0]=3,(data:any)=>data[1]=null,(data:any)=>data[2][0][0]=999,
  (data:any)=>data[2][0][1]=-1,(data:any)=>data[2][0][2]=257,(data:any)=>data[2][0].pop(),
  (data:any)=>data[2][0][3]=null,(data:any)=>data[2][0][3]=[1,2,3],(data:any)=>data[2][0][3][0]=Infinity,
  (data:any)=>data[2].push({raw:null,unexpected:1})
 ]){const f=capture(),hit=find(f);assert.ok(hit);mutate(hit.$dynamicParticles);assert.throws(()=>applyCombatSnapshot(createLanWorld(match(2)).engine,f,false));}
 // Mixed supported particles and a cycle keep the old packer's ancestor-only
 // behavior; no recursive recipe escape or source modification is allowed.
 e.fxSystem.particles.push(e.fxSystem.particles as any);
 const ordinary=captureAuthorityCombat(e,1,{},0,m,false),compact=capture(),a=createLanWorld(match(2)).engine,b=createLanWorld(match(2)).engine;
 applyCombatSnapshot(a,ordinary,false);applyCombatSnapshot(b,compact,false);assert.deepEqual(a.fxSystem.particles,b.fxSystem.particles);
});
test('partially updated birth groups use raw fallback instead of repeated decoder rewinds',()=>{
 const e=createLanWorld(match(2)).engine,m=configureHostCosmetics(e,true,true);e.fxSystem.spawnSparks(new Vector2(0,0),17);
 const held=e.fxSystem.particles.splice(8);for(let i=0;i<5;i++)e.fxSystem.update(1/60);e.fxSystem.particles.push(...held);
 const compact=captureAuthorityCombat(e,5,{},0,m,true),ordinary=captureAuthorityCombat(e,5,{},0,m,false);
 assert.equal(particleEnvelopeCount(compact),8);
 const a=createLanWorld(match(2)).engine,b=createLanWorld(match(2)).engine;
 applyCombatSnapshot(a,compact,false);applyCombatSnapshot(b,ordinary,false);assert.deepEqual(a.fxSystem.particles,b.fxSystem.particles);
});

test('v2 particle residual envelope retains v1 absolute rows and legacy complete-world restoration',()=>{
 const e=createLanWorld(match(2)).engine,m=configureHostCosmetics(e,true,true);
 e.fxSystem.spawnExplosion(new Vector2(23,41),60);e.fxSystem.spawnDebris(new Vector2(-41,3),8,[110,100,90],80,'large');
 for(let i=0;i<17;i++)e.fxSystem.update(1/60);
 const ordinary=captureAuthorityCombat(e,17,{},0,m,false),v2=captureAuthorityCombat(e,17,{},0,m,true);
 const legacy=structuredClone(v2),decoder=new DynamicParticleDecoder(),budget=particleRecipeBudget();let residuals=0;
 const visit=(value:any)=>{if(!value||typeof value!=='object')return;if(value.$dynamicParticles){const data=value.$dynamicParticles;assert.equal(data[0],2);data[0]=1;for(const row of data[2])if(Array.isArray(row)){if(row[3].length===5)residuals++;const p=decoder.expand(data[1][row[0]],row[1],row[2],budget,row[3]) as any;row[3]=[...p.pos.$vector,...p.vel.$vector];}}else for(const child of Object.values(value))visit(child);};visit(legacy);assert.ok(residuals>30);
 const viewers=[ordinary,v2,legacy].map(frame=>{const v=createLanWorld(match(2)).engine;applyCombatSnapshot(v,decodeBinaryFrame(encodeProjectedBinaryFrame(frame)!),false);return v;});
 for(const v of viewers.slice(1)){assert.deepEqual(v.fxSystem.particles,viewers[0].fxSystem.particles);assert.deepEqual(v.fxSystem.debris,viewers[0].fxSystem.debris);}
 const unknown=structuredClone(v2);const breakVersion=(v:any):boolean=>{if(!v||typeof v!=='object')return false;if(v.$dynamicParticles){v.$dynamicParticles[0]=1;return true;}return Object.values(v).some(breakVersion);};assert.ok(breakVersion(unknown));assert.throws(()=>applyCombatSnapshot(createLanWorld(match(2)).engine,unknown,false));
});
test('signed-zero birth groups keep absolute rows together without changing raw or serialized snapshot semantics',()=>{
 const e=createLanWorld(match(2)).engine,m=configureHostCosmetics(e,true,true);
 e.fxSystem.spawnDebris(new Vector2(0,0),12,[110,100,90],0,'large');
 const frame=captureAuthorityCombat(e,0,{},0,m,true);const rows:any[]=[];
 const visit=(v:any)=>{if(!v||typeof v!=='object')return;if(v.$dynamicParticles)rows.push(...v.$dynamicParticles[2].filter(Array.isArray));else Object.values(v).forEach(visit);};visit(frame);
 assert.equal(rows.length,12);assert.ok(rows.every(r=>r[3].length===4));
 const ordinary=captureAuthorityCombat(e,0,{},0,m,false);
 for(const binary of [false,true]){const a=createLanWorld(match(2)).engine,b=createLanWorld(match(2)).engine;const wire=(f:any)=>binary?decodeBinaryFrame(encodeProjectedBinaryFrame(f)!):f;applyCombatSnapshot(a,wire(frame),false);applyCombatSnapshot(b,wire(ordinary),false);assert.deepEqual(a.fxSystem.debris,b.fxSystem.debris);}
});

import {PackedSnapshotNumbers} from '../src/network/PackedSnapshotNumbers.mjs';
import {SnapshotTapeWriter,readSnapshotTape} from '../src/network/SnapshotTape.mjs';
import {encodeBinaryState,decodeBinaryState,decodeBinaryStateForRelay} from '../src/network/BinarySnapshot.mjs';
import {createMotionReference} from '../src/network/SnapshotMotionReference.mjs';
test('packed native authority snapshots retain exact restore, JSON and motion-reference semantics',()=>{
 const source=createLanWorld(match(2)).engine, a=createLanWorld(match(2)).engine,b=createLanWorld(match(2)).engine;
 const json=(v:any)=>JSON.parse(JSON.stringify(v));
 const take=(packed:boolean,tick:number)=>captureAuthorityCombat(source,tick,{0:tick},0,null,false,packed);
 const blocks=(v:any):PackedSnapshotNumbers[]=>v instanceof PackedSnapshotNumbers?[v]:v&&typeof v==='object'?Object.values(v).flatMap(blocks):[];
 for(let tick=0;tick<4;tick++){
  source.fixedUpdate(1/60);
  // Direct cell writes intentionally bypass dirtyVersion: snapshots must own bytes.
  for(const ship of source.allCapitalShips)for(let i=0;i<ship.armor.cells.length;i++)ship.armor.cells[i]=(i+tick+.25)/7;
  const ordinary=take(false,tick),packed=take(true,tick),frozen=json(packed);assert.ok(blocks(packed).length>0);
  assert.deepEqual(frozen,json(ordinary));assert.deepEqual(json(readSnapshotTape(new SnapshotTapeWriter().encode(packed)!)),frozen);
  const oldBytes=encodeBinaryState('packed-test',tick,encodeProjectedBinaryFrame(ordinary,true)!);
  const bytes=encodeBinaryState('packed-test',tick,encodeProjectedBinaryFrame(packed,true)!);
  const decoded=decodeBinaryState(bytes).frame;
  assert.deepEqual(json(decoded),frozen);assert.deepEqual(decodeBinaryStateForRelay(bytes),decodeBinaryStateForRelay(oldBytes));
  for(const step of [1,3]){const oldRef=createMotionReference(oldBytes,step),ref=createMotionReference(bytes,step);assert.equal(ref===null,oldRef===null);if(ref&&oldRef)assert.deepEqual(json(decodeBinaryState(ref)),json(decodeBinaryState(oldRef)));}
  applyCombatSnapshot(a,decodeBinaryState(oldBytes).frame,tick===0);applyCombatSnapshot(b,decoded,tick===0);
  assert.deepEqual(json(captureAuthorityCombat(a,tick,{},0,null)),json(captureAuthorityCombat(b,tick,{},0,null)));
  source.playerShip.armor.cells.fill(123);assert.deepEqual(json(packed),frozen);
  for(const block of blocks(decoded))block.numbers.fill(0);
  assert.deepEqual(a.playerShip.armor.cells,b.playerShip.armor.cells,'restored replica must not alias decoded capture');
 }
 const broken=take(true,5);const visit=(v:any):boolean=>{if(!v||typeof v!=='object')return false;if(v.$typed){v.$typed='Uint8Array';return true;}return Object.values(v).some(visit);};assert.ok(visit(broken));assert.throws(()=>applyCombatSnapshot(b,broken,false),/Invalid typed array/);
});

import {world as numericBenchmarkWorld} from './lib/native-projectile-fixture.mts';
import {applyCombatSnapshots as applyNumericBench} from '../src/network/AuthorityCombatSnapshot';
import {inflateRawSync} from 'node:zlib';
import {LanDeltaSender,lanDeltaTarget} from '../server/LanDeltaTransport.mjs';
import {LanDeltaReceiver,isLanDelta} from '../src/network/LanBinaryDelta.mjs';
test('paired complete numeric snapshot pipeline on existing native 22-ship fixture', {skip:process.env.PACKED_NUMERIC_BENCH!=='true'},()=>{
 const results:any[]=[],samples=120,warmup=30,peers=5;
 const quantile=(a:number[],q:number)=>a.toSorted((a,b)=>a-b)[Math.floor((a.length-1)*q)];
 const stats=(a:number[])=>({p50:quantile(a,.5),p95:quantile(a,.95),max:Math.max(...a)});
 const summarize=(rows:any[])=>({total:stats(rows.map(r=>r.total)),wire:rows.reduce((n,r)=>n+r.wire,0)/rows.length,stages:Object.fromEntries(Object.keys(rows[0].metrics).map(k=>[k,stats(rows.map(r=>r.metrics[k]))]))});
 for(let round=0;round<2;round++){
  const source=numericBenchmarkWorld();for(const s of source.allCapitalShips){s.pos.scale(.2);s.prevPos.copy(s.pos);s.fireControlMode='AI';}
  for(let i=0;i<120;i++)source.fixedUpdate(1/60);
  const pipeline=(packed:boolean)=>{
   const viewers=Array.from({length:peers},()=>numericBenchmarkWorld()),senders=viewers.map(()=>new LanDeltaSender({ordered:true,motionReference:true})),receivers=viewers.map(()=>new LanDeltaReceiver({motionReference:true}));
   return {viewers,step(tick:number){
    const metrics={capture:0,encode:0,delta:0,compress:0,inflate:0,decode:0,apply:0};
    let t=performance.now();const frame=captureAuthorityCombat(source,tick,{0:tick,1:tick},0,null,false,packed);metrics.capture=performance.now()-t;
    t=performance.now();const encoded=encodeBinaryState('numeric-pair',tick,encodeProjectedBinaryFrame(frame,true)!);metrics.encode=performance.now()-t;
    t=performance.now();const target=lanDeltaTarget(encoded,tick,tick*1000/60);assert.ok(target);const choices=senders.map(s=>s.prepare(target));const packets=choices.map(c=>c?.packet??encoded);choices.forEach((c,i)=>{if(c)senders[i].commit(c);});metrics.delta=performance.now()-t;
    t=performance.now();const compressed=packets.map(p=>deflateRawSync(p,{level:6}));metrics.compress=performance.now()-t;
    for(let i=0;i<peers;i++){
     t=performance.now();const packet=inflateRawSync(compressed[i]);metrics.inflate+=performance.now()-t;
     t=performance.now();const decoded=decodeBinaryState(isLanDelta(packet)?receivers[i].decode(packet):packet);metrics.decode+=performance.now()-t;
     t=performance.now();applyNumericBench(viewers[i],[decoded.frame],tick===1,undefined,{nativeTargeting:true,nativeProjection:true});metrics.apply+=performance.now()-t;
    }
    return {frame,metrics,total:Object.values(metrics).reduce((a,b)=>a+b,0),wire:compressed.reduce((n,p)=>n+p.length,0),raw:encoded.length};
   }};
  };
  const a=pipeline(false),b=pipeline(true),control:any[]=[],candidate:any[]=[];
  let minProjectiles=Infinity,maxProjectiles=0;
  for(let i=0;i<warmup+samples;i++){
   source.fixedUpdate(1/60);const tick=i+1;let old:any,next:any;
   if((i+round)%2){next=b.step(tick);old=a.step(tick);}else{old=a.step(tick);next=b.step(tick);}
   assert.deepEqual(JSON.parse(JSON.stringify(next.frame)),JSON.parse(JSON.stringify(old.frame)));
   if(i%30===0||i===warmup+samples-1)for(let p=0;p<peers;p++)assert.deepEqual(captureAuthorityCombat(a.viewers[p],tick,{},0,null),captureAuthorityCombat(b.viewers[p],tick,{},0,null),'complete restored world');
   minProjectiles=Math.min(minProjectiles,source.projectiles.length);maxProjectiles=Math.max(maxProjectiles,source.projectiles.length);
   if(i>=warmup){const row=(r:any)=>({metrics:r.metrics,total:r.total,wire:r.wire,raw:r.raw});control.push(row(old));candidate.push(row(next));}
  }
  const old=summarize(control),next=summarize(candidate),ratios={total:next.total.p50/old.total.p50,p95:next.total.p95/old.total.p95,wire:next.wire/old.wire};
  results.push({round,minProjectiles,maxProjectiles,control:old,candidate:next,ratios,samples:{control,candidate}});console.log('PACKED NUMERIC PAIR',JSON.stringify({round,ratios,control:old,candidate:next}));
 }
 const report={scope:'Same native 22-ship fixture trajectory, scalar vs packed capture; 5 sequential offline receivers, NOT real RTT/FPS/Hz; two paired alternating runs; no CPU profiling',warmup,samples,peers,results};
 fs.writeFileSync('artifacts/network-packed-numeric-20260922/pipeline.json',JSON.stringify(report,null,2));
});

import {ArmorGrid} from '../src/engine/simulation/ArmorGrid';
import {CombatHudProjector} from '../src/engine/runtime/CombatHudView';
import {captureArmorCells,restoreArmorCells,armorReplicationDiagnostics,ownedArmorGrid} from '../src/network/ArmorReplication';
test('owned armor component dirtiness follows writes, bulk restore and mutable-view escape',()=>{
 const grid=new ArmorGrid(4,3),initial=grid.copyCells(),v=grid.dirtyVersion;
 assert.equal(ownedArmorGrid(grid),true);assert.equal(Object.keys(grid).includes('cells'),true);
 const first=captureArmorCells(grid)!;assert.equal(captureArmorCells(grid),first);
 grid.getCell(0,0);grid.getIntegrityPercentage();grid.copyCells().fill(0);assert.equal(captureArmorCells(grid),first);
 grid.setCell(-1,0,4);grid.setCell(0,0,initial[0]);assert.equal(grid.dirtyVersion,v);assert.equal(captureArmorCells(grid),first);
 grid.setCell(0,0,1.25);const changed=captureArmorCells(grid)!;assert.notEqual(changed,first);assert.equal(grid.dirtyVersion,v+1);
 assert.equal(first.values.numbers[0],initial[0]);assert.equal(changed.values.numbers[0],1.25);
 grid.replaceCells(initial);assert.equal(grid.dirtyVersion,v+1,'bulk helpers do not alter the old dirtyVersion policy');assert.notEqual(captureArmorCells(grid),changed);
 const partial=new ArmorGrid(4,3),prePartial=captureArmorCells(partial);
 assert.throws(()=>partial.replaceCells({length:2,0:11,get 1(){throw Error('partial write');}}),/partial write/);
 assert.equal(partial.getCell(0,0),11);assert.notEqual(captureArmorCells(partial),prePartial,'throwing partial writes invalidate the capture');
 const destination=new ArmorGrid(4,3);const before=armorReplicationDiagnostics();
 assert.equal(restoreArmorCells(destination,first),true);assert.equal(restoreArmorCells(destination,first),true);
 assert.equal(armorReplicationDiagnostics().restoreSkips,before.restoreSkips+1);
 destination.setCell(0,0,2);restoreArmorCells(destination,first);assert.equal(destination.getCell(0,0),initial[0]);
 const escaped=grid.cells;assert.equal(ownedArmorGrid(grid),false);escaped[0]=7;assert.equal(captureArmorCells(grid),null);
 assert.equal(grid.getCell(0,0),7);grid.setCell(1,0,9);assert.equal(escaped[1],9,'mutable public alias keeps working');
 const replaced=new ArmorGrid(4,3);replaced.cells=new Float32Array(12).fill(3);assert.equal(replaced.getCell(0,0),3);assert.equal(ownedArmorGrid(replaced),false);
 const custom=new ArmorGrid(4,3),customCells=new Float32Array(12).fill(5);Object.defineProperty(custom,'cells',{enumerable:true,configurable:true,value:customCells,writable:true});
 assert.equal(ownedArmorGrid(custom),false);assert.equal(custom.getCell(0,0),5);custom.setCell(0,0,6);assert.equal(customCells[0],6);
});
test('armor component complete native trajectory matches full capture through cold apply, skips and reset',()=>{
 const authority=createLanWorld(match(2)).engine,reference=createLanWorld(match(2)).engine;
 const viewer=createLanWorld(match(2)).engine,oldViewer=createLanWorld(match(2)).engine;
 const json=(v:any)=>JSON.parse(JSON.stringify(v));const counters=armorReplicationDiagnostics();
 const hostHud=new CombatHudProjector(),guestHud=new CombatHudProjector();
 const take=(e:any,tick:number,packed:boolean)=>captureAuthorityCombat(e,tick,{0:tick},0,null,false,packed);
 const restore=(v:any,frame:any,reset=false,native=true)=>applyNumericBench(v,[frame],reset,undefined,{nativeTargeting:native,nativeProjection:native});
 let last:any;
 for(let tick=0;tick<20;tick++){
  if(tick){authority.fixedUpdate(1/60);reference.fixedUpdate(1/60);}
  if(tick===4||tick===9)for(const e of [authority,reference])e.playerShip.armor.setCell(3,3,tick+.125);
  if(tick===10)for(const e of [authority,reference]){e.playerShip.armor.replaceCells(new Float32Array(e.playerShip.armor.copyCells().length).fill(10));e.playerShip.armor.dirtyVersion++;}
  const hud=hostHud.capture(authority);assert.deepEqual(hud.playerShip.armor.cells,authority.playerShip.armor.copyCells());
  hud.playerShip.armor.cells.fill(-1);assert.notEqual(authority.playerShip.armor.getCell(0,0),-1,'display arrays cannot mutate the authority');
  assert.notEqual(authority.playerShip.armor.cellMutationRevision,null,'HUD must not escape source storage');
  const compact=take(authority,tick,true),ordinary=take(reference,tick,false);
  assert.deepEqual(json(compact),json(ordinary),'all native state and RNG-visible fields');
  const frame=decodeBinaryState(encodeBinaryState('armor-component',tick,encodeProjectedBinaryFrame(compact,true)!)).frame;
  const old=decodeBinaryState(encodeBinaryState('armor-component',tick,encodeProjectedBinaryFrame(ordinary,true)!)).frame;
  assert.deepEqual(json(frame),json(old));
  // Frames remain self-contained even when a viewer skips several state updates.
  if(tick%3!==1){restore(viewer,frame,tick===0||tick===12);restore(oldViewer,old,tick===0||tick===12,false);}
  if(tick===8){viewer.playerShip.armor.setCell(0,0,0);oldViewer.playerShip.armor.setCell(0,0,0);}
  guestHud.capture(viewer);assert.notEqual(viewer.playerShip.armor.cellMutationRevision,null,'HUD must not disable receiver reuse');
  assert.deepEqual(json(take(viewer,tick,true)),json(take(oldViewer,tick,true)),'complete restored viewer');
  last=frame;
 }
 const after=armorReplicationDiagnostics();assert.ok(after.captureReuses>counters.captureReuses+20);assert.ok(after.restoreSkips>counters.restoreSkips+10);
 const fresh=createLanWorld(match(2)).engine;restore(fresh,last,true);assert.deepEqual(fresh.playerShip.armor.copyCells(),authority.playerShip.armor.copyCells(),'new lifetime with same ship IDs restores cold');
 // A direct public write after publication invalidates the source fast path.
 authority.playerShip.armor.cells[0]=77;const fallback=take(authority,20,true);restore(viewer,decodeBinaryFrame(encodeProjectedBinaryFrame(fallback,true)!),true);assert.equal(viewer.playerShip.armor.getCell(0,0),77);
 console.log('ARMOR COMPONENT REUSE',JSON.stringify({before:counters,after}));
});

import {componentReplicationDiagnostics,resolveComponent,decodeComponent,componentCapsule,ComponentCapture} from '../src/network/ComponentReplication';
import {componentCaptureDiagnostics,combatComponentNotices} from '../src/network/AuthorityCombatSnapshot';
import {Ship} from '../src/engine/simulation/Ship';
function componentExpanded(frame:any):any {
 const open=(v:any):any=>{
  if(v instanceof PackedSnapshotNumbers)return v.toJSON();
  if(!v||typeof v!=='object')return v;
  if(v.$component)return open(resolveComponent(v,frame.componentDefinitions??{}));
  if(Array.isArray(v))return v.map(open);
  return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,open(x)]));
 };
 const copy=open(frame);delete copy.componentMode;delete copy.componentDefinitions;delete copy.combatEvents;
 for(const row of [...copy.ships,...copy.crafts])delete row.generation;
 // Compare network semantics: both legacy binary and JSON canonicalize signed zero.
 return JSON.parse(JSON.stringify(expanded(copy)));
}
test('whole component replication follows writes, lanes, lifecycle, loss and native restore',()=>{
 const fixture=match(4,'drover'),host=createLanWorld(fixture).engine,baseline=createLanWorld(fixture).engine;
 const guest=createLanWorld(fixture).engine,oldGuest=createLanWorld(fixture).engine;
 // Compare the component experiment with the SAME full weapon read-set, not the new independent projection.
 const take=(e:any,tick:number,on:boolean)=>captureAuthorityCombat(e,tick,{0:tick},0,null,false,true,on,false,false,false);
 const before=componentReplicationDiagnostics(),sender=new LanDeltaSender({ordered:true,motionReference:true}),receiver=new LanDeltaReceiver({motionReference:true});
 let last:any,oldLast:any,oldFighter:Ship|undefined,oldGeneration:number|undefined,totalWire=0,totalFull=0;
 for(let tick=0;tick<90;tick++){
  if(tick){host.fixedUpdate(1/60);baseline.fixedUpdate(1/60);}
  if(tick===6)for(const e of [host,baseline]){e.playerShip.armor.setCell(1,1,3);e.playerShip.flux.softFlux=47;}
  if(tick===9)for(const e of [host,baseline]){e.playerShip.armor.cells[0]=31;}
  if(tick===12)for(const e of [host,baseline]){(e.playerShip as any).componentFixture={list:[1,2],map:new Map([['x',1]])};}
  if(tick===14)for(const e of [host,baseline]){(e.playerShip as any).componentFixture.list.push(3);(e.playerShip as any).componentFixture.map.set('x',4);}
  if(tick===16)for(const e of [host,baseline]){Object.defineProperty((e.playerShip as any).componentFixture,'newField',{enumerable:true,configurable:true,writable:true,value:33});}
  if(tick===18)for(const e of [host,baseline]){delete (e.playerShip as any).componentFixture.newField;}
  if(tick===22)for(const e of [host,baseline]){const craft=new Ship('component-reused-id',e.playerShip.spec,false,new Vector2(200,100),0);e.fighters.push(craft);}
  if(tick===25)for(const e of [host,baseline]){const i=e.fighters.findIndex((s:any)=>s.id==='component-reused-id');if(i>=0)e.fighters.splice(i,1);}
  if(tick===27)for(const e of [host,baseline]){const craft=new Ship('component-reused-id',e.playerShip.spec,false,new Vector2(600,300),0);e.fighters.push(craft);}
  const frame=take(host,tick,true),old=take(baseline,tick,false);
  assert.deepEqual(componentExpanded(frame),componentExpanded(old),'source projection '+tick);
  assert.deepEqual(summarizeCombatFrame(frame,4,tick-1),summarizeCombatFrame(old,4,tick-1));
  const full=encodeBinaryState('components',tick,encodeProjectedBinaryFrame(frame,true)!);
  const choice=sender.prepare(lanDeltaTarget(full,tick,tick));assert.equal(sender.commit(choice),true);
  const decodedFrame=decodeBinaryState(receiver.decode(choice.packet)).frame;
  totalWire+=choice.packet.length;totalFull+=full.length;
  assert.deepEqual(componentExpanded(decodedFrame),componentExpanded(old),'binary/delta projection '+tick);
  if(tick%4!==1){
   applyNumericBench(guest,[decodedFrame],tick===0||tick===48,undefined,{nativeProjection:true,nativeTargeting:true});
   applyNumericBench(oldGuest,[decodeBinaryFrame(encodeProjectedBinaryFrame(old,true)!)],tick===0||tick===48,undefined,{nativeProjection:true,nativeTargeting:true});
   assert.deepEqual(componentExpanded(take(guest,tick,false)),componentExpanded(take(oldGuest,tick,false)),'receiver '+tick);
  }
  if(tick===22){oldFighter=guest.fighters.find(s=>s.id==='component-reused-id');oldGeneration=frame.crafts.find(r=>r.id==='component-reused-id')?.generation;}
  if(tick===27){assert.notEqual(frame.crafts.find(r=>r.id==='component-reused-id')?.generation,oldGeneration);assert.notEqual(guest.fighters.find(s=>s.id==='component-reused-id'),oldFighter);}
  if(tick===22)assert.ok(combatComponentNotices(guest).some(e=>e.kind==='spawn'&&e.id==='component-reused-id'));
  if(tick===27)assert.ok(combatComponentNotices(guest).some(e=>e.kind==='spawn'&&e.id==='component-reused-id'));
  if(tick===35){guest.playerShip.shield.isActive=!guest.playerShip.shield.isActive;oldGuest.playerShip.shield.isActive=!oldGuest.playerShip.shield.isActive;}
  last=frame;oldLast=old;
 }
 // JSON and helper-tape transports remain complete, even with a cold cache.
 for(const frame of [JSON.parse(JSON.stringify(last)),readSnapshotTape(new SnapshotTapeWriter().encode(last)!)]){
  const cold=createLanWorld(fixture).engine,expected=createLanWorld(fixture).engine;
  applyCombatSnapshot(cold,frame,true);applyCombatSnapshot(expected,oldLast,true);
  assert.deepEqual(componentExpanded(take(cold,90,false)),componentExpanded(take(expected,90,false)));
 }
 const after=componentReplicationDiagnostics();assert.ok(after.encodeReuses>before.encodeReuses+30);assert.ok(after.restoreSkips>before.restoreSkips+20);
 assert.ok(totalWire<totalFull,'reliable peer sends references for unchanged component/definition bytes');
 assert.ok(componentCaptureDiagnostics(host)!.writes>0);
 console.log('WHOLE COMPONENTS',JSON.stringify({before,after,journal:componentCaptureDiagnostics(host),totalWire,totalFull}));
});
test('component envelopes reject malformed nesting and preserve local write repair',()=>{
 const nested=componentCapsule({nested:componentCapsule({value:1})});assert.throws(()=>decodeComponent(nested),/Nonlocal/);
 assert.throws(()=>decodeComponent({$component:1,value:[0,1,2,Infinity]}),/Invalid/);
 const capture=new ComponentCapture(()=>false,()=>false),source:any={child:{value:1},items:[1,2]};const refs=new Map();
 const take=()=>{capture.begin();const clone=(v:any):any=>!v||typeof v!=='object'?v:capture.journal.memo(v,'test',refs,()=>Array.isArray(v)?v.map(clone):Object.fromEntries(Object.entries(v).map(([k,x])=>[k,clone(x)])));const result=clone(source);capture.finish();return result;};
 const first=take();assert.equal(take(),first);source.child.value=3;assert.notEqual(take(),first);
 source.items.push(4);assert.deepEqual(take().items,[1,2,4]);
 Object.defineProperty(source.child,'value',{value:9,writable:true,enumerable:true,configurable:true});assert.equal(take().child.value,9);
});

test('whole component paired processing benchmark', {skip:process.env.COMPONENT_BENCH!=='true'},()=>{
 const pipeline=(components:boolean)=>{
  const e=numericBenchmarkWorld(22),viewers=[numericBenchmarkWorld(22),numericBenchmarkWorld(22)];
  for(let i=0;i<180;i++)e.fixedUpdate(1/60);
  const senders=viewers.map(()=>new LanDeltaSender({ordered:true,motionReference:true})),receivers=viewers.map(()=>new LanDeltaReceiver({motionReference:true}));
  return(tick:number)=>{
   const times:any={};let t=performance.now();e.fixedUpdate(1/60);times.simulation=performance.now()-t;
   t=performance.now();const frame=captureAuthorityCombat(e,tick,{0:tick},0,null,true,true,components,false,false,false);times.capture=performance.now()-t;
   t=performance.now();const bytes=encodeBinaryState('component-bench',tick,encodeProjectedBinaryFrame(frame,true)!);times.encode=performance.now()-t;
   times.delta=0;times.decode=0;times.apply=0;let wire=0;
   for(let i=0;i<viewers.length;i++){
    t=performance.now();const choice=senders[i].prepare(lanDeltaTarget(bytes,tick,tick));senders[i].commit(choice);wire+=choice.packet.length;times.delta+=performance.now()-t;
    t=performance.now();const decoded=decodeBinaryState(receivers[i].decode(choice.packet));times.decode+=performance.now()-t;
    t=performance.now();applyNumericBench(viewers[i],[decoded.frame],tick===1,undefined,{nativeProjection:true,nativeTargeting:true});times.apply+=performance.now()-t;
   }
   return {...times,total:Object.values(times).reduce((a:any,b:any)=>a+b,0),wire,raw:bytes.length,projectiles:e.projectiles.length};
  };
 };
 const old=pipeline(false),next=pipeline(true),a:any[]=[],b:any[]=[];
 for(let tick=1;tick<=45;tick++){
  let x,y;if(tick%2){x=old(tick);y=next(tick);}else{y=next(tick);x=old(tick);}
  if(tick>10){a.push(x);b.push(y);}
 }
 const summary=(rows:any[])=>Object.fromEntries(Object.keys(rows[0]).map(key=>{const values=rows.map(r=>r[key]).sort((x,y)=>x-y);return[key,{p50:values[Math.floor(values.length/2)],p95:values[Math.floor(values.length*.95)]}];}));
 const result={ships:22,guests:2,sequentialGuests:true,baseline:summary(a),candidate:summary(b)};
 fs.writeFileSync('artifacts/network-components-20260922/benchmark.json',JSON.stringify(result,null,2));console.log('COMPONENT PAIRED',JSON.stringify(result));
});

// Production display packets through the REAL packed/binary decoder, not a clone
// of PackedSnapshotNumbers (which would discard its type marker).
const displayWire=(frame:any)=>decodeBinaryFrame(encodeProjectedBinaryFrame(frame,true)!);
const jsonData=(value:any)=>JSON.parse(JSON.stringify(value));
test('LAN display world cold join, reserve deployment, carrier lifecycle, overlays and reconnect use only display records',()=>{
 const fixture=match(6,'drover');fixture.options.initialDeploymentLimit=0;
 fixture.players.push({id:'c',seat:2,team:2,hull:'hammerhead'});fixture.options.aiHulls.push(['hammerhead']);
 for(const packed of [false,true]) {
  const host=createLanWorld(fixture).engine,legacy=createLanWorld(fixture);setLanPerspective(legacy.engine,legacy.controlled,1);
  const take=(tick:number)=>captureLanDisplayCombat(host,tick,{0:tick,1:tick,2:tick},0,null,false,packed);
  host.combatTime=15;const first=displayWire(take(900)); // No local tick-zero match construction.
  const display=createLanDisplayWorld(fixture,1,first).world;
  const baseline=(tick:number,reset:boolean)=>{
   applyCombatSnapshot(legacy.engine,displayWire(captureHostCombat(host,tick,{0:tick,1:tick,2:tick},0,null)),reset);
   // Legacy packets omitted wing membership; the new read model explicitly publishes it.
   legacy.engine.playerWings.splice(0,legacy.engine.playerWings.length,...structuredClone(host.playerWings));
   legacy.engine.enemyWings.splice(0,legacy.engine.enemyWings.length,...structuredClone(host.enemyWings));
  };
  baseline(900,true);display.isTacticalMap=legacy.engine.isTacticalMap=true;
  const hud=new CombatHudProjector(),oldHud=new CombatHudProjector(),map=new TacticalMapViewProjector(),oldMap=new TacticalMapViewProjector(),deployment=new DeploymentViewProjector(),oldDeployment=new DeploymentViewProjector();
  const check=()=>{
   const ships=(world:any)=>world.ships.map((s:any)=>[s.id,s.teamId,s.pos,s.prevPos,s.hullHp,s.sourceCarrier?.id,s.parentShip?.id,s.currentTargetShip?.id]);
   assert.deepEqual(ships(display),ships(legacy.engine));
   assert.deepEqual(jsonData(hud.capture(display)),jsonData(oldHud.capture(legacy.engine)));
   assert.deepEqual(map.capture(display),oldMap.capture(legacy.engine));
   assert.deepEqual(jsonData(deployment.capture(display)),jsonData(oldDeployment.capture(legacy.engine)));
   assert.deepEqual(collectCombatTextureUrls(display.renderView()),collectCombatTextureUrls(combatRenderView(legacy.engine)));
   assert.equal(display.commandPoints,host.commandPoints);
   for(const s of display.ships){assert.ok(s instanceof ProjectedRenderShip);assert.ok(!(s instanceof Ship));assert.equal('fixedUpdate' in s,false);assert.equal('applyDamage' in s.armor,false);assert.equal('toggle' in s.shield,false);assert.equal('activate' in s.system,false);}
  };
  check();const identity=display.playerShip;
  const reserve=host.allCapitalShips.find(s=>host.deployment.isReserve(s.id))!;host.deployment.deploy([reserve.id],reserve.teamId);
  assert.ok(host.fighters.length+host.bombers.length>0);
  host.combatTime+=1/60;const deployed=displayWire(take(901));
  baseline(901,false);applyLanDisplaySnapshot(display,deployed);check();
  reserve.pos.x+=120;host.combatTime+=1/60;
  baseline(902,false);applyLanDisplaySnapshot(display,displayWire(take(902)));check();assert.equal(display.playerShip,identity);
  const controlled=host.allCapitalShips.find(s=>s.id===display.playerShip.id)!;
  controlled.hullHp-=17;controlled.flux.hardFlux=controlled.flux.maxFlux*.4;controlled.shield.isActive=true;
  const critical=captureCriticalCombat(host,903,true)!;assert.ok(critical);
  const lane=new CriticalCombatReplica();lane.receive(decodeCombatState(critical),100,902);lane.apply(display,902);
  assert.equal(display.playerShip.hullHp,controlled.hullHp);assert.equal(display.playerShip.flux.fluxPercent,controlled.flux.fluxPercent);
  assert.equal(display.playerShip.shield.visualAlpha,controlled.shield.visualAlpha);
  host.fighters.splice(0);host.bombers.splice(0);reserve.hullHp=0;reserve.isDead=true;
  baseline(910,false);applyLanDisplaySnapshot(display,displayWire(take(910)));check();
  baseline(900,true); // Restore the actual earlier authority packet to both receivers below.
  applyLanDisplaySnapshot(display,first,true);assert.equal(display.playerShip,identity);
  const fresh=createLanDisplayWorld(fixture,1,displayWire(take(910))).world;
  assert.deepEqual(fresh.ships.map(s=>[s.id,s.hullHp]),host.ships.map(s=>[s.id,s.hullHp]).sort((a,b)=>fresh.ships.findIndex(s=>s.id===a[0])-fresh.ships.findIndex(s=>s.id===b[0])));
  const observed:number[]=[];applyLanDisplaySnapshots(display,[deployed,first],true,frame=>observed.push(frame.tick));assert.deepEqual(observed,[901,900]);
  const noBulk=displayWire(withoutBulkProjectiles(take(911)));applyLanDisplaySnapshot(display,noBulk,true);assert.equal(displayProjectileTick(display),-1);
 }
});

test('LAN display world rejects legacy protocols, malformed identities, specs, references and method shadowing',()=>{
 const fixture=match(4),host=createLanWorld(fixture).engine;
 const frame=displayWire(captureLanDisplayCombat(host,60,{0:60,1:60},0,null));
 const make=()=>createLanDisplayWorld(fixture,0,displayWire(frame)).world;
 assert.throws(()=>createLanDisplayWorld(fixture,0,captureHostCombat(host,0,{0:0},0,null)),/display protocol/);
 assert.throws(()=>createLanDisplayWorld({...fixture,options:{...fixture.options,aiHulls:[[],[]]}},0,frame),/fleet size/);
 for(const mutate of [
  (p:any)=>{p.displayVersion=2;},(p:any)=>{p.ships[1].id=p.ships[0].id;},(p:any)=>{p.ships[0].spec=999999;},
  (p:any)=>{p.ships[0].state.pos={$ship:'missing'};},(p:any)=>{p.ships[0].state.clearInput=3;},
  (p:any)=>{p.craftSpecs[p.ships[0].spec].spriteUrl='https://untrusted.invalid/x.png';},
  (p:any)=>{p.ships[0].state.parentShip={$ship:p.ships[0].id};},(p:any)=>{p.controlled[0]='missing';},
 ]){const replica=make(),bad=structuredClone(frame);mutate(bad);assert.throws(()=>applyLanDisplaySnapshot(replica,bad));}
 let called=0;host.playerShip.system.getWeaponRangePercent=()=>{called++;return 0;};
 assert.throws(()=>captureLanDisplayCombat(host,61,{0:61},0,null),/authority-side adapter/);assert.equal(called,0);
});

test('LAN display world contains no simulation graph and preserves all renderer sidecars',()=>{
 const fixture=match(4,'drover'),host=createLanWorld(fixture).engine;
 const display=createLanDisplayWorld(fixture,0,displayWire(captureLanDisplayCombat(host,0,{0:0,1:0},0,null))).world;
 const seen=new Set<object>();
 const visit=(value:any)=>{
  if(!value||typeof value!=='object'||seen.has(value))return;seen.add(value);
  for(const cls of [CombatEngine,Ship,ArmorGrid,Shield,FluxTracker,ShipSystem])assert.ok(!(value instanceof cls),'simulation prototype retained: '+cls.name);
  if(value instanceof Map)for(const [k,v] of value){visit(k);visit(v);}
  else if(value instanceof Set)for(const v of value)visit(v);
  else if(!ArrayBuffer.isView(value))for(const d of Object.values(Object.getOwnPropertyDescriptors(value)))if('value' in d)visit(d.value);
 };visit(display);
 for(const key of ['fixedUpdate','update','weaponSystem','collisionSystem','fighterSystem','enemyAI','random','statsTracker'])assert.equal(key in display,false,key);
 assert.equal('deploy' in display.deployment,false);
 const flight=new Map(),prediction={projectiles:[],corrections:new Map()},muzzles:any[]=[],particles:any[]=[];
 setProjectileFlightLayer(display,flight);setPredictedProjectileLayer(display,prediction);setLocalMuzzleLayer(display.fxSystem,muzzles);setLocalParticleLayer(display.fxSystem,particles);
 const view=display.renderView();assert.equal(view,display.renderView());assert.equal(view.playerShip,display.playerShip);
 assert.equal(view.projectileFlight,flight);assert.equal(view.projectilePrediction,prediction);assert.equal(view.localMuzzles,muzzles);assert.equal(view.localParticles,particles);
 for(const mount of display.playerShip.weapons)assert.equal(renderWeaponRange(display.playerShip,mount),host.playerShip.getWeaponDisplayRange(host.playerShip.weapons.find(m=>m.slotId===mount.slotId)!.spec));
});

import { Shield } from '../src/engine/simulation/Shield';
import { FluxTracker } from '../src/engine/simulation/FluxTracker';
import { ShipSystem } from '../src/engine/simulation/ShipSystem';
import { combatAudio, captureCombatAudio, setCombatAudioPlayback } from '../src/engine/audio/CombatAudioEvents';
import { sound } from '../src/engine/audio/SoundManager';
test('combat audio outlet copies events, preserves mixer methods and supports nested out-of-order disposal',()=>{
 const events:any[]=[],inner:any[]=[],fallback:any[]=[];const methods=[sound.play,sound.playAtPos,sound.startLoop,sound.stopLoop,sound.setMuffled];
 const restore=setCombatAudioPlayback(event=>fallback.push(event));
 try{
  const outerOff=captureCombatAudio(event=>events.push(event)),pos={x:1,y:2},listener={x:3,y:4};
  combatAudio.playAtPos('shot',pos,listener);pos.x=9;listener.y=8;
  assert.deepEqual(events[0],{kind:'play',key:'shot',position:[1,2],listener:[3,4],volume:.8,rate:1,maxDistance:2800});
  const innerOff=captureCombatAudio(event=>inner.push(event));outerOff();combatAudio.play('inner');assert.equal(events.length,1);assert.equal(inner.length,1);
  innerOff();innerOff();combatAudio.startLoop('loop');combatAudio.stopLoop('loop');combatAudio.setMuffled(true);
  assert.deepEqual(fallback.map(event=>event.kind),['loop','loop','muffled']);
  assert.deepEqual([sound.play,sound.playAtPos,sound.startLoop,sound.stopLoop,sound.setMuffled],methods);
 }finally{restore();}
});
import { MotionPrediction } from '../src/network/MotionPrediction';
import { LocalFirePrediction } from '../src/network/LocalFirePrediction';
import { LocalTurretPrediction } from '../src/network/LocalTurretPrediction';
import { shipPresentationPose } from '../src/engine/visual/ShipPresentation';
import { blankInput } from '../src/network/protocol';
import { CombatPresentationEncoder } from '../src/engine/runtime/local/CombatPresentationEncoder';
import { CombatPresentationDecoder } from '../src/engine/runtime/local/CombatPresentationDecoder';
import { build as buildBoundary } from 'esbuild';

test('LAN display world motion/fire/turret reads match authority without writing either world or losing teleport endpoints',()=>{
 const fixture=match(2);const host=createLanWorld(fixture).engine;
 host.playerShip.pos.set(0,0);host.playerShip.prevPos.set(0,0);host.playerShip.vel.set(60,0);host.playerShip.facingRad=host.playerShip.prevFacingRad=0;
 const take=(tick:number)=>displayWire(captureLanDisplayCombat(host,tick,{0:tick,1:tick},0,null));
 const display=createLanDisplayWorld(fixture,0,take(0)).world;
 const before=JSON.stringify(take(0)),pa=new MotionPrediction(),pb=new MotionPrediction();
 const input={...blankInput(),seq:1,keys:1,aim:[2000,0] as [number,number],pointerActive:true,firing:true};
 for(const [p,ship] of [[pa,host.playerShip],[pb,display.playerShip]] as const){p.record(input,0);p.receive(ship,0,0);for(let t=0;t<=100;t+=1000/60)p.render(ship,input,t,true);}
 assert.deepEqual(shipPresentationPose(display.playerShip),shipPresentationPose(host.playerShip));
 const fire=new LocalFirePrediction(),turret=new LocalTurretPrediction();fire.receive(display,0,0,100);turret.receive(display,0,0,100);
 // Replayed input is visual-only: pose/weapon/flux state remains authority-owned.
 turret.record(input,100);turret.render(display,input,116,true);fire.record(display,input,116,true);
 assert.deepEqual(display.playerShip.pos,host.playerShip.pos);assert.equal(display.playerShip.flux.totalFlux,host.playerShip.flux.totalFlux);
 for(const mount of display.playerShip.weapons){const source=host.playerShip.weapons.find(m=>m.slotId===mount.slotId)!;assert.equal(mount.displaySpeed,host.playerShip.getWeaponDisplaySpeed(source.spec));assert.equal(mount.ammo,source.ammo);}
 pa.clear(host.playerShip);pb.clear(display.playerShip);turret.reset();fire.reset(display);
 assert.equal(JSON.stringify(take(0)),before);
 host.playerShip.pos.x+=20;host.playerShip.teleportSequence++;const one=take(1);
 host.playerShip.pos.x+=2;const two=take(2);const endpoints:any[]=[];
 applyLanDisplaySnapshots(display,[one,two],false,()=>endpoints.push([display.playerShip.prevPos.x,display.playerShip.pos.x]));
 assert.deepEqual(endpoints,[[20,20],[20,22]]);
});

test('LAN display world stations and phase ships preserve projected component reads across cold join',()=>{
 for(const hull of ['station1','doom','retribution']){
  const fixture=match(2);fixture.players[0].hull=hull;
  const host=createLanWorld(fixture).engine;host.playerShip.shield.phaseState='OUT';host.playerShip.shield.phaseEffectLevel=.61;
  const display=createLanDisplayWorld(fixture,0,displayWire(captureLanDisplayCombat(host,300,{0:0,1:0},0,null))).world;
  const actual=display.playerShip,expected=host.playerShip;
  assert.equal(actual.isPhased,expected.isPhased);assert.equal(actual.phaseVisualAlpha,expected.phaseVisualAlpha);
  assert.equal(actual.shield.getPhaseSpeedMultiplier(.35),expected.shield.getPhaseSpeedMultiplier(.35));
  assert.deepEqual(actual.assemblyShips.map(s=>s.id),expected.assemblyShips.map(s=>s.id));
  assert.deepEqual(collectCombatTextureUrls(display.renderView()),collectCombatTextureUrls(combatRenderView(host)));
 }
});

test('local display codec has no compatibility mode and rejects retired simulation class IDs',()=>{
 const host=createLanWorld(match(2)).engine;
 const frame=new CombatPresentationEncoder(1).capture(host,0),view=new CombatPresentationDecoder(1).apply(structuredClone(frame));
 assert.ok(view.view.playerShip instanceof ProjectedRenderShip);assert.ok(!(view.view.playerShip instanceof Ship));
 for(const type of [1,2,3,4,5,6,7,8,9]){const bad=structuredClone(frame);bad.shapes.find(s=>s.type===11)!.type=type;assert.throws(()=>new CombatPresentationDecoder(1).apply(bad));}
 assert.throws(()=>new CombatPresentationDecoder(1,'compatibility' as any));assert.throws(()=>new CombatPresentationEncoder(1,'compatibility' as any));
});

test('display decoder dependency closures exclude simulation constructors and authority codecs',async()=>{
 for(const entry of ['src/network/LanDisplayBootstrap.ts','src/engine/runtime/local/CombatPresentationDecoder.ts','src/engine/render/ShipRenderQueries.ts']){
  const result=await buildBoundary({entryPoints:[entry],bundle:true,write:false,metafile:true,platform:'browser',format:'esm',logLevel:'silent',define:{__LAN_BUILD_ID__:'"boundary"','import.meta.env':'{"BASE_URL":"/","DEV":false}'}});
  const forbidden=Object.keys(result.metafile!.inputs).filter(p=>/\/(CombatEngine|Ship|Shield|FluxTracker|ShipSystem|ArmorGrid)\.ts$/.test(p)||p.endsWith('/AuthorityCombatSnapshot.ts')||p.endsWith('/CombatPresentationEncoder.ts'));
  assert.deepEqual(forbidden,[],entry);
 }
});
import { i18n } from '../src/engine/i18n/LocalizationManager';
test('LAN display world registers authority-provided ship labels without installing a simulation design',()=>{
 const fixture=match(2),host=createLanWorld(fixture).engine,key='lan-display-test.authority-name';
 host.playerShip.spec={...host.playerShip.spec,nameKey:key,i18n:{zh_CN:{[key]:'纯显示舰名'},en_US:{[key]:'Display ship'}}};
 assert.equal(i18n.t(key),key);
 createLanDisplayWorld(fixture,0,displayWire(captureLanDisplayCombat(host,12,{0:0,1:0},0,null)));
 assert.notEqual(i18n.t(key),key);
});


test('LAN display projection reuse resamples live fields and never mutates prior wire snapshots',()=>{
 const fixture=match(2),host=createLanWorld(fixture).engine,ship=host.playerShip;
 const reusable=new LanShipProjection();
 const project=(projector:LanShipProjection)=>{projector.begin();const row=projector.project(ship);projector.finish();return row;};
 const firstRow=project(reusable);
 for(const packed of [false,true]) {
  const take=(tick:number)=>captureLanDisplayCombat(host,tick,{0:tick,1:tick},0,null,true,packed);
  const first=take(0),frozen=encodeProjectedBinaryFrame(first,true)!.slice();
  const rng=JSON.stringify([host.random,host.visualRandom]);
  ship.hullHp-=17;ship.flux.hardFlux+=123;ship.armor.setCell(0,0,1.25);
  ship.weapons[0].currentAngleRad+=.125;ship.weapons[0].cooldownTimer+=.25;
  ship.shield.isActive=!ship.shield.isActive;
  host.combatTime+=1/60;
  assert.equal(project(reusable),firstRow,'reuse scratch identity, not prior values');
  assert.deepEqual(firstRow,project(new LanShipProjection()),'warm and cold full read models agree');
  const second=take(1),display=createLanDisplayWorld(fixture,0,displayWire(second)).world;
  assert.equal(display.playerShip.hullHp,ship.hullHp);
  assert.equal(display.playerShip.flux.hardFlux,ship.flux.hardFlux);
  assert.equal(display.playerShip.armor.cells[0],1.25);
  assert.equal(display.playerShip.weapons[0].currentAngleRad,ship.weapons[0].currentAngleRad);
  assert.equal(JSON.stringify([host.random,host.visualRandom]),rng,'capture must not consume RNG');
  assert.deepEqual(encodeProjectedBinaryFrame(first,true),frozen,'old packet owns all mutable wire data');
  // Rewind/republication must not depend on a previously serialized tick.
  assert.deepEqual(encodeProjectedBinaryFrame(take(1),true),encodeProjectedBinaryFrame(second,true));
 }
});


test('LAN display fixed record plans preserve cold/warm full data graphs against the frozen receiver',()=>{
 const fixture=match(4,'drover'),host=createLanWorld(fixture).engine;
 host.projectiles.push({id:.125,specId:'pulse',sourceShipId:host.playerShip.id,pos:new Vector2(1,2),vel:new Vector2(60,0),ballisticTail:new Vector2(0,2),fadeProgress:.25} as any);
 const take=(tick:number)=>displayWire(captureLanDisplayCombat(host,tick,{0:tick,1:tick},0,null,true,true));
 const first=take(0),a=controlDisplayWorld(0,first).world,b=createLanDisplayWorld(fixture,0,first).world;
 const armor=b.playerShip.armor.cells,weapon=b.playerShip.weapons[0],position=weapon.relativePos;
 for(let tick=0;tick<12;tick++){
  if(tick===3)host.playerShip.teleportSequence++;
  host.playerShip.hullHp-=tick;host.playerShip.pos.x+=tick;
  host.playerShip.weapons[0].currentAngleRad+=.125;
  host.projectiles[0].pos.x+=5;host.projectiles[0].fadeProgress+=.01;
  if(tick===5)host.projectiles.push({...host.projectiles[0],id:.25,pos:new Vector2(100,200)});
  if(tick===7)host.projectiles.reverse();if(tick===8)host.projectiles.pop();
  const frame=tick===10?first:take(tick);
  // Deliberate renderer-side edits must be overwritten, not cached away.
  for(const replica of [a,b]){replica.playerShip.weapons[0].currentAngleRad=-999;replica.playerShip.armor.cells[0]=-8;}
  controlDisplayApply(a,frame,tick===10);applyLanDisplaySnapshot(b,frame,tick===10);
  assert.deepEqual(serialize(b),serialize(a),'complete viewer graph at '+tick);
  assert.equal(b.playerShip.armor.cells,armor);assert.equal(b.playerShip.weapons[0],weapon);assert.equal(weapon.relativePos,position);
 }
});

test('LAN display record plans retain method/accessor guards, restore order, local fields and nested identity',()=>{
 const layouts=(keys:string[])=>displayLayouts([keys],new ExplosionPuffDecoder(),new DynamicParticleDecoder());
 const ships=new Map<string,object>(),keys=Array.from({length:80},(_,i)=>'field'+i),values=keys.map((_,i)=>i%3?i:{$vector:[i,-i]});
 for(const decode of [controlUnpackDisplay,unpackDisplay]){
  const l=layouts(keys),wire={$record:0,values};const first=decode(wire,undefined,ships,l),vector=first.field0;
  assert.deepEqual(Object.keys(first),keys);first.local=9;first.field0.set(-9,-9);
  assert.equal(decode(wire,first,ships,l),first);assert.equal(first.field0,vector);assert.deepEqual(vector,new Vector2(0,-0));assert.equal(first.local,9);
  let invoked=0;Object.defineProperty(first,'field1',{get(){invoked++;return 4;},configurable:true});
  assert.throws(()=>decode(wire,first,ships,l),/read capability/);assert.equal(invoked,0);
  assert.throws(()=>decode({$record:0,values:[1,2]},undefined,ships,layouts(['safe','toString'])),/read capability/);
  assert.throws(()=>decode({safe:1,toString:2},undefined,ships,layouts([])),/read capability/);
  const partial:any={safe:0,blocked(){invoked++;}};
  assert.throws(()=>decode({$record:0,values:[7,8]},partial,ships,layouts(['safe','blocked'])),/read capability/);
  assert.equal(partial.safe,7);assert.equal(typeof partial.blocked,'function');assert.equal(invoked,0);
  // A wire-array getter adding a late inherited method must not be hidden by
  // a record allocation or compiled plan. Do not invoke that inherited capability.
  const late='displayAllocationLateCapability',lateValues=[1,2];
  Object.defineProperty(lateValues,1,{get(){Object.defineProperty(Object.prototype,late,{configurable:true,value:()=>{invoked++;}});return 2;}});
  try{assert.throws(()=>decode({$record:0,values:lateValues},undefined,ships,layouts(['safe',late])),/read capability/);assert.equal(invoked,0);}
  finally{Reflect.deleteProperty(Object.prototype,late);}
  const row={local:1},rows=[row];
  assert.throws(()=>decode({$records:0,values:[[3],[4,5]]},rows,ships,layouts(['v'])),/record row/);
  assert.equal(rows[0],row);assert.deepEqual(row,{local:1,v:3});assert.equal(rows.length,1);
 }
});

test('LAN display direct projectile columns retain fresh-row guards and viewer-owned template restoration',()=>{
 const fixture=match(2),host=createLanWorld(fixture).engine;
 const projectile:any={id:.125,specId:'pulse',sourceShipId:host.playerShip.id,pos:new Vector2(1,2),vel:new Vector2(60,0),ballisticTail:new Vector2(0,2),fadeProgress:.25,isPlayer:true,elapsedTime:0,radius:1,damage:5,damageType:'ENERGY',rangeRemaining:100,totalRange:100,color:[1,2,3]};
 host.projectiles.push(...Array.from({length:16},(_,i)=>({...projectile,id:i+.125,pos:new Vector2(i,2)})));
 const frame=displayWire(captureLanDisplayCombat(host,1,{0:1,1:1},0,null,true,true));
 assert.ok(frame.world.projectiles.$projectileColumns);
 for(const decode of [controlUnpackProjectiles,unpackDisplayProjectiles]){
  const l=displayLayouts(frame.layouts,new ExplosionPuffDecoder(),new DynamicParticleDecoder()),ships=new Map(host.allCapitalShips.map(s=>[s.id,{}]));
  const a=decode(frame.world.projectiles,undefined,ships,l),first=a[0],position=first.pos,tail=first.ballisticTail;
  first.pos.set(-1,-1);first.ballisticTail.set(-1,-1);first.local=7;
  assert.equal(decode(frame.world.projectiles,a,ships,l),a);assert.equal(a[0],first);assert.equal(first.pos,position);assert.equal(first.ballisticTail,tail);
  assert.equal(first.pos.x,0);assert.equal(first.local,7);
  const key=projectileColumnPlan(frame.world.projectiles,frame.layouts).templates[0].keys[0];let called=0;
  Object.defineProperty(first,key,{configurable:true,get(){called++;return 3;}});
  assert.throws(()=>decode(frame.world.projectiles,a,ships,l),/read capability/);assert.equal(called,0);
 }
});


test('LAN display every compiled layout matches generic guard/read/write and exception order',()=>{
 const denied=()=>{};
 for(const keys of displayRestoreShapes){
  assert.ok(displayRecordRestorer(keys));assert.ok(displayRecordRestorer(keys.slice()));
  assert.equal(displayRecordRestorer([...keys,'unknownDisplayField']),undefined);
  const changed=keys.slice();changed[changed.length-1]='unknownDisplayField';assert.equal(displayRecordRestorer(changed),undefined);
  for(const depth of [0,63,64])for(const blocked of [-1,Math.min(4,keys.length-1)]){
   const run=(decode:typeof unpackDisplay)=>{
    const events:any[]=[],state=Object.fromEntries(keys.map(key=>[key,0]));if(blocked>=0)state[keys[blocked]]=denied;
    const target=new Proxy(state,{getOwnPropertyDescriptor(t,k){events.push(['descriptor',k]);return Reflect.getOwnPropertyDescriptor(t,k);},get(t,k){events.push(['get',k]);return Reflect.get(t,k);},set(t,k,v){events.push(['set',k,v]);t[k]=v;return true;}});
    const values=new Proxy(keys.map((_,i)=>i%3?i:{$vector:[i,-i]}),{get(t,k){if(typeof k==='string'&&/^\d+$/.test(k))events.push(['value',k]);return Reflect.get(t,k);}});
    const l=displayLayouts([keys],new ExplosionPuffDecoder(),new DynamicParticleDecoder());let error=null;
    try{decode({$record:0,values},target,new Map(),l,depth);}catch(e){error=(e as Error).message;}
    return {events,state,error};
   };
   assert.deepEqual(run(unpackDisplay),run(controlUnpackDisplay),keys[0]+'/'+keys.length+' depth '+depth+' blocked '+blocked);
  }
 }
});


test('LAN display single-pass projection preserves v0.2.11 bytes without building discarded renderer components',()=>{
 const fixture=match(18),engine=createLanWorld(fixture).engine;
 const muzzle=configureHostCosmetics(engine,true,true,true),baseline=new BaselineLanShipProjection();
 const productionProject=LanShipProjection.prototype.project,renderProject=RenderShipProjection.prototype.project;
 const timings:{before:number;after:number}[]=[],retained:{frame:any;bytes:Uint8Array}[]=[];
 const bytes=(frame:any)=>encodeProjectedBinaryFrame(frame,true)!;
 const before=(tick:number)=>{
  baseline.begin();LanShipProjection.prototype.project=function(ship){return baseline.project(ship);};
  try{return captureLanDisplayCombat(engine,tick,{0:tick,1:tick},0,muzzle,true,true);}
  finally{LanShipProjection.prototype.project=productionProject;baseline.finish();}
 };
 const after=(tick:number)=>{
  // The original implementation fails here even when a timing comparison is
  // noisy. LAN may validate native readers, but may not build then discard a
  // complete local renderer graph (weapon dictionary, ranges, systems, carrier).
  RenderShipProjection.prototype.project=function(){throw Error('Discarded renderer projection executed');};
  try{return captureLanDisplayCombat(engine,tick,{0:tick,1:tick},0,muzzle,true,true);}
  finally{RenderShipProjection.prototype.project=renderProject;}
 };
 try{
  for(let tick=1;tick<=1320;tick++){
   engine.fixedUpdate(1/60);if(tick<=1200)continue;
   const order=tick%2?[before,after]:[after,before],frames:any[]=[],costs:number[]=[];
   for(const take of order){const started=performance.now();frames.push(take(tick));costs.push(performance.now()-started);}
   const old=frames[tick%2?0:1],next=frames[tick%2?1:0],oldBytes=bytes(old),newBytes=bytes(next);
   assert.deepEqual(newBytes,oldBytes,'full production binary differs at '+tick);
   if(tick===1201||tick===1250)retained.push({frame:next,bytes:newBytes});
   timings.push({before:costs[tick%2?0:1],after:costs[tick%2?1:0]});
  }
  // Mutate in-place data: no spec/value caching is allowed to hide updates.
  engine.playerShip.weapons[0].spec.range+=17;engine.playerShip.weapons[0].currentAngleRad+=.3;
  engine.playerShip.armor.setCell(0,0,1.25);
  assert.deepEqual(bytes(after(1321)),bytes(before(1321)));
  for(const row of retained)assert.deepEqual(bytes(row.frame),row.bytes,'later projection mutated retained wire data');
  const summary=(a:number[])=>{a.sort((x,y)=>x-y);return {mean:a.reduce((x,y)=>x+y,0)/a.length,p50:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)]};};
  const report={scope:'Same frozen 18-ship engine per paired capture, alternating order, ticks1201–1320. Exact full-wire equality. Offline capture CPU only; NOT WAN Hz/FPS.',before:summary(timings.map(x=>x.before)),after:summary(timings.map(x=>x.after))};
  if(process.env.LAN_PROJECTION_REPORT)fs.writeFileSync(process.env.LAN_PROJECTION_REPORT,JSON.stringify(report,null,2));
 }finally{LanShipProjection.prototype.project=productionProject;RenderShipProjection.prototype.project=renderProject;}
});


import { DisplayDefinitionCapture, CapturedDisplayDefinition, DisplayDefinitionRequest } from '../src/network/display/DisplayDefinitionCapture';
import { DisplayDefinitionReceiver } from '../src/network/display/DisplayDefinitionReceiver';
import { DISPLAY_DEFINITION_LIMITS } from '../src/network/display/DisplayDefinitionTable';
import { immutableCopy } from '../src/engine/extensions/Immutable';
import { encodeProjectedSnapshotTape } from '../src/network/BinarySnapshot.mjs';

// Compare every own data value, typed buffer and collection without treating the
// deliberate immutable definition sharing/property flags as a gameplay change.
function definitionDisplayValues(world:LanDisplayWorld):unknown {
 const ships=new Map<string,ProjectedRenderShip>();
 const walk=(value:any,ancestors:object[]=[]):any=>{
  if(typeof value==='number')return ['number',String(value)];
  if(value===undefined)return ['undefined'];
  if(value===null||typeof value!=='object')return value;
  if(value instanceof ProjectedRenderShip){ships.set(value.id,value);return ['ship',value.id];}
  if(ancestors.includes(value))return ['cycle',ancestors.indexOf(value)];
  const next=[...ancestors,value];
  if(ArrayBuffer.isView(value))return ['typed',value.constructor.name,Buffer.from(value.buffer,value.byteOffset,value.byteLength).toString('hex')];
  if(value instanceof Map)return ['map',[...value].map(([k,v])=>[walk(k,next),walk(v,next)])];
  if(value instanceof Set)return ['set',[...value].map(v=>walk(v,next))];
  return [Object.getPrototypeOf(value)?.constructor?.name??null,Object.keys(value).sort().map(key=>[key,walk(value[key],next)])];
 };
 const root=walk(world),rows:any[]=[];
 for(const [id,ship] of ships)rows.push([id,Object.keys(ship).sort().map(key=>[key,walk(Reflect.get(ship,key),[ship])])]);
 return [root,rows];
}

test('display-v2 definitions retain all display/HUD values, mutable edits, skipped frames and cold reconnect',()=>{
 const fixture=match(6,'drover'),host=createLanWorld(fixture).engine;
 configureHostCosmetics(host,true,true);
 for(const packed of [false,true]) {
  const wire=(frame:any)=>packed?displayWire(frame):JSON.parse(JSON.stringify(frame));
  const take=(tick:number,definitions:boolean)=>captureLanDisplayCombat(host,tick,{0:tick,1:tick},0,null,true,packed,definitions);
  const initial=take(0,true),retained=encodeProjectedBinaryFrame(initial,true)!.slice();
  assert.equal(initial.displayVersion,2);assert.ok(initial.displayDefinitions!.length>0);
  const a=createLanDisplayWorld(fixture,0,wire(take(0,false))).world,b=createLanDisplayWorld(fixture,0,wire(initial)).world;
  const hudA=new CombatHudProjector(),hudB=new CombatHudProjector();
  const check=()=>{assert.deepEqual(definitionDisplayValues(b),definitionDisplayValues(a));assert.deepEqual(jsonData(hudB.capture(b)),jsonData(hudA.capture(a)));assert.deepEqual(collectCombatTextureUrls(b.renderView()),collectCombatTextureUrls(a.renderView()));};
  check();const identity=b.playerShip,definition=b.playerShip.weapons[0].spec,source=host.playerShip.weapons[0].spec;
  assert.ok(Object.isFrozen(definition));assert.notEqual(definition,source);assert.ok(!Object.isFrozen(source));
  assert.equal(Reflect.set(definition,'range',-999),false);
  for(let tick=1;tick<=360;tick++) {
   host.fixedUpdate(1/60);
   if(tick===60)source.range+=17;
   if(tick===120)(source as any).definitionProbe={nested:[1,undefined,3]}; // Unsupported mutable subtree falls back.
   if(tick===180)(source as any).definitionProbe.nested[0]=9;
   if(tick===240)delete (source as any).definitionProbe; // Sender re-enters the table; receiver retains legacy local fields.
   if(tick%30)continue;
   const rng=JSON.stringify([host.random,host.visualRandom]),old=wire(take(tick,false)),next=wire(take(tick,true));
   assert.equal(JSON.stringify([host.random,host.visualRandom]),rng);
   applyLanDisplaySnapshot(a,old);applyLanDisplaySnapshot(b,next);check();assert.equal(b.playerShip,identity);
   if(tick===150)assert.ok(!Object.isFrozen(b.playerShip.weapons[0].spec));
   if(tick===270){assert.ok(!Object.isFrozen(b.playerShip.weapons[0].spec));assert.equal((b.playerShip.weapons[0].spec as any).definitionProbe.nested[0],9);}
   if(tick===300)assert.deepEqual(definitionDisplayValues(createLanDisplayWorld(fixture,0,next).world),definitionDisplayValues(createLanDisplayWorld(fixture,0,old).world));
  }
  // Definition changes cannot alter old retained publications or other viewers.
  assert.deepEqual(encodeProjectedBinaryFrame(initial,true),retained);
  const fresh=createLanDisplayWorld(fixture,0,wire(initial)).world;
  assert.equal(fresh.playerShip.weapons[0].spec.range,definition.range);
  applyLanDisplaySnapshot(b,wire(take(361,false)),true);applyLanDisplaySnapshot(a,wire(take(361,false)),true);check();
  applyLanDisplaySnapshot(b,wire(take(362,true)));applyLanDisplaySnapshot(a,wire(take(362,false)));check();
 }
});


test('display-v2 equal definitions retain per-mount identity and dynamic range/speed reads',()=>{
 const fixture=match(2),host=createLanWorld(fixture).engine;
 // The public display contract permits identical metadata with distinct dynamic
 // values. Inject that case at the projection boundary, without changing game rules.
 const project=LanShipProjection.prototype.project;
 const take=(tick:number,definitions:boolean)=>{
  LanShipProjection.prototype.project=function(ship){
   const row=project.call(this,ship);
   if(ship===host.playerShip){
    assert.ok(row.weapons.length>=2);
    row.weapons[1].weaponSpec=row.weapons[0].weaponSpec;
    row.weapons[0].displayRange=110+tick;row.weapons[1].displayRange=220+tick;
    row.weapons[0].displaySpeed=330+tick;row.weapons[1].displaySpeed=440+tick;
   }
   return row;
  };
  try{return displayWire(captureLanDisplayCombat(host,tick,{0:tick,1:tick},0,null,false,true,definitions));}
  finally{LanShipProjection.prototype.project=project;}
 };
 const a=createLanDisplayWorld(fixture,0,take(0,false)).world,b=createLanDisplayWorld(fixture,0,take(0,true)).world;
 const check=(tick:number)=>{
  const first=b.playerShip.weapons[0].spec,second=b.playerShip.weapons[1].spec;
  assert.deepEqual(first,second);assert.notEqual(first,second,'equal definitions must not alias mount roots');
  assert.ok(Object.isFrozen(first)&&Object.isFrozen(second));
  for(let i=0;i<2;i++){
   const spec=b.playerShip.weapons[i].spec,old=a.playerShip.weapons[i].spec;
   assert.equal(b.playerShip.getWeaponDisplayRange(spec),110*(i+1)+tick);
   assert.equal(b.playerShip.getWeaponDisplaySpeed(spec),330+110*i+tick);
   assert.equal(b.playerShip.getWeaponDisplayRange(spec),a.playerShip.getWeaponDisplayRange(old));
   assert.equal(b.playerShip.getWeaponDisplaySpeed(spec),a.playerShip.getWeaponDisplaySpeed(old));
  }
 };
 check(0);const roots=b.playerShip.weapons.slice(0,2).map(m=>m.spec);
 applyLanDisplaySnapshot(a,take(1,false));applyLanDisplaySnapshot(b,take(1,true));check(1);
 for(let i=0;i<2;i++)assert.equal(b.playerShip.weapons[i].spec,roots[i],'unchanged binding is stable');
 const source=host.playerShip.weapons[0].spec;source.range+=17;
 applyLanDisplaySnapshot(a,take(2,false));applyLanDisplaySnapshot(b,take(2,true));check(2);
 assert.notEqual(b.playerShip.weapons[0].spec,roots[0]);assert.notEqual(b.playerShip.weapons[1].spec,roots[1]);
 assert.notEqual(roots[0].range,source.range,'retained immutable binding was not mutated');
 // Only the immutable children, never binding roots, may be shared.
 const capture=new DisplayDefinitionCapture();capture.reference({range:1,child:immutableCopy({colors:[1,2],optional:undefined})});
 const owner=new DisplayDefinitionReceiver(),definition=owner.prepare(capture.entries)[0];
 const one:any=owner.bind(definition),two:any=owner.bind(definition);
 assert.notEqual(one,two);assert.equal(one.child,two.child);assert.ok(Object.isFrozen(one.child.colors));
 assert.equal(owner.sourceOf(one),definition);assert.ok(owner.owns(one));
 assert.throws(()=>new DisplayDefinitionReceiver().bind(definition),/Unowned/);
});

test('display-v2 definition qualification does not hide mutations or execute accessors',()=>{
 const frozenChild=immutableCopy({colors:[1,2,3],optional:undefined});
 const source={range:10,child:frozenChild};
 const capture=new DisplayDefinitionCapture(),first=capture.reference(source) as CapturedDisplayDefinition;
 assert.ok(first instanceof CapturedDisplayDefinition);assert.equal((capture.reference(source) as CapturedDisplayDefinition).index,first.index);
 const receiver=new DisplayDefinitionReceiver(),before=receiver.prepare(capture.entries)[first.index] as any;
 source.range=11;const changed=capture.reference(source) as CapturedDisplayDefinition;
 assert.notEqual(changed.index,first.index);assert.equal(before.range,10);
 const decoded=receiver.prepare(capture.entries)[changed.index] as any;assert.equal(decoded.range,11);assert.equal(decoded.child.optional,undefined);assert.ok(Object.hasOwn(decoded.child,'optional'));assert.ok(Object.isFrozen(decoded.child.colors));
 let reads=0;const custom=Object.defineProperty({},'range',{enumerable:true,get(){reads++;return 99;}});
 assert.equal(capture.reference(custom),custom);assert.equal(reads,0);
 const mutableChild={nested:[1]},fallback={child:mutableChild};assert.equal(capture.reference(fallback),fallback);assert.ok(!Object.isFrozen(mutableChild));
 const deferred=new DisplayDefinitionRequest(source,capture);source.range=12;
 const marker=deferred.owner.reference(deferred.value) as CapturedDisplayDefinition;
 assert.equal((receiver.prepare(capture.entries)[marker.index] as any).range,12);
 const wide={huge:'x'.repeat(DISPLAY_DEFINITION_LIMITS.string+1)};assert.equal(capture.reference(wide),wide);
});

test('display-v2 warm qualification still samples shape, descriptors and every changed value',()=>{
 const child=immutableCopy({colors:[1,undefined,3]}),source:any={first:1,middle:2,child,last:4};
 let capture=new DisplayDefinitionCapture();const receiver=new DisplayDefinitionReceiver();
 const grammar=(value:any):any=>value===undefined?[2]:Array.isArray(value)?[1,value.map(grammar)]:value&&typeof value==='object'?[0,Object.keys(value).map(key=>[key,grammar(value[key])])]:value;
 const check=()=>{
  const marker=capture.reference(source);assert.ok(marker instanceof CapturedDisplayDefinition);
  assert.equal(capture.entries[marker.index],JSON.stringify(grammar(source)));
  assert.deepEqual(receiver.prepare(capture.entries)[marker.index],Object.fromEntries(Object.keys(source).map(key=>[key,source[key]])));
  return marker.index;
 };
 const first=check();assert.equal(check(),first);
 for(const key of ['first','middle','last']){source[key]+=10;assert.notEqual(check(),first);}
 source.child=immutableCopy({colors:[3,undefined,1]});check();
 // Replacing with an equal but independently frozen subtree is still observed;
 // exact content dedup is allowed only AFTER the live value has been sampled.
 source.child=immutableCopy({colors:[3,undefined,1]});check();
 source.extra=undefined;check();delete source.extra;check();
 const saved=source.first;delete source.first;source.first=saved;check();
 Object.defineProperty(source,'middle',{enumerable:false});check();
 Object.defineProperty(source,'middle',{enumerable:true});check();
 let reads=0;const last=source.last;
 source.first+=1; // Abort after a changed prefix; do not corrupt the cached shape.
 Object.defineProperty(source,'last',{configurable:true,enumerable:true,get(){reads++;return last;}});
 assert.equal(capture.reference(source),source);assert.equal(reads,0);
 Object.defineProperty(source,'last',{configurable:true,enumerable:true,writable:true,value:last});check();
 source.child={colors:[3,undefined,1]};assert.equal(capture.reference(source),source);
 source.child=Object.freeze({colors:Object.freeze([3,undefined,1])});assert.equal(capture.reference(source),source,'unregistered frozen child is not trusted');
 source.child=child;check();
 Object.setPrototypeOf(source,{custom:true});assert.equal(capture.reference(source),source);
 Object.setPrototypeOf(source,null);check();Object.setPrototypeOf(source,Object.prototype);check();
 Object.defineProperty(source,'__proto__',{configurable:true,enumerable:true,value:undefined});assert.equal(capture.reference(source),source);delete source.__proto__;check();
 source.last=Infinity;assert.equal(capture.reference(source),source);source.last=last;check();
 source['x'.repeat(DISPLAY_DEFINITION_LIMITS.key+1)]=1;assert.equal(capture.reference(source),source);delete source['x'.repeat(DISPLAY_DEFINITION_LIMITS.key+1)];check();
 // The global weak shape cache may survive, but admission/indexes are per frame.
 const retained=capture.entries.slice();capture=new DisplayDefinitionCapture();check();assert.equal(capture.entries.length,1);
 source.middle+=1;check();assert.equal(capture.entries.length,2);assert.notDeepEqual(capture.entries,retained);
 const full=new DisplayDefinitionCapture();for(let i=0;i<DISPLAY_DEFINITION_LIMITS.entries;i++)assert.ok(full.reference({i}) instanceof CapturedDisplayDefinition);
 const overflow={i:DISPLAY_DEFINITION_LIMITS.entries};assert.equal(full.reference(overflow),overflow);
 assert.ok(new DisplayDefinitionCapture().reference(overflow) instanceof CapturedDisplayDefinition,'previously inspected data can enter a fresh table');
 assert.ok(!Object.isFrozen(source));assert.equal(reads,0);
});

test('display-v2 tables reject unsafe content and bad references before changing the display',()=>{
 const fixture=match(2),host=createLanWorld(fixture).engine;
 const frame=displayWire(captureLanDisplayCombat(host,0,{0:0,1:0},0,null,false,true,true));
 const viewer=createLanDisplayWorld(fixture,0,frame).world,baseline=serialize(viewer);
 for(const mutate of [
  (p:any)=>{p.displayDefinitions=['not json'];},
  (p:any)=>{p.displayDefinitions=['[0,[["__proto__",[0,[]]]]]'];},
  (p:any)=>{p.displayDefinitions=['[0,[["x",1],["x",2]]]'];},
  (p:any)=>{p.displayDefinitions=['[0,[["spriteUrl","https://untrusted.invalid/image.png"]]]'];},
  (p:any)=>{p.displayDefinitions=['[0,[["x",1e999]]]'];},
  (p:any)=>{p.displayDefinitions=['[1,[]]'];},
  (p:any)=>{p.displayDefinitions=Array(DISPLAY_DEFINITION_LIMITS.entries+1).fill('[0,[]]');},
  (p:any)=>{p.ships[0].state.hullHp=-9;p.ships[1].state.extra={$displayDefinition:p.displayDefinitions.length};},
  (p:any)=>{p.ships[0].state.extra={$displayDefinition:0,extra:1};},
  (p:any)=>{p.ships[0].state.extra={$displayDefinition:-1};},
  (p:any)=>{p.displayVersion=1;},
 ]){const bad=structuredClone(frame);mutate(bad);assert.throws(()=>applyLanDisplaySnapshot(viewer,bad));assert.deepEqual(serialize(viewer),baseline);}
 // Cached references may not bypass an accessor installed on a mutable fallback.
 const ordinary=displayWire(captureLanDisplayCombat(host,1,{0:1,1:1},0,null,false,true,false));
 const mutableViewer=createLanDisplayWorld(fixture,0,ordinary).world;let invoked=0;
 Object.defineProperty(mutableViewer.playerShip.weapons[0].weaponSpec,'range',{configurable:true,enumerable:true,get(){invoked++;return 9;}});
 assert.throws(()=>applyLanDisplaySnapshot(mutableViewer,frame),/read capability/);assert.equal(invoked,0);
 const bounds=new DisplayDefinitionReceiver();
 assert.throws(()=>bounds.prepare([' '.repeat(DISPLAY_DEFINITION_LIMITS.characters+1)]),/budget/);
 let nested:any=0;for(let i=0;i<34;i++)nested=[0,[['child',nested]]];
 assert.throws(()=>bounds.prepare([JSON.stringify(nested)]),/budget/);
 assert.throws(()=>bounds.prepare([JSON.stringify([0,[['wide',[1,Array(DISPLAY_DEFINITION_LIMITS.nodes).fill(0)]]]])]),/budget/);
 const capture=new DisplayDefinitionCapture();capture.reference({range:1});const receiver=new DisplayDefinitionReceiver();
 const first=receiver.prepare(capture.entries)[0];assert.equal(receiver.prepare(capture.entries)[0],first);
 assert.notEqual(new DisplayDefinitionReceiver().prepare(capture.entries)[0],first,'cache belongs to one receiver');
 for(let i=2;i<300;i++){const next=new DisplayDefinitionCapture();next.reference({range:i});receiver.prepare(next.entries);}
 assert.deepEqual(receiver.prepare(capture.entries)[0],first,'eviction needs no old definition baseline');
 assert.ok(Object.isFrozen(first));
});

test('display-v2 definition frames traverse production binary, tape, relay and delta codecs',()=>{
 const fixture=match(4),host=createLanWorld(fixture).engine;
 const sender=new LanDeltaSender({ordered:true,motionReference:true}),receiver=new LanDeltaReceiver({motionReference:true});
 let viewer:LanDisplayWorld|undefined;
 for(let tick=0;tick<4;tick++){
  host.fixedUpdate(1/60);host.playerShip.weapons[0].spec.range+=tick;
  const frame=captureLanDisplayCombat(host,tick,{0:tick,1:tick},0,null,false,true,true);
  const bytes=encodeProjectedBinaryFrame(frame,true)!,tape=new SnapshotTapeWriter().encode(frame);
  assert.ok(tape);
  // The existing helper deliberately expands packed numbers into SWF2 scalar
  // arrays. Compare complete receiver values, not SWF2 vs SWF3 byte identity.
  const tapeFrame=decodeBinaryFrame(encodeProjectedSnapshotTape(tape!)!.bytes);
  assert.deepEqual(definitionDisplayValues(createLanDisplayWorld(fixture,0,tapeFrame).world),definitionDisplayValues(createLanDisplayWorld(fixture,0,decodeBinaryFrame(bytes)).world));
  const packet=encodeBinaryState('definitions',tick,bytes);
  assert.deepEqual(summarizeCombatFrame(decodeBinaryStateForRelay(packet).frame,4,tick-1),summarizeCombatFrame(frame,4,tick-1));
  const choice=sender.prepare(lanDeltaTarget(packet,tick,tick));assert.ok(choice);sender.commit(choice!);
  const decoded=decodeBinaryState(receiver.decode(choice!.packet)).frame;
  if(viewer)applyLanDisplaySnapshot(viewer,decoded);else viewer=createLanDisplayWorld(fixture,0,decoded).world;
  assert.equal(viewer.playerShip.weapons[0].spec.range,host.playerShip.weapons[0].spec.range);
 }
});

// Compare against the unmodified validator when DISPLAY_DEFINITION_BASELINE is
// set. Keep actual AssetManager shared; no permissive fake validation path.
test('display definition scalar traversal preserves data, assets and rejection rules',()=>{
 const outcome=(check:(v:unknown)=>void,value:unknown)=>{try{check(value);return 'ok';}catch(error){return (error as Error).name+':'+(error as Error).message;}};
 const asset='/game-assets/graphics/damage/damage_cracks48_0_glow.png';
 assert.ok(assetManager.hasPath(asset));
 const values:unknown[]=[undefined,null,true,false,0,-0,1.25,'',asset,'x'.repeat(65536),NaN,Infinity,-Infinity,Symbol('s'),2n,()=>1,new Date(),new Map(),new Set(),new Float32Array(2),/x/,
  {},Object.create(null),[],{spriteUrl:asset},{spriteUrl:''},{spriteUrl:'/not-bundled.png'},{spriteURL:'/not-bundled.png'},
  {spriteUrl:{ordinary:'not a path'}},{nested:{imageUrl:asset}},{imageUrl:asset+'?unbundled'},
  {'xUrl':'x'.repeat(65537)},{x:'x'.repeat(65537)},Array(5),{a:[null,undefined,true,-0,'字😀']},Object.assign(Object.create({inherited:()=>1}),{x:1})];
 for(const name of ['__proto__','prototype','constructor'])values.push(Object.defineProperty({},name,{enumerable:true,value:1}));
 let getterReads=0;
 values.push(Object.defineProperty({},'x',{enumerable:true,get(){getterReads++;return 1;}}));
 values.push(Object.defineProperty({},'ignored',{get(){getterReads++;return 1;}}));
 const array:any[]=[1];Object.setPrototypeOf(array,{inherited:()=>1});values.push(array);
 const cycle:any={};cycle.self=cycle;values.push(cycle);
 // Exercise mixed containers, including nonfinite/bigint/function values deep
 // inside otherwise valid definitions, not just handpicked root failures.
 let seed=917;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
 const leaf=()=>[undefined,null,true,false,0,-0,4.5,'字😀',asset,NaN,Infinity,2n,()=>1][random()%13];
 const make=(depth:number):unknown=>{
  if(depth===0||random()%4===0)return leaf();
  const result:any=random()%2?[]:{};
  for(let i=0;i<3;i++)result[Array.isArray(result)?i:'field'+i]=make(depth-1);
  return result;
 };
 for(let i=0;i<250;i++)values.push(make(5));
 for(const [i,value] of values.entries())assert.equal(outcome(validateDisplayDefinition,value),outcome(controlDefinition,value),'fixture '+i);
 assert.equal(getterReads,0,'accessors must never execute');
 for(const value of [NaN,Infinity,-Infinity])assert.throws(()=>validateDisplayDefinition(value),/Invalid display definition number/);
 for(const value of [Symbol('x'),2n,()=>1,new Date(),new Map(),new Set(),new Float32Array(2)])assert.throws(()=>validateDisplayDefinition(value),/Non-data display definition/);
 assert.throws(()=>validateDisplayDefinition({spriteUrl:'/unbundled'}),/Unbundled display asset/);
 assert.throws(()=>validateDisplayDefinition('x'.repeat(65537)),/Invalid display definition string/);
 assert.throws(()=>validateDisplayDefinition(Object.defineProperty({},'x',{enumerable:true,get(){throw Error('must not run');}})),/Display definition accessor/);
 for(const value of [null,undefined,false,0,-0,'',[],{},Object.create(null)])assert.doesNotThrow(()=>validateDisplayDefinition(value));
 const mutable:any={range:100,visuals:{spriteUrl:asset}};
 for(const check of [controlDefinition,validateDisplayDefinition]){
  check(mutable);mutable.range=NaN;assert.throws(()=>check(mutable),/number/);mutable.range=100;
  mutable.visuals.spriteUrl='/unbundled';assert.throws(()=>check(mutable),/Unbundled/);mutable.visuals.spriteUrl=asset;
  const before=serialize(mutable);check(mutable);assert.deepEqual(serialize(mutable),before);
 }
});

test('display definition scalar traversal keeps depth/node budgets and failure precedence',()=>{
 const outcome=(check:(v:unknown)=>void,value:unknown)=>{try{check(value);return 'ok';}catch(error){return (error as Error).name+':'+(error as Error).message;}};
 const wrap=(depth:number,leaf:unknown)=>{let node=leaf;for(let i=0;i<depth;i++)node={child:node};return node;};
 for(const leaf of [null,undefined,NaN,Infinity,'x'.repeat(65537),1,{},[],()=>1])for(const depth of [31,32,33,34]){
  const value=wrap(depth,leaf);assert.equal(outcome(validateDisplayDefinition,value),outcome(controlDefinition,value),'depth '+depth);
  if(depth>32)assert.equal(outcome(validateDisplayDefinition,value),'Error:Display definition budget exceeded');
 }
 for(const length of [199998,199999,200000]){
  const value=Array(length).fill(0);
  assert.equal(outcome(validateDisplayDefinition,value),outcome(controlDefinition,value),'width '+length);
  assert.equal(outcome(validateDisplayDefinition,value),length<200000?'ok':'Error:Display definition budget exceeded');
  value[length-1]=NaN;assert.equal(outcome(validateDisplayDefinition,value),outcome(controlDefinition,value),'width before type failure');
 }
 const poison:any[]=Array(199999).fill(0);
 Object.defineProperty(poison,'constructor',{value:1,enumerable:true});
 assert.equal(outcome(validateDisplayDefinition,poison),'Error:Invalid display definition key');
 assert.equal(outcome(validateDisplayDefinition,poison),outcome(controlDefinition,poison));
});

test('display definition scalar traversal retains descriptor trap order, mutation and reentry',()=>{
 const exercise=(check:(v:unknown)=>void,mutate:boolean)=>{
  const trace:string[]=[];let reentered=false;
  const child:any={range:10,spriteUrl:'/game-assets/graphics/damage/damage_cracks48_0_glow.png'};
  const tracked=(object:any,label:string)=>new Proxy(object,{
   getPrototypeOf(target){trace.push(label+':prototype');return Reflect.getPrototypeOf(target);},
   ownKeys(target){trace.push(label+':keys');return Reflect.ownKeys(target);},
   getOwnPropertyDescriptor(target,key){
    trace.push(label+':descriptor:'+String(key));
    if(label==='child'&&key==='range'&&!reentered){
     reentered=true;trace.push('reenter');check(Array(199999).fill(1));trace.push('reentered');
     if(mutate)target.spriteUrl='/unbundled';
    }
    return Reflect.getOwnPropertyDescriptor(target,key);
   },
   get(target,key,receiver){trace.push(label+':GET:'+String(key));return Reflect.get(target,key,receiver);},
  });
  const root=tracked({first:1,child:tracked(child,'child'),last:2},'root');
  let error='';try{check(root);}catch(e){error=(e as Error).name+':'+(e as Error).message;}
  return {trace,error,child};
 };
 for(const mutate of [false,true]){
  const old=exercise(controlDefinition,mutate),current=exercise(validateDisplayDefinition,mutate);
  assert.deepEqual(current,old);assert.ok(current.trace.includes('reentered'));
  assert.ok(!current.trace.some(s=>s.includes(':GET:')),'only data descriptors, not ordinary property access');
  assert.equal(current.error,mutate?'Error:Unbundled display asset':'');
 }
});

test('LAN display data field guard preserves own/inherited descriptor order and live capability rejection',()=>{
 const exercise=(guard:(object:object,key:string)=>void,kind:string)=>{
  const trace:string[]=[];let getterReads=0;
  const base:any=Object.create(null),middle:any=Object.create(base),own:any=Object.create(middle);
  base.value=()=>1;
  if(kind==='inherited-data')middle.value=3;
  if(kind==='own-data'||kind==='mutate'||kind==='reenter')own.value=4;
  if(kind==='own-function')own.value=()=>2;
  if(kind==='inherited-getter')Object.defineProperty(middle,'value',{get(){getterReads++;return 1;}});
  if(kind==='own-getter')Object.defineProperty(own,'value',{get(){getterReads++;return 1;}});
  if(kind==='own-setter')Object.defineProperty(own,'value',{set(){getterReads++;}});
  const tracked=(object:any,label:string,parent:object|null)=>new Proxy(object,{
   getOwnPropertyDescriptor(target,key){
    trace.push(label+':descriptor:'+String(key));
    if(kind==='reenter'&&label==='own'){guard({child:1},'child');trace.push('reentered');}
    return Reflect.getOwnPropertyDescriptor(target,key);
   },
   getPrototypeOf(){trace.push(label+':prototype');return parent;},
   get(target,key,receiver){trace.push(label+':GET:'+String(key));return Reflect.get(target,key,receiver);},
  });
  const trackedBase=tracked(base,'base',null),trackedMiddle=tracked(middle,'middle',trackedBase),trackedOwn=tracked(own,'own',trackedMiddle);
  const outcomes:string[]=[];
  const check=(key:string)=>{try{guard(trackedOwn,key);outcomes.push('ok');}catch(e){outcomes.push((e as Error).name+':'+(e as Error).message);}};
  check('value');check('missing');
  if(kind==='mutate'){
   own.value=()=>1;check('value');delete own.value;check('value');
   middle.value=2;check('value');Object.defineProperty(middle,'value',{get(){getterReads++;return 1;},configurable:true});check('value');
  }
  for(const key of ['__proto__','prototype','constructor'])check(key);
  return {trace,outcomes,getterReads};
 };
 for(const kind of ['own-data','own-function','own-getter','own-setter','inherited-getter','inherited-data','missing','mutate','reenter']){
  const old=exercise(controlDataField,kind),current=exercise(assertDataField,kind);
  assert.deepEqual(current,old,kind);assert.equal(current.getterReads,0);
  const denied='Error:Display data shadows a read capability: value';
  assert.equal(current.outcomes[0],['own-data','inherited-data','mutate','reenter'].includes(kind)?'ok':denied);
  assert.equal(current.outcomes[1],'ok');
  assert.deepEqual(current.outcomes.slice(-3),Array(3).fill('Error:Invalid display property'));
  if(kind==='mutate')assert.deepEqual(current.outcomes.slice(2,6),[denied,denied,'ok',denied]);
  assert.ok(!current.trace.some(s=>s.includes(':GET:')),'guard must never execute a normal property read');
 }
 // Preserve the previous guard's falsy-target behavior; the decoder itself
 // never uses these as an output record, but this is an exported helper.
 for(const target of [null,undefined,false,0,''])for(const key of ['x','constructor']){
  const check=(guard:typeof assertDataField)=>{try{guard(target as any,key);return 'ok';}catch(e){return (e as Error).name+':'+(e as Error).message;}};
  assert.equal(check(assertDataField),check(controlDataField));
 }
});
