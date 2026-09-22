import {combatRenderView} from '../src/engine/render/CombatRenderView';
import {DynamicParticleDecoder,particleRecipeBudget,enableDynamicParticleRecipes,particleRecipeRow} from "../src/engine/visual/DynamicParticleRecipe";
import {SimulationRandom} from "../src/engine/simulation/SimulationRandom";
import {CombatFXSystem} from "../src/engine/simulation/systems/CombatFXSystem";
import {deflateRawSync} from "node:zlib";
import {captureCriticalCombat,CriticalCombatReplica} from "../src/network/CriticalCombatReplica";
import {decodeCombatState} from "../src/network/CriticalCombatState.mjs";
import {withoutBulkProjectiles} from '../src/network/ProjectileBulkVariant.mjs';
import {projectileSnapshotTick} from '../src/network/CombatSnapshot';
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
    const t=plan.templates[row[0]],values=t.fixed.slice();t.dynamic.forEach((offset,col)=>{if(offset)values[col]=row[offset];});
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
import {applyCombatSnapshots as applyNumericBench} from '../src/network/CombatSnapshot';
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
import {componentCaptureDiagnostics,combatComponentNotices} from '../src/network/CombatSnapshot';
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
 const take=(e:any,tick:number,on:boolean)=>captureAuthorityCombat(e,tick,{0:tick},0,null,false,true,on);
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
   t=performance.now();const frame=captureAuthorityCombat(e,tick,{0:tick},0,null,true,true,components);times.capture=performance.now()-t;
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
