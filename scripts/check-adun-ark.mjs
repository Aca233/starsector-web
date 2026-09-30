import {checkRetiredAdunArmory} from './lib/check-retired-adun-armory.mjs';
import {checkExtensionBallistics} from './lib/check-extension-ballistics.mjs';
/** Focused production acceptance, not an isolated mock combat implementation. */
import assert from 'node:assert/strict';import {build} from 'esbuild';import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
const out=resolve('artifacts/adun-ark');await mkdir(out,{recursive:true});const bundle=resolve(out,'check.mjs');
await build({plugins:[{name:'raw-json',setup(b){b.onLoad({filter:/simulation-variants\.json$/},async a=>({contents:await readFile(a.path,'utf8'),loader:'text'}));}}],stdin:{loader:'ts',resolveDir:process.cwd(),contents:"export * from './src/engine/content/AdunArkPack';\nexport * from './src/engine/content/AdunArkIds';\nexport * from './src/engine/content/AdunArkArmory';\nexport * from './src/engine/content/AdunArkAviation';\nexport * from './src/engine/content/AdunArkAircraftArt';\nexport * from './src/engine/visual/ArkAircraftFX';\nexport * from './src/engine/render/webgl/ArkAircraftFXRenderer';\nexport * from './src/engine/visual/AdunArkArt';\nexport * from './src/engine/visual/ArkExhaust';\nexport * from './src/engine/visual/ArkNativeField';\nexport * from './src/engine/visual/ArkLanceMotion';\nexport * from './src/engine/visual/ArkWeaponFX';\nexport * from './src/engine/visual/ArkSystemFX';\nexport * from './src/engine/extensions/HullMods';\nexport {RenderShipProjection} from './src/engine/runtime/local/RenderShipProjection';\nexport {ShipDisplayEncoder,ShipDisplayDecoder} from './src/network/display/ShipDisplayLane';\nexport * from './src/engine/render/webgl/ArkWeaponFXRenderer';\nexport {SHIELD_VISUAL_PROFILES} from './src/engine/visual/VisualProfiles';\nexport {renderShipEngines} from './src/engine/render/webgl/ShipEngineRenderer';\nexport * from './src/engine/content/WeaponSizes';\nexport {renderWeaponInstallations} from './src/engine/render/webgl/WeaponInstallationRenderer';\nexport {installationPose} from './src/engine/content/WeaponInstallation';\nexport {shipSystemDefinitions} from './src/engine/extensions/ship-systems/Registry';\nexport {extensionVariantsForHull} from './src/studio/ExtensionVariantCatalog';\nexport * from './src/studio/DesignModel';\nexport {removeRetiredAdunWeapons} from './src/studio/RetiredAdunWeapons';\nexport {contentRegistry} from './src/engine/content/ContentRegistry';\nexport * from './src/studio/SpearOfAdunLoadouts';\nexport * from './src/engine/runtime/ModuleFireControl';\nexport * from './src/engine/runtime/CombatCommands';\nexport * from './src/engine/extensions/ship-systems/AdunArkSystems';\nexport {Ship} from './src/engine/simulation/Ship';\nexport {spawnSystemProjectile} from './src/engine/extensions/ship-systems/SystemProjectile';\nexport {initializeSourceProjectile,hasSourceProjectileLifecycle} from './src/engine/simulation/systems/weapon/SourceProjectileLifecycle';\nexport {combatWeaponRange} from './src/engine/simulation/WeaponRange';\nexport {WebGLProjectilePass} from './src/engine/render/webgl/passes/WebGLProjectilePass';\nexport {modManager} from './src/engine/modding/ModManager';\nexport {assetManager} from './src/engine/assets/AssetResolver';\nexport {collectCombatTextureUrls} from './src/engine/assets/CombatAssetClosure';\nexport {CombatEngine} from './src/engine/simulation/CombatEngine';\nexport {Vector2} from './src/engine/math/Vector2';\nexport {flightFootprint} from './src/engine/simulation/systems/FlightFormation';\nexport {captureCombat,applyCombatSnapshot} from './src/network/AuthorityCombatSnapshot';\nexport {renderArkBody} from './src/engine/render/webgl/AdunArkRenderer';"},outfile:bundle,bundle:true,platform:'node',format:'esm',target:'node22',define:{'import.meta.env':'{"BASE_URL":"/","DEV":false}','__LAN_BUILD_ID__':'"ark-check"'},logLevel:'warning'});

const m=await import(pathToFileURL(bundle).href);await m.assetManager.loadManifest('data:application/json;base64,'+Buffer.from(await readFile('public/game-assets/asset-manifest.json')).toString('base64'));
const testFilter=process.env.ADUN_TEST_FILTER?new RegExp(process.env.ADUN_TEST_FILTER):null;
const results=[];const test=(name,fn)=>{if(testFilter&&!testFilter.test(name))return;fn();results.push(name);console.log('PASS '+name);};
const design=m.createAdunDesign(),runtime=m.registerPrototype(design),hull=m.modManager.requireShip(runtime);
const setup=()=>{const e=new m.CombatEngine(runtime,'web_sc2_hyperion',260928);e.openBattlefield=true;e.asteroids.length=0;e.nebulae.length=0;const s=e.playerShip,t=e.enemyShip;s.pos.set(0,0);s.prevPos.copy(s.pos);s.facingRad=s.prevFacingRad=0;s.syncModuleTree(true);s.aimTargetWorld.set(2000,0);t.pos.set(2000,0);t.prevPos.copy(t.pos);t.facingRad=t.prevFacingRad=Math.PI;t.vel.set(0,0);e.externallyControlledShipIds.add(t.id);for(const sys of t.allSystems)sys.disabled=true;for(const w of t.weapons)w.isDisabled=true;return e;};
const step=(e,n,fire=false)=>{for(let i=0;i<n;i++){m.applyModuleWeaponInput(e.playerShip,e.playerShip.aimTargetWorld,fire,true);e.fixedUpdate(1/60);}};
checkExtensionBallistics(m,test,setup,out);
test('five real combat modules, 13 calibrated weapons and 4 mixed removable decks',()=>{assert.equal(hull.sourceHullId,m.ADUN_ARK_ID);assert.equal(hull.modules.length,4);assert.equal(hull.modules.reduce((n,p)=>n+p.spec.weaponSlots.length,0),13);assert.equal(hull.modules.reduce((n,p)=>n+(p.spec.fighterBays??0),0),4);assert.equal(hull.weaponSlots.length,0);for(const size of m.WEAPON_SIZES)for(const other of m.WEAPON_SIZES)assert.equal(m.weaponFitsSlotSize(size,other),size===other);const fore=hull.modules.find(p=>p.slotId==='FORE').spec;assert.equal(fore.weaponSlots.find(s=>s.slotId==='FORE_PROJECTOR').mountType,'HARDPOINT');assert(m.isBuiltIn(fore.sourceHullId,'FORE_PROJECTOR'));assert.equal(m.modManager.getShip('web_spear_of_adun'),undefined);assert.equal(m.baseHull('web_spear_of_adun'),undefined);assert.equal(m.nativeHull('web_spear_of_adun'),undefined);assert.deepEqual(m.extensionVariantsForHull('web_spear_of_adun'),[]);assert.equal(m.shipSystemDefinitions.get('WEB_ADUN_SOLAR_FORGE'),undefined);assert.equal(m.createAdunDesign().hullId,m.ADUN_ARK_ID);});

