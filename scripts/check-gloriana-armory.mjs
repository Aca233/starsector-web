import { checkGlorianaFeedback } from './lib/gloriana-feedback-check.mjs';
import { createSiegeScene } from './lib/gloriana-siege-fixture.mjs';
/** Approved six-weapon fit: registry, real firing, refit transaction and Worker rendering. */
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'vite';
const out=resolve('artifacts/gloriana/armory');await mkdir(out,{recursive:true});
const bundle=resolve(out,'fixture.mjs');
await build({stdin:{contents:`
export {qualifiedFireTargets} from './src/engine/ai/QualifiedFireTargets';
export {CombatEngine} from './src/engine/simulation/CombatEngine';
export {captureCombat,applyCombatSnapshot} from './src/network/AuthorityCombatSnapshot';
export {glorianaSiegeHit} from './src/engine/extensions/weapon-effects/GlorianaSiegeHit';
export {CapitalShipAI} from './src/engine/ai/CapitalShipAI';
export * from './src/engine/content/GlorianaArmory';
export * from './src/engine/content/GlorianaAviation';
export * from './src/engine/content/GlorianaHullMods';
export * from './src/engine/content/GlorianaBuiltins';
export * from './src/engine/simulation/VoidShield';
export {FighterSystem} from './src/engine/simulation/systems/FighterSystem';
export {glorianaEdict} from './src/engine/extensions/ship-systems/GlorianaEdict';
export {hullModInstallReason,hullModOPCost,hullModDefinitions,effectiveHullStats,sModInstallReason,hullModLoadoutErrors} from './src/engine/extensions/HullMods';
export * from './src/studio/GlorianaLoadouts';
export * from './src/studio/GlorianaTierMigration';
export {createRocinanteSkirmish,createRocinanteHunter} from './src/studio/RocinanteLoadouts';
export {GLORIANA_HULL_ID,glorianaShips} from './src/engine/content/GlorianaPack';
export {contentRegistry} from './src/engine/content/ContentRegistry';
export {extensionVariantsForHull} from './src/studio/ExtensionVariantCatalog';
export {modulePropulsionState} from './src/engine/simulation/systems/ModulePropulsion';
export {assemblyParts} from './src/engine/content/ModuleGeometry';
export {modManager} from './src/engine/modding/ModManager';
export {assetManager} from './src/engine/assets/AssetResolver';
export {validateWeaponSpec,validateShipSpec} from './src/engine/modding/ContentValidation';
export {createDesign,evaluate,decodeDesign,budget,editableMods,withWing,designWingSlots,nativeRefit,baseHull,compatibility,readLibrary,writeLibrary,storageKey} from './src/studio/DesignModel';
export {Ship} from './src/engine/simulation/Ship';
export * from './src/engine/visual/GlorianaWeaponVisuals';
export * from './src/engine/visual/GlorianaTorpedoVisuals';
export {RenderShipProjection} from './src/engine/runtime/local/RenderShipProjection';
export {ShipDisplayEncoder,ShipDisplayDecoder} from './src/network/display/ShipDisplayLane';
export {LanShipProjection} from './src/network/display/LanShipProjection';
export {collectCombatTextureUrls} from './src/engine/assets/CombatAssetClosure';
export {validSurfaceFeedback} from './src/engine/visual/ShipSurfaceFeedback';
export {renderGlorianaOrderReceiver,renderGlorianaCharge,renderGlorianaRecoil,renderGlorianaTorpedo} from './src/engine/render/webgl/GlorianaWeaponRenderer';
export {AutofireController} from './src/engine/ai/AutofireController';
export {Vector2} from './src/engine/math/Vector2';
`,loader:'ts',resolveDir:process.cwd()},outfile:bundle,bundle:true,platform:'node',format:'esm',target:'node22',define:{'import.meta.env':'{"BASE_URL":"/","DEV":false}'},logLevel:'warning'});
const m=await import(pathToFileURL(bundle).href);
const manifest=JSON.parse(await readFile('public/game-assets/asset-manifest.json'));
await m.assetManager.loadManifest('data:application/json;base64,'+Buffer.from(JSON.stringify(manifest)).toString('base64'));
if(process.argv.includes('--battle-only')) {
 await (await import('./lib/gloriana-battle-acceptance.mjs')).runGlorianaBattleAcceptance(m,out);
 process.exit(0);
}
const requireBytes=new Map(await Promise.all(manifest.filter(a=>a.path.startsWith('graphics/weapons/web_gloriana/')).map(async a=>[a.path,await readFile(resolve('public/game-assets',a.path))])));
const tiersOnly=process.argv.includes('--tiers-only');
const feedbackOnly=process.argv.includes('--feedback-only');
const aviationOnly=process.argv.includes('--aviation-only'),repairOnly=process.argv.includes('--repair-only'),loadoutsOnly=process.argv.includes('--loadouts-only');
const results=[];let visited=0;function test(name,fn){if(tiersOnly&&!name.startsWith('tiers:'))return;if(feedbackOnly&&!name.startsWith('feedback:'))return;if(loadoutsOnly&&!name.startsWith('loadouts:')&&!name.startsWith('aviation:'))return;if(repairOnly&&!name.startsWith('repair:')&&!name.startsWith('aviation:'))return;if(aviationOnly&&!name.startsWith('aviation:'))return;if(++visited<Number(process.env.GLORIANA_TEST_FROM??1))return;if(process.env.GLORIANA_TEST_FILTER&&!name.includes(process.env.GLORIANA_TEST_FILTER))return;fn();results.push(name);console.log('PASS '+name);}
const original=m.createDesign(m.GLORIANA_HULL_ID),before=JSON.stringify(original),d=m.createGlorianaArsenalDesign(original),fit=m.evaluate(d);
const counts={};
if(tiersOnly)(await import('./lib/gloriana-tier-check.mjs')).checkGlorianaTiers(m,test);
test('legal whole-assembly budget and 48 populated size-compatible mounts',()=>{
 assert.deepEqual(fit.errors,[]);assert.equal(JSON.stringify(original),before);assert.deepEqual(d.wings,original.wings);
 const parts=m.assemblyParts(fit.spec);assert.equal(parts.length,9);
 for(const part of parts)for(const slot of part.spec.weaponSlots){assert(Object.values(m.GLORIANA_WEAPONS).includes(slot.defaultWeaponId));counts[slot.defaultWeaponId]=(counts[slot.defaultWeaponId]??0)+1;}
 assert.deepEqual(Object.fromEntries(Object.entries(m.GLORIANA_WEAPONS).map(([k,id])=>[k,counts[id]])),{macro:12,lance:2,siege:12,torpedo:2,bolter:14,interceptor:6});
 assert.deepEqual(m.evaluate(m.decodeDesign(JSON.parse(JSON.stringify(d)))) .errors,[]);
 const changed={...original,wings:[null,...original.wings.slice(1)]};assert.deepEqual(m.createGlorianaArsenalDesign(changed).wings,changed.wings);
 assert(Object.values(original.weapons).every(id=>!Object.values(m.GLORIANA_WEAPONS).includes(id)));
});
test('three real core builtins: scopes, immutable installation and legacy design inheritance',()=>{
 const ids=m.GLORIANA_BUILTINS,parts=m.assemblyParts(fit.spec),legacy=JSON.parse(before);
 assert.deepEqual(m.GLORIANA_CORE_BUILTINS,[ids.voidShield,ids.ordnance,ids.bulkheads]);
 assert.equal(m.glorianaBuiltins.length,3);
 for(const retired of ['giant_frame','battle_command','six_decks','battery_control','drive_link'])assert.equal(m.hullModDefinitions.get('web_gloriana_'+retired),undefined);
 assert.deepEqual(fit.spec.builtInHullMods,m.GLORIANA_CORE_BUILTINS);
 assert.equal(fit.op.used,256);assert.equal(fit.op.modOP,0);
 assert(!('builtInHullMods' in legacy));assert.deepEqual(legacy.hullMods,[]);
 const restored=m.evaluate(m.decodeDesign(legacy));assert.deepEqual(restored.errors,[]);
 assert.deepEqual(restored.spec.builtInHullMods,m.GLORIANA_CORE_BUILTINS);
 for(const def of m.glorianaBuiltins){
  assert.equal(m.hullModDefinitions.get(def.id).refit.builtInOnly,true);
  assert(m.assetManager.hasPath('/game-assets/'+def.refit.icon));assert(!m.editableMods.includes(def.id));
  assert(m.hullModInstallReason(m.modManager.requireShip('hammerhead'),def.id,true));
 }
 for(const {spec} of parts){
  const expected=spec.id===m.GLORIANA_HULL_ID?m.GLORIANA_CORE_BUILTINS:/_[ps][123]$/.test(spec.id)?m.GLORIANA_BATTERY_BUILTINS:m.GLORIANA_ENGINE_BUILTINS;
  assert.deepEqual(spec.builtInHullMods,expected);assert.deepEqual(m.hullModLoadoutErrors(spec),[]);
  assert.deepEqual(m.evaluate(m.createDesign(spec.sourceHullId??spec.id)).spec.builtInHullMods,expected);
  for(const id of expected){
   assert.equal(m.hullModOPCost(spec,id),0);assert(m.hullModInstallReason(spec,id));
   assert.equal(m.hullModInstallReason(spec,id,true),null);
   if(id!=='reduced_explosion')assert(m.sModInstallReason(spec,id));
  }
 }
 const illegal=JSON.parse(before);illegal.hullMods=[ids.voidShield];assert.throws(()=>m.decodeDesign(illegal));
 illegal.hullMods=[];illegal.sMods=[ids.voidShield];assert.throws(()=>m.decodeDesign(illegal));
 for(const id of Object.values(m.GLORIANA_HULLMODS))assert(!fit.spec.builtInHullMods.includes(id));
 const removable=JSON.parse(before);removable.hullMods=['hardenedshieldemitter','stabilizedshieldemitter'];removable.sMods=[...removable.hullMods];
 const solid=m.evaluate(removable);assert.deepEqual(solid.errors,[]);assert.equal(solid.op.modOP,0);
 removable.hullMods=[];removable.sMods=[];assert.deepEqual(m.evaluate(removable).spec.builtInHullMods,m.GLORIANA_CORE_BUILTINS);
});
test('new mechanics preserve baseline shields, bays, armor, explosions and Worker support',()=>{
 const ids=new Set(Object.values(m.GLORIANA_BUILTINS));
 for(const {spec} of m.assemblyParts(fit.spec)){
  const stripped={...spec,builtInHullMods:spec.builtInHullMods.filter(id=>!ids.has(id))};
  assert.deepEqual(m.effectiveHullStats(spec),m.effectiveHullStats(stripped));
  if(spec.isModuleHull){assert.equal(m.effectiveHullStats(spec).explosionDamageMultiplier,.1);assert.equal(m.effectiveHullStats(spec).explosionRadiusMultiplier,.25);}
 }
 const ship=new m.Ship('builtin-check',fit.spec,true,new m.Vector2(),0);
 assert.equal(ship.assemblyShips.length,9);assert.equal(ship.shield.voidShield.integrity,96000);assert.equal(ship.shield.voidShield.layers,4);
 assert.equal(ship.hullStats.fighterBays,6);const decks=new m.FighterSystem();decks.init(ship);
 assert.equal(decks.playerWings.length,6);assert.equal(decks.fighters.length+decks.bombers.length,16);
 assert.equal(ship.childModules.filter(c=>c.spec.inheritParentEngineCommands).length,2);
 const projection=new m.RenderShipProjection();projection.begin();assert(projection.supports(ship.assemblyShips));
 for(const part of ship.assemblyShips)assert.deepEqual(projection.project(part).spec.builtInHullMods,part.spec.builtInHullMods);projection.finish();
});
test('six valid weapon definitions, exact image hashes, no inherited native overlay layers',()=>{
 for(const w of m.glorianaWeapons){m.validateWeaponSpec(w,true);assert(!w.turretGunSpriteUrl&&!w.glowSpriteUrl);}
 for(const a of manifest.filter(a=>a.path.startsWith('graphics/weapons/web_gloriana/'))){const b=requireBytes.get(a.path);assert.equal(b.length,a.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),a.hash);}
});
test('recoil windows exactly partition original pixels and remain within approved atlas',()=>{
 for(const p of Object.values(m.glorianaRecoilProfiles)){
  const rects=[...p.fixed,...p.barrels];
  assert.equal(rects.reduce((area,r)=>area+r.width*r.height,0),p.width*p.height);
  for(const r of rects){assert(r.x>=0&&r.y>=0&&r.x+r.width<=p.width&&r.y+r.height<=p.height);}
  for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){
   const a=rects[i],b=rects[j];assert(Math.min(a.x+a.width,b.x+b.width)<=Math.max(a.x,b.x)||Math.min(a.y+a.height,b.y+b.height)<=Math.max(a.y,b.y));
  }
  for(const r of p.barrels){assert.deepEqual(m.recoilSlice(r,0,p.travel).destination,r);const moved=m.recoilSlice(r,1,p.travel);assert.equal(moved.source.y,r.y);assert.equal(moved.destination.y+moved.destination.height,r.y+r.height);}
 }
 const calls=[],ctx={batcher:{drawSprite:(...a)=>calls.push(a),setBlendMode:()=>{}},hitGlowTex:{},whiteTex:{}};
 const mount={spec:{id:'web_gloriana_lance'},glowAlpha:0,isDisabled:false};
 m.renderGlorianaCharge(ctx,mount,0,0,0,1);assert.equal(calls.length,0);
 mount.glowAlpha=.2;m.renderGlorianaCharge(ctx,mount,0,0,0,1);const early=calls.length;assert(early>0&&early<12);
 calls.length=0;mount.glowAlpha=1;m.renderGlorianaCharge(ctx,mount,0,0,0,1);assert.equal(calls.length,12);
 calls.length=0;mount.isDisabled=true;m.renderGlorianaCharge(ctx,mount,0,0,0,1);assert.equal(calls.length,0);
});
test('registered loaded-missile layers, clipped breech feed, finite inventory and stopped clocks',()=>{
 for(const url of m.glorianaTorpedoTextures){const bytes=requireBytes.get(url.replace('/game-assets/',''));assert(bytes);assert.equal(bytes.readUInt32BE(16),50);assert.equal(bytes.readUInt32BE(20),92);}
 const rack={spec:{id:m.GLORIANA_WEAPONS.torpedo},ammo:8,barrelIndex:0,burstRemaining:0,cooldownTimer:0,isDisabled:false};
 m.advanceGlorianaTorpedoLoad(rack);assert.deepEqual(rack.loadedMissileLevels,[1,1]);
 rack.ammo--;m.clearGlorianaTorpedoRail(rack,0);rack.barrelIndex=1;rack.burstRemaining=1;
 m.advanceGlorianaTorpedoLoad(rack);assert.deepEqual(rack.loadedMissileLevels,[0,1]);
 // A malfunction cancels burstRemaining; it must not recreate the already fired round.
 rack.burstRemaining=0;rack.isDisabled=true;for(let i=0;i<300;i++)m.advanceGlorianaTorpedoLoad(rack);
 assert.deepEqual(rack.loadedMissileLevels,[0,1]);
 rack.isDisabled=false;rack.ammo--;m.clearGlorianaTorpedoRail(rack,1);rack.barrelIndex=0;rack.cooldownTimer=8.5;
 m.advanceGlorianaTorpedoLoad(rack);assert.deepEqual(rack.loadedMissileLevels,[0,0]);
 rack.cooldownTimer=.6;m.advanceGlorianaTorpedoLoad(rack);assert.deepEqual(rack.loadedMissileLevels,[.5,.5]);
 const frozen=rack.loadedMissileLevels;for(let i=0;i<100;i++)m.advanceGlorianaTorpedoLoad(rack);assert.equal(rack.loadedMissileLevels,frozen);
 rack.cooldownTimer=0;m.advanceGlorianaTorpedoLoad(rack,false);assert.deepEqual(rack.loadedMissileLevels,[.5,.5],'wreck reloaded');
 rack.ammo=1;rack.barrelIndex=1;m.advanceGlorianaTorpedoLoad(rack);assert.deepEqual(rack.loadedMissileLevels,[0,1]);
 rack.ammo=0;m.advanceGlorianaTorpedoLoad(rack);assert.deepEqual(rack.loadedMissileLevels,[0,0]);
 rack.ammo=12;m.advanceGlorianaTorpedoLoad(rack);assert.deepEqual(rack.loadedMissileLevels,[1,1],'modified ammo capacity');
 assert(!m.validLoadedMissileLevels([NaN,1]));assert(!m.validLoadedMissileLevels([0,2]));
 const calls=[],ctx={textures:{getTextureInfo:url=>({texture:url,width:50,height:92})},batcher:{drawSprite:(...a)=>calls.push(a)}};
 for(const [levels,count] of [[[1,1],3],[[0,1],2],[[0,0],1],[[.5,.5],3]]){
  calls.length=0;rack.loadedMissileLevels=levels;assert(m.renderGlorianaTorpedo(ctx,rack,10,20,Math.PI/2,1,1));assert.equal(calls.length,count);
  assert.equal(calls[0][0],m.glorianaTorpedoTextures[0]);
  for(const draw of calls.slice(1)){assert(draw[4]>0&&draw[4]<=52);assert.equal(draw[15],draw[4]/92);assert.equal(draw[11],1);}
 }
 assert.deepEqual(m.torpedoLoadSlice(0),{shift:52,height:0});assert.deepEqual(m.torpedoLoadSlice(1),{shift:0,height:52});
});

