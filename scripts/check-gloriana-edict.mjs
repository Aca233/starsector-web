/** Real module/stat/weapon paths, one bounded exclusive-system regression. */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const out=resolve('artifacts/gloriana');await mkdir(out,{recursive:true});const file=resolve(out,'edict-check.mjs');
await build({stdin:{contents:`
export {qualifiedFireTargets} from './src/engine/ai/QualifiedFireTargets';
export {CombatEngine} from './src/engine/simulation/CombatEngine';
export {CapitalShipAI} from './src/engine/ai/CapitalShipAI';
export {avoidCollisions,forwardPathClear} from './src/engine/ai/TacticalNavigation';
export {createGlorianaAviationDesign} from './src/studio/GlorianaLoadouts';
export * from './src/engine/content/GlorianaPack';
export * from './src/engine/extensions/ship-systems/GlorianaEdict';
export { Ship } from './src/engine/simulation/Ship';
export { SimulationRandom } from './src/engine/simulation/SimulationRandom';
export { Vector2 } from './src/engine/math/Vector2';
export { modManager } from './src/engine/modding/ModManager';
export { assetManager } from './src/engine/assets/AssetResolver';
export { RenderShipProjection } from './src/engine/runtime/local/RenderShipProjection';
export { hasNativeSystemStats,hasNativeThreatPhaseAI } from './src/engine/extensions/ship-systems/Registry';
export { captureCombat,applyCombatSnapshot } from './src/network/AuthorityCombatSnapshot';
export { createDesign,evaluate } from './src/studio/DesignModel';
`,resolveDir:process.cwd(),loader:'ts'},outfile:file,bundle:true,platform:'node',format:'esm',target:'node22',define:{'import.meta.env':'{"BASE_URL":"/","DEV":false}','__LAN_BUILD_ID__':'"gloriana-edict-test"'},logLevel:'warning'});
const m=await import(pathToFileURL(file).href),hull=m.modManager.requireShip(m.GLORIANA_HULL_ID);
await m.assetManager.loadManifest('data:application/json;base64,'+Buffer.from(await readFile('public/game-assets/asset-manifest.json')).toString('base64'));
const ship=()=>new m.Ship('edict-unit',hull,true,new m.Vector2(),0,new m.SimulationRandom(17));
const child=(s,id)=>s.childModules.find(c=>c.moduleMount.slotId===id);
const full=(s,side='P')=>{s.aimTargetWorld.set(0,side==='P'?-1000:1000);assert(s.system.activate());s.system.update(.8);};
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const results=[];function test(name,fn){fn();results.push(name);console.log('PASS '+name);}
test('exclusive install, default skill, existing icon and projection gates',()=>{
 m.modManager.validateShipDefinition(hull,{allowExistingId:true,requireBundledAssets:true});assert.equal(hull.systemType,m.GLORIANA_EDICT_ID);
 const design=m.createDesign('hammerhead');design.systemTypes=[m.GLORIANA_EDICT_ID];assert(m.evaluate(design).errors.some(e=>e.includes('荣光女王')));
 assert(m.glorianaEdict.installReason(hull.modules[0].spec));assert(m.hasNativeSystemStats(ship().system.definition));assert(!m.hasNativeThreatPhaseAI(ship().system.definition));
 const s=ship();assert.equal(s.system.enableOwnedNativeModifiers(),false);assert.equal(child(s,'P1').system.enableOwnedNativeModifiers(),false);
 const projection=new m.RenderShipProjection();assert(projection.supports(s.assemblyShips));assert(projection.project(s).system.available);
});
test('centerline and unusable selected batteries reject without costs or cooldown',()=>{
 const s=ship();s.aimTargetWorld.set(1000,0);assert(!s.system.activate());near(s.system.reservedFluxCost,0);assert.equal(s.system.state,'IDLE');
 s.aimTargetWorld.set(0,-1000);for(const id of ['P1','P2','P3'])for(const w of child(s,id).weapons)w.isDisabled=true;
 assert(!s.system.activate());assert(s.system.activationFailureReason.includes('左舷'));near(s.system.reservedFluxCost,0);
 const p=child(s,'P2');p.weapons[0].isDisabled=false;p.weapons[0].ammo=0;assert(!s.system.activate());p.weapons[0].ammo=10;
 assert(s.system.activate());near(s.system.reservedFluxCost,3600);assert(!s.system.activate());near(s.system.reservedFluxCost,3600);
});
test('latches side in activation coordinates; only selected gun decks receive buffs',()=>{
 const s=ship();full(s);const p=child(s,'P1'),other=child(s,'S1');assert.equal(m.lockedBroadside(s.system),'P');
 s.facingRad=Math.PI;s.aimTargetWorld.set(0,1000);
 near(p.system.getWeaponRateOfFireMultiplier('BALLISTIC'),1.75);near(p.system.getWeaponRangePercent('BALLISTIC'),15);near(p.system.getWeaponFluxCostMultiplier('BALLISTIC'),1.25);near(p.system.getDissipationMultiplier(),.7);
 near(other.system.getWeaponRateOfFireMultiplier('BALLISTIC'),.65);near(other.system.getWeaponFluxCostMultiplier('BALLISTIC'),1);
 near(p.system.getWeaponRateOfFireMultiplier('ENERGY'),1);near(p.system.getAmmoRegenMultiplier('BALLISTIC'),1);near(s.system.getWeaponRateOfFireMultiplier('BALLISTIC'),1);near(child(s,'EP').system.getWeaponRateOfFireMultiplier('BALLISTIC'),1);
 near(s.system.getSpeedPercentBonus(),-40);near(s.system.getTurnRatePercentBonus(),-60);
 const neighbor=ship();near(child(neighbor,'P1').system.getWeaponRateOfFireMultiplier('BALLISTIC'),1);
 p.hullHp=0;near(child(s,'P2').system.getWeaponRateOfFireMultiplier('BALLISTIC'),1.75);near(p.system.getWeaponRateOfFireMultiplier('BALLISTIC'),1);
 assert(s.system.statusText.includes('2/3'));assert.equal(m.lockedBroadside(s.system),'P');
 const r=ship();r.facingRad=Math.PI/2;r.aimTargetWorld.set(-1000,0);assert(r.system.activate());r.system.update(.8);assert.equal(m.lockedBroadside(r.system),'S');near(child(r,'S2').system.getWeaponRateOfFireMultiplier('BALLISTIC'),1.75);
});
test('local overload, core vent/death/disable, reset and expiry never leave stale bonuses',()=>{
 const s=ship();full(s);const p=child(s,'P2');p.flux.isOverloaded=true;near(p.system.getWeaponRateOfFireMultiplier('BALLISTIC'),1);p.flux.isOverloaded=false;
 s.flux.isVenting=true;near(p.system.getWeaponRateOfFireMultiplier('BALLISTIC'),1);m.glorianaEdict.onAdvance(s,1/60,{},s.system);assert.equal(s.system.state,'OUT');s.flux.isVenting=false;near(p.system.getWeaponRateOfFireMultiplier('BALLISTIC'),1);assert(s.system.statusText.includes('敕令中止'));s.system.update(1);assert.equal(s.system.state,'COOLDOWN');near(s.system.cooldownTimer,20);
 near(p.system.getWeaponRateOfFireMultiplier('BALLISTIC'),1);near(s.system.getSpeedPercentBonus(),0);s.flux.isVenting=false;s.system.reset();full(s,'S');
 s.system.disabled=true;near(child(s,'S2').system.getWeaponRateOfFireMultiplier('BALLISTIC'),1);s.system.disabled=false;s.hullHp=0;near(child(s,'S2').system.getWeaponRateOfFireMultiplier('BALLISTIC'),1);s.hullHp=hull.hitpoints;
 s.isRetreated=true;near(child(s,'S2').system.getWeaponRateOfFireMultiplier('BALLISTIC'),1);s.isRetreated=false;s.system.reset();near(child(s,'S2').system.getWeaponRateOfFireMultiplier('BALLISTIC'),1);
 full(s);s.system.update(7);near(p.system.getWeaponRateOfFireMultiplier('BALLISTIC'),1);near(child(s,'S2').system.getWeaponRateOfFireMultiplier('BALLISTIC'),1);assert.equal(s.system.state,'COOLDOWN');assert(s.assemblyShips.every(c=>c.runtimeModifiers.empty));
});
function engine(){const e=new m.CombatEngine(hull.id,'paragon',9617);e.asteroids.length=0;e.nebulae.length=0;const s=e.playerShip,t=e.enemyShip;s.pos.set(0,0);s.facingRad=0;s.syncModuleTree(true);t.pos.set(0,-850);t.hullDamageSuppressed=true;for(const w of t.weapons)w.isDisabled=true;s.aimTargetWorld.copy(t.pos);return e;}
const active=engine();assert(active.playerShip.system.activate());active.fixedUpdate(1/60);
test('actual authority tick pays hard flux once and applies staged modifiers',()=>{
 assert(active.playerShip.flux.hardFlux>3500&&active.playerShip.flux.hardFlux<=3600);near(active.playerShip.system.reservedFluxCost,0);
 assert(child(active.playerShip,'P1').system.getWeaponRateOfFireMultiplier('BALLISTIC')>1);assert.equal(active.playerShip.flux.isEngineBoostActive,false);
 active.playerShip.flux.hardFlux=active.playerShip.flux.softFlux=0;active.playerShip.flux.zeroFluxTimer=99;active.playerShip.flux.isEngineBoostActive=true;active.fixedUpdate(1/60);
 assert.equal(active.playerShip.flux.isEngineBoostActive,false);near(active.playerShip.flux.zeroFluxTimer,0);
});
test('presentation snapshot preserves selected side, module relations and stat queries',()=>{
 const frame=m.captureCombat(active,1,{0:0},0),viewer=engine();m.applyCombatSnapshot(viewer,JSON.parse(JSON.stringify(frame)),true);
 assert.equal(m.lockedBroadside(viewer.playerShip.system),'P');near(child(viewer.playerShip,'P1').system.getWeaponRateOfFireMultiplier('BALLISTIC'),child(active.playerShip,'P1').system.getWeaponRateOfFireMultiplier('BALLISTIC'));
 assert.equal(child(viewer.playerShip,'P1').parentShip,viewer.playerShip);
 // This snapshot is presentation-only: never advance the restored engine.
});
function salvo(boost){const e=engine(),s=e.playerShip,t=e.enemyShip;if(boost)assert(s.system.activate());const projectiles=new Set();for(let tick=0;tick<360;tick++){t.pos.set(0,-850);t.vel.set(0,0);e.fixedUpdate(1/60);for(const p of e.projectiles)if(s.childModules.some(c=>c.moduleMount.slotId.startsWith('P')&&c.id===p.sourceShipId))projectiles.add(p.id);}return {shots:projectiles.size,flux:child(s,'P1').flux.totalFlux};}
const baseline=salvo(false),boosted=salvo(true);
test('actual guns emit more projectiles under the edict, rather than only changing HUD',()=>{assert(boosted.shots>baseline.shots,JSON.stringify({baseline,boosted}));assert(boosted.flux>baseline.flux);});
test('AI uses a ready broadside firing window and does not spam into cooldown',()=>{
 const e=engine(),s=e.playerShip,t=e.enemyShip;for(const c of s.childModules)for(const w of c.weapons){w.currentAngleRad=-Math.PI/2;w.cooldownTimer=0;}
 m.glorianaEdict.advanceAI({ship:s,target:t,distance:850,angleDiff:-Math.PI/2});assert(s.system.isActive);const serial=s.system.activationSerial;
 m.glorianaEdict.advanceAI({ship:s,target:t,distance:850,angleDiff:-Math.PI/2});assert.equal(s.system.activationSerial,serial);
});