test('retired legacy Adun library backs up exact originals, preserves other fits and refuses unsafe writes',()=>{
 const previous=globalThis.localStorage,store=new Map();let writes=0;
 globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>{writes++;store.set(k,String(v));}};
 try {
  const keep=m.createDesign('web_gloriana');keep.name='keep-custom-name';keep.vents=7;
  const old={...structuredClone(keep),id:'legacy-adun-design',name:'old-private-fit',hullId:'web_spear_of_adun',weapons:{XL01:'web_adun_solar_lance'}};
  const raw=JSON.stringify({version:1,draft:old,baseline:old,designs:[old,keep]});store.set(m.storageKey,raw);
  const read=m.readLibrary(),prefix=m.storageKey+':removed:web_spear_of_adun';
  assert.equal(read.protected,false);assert.match(read.error,/旧版亚顿之矛已移除/);assert.equal(store.get(prefix),raw);assert.equal(store.get(m.storageKey),raw);assert.equal(read.observedRaw,raw);
  assert.equal(read.library.draft.hullId,m.ADUN_ARK_ID);assert.equal(read.library.baseline.id,read.library.draft.id);assert.deepEqual(read.library.designs,[m.decodeDesign(keep)]);assert.deepEqual(m.evaluate(read.library.draft).errors,[]);
  const before=writes;m.readLibrary();assert.equal(writes,before,'repeated reads do not duplicate the same backup');
  const written=m.writeLibrary(read.library,read.observedRaw);assert.equal(store.get(m.storageKey),written);assert.equal(store.get(prefix),raw);assert.equal(m.readLibrary().error,null);
  const second=JSON.stringify({version:1,draft:keep,baseline:keep,designs:[old,keep]});store.set(m.storageKey,second);
  const other=m.readLibrary();assert.equal(other.protected,false);assert.deepEqual(other.library.draft,m.decodeDesign(keep));assert.equal(store.get(prefix),raw);assert.equal(store.get(prefix+':1'),second);
  store.set(m.storageKey,'another-window');assert.throws(()=>m.writeLibrary(other.library,other.observedRaw),m.DesignLibraryConflictError);
  store.clear();store.set(m.storageKey,raw);globalThis.localStorage.setItem=()=>{throw Error('quota');};
  const failed=m.readLibrary();assert.equal(failed.protected,true);assert.equal(store.get(m.storageKey),raw);assert.equal(store.size,1);
  store.clear();const unknown=JSON.stringify({version:1,draft:{...keep,hullId:'unknown-not-retired'},designs:[keep]});store.set(m.storageKey,unknown);
  const unknownRead=m.readLibrary();assert.equal(unknownRead.protected,true);assert.equal(store.get(m.storageKey),unknown);assert.equal(store.size,1);
 }finally{if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous;}
});

checkRetiredAdunArmory(m,test);

const e=setup(),s=e.playerShip,t=e.enemyShip,fore=s.childModules.find(p=>p.moduleMount.slotId==='FORE'),xl=fore.weapons.find(w=>w.spec.id===m.ARK_WEAPONS.lance);
test('real manual FORE trigger, projectiles, impacts and limited capacitors',()=>{assert.equal(m.manualWeaponShip(s,e.ships),fore);const hp=t.hullHp,armor=t.armor.cells.slice(),ammo=xl.ammo;let shot=false,hit=false,flux=false;for(let i=0;i<420;i++){step(e,1,true);shot ||= e.projectiles.some(p=>p.specId===m.ARK_WEAPONS.lance);hit ||= t.hullHp<hp||t.flux.totalFlux>0||t.armor.cells.some((v,j)=>v<armor[j]);flux ||= fore.flux.totalFlux>0;}assert(shot&&hit&&flux);assert(xl.ammo<ammo);assert(e.playerWings.length===4);assert(e.ships.some(c=>c.sourceCarrier?.assemblyRoot===s));});
test('shared solar energy, mutual exclusion and interrupted spend never refunds',()=>{const a=setup(),r=a.playerShip,[f,b]=r.systems;assert(f.activate());assert(!b.activate());step(a,70);assert.equal(f.charges,60);assert.equal(f.state,'ACTIVE');assert(f.definition.moduleModifiers(f,r.childModules[0]).weapons.ENERGY.damageMultiplier>1.4);r.flux.isVenting=true;step(a,1);assert.notEqual(f.state,'ACTIVE');assert.equal(f.charges,60);});
test('barrier protects with normal flux shield; reconstruction sacrifices damage and cannot resurrect',()=>{const a=setup(),r=a.playerShip,[f,b,repair]=r.systems;r.shield.isActive=true;assert(b.activate());step(a,30);assert.equal(f.charges,65);assert(b.definition.modifiers(b).shieldDamageMultiplier<.4);step(a,510);const part=r.childModules[0];part.hullHp-=5000;const before=part.hullHp;f.charges=100;assert(repair.activate());step(a,180);assert(part.hullHp>before);assert(repair.definition.moduleModifiers(repair,part).weapons.ENERGY.damageMultiplier<.5);assert.equal(f.charges,50);});
test('destroyed engineering segment really degrades mobility and generation',()=>{const a=setup(),r=a.playerShip,f=r.systems[0],aft=r.childModules.find(p=>p.moduleMount.slotId==='AFT');f.charges=0;step(a,121);assert(f.charges>=4);const speed=r.getMotionStats().maxSpeed;const before=r.system.definition.passiveModifiers(f,r);aft.hullHp=0;step(a,2);assert(aft.isDead);assert(!m.arkEngineeringOnline(r));assert.equal(f.chargeRegenRate,.8);assert.equal(before.speedPercent,undefined);assert.equal(f.definition.passiveModifiers(f,r).speedPercent,-45);assert(Math.abs(r.getMotionStats().maxSpeed/speed-.55)<1e-6);});
test('zero-flux cannot bypass forge slowdown or restore a destroyed engineering segment',()=>{
 const a=setup(),r=a.playerShip,f=r.systems[0],aft=r.childModules.find(p=>p.moduleMount.slotId==='AFT');
 // Keep this mobility-only scenario alive; armed escort AI must not kill the
 // stationary target and freeze the system clock in battle aftermath.
 a.enemyShip.pos.set(20000,0);a.enemyShip.prevPos.copy(a.enemyShip.pos);a.enemyShip.syncModuleTree(true);
 const assertMotion=(scale)=>{assert.equal(r.flux.totalFlux,0);assert.equal(r.flux.isEngineBoostActive,false);assert(Math.abs(r.getMotionStats().maxSpeed-r.spec.maxSpeed*scale)<1e-6);};
 step(a,420);assertMotion(1);assert(f.activate());step(a,420);assert.equal(f.state,'ACTIVE');assertMotion(.65);
 aft.hullHp=0;step(a,2);assert(aft.isDead);assertMotion(.2);assert.equal(r.system.getTurnRatePercentBonus(),-25);assert.equal(r.system.getTurnAccelerationPercentBonus(),-25);
 step(a,180);assert(!f.isActive);assertMotion(.55);assert.equal(f.chargeRegenRate,.8);
});

