/** Isolated four-tier integration, including the currently registered ship packs. */
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const out=resolve('artifacts/four-tier-weapons');await mkdir(out,{recursive:true});
const bundle=resolve(out,'integration.mjs');
await build({plugins:[{name:'raw-json',setup(b){b.onLoad({filter:/simulation-variants\.json$/},async a=>({contents:await readFile(a.path,'utf8'),loader:'text'}));}}],stdin:{loader:'ts',resolveDir:process.cwd(),contents:
"export * from './scripts/fixtures/four-tier-weapons';"+
"export * from './src/engine/content/WeaponSizes';"+
"export * from './src/studio/DesignModel';"+
"export * from './src/engine/modding/ContentValidation';"+
"export {ContentRegistry,contentRegistry} from './src/engine/content/ContentRegistry';"+
"export {extensionVariantsForHull} from './src/studio/ExtensionVariantCatalog';"+
"export {modManager} from './src/engine/modding/ModManager';"+
"export {assetManager} from './src/engine/assets/AssetResolver';"+
"export {CombatEngine} from './src/engine/simulation/CombatEngine';"+
"export {weaponHealthProfile} from './src/engine/simulation/systems/weapon/WeaponComponentHealth';"+
"export {effectiveWeaponOP,hullModRangeBaseFlat} from './src/engine/extensions/HullMods';"+
"export {captureCombat,applyCombatSnapshot} from './src/network/AuthorityCombatSnapshot';"
},outfile:bundle,bundle:true,platform:'node',format:'esm',target:'node22',define:{'import.meta.env':'{"BASE_URL":"/","DEV":false}','__LAN_BUILD_ID__':'"four-tier-check"'},logLevel:'warning'});
const m=await import(pathToFileURL(bundle).href);
await m.assetManager.loadManifest('data:application/json;base64,'+Buffer.from(await readFile('public/game-assets/asset-manifest.json')).toString('base64'));
m.installFourTierFixture();
const results=[];function test(name,fn){fn();results.push(name);console.log('PASS '+name);}
const hull=m.modManager.requireShip(m.XL_TEST_HULL),gun=m.modManager.getWeapon(m.XL_TEST_WEAPON),slot=hull.weaponSlots[0];
test('four-size 16-pair matrix and invalid sizes fail closed in studio and registry',()=>{
 assert.equal(m.WEAPON_SIZES.length,4);
 for(const a of m.WEAPON_SIZES)for(const b of m.WEAPON_SIZES){
  const fits=a===b;
  assert.equal(m.weaponFitsSlotSize(a,b),fits);assert.equal(m.compatibility({...slot,slotSize:a},{...gun,mountSize:b})===null,fits);
  const probe=structuredClone(hull);probe.weaponSlots[0]={...slot,slotSize:a,defaultWeaponId:gun.id};
  const validate=()=>m.validateShipSpec(probe,{allowExistingId:true,additionalWeapons:new Map([[gun.id,{...gun,mountSize:b}]])});
  if(fits)validate();else assert.throws(validate,/无法容纳/);
 }
 for(const bad of [undefined,null,'UNKNOWN','constructor','__proto__','large',99]){
  assert(!m.weaponFitsSlotSize(bad,'SMALL'));assert(!m.weaponFitsSlotSize('EXTRA_LARGE',bad));
  assert.throws(()=>m.validateWeaponSpec({...gun,mountSize:bad}));
 }
});
test('fourth tier retains type restrictions and requires explicit non-free OP',()=>{
 assert(m.compatibility({...slot,weaponType:'MISSILE'},gun));
 assert(!m.compatibility({...slot,weaponType:'HYBRID'},gun));
 for(const cost of [undefined,NaN,Infinity,0,-1])assert.throws(()=>m.validateWeaponSpec({...gun,ordnancePointCost:cost}));
 m.validateWeaponSpec(gun);
});
test('real refit equip/remove/save/load, 72 OP and main-gun grouping',()=>{
 const d=m.withWeapon(m.createDesign(hull.id,'empty'),slot.slotId,gun.id);
 assert.equal(d.weapons.XL01,gun.id);assert.equal(m.budget(d).weaponOP,72);assert.deepEqual(m.evaluate(d).errors,[]);
 assert(m.autoGroups(d)[0].weaponSlotIds.includes('XL01'));
 const round=m.decodeDesign(JSON.parse(JSON.stringify(d)));assert.equal(round.weapons.XL01,gun.id);
 assert.equal(m.evaluate(round).spec.weaponSlots[0].slotSize,'EXTRA_LARGE');
 const wrong=hull.weaponSlots.find(s=>s.slotSize==='LARGE');assert.equal(m.withWeapon(d,wrong.slotId,gun.id),d);
 const malicious=structuredClone(d);malicious.weapons[wrong.slotId]=gun.id;assert.throws(()=>m.decodeDesign(malicious),/不兼容/);
 assert.equal(m.budget(m.withWeapon(d,'XL01',null)).weaponOP,0);
});
test('same-size alternate weapons remain interchangeable, not bound to an ID',()=>{
 const d=m.createDesign(hull.id,'empty'),large=hull.weaponSlots.find(s=>s.slotSize==='LARGE');
 const candidates=m.weapons.filter(w=>!m.compatibility(large,w));assert(candidates.length>=2);
 const first=m.withWeapon(d,large.slotId,candidates[0].id),second=m.withWeapon(first,large.slotId,candidates[1].id);
 assert.equal(first.weapons[large.slotId],candidates[0].id);assert.equal(second.weapons[large.slotId],candidates[1].id);
 assert.deepEqual(m.evaluate(second).errors,[]);assert.equal(m.budget(second).weaponOP,m.weaponOPCost(second,candidates[1].id));
});
test('down-fitting is rejected by equip, evaluate, import and prototype registration',()=>{
 const d=m.createDesign(hull.id,'empty'),smaller=m.modManager.getWeapon('web_sc2_hyperion_ata');
 assert.equal(m.withWeapon(d,'XL01',smaller.id),d);
 const old=structuredClone(d);old.weapons.XL01=smaller.id;const bytes=JSON.stringify(old);
 assert(m.evaluate(old).errors.some(e=>e.includes('XL01')&&e.includes('尺寸不符')));
 assert.throws(()=>m.decodeDesign(old),/XL01.*尺寸不符/);assert.throws(()=>m.registerPrototype(old),/XL01.*尺寸不符/);
 assert.equal(JSON.stringify(old),bytes,'validation must not clear the legacy weapon');
});
test('legacy cross-size library is protected without overwriting original bytes',()=>{
 const old=m.createDesign(hull.id,'empty');old.weapons.XL01='web_sc2_hyperion_ata';
 const raw=JSON.stringify({version:1,draft:old,designs:[old]});let writes=0;
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>key===m.storageKey?raw:null,setItem:()=>writes++}});
 try {const result=m.readLibrary();assert(result.protected);assert.match(result.error,/未覆盖原方案数据.*XL01.*尺寸不符/);assert.equal(result.observedRaw,raw);assert.equal(writes,0);}
 finally {if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else delete globalThis.localStorage;}
});
test('pack and Worker snapshot registration reject cross-size content atomically',()=>{
 const registry=new m.ContentRegistry(),ships=m.modManager.getAllShips(),weapons=m.contentRegistry.getAllWeapons();
 registry.installSnapshot(ships,weapons);const revision=registry.revision;
 const bad=structuredClone(hull);bad.weaponSlots[0].defaultWeaponId='web_sc2_hyperion_ata';
 assert.throws(()=>registry.installSnapshot(ships.map(s=>s.id===bad.id?bad:s),weapons),/尺寸必须一致/);
 assert.equal(registry.revision,revision);assert.equal(registry.getShip(hull.id).weaponSlots[0].defaultWeaponId,hull.weaponSlots[0].defaultWeaponId);
 bad.id='test_invalid_cross_size_pack';assert.throws(()=>registry.registerPack([bad],[],false),/尺寸必须一致/);
 assert.equal(registry.revision,revision);assert.equal(registry.getShip(bad.id),undefined);
});
test('XL component HP and repair use explicit large baseline, original sizes unchanged',()=>{
 for(const [size,hp,seconds] of [['SMALL',250,10],['MEDIUM',500,15],['LARGE',800,20],['EXTRA_LARGE',800,20]]){
  assert.deepEqual(m.weaponHealthProfile(size,'TURRET'),{health:hp,repairDuration:seconds});
  assert.deepEqual(m.weaponHealthProfile(size,'HARDPOINT'),{health:hp*2,repairDuration:seconds+5});
 }
 assert.equal(m.weaponSizeBaseline('EXTRA_LARGE'),'LARGE');assert.equal(m.WEAPON_SIZE_MARKERS.EXTRA_LARGE,'IV');
 assert.equal(m.WEAPON_SIZE_LABELS.EXTRA_LARGE,'超大型');
});
test('size-specific hullmods retain limits; XL ballistic slots meet the large rangefinder threshold',()=>{
 const spec={...hull,hullMods:['ballistic_rangefinder'],weaponSlots:[{...slot,weaponType:'BALLISTIC'}]};
 const small={...gun,weaponType:'BALLISTIC',mountSize:'SMALL',range:500,aiHints:[],isPointDefense:false};
 assert.equal(m.hullModRangeBaseFlat(spec,small),m.hullModRangeBaseFlat({...spec,weaponSlots:[{...spec.weaponSlots[0],slotSize:'LARGE'}]},small));
 const hbi={...hull,hullMods:[],builtInHullMods:['hbi']};
 assert.equal(m.effectiveWeaponOP(hbi,{...gun,weaponType:'BALLISTIC'},72),72);
 assert.equal(m.effectiveWeaponOP(hbi,{...gun,weaponType:'BALLISTIC',mountSize:'LARGE'},72),62);
});
test('actual simulation fires XL, consumes ammo/flux, deals damage and restores its identity',()=>{
 const d=m.withWeapon(m.createDesign(hull.id,'empty'),'XL01',gun.id);const id=m.registerPrototype(d);
 const e=new m.CombatEngine(id,'web_sc2_hyperion',260927),s=e.playerShip,t=e.enemyShip;
 e.openBattlefield=true;e.asteroids.length=0;e.nebulae.length=0;
 s.pos.set(0,0);s.prevPos.copy(s.pos);s.facingRad=s.prevFacingRad=0;s.aimTargetWorld.set(1100,0);
 t.pos.set(900,0);t.prevPos.copy(t.pos);t.facingRad=t.prevFacingRad=Math.PI;t.vel.set(0,0);
 e.externallyControlledShipIds.add(t.id);for(const sys of t.allSystems)sys.disabled=true;for(const w of t.weapons)w.isDisabled=true;
 s.fireControlMode='MANUAL';s.isFiringMain=true;s.weapons[0].currentAngleRad=0;
 const ammo=s.weapons[0].ammo,hp=t.hullHp,armor=t.armor.cells.slice();let seen=false,flux=false,hit=false;
 for(let i=0;i<240;i++){e.fixedUpdate(1/60);seen ||= e.projectiles.some(p=>p.specId===gun.id);flux ||= s.flux.totalFlux>0;hit ||= t.hullHp<hp||t.flux.totalFlux>0||t.armor.cells.some((value,index)=>value<armor[index]);}
 assert(seen&&flux);assert(s.weapons[0].ammo<ammo);assert(hit,'actual target never hit');
 const viewer=new m.CombatEngine(id,'web_sc2_hyperion');m.applyCombatSnapshot(viewer,JSON.parse(JSON.stringify(m.captureCombat(e,1,{0:0},0))),true);
 assert.equal(viewer.playerShip.weapons[0].spec.mountSize,'EXTRA_LARGE');assert.equal(viewer.playerShip.spec.weaponSlots[0].slotSize,'EXTRA_LARGE');
});
test('all current packs, module defaults and recommended fits remain valid without size migration',()=>{
 const hyperion=m.modManager.requireShip('web_sc2_hyperion');assert.deepEqual(m.WEAPON_SIZES.map(size=>hyperion.weaponSlots.filter(s=>s.slotSize===size).length),[12,8,4,0]);
 assert.equal(m.modManager.getWeapon('web_sc2_hyperion_ata').mountSize,'LARGE');
 function audit(ship){for(const slot of ship.weaponSlots){if(slot.defaultWeaponId)assert.equal(slot.slotSize,m.modManager.getWeapon(slot.defaultWeaponId).mountSize,ship.id+'.'+slot.slotId);}for(const child of ship.modules??[])audit(child.spec);}
 for(const ship of m.modManager.getAllShips())audit(ship);
 for(const ship of m.hulls){assert.deepEqual(m.evaluate(m.createDesign(ship.id)).errors,[],ship.id);for(const fit of m.extensionVariantsForHull(ship.id))assert.deepEqual(m.evaluate(fit.create()).errors,[],fit.id);}
});
await writeFile(resolve(out,'runtime-check.json'),JSON.stringify({passed:results,testOnlyContent:[hull.id,gun.id],limitations:['No XL production gun/hull migrated or authored.','Campaign economic/autofit native tables remain three-tier.','Browser/Worker acceptance recorded separately.']},null,2)+'\n');
console.log('PASS four-tier weapons: '+results.length+' scenarios');
