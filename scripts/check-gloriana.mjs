/** Focused integration through the real registry, refit compiler and combat engine. */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const out=resolve('artifacts/gloriana');await mkdir(out,{recursive:true});
const bundle=resolve(out,'integration.mjs');
await build({stdin:{contents:`
export * from './src/engine/content/GlorianaPack';
export * from './src/engine/content/ModuleGeometry';
export { modManager } from './src/engine/modding/ModManager';
export { assetManager } from './src/engine/assets/AssetResolver';
export { pickCombatContact,lockedCombatTarget } from './src/engine/runtime/CombatTargeting';
export { dispatchShipCommand,shipCommandFailure } from './src/engine/runtime/CombatCommands';
export { HullPortraitProjector } from './src/engine/runtime/HullPortraitView';
export { TacticalMapViewProjector } from './src/engine/runtime/TacticalMapView';
export { CombatHudProjector } from './src/engine/runtime/CombatHudView';
export * from './src/engine/runtime/ModuleFireControl';
export { applyCombatControlSample,applyCombatControlCommand } from './src/engine/runtime/CombatControl';
export { hullPortraitLayout,pickHullPortraitPart } from './src/ui/hud/HullPortraitPainter';
export { copyAcceptedWorkerInput } from './src/network/LanPresentationWorkerProtocol';
export { CombatEngine } from './src/engine/simulation/CombatEngine';
export { CapitalShipAI } from './src/engine/ai/CapitalShipAI';
export { Vector2 } from './src/engine/math/Vector2';
export { isPointInPolygon } from './src/engine/math/Geometry';
export { createDesign,evaluate,decodeDesign,registerPrototype,hulls,isBuiltIn,moduleDesignContext,withModuleDesign,withWeapon,withWing,designWingSlots,budget } from './src/studio/DesignModel';
`,loader:'ts',resolveDir:process.cwd()},outfile:bundle,bundle:true,platform:'node',format:'esm',target:'node22',define:{'import.meta.env.BASE_URL':'"/"'},logLevel:'warning'});
const m=await import(pathToFileURL(bundle).href);
const manifest=JSON.parse(await readFile('public/game-assets/asset-manifest.json'));
await m.assetManager.loadManifest('data:application/json;base64,'+Buffer.from(JSON.stringify(manifest)).toString('base64'));
const hull=m.modManager.requireShip(m.GLORIANA_HULL_ID),parts=m.assemblyParts(hull);
const geometry=JSON.parse(await readFile('src/engine/content/gloriana-geometry.json'));
const results=[];function test(name,fn){fn();results.push(name);console.log('PASS '+name);}
for(const a of manifest.filter(a=>a.path.includes('web_gloriana/'))){const bytes=await readFile(resolve('public/game-assets',a.path));assert.equal(bytes.length,a.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),a.hash);}
test('registered nine-part assembly, all 48 removable mounts, strict asset closure',()=>{
 m.modManager.validateShipDefinition(hull,{allowExistingId:true,requireBundledAssets:true});
 assert.equal(parts.length,9);assert.equal(parts.reduce((n,p)=>n+p.spec.weaponSlots.length,0),48);
 assert.equal(m.hulls.filter(h=>h.id.startsWith('web_gloriana')).length,1);
 for(const p of parts)for(const s of p.spec.weaponSlots)assert.equal(m.isBuiltIn(p.spec.id,s.slotId),false);
 assert.equal(hull.systemType,m.GLORIANA_EDICT_ID);
 assert.deepEqual(['EXTRA_LARGE','LARGE','MEDIUM'].map(size=>hull.weaponSlots.filter(s=>s.slotSize===size).length),[2,4,6]);
 assert.equal(hull.fighterBays,6);assert.equal(hull.fighterWings.length,6);assert.equal(hull.fighterWings.reduce((n,w)=>n+w.count,0),16);
 assert(hull.weaponSlots.filter(s=>s.slotSize==='EXTRA_LARGE').every(s=>s.mountType==='HARDPOINT'&&s.weaponType==='ENERGY'&&s.arcDeg===30));
 assert.equal(hull.defaultWeaponGroups[0].isAutofire,false);assert(!hull.sourceHullTraits?.includes('vastbulk'));
});
test('every mount preserves source position and belongs to its own collision polygon',()=>{
 for(const p of parts){assert(p.spec.bounds.every(([x,y])=>Math.hypot(x,y)<=p.spec.collisionRadius));for(const slot of p.spec.weaponSlots){
  const source=geometry.mounts.find(m=>m.id===slot.slotId);assert(source);assert.equal(p.x+slot.x,768-source.y);assert.equal(p.y+slot.y,source.x-512);
  assert(m.isPointInPolygon(slot,p.spec.bounds),'outside polygon: '+slot.slotId);
 }}
 assert.equal(geometry.mounts.filter(m=>m.added).length,20);
});
const d=m.createDesign(hull.id);let evaluated=m.evaluate(d);
test('root and all module default fits have legal independent OP budgets',()=>{
 assert.deepEqual(evaluated.errors,[]);
 for(const module of hull.modules){const c=m.moduleDesignContext(d,[module.slotId]);assert(c);assert.deepEqual(m.evaluate(c.draft,c.template).errors,[]);assert(m.budget(c.draft).remaining>=0);}
});
test('new mount can be removed, saved and restored without changing another module',()=>{
 const owner=geometry.mounts.find(m=>m.id==='S11').owner;
 const c=m.moduleDesignContext(d,[owner]);const changed=m.withWeapon(c.draft,'S11',null);
 const next=m.decodeDesign(JSON.parse(JSON.stringify(m.withModuleDesign(d,[owner],changed))));
 const result=m.evaluate(next);assert.deepEqual(result.errors,[]);
 assert.equal(result.spec.modules.find(s=>s.slotId===owner).spec.weaponSlots.find(s=>s.slotId==='S11').defaultWeaponId,undefined);
 assert.equal(result.spec.modules.find(s=>s.slotId==='S3').spec.weaponSlots.find(s=>s.slotId==='S12').defaultWeaponId,'vulcan');
 assert.equal(m.modManager.requireShip(m.registerPrototype(next)).modules.length,8);
});
test('core weapons and six removable wings share legal OP and survive save roundtrip',()=>{
 assert.equal(m.budget(d).remaining,67);
 const changed=m.withWing(m.withWeapon(d,'L13',null),0,'dagger_wing');
 const restored=m.decodeDesign(JSON.parse(JSON.stringify(changed)));
 const result=m.evaluate(restored);assert.deepEqual(result.errors,[]);
 assert.equal(result.spec.weaponSlots.find(s=>s.slotId==='L13').defaultWeaponId,undefined);
 assert.equal(result.spec.fighterWings[0].specId,'dagger');assert.equal(result.spec.fighterWings[1].specId,'broadsword');
 const empty=m.createDesign(hull.id,'empty');assert.equal(m.designWingSlots(empty).length,6);assert(m.designWingSlots(empty).every(w=>w===null));
 // Older user designs remain valid, but new mounts/decks stay empty rather than overwriting their fit.
 const old=JSON.parse(JSON.stringify(d));old.wings=[];
 for(const id of ['L13','L14','M12','M13','M14','S15','S16','S17','S18','S19','S20'])delete old.weapons[id];
 old.groups=old.groups.map(g=>({...g,weaponSlotIds:g.weaponSlotIds.filter(id=>id in old.weapons)}));
 const oldFit=m.evaluate(m.decodeDesign(old));assert.deepEqual(oldFit.errors,[]);assert.equal(oldFit.spec.fighterWings.length,0);
 assert.equal(oldFit.spec.weaponSlots.find(s=>s.slotId==='L13').defaultWeaponId,undefined);
});
const flightEngine=new m.CombatEngine(hull.id,'paragon',428),carrier=flightEngine.playerShip;
flightEngine.asteroids.length=0;flightEngine.nebulae.length=0;
carrier.pos.set(0,0);carrier.facingRad=0;carrier.syncModuleTree(true);flightEngine.enemyShip.pos.set(6000,0);
for(const w of flightEngine.enemyShip.weapons)w.isDisabled=true;
const wingCraft=()=>[...flightEngine.fighters,...flightEngine.bombers].filter(c=>c.sourceCarrier===carrier&&!c.isDead);
let rearmed=false,mainShots=0;
test('actual six decks launch sixteen craft and accept authoritative recall',()=>{
 assert.equal(flightEngine.playerWings.length,6);assert.equal(wingCraft().length,16);
 assert.equal(wingCraft().filter(c=>c.spec.id==='broadsword').length,6);
 assert.equal(wingCraft().filter(c=>c.spec.id==='longbow').length,4);
 assert.equal(wingCraft().filter(c=>c.spec.id==='dagger').length,6);
 assert(m.dispatchShipCommand(carrier,{kind:'recall'}).accepted);assert(carrier.fighterRecall);
 assert.equal(new m.CombatHudProjector().capture(flightEngine).playerWings.length,6);
 assert(m.dispatchShipCommand(carrier,{kind:'recall'}).accepted);assert(!carrier.fighterRecall);
});
test('spent bomber enters return/dock/rearm loop on the Gloriana carrier',()=>{
 const bomber=wingCraft().find(c=>c.spec.id==='dagger'),mode=flightEngine.bomberAIModes.get(bomber.id);
 for(const w of bomber.weapons)if(w.spec.maxAmmo!==undefined)w.ammo=0;
 mode.hasTorpedo=false;mode.state='RETURN_TO_REARM';bomber.pos.set(-120,0);bomber.vel.set(0,0);
 flightEngine.fixedUpdate(1/60);assert.equal(mode.state,'DOCKED');
 for(let i=0;i<400&&!mode.hasTorpedo;i++)flightEngine.fixedUpdate(1/60);
 assert(mode.hasTorpedo);assert.notEqual(mode.state,'DOCKED');
 assert(bomber.weapons.filter(w=>w.spec.maxAmmo!==undefined).every(w=>w.ammo===w.spec.maxAmmo));rearmed=true;
});
test('forward battery waits for manual input then fires real plasma projectiles',()=>{
 carrier.aimTargetWorld.set(1200,0);carrier.isFiringMain=false;
 assert(!flightEngine.projectiles.some(p=>p.sourceShipId===carrier.id&&['L13','L14'].includes(p.slotId)));
 carrier.isFiringMain=true;carrier.selectedGroupIndex=0;
 const shots=new Set();for(let i=0;i<100;i++){flightEngine.fixedUpdate(1/60);for(const p of flightEngine.projectiles)if(p.sourceShipId===carrier.id&&['L13','L14'].includes(p.slotId))shots.add(p.id);}
 mainShots=shots.size;assert(mainShots>=2,'manual forward battery did not emit both plasma shots');carrier.isFiringMain=false;
});
test('destroyed carrier cannot replenish a queued wing loss',()=>{
 const craft=wingCraft()[0],wing=flightEngine.playerWings.find(w=>w.wingId===craft.flightDeckWingId);craft.hullHp=0;
 for(let i=0;i<3&&!wing.rebuildQueue.length;i++)flightEngine.fixedUpdate(1/60);assert(wing.rebuildQueue.length>0);
 const pending=wing.rebuildQueue[0];pending.timer=.03;
 carrier.hullHp=0;flightEngine.fixedUpdate(1/60);const survivors=wingCraft().map(c=>c.id);
 for(let i=0;i<5;i++)flightEngine.fixedUpdate(1/60);
 assert(carrier.isDead);assert(wingCraft().every(c=>survivors.includes(c.id)));
});
const engine=new m.CombatEngine(hull.id,'paragon',72861);engine.asteroids.length=0;engine.nebulae.length=0;
const own=engine.playerShip,enemy=engine.enemyShip;own.pos.set(0,0);own.facingRad=0;own.syncModuleTree(true);enemy.pos.set(0,-850);enemy.facingRad=0;enemy.hullDamageSuppressed=true;
for(const s of enemy.assemblyShips)for(const w of s.weapons)w.isDisabled=true;
test('complete HUD/map assembly portraits preserve independent damage and omit missing modules',()=>{
 const projector=new m.HullPortraitProjector(),hud=new m.CombatHudProjector();
 const subject=new m.CombatEngine(hull.id,'paragon',93),root=subject.playerShip,child=root.childModules[0];
 root.pos.set(410,-230);root.facingRad=.87;root.syncModuleTree(true);
 const before=projector.capture(root,subject.ships);assert.equal(before.length,9);
 assert.deepEqual(hud.capture(subject).playerShip.hullPortrait.map(p=>p.id),root.assemblyShips.map(s=>s.id));
 for(const p of before){const actual=root.assemblyShips.find(s=>s.id===p.id);assert.equal(p.spec.spriteUrl,actual.spec.spriteUrl);}
 const local=m.moduleOffset(child.moduleMount),part=before.find(p=>p.id===child.id);
 assert(Math.abs(part.x-local.x)<1e-6&&Math.abs(part.y-local.y)<1e-6);
 const original=part.armor.cells[0];child.armor.setCell(0,0,0);child.hullHp/=2;
 const damaged=projector.capture(root,subject.ships).find(p=>p.id===child.id);
 assert.equal(damaged.armor.cells[0],0);assert.equal(part.armor.cells[0],original);assert.equal(damaged.hullHp,child.hullHp);
 assert.equal(before[0].armor.cells[0],root.armor.copyCells()[0]);
 child.isDead=true;assert(projector.capture(root,subject.ships).find(p=>p.id===child.id).isDead);
 assert.equal(projector.capture(root,subject.ships.filter(s=>s!==child)).length,8);
 assert.equal(projector.capture(child,subject.ships).length,1,'locked submodule must not masquerade as full parent');
 subject.toggleTacticalMap();const map=new m.TacticalMapViewProjector().capture(subject).map;
 assert.equal(map.playerShip.hullSprites.length,9);
 assert.equal(map.capitalShips.find(s=>s.id===root.id).hullSprites.length,8);
 assert(!map.capitalShips.find(s=>s.id===root.id).hullSprites.some(p=>p.id===child.id));
 assert(!('armor' in map.capitalShips.find(s=>s.id===root.id).hullSprites[0]));
 assert.equal(map.playerShip.hullPortrait.length,9);assert(map.playerShip.hullPortrait.find(p=>p.id===child.id).isDead);
 assert.equal(m.assemblySpriteLayout(hull).parts.length,9);
});
const shots=new Set(),firingModules=new Set();
test('hull targeting prioritizes real surfaces, respects edge tolerance and excludes skeletons',()=>{
 const contact=(id,x,bounds,extra={})=>({...enemy,id,pos:new m.Vector2(x,0),prevPos:new m.Vector2(x,0),facingRad:0,prevFacingRad:0,
  spec:{...enemy.spec,bounds,collisionRadius:200,builtInHullMods:[],hullMods:[]},isVisibleTo:()=>true,...extra});
 const core=contact('core',0,[[-20,-5],[20,-5],[20,5],[-20,5]]);
 const module=contact('module',40,[[-20,-10],[20,-10],[20,10],[-20,10]]);
 const point=new m.Vector2(25,8);
 assert.equal(m.pickCombatContact([core,module],own,point,50,true),module);
 assert.equal(m.pickCombatContact([core,module],own,new m.Vector2(0,90),10,true),null);
 assert.equal(m.pickCombatContact([module],own,new m.Vector2(65,0),5,true),module);
 assert.equal(m.pickCombatContact([module],own,new m.Vector2(65.1,0),5,true),null);
 module.isDead=true;assert.equal(m.pickCombatContact([module],own,point,50,true),null);module.isDead=false;
 module.isVisibleTo=()=>false;assert.equal(m.pickCombatContact([module],own,point,50,true),null);module.isVisibleTo=()=>true;
 module.spec.builtInHullMods=['vastbulk'];assert.equal(m.pickCombatContact([module],own,point,50,true),null);
 assert.equal(m.lockedCombatTarget([module],{...own,playerTargetId:module.id}),null);
 // Facing crosses PI at the render interpolation midpoint, while position also moves.
 core.prevFacingRad=170*Math.PI/180;core.facingRad=-170*Math.PI/180;core.pos.set(20,0);
 assert.equal(m.pickCombatContact([core],own,new m.Vector2(-8,0),0,true,.5),core);
 assert.equal(m.pickCombatContact([core],own,new m.Vector2(10,18),0,true,.5),null);
 assert.equal(m.pickCombatContact([core],own,new m.Vector2(NaN,0),50,true),null);
});
test('actual rotating module assembly supports local selection without steering the aim',()=>{
 const targetEngine=new m.CombatEngine('paragon',hull.id,43),target=targetEngine.enemyShip,observer=targetEngine.playerShip;
 target.pos.set(800,600);target.facingRad=1.2;target.syncModuleTree(true);target.prevPos.copy(target.pos);target.prevFacingRad=target.facingRad;
 const part=target.childModules.find(s=>s.moduleMount.slotId==='P1'),slot=part.spec.weaponSlots.find(s=>s.slotSize==='EXTRA_LARGE');
 const point=new m.Vector2(slot.x,slot.y).rotate(part.facingRad).add(part.pos);
 assert.equal(m.pickCombatContact(target.assemblyShips,observer,point,0,true),part);
 assert(m.dispatchShipCommand(observer,{kind:'target'},point,target.assemblyShips).accepted);assert.equal(observer.playerTargetId,part.id);
 assert.equal(observer.aimTargetWorld.x,point.x);assert.equal(observer.aimTargetWorld.y,point.y);
 assert(m.dispatchShipCommand(observer,{kind:'target'},point,target.assemblyShips).accepted);assert.equal(observer.playerTargetId,null);
});
test('module hangars accept immediate assembly recall and publish HUD wing identities',()=>{
 const stationEngine=new m.CombatEngine('station1_hightech','astral',91),station=stationEngine.playerShip;
 const carriers=station.assemblyShips.filter(s=>s.hullStats.fighterBays>0&&s.spec.fighterWings?.length);
 assert.equal(station.hullStats.fighterBays,0);assert(carriers.length>0);
 assert.equal(m.shipCommandFailure(station,{kind:'recall'}),undefined);
 assert(m.dispatchShipCommand(station,{kind:'recall'}).accepted);assert(station.fighterRecall);assert(carriers.every(s=>s.fighterRecall));
 assert(!stationEngine.enemyShip.fighterRecall);
 assert(m.dispatchShipCommand(station,{kind:'recall'}).accepted);assert(carriers.every(s=>!s.fighterRecall));
 const ids=m.assemblyShipIds(station.id,station.spec);assert.deepEqual(ids,station.assemblyShips.map(s=>s.id));
 const hud=new m.CombatHudProjector().capture(stationEngine);
 assert(hud.playerWings.some(w=>ids.includes(w.carrierId)&&w.carrierId!==station.id));
 assert(hud.ships.every(s=>Number.isFinite(s.prevFacingRad)));
 for(const s of carriers)s.isDead=true;
 assert.match(m.shipCommandFailure(station,{kind:'recall'}),/存活模块/);assert(!m.dispatchShipCommand(station,{kind:'recall'}).accepted);
 assert(carriers.every(s=>!s.fighterRecall));
});
test('actual simulation fires from fixed modules and preserves attachment poses',()=>{
 for(let i=0;i<300;i++){own.throttle=1;engine.fixedUpdate(1/60);for(const p of engine.projectiles)if(p.sourceShipId.startsWith(own.id+':module:')){shots.add(p.id);firingModules.add(p.sourceShipId);}}
 assert(shots.size>0,'no module projectiles');assert(firingModules.size>=2,'only one module fired');assert.equal(own.childModules.length,8);assert(!own.isStation);assert(!own.isDead);
 for(const s of own.childModules){const off=m.moduleOffset(s.moduleMount);assert(Math.hypot(s.pos.x-own.pos.x-off.x,s.pos.y-own.pos.y-off.y)<.01);}
 const engines=own.childModules.filter(s=>s.spec.inheritParentEngineCommands);assert.equal(engines.length,2);assert(engines.every(s=>s.engineStatuses.some(e=>e.currentThrust>.8)));
});
test('destroyed module stops firing; core lives until its own destruction',()=>{
 const destroyed=own.childModules.find(s=>s.moduleMount.slotId==='P1');destroyed.hullHp=0;engine.fixedUpdate(1/60);assert(destroyed.isDead);assert(!own.isDead);
 const previous=new Set(engine.projectiles.map(p=>p.id));for(let i=0;i<60;i++)engine.fixedUpdate(1/60);
 assert(!engine.projectiles.some(p=>p.sourceShipId===destroyed.id&&!previous.has(p.id)));
 own.hullHp=0;engine.fixedUpdate(1/60);assert(own.isDead);assert(own.childModules.every(s=>s.isDead));
 assert.equal(engine.shipLossNotifications.filter(n=>n.teamId===own.teamId).length,1);
});
test('module fire-control authority isolates trigger, weapon groups and main-hull commands',()=>{
 const sim=new m.CombatEngine(hull.id,'paragon',894),root=sim.playerShip;
 const ai=new m.CapitalShipAI(root,sim.enemyShip),ids=m.assemblyShipIds(root.id,root.spec);
 const child=root.childModules.find(s=>s.moduleMount.slotId==='P1'),index=ids.indexOf(child.id);
 const select=value=>m.applyCombatControlCommand(sim,{kind:'ship',command:{kind:'module',value}});
 const sample={autopilot:false,blocked:false,keys:{KeyW:true},aim:[0,-1300],firing:true,mouseSteering:false,pointerActive:true};
 assert(select(index).accepted);assert.equal(m.manualWeaponShip(root,sim.ships),child);
 assert.equal(root.fireControlMode,'MANUAL');assert.equal(child.fireControlMode,'MANUAL');
 assert(root.childModules.filter(s=>s!==child).every(s=>s.fireControlMode==='AI'));
 const time=sim.combatTime;assert(select(index).accepted);assert.equal(sim.combatTime,time,'edge command advanced time');
 for(const bad of [-1,128,1.2,NaN,999]){assert(!select(bad).accepted);assert.equal(m.manualWeaponShip(root,sim.ships),child);}
 const rootGroups=JSON.stringify(root.weaponGroups),peerGroups=JSON.stringify(root.childModules.filter(s=>s!==child).map(s=>s.weaponGroups));
 const groups=child.weaponGroups.filter(g=>g.weaponSlotIds.length),group=groups.at(-1);
 for(const kind of ['group','mode','autofire'])assert(m.dispatchShipCommand(root,{kind,value:group.index}).accepted);
 assert.equal(child.weaponGroups[child.selectedGroupIndex].index,group.index);assert.equal(JSON.stringify(root.weaponGroups),rootGroups);
 assert.equal(JSON.stringify(root.childModules.filter(s=>s!==child).map(s=>s.weaponGroups)),peerGroups);
 const view=new m.CombatHudProjector().capture(sim);assert.equal(view.weaponShip.id,child.id);assert.deepEqual(view.weaponShip.weapons.map(w=>w.slotId),child.weapons.map(w=>w.slotId));assert.equal(view.playerShip.id,root.id);
 m.applyCombatControlSample(sim,ai,1/60,sample);assert.equal(root.throttle,1);assert(!root.isFiringMain);assert(child.isFiringMain);assert.deepEqual([child.aimTargetWorld.x,child.aimTargetWorld.y],sample.aim);
 const childShield=child.shield.isRaiseRequested,rootShield=root.shield.isRaiseRequested;assert(m.dispatchShipCommand(root,{kind:'shield'}).accepted);assert.equal(root.shield.isRaiseRequested,!rootShield);assert.equal(child.shield.isRaiseRequested,childShield);
 root.aimTargetWorld.copy(root.pos).add(new m.Vector2(0,-1000).rotate(root.facingRad));
 const childSystemState=child.system.state;assert(m.dispatchShipCommand(root,{kind:'system',value:0}).accepted);assert.notEqual(root.system.state,'IDLE');assert.equal(child.system.state,childSystemState);
 root.flux.softFlux=1000;assert(m.dispatchShipCommand(root,{kind:'vent'}).accepted);assert(root.flux.isVenting);assert(!child.flux.isVenting);
 for(const kind of ['stop-firing','clear-input','toggle-map']){child.isFiringMain=true;assert(m.applyCombatControlCommand(sim,{kind}).accepted);assert(!child.isFiringMain);}
 if(sim.isTacticalMap)sim.toggleTacticalMap();child.isFiringMain=true;m.applyCombatControlSample(sim,ai,1/60,{...sample,blocked:true});assert(!child.isFiringMain);assert.equal(root.throttle,0);
 m.applyCombatControlSample(sim,ai,1/60,sample);assert(child.isFiringMain);assert(select(0).accepted);assert.equal(child.fireControlMode,'AI');assert(!child.isFiringMain);
 assert(select(index).accepted);const peer=root.childModules.find(s=>s!==child&&s.weapons.length);assert(select(ids.indexOf(peer.id)).accepted);assert.equal(child.fireControlMode,'AI');assert.equal(peer.fireControlMode,'MANUAL');
 peer.hullHp=0;assert.equal(m.manualWeaponShip(root,sim.ships),root);m.applyCombatControlSample(sim,ai,1/60,{...sample,firing:false});assert.equal(peer.fireControlMode,'AI');assert(!select(ids.indexOf(peer.id)).accepted);
 assert(select(index).accepted);assert(m.applyCombatControlCommand(sim,{kind:'pilot',autopilot:true}).accepted);assert.equal(child.fireControlMode,'AI');assert(!select(index).accepted);
 assert(m.applyCombatControlCommand(sim,{kind:'pilot',autopilot:false}).accepted);assert(select(index).accepted);child.isDocked=true;assert.equal(m.manualWeaponShip(root,sim.ships),root);assert(!select(index).accepted);child.isDocked=false;
 root.childModules.splice(root.childModules.indexOf(child),1);assert.equal(m.moduleWeaponCandidate(root,index),undefined);assert(!select(index).accepted);
 assert.equal(m.manualWeaponShip(root,sim.ships.filter(s=>s!==child)),root);
});
test('manual module survives the AI phase and emits only the selected non-autofire group',()=>{
 const sim=new m.CombatEngine(hull.id,'paragon',998),root=sim.playerShip,target=sim.enemyShip;
 sim.asteroids.length=0;sim.nebulae.length=0;root.pos.set(0,0);root.facingRad=0;root.syncModuleTree(true);
 target.pos.set(0,-900);target.hullDamageSuppressed=true;for(const w of target.weapons)w.isDisabled=true;
 const child=root.childModules.find(s=>s.moduleMount.slotId==='P1'),ai=new m.CapitalShipAI(root,target);
 const group=child.weaponGroups.find(g=>g.weaponSlotIds.some(id=>child.weapons.find(w=>w.slotId===id)?.spec.mountSize==='EXTRA_LARGE'));
 assert(group);for(const g of child.weaponGroups)g.isAutofire=false;
 const sample={autopilot:false,blocked:false,keys:{},aim:[target.pos.x,target.pos.y],firing:true,mouseSteering:false,pointerActive:true};
 assert(m.dispatchShipCommand(root,{kind:'module',value:m.assemblyShipIds(root.id,root.spec).indexOf(child.id)}).accepted);
 assert(m.dispatchShipCommand(root,{kind:'group',value:group.index}).accepted);
 const fired=new Set();for(let i=0;i<150;i++){
  m.applyCombatControlSample(sim,ai,1/60,sample);sim.fixedUpdate(1/60);
  assert.equal(child.fireControlMode,'MANUAL');assert(!root.isFiringMain);
  for(const p of sim.projectiles)if(p.sourceShipId===child.id)fired.add(p.slotId);
 }
 assert(fired.size>0,'selected manual battery emitted no real projectile');assert([...fired].every(id=>group.weaponSlotIds.includes(id)));
 assert(root.childModules.filter(s=>s!==child).every(s=>s.fireControlMode==='AI'));
 m.applyCombatControlCommand(sim,{kind:'stop-firing'});assert(!child.isFiringMain);
 child.hullHp=0;sim.fixedUpdate(1/60);assert.equal(new m.CombatHudProjector().capture(sim).weaponShip.id,root.id);
 root.hullHp=0;m.applyCombatControlSample(sim,ai,1/60,sample);assert(root.childModules.every(s=>s.fireControlMode==='AI'));
});
test('portrait polygon picking matches drawing through facing and independent module rotation',()=>{
 const sim=new m.CombatEngine(hull.id,'paragon',58),root=sim.playerShip;
 root.facingRad=.79;root.syncModuleTree(true);
 const portrait=new m.HullPortraitProjector().capture(root,sim.ships),{cx,cy,scale}=m.hullPortraitLayout(portrait,135,135),facing=root.facingRad+Math.PI/2;
 for(const part of portrait){
  const ship=root.assemblyShips.find(s=>s.id===part.id),slot=ship.spec.weaponSlots[0];assert(slot);
  const localX=slot.y,localY=-slot.x,c=Math.cos(part.angle),s=Math.sin(part.angle);
  const x=(part.y+localX*c-localY*s-cx)*scale,y=(-part.x+localX*s+localY*c-cy)*scale;
  assert.equal(m.pickHullPortraitPart(portrait,135,135,facing,67.5+x*Math.cos(facing)-y*Math.sin(facing),67.5+x*Math.sin(facing)+y*Math.cos(facing))?.id,part.id);
 }
 assert.equal(m.pickHullPortraitPart(portrait,135,135,facing,0,0),undefined);
 const synthetic=[{...portrait[0],x:30,y:-18,angle:.61,bounds:[[-20,-10],[20,-10],[20,10],[-20,10]]}];
 const layout=m.hullPortraitLayout(synthetic,135,135),px=(synthetic[0].y-layout.cx)*layout.scale,py=(-synthetic[0].x-layout.cy)*layout.scale;
 assert.equal(m.pickHullPortraitPart(synthetic,135,135,facing,67.5+px*Math.cos(facing)-py*Math.sin(facing),67.5+px*Math.sin(facing)+py*Math.cos(facing))?.id,synthetic[0].id);
 synthetic[0].isDead=true;assert.equal(m.pickHullPortraitPart(synthetic,135,135,facing,67.5,67.5),undefined);
});
test('LAN presentation accepts bounded module indices and copies command edges',()=>{
 const input={seq:1,keys:0,aim:[1,2],firing:false,pointerActive:true,actions:[{id:2,kind:'module',value:3}]};
 const copied=m.copyAcceptedWorkerInput(input);assert.equal(copied.actions[0].value,3);input.actions[0].value=4;assert.equal(copied.actions[0].value,3);
 for(const value of [-1,128,.5,NaN,undefined])assert.throws(()=>m.copyAcceptedWorkerInput({...input,actions:[{id:2,kind:'module',value}]}));
});
await writeFile(resolve(out,'integration-verification.json'),JSON.stringify({passed:true,tests:results,mounts:48,added:20,parts:9,projectiles:shots.size,firingModules:firingModules.size,coreMounts:12,flightDecks:6,initialCraft:16,bomberRearmed:rearmed,manualPlasmaShots:mainShots,notDualDeviceTest:true},null,2)+'\n');