const wingCraft=(a)=>a.ships.filter(c=>c.sourceCarrier?.assemblyRoot===a.playerShip&&!c.isDead);
const quietFormation=(a)=>{
 for(const c of a.ships)for(const w of c.weapons)w.isDisabled=true;
 for(const c of a.playerShip.assemblyShips)c.clearInput();
};
const formationStation=(a,c,enemy)=>a.fighterSystem.formation.station(c,c.sourceCarrier,false,enemy);
test('flight formation gives all 14 mixed aircraft distinct hull-clear slots through rotation and replacement',()=>{
 const a=setup(),r=a.playerShip;a.fighterSystem.init(r);quietFormation(a);
 const crafts=wingCraft(a);assert.equal(crafts.length,14);
 const stations=crafts.map(c=>formationStation(a,c));
 const left=Math.min(...Object.values(m.arkArt.parts).map(p=>(p.box[0]-m.arkArt.parts.CORE.anchor[0])*m.ARK_SCALE));
 const right=Math.max(...Object.values(m.arkArt.parts).map(p=>(p.box[2]-m.arkArt.parts.CORE.anchor[0])*m.ARK_SCALE));
 for(let i=0;i<crafts.length;i++){
  const c=crafts[i],p=stations[i],radius=m.flightFootprint(c.spec);
  assert(c.pos.distanceTo(p)<1e-8,'spawn uses its own slot across both roles');
  const port=c.sourceCarrier.moduleMount.slotId==='PORT';
  assert(port?p.y<left-radius-70:p.y>right+radius+70,'whole assembly visual clearance');
  for(let j=0;j<i;j++)assert(p.distanceTo(stations[j])>radius+m.flightFootprint(crafts[j].spec)+70,'aircraft footprints must not overlap');
 }
 // Rotating and translating the rigid assembly preserves the same local slots.
 r.pos.set(230,-160);r.facingRad=1.17;r.syncModuleTree(true);
 for(let i=0;i<crafts.length;i++)assert(formationStation(a,crafts[i]).sub(r.pos).rotate(-r.facingRad).distanceTo(stations[i])<1e-6);
 r.pos.set(0,0);r.facingRad=0;r.syncModuleTree(true);
 const docked=crafts.find(c=>a.bombers.includes(c));docked.isDocked=true;
 const lost=crafts[0];lost.isDead=true;lost.hullHp=0;
 // Use the real deck replacement clock, without running irrelevant weapon/renderer scenarios.
 const noop=()=>{};a.fighterSystem.updateDecks(0,r,a.enemyShip,{recordFighterRebuilt:noop,getPlayerPos:()=>r.pos});
 a.fighterSystem.updateDecks(30,r,a.enemyShip,{recordFighterRebuilt:noop,getPlayerPos:()=>r.pos});
 const replacement=wingCraft(a).find(c=>!crafts.includes(c));assert(replacement);
 assert(formationStation(a,replacement).distanceTo(stations[0])<1e-6,'replacement reuses only the vacant slot');
 for(let i=1;i<crafts.length;i++)assert(formationStation(a,crafts[i]).distanceTo(stations[i])<1e-6,'survivor/docked slots stay stable');
 assert.equal(wingCraft(a).length,14);
});
test('flight formation ordinary mixed wings still guard forward and launch aft without sharing slots',()=>{
 const a=new m.CombatEngine('web_sc2_hyperion','web_sc2_hyperion',260928),r=a.playerShip;
 r.pos.set(0,0);r.facingRad=0;
 a.fighterSystem.init(r,undefined,{player:[{specId:'web_ark_interceptor',role:'FIGHTER',count:3,rebuildSeconds:10},{specId:'web_ark_striker',role:'BOMBER',count:3,rebuildSeconds:18}],enemy:[]});
 const craft=wingCraft(a),stations=craft.map(c=>formationStation(a,c));assert.equal(craft.length,6);
 for(let i=0;i<craft.length;i++){
  assert(craft[i].pos.x<0&&stations[i].x>0);
  for(let j=0;j<i;j++)assert(stations[i].distanceTo(stations[j])>m.flightFootprint(craft[i].spec)+m.flightFootprint(craft[j].spec));
 }
});
test('frontline interceptors advance from the old center cluster, acquire aircraft, then obey recall and range',()=>{
 const a=setup(),r=a.playerShip,t=a.enemyShip;t.pos.set(3000,0);t.prevPos.copy(t.pos);
 a.fighterSystem.init(r);quietFormation(a);
 const craft=wingCraft(a),interceptors=craft.filter(c=>a.fighters.includes(c)),rows=new Map();
 for(const c of craft){const n=rows.get(c.sourceCarrier)??0;rows.set(c.sourceCarrier,n+1);
  c.pos.copy(c.sourceCarrier.pos).add(new m.Vector2(c.sourceCarrier.spec.collisionRadius+110,((n%3)-1)*100));c.prevPos.copy(c.pos);c.vel.set(0,0);
 }
 const start=interceptors.map(c=>c.pos.clone());step(a,1500);
 for(let i=0;i<interceptors.length;i++){
  const c=interceptors[i],screen=formationStation(a,c,t);
  assert(c.pos.x>start[i].x+700,'must fly forward, not merely spread around the carrier');
  assert(c.pos.distanceTo(screen)<90,JSON.stringify({id:c.id,pos:c.pos,screen}));
 }
 assert(a.bombers.filter(c=>c.sourceCarrier?.assemblyRoot===r).every(c=>a.bomberAIModes.get(c.id).state==='ATTACK_RUN'));
 // A real enemy craft at the new screen is immediately acquired for dogfighting.
 a.fighterSystem.addCarrier(t,[{specId:'web_ark_interceptor',role:'FIGHTER',count:1,rebuildSeconds:10,range:5000}]);
 const foe=a.fighters.find(c=>c.sourceCarrier===t);assert(foe);
 foe.pos.copy(interceptors[0].pos).add(new m.Vector2(450,0));foe.prevPos.copy(foe.pos);
 step(a,1);assert.equal(a.fighterAIModes.get(interceptors[0].id).state,'DOGFIGHT');
 assert(m.dispatchShipCommand(r,{kind:'recall'}).accepted);step(a,1800);
 for(const c of wingCraft(a)){
  assert(c.pos.distanceTo(formationStation(a,c))<90,JSON.stringify({recall:c.id,pos:c.pos,station:formationStation(a,c)}));
  assert.equal((a.fighterAIModes.get(c.id)??a.bomberAIModes.get(c.id)).state,'ESCORT');
 }
 foe.isDead=true;foe.hullHp=0;t.pos.set(50000,0);t.prevPos.copy(t.pos);
 assert(m.dispatchShipCommand(r,{kind:'recall'}).accepted);step(a,240);
 for(const c of wingCraft(a))assert(c.pos.distanceTo(formationStation(a,c))<90,'no target in wing range: stay near the carrier');
});

