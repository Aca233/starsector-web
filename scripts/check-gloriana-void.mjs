/** Focused authoritative void-screen damage/lifecycle regression; not a simulation checkpoint. */
import assert from 'node:assert/strict';
import { checkOwnedPhaseReads } from './lib/check-owned-phase-reads.mjs';
import {build} from 'esbuild';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const out=resolve('artifacts/gloriana');await mkdir(out,{recursive:true});const file=resolve(out,'void-check.mjs');
await build({stdin:{contents:`
export * from './src/engine/simulation/VoidShield';
export {Shield} from './src/engine/simulation/Shield';
export {Ship,enableWorkerOwnedPhaseReads} from './src/engine/simulation/Ship';
export {ShipSystem} from './src/engine/simulation/ShipSystem';
export {shipSystemDefinitions} from './src/engine/extensions/ship-systems/Registry';
export {contentRegistry} from './src/engine/content/ContentRegistry';
export {ShipCollisionSystem} from './src/engine/simulation/systems/ShipCollisionSystem';
export {shotObstruction} from './src/engine/ai/AutofireController';
export {CombatEngine} from './src/engine/simulation/CombatEngine';
export {Vector2} from './src/engine/math/Vector2';
export {ProjectileCollisionHandler} from './src/engine/simulation/systems/weapon/ProjectileCollisionHandler';
export {BeamSimulationHandler} from './src/engine/simulation/systems/weapon/BeamSimulationHandler';
export {ProjectileExplosionSystem} from './src/engine/simulation/systems/weapon/ProjectileExplosionSystem';
export {CombatHudProjector} from './src/engine/runtime/CombatHudView';
export {RenderShipProjection} from './src/engine/runtime/local/RenderShipProjection';
export {captureCombat,applyCombatSnapshot} from './src/network/AuthorityCombatSnapshot';
export {assetManager} from './src/engine/assets/AssetResolver';
export {modManager} from './src/engine/modding/ModManager';
export {createDesign,evaluate} from './src/studio/DesignModel';
`,resolveDir:process.cwd(),loader:'ts'},outfile:file,bundle:true,platform:'node',format:'esm',target:'node22',define:{'import.meta.env':'{"BASE_URL":"/","DEV":false}','__LAN_BUILD_ID__':'"gloriana-void-test"'},logLevel:'warning'});
const m=await import(pathToFileURL(file).href),v=(x=0,y=0)=>new m.Vector2(x,y);
await m.assetManager.loadManifest('data:application/json;base64,'+Buffer.from(await readFile('public/game-assets/asset-manifest.json')).toString('base64'));
const phaseReads = checkOwnedPhaseReads(m);
const results=[];function test(name,fn){fn();results.push(name);console.log('PASS '+name);}
function fixture(){const engine=new m.CombatEngine('paragon','web_gloriana',228);engine.asteroids.length=0;engine.nebulae.length=0;
 const root=engine.enemyShip,source=engine.playerShip;root.pos.set(0,0);root.facingRad=0;root.syncModuleTree(true);source.pos.set(0,-1800);
 for(const ship of engine.ships)for(const w of ship.weapons)w.isDisabled=true;
 return {engine,root,source,ctx:engine.getWeaponSimContext()};}