const mods=m.GLORIANA_HULLMODS;
function moddedDesign(id){const draft=structuredClone(d);draft.capacitors=0;draft.vents=16;draft.hullMods=id?[id]:[];draft.modules.P1.hullMods=[mods.loader];return draft;}
function moddedShip(id){const evaluated=m.evaluate(moddedDesign(id));assert.deepEqual(evaluated.errors,[]);return new m.Ship('mod-'+(id??'base'),evaluated.spec,true,new m.Vector2(),0);}
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,a+' != '+b);
const newFlagship=(enemy=false)=>new m.Ship('builtin-live',fit.spec,!enemy,new m.Vector2(),0);
const tick=(ship,dt=1/60,shots=[],beams=[])=>ship.update(dt,null,p=>shots.push(p),b=>beams.push(b));
const seal=m.hullModDefinitions.get(m.GLORIANA_BUILTINS.bulkheads);
function spySealCosts(ship){const charges=[],spend=ship.flux.increaseFluxClamped.bind(ship.flux);ship.flux.increaseFluxClamped=(amount,hard)=>{charges.push({amount,hard});spend(amount,hard);};return charges;}
test('ordnance modifies actual heavy mounts: +20% range, +15% flux, -25% traversal, no ammo or damage gain',()=>{
 const ship=newFlagship();
 for(const part of ship.assemblyShips)for(const mount of part.weapons){
  const base=m.glorianaWeapons.find(w=>w.id===mount.spec.id),heavy=base.mountSize==='EXTRA_LARGE'&&['BALLISTIC','ENERGY'].includes(base.weaponType);
  near(part.getWeaponDisplayRange(mount.spec),base.range*(heavy?1.2:1));
  near(mount.spec.fluxPerShot,base.fluxPerShot*(heavy?1.15:1));
  if(base.fluxPerSecond!==undefined)near(mount.spec.fluxPerSecond,base.fluxPerSecond*(heavy?1.15:1));
  if(base.turnRateDegPerSec!==undefined)near(mount.spec.turnRateDegPerSec,base.turnRateDegPerSec*(heavy?.75:1));
  assert.equal(mount.spec.damage,base.damage);assert.equal(mount.spec.maxAmmo,base.maxAmmo);
 }
 const def=m.hullModDefinitions.get(m.GLORIANA_BUILTINS.ordnance),missile={...m.glorianaWeapons.find(w=>w.id===m.GLORIANA_WEAPONS.torpedo),mountSize:'EXTRA_LARGE'};
 assert.equal(def.rangePercent(ship.spec,missile),0);assert.deepEqual(def.weaponStats(ship.spec,missile),{});
 ship.aimTargetWorld.set(0,-3000);assert(ship.system.activate());ship.system.update(.8);
 const battery=ship.childModules.find(c=>c.moduleMount.slotId==='P1'),gun=battery.weapons.find(w=>w.spec.id===m.GLORIANA_WEAPONS.macro);
 const base=m.glorianaWeapons.find(w=>w.id===gun.spec.id);
 near(battery.getWeaponDisplayRange(gun.spec),base.range*1.35);near(gun.spec.fluxPerShot*battery.system.getWeaponFluxCostMultiplier('BALLISTIC'),base.fluxPerShot*1.15*1.25);
});
test('bulkheads: real update trigger, cost, damage resolution, cease-fire, vent lock, expiry and single use',()=>{
 const ship=newFlagship(),plain=newFlagship(),charges=spySealCosts(ship),shots=[],beams=[];
 ship.hullHp=ship.maxHullHp*.401;tick(ship);assert(!ship.system.blocksWeapons);
 ship.hullHp=ship.maxHullHp*.4;tick(ship,0);assert(!ship.system.blocksWeapons);
 const hp=ship.hullHp;tick(ship);assert.equal(ship.hullHp,hp);assert(ship.system.blocksWeapons);assert(ship.system.blocksVenting);assert(!ship.startVenting());
 assert.deepEqual(charges,[{amount:ship.flux.maxFlux*.25,hard:true}]);near(ship.system.getArmorDamageMultiplier(),.4);near(ship.system.getHullDamageMultiplier(),.4);
 assert.match(ship.system.passiveStatusText,/封舱 核心 6.0s.*储备8\/9/);
 const armored=ship.armor.takeDamage(new m.Vector2(),1000,'ENERGY'),normal=plain.armor.takeDamage(new m.Vector2(),1000,'ENERGY');assert(armored.armorDamage<normal.armorDamage);
 for(const target of [ship,plain])for(let r=0;r<target.armor.rows;r++)for(let c=0;c<target.armor.cols;c++)target.armor.setCell(c,r,0);
 const reduced=ship.armor.takeDamage(new m.Vector2(),1000,'ENERGY'),full=plain.armor.takeDamage(new m.Vector2(),1000,'ENERGY');// Native residual armor still exists at zero grid HP; lower hit strength can reduce damage further.
 assert(reduced.hullDamage>0&&reduced.hullDamage<=full.hullDamage*.4);
 const beforeHp=ship.hullHp;ship.applyHullDamage(reduced.hullDamage);near(beforeHp-ship.hullHp,reduced.hullDamage);
 ship.isFiringMain=true;ship.fireControlMode='MANUAL';ship.aimTargetWorld.set(2000,0);
 for(let i=0;i<30;i++)tick(ship,1/60,shots,beams);assert.equal(shots.length+beams.length,0);
 const proj=new m.RenderShipProjection();proj.begin();assert(proj.supports(ship.assemblyShips));proj.project(ship);proj.finish();
 const lan=new m.LanShipProjection();lan.begin();assert.equal(lan.project(ship).system.passiveStatusText,ship.system.passiveStatusText);lan.finish();
 ship.runtimeModifiers.set('unrelated-test',{speedFlat:3});ship.system.reset();assert(ship.system.blocksWeapons);
 const noHeal=ship.hullHp;tick(ship,6.1);assert.equal(ship.hullHp,noHeal);assert(!ship.system.blocksWeapons);assert(!ship.system.blocksVenting);near(ship.system.getHullDamageMultiplier(),1);near(ship.system.getSpeedFlatBonus(),3);
 assert.match(ship.system.passiveStatusText,/封舱储备 8\/9/);ship.hullHp=ship.maxHullHp*.1;ship.flux.hardFlux=0;ship.flux.softFlux=0;ship.isFiringMain=false;tick(ship,1);assert.equal(charges.length,1);assert(!ship.system.blocksWeapons);
});
test('bulkheads: headroom, overload/vent/reservation gates, independent modules, enemies and death cleanup',()=>{
 const ship=newFlagship(),p=ship.childModules.find(c=>c.moduleMount.slotId==='P1'),other=ship.childModules.find(c=>c.moduleMount.slotId==='P2'),charges=spySealCosts(p);
 p.hullHp=p.maxHullHp*.3;p.flux.hardFlux=p.flux.maxFlux*.76;seal.advance(p,.1);assert.equal(charges.length,0);
 p.flux.hardFlux=0;p.flux.isVenting=true;seal.advance(p,.1);assert.equal(charges.length,0);
 p.flux.isVenting=false;p.flux.isOverloaded=true;seal.advance(p,.1);assert.equal(charges.length,0);
 p.flux.isOverloaded=false;tick(p);assert.equal(charges.length,1);assert(p.system.blocksWeapons);assert(!other.system.blocksWeapons);assert(!ship.system.blocksWeapons);
 ship.aimTargetWorld.set(0,-3000);assert(ship.system.activate());ship.system.update(.8);near(p.system.getWeaponRateOfFireMultiplier('BALLISTIC'),1);near(other.system.getWeaponRateOfFireMultiplier('BALLISTIC'),1.75);
 assert.match(ship.system.passiveStatusText,/封舱 P1/);assert.equal(ship.flux.hardFlux,0,'module sealing must not bill the core');
 ship.hullHp=0;tick(p);assert(!p.system.blocksWeapons);near(p.system.getHullDamageMultiplier(),1);
 const reserved=newFlagship();reserved.hullHp=reserved.maxHullHp*.4;reserved.flux.hardFlux=reserved.flux.maxFlux*.7;reserved.aimTargetWorld.set(0,-3000);assert(reserved.system.activate());assert(reserved.system.reservedFluxCost>0);
 const paid=spySealCosts(reserved);seal.advance(reserved,.1);assert.equal(paid.length,0);reserved.system.reset();seal.advance(reserved,.1);assert.equal(paid.length,1);
 const lethal=newFlagship();lethal.hullHp=10;lethal.applyHullDamage(1000);tick(lethal);assert.equal(lethal.hullHp,0);assert(!lethal.system.blocksWeapons);
 const enemy=newFlagship(true);enemy.hullHp=enemy.maxHullHp*.3;tick(enemy);assert(enemy.system.blocksWeapons);enemy.isRetreated=true;tick(enemy);assert(!enemy.system.blocksWeapons);
});
test('exclusive hullmods: applicability, conflicts, OP, immutable source, save and S-mod',()=>{
 for(const def of m.glorianaHullMods){assert(m.hullModDefinitions.get(def.id));assert(m.assetManager.hasPath('/game-assets/'+def.refit.icon));assert(m.hullModInstallReason(m.modManager.requireShip('hammerhead'),def.id));}
 const root=fit.spec,p1=root.modules.find(p=>p.slotId==='P1').spec,engine=root.modules.find(p=>p.slotId==='EP').spec;
 assert.equal(m.hullModInstallReason(root,mods.sanctuary),null);assert.equal(m.hullModOPCost(root,mods.sanctuary),18);
 assert(m.hullModInstallReason(root,mods.loader));assert.equal(m.hullModInstallReason(p1,mods.loader),null);assert(m.hullModInstallReason(engine,mods.loader));assert(m.hullModInstallReason(p1,mods.flightline));
 const draft=moddedDesign(mods.sanctuary),evaluated=m.evaluate(draft);assert.deepEqual(evaluated.errors,[]);assert.equal(evaluated.op.used,260);
 assert.deepEqual(m.decodeDesign(JSON.parse(JSON.stringify(draft))),draft);
 draft.hullMods.push(mods.flightline);assert(m.evaluate(draft).errors.some(e=>e.includes('不兼容')));assert.throws(()=>m.decodeDesign(JSON.parse(JSON.stringify(draft))));
 draft.hullMods=[mods.sanctuary];draft.sMods=[mods.sanctuary];assert.equal(m.evaluate(draft).op.modOP,0);assert.equal(m.evaluate(draft).errors.length,0);
 for(let i=0;i<3;i++)assert.equal(m.effectiveHullStats(evaluated.spec).voidShield.integrityPerLayer,18000);
 assert.equal(fit.spec.voidShield.integrityPerLayer,24000);assert.deepEqual(original.hullMods,[]);
});
test('sanctuary: actual shield damage/collapse/rebuild and Worker projection eligibility',()=>{
 const ship=moddedShip(mods.sanctuary),shield=ship.shield.voidShield;
 assert.equal(shield.integrity,72000);assert.equal(shield.rechargePerSecond,5200);assert.equal(shield.restartDelay,5);
 m.absorbVoidShield(shield,72000);assert.equal(shield.integrity,0);assert.equal(shield.restartRemaining,5);
 m.advanceVoidShield(shield,5);assert.equal(shield.integrity,0);m.advanceVoidShield(shield,3);assert.equal(shield.integrity,0);assert.equal(shield.rebuild,15600);
 m.advanceVoidShield(shield,.5);near(shield.integrity,18200);shield.suppressed=true;m.advanceVoidShield(shield,10);near(shield.integrity,18200);
 const projection=new m.RenderShipProjection();projection.begin();assert(projection.supports(ship.assemblyShips));assert.equal(projection.project(ship).shield.voidShield.integrityPerLayer,18000);projection.finish();
 const plain=moddedShip();assert.equal(plain.shield.voidShield.integrity,96000);
});
test('edict loader: real mounted weapon clock, selected side only, immediate lifecycle cleanup',()=>{
 const ship=moddedShip(),p=ship.childModules.find(c=>c.moduleMount.slotId==='P1'),plain=ship.childModules.find(c=>c.moduleMount.slotId==='P2'),opposite=ship.childModules.find(c=>c.moduleMount.slotId==='S1');
 const gun=p.weapons.find(w=>w.spec.weaponType==='BALLISTIC'),reference=m.glorianaWeapons.find(w=>w.id===gun.spec.id);
 near(reference.refireDelay/gun.spec.refireDelay,.8);near(p.system.getWeaponRateOfFireMultiplier('BALLISTIC'),1);
 ship.aimTargetWorld.set(0,-3000);assert(ship.system.activate());ship.system.update(.8);
 near(p.system.getWeaponRateOfFireMultiplier('BALLISTIC'),2.625);near(.8*p.system.getWeaponRateOfFireMultiplier('BALLISTIC'),2.1);
 near(p.system.getWeaponFluxCostMultiplier('BALLISTIC'),1);near(plain.system.getWeaponRateOfFireMultiplier('BALLISTIC'),1.75);near(opposite.system.getWeaponRateOfFireMultiplier('BALLISTIC'),.65);
 p.flux.isOverloaded=true;near(p.system.getWeaponRateOfFireMultiplier('BALLISTIC'),1);p.flux.isOverloaded=false;
 ship.flux.isVenting=true;near(p.system.getWeaponRateOfFireMultiplier('BALLISTIC'),1);m.glorianaEdict.onAdvance(ship,1/60,{},ship.system);ship.flux.isVenting=false;near(p.system.getWeaponRateOfFireMultiplier('BALLISTIC'),1);
 ship.system.reset();ship.aimTargetWorld.set(0,3000);assert(ship.system.activate());ship.system.update(.8);near(p.system.getWeaponRateOfFireMultiplier('BALLISTIC'),.65);
 ship.hullHp=0;near(p.system.getWeaponRateOfFireMultiplier('BALLISTIC'),1);near(reference.refireDelay/gun.spec.refireDelay,.8);
});
test('flightline: real deck replacement queue, spawn and operational range tradeoff',()=>{
 const ship=moddedShip(mods.flightline),decks=new m.FighterSystem();decks.init(ship);
 assert.equal(decks.playerWings.length,6);assert.equal(decks.fighters.length+decks.bombers.length,16);
 let rebuilt=0;const fx={recordFighterRebuilt:()=>rebuilt++,getPlayerPos:()=>ship.pos};
 const fighter=decks.fighters[0],wing=decks.playerWings.find(w=>w.wingId===fighter.flightDeckWingId);
 near(decks.wingRange(fighter,ship),3000);near(ship.hullStats.fighterRearmTimeFraction,0);
 wing.crr=.5;decks.updateDecks(1,ship,ship,fx);near(wing.crr,.5225);wing.crr=1;fighter.isDead=true;
 decks.updateDecks(0,ship,ship,fx);near(wing.rebuildQueue[0].maxTimer,7);near(wing.crr,.96);
 decks.updateDecks(6.9,ship,ship,fx);assert.equal(rebuilt,0);decks.updateDecks(.2,ship,ship,fx);assert.equal(rebuilt,1);assert.equal(decks.fighters.length+decks.bombers.length,16);
 const projection=new m.RenderShipProjection();assert(projection.supports(ship.assemblyShips));
});