test('aircraft fly a real empty-return-dock-rearm cycle, and lost bays stop rebuilding',()=>{
 const a=setup(),r=a.playerShip;for(const part of r.assemblyShips)for(const w of part.weapons)w.isDisabled=true;
 const craft=a.ships.find(c=>(c.spec.sourceHullId??c.spec.id)==='web_ark_striker');assert(craft);for(const c of a.ships)if(c.sourceCarrier&&c!==craft)for(const w of c.weapons)w.isDisabled=true;
 craft.pos.set(1000,0);craft.prevPos.copy(craft.pos);craft.facingRad=craft.prevFacingRad=0;let fired=false,empty=false,docked=false,rearmed=false;
 for(let i=0;i<4800&&!rearmed;i++){step(a,1);const ammo=craft.weapons.reduce((n,w)=>n+w.ammo,0);fired ||=ammo<4;empty ||=ammo===0;docked ||=craft.isDocked;rearmed ||=docked&&ammo===4;}
 assert(fired&&empty&&docked&&rearmed,JSON.stringify({fired,empty,docked,rearmed,dead:craft.isDead,pos:craft.pos}));
 assert(m.dispatchShipCommand(r,{kind:'recall'}).accepted);assert(r.childModules.every(p=>p.fighterRecall));
 const port=r.childModules.find(p=>p.moduleMount.slotId==='PORT');port.hullHp=0;step(a,1);for(const c of a.ships)if(c.sourceCarrier===port)c.hullHp=0;step(a,1800);assert(!a.ships.some(c=>c.sourceCarrier===port&&!c.isDead&&c.hullHp>0));
 r.hullHp=0;step(a,2);assert(r.isDead);assert(r.childModules.every(p=>p.isDead||p.hullHp<=0));
});
test('escort native exhaust uses calibrated nozzles, throttle, turning, disabled and culling',()=>{
 const a=setup();
 for(const id of ['web_ark_interceptor','web_ark_striker']) {
  const craft=a.ships.find(p=>p.spec.id===id),plumes=[],glows=[];assert(craft);
  const ctx={alpha:1,zoom:1,hitGlowTex:'native-glow',viewport:{left:-10000,right:10000,bottom:-10000,top:10000},textures:{getTexture:u=>u},batcher:{flush(){},resumeProgram(){},setBlendMode(){},drawSprite(...c){glows.push(c)}},ribbonBatcher:{begin(){},end(){},drawEnginePlume(...c){plumes.push(c)}}};
  craft.facingRad=.71;craft.angularVelRad=0;craft.engineController.flameAccelerating=true;
  for(const status of craft.engineStatuses)status.currentThrust=status.prevThrust=1;
  const draw=()=>m.renderShipEngines(craft,craft.pos,craft.facingRad,ctx,2,1,2);
  draw();assert.equal(plumes.length,craft.spec.engineSlots.length*3);assert.equal(glows.length,craft.spec.engineSlots.length*2);assert(plumes.every(c=>c[0].endsWith('/engineglow32.png')));
  const full=structuredClone(plumes);draw();assert.deepEqual(plumes.slice(full.length),full,'pause does not advance texture phase');
  for(let i=0;i<craft.spec.engineSlots.length;i++){const slot=craft.spec.engineSlots[i],p=plumes[i*3+2];const x=craft.pos.x+slot.x*Math.cos(.71)-slot.y*Math.sin(.71),y=craft.pos.y+slot.x*Math.sin(.71)+slot.y*Math.cos(.71);assert(Math.hypot(p[1]-x,p[2]-y)<1e-6);assert.equal(p[3],.71+Math.PI);}
  plumes.length=0;for(const status of craft.engineStatuses)status.currentThrust=status.prevThrust=.4;draw();assert(plumes.every((p,i)=>p[4]<full[i][4]*.3));
  for(const status of craft.engineStatuses)status.currentThrust=status.prevThrust=1;
  plumes.length=0;craft.angularVelRad=1;draw();assert.notEqual(plumes[0][3],full[0][3]);assert.equal(plumes[2][3],full[2][3]);
  plumes.length=glows.length=0;for(const status of craft.engineStatuses)status.currentThrust=status.prevThrust=0;draw();assert.equal(plumes.length+glows.length,0);
  for(const status of craft.engineStatuses)status.currentThrust=status.prevThrust=1;ctx.viewport={left:100000,right:100100,bottom:100000,top:100100};draw();assert.equal(plumes.length+glows.length,0);
 }
});
test('aircraft have separate artwork and pixel-calibrated emitters; native effects do not use capital FX',()=>{
 const [interceptor,striker]=m.arkAircraft;assert.notEqual(interceptor.spriteUrl,striker.spriteUrl);
 for(const [craft,art] of [[interceptor,m.aircraftArt.interceptor],[striker,m.aircraftArt.striker]]) {
  for(let i=0;i<2;i++)for(const [slot,pixel] of [[craft.weaponSlots[i],art.emitters[i]],[craft.engineSlots[i],art.engines[i]]]) {
   const source=m.aircraftSocket(art,pixel);assert.equal(slot.x,source.x);assert.equal(slot.y,source.y);
   assert(Math.abs(art.pivot[0]+slot.y*art.width/art.worldWidth-pixel[0])<1e-5);
   assert(Math.abs(art.pivot[1]-slot.x*art.height/art.worldHeight-pixel[1])<1e-5);
  }
 }
 assert(striker.weaponSlots.every(s=>s.mountType==='HARDPOINT'));assert(!m.arkWeaponFxProfile(m.ARK_WEAPONS.bomb));
 const rays=m.aircraftPlasmaRays(.3,28,()=>.5);assert.equal(rays.length,11);assert.deepEqual(rays,m.aircraftPlasmaRays(.3,28,()=>.5));assert.notDeepEqual(rays,m.aircraftPlasmaRays(.4,28,()=>.5));
 const a=setup(),craft=a.ships.find(s=>s.spec.id==='web_ark_interceptor'),mount=craft.weapons[0];
 craft.prevPos.set(100,200);craft.pos.set(120,230);craft.prevFacingRad=.2;craft.facingRad=.4;
 const beam={specId:m.ARK_WEAPONS.air,sourceShipId:craft.id,slotId:mount.slotId,startPos:new m.Vector2(0,0),endPos:new m.Vector2(800,20)};
 const pose=m.arkAircraftBeamPose(beam,a.ships,.5),angle=craft.interpolatedFacing(.5),center=craft.interpolatedPos(.5);
 const socket=m.arkAperturePosition(center,angle,mount.relativePos);assert(Math.hypot(pose.startPos.x-socket.x,pose.startPos.y-socket.y)<1e-6);assert.strictEqual(pose.endPos,beam.endPos);assert.equal(beam.startPos.x,0);
 const calls=[],ctx={alpha:1,textures:{getTexture:u=>u},batcher:{flush(){},resumeProgram(){},setBlendMode(){}},ribbonBatcher:{begin(){},end(){},drawPlasmaRay(...c){calls.push(c)}}};
 const p={id:'probe',specId:m.ARK_WEAPONS.bomb,projWidth:28,elapsedTime:.3};assert(m.renderArkAircraftPlasma(ctx,p,{x:25,y:32}));assert.equal(calls.length,11);assert(calls.every(c=>c[0]===m.ARK_AIR_PLASMA_TEXTURE&&c[1]===25&&c[2]===32));
 calls.length=0;m.renderArkAircraftPlasma(ctx,{...p,fadeProgress:1},{x:25,y:32});assert.equal(calls.length,0);
});
test('aircraft fixed plasma spawns at actual hull emitters after rotation and charge is inhibited correctly',()=>{
 const a=new m.CombatEngine('web_ark_striker','web_ark_interceptor',260928),r=a.playerShip,t=a.enemyShip;
 a.openBattlefield=true;a.asteroids.length=0;a.nebulae.length=0;a.externallyControlledShipIds.add(t.id);
 r.pos.set(110,-50);r.prevPos.copy(r.pos);r.facingRad=r.prevFacingRad=.71;
 t.pos.copy(r.pos).add(m.Vector2.fromAngle(.71).scale(400));t.prevPos.copy(t.pos);for(const w of t.weapons)w.isDisabled=true;
 r.aimTargetWorld.copy(t.pos);r.isFiringMain=true;
 let shots=[];for(let i=0;i<60&&!shots.length;i++){a.fixedUpdate(1/60);shots=a.projectiles.filter(p=>p.specId===m.ARK_WEAPONS.bomb);}
 assert.equal(shots.length,2);
 for(const p of shots){const mount=r.weapons.find(w=>w.slotId===p.slotId),origin=m.arkAperturePosition(r.pos,r.facingRad,mount.relativePos);assert(p.spawnLocation.distanceTo(origin)<1e-6);assert(Math.abs(p.vel.heading()-r.facingRad)<1e-6);assert.equal(mount.mountType,'HARDPOINT');}
 const mount=r.weapons[0];mount.glowAlpha=.75;mount.recoil=0;
 const calls=[],ctx={textures:{getTexture:u=>u},batcher:{flush(){},resumeProgram(){},setBlendMode(){}},ribbonBatcher:{begin(){},end(){},drawPlasmaRay(...c){calls.push(c)}}};
 m.renderArkAircraftCharge(ctx,mount,{x:12,y:24},false,1,.1);assert.equal(calls.length,11);assert(calls.every(c=>c[1]===12&&c[2]===24));calls.length=0;
 m.renderArkAircraftCharge(ctx,mount,{x:12,y:24},true,1,.1);assert.equal(calls.length,0);
 mount.isDisabled=true;m.renderArkAircraftCharge(ctx,mount,{x:12,y:24},false,1,.1);assert.equal(calls.length,0);
 mount.isDisabled=false;mount.recoil=1;m.renderArkAircraftCharge(ctx,mount,{x:12,y:24},false,1,.1);assert.equal(calls.length,0);
});
test('depth stack uses 96 baked states and removes only destroyed owners',()=>{assert.equal(m.arkArt.frames.length,96);assert.notDeepEqual(m.arkFrame(0),m.arkFrame(2));const calls=[],ctx={alpha:1,textures:{getTexture:url=>url},batcher:{setBlendMode(){},drawSprite(...a){calls.push(a);}}};m.renderArkBody(ctx,s,e.ships,s.pos,0,0,1);const alive=calls.length;const port=s.childModules.find(p=>p.moduleMount.slotId==='PORT');port.hullHp=0;calls.length=0;m.renderArkBody(ctx,s,e.ships,s.pos,0,0,1);assert(calls.length<alive);const forbidden=new Set(m.arkFrame(0).filter(d=>d.owner==='PORT').map(d=>m.ADUN_ARK_ART+d.file));assert(calls.every(c=>!forbidden.has(c[0])));});
test('damage follows each living owner at its exact current depth and lance pose',()=>{
 const a=setup(),root=a.playerShip,fore=root.childModules.find(p=>p.moduleMount.slotId==='FORE');
 const events=[],ctx={alpha:1,textures:{getTexture:url=>url},batcher:{setBlendMode(){},drawSprite(...args){events.push({texture:args[0],args});}}};
 const damage={renderLayer(_ctx,part,draw,index,pos,facing,alpha){
  const body=events.at(-1);assert.equal(body.texture,m.ADUN_ARK_ART+draw.file);
  assert.equal(m.arkOwner(part.spec.sourceHullId??part.spec.id),draw.owner);
  assert.equal(body.args[1],pos.x);assert.equal(body.args[2],pos.y);assert.equal(body.args[5],facing+Math.PI/2);assert.equal(body.args[11],alpha);
  events.push({damage:part.id,draw,index});
 }};
 for(let frame=0;frame<96;frame++){
  events.length=0;const time=(frame+.1)*8/96;m.renderArkBody(ctx,root,a.ships,root.pos,.37,time,.6,damage);
  const draws=events.filter(e=>e.damage);assert.equal(draws.length,m.arkFrame(time).length);
  for(const d of draws)assert.equal(d.draw.file,m.arkFrame(time)[d.index].file);
 }
 fore.weapons.find(w=>w.spec.id===m.ARK_WEAPONS.lance).glowAlpha=1;
 events.length=0;m.renderArkBody(ctx,root,a.ships,root.pos,0,2,1,damage);
 assert(events.some(e=>e.damage===fore.id&&e.draw.file===m.arkLanceArt.frames[m.arkLanceArt.chargeEndFrame].file));
 fore.hullHp=0;events.length=0;m.renderArkBody(ctx,root,a.ships,root.pos,0,2,1,damage);
 assert(!events.some(e=>e.damage===fore.id));
});
test('native field replaces ark plumes, stays in the depth stack and follows actual engine state',()=>{
 const a=setup(),r=a.playerShip,aft=r.childModules.find(p=>p.moduleMount.slotId==='AFT');
 assert.equal(aft.spec.engineSlots.length,2);
 assert(!m.arkArtTextures.some(u=>/drive-collars|drive-aperture/.test(u)));
 assert(!m.arkStaticDraws(r.spec).some(d=>/drive-collars|drive-aperture/.test(d.file)));
 const calls=[],ctx={alpha:1,textures:{getTexture:url=>url},batcher:{setBlendMode(){},drawSprite(...args){calls.push(args);}}};
 for(const part of [r,...r.childModules])m.renderShipEngines(part,part.pos,0,ctx,0,1,0);
 assert.equal(calls.length,0,'no mother-ship exhaust, including direct module render calls');
 const setLevel=level=>{for(const status of aft.engineStatuses)status.currentThrust=status.prevThrust=level;};
 const fieldUrl=m.ADUN_ARK_ART+m.arkNativeFieldArt.file;
 const draw=time=>{calls.length=0;m.renderArkBody(ctx,r,a.ships,r.pos,.7,time,1);return calls.filter(c=>c[0]===fieldUrl);};
 for(const level of [0,.4]){setLevel(level);assert.equal(m.arkFieldIntensity(aft.engineStatuses,1),0);assert.equal(draw(0).length,0);}
 setLevel(1);const full=m.arkFieldIntensity(aft.engineStatuses,1);assert(full>.9&&full<1);
 for(let frame=0;frame<96;frame++){
  assert.equal(draw(frame/12).length,3);const index=calls.findIndex(c=>c[0]===fieldUrl);
  assert(m.arkNativeFieldLayers.has(calls[index-1][0].slice(m.ADUN_ARK_ART.length)),'glow immediately follows its native AFT depth layer');
  assert(index<calls.length-1,'later foreground layers must still occlude field');
 }
 const frozen=draw(2).map(c=>[...c]);assert.deepEqual(draw(2),frozen);
 setLevel(.7);assert(m.arkFieldIntensity(aft.engineStatuses,1)>m.arkFieldIntensity(aft.engineStatuses,1,.45));assert(m.arkFieldIntensity(aft.engineStatuses,1)>0&&m.arkFieldIntensity(aft.engineStatuses,1)<full);
 setLevel(1);aft.engineStatuses[0].currentThrust=aft.engineStatuses[0].prevThrust=0;assert.equal(m.arkFieldIntensity(aft.engineStatuses,1),full/2);
 setLevel(.4);for(const status of aft.engineStatuses)status.currentThrust=1;
 assert.equal(m.arkFieldIntensity(aft.engineStatuses,0),0);assert.equal(m.arkFieldIntensity(aft.engineStatuses,1),full);
 assert(m.arkFieldIntensity(aft.engineStatuses,.5)>0&&m.arkFieldIntensity(aft.engineStatuses,.5)<full);
 setLevel(1);aft.hullHp=0;assert.equal(draw(0).length,0);
 aft.hullHp=100;aft.isRetreated=true;assert.equal(draw(0).length,0);aft.isRetreated=false;aft.isDocked=true;assert.equal(draw(0).length,0);
 const craft=a.ships.find(c=>c.sourceCarrier);assert.equal(craft.spec.visualProfile.shieldProfile,'arkFighter');assert(m.SHIELD_VISUAL_PROFILES.arkFighter.brightness<.5);assert(m.SHIELD_VISUAL_PROFILES.arkFighter.rimWidth<2);
});
test('solar lance uses real charge/recoil to replace the FORE layer through a complete cycle',()=>{
 const a=setup(),r=a.playerShip,f=r.childModules.find(p=>p.moduleMount.slotId==='FORE'),w=f.weapons.find(w=>w.spec.id===m.ARK_WEAPONS.lance);
 const poses=new Set(),charge=[],recovery=[];let shots=0,previousAmmo=w.ammo;
 assert.equal(m.arkLancePose(w),0);
 for(let i=0;i<210;i++){step(a,1,true);const pose=m.arkLancePose(w);poses.add(pose);if(w.firingState==='CHARGING')charge.push(pose);if(w.recoil>0)recovery.push(pose);if(w.ammo<previousAmmo)shots++;previousAmmo=w.ammo;}
 assert.equal(shots,1);assert(poses.size>28);assert(charge.some(p=>p>=24));assert(recovery.some(p=>p>=33));assert.equal(m.arkLancePose(w),0);
 assert.equal(m.arkLanceArt.frames.length,46);w.glowAlpha=.9;w.recoil=0;
 const calls=[],ctx={alpha:1,textures:{getTexture:u=>u},batcher:{setBlendMode(){},drawSprite(...v){calls.push(v);}}};
 m.renderArkBody(ctx,r,a.ships,r.pos,0,0,1);
 const moving=calls.filter(c=>m.arkLanceTextures.includes(c[0]));assert.equal(moving.length,1);assert(!calls.some(c=>c[0]===m.ADUN_ARK_ART+m.arkLanceArt.replaceLayer),'do not overlay an uncut closed FORE');
 assert.deepEqual(m.arkLancePose(w),m.arkLancePose(w));w.isDisabled=true;assert.equal(m.arkLancePose(w),0);w.isDisabled=false;assert.equal(m.arkLancePose(w,true),0);
 f.hullHp=0;calls.length=0;m.renderArkBody(ctx,r,a.ships,r.pos,0,0,1);assert(!calls.some(c=>m.arkLanceTextures.includes(c[0])));
});
test('painted heads, fixed collars, foreground lips and UI portraits share the installed assets',()=>{
 const a=setup();for(const part of a.playerShip.childModules)for(const slot of part.spec.weaponSlots){
  const weapon=part.weapons.find(w=>w.slotId===slot.slotId).spec;
  assert(weapon.displayIconUrl,'every ark fitted weapon needs a real detail image');
  if(slot.slotId==='FORE_PROJECTOR'){assert(weapon.hardpointUsesHullSprite);assert(!weapon.turretSpriteUrl);continue;}
  assert(slot.installation.spriteUrl.endsWith(slot.slotId+'-seat-baked-v16.png'));assert(slot.installation.foreground.spriteUrl.endsWith(slot.slotId+'-lip-baked-v16.png'));assert(weapon.turretSpriteUrl.includes('head-painted-v14'));assert(weapon.displayIconUrl.includes('detail-seated-v16'));
  assert.equal(slot.installation.pivotX,slot.installation.foreground.pivotX);assert.equal(slot.installation.pivotY,slot.installation.foreground.pivotY);
 }
});
test('12 per-slot physical saddles survive empty slots, aiming and fragment ownership',()=>{
 const a=setup(),slots=a.playerShip.childModules.flatMap(part=>part.spec.weaponSlots).filter(s=>s.installation);
 assert.equal(slots.length,12);assert.equal(new Set(slots.map(s=>s.installation.spriteUrl)).size,12);
 for(const slot of slots){
  const empty={...slot,defaultWeaponId:undefined},calls=[];
  const ctx={textures:{getTextureInfo:u=>({texture:u,width:64,height:64})},batcher:{setBlendMode(){},drawSprite(...v){calls.push(v);}}};
  const fixed=m.installationPose(empty,135,-90,.7);assert(fixed);assert(Math.abs(fixed.facing-.7)<1e-12);
  for(const layer of ['base','foreground'])m.renderWeaponInstallations(ctx,[empty],135,-90,.7,[1,1,1],.6,undefined,layer);
  assert.equal(calls.length,2);assert.equal(calls[0][1],fixed.x);assert.equal(calls[0][2],fixed.y);
  assert.equal(calls[0][5],calls[1][5]);assert.equal(calls[0][6],calls[1][6]);assert.equal(calls[0][7],calls[1][7]);
  calls.length=0;m.renderWeaponInstallations(ctx,[empty],135,-90,.7,[1,1,1],1,[]);assert.equal(calls.length,0);
 }
});
if(!testFilter||testFilter.test('matching combat texel density')){
 const density=m.arkArt.textureScale/m.arkArt.scale;assert.equal(density,.75);
 for(const spec of m.arkWeapons.filter(w=>w.turretSpriteUrl)){
  const bytes=await readFile('public'+spec.turretSpriteUrl);assert.equal(bytes.toString('ascii',1,4),'PNG');
  assert(Math.abs(bytes.readUInt32BE(16)-spec.spriteWidth*density)<=.5);assert(Math.abs(bytes.readUInt32BE(20)-spec.spriteHeight*density)<=.5);
  const icon=await readFile('public'+spec.displayIconUrl);assert(icon.readUInt32BE(20)>bytes.readUInt32BE(20)*2);
 }
 const a=setup();for(const part of a.playerShip.childModules)for(const slot of part.spec.weaponSlots){
  if(!slot.installation)continue;const d=slot.installation,b=await readFile('public'+d.spriteUrl);
  assert(Math.abs(b.readUInt32BE(16)-d.width*density)<=.5);assert(Math.abs(b.readUInt32BE(20)-d.height*density)<=.5);
 }
 console.log('PASS matching combat texel density and independently sampled detail images');
}
test('authority snapshot restores modules, skill stock and installed head calibration',()=>{const a=setup();a.playerShip.systems[0].charges=37;const viewer=setup();m.applyCombatSnapshot(viewer,JSON.parse(JSON.stringify(m.captureCombat(a,1,{0:0},0))),true);assert.equal(viewer.playerShip.childModules.length,4);assert.equal(viewer.playerShip.systems[0].charges,37);assert.equal(viewer.playerShip.childModules[0].weapons.find(w=>w.spec.id===m.ARK_WEAPONS.ion).spec.spritePivotX,.5);});