let next=400;
function shot(source,damage=1000){return {id:next++,sourceShipId:source.id,isPlayer:true,teamId:source.teamId,specId:'plasma',damage,baseDamage:damage,empDamage:0,damageType:'ENERGY',pos:v(0,0),prevPos:v(0,-1000),vel:v(0,1000),radius:5,rangeRemaining:2000,totalRange:2000,elapsedTime:0,color:[140,140,255],spawnType:'PLASMA'};}
const armor=s=>Array.from(s.armor.copyCells()).reduce((n,x)=>n+x,0);
const totals=root=>root.assemblyShips.map(s=>[s.id,armor(s),s.hullHp]);
const changed=(before,root)=>root.assemblyShips.filter((s,i)=>armor(s)<before[i][1]||s.hullHp<before[i][2]);
const near=(a,b)=>assert(Math.abs(a-b)<.00001,`${a} != ${b}`);
test('root-only 4x24000 screen; unchanged core weapon/wing fit and valid content',()=>{
 const {root}=fixture();assert.equal(root.shield.voidShield.integrity,96000);assert(root.shield.isActive);assert.equal(root.shield.currentArcDeg,360);
 assert(root.childModules.every(c=>!c.shield.voidShield));assert.equal(root.spec.weaponSlots.length,12);assert.equal(root.spec.fighterBays,6);
 assert.deepEqual(m.evaluate(m.createDesign('web_gloriana')).errors,[]);
 m.modManager.validateShipDefinition(root.spec,{allowExistingId:true,requireBundledAssets:false});
 const bad=structuredClone(root.spec);bad.voidShield.layers=Infinity;assert.throws(()=>m.modManager.validateShipDefinition(bad,{allowExistingId:true,requireBundledAssets:false}));
});
test('one hit crosses multiple layers; kinetic does not double screen damage; no flux',()=>{
 const {root}=fixture();const a=root.shield.absorbImpact(52000,'KINETIC',0);near(a.absorbed,52000);near(a.flux,0);near(a.remainingFraction,0);
 near(root.shield.voidShield.integrity,44000);assert.equal(root.shield.voidShield.breaks,2);near(root.flux.totalFlux,0);
});
test('screen protects the actual module ahead of the root hull',()=>{
 const {root,source,ctx}=fixture(),before=totals(root),handler=new m.ProjectileCollisionHandler();
 const p=shot(source);assert(handler.checkShipCollision(p,ctx.ships,ctx));near(root.shield.voidShield.integrity,95000);
 assert.deepEqual(totals(root),before);near(root.flux.totalFlux,0);
});
for(const batch of [false,true])test((batch?'batched':'scalar')+' projectile overflow reaches the nearest gun deck in the same sweep',()=>{
 const {root,source,ctx}=fixture(),before=totals(root),handler=new m.ProjectileCollisionHandler();root.shield.voidShield.integrity=100;
 let hitCount=0;ctx.statsTracker={recordShotHit:()=>hitCount++,recordDamageDealt:()=>{}};
 const p=shot(source);assert(batch?handler.checkShipCollisionsBatch([p],ctx.ships,ctx).has(p.id):handler.checkShipCollision(p,ctx.ships,ctx));
 assert.equal(hitCount,1);near(p.damage,900);near(root.shield.voidShield.integrity,0);assert(!root.shield.isActive);
 const hit=changed(before,root);assert.equal(hit.length,1);assert(hit[0].isAttachedModule,'spill incorrectly assigned to core');near(root.flux.totalFlux,0);
});
test('beam overflow re-sorts contacts after the root screen falls, then damages a module',()=>{
 const {root,source,ctx}=fixture(),before=totals(root);root.shield.voidShield.integrity=100;
 const beam={id:next++,sourceShipId:source.id,isPlayer:true,teamId:source.teamId,specId:'gravitonbeam',startPos:v(0,-1000),endPos:v(0,0),damagePerSec:10000,damageType:'ENERGY',color:[130,170,255],duration:1,maxDuration:1,width:8,elapsedTime:0,elapsedSinceDamage:0,brightness:1};
 new m.BeamSimulationHandler().update(.1,ctx,[beam]);
 near(root.shield.voidShield.integrity,0);const hit=changed(before,root);assert.equal(hit.length,1);assert(hit[0].isAttachedModule);
 assert(beam.endPos.y>-805);near(root.flux.totalFlux,0);
});
function explosion(source,damage=1000){return {...shot(source,damage),pos:v(0,-850),vel:v(),projectileExplosionSpec:{radius:1000,coreRadius:1000,duration:.2,collisionClass:'PROJECTILE_NO_FF',particleCount:0,particleSizeMin:1,particleSizeRange:0,particleDuration:0,particleColor:[0,0,0,0]}};}
test('exterior explosion charges the shared screen once, shields all modules throughout blast lifetime',()=>{
 const {root,source,ctx}=fixture(),before=totals(root),system=new m.ProjectileExplosionSystem();
 system.spawn(explosion(source),v(0,-850),ctx);near(root.shield.voidShield.integrity,95000);assert.deepEqual(totals(root),before);
 system.update(.1,ctx);near(root.shield.voidShield.integrity,95000);assert.deepEqual(totals(root),before);
});
test('blast overflow damages exposed hulls; a fully intercepted missile cannot splash through a just-fallen screen',()=>{
 const {root,source,ctx}=fixture(),before=totals(root),system=new m.ProjectileExplosionSystem();root.shield.voidShield.integrity=100;
 system.spawn(explosion(source),v(0,-850),ctx);assert(changed(before,root).length>0);near(root.shield.voidShield.integrity,0);
 const fresh=fixture(),safe=totals(fresh.root);fresh.root.shield.voidShield.integrity=0;fresh.root.shield.isActive=false;
 const p=explosion(fresh.source);p.voidShieldBlockedRoot=fresh.root.id;system.spawn(p,v(0,-805),fresh.ctx);assert.deepEqual(totals(fresh.root),safe);
});
test('restart preserves subframe timing, waits eight seconds and completes the first layer before protection',()=>{
 const {root}=fixture();root.shield.absorbImpact(96000,'ENERGY',0);const s=root.shield.voidShield;
 root.shield.update(8,0,0);near(s.integrity,0);near(s.rebuild,0);assert(!root.shield.isActive);
 root.shield.update(5.99,0,0);assert(!root.shield.isActive);near(s.rebuild,23960);
 root.shield.update(.01,0,0);assert(root.shield.isActive);near(s.integrity,24000);
 root.shield.update(18,0,0);near(s.integrity,96000);
 const other=fixture().root;other.shield.absorbImpact(96000,'ENERGY',0);other.shield.update(32,0,0);near(other.shield.voidShield.integrity,96000);
});
test('module armor/hull hits suppress recovery; right-click toggles never reset damage or cooldown',()=>{
 const {root}=fixture(),s=root.shield.voidShield,child=root.childModules[0];s.integrity=10000;
 child.armor.takeDamage(v(),1000,'ENERGY');near(s.quietRemaining,4);root.shield.update(4,0,0);near(s.integrity,10000);
 child.applyHullDamage(1);near(s.quietRemaining,4);
 root.shield.toggle();assert(!s.armed);root.shield.toggle();assert(s.armed);near(s.integrity,10000);near(s.quietRemaining,4);
});
test('venting/overload suspend screens and recovery without discarding the armed state',()=>{
 const {engine,root}=fixture(),s=root.shield.voidShield;s.integrity=10000;
 root.flux.increaseFlux(1000,true);assert(root.startVenting());assert(s.armed);assert(!root.shield.isActive);
 const hp=s.integrity;engine.fixedUpdate(1/60);near(s.integrity,hp);assert(s.suppressed);
 root.flux.cancelVenting();engine.fixedUpdate(1/60);assert(root.shield.isActive);
 root.flux.increaseFlux(root.flux.maxFlux*2,true);assert(root.flux.isOverloaded);assert(s.armed);assert(!root.shield.isActive);
 engine.fixedUpdate(1/60);assert(s.suppressed);
 root.hullHp=0;engine.fixedUpdate(1/60);assert(root.isDead);assert(!s.armed);assert(!root.shield.isActive);
});
test('presentation snapshot carries shield layers/countdowns without rebuilding simulation; HUD reads them',()=>{
 const {engine,root}=fixture();root.shield.absorbImpact(9000,'ENERGY',0);
 const frame=m.captureCombat(engine,1,{0:0},0),viewer=fixture().engine;m.applyCombatSnapshot(viewer,JSON.parse(JSON.stringify(frame)),true);
 assert.deepEqual(viewer.enemyShip.shield.voidShield,root.shield.voidShield);
 viewer.playerShip.playerTargetId=viewer.enemyShip.id;
 const hud=new m.CombatHudProjector().capture(viewer);assert.equal(hud.targetShip.shield.voidShield.integrity,87000);
});
test('visual envelopes follow authoritative hits, break/restart, pause and snapshot',()=>{
 const {root,engine}=fixture(),s=root.shield.voidShield;
 root.shield.absorbImpact(25000,'ENERGY',1.25);
 assert.deepEqual(new m.RenderShipProjection().project(root).shield.voidShield,s);
 near(s.visualHitAngle,1.25);near(s.visualHitRemaining,.65);near(s.visualBreakRemaining,1.2);assert(!s.visualCollapse);
 const before=structuredClone(s);m.advanceVoidShield(s,0);assert.deepEqual(s,before);
 const frame=m.captureCombat(engine,2,{0:0},0),viewer=fixture().engine;m.applyCombatSnapshot(viewer,JSON.parse(JSON.stringify(frame)),true);
 assert.deepEqual(viewer.enemyShip.shield.voidShield,s);
 root.shield.absorbImpact(100000,'ENERGY',-1);assert(s.visualCollapse);
 root.shield.update(.3,0,0);near(s.visualBreakRemaining,.9);near(s.visualHitRemaining,.35);
 root.shield.update(7.7,0,0);near(s.rebuild,0);root.shield.update(3,0,0);near(s.rebuild,12000);
 root.shield.update(3,0,0);assert(root.shield.isActive);near(s.visualRestartRemaining,1.4);
 root.shield.setActive(false);assert(!root.shield.isActive);near(s.visualShutdownRemaining,.9);near(s.visualRestartRemaining,0);
 root.shield.update(.25,0,0);near(s.visualShutdownRemaining,.65);assert(!root.shield.isActive);
 const recharged=s.integrity;root.shield.setActive(true);near(s.integrity,recharged);near(s.visualShutdownRemaining,0);near(s.visualRestartRemaining,1.4);
 s.suppressed=true;root.shield.update(2,0,0);near(s.visualRestartRemaining,0);near(s.integrity,recharged);
});
test('giant nozzles stay mirrored and retain native engine styles',()=>{
 const {root}=fixture(),parts=root.childModules.filter(c=>c.spec.inheritParentEngineCommands);
 assert.equal(parts.length,2);assert(parts.every(p=>p.spec.engineSlots.length===3));
 assert.deepEqual(parts[0].spec.engineSlots.map(s=>[s.width,s.length]),parts[1].spec.engineSlots.map(s=>[s.width,s.length]));
 assert(parts.every(p=>p.spec.engineSlots.every(s=>s.length>=400&&s.width>=40&&s.style==='LOW_TECH')));
});
function escort(f, x=0, y=-580, hull='lasher', team=f.root.teamId){
 const spec=m.contentRegistry.getShip(hull);assert(spec,'fixture hull '+hull);
 const ally=f.engine.addShip(spec,false,v(x,y),0,team);ally.shield.setActive(false);ally.shield.update(1,0,0);
 f.ctx=f.engine.getWeaponSimContext();return ally;
}
const condition=ship=>[armor(ship),ship.hullHp,ship.flux.totalFlux];
const ramFx={addFloatingDamage(){},spawnArmorDamageSparks(){},spawnDebris(){},addCameraShake(){},getPlayerPos:()=>v()};
test('independent allied ships and fighters cross the void boundary but hulls remain solid',()=>{
 const f=fixture(),ally=escort(f,0,-790),fighter=escort(f,120,-780,'broadsword'),ram=new m.ShipCollisionSystem();
 ally.shield.setActive(true);ally.shield.update(1,0,0);
 for(const craft of [ally,fighter]){
  const pos=craft.pos.clone(),integrity=f.root.shield.voidShield.integrity;
  ram.resolveShipToShipCollision(f.root,craft,ramFx,1/60);assert.deepEqual(craft.pos,pos);near(f.root.shield.voidShield.integrity,integrity);
 }
 ally.shield.setActive(false);ally.shield.update(1,0,0);ally.pos.set(0,0);const before=ally.pos.clone();
 ram.resolveShipToShipCollision(f.root,ally,ramFx,1/60);assert(ally.pos.distanceTo(before)>0,'solid hull became intangible');
});
for(const batch of [false,true])test((batch?'batched':'scalar')+' external enemy fire is intercepted ahead of an independent ally; allied fire exits',()=>{
 const f=fixture(),ally=escort(f),before=condition(ally),handler=new m.ProjectileCollisionHandler();
 const p=shot(f.source);p.pos=ally.pos.clone();assert(batch?handler.checkShipCollisionsBatch([p],f.ctx.ships,f.ctx).has(p.id):handler.checkShipCollision(p,f.ctx.ships,f.ctx));
 assert.deepEqual(condition(ally),before);near(f.root.shield.voidShield.integrity,95000);
 const outbound=shot(ally);outbound.prevPos=ally.pos.clone();outbound.pos=v(0,-1000);outbound.vel=v(0,-1000);
 assert(!(batch?handler.checkShipCollisionsBatch([outbound],f.ctx.ships,f.ctx).has(outbound.id):handler.checkShipCollision(outbound,f.ctx.ships,f.ctx)));
 near(f.root.shield.voidShield.integrity,95000);
 f.root.shield.setActive(false);const exposed=shot(f.source);exposed.pos=ally.pos.clone();assert(handler.checkShipCollision(exposed,f.ctx.ships,f.ctx));assert.notDeepEqual(condition(ally),before);
});
test('external beam protects ally; allied outgoing beam and automatic fire ignore friendly void surface',()=>{
 const f=fixture(),ally=escort(f),before=condition(ally);
 const make=(source,start,end)=>({id:next++,sourceShipId:source.id,isPlayer:source.isPlayer,teamId:source.teamId,specId:'gravitonbeam',startPos:start,endPos:end,damagePerSec:10000,damageType:'ENERGY',color:[130,170,255],duration:1,maxDuration:1,width:8,elapsedTime:0,elapsedSinceDamage:0,brightness:1});
 const incoming=make(f.source,v(0,-1000),ally.pos.clone());new m.BeamSimulationHandler().update(.1,f.ctx,[incoming]);
 assert.deepEqual(condition(ally),before);near(f.root.shield.voidShield.integrity,95000);near(incoming.endPos.y,-805);
 const outgoing=make(ally,ally.pos.clone(),v(0,-1000));new m.BeamSimulationHandler().update(.1,f.ctx,[outgoing]);near(outgoing.endPos.y,-1000);near(f.root.shield.voidShield.integrity,95000);
 assert.equal(m.shotObstruction(ally,ally.weapons[0],{delay:0},{ships:f.ctx.ships,asteroids:[]},ally.pos,-Math.PI/2,{distance:1200,time:1}),null);
});
test('one exterior explosion protects independent allied ships/fighters, not outsiders or hostile intruders',()=>{
 const f=fixture(),ally=escort(f),fighter=escort(f,100,-560,'broadsword'),outside=escort(f,400,-900),intruder=escort(f,-100,-600,'lasher',7);
 const a=condition(ally),b=condition(fighter),out=condition(outside),hostile=condition(intruder),system=new m.ProjectileExplosionSystem();
 system.spawn(explosion(f.source),v(0,-850),f.ctx);near(f.root.shield.voidShield.integrity,95000);
 assert.deepEqual(condition(ally),a);assert.deepEqual(condition(fighter),b);assert.notDeepEqual(condition(outside),out);assert.notDeepEqual(condition(intruder),hostile);
 f.root.shield.voidShield.integrity=0;f.root.shield.setActive(false);system.update(.1,f.ctx);
 assert.deepEqual(condition(ally),a);assert.deepEqual(condition(fighter),b);
});
test('outside blast spill damages protected allies; internal blasts and friendly fire do not charge the field',()=>{
 const f=fixture(),ally=escort(f),before=condition(ally);f.root.shield.voidShield.integrity=100;
 new m.ProjectileExplosionSystem().spawn(explosion(f.source),v(0,-850),f.ctx);near(f.root.shield.voidShield.integrity,0);assert.notDeepEqual(condition(ally),before);
 const g=fixture(),inside=escort(g),original=condition(inside);new m.ProjectileExplosionSystem().spawn(explosion(g.source),v(0,-550),g.ctx);
 near(g.root.shield.voidShield.integrity,96000);assert.notDeepEqual(condition(inside),original);
 const h=fixture(),friend=escort(h);const friendly=explosion(friend);friendly.projectileExplosionSpec.collisionClass='PROJECTILE_FF';
 new m.ProjectileExplosionSystem().spawn(friendly,v(0,-850),h.ctx);near(h.root.shield.voidShield.integrity,96000);
});
test('hostile flak outside the field also protects independent allied fighters',()=>{
 const f=fixture(),fighter=escort(f,0,-580,'broadsword'),before=condition(fighter),p=shot(f.source);
 p.pos=v(0,-820);p.proximityFuse={range:100,explosionRadius:500,coreRadius:500};
 assert(new m.ProjectileCollisionHandler().checkProximityFuse(p,f.ctx,[]));assert.deepEqual(condition(fighter),before);near(f.root.shield.voidShield.integrity,95000);
});
test('ordinary shields retain native damage-type/flux conversion',()=>{
 const s=new m.Shield('OMNI',360,200,.6,0);s.setActive(true);s.update(1,0,0);
 near(s.absorbImpact(100,'KINETIC',0).flux,120);near(s.absorbImpact(100,'HIGH_EXPLOSIVE',0).flux,30);
 near(s.absorbImpact(100,'FRAGMENTATION',0).flux,15);assert.equal(s.voidShield,undefined);
});
await writeFile(resolve(out,'void-verification.json'),JSON.stringify({passed:true,tests:results,phaseReads,dualDeviceTest:false},null,2)+'\n');