test('siege presentation preserves ballistics and distinguishes hull contact from shield',()=>{
 const w=m.glorianaWeapons.find(w=>w.id===m.GLORIANA_WEAPONS.siege);
 assert.deepEqual([w.damagePerShot,w.damagePerSecond,w.fluxPerShot,w.range,w.chargeTime,w.refireDelay,w.projSpeed,w.projRadius,w.burstSize,w.burstDelay],
  [1000,1000/3.55,800,2000,.45,3.1,720,5.5,1,0]);
 assert.equal(w.spawnType,'BALLISTIC');assert.equal(w.projLength,22);assert.equal(w.projWidth,11);
 assert.equal(w.muzzleFlashSpec.particleDuration,.1);assert(w.projSpriteUrl.endsWith('shell_hellbore.png'));
 assert.equal(w.proximityFuse,undefined);assert.equal(w.explosionSpec,undefined);
 for(const shield of [false,true]){
  const scene=createSiegeScene(m,shield),baseline=createSiegeScene(m,shield,false);
  let contact=false;
  for(let i=0;i<300;i++){
   scene.step();baseline.step();
   if(scene.fired&&scene.engine.projectiles.some(p=>p.didDamage)){contact=true;break;}
  }
  assert(contact,'no real siege collision');assert.equal(scene.source.flux.totalFlux,800);
  assert.equal(scene.target.hullHp,baseline.target.hullHp);assert.equal(scene.target.flux.totalFlux,baseline.target.flux.totalFlux);
  assert.deepEqual(scene.target.armor.cells,baseline.target.armor.cells);assert.deepEqual(scene.engine.random,baseline.engine.random);
  assert.equal(scene.engine.explosions.length,shield?0:1);
  assert.equal(scene.engine.debris.length,shield?0:3,'do not add duplicate debris');
  if(shield){assert(scene.target.flux.totalFlux>0);assert(scene.engine.hitGlows.length>0);}
  else{
   const burst=scene.engine.explosions[0];assert.equal(burst.hasShockwaveRing,false);assert.equal(burst.puffs.length,3);assert.equal(burst.flash.duration,.065);
   const viewer=createSiegeScene(m).engine;m.applyCombatSnapshot(viewer,JSON.parse(JSON.stringify(m.captureCombat(scene.engine,1,{0:0},0))),true);
   assert.equal(viewer.explosions.length,1);assert.equal(viewer.explosions[0].puffs.length,3);
   viewer.fxSystem.update(.5);assert.equal(viewer.explosions.length,0);
  }
  const urls=m.collectCombatTextureUrls(scene.engine);
  for(const path of [w.projSpriteUrl,...m.glorianaSiegeHit.resources.textures])assert(urls.includes(path)&&m.assetManager.hasPath(path),'unbundled effect '+path);
  const projection=new m.RenderShipProjection();projection.begin();assert.equal(projection.project(scene.source).weapons[0].spec.projSpriteUrl,w.projSpriteUrl);projection.finish();
 }
});