test('registered weapon FX phases, calibre hierarchy and live moving muzzle',()=>{
 for(const key of ['charge','muzzle','packet','impact'])for(const phase of [0,.04,.28,.6,.99,1]){
  const samples=m.sampleArkWeaponFx(key,phase);assert(Math.abs(samples.reduce((n,s)=>n+s.weight,0)-1)<1e-12);
  assert(samples.every(s=>s.frame.pivotX===samples[0].frame.pivotX&&s.frame.pivotY===samples[0].frame.pivotY));
 }
 assert.deepEqual(m.sampleArkWeaponFx('packet',-1),[]);
 assert.deepEqual(m.sampleArkWeaponFx('packet',.25,true),m.sampleArkWeaponFx('packet',1.25,true));
 assert.equal(m.sampleArkWeaponFx('charge',1).length,1);
 assert.equal(m.arkChargeLevel({...xl,recoil:0,glowAlpha:1},false),1);
 assert.equal(m.arkChargeLevel({...xl,recoil:1,glowAlpha:1},false),0);
 assert.equal(m.arkChargeLevel({...xl,isDisabled:true},false),0);
 assert.equal(m.arkChargeLevel(xl,true),0);
 const profiles=m.arkWeaponFxProfiles;assert(profiles.web_ark_solar_lance.packet[0]>profiles.web_ark_phase_battery.packet[0]);
 assert(profiles.web_ark_phase_battery.packet[0]>profiles.web_ark_ion_battery.packet[0]);
 const a=setup(),part=a.playerShip.childModules.find(s=>s.moduleMount.slotId==='FORE'),w=part.weapons.find(w=>w.spec.id===m.ARK_WEAPONS.lance);
 const calls=[],ctx={alpha:1,textures:{getTextureInfo:u=>({texture:u,width:128,height:128})},batcher:{setBlendMode(){},drawSprite(...args){calls.push(args);}}};
 const projectile={specId:w.spec.id,sourceShipId:part.id,slotId:w.slotId,elapsedTime:.05,barrelOffset:{x:w.spec.hardpointOffsets[0],y:w.spec.hardpointOffsets[1]}};
 const check=()=>{calls.length=0;m.renderArkShotMuzzle(ctx,projectile,a.ships);assert(calls.length>0);const offset=w.relativePos.clone().rotate(part.facingRad);const port=new m.Vector2(projectile.barrelOffset.x,projectile.barrelOffset.y).rotate(part.facingRad+w.baseAngleDeg*Math.PI/180);assert(Math.abs(calls[0][1]-part.pos.x-offset.x-port.x)<1e-8);assert(Math.abs(calls[0][2]-part.pos.y-offset.y-port.y)<1e-8);return calls[0].slice();};
 const before=check();a.playerShip.pos.set(900,330);a.playerShip.facingRad=1.2;a.playerShip.syncModuleTree(true);const after=check();assert.notEqual(before[1],after[1]);assert.notEqual(before[5],after[5]);
 m.renderArkShotMuzzle(ctx,projectile,a.ships);assert.deepEqual(calls.slice(0,2),calls.slice(2,4),'same paused state gives identical registered frames');
 for(const suppress of [{elapsedTime:1},{sourceShipId:'missing'},{barrelOffset:undefined}]){calls.length=0;m.renderArkShotMuzzle(ctx,{...projectile,...suppress},a.ships);assert.equal(calls.length,0);}
 calls.length=0;part.isDead=true;m.renderArkShotMuzzle(ctx,projectile,a.ships);assert.equal(calls.length,0);
});