test('own attached modules never cause false navigation danger; external ships/modules/asteroids still do',()=>{
 const s=ship(),desired=new m.Vector2(20,0),world={ships:s.assemblyShips,asteroids:[],projectiles:[],beams:[]};
 assert.equal(m.avoidCollisions(s,desired,world).avoiding,false);
 assert(m.forwardPathClear(s,world,28,3));
 const part=child(s,'P1');assert.equal(m.avoidCollisions(part,desired,world).avoiding,false,'child must also ignore parent/siblings');
 for(const friendly of [true,false]) {
  const other=new m.Ship('external-'+friendly,m.modManager.requireShip('hammerhead'),friendly,new m.Vector2(100,0),0);
  const external={...world,ships:[...world.ships,other]};
  assert(m.avoidCollisions(s,desired,external).avoiding,'independent hull still requires avoidance');
  assert(!m.forwardPathClear(s,external,28,3));
 }
 const other=ship();other.id='foreign-assembly';const otherPart=child(other,'S1');otherPart.pos.set(100,0);
 assert(m.avoidCollisions(s,desired,{...world,ships:[...world.ships,otherPart]}).avoiding,'other assembly module is still solid');
 const asteroid={hp:100,pos:new m.Vector2(100,0),vel:new m.Vector2(),radius:120};
 assert(m.avoidCollisions(s,desired,{...world,asteroids:[asteroid]}).avoiding);
});
test('AI still refuses actual collision/withdrawal/waypoint, excess flux and broken gun decks',()=>{
 const ready=()=>{const e=engine();for(const c of e.playerShip.childModules)for(const w of c.weapons){w.currentAngleRad=-Math.PI/2;w.cooldownTimer=0;}return e;};
 for(const reason of ['avoidingCollision','withdrawing','waypoint']) {
  const e=ready(),s=e.playerShip;
  m.glorianaEdict.advanceAI({ship:s,target:e.enemyShip,distance:850,angleDiff:-Math.PI/2,tactical:{[reason]:true}});
  assert(!s.system.isActive,reason);assert.equal(s.system.reservedFluxCost,0);
 }
 for(const state of ['flux','overloaded','venting','sealed','broken']) {
  const e=ready(),s=e.playerShip;
  if(state==='flux')s.flux.hardFlux=s.flux.maxFlux*.7;
  if(state==='overloaded')s.flux.isOverloaded=true;
  if(state==='venting')s.flux.isVenting=true;
  if(state==='sealed'||state==='broken')for(const c of s.childModules.filter(c=>c.moduleMount.slotId.startsWith('P'))){
   if(state==='broken')c.hullHp=0;else c.runtimeModifiers.set('acceptance-seal',{disableWeapons:1});
  }
  m.glorianaEdict.advanceAI({ship:s,target:e.enemyShip,distance:850,angleDiff:-Math.PI/2});
  assert(!s.system.isActive,state);assert.equal(s.system.reservedFluxCost,0);
 }
});
const integratedAI={activations:[],boostedFrames:0,framesWithoutAvoidance:0};
test('real 60Hz fleet AI activates and applies edict without manual F or turret pre-alignment',()=>{
 const e=new m.CombatEngine(hull.id,'onslaught',260927);e.switchPlayerShip(m.evaluate(m.createGlorianaAviationDesign()).spec,'onslaught');
 e.asteroids.length=0;e.nebulae.length=0;e.openBattlefield=true;
 const s=e.playerShip;s.pos.set(0,0);s.prevPos.copy(s.pos);s.facingRad=-Math.PI/2;s.syncModuleTree(true);
 e.enemyShip.pos.set(2000,-700);e.enemyShip.prevPos.copy(e.enemyShip.pos);e.enemyShip.facingRad=Math.PI;e.initFighters();
 for(const [i,id] of ['onslaught','dominator','dominator'].entries())e.addShip(id,false,new m.Vector2(1900+Math.floor((i+1)/3)*600,((i+1)%3-1)*850),Math.PI);
 s.fireControlMode='AI';const ai=new m.CapitalShipAI(s,e.enemyShip);let serial=s.system.activationSerial,locked;
 for(let frame=0;frame<3600&&!e.battleResult;frame++) {
  e.updateShipAI(ai,1/60);
  if(!s.tacticalAI?.avoidingCollision)integratedAI.framesWithoutAvoidance++;
  if(s.system.activationSerial!==serial) {
   assert(!s.tacticalAI?.avoidingCollision,'must not ignore real collision danger');
   const side=m.lockedBroadside(s.system);assert(side==='P'||side==='S');
   assert.equal(side,m.broadsideAt(s.currentTargetShip.pos,s.pos,s.facingRad));
   integratedAI.activations.push({time:+e.combatTime.toFixed(3),side,reservedFlux:s.system.reservedFluxCost});
   assert(s.system.reservedFluxCost>0);locked=side;serial=s.system.activationSerial;
  }
  e.fixedUpdate(1/60);
  if(s.system.isActive&&s.system.effectLevel>0&&s.system.activationInput) {
   assert.equal(m.lockedBroadside(s.system),locked,'AI may not switch an accepted broadside');
   if(s.childModules.some(c=>c.moduleMount.slotId.startsWith(locked)&&c.system.getWeaponRateOfFireMultiplier('BALLISTIC')>1))integratedAI.boostedFrames++;
  }
 }
 integratedAI.seconds=+e.combatTime.toFixed(3);
 assert(integratedAI.activations.length>=1,JSON.stringify(integratedAI));
 assert(integratedAI.boostedFrames>60,'real module boost must advance for longer than one second');
 for(let i=1;i<integratedAI.activations.length;i++)assert(integratedAI.activations[i].time-integratedAI.activations[i-1].time>=20,'no cooldown bypass');
});
await writeFile(resolve(out,'edict-verification.json'),JSON.stringify({passed:true,tests:results,baseline,boosted,integratedAI,snapshot:'presentation-only; not a resumable checkpoint',dualDeviceTest:false},null,2)+'\n');