const firing=[];
for(const w of m.glorianaWeapons){
 test('real weapon-state firing: '+w.id,()=>{
  const spec={...structuredClone(fit.spec),id:'armory-firing-fixture',modules:[],moduleSlots:[],fighterWings:[],systemType:'NONE',systemTypes:[],hullMods:[],builtInHullMods:[],maxFlux:1000000,
   weaponSlots:[{slotId:'TEST',mountType:'TURRET',slotSize:w.mountSize,weaponType:'UNIVERSAL',x:0,y:0,baseAngleDeg:0,arcDeg:360,defaultWeaponId:w.id}],
   defaultWeaponGroups:[{index:0,mode:'LINKED',isAutofire:false,weaponSlotIds:['TEST']}]};
  const ship=new m.Ship('test-'+w.id,spec,true,new m.Vector2(),0);ship.isFiringMain=true;ship.fireControlMode='MANUAL';ship.selectedGroupIndex=0;ship.aimTargetWorld.set(Math.min(1000,w.range*.8),0);
  const shots=[],beams=[];let flashes=0,charged=false,firstBeamTime=null;const rackEvents=[];let lastAmmo=ship.weapons[0].ammo,sawReload=false;
  const ticks=w.id===m.GLORIANA_WEAPONS.torpedo?3600:900;
  for(let tick=0;tick<ticks;tick++){
   ship.update(1/60,null,p=>shots.push(p),b=>{beams.push(b);firstBeamTime??=tick/60;},()=>flashes++);
   if(ship.weapons[0].glowAlpha>0)charged=true;
   if(w.id===m.GLORIANA_WEAPONS.torpedo){
    const mount=ship.weapons[0];
    if(mount.ammo!==lastAmmo){rackEvents.push({ammo:mount.ammo,levels:[...mount.loadedMissileLevels]});lastAmmo=mount.ammo;}
    if(mount.cooldownTimer>0&&mount.cooldownTimer<1.1&&mount.ammo>0){assert(mount.loadedMissileLevels.every(l=>l>0&&l<1));sawReload=true;}
   }
  }
  if(w.id===m.GLORIANA_WEAPONS.lance){assert(charged,'missing lance charge state');assert(firstBeamTime>=1.18,'lance fired before full charge');}
  if(w.isBeam){assert(beams.length>0,'no beam');assert(beams.some(b=>b.damagePerSec>0),'no damaging beam');}
  else {assert(shots.length>0,'no projectile');assert(shots.every(p=>p.specId===w.id));}
  if(w.id===m.GLORIANA_WEAPONS.torpedo){assert.equal(shots.length,8);assert.equal(ship.weapons[0].ammo,0);assert(shots.every(p=>p.isGuided&&p.hitpoints===650));
   assert(sawReload);assert.deepEqual(rackEvents.map(e=>e.ammo),[7,6,5,4,3,2,1,0]);
   for(const [i,event] of rackEvents.entries())assert.deepEqual(event.levels,i%2===0?[0,1]:[0,0]);
   const mount=ship.weapons[0];assert.deepEqual(mount.loadedMissileLevels,[0,0]);
   const projection=new m.RenderShipProjection();projection.begin();assert(projection.supports([ship]));
   const projected=projection.project(ship);assert.deepEqual(projected.weapons[0].loadedMissileLevels,[0,0]);projection.finish();
   const lane=new m.ShipDisplayEncoder(),decoder=new m.ShipDisplayDecoder();
   let packet=lane.capture([ship],1,true);assert(packet);assert.equal(new DataView(packet).getUint32(4,true),2);
   assert.deepEqual(decoder.decode(packet).ships[0].weapons[0].loadedMissileLevels,[0,0]);
   mount.loadedMissileLevels=[0,1];packet=lane.capture([ship],2);assert.deepEqual(decoder.decode(packet).ships[0].weapons[0].loadedMissileLevels,[0,1]);
   const lan=new m.LanShipProjection();lan.begin();assert.deepEqual(lan.project(ship).weapons[0].loadedMissileLevels,[0,1]);lan.finish();
   const urls=m.collectCombatTextureUrls({allCapitalShips:[ship],ships:[ship],crafts:[],debris:[],environment:{},playerWings:[],enemyWings:[],hulkFragments:[],projectiles:[],nebulae:[],asteroids:[]});
   for(const url of m.glorianaTorpedoTextures)assert(urls.includes(url),'missing closure '+url);
   mount.loadedMissileLevels=[0,0];
  }
  if([m.GLORIANA_WEAPONS.siege,m.GLORIANA_WEAPONS.torpedo,m.GLORIANA_WEAPONS.macro].includes(w.id)){
   const attacker=new m.Ship('auto-'+w.id,spec,true,new m.Vector2(),0);
   const target=new m.Ship('armored-target',m.modManager.requireShip('web_zhuyuan'),false,new m.Vector2(800,0),Math.PI);
   target.shield.isActive=true;target.shield.currentArcDeg=360;target.shield.facingAngleRad=Math.PI;
   const mount=attacker.weapons[0],world={ships:[attacker,target],missiles:[],asteroids:[]};
   const solution={target:{kind:'SHIP',entity:target},point:target.pos.clone(),delay:0,speed:w.projSpeed,range:w.range};
   const ai=new m.AutofireController();
   assert.equal(ai.decide(attacker,mount,solution,world,1/60),w.id===m.GLORIANA_WEAPONS.macro?'FIRE':'CONSERVING_AMMO');
   target.shield.isActive=false;target.shield.currentArcDeg=0;assert.equal(ai.decide(attacker,mount,solution,world,1/60),'FIRE');
  }
  firing.push({id:w.id,shots:shots.length,beams:beams.length,flashes,charged,firstBeamTime,remainingAmmo:ship.weapons[0].ammo});
 });
}