test('native system emissions follow true skill phases and painted membrane follows real shield contacts',()=>{
 const a=setup(),r=a.playerShip;r.pos.set(0,0);a.enemyShip.pos.set(20000,0);
 assert.equal(m.arkSystemEmission(r,'CORE'),undefined);assert.equal(m.arkBarrierLevel(r),0);
 const calls=[],ctx={alpha:1,textures:{getTexture:u=>u},batcher:{setBlendMode(){},drawSprite(...args){calls.push(args);}}};
 assert(r.allSystems[0].activate());step(a,12);
 assert(m.arkSystemEmission(r,'CORE'));assert.equal(m.arkSystemEmission(r,'AFT'),undefined,'power is not an instant whole-hull billboard');
 step(a,50);m.renderArkBody(ctx,r,a.ships,r.pos,r.facingRad,a.combatTime,1,undefined,{render(_ctx,tile){calls.push([m.ADUN_ARK_ART+tile.file]);}});
 const drawn=calls.filter(c=>c[0].includes('/emission-v18/'));assert(drawn.length>0);
 const expected=m.arkFrame(a.combatTime).map(d=>m.arkEmissionLayers[d.file]).filter(Boolean).map(d=>m.ADUN_ARK_ART+d.file);
 assert.deepEqual(drawn.map(c=>c[0]),expected,'same current depth sprites and rotating frame');
 r.flux.isOverloaded=true;assert.equal(m.arkSystemEmission(r,'CORE'),undefined);r.flux.isOverloaded=false;
 r.allSystems[0].deactivate();step(a,60);assert.equal(m.arkSystemEmission(r,'CORE'),undefined);
 for(const index of [1,2]){
  r.allSystems[0].charges=100;r.shield.isActive=true;r.shield.currentArcDeg=360;r.childModules[0].hullHp-=1000;
  const system=r.allSystems[index];assert(system.activate());step(a,65);assert(m.arkSystemEmission(r,'CORE'));
  if(index===1)assert.equal(m.arkBarrierLevel(r),1);
  system.deactivate();step(a,65);assert.equal(m.arkSystemEmission(r,'CORE'),undefined);
 }
 r.shield.isActive=true;r.shield.currentArcDeg=360;r.shield.resetVisualHits();const levels=r.shield.hitSegmentLevels;
 const base=Array.from(levels,(_,i)=>m.arkMembraneAlpha(r.shield,i,0));r.shield.recordVisualHit(1000,0);
 const hit=Array.from(levels,(_,i)=>m.arkMembraneAlpha(r.shield,i,0));assert(hit.some((x,i)=>x>base[i]));assert(hit.filter((x,i)=>x>base[i]).length<levels.length/5,'no global fake flash');
 assert(m.arkMembraneAlpha(r.shield,0,1)>base[0]);
 for(const time of [0,.25,.6,2.1]){const f=m.sampleArkMembrane(time);assert(Math.abs(f.reduce((n,s)=>n+s.weight,0)-1)<1e-12);assert.deepEqual(f,m.sampleArkMembrane(time));}
 r.shield.isActive=false;r.shield.currentArcDeg=0;assert.equal(m.arkMembraneAlpha(r.shield,0,1),0);
});

