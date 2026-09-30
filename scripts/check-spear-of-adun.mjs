/** Focused acceptance for the bundled Adun pack and installation-v1 production paths. */
import assert from 'node:assert/strict';
import {validateAdunInstallationPlan} from './lib/adun-installation-plan.mjs';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const out=resolve('artifacts/spear-of-adun');await mkdir(out,{recursive:true});const bundle=resolve(out,'check.mjs');
await build({plugins:[{name:'raw-json',setup(b){b.onLoad({filter:/simulation-variants\.json$/},async a=>({contents:await readFile(a.path,'utf8'),loader:'text'}));}}],stdin:{loader:'ts',resolveDir:process.cwd(),contents:`
export * from './src/engine/content/SpearOfAdunPack';
export * from './src/engine/content/SpearOfAdunArmory';
export * from './src/engine/content/WeaponInstallation';
export * from './src/engine/content/WeaponSizes';
export { createAdunLegacyDesign as createAdunDesign } from './src/studio/SpearOfAdunLoadouts';
export * from './src/studio/DesignModel';
export * from './src/engine/modding/ContentValidation';
export {ContentRegistry,contentRegistry} from './src/engine/content/ContentRegistry';
export {modManager} from './src/engine/modding/ModManager';
export {assetManager} from './src/engine/assets/AssetResolver';
export {collectCombatTextureUrls} from './src/engine/assets/CombatAssetClosure';
export {CombatEngine} from './src/engine/simulation/CombatEngine';
export {captureCombat,applyCombatSnapshot} from './src/network/AuthorityCombatSnapshot';
export {RenderWeaponDictionary} from './src/engine/runtime/local/RenderWeaponDictionary';
export {renderWeaponInstallations} from './src/engine/render/webgl/WeaponInstallationRenderer';
export {createShipHulk,splitHulk} from './src/engine/visual/HulkVisuals';
export * from './src/engine/visual/AdunFXAssets';
export * from './src/engine/render/webgl/AdunFXRenderer';
export * from './src/engine/visual/HitGlowVisuals';
export {adunSolarForge} from './src/engine/extensions/ship-systems/AdunSolarForge';
export {Vector2} from './src/engine/math/Vector2';
export {PackedVisualEncoder,PackedVisualDecoder,packedVisualFields} from './src/engine/runtime/local/PackedVisualState';
export {SimulationRandom} from './src/engine/simulation/SimulationRandom';
`},outfile:bundle,bundle:true,platform:'node',format:'esm',target:'node22',define:{'import.meta.env':'{"BASE_URL":"/","DEV":false}','__LAN_BUILD_ID__':'"adun-check"'},logLevel:'warning'});
const m=await import(pathToFileURL(bundle).href);
await m.assetManager.loadManifest('data:application/json;base64,'+Buffer.from(await readFile('public/game-assets/asset-manifest.json')).toString('base64'));
const results=[];const test=(name,fn)=>{fn();results.push(name);console.log('PASS '+name);};
const hull=m.modManager.requireShip(m.ADUN_HULL_ID),design=m.createAdunDesign(),lance=m.modManager.getWeapon(m.ADUN_WEAPONS.lance);
test('all four tiers accept ordinary 2D art calibration without a 3D source or cross-tier fitting',()=>{
 for(const size of m.WEAPON_SIZES){
  for(const weaponSize of m.WEAPON_SIZES)assert.equal(m.weaponFitsSlotSize(size,weaponSize),size===weaponSize);
  assert.deepEqual(m.weaponArtLayout({mountSize:size},32,48),{width:32,height:48,pivotX:.5,pivotY:.5});
  assert.deepEqual(m.weaponArtLayout({mountSize:size,spriteWidth:26,spriteHeight:44,spritePivotX:.42,spritePivotY:.75},128,128),
   {width:26,height:44,pivotX:.42,pivotY:.75});
 }
});
test('v06 authoring plan binds open bearings only to sampled fixed hull surfaces',()=>{
 const plan=JSON.parse(readFileSync('docs/spear-of-adun-installation-plan-v06.json','utf8'));
 const recorded=JSON.parse(readFileSync('docs/spear-of-adun-installation-evidence-v06.json','utf8'));
 const {calibration:evidence,regions}=recorded;
 assert.equal(createHash('sha256').update(readFileSync('docs/spear-of-adun-installation-plan-v06.json')).digest('hex'),recorded.source.planSha256,'authoring evidence must match the exact plan');
 const summary=validateAdunInstallationPlan(plan,evidence,regions);
 assert.deepEqual(summary.counts,{SMALL:6,MEDIUM:4,LARGE:2,EXTRA_LARGE:0});assert.equal(summary.rotatingRingMounts,0);assert.equal(summary.runtimeReady,false);
 // Size-acceptance fixture only: no new production slot and no claim this bearing fits all XL art.
 const xlPlan=structuredClone(plan),xlEvidence=structuredClone(evidence);
 xlPlan.sites[0].size=xlEvidence.sites[0].size='EXTRA_LARGE';
 assert.equal(validateAdunInstallationPlan(xlPlan,xlEvidence,regions).counts.EXTRA_LARGE,1);
 assert.deepEqual(Object.keys(summary.counts),m.WEAPON_SIZES);
 const bad=structuredClone(plan);bad.sites[0].owner='ROTATING_CORE';assert.throws(()=>validateAdunInstallationPlan(bad,evidence,regions),/不能属于旋转环/);
 const forged=structuredClone(evidence);forged.sites[0].sourceSurface.object='Object_7';forged.sites[0].sourceSurface.category='FIXED_HULL';
 assert.throws(()=>validateAdunInstallationPlan(plan,forged,regions),/支撑面不是固定/);
 const moved=structuredClone(plan);moved.sites[0].imageAnchorPx[0]++;assert.throws(()=>validateAdunInstallationPlan(moved,evidence,regions),/检查过期/);
 const failed=structuredClone(evidence);failed.sites[0].minimumFixedCoverage=.99;assert.throws(()=>validateAdunInstallationPlan(plan,failed,regions),/遮挡检查未通过/);
 const duplicated=structuredClone(plan);duplicated.sites[1].id=duplicated.sites[0].id;assert.throws(()=>validateAdunInstallationPlan(duplicated,evidence,regions),/重复/);
 const hiddenMotion=structuredClone(regions);hiddenMotion.objects.find(row=>row.object===evidence.sites[0].sourceSurface.object).parentChains.fake=['Ctrl_Core_Outter_1'];
 assert.throws(()=>validateAdunInstallationPlan(plan,evidence,hiddenMotion),/祖先属于活动/);
 const unmeasured=structuredClone(plan);unmeasured.dedicatedMechanisms[0].weaponId='placeholder';assert.throws(()=>validateAdunInstallationPlan(unmeasured,evidence,regions),/占位ID/);
 // Authoring changes cannot mutate the registered legacy fit or player's slots.
 assert.equal(m.adunHull.weaponSlots.length,26);assert(!m.adunHull.weaponSlots.some(slot=>plan.sites.some(site=>site.id===slot.slotId)));
});
test('26 real mounts; 422/430 OP, four groups and removable weapons',()=>{
 assert.deepEqual(['EXTRA_LARGE','LARGE','MEDIUM','SMALL'].map(s=>hull.weaponSlots.filter(t=>t.slotSize===s).length),[2,4,8,12]);
 assert.deepEqual(m.evaluate(design).errors,[]);assert.equal(m.budget(design).weaponOP,352);
 for(const slot of hull.weaponSlots){assert(!m.isBuiltIn(hull.id,slot.slotId));assert(slot.installation);assert.equal(m.compatibility(slot,m.modManager.getWeapon(slot.defaultWeaponId)),null);}
 m.validateShipSpec(hull,{allowExistingId:true,requireBundledAssets:true});for(const w of m.adunWeapons)m.validateWeaponSpec(w,true);
 assert.equal(design.groups.filter(g=>g.weaponSlotIds.length).length,4);
 for(const slot of hull.weaponSlots)assert.equal(slot.baseAngleDeg+slot.installation.angleDeg,0,'deck saddles follow hull plating, not turret heading');
 assert.deepEqual(m.adunWeapons.map(w=>w.spriteWidth),[38,32,20,12]);
 const restored=m.decodeDesign(JSON.parse(JSON.stringify(design)));assert.deepEqual(restored.weapons,design.weapons);
 const empty=m.withWeapon(design,'XL01',null);assert(m.evaluate(empty).spec.weaponSlots[0].installation);assert.equal(m.budget(empty).weaponOP,288);
 assert.equal(m.withWeapon(design,'XL01','web_sc2_hyperion_ata'),design);
 assert.equal(m.withWeapon(design,'L01','web_sc2_hyperion_ata').weapons.L01,'web_sc2_hyperion_ata');
});
test('intrinsic weapon identity survives fit assembly independently of mount motion',()=>{
 // Isolated fixture using real existing weapons; never changes the shipped v05 fit.
 const originalSlots=m.adunHull.weaponSlots,baseline=JSON.stringify(originalSlots);
 try {
  m.adunHull.weaponSlots=structuredClone(originalSlots);
  const fixed=m.adunHull.weaponSlots.find(s=>s.slotId==='L01');
  const turret=m.adunHull.weaponSlots.find(s=>s.slotId==='L02');
  fixed.defaultWeaponId='web_sc2_hyperion_ata';fixed.mountType='HARDPOINT';
  turret.defaultWeaponId=m.ADUN_WEAPONS.disruptor;turret.builtIn=true;
  const authored=JSON.stringify(m.adunHull.weaponSlots),assembled=m.adunShips()[0];
  assert.equal(JSON.stringify(m.adunHull.weaponSlots),authored,'assembly does not mutate intrinsic bindings');
  for(const source of [fixed,turret]) {
   const slot=assembled.weaponSlots.find(s=>s.slotId===source.slotId);
   assert.equal(slot.defaultWeaponId,source.defaultWeaponId);assert.equal(slot.builtIn,true);
   assert.equal(slot.mountType,source.mountType);assert.equal(slot.arcDeg,source.arcDeg);
   assert(m.isBuiltIn(m.ADUN_HULL_ID,source.slotId));
   assert(assembled.defaultWeaponGroups.some(g=>g.weaponSlotIds.includes(source.slotId)));
  }
  const open=assembled.weaponSlots.find(s=>s.slotId==='L03');
  assert.equal(open.builtIn,false);assert.equal(open.defaultWeaponId,m.ADUN_WEAPONS.disruptor);
  const bound=structuredClone(design);bound.weapons.L01=fixed.defaultWeaponId;
  assert.deepEqual(m.decodeDesign(JSON.parse(JSON.stringify(bound))).weapons,bound.weapons);
  for(const id of ['L01','L02']) {
   assert.equal(m.withWeapon(bound,id,null),bound,'built-in cannot be removed');
   assert.equal(m.withWeapon(bound,id,m.ADUN_WEAPONS.disruptor),bound,'built-in cannot be replaced');
  }
  for(const replacement of [null,m.ADUN_WEAPONS.disruptor]) {
   const tampered=structuredClone(bound);tampered.weapons.L01=replacement;
   assert.throws(()=>m.decodeDesign(tampered),/内置武器不可更改/);
  }
  assert.equal(m.withWeapon(bound,'L03','web_sc2_hyperion_ata').weapons.L03,'web_sc2_hyperion_ata');
 } finally {m.adunHull.weaponSlots=originalSlots;}
 assert.equal(JSON.stringify(m.adunHull.weaponSlots),baseline);
 assert(m.adunShips()[0].weaponSlots.every(s=>!s.builtIn),'existing v05 remains interchangeable');
});
test('installation and weapon art metadata fail closed',()=>{
 for(const change of [{version:2},{spriteUrl:'/missing.png'},{width:0},{height:Infinity},{pivotX:NaN},{pivotY:1.1},{angleDeg:999}]){
  const probe=structuredClone(hull);Object.assign(probe.weaponSlots[0].installation,change);assert.throws(()=>m.validateShipSpec(probe,{allowExistingId:true,requireBundledAssets:true}));
 }
 for(const change of [{spriteUrl:'/missing.png'},{width:undefined},{width:0},{height:NaN},{pivotX:-1},{pivotY:Infinity}]){
  const probe=structuredClone(hull);Object.assign(probe.weaponSlots[0].installation.foreground,change);assert.throws(()=>m.validateShipSpec(probe,{allowExistingId:true,requireBundledAssets:true}));
 }
 const legacy=structuredClone(hull);for(const s of legacy.weaponSlots)delete s.installation.foreground;m.validateShipSpec(legacy,{allowExistingId:true,requireBundledAssets:true});
 const hidden=structuredClone(hull);hidden.weaponSlots[0].mountType='HIDDEN';assert.throws(()=>m.validateShipSpec(hidden,{allowExistingId:true}));
 for(const change of [{spriteWidth:undefined},{spriteHeight:-1},{spritePivotX:NaN},{spritePivotY:2}])assert.throws(()=>m.validateWeaponSpec({...lance,...change}));
});
test('fixed seats use hull/rest angles; calibrated head pivots survive immutable Worker projection',()=>{
 const slot=hull.weaponSlots[0],p=m.installationPose(slot,100,200,Math.PI/2);assert(Math.abs(p.x-(100-slot.y))<1e-8);assert(Math.abs(p.y-(200+slot.x))<1e-8);
 const before=JSON.stringify(slot),calls=[];const ctx={textures:{getTextureInfo:url=>({texture:url,width:100,height:100})},batcher:{setBlendMode(){},drawSprite(...args){calls.push(args);}}};
 m.renderWeaponInstallations(ctx,hull.weaponSlots,100,200,.4,[1,1,1],.8);assert.equal(calls.length,26);assert.equal(JSON.stringify(slot),before);
 calls.length=0;m.renderWeaponInstallations(ctx,hull.weaponSlots,0,0,0,[1,1,1],1,['XL01']);assert.equal(calls.length,1);
 const dictionary=new m.RenderWeaponDictionary();dictionary.begin();const projected=dictionary.project(lance);dictionary.finish();assert.equal(projected.spritePivotY,lance.spritePivotY);assert.equal(projected.spriteWidth,lance.spriteWidth);assert(Object.isFrozen(projected));
 const mutated={...lance,spritePivotY:.6};dictionary.begin();assert.equal(dictionary.project(mutated).spritePivotY,.6);dictionary.finish();
 assert.deepEqual(m.weaponArtLayout({},64,80),{width:64,height:80,pivotX:.5,pivotY:.5});
 assert(Math.abs(lance.turretOffsets[0]-74.854795)<1e-6);assert.equal(lance.turretOffsets.length,2);
});
test('XL fixed foreground: shared origin, no aim rotation, empty sockets and fragment ownership',()=>{
 const slot=hull.weaponSlots[0],base=m.installationPose(slot,100,200,.4),front=m.installationPose(slot,100,200,.4,'foreground');
 assert.equal(front.x,base.x);assert.equal(front.y,base.y);assert.equal(front.facing,base.facing);
 assert.equal(front.spriteUrl,slot.installation.foreground.spriteUrl);assert.equal(m.installationPose(hull.weaponSlots[2],0,0,0,'foreground'),undefined);
 const calls=[],ctx={textures:{getTextureInfo:url=>({texture:url,width:100,height:100})},batcher:{setBlendMode(){},drawSprite(...args){calls.push(args);}}};
 m.renderWeaponInstallations(ctx,hull.weaponSlots,100,200,.4,[.8,.8,.8],.7,undefined,'foreground');assert.equal(calls.length,2);assert.equal(calls[0][5],.4+Math.PI/2);
 calls.length=0;m.renderWeaponInstallations(ctx,hull.weaponSlots,100,200,.4,[1,1,1],1,['XL01'],'foreground');assert.equal(calls.length,1);
 calls.length=0;m.renderWeaponInstallations(ctx,hull.weaponSlots,100,200,.4,[1,1,1],1,['L01'],'foreground');assert.equal(calls.length,0);
 const detached=structuredClone(slot);delete detached.defaultWeaponId;m.renderWeaponInstallations(ctx,[detached],0,0,0,[1,1,1],1,undefined,'foreground');assert.equal(calls.length,1);
 assert.throws(()=>m.renderWeaponInstallations({...ctx,textures:{getTextureInfo:()=>({texture:'fallback',width:0,height:0})}},[slot],0,0,0,[1,1,1],1,undefined,'foreground'),/not preloaded/);
 const manifest=JSON.parse(readFileSync('public/game-assets/asset-manifest.json','utf8'));
 for(const part of ['body','seat','foreground']){
  const a=m.adunXLArt[part],id='graphics/weapons/web_spear_of_adun/'+a.file,b=readFileSync('public/game-assets/'+id);
  assert.equal(b.readUInt32BE(16),a.sourceBox[2]);assert.equal(b.readUInt32BE(20),a.sourceBox[3]);assert.equal(b[25],6);
  assert.equal(createHash('sha256').update(b).digest('hex'),manifest.find(e=>e.id===id).hash);
 }
});
test('content snapshots retain installation and calibrated weapon metadata',()=>{
 const reg=new m.ContentRegistry();reg.installSnapshot(m.modManager.getAllShips(),m.contentRegistry.getAllWeapons());
 assert.deepEqual(reg.getShip(hull.id).weaponSlots[0].installation,hull.weaponSlots[0].installation);assert.equal(reg.getWeapon(lance.id).spritePivotY,lance.spritePivotY);
});
const runtime=m.registerPrototype(design),engine=new m.CombatEngine(runtime,'web_sc2_hyperion',260927),s=engine.playerShip,t=engine.enemyShip;
test('actual projectiles, ammo/flux, damage, solar forge and snapshot roundtrip',()=>{
 engine.openBattlefield=true;engine.asteroids.length=0;engine.nebulae.length=0;s.pos.set(0,0);s.prevPos.copy(s.pos);s.facingRad=s.prevFacingRad=0;s.aimTargetWorld.set(1450,0);
 t.pos.set(1400,0);t.prevPos.copy(t.pos);t.facingRad=t.prevFacingRad=Math.PI;t.vel.set(0,0);engine.externallyControlledShipIds.add(t.id);
 for(const sys of t.allSystems)sys.disabled=true;for(const w of t.weapons)w.isDisabled=true;
 s.fireControlMode='MANUAL';s.isFiringMain=true;const xl=s.weapons.find(w=>w.slotId==='XL01');xl.currentAngleRad=0;
 const ammo=xl.ammo,hp=t.hullHp,armor=t.armor.cells.slice();let seen=false,flux=false,damage=false,paintedHit;
 for(let i=0;i<300;i++){engine.fixedUpdate(1/60);paintedHit ??=engine.hitGlows.find(g=>g.spriteUrl===m.ADUN_FX.impact);seen ||=engine.projectiles.some(p=>p.specId===lance.id);flux ||=s.flux.totalFlux>0;damage ||=t.hullHp<hp||t.flux.totalFlux>0||t.armor.cells.some((v,j)=>v<armor[j]);}
 assert(seen&&flux&&damage);assert(paintedHit,"real combat impact uses generated art");assert(xl.ammo<ammo);s.isFiringMain=false;assert(s.system.activate());
 for(let i=0;i<65;i++)engine.fixedUpdate(1/60);assert(s.system.isActive);const modifiers=s.system.definition.modifiers(s.system,s.flux.maxFlux,s);assert(modifiers.weapons.ENERGY.damageMultiplier>1.3);assert(modifiers.dissipationMultiplier<1);
 engine.hitGlows.push(paintedHit);
 const viewer=new m.CombatEngine(runtime,'web_sc2_hyperion');m.applyCombatSnapshot(viewer,JSON.parse(JSON.stringify(m.captureCombat(engine,1,{0:0},0))),true);
 assert(viewer.hitGlows.some(g=>g.spriteUrl===m.ADUN_FX.impact));assert.equal(viewer.playerShip.spec.weaponSlots[0].installation.version,1);assert.equal(viewer.playerShip.weapons[0].spec.spritePivotY,lance.spritePivotY);
});
test('empty mounts still preload and stay owned by exactly one hulk fragment',()=>{
 const empty=m.createDesign(hull.id,'empty'),id=m.registerPrototype(empty),e=new m.CombatEngine(id,'web_sc2_hyperion'),ship=e.playerShip;
 const urls=m.collectCombatTextureUrls(e);for(const slot of hull.weaponSlots){assert(urls.includes(slot.installation.spriteUrl));if(slot.installation.foreground)assert(urls.includes(slot.installation.foreground.spriteUrl));}
 const random=new m.SimulationRandom(77),hulk=m.createShipHulk(ship,random);assert(hulk);assert.equal(hulk.mountSlotIds.length,26);
 const fragments=m.splitHulk(hulk,random);assert(fragments);const ids=fragments.flatMap(f=>f.mountSlotIds);assert.equal(new Set(ids).size,ids.length);assert.equal(ids.length,26);
});
test('painted FX lifecycle, strict assets and no generic weapon/engine boosts',()=>{
 assert.equal(m.adunSolarForge.visuals,undefined);assert.equal(m.adunSolarForge.iconUrl,m.ADUN_FX.core);
 for(const w of m.adunWeapons)assert.equal(w.muzzleFlashSpec,undefined);
 assert.deepEqual(m.adunCoreLayers('IDLE',1),[]);assert.deepEqual(m.adunCoreLayers('COOLDOWN',1),[]);
 assert.deepEqual(m.adunCoreLayers('IN',0),[]);assert.deepEqual(m.adunCoreLayers('ACTIVE',1),[{key:'core',alpha:.28}]);
 assert.equal(m.adunCoreLayers('IN',.5)[1].key,'ignition');assert.equal(m.adunCoreLayers('OUT',.5)[1].key,'shutdown');
 assert.deepEqual(m.adunCoreLayers('OUT',0),[]);
 const calls=[],ctx={alpha:1,textures:{getTextureInfo:url=>({texture:url,width:300,height:400})},batcher:{setBlendMode(){},drawSprite(...args){calls.push(args);}}};
 const p={specId:lance.id,projLength:110,projWidth:24,elapsedTime:.05,spawnLocation:{x:10,y:20}};
 assert(m.renderAdunProjectile(ctx,p,{x:100,y:20},0));
 assert.deepEqual(calls.map(c=>c[0]),[...m.sampleAdunMotion('lance',.05),...m.sampleAdunMotion('muzzle',.05,.12)].map(s=>s.frame.url));
 assert.equal(calls[0][7],m.adunMotionClips.lance.frames[0].pivotY-.5);assert.deepEqual(calls.at(-1).slice(1,3),[10,20]);
 calls.length=0;assert(!m.renderAdunProjectile(ctx,{...p,specId:'autopulse'},{x:0,y:0},0));assert.equal(calls.length,0);
 m.renderAdunBeam(ctx,{specId:m.ADUN_WEAPONS.prism,startPos:{x:0,y:0},endPos:{x:100,y:0},width:4,brightness:.8,hitGlowBrightness:.6,elapsedTime:0});
 assert.deepEqual(calls.map(c=>c[0]),[m.adunMotionClips.beam.frames[0].url,m.adunMotionClips.core.frames[0].url]);
 calls.length=0;m.renderAdunExhaust(ctx,{x:10,y:20},Math.PI,24,160,1,0);assert.equal(calls[0][0],m.adunMotionClips.exhaust.frames[0].url);assert.equal(calls[0][5],Math.PI/2);
 assert.throws(()=>m.renderAdunExhaust({...ctx,textures:{getTextureInfo:()=>({texture:'transparent-fallback',width:0,height:0})}},{x:0,y:0},0,24,160,1,0),/not preloaded/);
});
test('24 real frames: common registration, distinct pixels, resource hashes and pure animation clock',()=>{
 const manifest=JSON.parse(readFileSync('public/game-assets/asset-manifest.json','utf8'));
 const sha=b=>createHash('sha256').update(b).digest('hex');
 assert.equal(sha(readFileSync('output/imagegen/spear-of-adun-motion-v03/atlas.png')),m.adunMotionArt.sourceSha256);
 assert.equal(m.adunFXTextures.length,32);
 for(const [key,clip] of Object.entries(m.adunMotionClips)){
  const hashes=[],frames=m.adunMotionArt.clips[key].frames;
  assert.equal(frames.length,4);
  for(const [i,f] of frames.entries()){
   const url=clip.frames[i].url,id=url.replace('/game-assets/',''),b=readFileSync('public'+url);
   assert.equal(b.subarray(1,4).toString(),'PNG');assert.equal(b.readUInt32BE(16),f.width);assert.equal(b.readUInt32BE(20),f.height);assert.equal(b[25],6,'real RGBA');
   assert.deepEqual([f.width,f.height,f.pivotX,f.pivotY],[frames[0].width,frames[0].height,frames[0].pivotX,frames[0].pivotY]);
   assert(f.pivotX>0&&f.pivotX<1&&f.pivotY>0&&f.pivotY<1);
   hashes.push(sha(b));assert.equal(manifest.find(e=>e.id===id)?.hash,hashes.at(-1));
  }
  assert.equal(new Set(hashes).size,4,'not copies of a static frame');
  for(const time of [0,.025,.075,.11]){
   const sampled=m.sampleAdunMotion(key,time);assert(sampled.length>0);assert(Math.abs(sampled.reduce((s,f)=>s+f.weight,0)-1)<1e-8);
   assert(sampled.every(f=>f.weight>=0&&f.weight<=1));assert.deepEqual(m.sampleAdunMotion(key,time),sampled,'same simulation time freezes frames and blend');
  }
  assert.deepEqual(m.sampleAdunMotion(key,NaN),[]);assert.deepEqual(m.sampleAdunMotion(key,-1),[]);
  if(clip.loop){
   assert.equal(m.sampleAdunMotion(key,0)[0].frame.url,clip.frames[0].url);
   assert.equal(m.sampleAdunMotion(key,1/clip.fps)[0].frame.url,clip.frames[1].url);
   assert.equal(m.sampleAdunMotion(key,4/clip.fps)[0].frame.url,clip.frames[0].url);
   assert.equal(m.sampleAdunMotion(key,3.5/clip.fps)[1].frame.url,clip.frames[0].url,'seam blends last into first');
  }else{
   assert.equal(m.sampleAdunMotion(key,.1,.12)[0].frame.url,clip.frames[2].url);
   assert.deepEqual(m.sampleAdunMotion(key,.12,.12),[]);assert.deepEqual(m.sampleAdunMotion(key,1,.12),[]);assert.deepEqual(m.sampleAdunMotion(key,0,0),[]);
  }
 }
 const calls=[],ctx={textures:{getTextureInfo:url=>({texture:url,width:200,height:200})},batcher:{setBlendMode(){},drawSprite(...args){calls.push(args);}}};
 m.renderAdunImpact(ctx,{x:0,y:0},80,.09,.18,.72);assert.equal(calls.length,2);assert.equal(calls[0][3],calls[1][3]);assert(Math.abs(calls.reduce((s,c)=>s+c[11],0)-.72)<1e-8);
 calls.length=0;m.renderAdunImpact(ctx,{x:0,y:0},80,.18,.18,.72);assert.equal(calls.length,0);
});
test('painted hit snapshots and dense Worker packets preserve sprite identity',()=>{
 const projectile={specId:lance.id,hitGlowRadius:85,baseDamage:2600,damage:2600,damageType:'ENERGY',color:[75,180,255]};
 const hits=m.createProjectileHitGlows(projectile,new m.Vector2(100,200),new m.Vector2(),{hullDamage:2600},new m.SimulationRandom(12));
 assert.equal(hits.length,1);assert.equal(hits[0].spriteUrl,m.ADUN_FX.impact);assert.equal(hits[0].maxLife,.18);
 const native=m.createProjectileHitGlows({...projectile,specId:'autopulse'},new m.Vector2(),new m.Vector2(),{},new m.SimulationRandom(12));assert.equal(native.length,2);assert(native.every(g=>!g.spriteUrl));
 const view=Object.fromEntries(m.packedVisualFields.map(k=>[k,[]]));view.hitGlows=hits;
 const packet=new m.PackedVisualEncoder().capture(view),decoder=new m.PackedVisualDecoder(),restored={};decoder.validate(packet);decoder.applyValidated(packet,restored);
 assert.deepEqual(restored.hitGlows,hits);assert(packet.strings.includes(m.ADUN_FX.impact));
});
test('FX closure survives removed systems and weapons on another hull',()=>{
 const ship=engine.playerShip,foreign=engine.enemyShip;
 const empty={...ship,spec:{...ship.spec,systemType:'NONE',systemTypes:[],rightClickSystemType:'NONE',defenseSystemType:'NONE'},weapons:[]};
 const borrowed={...foreign,weapons:[{spec:lance}]};
 for(const probe of [empty,borrowed]){
  const urls=m.collectCombatTextureUrls({allCapitalShips:[probe],ships:[probe],debris:[],environment:{},playerWings:[],enemyWings:[],hulkFragments:[],projectiles:[],nebulae:[],asteroids:[]});
  for(const url of m.adunFXTextures)assert(urls.includes(url),url);
 }
});
await writeFile(resolve(out,'check.json'),JSON.stringify({passed:results,limitations:['Web adaptation, not original campaign parity','No independent ZIP installer, carrier wings or orbit abilities','Visual acceptance in companion headless script']},null,2)+'\n');