const aviationDesign=m.createGlorianaAviationDesign(),aviation=m.evaluate(aviationDesign);
// Current repair scope: real aircraft weapons and opt-in drive dependency; no new scene engine.
const repairMeasurements={};
const repairShip=()=>new m.Ship('repair-gloriana',m.modManager.requireShip(m.GLORIANA_HULL_ID),true,new m.Vector2(),0);
const driveParts=ship=>['EP','ES'].map(id=>ship.childModules.find(c=>c.moduleMount.slotId===id));
const killDrive=part=>{part.hullHp=0;part.isDead=true;};
test('repair: baked aircraft guns use fixed world muzzle and launch heading at multiple hull poses',()=>{
 for(const spec of m.glorianaAircraft)for(const facing of [0,Math.PI/2,-Math.PI*.75]){
  const ship=new m.Ship('fixed-'+spec.id,spec,true,new m.Vector2(30,50),facing),shots=[];
  ship.fireControlMode='MANUAL';ship.selectedGroupIndex=0;ship.isFiringMain=true;
  ship.aimTargetWorld.copy(ship.pos).add(new m.Vector2(600,180).rotate(facing));
  for(let i=0;i<90;i++)ship.update(1/60,null,p=>shots.push(p),()=>{},()=>{});
  assert(shots.length>0,spec.id+' stopped firing');
  for(const mount of ship.weapons){assert.equal(mount.mountType,'HARDPOINT');assert.equal(mount.spec.turnRateDegPerSec,0);assert(mount.spec.hardpointUsesHullSprite);near(mount.currentAngleRad,facing);}
  for(const p of shots){
   const angle=Math.atan2(Math.sin(p.vel.heading()-facing),Math.cos(p.vel.heading()-facing));assert(Math.abs(angle)<2*Math.PI/180,'projectile did not leave the fixed barrel');
   assert(ship.weapons.some(w=>p.pos.distanceTo(ship.pos.clone().add(w.relativePos.clone().rotate(facing)))<1e-6),'not a calibrated muzzle');
  }
 }
});
test('repair: drive slots preserve healthy performance and scale one/two lost sections without removing brakes',()=>{
 const ship=repairShip(),full=ship.getMotionStats(),[left,right]=driveParts(ship);
 assert.deepEqual(m.modulePropulsionState(ship),{online:2,total:2,level:1,speed:1,acceleration:1,turn:1});
 for(const [part,speed,acceleration,turn] of [[left,.65,.6,.7],[right,.3,.2,.4]]){
  killDrive(part);const motion=ship.getMotionStats();near(motion.maxSpeed,full.maxSpeed*speed);near(motion.acceleration,full.acceleration*acceleration);near(motion.maxTurnRate,full.maxTurnRate*turn);near(motion.turnAcceleration,full.turnAcceleration*turn);near(motion.deceleration,full.deceleration);
 }
 assert(ship.system.passiveStatusText.includes('动力 0/2'));
 const other=new m.Ship('unrelated',m.modManager.requireShip('web_zhuyuan'),true,new m.Vector2(),0);
 assert.equal(m.modulePropulsionState(other),undefined);near(other.getMotionStats().maxSpeed,other.spec.maxSpeed);
});
test('repair: missing modules and partial/temporary engine failures have live non-compounding contributions',()=>{
 const ship=repairShip(),[left,right]=driveParts(ship),before=ship.getMotionStats();
 left.engineController.disable(0,{extendedGlow:false,systemActive:false});
 let state=m.modulePropulsionState(ship);assert(state.level>.5&&state.level<1);assert(state.speed>.65&&state.speed<1);
 // Exercise the production component repair path before probing a whole-controller outage.
 let repairFrames=0;while(left.engineController.engines[0].isDisabled&&repairFrames<3600){left.update(1/60,null,()=>{},()=>{},()=>{});repairFrames++;}
 assert(!left.engineController.engines[0].isDisabled,'temporary nozzle must repair through Ship.update');near(m.modulePropulsionState(ship).speed,1);
 repairMeasurements.engineRepairSeconds=repairFrames/60;
 left.engineController.state='DISABLED';near(m.modulePropulsionState(ship).speed,.65);
 left.engineController.restore();assert.deepEqual(ship.getMotionStats(),before);
 left.parentShip=null;near(m.modulePropulsionState(ship).speed,.65);left.parentShip=ship;
 left.isRetreated=true;near(m.modulePropulsionState(ship).speed,.65);left.isRetreated=false;
 ship.childModules.splice(ship.childModules.indexOf(left),1);near(m.modulePropulsionState(ship).speed,.65);
 right.isDocked=true;near(m.modulePropulsionState(ship).speed,.3);right.isDocked=false;
 for(let i=0;i<10;i++)near(ship.getMotionStats().maxSpeed,18.2);
 ship.engineController.state='DISABLED';near(ship.getMotionStats().maxSpeed,1);
});
test('repair: real motion, parent command flames and LAN projection consume the same damaged drive state',()=>{
 const full=repairShip(),damaged=repairShip();driveParts(damaged).forEach(killDrive);
 for(const ship of [full,damaged]){ship.flux.increaseFlux(ship.flux.maxFlux*.5,true);ship.throttle=1;ship.turnInput=.25;for(let i=0;i<180;i++)ship.update(1/60,null,()=>{},()=>{},()=>{});}
 assert(damaged.vel.length()<full.vel.length()*.5);assert(damaged.pos.length()>0);assert(damaged.facingRad>0&&damaged.facingRad<full.facingRad);
 full.syncModuleTree(true);const [left]=driveParts(full);left.update(1/60,null,()=>{},()=>{},()=>{});assert(left.engineController.flameAccelerating);
 const projection=new m.LanShipProjection();projection.begin();const projected=projection.project(damaged);near(projected.motionStats.maxSpeed,damaged.getMotionStats().maxSpeed);projection.finish();
 const lane=new m.ShipDisplayEncoder(),packet=lane.capture([damaged],1,true),decoder=new m.ShipDisplayDecoder();const decoded=decoder.decode(packet).ships.find(s=>s.id===damaged.id);assert.deepEqual(decoded.spec.modulePropulsion,damaged.spec.modulePropulsion);
});
test('repair: propulsion config validates stable slots and reserve bounds, and survives design roundtrip',()=>{
 const spec=structuredClone(m.modManager.requireShip(m.GLORIANA_HULL_ID));
 m.validateShipSpec(spec,{allowExistingId:true});
 for(const drive of [{...spec.modulePropulsion,slotIds:[]},{...spec.modulePropulsion,slotIds:['EP','EP']},{...spec.modulePropulsion,slotIds:['MISSING']},{...spec.modulePropulsion,reserveSpeed:1.1},{...spec.modulePropulsion,reserveTurn:NaN}])assert.throws(()=>m.validateShipSpec({...spec,modulePropulsion:drive},{allowExistingId:true}));
 const round=m.evaluate(m.decodeDesign(JSON.parse(JSON.stringify(m.createDesign(m.GLORIANA_HULL_ID)))));assert.deepEqual(round.errors,[]);assert.deepEqual(round.spec.modulePropulsion,spec.modulePropulsion);
});
const loadoutMeasurements={};
test('loadouts: new defaults and v2 presets keep 48 same-tier mounts, paid mods and distinct valid budgets',()=>{
 const rows=[];
 for(const [name,design] of [['default',m.createDesign(m.GLORIANA_HULL_ID)],['arsenal',m.createGlorianaArsenalDesign()],['aviation',aviationDesign]]){
  const result=m.evaluate(design);assert.deepEqual(result.errors,[]);const parts=m.assemblyParts(result.spec);
  assert.equal(parts.length,9);assert.equal(parts.reduce((n,p)=>n+p.spec.weaponSlots.length,0),48);
  for(const part of parts){m.validateShipSpec(part.spec,{allowExistingId:true});for(const slot of part.spec.weaponSlots){const w=m.modManager.getWeapon(slot.defaultWeaponId);assert(Object.values(m.GLORIANA_WEAPONS).includes(w.id));assert.equal(w.mountSize,slot.slotSize);}}
  for(const child of Object.values(design.modules??{}))assert(m.budget(child).remaining>=0);
  assert.deepEqual(m.evaluate(m.decodeDesign(JSON.parse(JSON.stringify(design)))).errors,[]);
  rows.push({name,budget:result.op,mods:design.hullMods,wings:design.wings,moduleMods:Object.fromEntries(Object.entries(design.modules??{}).map(([id,part])=>[id,part.hullMods]))});
 }
 assert.equal(rows[0].budget.used,230);assert.equal(rows[1].budget.used,260);assert.equal(rows[2].budget.used,260);
 assert.deepEqual(rows[2].mods,[m.GLORIANA_HULLMODS.flightline]);
 for(const [id,part] of Object.entries(d.modules)){assert.deepEqual(part.hullMods,/^[PS][123]$/.test(id)?[m.GLORIANA_HULLMODS.loader]:[]);}
 assert(Object.values(aviationDesign.modules).every(part=>part.hullMods.length===0));
 for(const id of ['M12','M13']){assert.equal(d.weapons[id],m.GLORIANA_WEAPONS.torpedo);assert.equal(aviationDesign.weapons[id],m.GLORIANA_WEAPONS.siege);}
 assert.deepEqual(aviationDesign.groups[2].weaponSlotIds,[]);assert(aviationDesign.groups[1].weaponSlotIds.includes('M12'));
 loadoutMeasurements.presets=rows;
});
test('loadouts: previous saved weapons, wings, modules and groups remain intact; expensive custom wings are not trimmed',()=>{
 const saved=m.createGlorianaArsenalDesign();saved.name='帝国军械 · 战列齐射';saved.capacitors=0;
 for(const part of Object.values(saved.modules))part.hullMods=[];
 for(const id of ['M12','M13','M14'])saved.weapons[id]='web_zhuyuan_star_needle';
 saved.wings=[null,...original.wings.slice(1)];saved.groups[0].mode='ALTERNATING';
 const text=JSON.stringify(saved),restored=m.decodeDesign(JSON.parse(text));assert.equal(JSON.stringify(saved),text);
 for(const key of ['id','name','weapons','wings','modules','groups','capacitors','vents'])assert.deepEqual(restored[key],saved[key]);
 assert.deepEqual(m.evaluate(restored).errors,[]);
 const wings=Array(6).fill('web_gloriana_starhawk_wing'),custom=m.createGlorianaArsenalDesign({wings});
 assert.deepEqual(custom.wings,wings);assert(m.evaluate(custom).errors.length>0);assert.equal(m.budget(custom).remaining,-28);
 custom.wings[0]=null;assert(wings.every(id=>id==='web_gloriana_starhawk_wing'));
});
test('loadouts: only Gloriana hull/weapon records suffice for new default and v2 runtime construction',()=>{
 const saved={ships:m.contentRegistry.getAllShips(),weapons:m.contentRegistry.getAllWeapons()};
 try{
  m.contentRegistry.installSnapshot([...m.glorianaShips(),...m.glorianaAircraft],[...m.glorianaWeapons,...m.glorianaAirWeapons]);
  assert.equal(m.modManager.getWeapon('web_zhuyuan_star_needle'),undefined);
  for(const design of [m.createDesign(m.GLORIANA_HULL_ID),m.createGlorianaArsenalDesign(),m.createGlorianaAviationDesign()]){
   const checked=m.evaluate(design);assert.deepEqual(checked.errors,[]);
   const ship=new m.Ship('closure-'+design.name,checked.spec,true,new m.Vector2(),0),decks=new m.FighterSystem();decks.init(ship);
   assert.equal(ship.assemblyShips.length,9);assert.equal(decks.playerWings.length,6);
   assert([...ship.assemblyShips,...decks.fighters,...decks.bombers].every(s=>s.weapons.every(w=>w.spec.id.startsWith('web_gloriana_'))));
  }
 }finally{m.contentRegistry.installSnapshot(saved.ships,saved.weapons);}
 // Host effect implementations/assets remain registered; this is NOT an independent install test.
});
function batteryOutput(design,edict,seconds){
 const ship=new m.Ship('burst-probe',m.evaluate(design).spec,true,new m.Vector2(),0),battery=ship.childModules.find(p=>p.moduleMount.slotId==='P1');
 const gun=battery.weapons.find(w=>w.spec.id===m.GLORIANA_WEAPONS.macro);let shots=0,paid=0,peakFlux=0;
 for(const w of battery.weapons)if(w!==gun){w.isPermanentlyDisabled=true;w.isDisabled=true;}
 battery.fireControlMode='MANUAL';battery.selectedGroupIndex=0;battery.isFiringMain=true;battery.aimTargetWorld.copy(battery.pos).add(new m.Vector2(0,-1000));
 const pay=battery.flux.increaseFlux.bind(battery.flux);battery.flux.increaseFlux=(amount,hard)=>{paid+=amount;return pay(amount,hard);};
 if(edict){ship.aimTargetWorld.set(0,-3000);assert(ship.system.activate());ship.system.update(.8);}
 for(let i=0;i<seconds*60;i++){battery.update(1/60,null,()=>shots++,()=>{},()=>{});peakFlux=Math.max(peakFlux,battery.flux.totalFlux);if(edict)ship.system.update(1/60);}
 const out={seconds,shots,paidFlux:paid,peakFlux,overloaded:battery.flux.isOverloaded};
 if(edict){ship.flux.isVenting=true;near(battery.system.getWeaponRateOfFireMultiplier('BALLISTIC'),1);ship.flux.isVenting=false;ship.system.reset();near(battery.system.getWeaponRateOfFireMultiplier('BALLISTIC'),1);}
 return out;
}
test('loadouts: real gun clocks and paid flux trade steady fire for selected-broadside bursts',()=>{
 const steadyA=batteryOutput(d,false,30),steadyB=batteryOutput(aviationDesign,false,30),burstA=batteryOutput(d,true,6),burstB=batteryOutput(aviationDesign,true,6);
 assert(steadyA.shots>0&&steadyA.shots<steadyB.shots,'loader must have a real normal-fire cost');
 assert(burstA.shots>burstB.shots,'selected loader side must fire more within its real active window');
 assert(burstA.paidFlux/burstA.shots<burstB.paidFlux/burstB.shots,'burst cost compensation must reach actual flux payment');
 assert([steadyA,steadyB,burstA,burstB].every(row=>!row.overloaded));
 loadoutMeasurements.singleMacro={steadyArsenal:steadyA,steadyAviation:steadyB,edictArsenal:burstA,edictAviation:burstB};
});
test('loadouts: real deck losses rebuild faster but have shorter reach; living bomber rearm stays unchanged',()=>{
 const rows=[];
 for(const [name,design] of [['arsenal',d],['aviation',aviationDesign]]){
  const ship=new m.Ship('deck-'+name,m.evaluate(design).spec,true,new m.Vector2(),0),decks=new m.FighterSystem();decks.init(ship);
  const bomber=decks.bombers[0],wing=decks.playerWings.find(w=>w.wingId===bomber.flightDeckWingId);let rebuilt=0;
  const fx={recordFighterRebuilt:()=>rebuilt++,getPlayerPos:()=>ship.pos};
  const row={name,crafts:decks.fighters.length+decks.bombers.length,bombers:decks.bombers.length,range:decks.wingRange(bomber,ship)};
  near(ship.hullStats.fighterRearmTimeFraction,0);wing.crr=.5;decks.updateDecks(1,ship,ship,fx);row.crrRecovery=wing.crr-.5;wing.crr=1;
  bomber.isDead=true;bomber.hullHp=0;decks.updateDecks(0,ship,ship,fx);row.rebuild=wing.rebuildQueue[0].maxTimer;
  decks.updateDecks(row.rebuild-.01,ship,ship,fx);assert.equal(rebuilt,0);decks.updateDecks(.02,ship,ship,fx);assert.equal(rebuilt,1);
  assert.equal(decks.bombers.length,row.bombers);rows.push(row);
 }
 assert.equal(rows[0].crafts,14);assert.equal(rows[1].crafts,15);assert.equal(rows[0].bombers,4);assert.equal(rows[1].bombers,6);
 near(rows[0].range,4000);near(rows[1].range,3000);near(rows[1].rebuild,rows[0].rebuild*.7);near(rows[1].crrRecovery,rows[0].crrRecovery*1.5);
 loadoutMeasurements.decks=rows;
});
test('loadouts: existing preset IDs carry truthful per-choice replacement and drawback warnings',()=>{
 const choices=m.extensionVariantsForHull(m.GLORIANA_HULL_ID);assert.deepEqual(choices.map(c=>c.id),['web-gloriana-arsenal','web-gloriana-aviation']);
 assert(choices[0].warnings.join('').includes('保留当前联队'));assert(choices[1].warnings.join('').includes('将联队替换'));assert(choices.every(c=>c.name.endsWith(' II')));
});
function flightFixture(){
 const carrier=new m.Ship('aviation-carrier',aviation.spec,true,new m.Vector2(),0);
 // Use an available hull with an explicit FRONT-shield fixture for the directional shield-window assertions.
 const enemy=new m.Ship('aviation-enemy',{...m.modManager.requireShip('web_zhuyuan'),shieldType:'FRONT'},false,new m.Vector2(2200,0),Math.PI);
 const decks=new m.FighterSystem();decks.init(carrier);const shots=[],beams=[],extraShips=[],asteroids=[];let order;
 const fx={getOrder:id=>id==='fleet'?order:undefined,cancelOrder:()=>{order=undefined;},findHostile:()=>enemy,getPlayerPos:()=>carrier.pos,
  destructionSideEffectsEnabled:()=>false,recordFighterRebuilt:()=>{},spawnContrail:()=>{},addFloatingText:()=>{},addRadioMessage:()=>{}};
 const world=missiles=>({ships:[...carrier.assemblyShips,enemy,...decks.fighters,...decks.bombers,...extraShips],missiles,asteroids});
 return {carrier,enemy,decks,shots,beams,extraShips,asteroids,fx,setOrder:o=>{order=o;},
  fighters:(frames=1,missiles=[])=>{for(let i=0;i<frames;i++)decks.updateFighters(1/60,carrier,enemy,missiles,p=>shots.push(p),b=>beams.push(b),()=>{},fx,world(missiles));},
  bombers:(frames=1)=>{for(let i=0;i<frames;i++)decks.updateBombers(1/60,carrier,enemy,p=>shots.push(p),b=>beams.push(b),()=>{},fx,world([]));}};
}
test('aviation: six paid LPC decks, 15 craft, original fit preserved, registered art/weapons',()=>{
 assert.deepEqual(aviation.errors,[]);assert.equal(aviation.op.used,260);assert.equal(aviation.op.wingOP,84);assert.equal(aviation.op.modOP,18);
 assert.deepEqual(m.decodeDesign(JSON.parse(JSON.stringify(aviationDesign))).wings,aviationDesign.wings);
 assert.deepEqual(m.createGlorianaArsenalDesign(original).wings,original.wings);
 const f=flightFixture();assert.equal(f.decks.playerWings.length,6);assert.equal(f.decks.fighters.length,9);assert.equal(f.decks.bombers.length,6);
 assert.deepEqual(Object.fromEntries(Object.values(m.GLORIANA_CRAFT).map(id=>[id,[...f.decks.fighters,...f.decks.bombers].filter(c=>c.spec.id===id).length])),
  {[m.GLORIANA_CRAFT.fury]:8,[m.GLORIANA_CRAFT.thunderhawk]:1,[m.GLORIANA_CRAFT.starhawk]:6});
 const expected={web_gloriana_fury:[96,600,120,2],web_gloriana_starhawk:[128,1600,300,4],web_gloriana_thunderhawk:[144,3200,500,3]};
 for(const spec of m.glorianaAircraft){assert.deepEqual([spec.spriteHeight,spec.hitpoints,spec.armorRating,spec.engineSlots.length],expected[spec.id]);near(spec.collisionRadius,spec.spriteHeight*.57);assert(spec.engineSlots.every(e=>e.width>6&&e.length>=72));}
 for(const spec of m.glorianaAircraft){m.validateShipSpec(spec,{allowExistingId:true,requireBundledAssets:true});assert(spec.spriteUrl.includes('/aviation/'));assert(spec.engineSlots.length>=2);assert(spec.weaponSlots.every(s=>s.mountType==='HARDPOINT'&&s.builtIn));}
 for(const weapon of m.glorianaAirWeapons){m.validateWeaponSpec(weapon,true);assert.equal(m.nativeRefit.weapons[weapon.id].builtInOnly,true);}
 const unloaded=m.withWing(aviationDesign,0,null);assert.equal(m.budget(unloaded).used,252);
 const mixed=m.withWing({...unloaded,vents:14},0,'web_gloriana_thunderhawk_wing');assert.deepEqual(m.evaluate(mixed).errors,[]);
 const craft=[...f.decks.fighters,...f.decks.bombers],projection=new m.RenderShipProjection();assert(projection.supports(craft));
 const lane=new m.ShipDisplayEncoder(),decoder=new m.ShipDisplayDecoder(),packet=lane.capture(craft,1,true);
 assert(packet);const aircraftIds=new Set(craft.map(c=>c.id)),decodedCraft=decoder.decode(packet).ships.filter(c=>aircraftIds.has(c.id));assert.equal(decodedCraft.length,15);assert(decodedCraft.every(c=>c.spec.spriteUrl.includes('/aviation/')));
 f.decks.bombers[0].isDocked=true;assert(decoder.decode(lane.capture(craft,2)).ships.find(c=>c.id===f.decks.bombers[0].id).isDocked);
 const urls=m.collectCombatTextureUrls({allCapitalShips:[f.carrier],ships:[f.carrier],crafts:[],debris:[],environment:{},playerWings:f.decks.playerWings,enemyWings:[],hulkFragments:[],projectiles:[],nebulae:[],asteroids:[]});
 for(const spec of m.glorianaAircraft)assert(urls.includes(spec.spriteUrl));
});
test('aviation: Fury prioritizes hostile missiles/aircraft, recall wins, no autonomous capital rush',()=>{
 const f=flightFixture(),craft=f.decks.fighters[0],mode=f.decks.fighterAIModes.get(craft.id);
 craft.pos.set(1300,0);craft.facingRad=0;f.fighters();assert.equal(mode.state,'ESCORT');assert.equal(craft.isFiringMain,false);
 const missile={id:100,sourceShipId:f.enemy.id,teamId:f.enemy.teamId,isRocket:true,pos:new m.Vector2(1650,0),vel:new m.Vector2(-100,0),rangeRemaining:1000,radius:8,hitpoints:100,flightTimeRemaining:10};
 craft.pos.set(1300,0);craft.facingRad=0;f.fighters(1,[missile]);assert.equal(mode.state,'INTERCEPT');assert(craft.isFiringMain);f.fighters(30,[missile]);assert(f.shots.some(p=>p.sourceShipId===craft.id&&p.specId===m.GLORIANA_AIR_WEAPONS.laser&&p.damage>12));
 f.carrier.fighterRecall=true;f.fighters(1,[missile]);assert.equal(mode.state,'ESCORT');assert.equal(craft.isFiringMain,false);
 f.carrier.fighterRecall=false;f.fighters(1,[{...missile,teamId:f.carrier.teamId}]);assert.notEqual(mode.state,'INTERCEPT');
 const hostile=new m.Ship('hostile-starhawk',m.modManager.getShip(m.GLORIANA_CRAFT.starhawk),false,new m.Vector2(1650,0),Math.PI);
 f.decks.bombers.push(hostile);f.fighters();assert.equal(mode.state,'DOGFIGHT');
 hostile.isDocked=true;f.fighters();assert.equal(mode.state,'ESCORT');
 f.setOrder({id:'attack',type:'ENGAGE',targetShipId:f.enemy.id,issuedTime:0});f.fighters();assert.equal(mode.state,'ATTACK');
});
test('aviation: Thunderhawk standoff uses real kinetic gun; Starhawk conserves against closed shields',()=>{
 const f=flightFixture(),gunship=f.decks.fighters.find(c=>c.spec.id===m.GLORIANA_CRAFT.thunderhawk);
 gunship.pos.set(1450,0);gunship.facingRad=0;f.fighters(120);
 assert(f.shots.some(p=>p.sourceShipId===gunship.id && p.specId===m.GLORIANA_AIR_WEAPONS.cannon && p.damageType==='KINETIC'&&p.damage>150));
 // This case tests the shield gate, not firing through the gunships from the preceding phase.
 for(const c of f.decks.fighters){c.pos.y+=1600;c.vel.set(0,0);}
 const bomber=f.decks.bombers[0];bomber.pos.set(1300,0);bomber.facingRad=0;
 f.enemy.shield.isActive=true;f.enemy.shield.currentArcDeg=360;f.enemy.shield.facingAngleRad=Math.PI;
 f.bombers(120);assert(bomber.weapons.every(w=>w.ammo===1));assert.equal(f.decks.bomberAIModes.get(bomber.id).state,'ESCORT');
 f.setOrder({id:'attack',type:'ENGAGE',targetShipId:f.enemy.id,issuedTime:0});bomber.pos.set(1300,0);bomber.facingRad=0;
 // A closed-shield hold turns the fixed-gun bomber away; allow a physical return onto the launch heading.
 for(let i=0;i<600&&bomber.weapons.some(w=>w.ammo>0);i++)f.bombers();assert(bomber.weapons.every(w=>w.ammo===0),'forced order must allow a shielded strike: '+JSON.stringify({pos:bomber.pos,vel:bomber.vel,facing:bomber.facingRad,aim:bomber.aimTargetWorld,mode:f.decks.bomberAIModes.get(bomber.id),mounts:bomber.weapons.map(w=>({ammo:w.ammo,state:w.firingState,control:w.fireControl,angle:w.currentAngleRad,target:w.fireControlTargetShipId}))}));
});
test('aviation: actual two-torpedo run, physical return, 12-second dock, recall hold, no free healing',()=>{
 const f=flightFixture(),b=f.decks.bombers[0],mode=f.decks.bomberAIModes.get(b.id);f.enemy.shield.isActive=false;
 b.pos.set(1300,0);b.facingRad=0;b.hullHp=600;
 let launchFrames=0;while(launchFrames<600&&b.weapons.some(w=>w.ammo>0)){f.bombers();launchFrames++;}
 repairMeasurements.starhawkSalvoSeconds=launchFrames/60;
 assert.equal(f.shots.filter(p=>p.sourceShipId===b.id&&p.specId===m.GLORIANA_AIR_WEAPONS.torpedo).length,2);
 assert(f.shots.filter(p=>p.sourceShipId===b.id).every(p=>p.damage>1500&&p.hitpoints===350));
 assert.equal(mode.state,'RETURN_TO_REARM');assert(b.weapons.every(w=>w.ammo===0));
 let returnFrames=0;while(returnFrames<2600&&mode.state!=='DOCKED'){f.bombers();returnFrames++;}repairMeasurements.starhawkReturnSeconds=returnFrames/60;
 assert.equal(mode.state,'DOCKED','aircraft must fly to its carrier, not require a test teleport');assert(b.isDocked);near(mode.timer,12);
 f.carrier.fighterRecall=true;f.bombers(600);assert(b.weapons.every(w=>w.ammo===0));assert(b.isDocked);
 f.bombers(121);assert(b.weapons.every(w=>w.ammo===1));assert(b.isDocked);assert.equal(b.hullHp,600);
 f.carrier.pos.set(30,50);f.bombers();assert.equal(b.pos.x,30);assert.equal(b.pos.y,50);
 f.carrier.fighterRecall=false;f.bombers();assert.equal(b.isDocked,false);assert.equal(b.isDead,false);
});
test('aviation: disabled launchers, shield gaps, flightline replacement and carrier loss',()=>{
 const f=flightFixture(),b=f.decks.bombers[0],mode=f.decks.bomberAIModes.get(b.id);b.pos.set(1300,0);b.facingRad=0;
 f.enemy.shield.isActive=false;for(const w of b.weapons){w.isDisabled=true;w.disabledTimer=100;}
 f.bombers(60);assert(b.weapons.every(w=>w.ammo===1));assert.notEqual(mode.state,'RETURN_TO_REARM');
 for(const w of b.weapons){w.isDisabled=false;w.disabledTimer=0;}
 f.enemy.shield.isActive=true;f.enemy.shield.currentArcDeg=90;f.enemy.shield.facingAngleRad=0;b.pos.set(1300,0);b.facingRad=0;
 f.bombers();assert.equal(mode.state,'ESCORT','FRONT shield coverage uses hull facing, not a stale shield-angle field');
 f.enemy.facingRad=0;
 for(let i=0;i<600&&b.weapons.some(w=>w.ammo>0);i++)f.bombers();assert(b.weapons.every(w=>w.ammo===0),'rear shield gap should permit attack: '+JSON.stringify({pos:b.pos,facing:b.facingRad,mode,targetFacing:f.enemy.facingRad,shield:{type:f.enemy.shield.type,facing:f.enemy.shield.facingAngleRad,arc:f.enemy.shield.currentArcDeg},mounts:b.weapons.map(w=>({ammo:w.ammo,control:w.fireControl,state:w.firingState}))}));
 mode.state='DOCKED';mode.timer=.01;b.isDocked=true;f.carrier.isDead=true;f.bombers();assert(b.isDead);assert(b.weapons.every(w=>w.ammo===0));
 const design=structuredClone(aviationDesign);design.capacitors=0;design.vents=0;design.hullMods=[...new Set([...design.hullMods,m.GLORIANA_HULLMODS.flightline])];
 const carrier=new m.Ship('aviation-flightline',m.evaluate(design).spec,true,new m.Vector2(),0),decks=new m.FighterSystem();decks.init(carrier);
 const bomber=decks.bombers[0],wing=decks.playerWings.find(w=>w.wingId===bomber.flightDeckWingId);near(decks.wingRange(bomber,carrier),3000);
 bomber.isDead=true;decks.updateDecks(0,carrier,f.enemy,f.fx);near(wing.rebuildQueue[0].maxTimer,16.8);
});