test('ark plugins are built in or refittable, enforce owners/conflicts and change real authority stats',()=>{
 const M=m.ARK_HULLMODS,d=m.createAdunDesign(),root=m.baseHull(d.hullId),left=m.baseHull(m.arkHullId('PORT'));
 assert(root.builtInHullMods.includes(M.reactor));assert(!m.editableMods.includes(M.reactor));
 assert(m.hullModInstallReason(root,M.reactor));assert.equal(m.hullModInstallReason(root,M.reactor,true),null);
 for(const id of [M.matrix,M.coupler]){assert(m.editableMods.includes(id));assert.equal(m.hullModInstallReason(root,id),null);assert(m.hullModInstallReason(left,id));}
 assert.equal(m.hullModInstallReason(left,M.hangar),null);assert(m.hullModInstallReason(root,M.hangar));
 assert(m.hullModInstallReason({...root,hullMods:[M.matrix]},M.coupler));
 assert.equal(m.hullModOPCost(root,M.matrix),20);assert.equal(m.hullModOPCost(left,M.hangar),16);
 const base=m.effectiveHullStats(root),fast=m.effectiveHullStats({...root,hullMods:[M.matrix]});
 assert(Math.abs(fast.maxFlux/base.maxFlux-.85)<1e-8);assert(Math.abs(fast.shieldUpkeepPerSecond/base.shieldUpkeepPerSecond-1.25)<1e-8);
 const a=setup(),r=a.playerShip;a.enemyShip.pos.set(20000,0);assert(Math.abs(r.shield.unfoldDuration-3)<1e-8);r.shield.isActive=true;r.shield.currentArcDeg=0;step(a,190);assert.equal(r.shield.currentArcDeg,360);
 const noMod={...d,hullMods:[]},normalId=m.registerPrototype(noMod),normal=new m.CombatEngine(normalId,'web_sc2_hyperion',17);assert(normal.playerShip.shield.unfoldDuration>64);
 const hot=m.registerPrototype({...d,hullMods:[M.coupler]}),over=new m.CombatEngine(hot,'web_sc2_hyperion',18),o=over.playerShip,f=o.systems[0];over.enemyShip.pos.set(20000,0);
 assert(f.activate());step(over,70);assert.equal(f.charges,60);assert.equal(f.definition.moduleModifiers(f,o.childModules[0]).weapons.ENERGY.damageMultiplier,1.65);
 assert.equal(f.definition.moduleModifiers(f,o.childModules[0]).weapons.ENERGY.fluxCostMultiplier,1.55);
 f.deactivate();step(over,80);assert(Math.abs(f.chargeRegenRate-1.75)<1e-9);o.childModules.find(p=>p.moduleMount.slotId==='AFT').hullHp=0;step(over,3);assert(Math.abs(f.chargeRegenRate-.56)<1e-9);
 const wing=m.effectiveHullStats({...left,hullMods:[M.hangar]});assert.equal(wing.fighterRefitTimeMultiplier,.65);assert.equal(wing.fighterWingRangeMultiplier,.7);assert.equal(wing.replacementRateDecreaseMultiplier,.8);assert.equal(m.effectiveHullStats(left).fighterRefitTimeMultiplier,1);
});
test('painted skill materials animate in simulation time and distinguish injured reconstruction targets',()=>{
 const a=setup(),r=a.playerShip;a.enemyShip.pos.set(20000,0);const p=r.childModules[0];r.systems[0].charges=100;p.hullHp-=5000;assert(r.systems[2].activate());step(a,65);
 const injured=m.arkSystemEmission(r,'FORE',p),healthy=m.arkSystemEmission(r,'AFT',r.childModules[3]);assert.equal(injured.material,'repair');assert(injured.alpha>healthy.alpha*3);
 assert.deepEqual(m.arkSystemMaterialFrame('forge',1),m.arkSystemMaterialFrame('forge',1));assert.notDeepEqual(m.arkSystemMaterialFrame('forge',1),m.arkSystemMaterialFrame('forge',1.3));
 const viewer=setup();m.applyCombatSnapshot(viewer,JSON.parse(JSON.stringify(m.captureCombat(a,2,{0:0},0))),true);const vp=viewer.playerShip.childModules[0];assert.equal(vp.maxHullHp,p.maxHullHp);assert.equal(m.arkSystemEmission(viewer.playerShip,'FORE',vp).material,'repair');
 r.flux.isOverloaded=true;assert.equal(m.arkSystemEmission(r,'FORE',p),undefined);
});