test('aviation: common targeting uses lead and stable air contacts without changing specialist roles',()=>{
 const f=flightFixture(),c=f.decks.fighters[0],mode=f.decks.fighterAIModes.get(c.id);
 const first=new m.Ship('stable-air-first',m.modManager.getShip(m.GLORIANA_CRAFT.starhawk),false,new m.Vector2(1650,0),Math.PI);
 const second=new m.Ship('stable-air-second',first.spec,false,new m.Vector2(1680,0),Math.PI);
 first.vel.set(0,60);f.decks.bombers.push(first,second);c.pos.set(1300,0);c.facingRad=0;
 f.fighters();assert.equal(c.fireControlMode,'AI');assert.equal(c.currentTargetShip,first);assert.equal(mode.targetUnitId,first.id);
 assert(c.aimTargetWorld.y>first.pos.y,'lead comes from the real weapon/projectile velocity');
 first.pos.x=1670;second.pos.x=1655;f.fighters();assert.equal(c.currentTargetShip,first,'nearby contacts cannot cause frame-to-frame target flipping');
 first.visibilityMask=0;first.visibilityOverflow='';f.fighters();assert.equal(c.currentTargetShip,second);
 second.isDocked=true;f.fighters();assert.equal(mode.state,'ESCORT');assert.equal(c.currentTargetShip,null);
 const gunship=f.decks.fighters.find(c=>c.spec.id===m.GLORIANA_CRAFT.thunderhawk);
 gunship.pos.set(1000,500);gunship.facingRad=0;f.enemy.pos.set(2200,500);f.enemy.vel.set(0,40);
 for(const w of gunship.weapons)w.spec={...w.spec,range:1600};f.fighters();
 assert.equal(gunship.currentTargetShip,f.enemy);assert(gunship.aimTargetWorld.y>f.enemy.pos.y);
 assert(gunship.isFiringMain,'extended actual weapon range replaces the fixed 790-unit trigger');
});
test('aviation: shared threat ranking rejects decoys and receding missiles while recall closes PD acquisition',()=>{
 const f=flightFixture(),c=f.decks.fighters[0],mode=f.decks.fighterAIModes.get(c.id);
 c.pos.set(1300,0);c.facingRad=0;
 const missile={id:910,sourceShipId:f.enemy.id,teamId:f.enemy.teamId,isRocket:true,pos:new m.Vector2(1650,0),vel:new m.Vector2(-200,0),rangeRemaining:2000,radius:10,hitpoints:200,flightTimeRemaining:10};
 const falseContacts=[{...missile,id:911,isFlare:true},{...missile,id:912,vel:new m.Vector2(200,0)},{...missile,id:913,isDisarmed:true},{...missile,id:914,hitpoints:0}];
 f.fighters(30,falseContacts);assert.equal(mode.state,'ESCORT');assert(!f.shots.some(p=>p.sourceShipId===c.id));
 c.pos.set(1300,0);c.facingRad=0;f.carrier.fighterRecall=true;f.fighters(30,[missile]);
 assert.equal(mode.state,'ESCORT');assert(c.aiHoldOffensiveFire);assert(!f.shots.some(p=>p.sourceShipId===c.id),'PD must not bypass the specialist recall gate');
 f.carrier.fighterRecall=false;c.pos.set(1300,0);c.facingRad=0;for(let i=0;i<180&&!f.shots.some(p=>p.sourceShipId===c.id);i++)f.fighters(1,[...falseContacts,missile]);
 assert.equal(mode.state,'INTERCEPT');assert(f.shots.some(p=>p.sourceShipId===c.id));
});
test('aviation: full-world friendly and asteroid obstruction survives specialist target filtering',()=>{
 const f=flightFixture(),b=f.decks.bombers[0];
 // Hold at the new target hull's launch station so this tests obstruction, not an emergency turn-away.
 b.pos.set(f.enemy.pos.x-f.enemy.spec.collisionRadius-800,0);b.facingRad=0;f.enemy.shield.isActive=false;
 const blocker=new m.Ship('friendly-fireline-blocker',m.modManager.requireShip('web_zhuyuan'),true,new m.Vector2(1750,0),0);
 f.extraShips.push(blocker);f.bombers(30);assert(b.weapons.every(w=>w.ammo===1));
 assert(b.weapons.some(w=>w.fireControl?.reason==='FRIENDLY_BLOCKED'),'friendly retained in shot obstruction roster');
 f.extraShips.length=0;f.asteroids.push({id:999,pos:new m.Vector2(1750,0),vel:new m.Vector2(),radius:160,hp:1000});
 f.bombers(30);assert(b.weapons.every(w=>w.ammo===1));assert(b.weapons.some(w=>w.fireControl?.reason==='OBSTACLE_BLOCKED'));
 f.asteroids.length=0;f.bombers(120);assert(b.weapons.every(w=>w.ammo===0),'removing physical blockers restores real torpedo launch');
});
test('aviation: shield-window hold cannot retarget an unshielded ship or revive a missing authorized contact',()=>{
 const f=flightFixture(),b=f.decks.bombers[0];b.pos.set(1300,0);b.facingRad=0;
 f.enemy.shield.isActive=true;f.enemy.shield.currentArcDeg=360;f.enemy.shield.facingAngleRad=Math.PI;
 const tempting=new m.Ship('unshielded-alternate',m.modManager.requireShip('web_zhuyuan'),false,new m.Vector2(1750,80),Math.PI);
 tempting.shield.isActive=false;f.extraShips.push(tempting);f.bombers(120);
 assert.equal(f.decks.bomberAIModes.get(b.id).state,'ESCORT');assert(b.weapons.every(w=>w.ammo===1));assert.equal(b.currentTargetShip,null);
 f.enemy.shield.isActive=false;f.fx.findHostile=()=>undefined;b.pos.set(1300,0);b.facingRad=0;f.bombers(60);
 assert(b.weapons.every(w=>w.ammo===1));assert.equal(b.currentTargetShip,null,'no fallback resurrection when a real target service returns no contact');
 // After a second of guarding a lost contact, allow a physical turn back onto the narrow launch arc.
 f.fx.findHostile=()=>f.enemy;f.bombers(300);assert(b.weapons.every(w=>w.ammo===0),'restored target must resume the strike: '+JSON.stringify({pos:b.pos,facing:b.facingRad,mode:f.decks.bomberAIModes.get(b.id),mounts:b.weapons.map(w=>({ammo:w.ammo,state:w.firingState,control:w.fireControl}))}));
 assert(f.shots.filter(p=>p.sourceShipId===b.id).every(p=>p.targetShipId===f.enemy.id),'authorized target remains the missile lock');
});

checkGlorianaFeedback(m,test,fit);
if(process.argv.includes('--siege-visuals')){await (await import('./lib/gloriana-siege-visual-check.mjs')).runSiegeVisualCheck();process.exit(0);}
if(tiersOnly){await writeFile(resolve(out,'verification-tiers.json'),JSON.stringify({scope:'gloriana-shipborne-tier-promotion',results,op:fit.op},null,2));console.log('PASS tier promotion');process.exit(0);}
if(process.argv.includes('--logic-only')){await writeFile(resolve(out,feedbackOnly?'verification-feedback.json':loadoutsOnly?'verification-loadouts.json':repairOnly?'verification-repair.json':'verification-logic.json'),JSON.stringify({scope:feedbackOnly?'local-part-feedback':loadoutsOnly?'loadout-branches-v2':repairOnly?'fixed-aircraft-and-module-propulsion':aviationOnly?'aviation':'full-logic',results,counts,op:fit.op,firing,repairMeasurements,loadoutMeasurements},null,2));console.log('PASS logic-only');process.exit(0);}
if(feedbackOnly){await writeFile(resolve(out,'verification-feedback.json'),JSON.stringify({scope:'local-part-feedback',results},null,2));await (await import('./lib/gloriana-feedback-visual-check.mjs')).runGlorianaFeedbackCheck();process.exit(0);}
if(loadoutsOnly){await (await import('./lib/gloriana-loadout-visual-check.mjs')).runGlorianaLoadoutCheck();process.exit(0);}
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PACKAGE||'playwright');
const server=await createServer({server:{host:'127.0.0.1',port:0,open:false,watch:null}});await server.listen();await server.watcher.close();
let browser,page;const errors=[],failedAssets=[];let combat;
try{
 browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 page=await browser.newPage({viewport:{width:1600,height:1100}});page.setDefaultTimeout(60000);
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&r.url().includes('web_gloriana'))failedAssets.push(r.url());});
 if(!aviationOnly){
 await page.goto(server.resolvedUrls.local[0]+'?view=design');
 await page.locator('#refit-hull-search').fill('荣光');await page.locator('button[data-hull-id="web_gloriana"]').click();
 const builtinRow=id=>page.locator('.refit-mod-row.builtin[data-inspect-mod="'+id+'"]');
 const checkBuiltins=async ids=>{
  assert.equal(await page.locator('.refit-mod-row.builtin').count(),ids.length);
  for(const id of ids){const row=builtinRow(id);assert(await row.isVisible());assert.equal(await row.locator('button').count(),0);assert.equal(await row.locator('b').innerText(),'内置');}
 };
 await checkBuiltins(m.GLORIANA_CORE_BUILTINS);
 await page.screenshot({path:resolve(out,'builtins-core.png'),animations:'disabled'});
 assert.equal(await page.locator('.refit-mod-row.builtin').count(),3);
 await builtinRow(m.GLORIANA_BUILTINS.voidShield).hover();
 const builtinDetail=page.locator('[data-equipment-tooltip]').filter({hasText:'四层全向虚空盾'});
 await builtinDetail.waitFor({state:'visible'});assert((await builtinDetail.innerText()).includes('96000'));
 await page.screenshot({path:resolve(out,'builtins-shield-detail.png'),animations:'disabled'});
 await page.locator('#refit-hull-search').focus();await page.locator('#refit-hull-search').hover();await builtinDetail.waitFor({state:'hidden'});
 const sprites=()=>page.locator('.studio-ship img[src*="/weapons/web_gloriana/"]');
 assert.equal(await sprites().count(),0);
 await page.getByRole('button',{name:/装配方案/}).click();
 await page.getByRole('button',{name:'预览装配方案：'+m.GLORIANA_ARSENAL_FIT,exact:true}).click();
 await page.locator('.source-fit-footer').getByRole('button',{name:/取消/}).click();
 await page.locator('.source-variant-picker').waitFor({state:'detached'});
 assert.equal(await sprites().count(),0,'preview/cancel modified the live design');
 await page.getByRole('button',{name:/装配方案/}).click();
 await page.getByRole('button',{name:'预览装配方案：'+m.GLORIANA_ARSENAL_FIT,exact:true}).click();
 await page.locator('.source-fit-footer').getByRole('button',{name:/确认/}).click();
 await page.locator('.source-variant-picker').waitFor({state:'detached'});
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('.studio-ship img[src*="/weapons/web_gloriana/"]')).filter(i=>i.complete&&i.naturalWidth>0).length===48);
 await page.screenshot({path:resolve(out,'refit.png'),animations:'disabled'});console.log('PASS preview cancel + confirmed 48 sprites');
 await page.getByRole('button',{name:/撤消/}).click();assert.equal(await sprites().count(),0,'Undo did not restore old fit');
 await page.getByRole('button',{name:/装配方案/}).click();
 await page.getByRole('button',{name:'预览装配方案：'+m.GLORIANA_ARSENAL_FIT,exact:true}).click();
 await page.locator('.source-fit-footer').getByRole('button',{name:/确认/}).click();
 await page.locator('.source-variant-picker').waitFor({state:'detached'});
 // Explicit user-style plugin install; the preset itself remains unchanged.
 await page.getByLabel('载荷容存器',{exact:true}).fill('0');await page.getByLabel('耗散通道',{exact:true}).fill('16');
 const openMods=async()=>{await page.getByRole('button',{name:/安装舰船插件/}).click();await page.getByRole('searchbox',{name:'搜索舰船插件'}).fill('荣光');};
 const modButton=id=>page.locator('button[data-inspect-mod="'+id+'"]');
 const closeMods=()=>page.locator('button[aria-controls="refit-mod-picker"]').click();
 await openMods();
 assert.equal(await page.locator('button[data-inspect-mod^="web_gloriana_"]').count(),3);
 for(const id of Object.values(m.GLORIANA_BUILTINS))assert.equal(await modButton(id).count(),0);
 assert.equal(await modButton(mods.loader).getAttribute('aria-disabled'),'true');
 await modButton(mods.sanctuary).click();assert.equal(await modButton(mods.sanctuary).getAttribute('aria-pressed'),'true');
 assert.equal(await modButton(mods.flightline).getAttribute('aria-disabled'),'true');
 assert((await page.locator('[data-void-shield-refit]').innerText()).includes('72000'));
 await page.screenshot({path:resolve(out,'hullmods-core-picker.png'),animations:'disabled'});
 await closeMods();await page.getByRole('button',{name:/撤消/}).click();assert((await page.locator('[data-void-shield-refit]').innerText()).includes('96000'));
 await openMods();await modButton(mods.flightline).click();assert.equal(await modButton(mods.flightline).getAttribute('aria-pressed'),'true');
 assert.equal(await modButton(mods.sanctuary).getAttribute('aria-disabled'),'true');await modButton(mods.flightline).click();await modButton(mods.sanctuary).click();await closeMods();
 await page.getByRole('button',{name:/改装模块.*左动力舱/}).press('Enter');
 await checkBuiltins(m.GLORIANA_ENGINE_BUILTINS);
 await page.screenshot({path:resolve(out,'builtins-engine.png'),animations:'disabled'});
 await page.getByRole('button',{name:/改装模块.*左前炮廊/}).press('Enter');
 await checkBuiltins(m.GLORIANA_BATTERY_BUILTINS);
 await page.screenshot({path:resolve(out,'builtins-battery.png'),animations:'disabled'});
 await openMods();assert.equal(await modButton(mods.sanctuary).getAttribute('aria-disabled'),'true');await modButton(mods.loader).click();
 assert.equal(await modButton(mods.loader).getAttribute('aria-pressed'),'true');await page.screenshot({path:resolve(out,'hullmods-module-picker.png'),animations:'disabled'});
 await closeMods();await page.keyboard.press('Escape');
 await checkBuiltins(m.GLORIANA_CORE_BUILTINS);
 results.push('Refit: shield + ordnance + bulkheads with core/battery/engine scope, no redundant entries');console.log('PASS '+results.at(-1));
 results.push('Refit exclusive plugins: scope/OP/conflicts/install/undo and shield preview');console.log('PASS '+results.at(-1));
 await page.getByRole('button',{name:/模拟战斗/}).click();
 await page.locator('.simulation-deployment').getByRole('button',{name:'取消',exact:true}).click();await page.keyboard.press('Tab');
 await page.waitForFunction(()=>window.__combatReadView?.playerShip?.weapons.length===12);
 await page.waitForFunction(()=>!!window.__combatSession?.workerHost);
 await page.keyboard.press('Space');await page.evaluate(()=>window.__combatSession.barrier());
 combat=await page.evaluate(()=>({core:window.__combatReadView.playerShip.weapons.map(w=>({id:w.spec.id,slot:w.slotId,ammo:w.ammo})),worker:!!window.__combatSession.workerHost,renderer:window.__combatRenderer?.constructor.name}));
 const liveShield=await page.evaluate(()=>window.__combatSession.workerHost.latest.presentation.view.playerShip.shield.voidShield);assert.equal(liveShield.integrityPerLayer,18000);assert.equal(liveShield.rechargePerSecond,5200);assert.equal(liveShield.restartDelay,5);combat.hullmodShield=liveShield;
 assert.equal(combat.core.filter(w=>w.id==='web_gloriana_torpedo').length,2);assert(combat.core.filter(w=>w.id==='web_gloriana_torpedo').every(w=>w.ammo===8));
 assert((await page.getByRole('status',{name:'内置插件状态'}).innerText()).includes('封舱储备 9/9'));
 await page.screenshot({path:resolve(out,'worker-combat.png'),animations:'disabled'});
 await page.evaluate(()=>{window.__armoryStep=async (frames,aim,firing=true)=>{
  const s=window.__combatSession,h=s.workerHost,p=window.__combatReadView.playerShip;
  const sample={autopilot:false,blocked:false,keys:{},aim:aim??[p.pos.x+Math.cos(p.facingRad)*5000,p.pos.y+Math.sin(p.facingRad)*5000],firing,mouseSteering:false,pointerActive:true};
  let frame;for(let i=0;i<frames;i++)frame=await h.step(sample);s.acceptWorkerFrame(h,frame);
  return {glow:h.latest.presentation.view.playerShip.weapons.filter(w=>w.spec.id==='web_gloriana_lance').map(w=>w.glowAlpha),beams:h.latest.presentation.view.beams.filter(b=>b.specId==='web_gloriana_lance').length};
 };});
 const charging=await page.evaluate(()=>window.__armoryStep(45));assert(charging.glow.every(a=>a>.45&&a<.8),JSON.stringify(charging));assert.equal(charging.beams,0);
 await page.screenshot({path:resolve(out,'worker-charging.png'),animations:'disabled'});
 const active=await page.evaluate(()=>window.__armoryStep(38));assert(active.beams>=2);
 await page.screenshot({path:resolve(out,'worker-firing.png'),animations:'disabled'});
 combat.charging=charging;combat.active=active;
 const recoil=await page.evaluate(async()=>{
  const s=window.__combatSession;const ack=await s.dispatchControl({kind:'ship',command:{kind:'module',value:1}});
  if(!ack.accepted)throw Error(ack.reason);await s.dispatchControl({kind:'ship',command:{kind:'group',value:0}});
  const id=window.__combatReadView.weaponShip.id,p=s.workerHost.latest.presentation.view.ships.find(p=>p.id===id);
  const gun=p.weapons.find(w=>w.spec.id==='web_gloriana_macro');if(!gun)throw Error('module has no macro');
  const facing=p.facingRad+gun.baseAngleDeg*Math.PI/180;
  // Loader makes the .25s preparation .3125s; observe AFTER its real slower first shot.
  await window.__armoryStep(22,[p.pos.x+Math.cos(facing)*5000,p.pos.y+Math.sin(facing)*5000]);
  return s.workerHost.latest.presentation.view.ships.find(p=>p.id===id).weapons.filter(w=>w.spec.id==='web_gloriana_macro').map(w=>w.recoil);
 });
 assert(recoil.some(r=>r>.1),JSON.stringify(recoil));combat.recoil=recoil;
 await page.screenshot({path:resolve(out,'worker-recoil.png'),animations:'disabled'});
 await page.evaluate(async()=>{
  const s=window.__combatSession;
  for(const command of [{kind:'module',value:0},{kind:'group',value:2}]){const ack=await s.dispatchControl({kind:'ship',command});if(!ack.accepted)throw Error(ack.reason);}
  window.__rackState=()=>{
   const p=s.workerHost.latest.presentation.view.playerShip;
   return p.weapons.filter(w=>w.spec.id==='web_gloriana_torpedo').map(w=>({slot:w.slotId,levels:[...w.loadedMissileLevels],ammo:window.__combatReadView.playerShip.weapons.find(h=>h.slotId===w.slotId).ammo}));
  };
  window.__rackUntil=async(ammo,max=1300)=>{
   for(let i=0;i<max;i++){await window.__armoryStep(1);const state=window.__rackState();if(state.every(w=>w.ammo===ammo))return state;if(state.some(w=>w.ammo<ammo))throw Error('skipped desired rack ammo '+JSON.stringify(state));}
   throw Error('rack fire timeout '+JSON.stringify(window.__rackState()));
  };
 });
 const racks={loaded:await page.evaluate(()=>window.__rackState())};assert(racks.loaded.every(w=>w.ammo===8&&w.levels.every(l=>l===1)));
 racks.single=await page.evaluate(()=>window.__rackUntil(7));assert(racks.single.every(w=>w.levels[0]===0&&w.levels[1]===1));
 await page.screenshot({path:resolve(out,'worker-torpedo-single.png'),animations:'disabled'});
 assert.deepEqual(await page.evaluate(()=>window.__rackState()),racks.single,'paused wall-clock changed the rack');
 racks.empty=await page.evaluate(()=>window.__rackUntil(6));assert(racks.empty.every(w=>w.levels.every(l=>l===0)));
 await page.screenshot({path:resolve(out,'worker-torpedo-empty.png'),animations:'disabled'});
 await page.evaluate(()=>window.__armoryStep(475,undefined,false));racks.reloading=await page.evaluate(()=>window.__rackState());
 assert(racks.reloading.every(w=>w.ammo===6&&w.levels.every(l=>l>.4&&l<.6)),JSON.stringify(racks.reloading));
 await page.screenshot({path:resolve(out,'worker-torpedo-reloading.png'),animations:'disabled'});
 await page.evaluate(()=>window.__armoryStep(40,undefined,false));racks.reloaded=await page.evaluate(()=>window.__rackState());
 assert(racks.reloaded.every(w=>w.ammo===6&&w.levels.every(l=>l===1)));
 await page.screenshot({path:resolve(out,'worker-torpedo-reloaded.png'),animations:'disabled'});
 racks.exhausted=await page.evaluate(()=>window.__rackUntil(0,1800));assert(racks.exhausted.every(w=>w.levels.every(l=>l===0)));
 await page.evaluate(()=>window.__armoryStep(600));assert.deepEqual(await page.evaluate(()=>window.__rackState()),racks.exhausted);
 await page.screenshot({path:resolve(out,'worker-torpedo-exhausted.png'),animations:'disabled'});
 combat.racks=racks;
 results.push('Worker real twin-rail shots, paused single, empty, reload, 8-round exhaustion');
 console.log('PASS '+results.at(-1));
 const bulkheadWorker=await page.evaluate(async()=>{
  const {LocalWorkerHost}=await import('/src/engine/runtime/local/LocalWorkerHost.ts');
  const {createFleetMember}=await import('/src/engine/game/CombatHandoff.ts');
  const player=createFleetMember('web_gloriana','seal-test-player');player.hullFraction=.39;
  const enemy=createFleetMember('hammerhead','seal-test-enemy');
  const host=new LocalWorkerHost({playerHull:'web_gloriana',enemyHull:'hammerhead',seed:4291,multicore:false,presentation:'render-strict',
   content:window.__combatSession.workerHost.checkpoint().config.content,
   encounter:{id:'gloriana-seal-check',kind:'sandbox',seed:4291,playerFleet:[player],enemyFleet:[enemy]}});
  try{
   await host.ready;
   const sample={autopilot:false,blocked:true,keys:{},aim:[0,-5000],firing:false,mouseSteering:false,pointerActive:false};
   const read=()=>{const p=host.latest.presentation.hud.read.playerShip;return {status:p.system.passiveStatusText,hull:p.hullHp,hardFlux:p.flux.hardFlux,maxFlux:p.flux.maxFlux};};
   const before=read();await host.step(sample);const active=read();
   for(let i=0;i<180;i++)await host.step(sample);const halfway=read();
   for(let i=0;i<190;i++)await host.step(sample);const after=read();
   for(let i=0;i<60;i++)await host.step(sample);const stillSpent=read();
   return {before,active,halfway,after,stillSpent};
  }finally{host.dispose();}
 });
 assert.match(bulkheadWorker.active.status,/封舱 核心 6.0s.*储备8\/9/);assert(bulkheadWorker.active.hardFlux>=bulkheadWorker.active.maxFlux*.24);
 assert.match(bulkheadWorker.halfway.status,/封舱 核心 3.0s/);assert.match(bulkheadWorker.after.status,/封舱储备 8\/9/);assert.match(bulkheadWorker.stillSpent.status,/封舱储备 8\/9/);
 combat.bulkheadWorker=bulkheadWorker;results.push('Fresh Worker damaged-fleet deployment: automatic seal, real hard-flux cost, HUD countdown and one-shot expiry');console.log('PASS '+results.at(-1));

 }
 combat??={};
 await page.goto(server.resolvedUrls.local[0]+'?view=design');
 await page.locator('#refit-hull-search').fill('荣光');await page.locator('button[data-hull-id="web_gloriana"]').click();
 const chooseAviation=async()=>{await page.getByRole('button',{name:/装配方案/}).click();await page.getByRole('button',{name:'预览装配方案：'+m.GLORIANA_AVIATION_FIT,exact:true}).click();};
 const beforeAviation=await page.locator('[data-deck-index]').evaluateAll(ns=>ns.map(n=>n.getAttribute('aria-label')));
 await chooseAviation();await page.locator('.source-fit-footer').getByRole('button',{name:/取消/}).click();await page.locator('.source-variant-picker').waitFor({state:'detached'});
 assert.deepEqual(await page.locator('[data-deck-index]').evaluateAll(ns=>ns.map(n=>n.getAttribute('aria-label'))),beforeAviation);
 await chooseAviation();await page.locator('.source-fit-footer').getByRole('button',{name:/确认/}).click();await page.locator('.source-variant-picker').waitFor({state:'detached'});
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('.refit-fighter-decks img[src*="/aviation/"]')).filter(i=>i.complete&&i.naturalWidth>0).length===15);
 await page.screenshot({path:resolve(out,'aviation-refit.png'),animations:'disabled'});
 await page.locator('[data-deck-index="0"]').click();await page.locator('[data-wing-choice="web_gloriana_starhawk_wing"]').hover();
 await page.locator('[data-equipment-tooltip]').filter({hasText:'星鹰'}).waitFor({state:'visible'});
 await page.screenshot({path:resolve(out,'aviation-lpc.png'),animations:'disabled'});
 await page.getByRole('button',{name:'关闭战机选择',exact:true}).click();
 await page.getByRole('button',{name:/撤消/}).click();assert.deepEqual(await page.locator('[data-deck-index]').evaluateAll(ns=>ns.map(n=>n.getAttribute('aria-label'))),beforeAviation);
 await chooseAviation();await page.locator('.source-fit-footer').getByRole('button',{name:/确认/}).click();await page.locator('.source-variant-picker').waitFor({state:'detached'});
 await page.locator('[data-deck-index="0"]').click();await page.locator('[data-wing-choice="broadsword_wing"]').click();
 // Selecting a wing closes the picker; restore it via existing Undo, not a migration.
 await page.locator('.source-wing-picker').waitFor({state:'detached'});
 assert((await page.locator('[data-deck-index="0"]').getAttribute('aria-label')).includes('阔剑'));
 await page.getByRole('button',{name:/撤消/}).click();assert((await page.locator('[data-deck-index="0"]').getAttribute('aria-label')).includes('狂怒'));
 await page.getByRole('button',{name:/模拟战斗/}).click();await page.locator('.simulation-deployment').getByRole('button',{name:'取消',exact:true}).click();await page.keyboard.press('Tab');
 await page.waitForFunction(()=>!!window.__combatSession?.workerHost&&window.__combatReadView?.playerShip?.spec?.fighterWings?.some(w=>w.specId==='web_gloriana_fury'));
 await page.keyboard.press('Space');await page.evaluate(()=>window.__combatSession.barrier());
 combat.aviation=await page.evaluate(async()=>{
  const s=window.__combatSession,h=s.workerHost,view=h.latest.presentation.view;
  const collect=()=>h.latest.presentation.view.ships.filter(c=>c.teamId===view.playerShip.teamId&&['web_gloriana_fury','web_gloriana_starhawk','web_gloriana_thunderhawk'].includes(c.spec.id));
  const start=collect().map(c=>({id:c.id,spec:c.spec.id,sprite:c.spec.spriteUrl,engines:c.spec.engineSlots.length,size:c.spec.spriteHeight,pos:[c.pos.x,c.pos.y]}));
  const sample={autopilot:false,blocked:false,keys:{},aim:[0,-5000],firing:false,mouseSteering:false,pointerActive:false};
  let frame;for(let i=0;i<180;i++)frame=await h.step(sample);s.acceptWorkerFrame(h,frame);
  const after=collect().map(c=>({id:c.id,pos:[c.pos.x,c.pos.y]}));return {start,after,worker:h.status};
 });
 assert.equal(combat.aviation.start.length,15);assert.deepEqual([...new Set(combat.aviation.start.map(c=>c.size))].sort((a,b)=>a-b),[96,128,144]);assert.equal(combat.aviation.worker,'ready');assert(combat.aviation.start.every(c=>c.sprite.includes('/aviation/')));
 assert(combat.aviation.after.some(c=>{const old=combat.aviation.start.find(o=>o.id===c.id);return old&&Math.hypot(c.pos[0]-old.pos[0],c.pos[1]-old.pos[1])>20;}));
 assert(!(await page.locator('body').innerText()).includes('web_gloriana_fury'));
 await page.screenshot({path:resolve(out,'aviation-worker.png'),animations:'disabled'});
 results.push('Aviation headless refit cancel/apply/undo, native LPC interchange, approved sprites and 15 actual Worker craft');console.log('PASS '+results.at(-1));
 assert.deepEqual(errors,[]);assert.deepEqual(failedAssets,[]);results.push(aviationOnly?'Headless aviation scenario completed without browser/asset errors':'Headless refit cancel/apply/undo, 48 loaded sprites, real Worker combat');
 console.log('PASS '+results.at(-1));
}catch(error){await page?.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});await writeFile(resolve(out,'failure.txt'),String(error)+'\n'+await page?.locator('body').innerText().catch(()=>''));throw error;}finally{await browser?.close();await server.close();}
await writeFile(resolve(out,aviationOnly?'verification-aviation.json':'verification.json'),JSON.stringify({results,counts,op:aviationOnly?aviation.op:fit.op,firing,combat,errors,failedAssets},null,2));
console.log(JSON.stringify({passed:results.length,op:aviationOnly?aviation.op:fit.op,firing,combat},null,2));