test('ark reconstruction maximum hull survives detached render projection and v3 display lane',()=>{
 m.registerPrototype(m.createAdunDesign());const a=setup(),r=a.playerShip;a.enemyShip.pos.set(20000,0);r.childModules[0].hullHp-=3000;assert(r.systems[2].activate());step(a,65);
 const projection=new m.RenderShipProjection();projection.begin();assert(projection.supports(a.ships));const projected=projection.project(r.childModules[0]);assert.equal(projected.maxHullHp,r.childModules[0].maxHullHp);
 const encoder=new m.ShipDisplayEncoder(31),decoder=new m.ShipDisplayDecoder(),packet=encoder.capture(a.ships,0,true);assert(packet);assert.equal(new DataView(packet).getUint32(4,true),3);
 const decoded=decoder.decode(packet),dc=decoded.ships.find(s=>s.id===r.id),dp=decoded.ships.find(s=>s.id===r.childModules[0].id);assert.equal(dp.maxHullHp,r.childModules[0].maxHullHp);assert(m.arkSystemEmission(dc,'FORE',dp).alpha>.9);
 const stale=packet.slice(0);new DataView(stale).setUint32(4,2,true);assert.throws(()=>new m.ShipDisplayDecoder().decode(stale),/protocol/);
});

const urls=m.collectCombatTextureUrls(e);for(const u of urls)if(u.startsWith('/game-assets/'))await stat('public'+u);for(const u of [...m.arkArtTextures,...m.arkWeaponFxTextures])assert(urls.includes(u));assert(!urls.some(u=>/drive-collars|drive-aperture|web_adun_ark_exhaust_v08/.test(u)));assert(urls.includes(m.ARK_AIR_PLASMA_TEXTURE));assert(urls.includes(m.arkAircraft[1].spriteUrl));console.log('PASS all combat assets exist and are preloaded: '+urls.length);
await writeFile(resolve(out,testFilter?'acceptance-focused.json':'acceptance.json'),JSON.stringify({results,preloaded:urls.length,pack:m.adunArkPack.version},null,2));
