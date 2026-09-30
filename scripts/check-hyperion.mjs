/** One bounded integration through the actual registry, refit compiler and combat engine. */
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const out=resolve('artifacts/hyperion');await mkdir(out,{recursive:true});const bundle=resolve(out,'integration.mjs');
await build({plugins:[{name:'vite-raw-json',setup(b){b.onLoad({filter:/simulation-variants\.json$/},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}));}}],stdin:{contents:`
export * from './src/engine/content/HyperionPack';
export * from './src/engine/content/HyperionArmory';
export {HYPERION_HULLMODS} from './src/engine/content/HyperionIds';
export {hyperionHullMods,HYPERION_REPAIR,hyperionRepairStatus,hyperionYamatoCost} from './src/engine/content/HyperionHullMods';
export {hullModInstallReason,hullModOPCost} from './src/engine/extensions/HullMods';
export * from './src/engine/visual/HyperionVisuals';
export * from './src/engine/visual/HyperionFXAssets';
export {collectCombatTextureUrls} from './src/engine/assets/CombatAssetClosure';
export * from './src/engine/render/webgl/HyperionSystemRenderer';
export * from './src/engine/extensions/weapon-effects/HyperionYamatoHit';
export {CombatFXSystem} from './src/engine/simulation/systems/CombatFXSystem';
export * from './src/engine/extensions/ship-systems/HyperionSystems';
export {hyperionYamato,hyperionJump} from './src/engine/extensions/ship-systems/Registry';
export * from './src/studio/HyperionLoadouts';
export {Ship} from './src/engine/simulation/Ship';
export {AutofireController,nativeAutofireReaders} from './src/engine/ai/AutofireController';
export {ShipWeaponControlSystem} from './src/engine/simulation/systems/ShipWeaponControlSystem';
export {applyCombatControlCommand} from './src/engine/runtime/CombatControl';
export {JumpTargeting} from './src/engine/runtime/JumpTargeting';
export {combatHudView,CombatHudProjector} from './src/engine/runtime/CombatHudView';
export {hyperionJumpPointFailure} from './src/engine/content/HyperionJumpTarget';
export {CombatEngine} from './src/engine/simulation/CombatEngine';
export {CapitalShipAI} from './src/engine/ai/CapitalShipAI';
export {Vector2} from './src/engine/math/Vector2';
export {SimulationRandom} from './src/engine/simulation/SimulationRandom';
export {isPointInPolygon} from './src/engine/math/Geometry';
export {modManager} from './src/engine/modding/ModManager';
export {assetManager} from './src/engine/assets/AssetResolver';
export {createDesign,evaluate,isBuiltIn,withWeapon} from './src/studio/DesignModel';
export {simulationRoster,prepareSimulationOption} from './src/engine/content/SimulationCatalog';
export {captureCombat,applyCombatSnapshot} from './src/network/AuthorityCombatSnapshot';
export {captureLanDisplayCombat} from './src/network/HostSnapshot';
export {setLanControlledRoster} from './src/network/LanRosterIdentity';
`,loader:'ts',resolveDir:process.cwd()},outfile:bundle,bundle:true,platform:'node',format:'esm',target:'node22',define:{'import.meta.env':'{"BASE_URL":"/","DEV":false}','__LAN_BUILD_ID__':'"hyperion-check"'},logLevel:'warning'});
const m=await import(pathToFileURL(bundle).href);
await m.assetManager.loadManifest('data:application/json;base64,'+Buffer.from(await readFile('public/game-assets/asset-manifest.json')).toString('base64'));
const readShipPass=await readFile('src/engine/render/webgl/passes/WebGLShipPass.ts','utf8');
const hull=m.modManager.requireShip(m.HYPERION_HULL_ID),results=[];
function test(name,fn){if(process.env.HYPERION_CHECK_FILTER&&!name.includes(process.env.HYPERION_CHECK_FILTER))return;fn();results.push(name);console.log('PASS '+name);}
const near=(a,b)=>assert(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const ship=()=>new m.Ship('hyperion-test',hull,true,new m.Vector2(),0,new m.SimulationRandom(96));
const world=s=>({ships:[s],asteroids:[],projectiles:[],combatRandom:new m.SimulationRandom(93),deployMine:()=>{}});
const aim=s=>s.aimTargetWorld.set(1500,0);
function advance(s,w,time){for(let t=0;t<Math.ceil(time*60);t++){for(const sys of s.allSystems)sys.update(1/60);for(const sys of s.allSystems)sys.dispatchEvents(s,w,1/60);}}
const jump=s=>s.allSystems.find(x=>x.type===m.HYPERION_JUMP_ID);
test('native entities remain removed, 24 custom removable mounts and independent system launcher',()=>{
 m.modManager.validateShipDefinition(hull,{allowExistingId:true,requireBundledAssets:true});
 assert.throws(()=>m.modManager.requireShip('hyperion'));assert.equal(hull.weaponSlots.length,24);
 assert.deepEqual(['LARGE','MEDIUM','SMALL'].map(x=>hull.weaponSlots.filter(s=>s.slotSize===x).length),[4,8,12]);
 assert.equal(hull.systemWeaponSlots.length,1);assert.equal(hull.systemWeaponSlots[0].slotId,'SYS_YAMATO');
 for(const slot of hull.weaponSlots){assert(!m.isBuiltIn(hull.id,slot.slotId));assert(m.isPointInPolygon(new m.Vector2(slot.x,slot.y),hull.bounds),slot.slotId+' outside collision geometry');}
 assert.equal(hull.voidShield,undefined);assert.equal(hull.modules,undefined);
});
test('default and explicit assault fit compile, all guns can be removed without removing Yamato',()=>{
 for(const d of [m.createDesign(hull.id),m.createHyperionAssaultDesign()]){const result=m.evaluate(d);assert.deepEqual(result.errors,[]);assert.equal(result.spec.weaponSlots.filter(s=>s.defaultWeaponId).length,24);}
 const d=m.createHyperionAssaultDesign();for(const slot of hull.weaponSlots)d.weapons[slot.slotId]=null;
 assert.deepEqual(m.evaluate(d).errors,[]);assert.equal(m.evaluate(d).spec.systemWeaponSlots.length,1);
 const wrong=m.createDesign('web_zhuyuan');wrong.systemTypes=[m.HYPERION_YAMATO_ID];assert(m.evaluate(wrong).errors.some(x=>x.includes('休伯利安')));
 const option=m.simulationRoster().find(x=>x.id==='web-sc2-hyperion-assault');assert(option);assert.deepEqual(m.prepareSimulationOption(option).errors,[]);
});
test('shared reserve has command-edge interlock, delayed real projectile and regeneration',()=>{
 const s=ship(),w=world(s);aim(s);assert(s.system.activate());assert(!jump(s).activate());near(s.system.charges,100);
 advance(s,w,1);assert.equal(w.projectiles.length,0);advance(s,w,1.05);assert.equal(w.projectiles.length,1);
 assert.equal(w.projectiles[0].specId,m.HYPERION_PROJECTILE_ID);assert.equal(w.projectiles[0].baseDamage,6500);assert(w.projectiles[0].pos.x>350);
 assert(s.system.charges>=40&&s.system.charges<=41);assert(!jump(s).activate());
 advance(s,w,4);assert.equal(w.projectiles.length,1);assert(s.system.charges>45);
 s.system.reset();near(s.system.charges,100);
});
test('jump locks accepted point, commits only after warmup and does not sweep or phase',()=>{
 const s=ship(),w=world(s),j=jump(s);aim(s);assert(j.activate());assert(!s.system.activate());j.dispatchEvents(s,w,0);
 s.aimTargetWorld.set(-1500,0);advance(s,w,.6);near(s.pos.x,0);assert(!s.isPhased);advance(s,w,.7);
 near(s.pos.x,1500);near(s.pos.y,0);near(s.prevPos.x,s.pos.x);assert(s.system.charges>=25&&s.system.charges<=26);assert.equal(s.teleportSequence,1);assert(j.teleportVisual.origin);assert(!s.isPhased);
});
test('missing obstacles / occupied arrival / interruption fail closed without resource spend',()=>{
 for(const kind of ['missing','occupied','overload','vent','disabled','dead']){
  const s=ship(),w=world(s),j=jump(s);aim(s);assert(j.activate());if(kind==='missing')delete w.asteroids;j.dispatchEvents(s,w,0);
  if(kind==='occupied')w.asteroids=[{pos:new m.Vector2(1500,0),radius:10000,hp:100}];
  if(kind==='overload')s.flux.isOverloaded=true;if(kind==='vent')s.flux.isVenting=true;if(kind==='disabled')j.disabled=true;if(kind==='dead')s.hullHp=0;
  advance(s,w,1.3);near(s.pos.x,0);near(s.system.charges,100);assert(!j.teleportVisual,kind);
 }
 for(const kind of ['overload','vent','disabled','dead']){
  const s=ship(),w=world(s);aim(s);assert(s.system.activate());
  if(kind==='overload')s.flux.isOverloaded=true;if(kind==='vent')s.flux.isVenting=true;if(kind==='disabled')s.system.disabled=true;if(kind==='dead')s.hullHp=0;
  advance(s,w,2.3);assert.equal(w.projectiles.length,0);near(s.system.charges,100);
 }
});
function engine(){const e=new m.CombatEngine(hull.id,'web_zhuyuan',260926);e.asteroids.length=0;e.nebulae.length=0;e.openBattlefield=true;
 const s=e.playerShip,t=e.enemyShip;s.pos.set(0,0);s.prevPos.copy(s.pos);s.facingRad=s.prevFacingRad=0;t.pos.set(1400,0);t.prevPos.copy(t.pos);t.facingRad=Math.PI;t.vel.set(0,0);
 for(const sh of [s,t])for(const weapon of sh.weapons)weapon.isDisabled=true;aim(s);return e;}
test('real combat projectile damages target; source hull/stats survive render snapshot',()=>{
 const e=engine(),s=e.playerShip,t=e.enemyShip;const before=t.hullHp;assert(s.system.activate());
 let seen=false,impact=false;for(let i=0;i<270;i++){e.fixedUpdate(1/60);seen ||= e.projectiles.some(p=>p.specId===m.HYPERION_PROJECTILE_ID);impact ||= e.fxSystem.explosions.some(e=>e.puffs?.length===4&&e.puffDuration===.7);}
 assert(impact,'real collision did not dispatch Yamato impact effect');
 assert(seen,'no real projectile');assert(t.hullHp<before||t.flux.totalFlux>0,'no shield/armor/hull impact');
 const frame=m.captureCombat(e,1,{0:0},0),viewer=engine();m.applyCombatSnapshot(viewer,JSON.parse(JSON.stringify(frame)),true);
 near(viewer.playerShip.system.charges,s.system.charges);assert(viewer.playerShip.allSystems.some(x=>x.type===m.HYPERION_JUMP_ID));
});
test('AI can fire, reserves jump when damaged, and real AI activates during battle',()=>{
 const s=ship(),t=new m.Ship('target',m.modManager.requireShip('web_zhuyuan'),false,new m.Vector2(1200,0),Math.PI);
 m.hyperionYamato.advanceAI({ship:s,system:s.system,target:t,distance:1200,angleDiff:0});assert(s.system.isActive);
 const low=ship();low.hullHp=low.spec.hitpoints*.3;
 m.hyperionYamato.advanceAI({ship:low,system:low.system,target:t,distance:1200,angleDiff:0});assert(!low.system.isActive);
 m.hyperionJump.advanceAI({ship:low,system:jump(low),target:t,distance:1200,angleDiff:0});assert(jump(low).isActive);
 const e=engine(),ai=new m.CapitalShipAI(e.playerShip,e.enemyShip);for(const w of e.playerShip.weapons)w.isDisabled=false;e.playerShip.fireControlMode='AI';let serial=0;
 for(let i=0;i<180;i++){e.updateShipAI(ai,1/60);e.fixedUpdate(1/60);serial=Math.max(serial,e.playerShip.system.activationSerial);}
 assert(serial>0,'real fleet AI never activated');
});

function isolateWeapon(kind, boost=false) {
 const s=ship(),mount=s.weapons.find(w=>w.spec.id===m.HYPERION_WEAPONS[kind]);assert(mount);
 s.weapons=[mount];s.weaponGroups=[{index:0,weaponSlotIds:[mount.slotId],mode:'LINKED',isAutofire:false}];s.selectedGroupIndex=0;
 s.fireControlMode='MANUAL';s.isFiringMain=true;mount.arcDeg=360;mount.currentAngleRad=0;s.aimTargetWorld.set(2000,0);
 if(boost){const w=world(s);s.aimTargetWorld.set(1500,0);assert(jump(s).activate());advance(s,w,1.9);assert(m.hyperionAmbushRemaining(jump(s))>5);s.aimTargetWorld.set(s.pos.x+2000,0);}
 const shots=[],beams=[];
 const tick=seconds=>{for(let i=0;i<Math.ceil(seconds*240);i++)s.weaponControl.update(1/240,s,0,null,p=>shots.push(p),b=>beams.push(b));};
 return {s,mount,shots,beams,tick};
}
test('theme armory: distinct OP-backed removable weapons, six-round magazines and pressure beam roles',()=>{
 for(const w of m.hyperionWeapons){assert(m.modManager.getWeapon(w.id));assert(w.ordnancePointCost>0);}
 const d=m.createHyperionAssaultDesign(),fit=m.evaluate(d);assert.deepEqual(fit.errors,[]);
 assert(Object.values(d.weapons).every(id=>Object.values(m.HYPERION_WEAPONS).includes(id)));
 const normal=isolateWeapon('battery');normal.tick(.7);assert.equal(normal.shots.length,6);assert(normal.mount.ammo<24);
 assert.equal(normal.shots[0].baseDamage,260);assert(normal.shots.every(p=>p.specId===m.HYPERION_WEAPONS.battery));near(normal.s.flux.totalFlux,1050);
 normal.s.isFiringMain=false;normal.tick(5);assert.equal(normal.mount.ammo,24);
 const pressure=isolateWeapon('suppressor');pressure.tick(.5);assert.equal(pressure.shots.length,6);assert(pressure.shots.every(p=>p.damageType==='KINETIC'));
 const pd=isolateWeapon('interceptor');pd.tick(.5);assert(pd.beams.length>0);assert(pd.mount.spec.isPointDefense);assert(pd.s.flux.totalFlux>0);near(pd.beams[0].damagePerSec,110);
 assert.equal(m.modManager.getWeapon('autopulse'),undefined);assert.equal(m.modManager.getWeapon('pdlaser'),undefined);
 for(const kind of ['battery','suppressor']){const {shots,tick}=isolateWeapon(kind);tick(.7);assert(shots.length>0);assert(shots.every(p=>p.visualSpawnType==='BALLISTIC_AS_BEAM'));}
});
test('successful jump opens six-second costly assault, real projectiles get damage / rate / flux changes',()=>{
 const base=isolateWeapon('battery'),buffed=isolateWeapon('battery',true);base.tick(2);buffed.tick(2);
 assert(buffed.shots.length>base.shots.length);near(buffed.shots[0].baseDamage,260);near(buffed.shots[0].damage,base.shots[0].damage*1.2);
 assert(buffed.s.flux.totalFlux>base.s.flux.totalFlux*1.5);near(buffed.s.system.getWeaponFluxCostMultiplier('ENERGY'),1.5);
 const s=ship(),w=world(s),j=jump(s);aim(s);assert(j.activate());advance(s,w,1.9);
 assert(m.hyperionAmbushRemaining(j)>5.8);near(s.system.getWeaponRateOfFireMultiplier('ENERGY'),1.5);near(s.system.getWeaponRateOfFireMultiplier('BALLISTIC'),1);
 advance(s,w,6.1);near(m.hyperionAmbushRemaining(j),0);near(s.system.getWeaponDamageMultiplier('ENERGY'),1);assert(!j.teleportVisual);
 for(const interruption of ['vent','overload','disabled','dead']){
  const f=ship(),fw=world(f),fj=jump(f);aim(f);assert(fj.activate());advance(f,fw,1.9);
  if(interruption==='vent')f.flux.isVenting=true;if(interruption==='overload')f.flux.isOverloaded=true;if(interruption==='disabled')fj.disabled=true;if(interruption==='dead')f.hullHp=0;
  advance(f,fw,.1);assert(!fj.teleportVisual);near(f.system.getWeaponDamageMultiplier('ENERGY'),1);
 }
 const fail=ship(),fw=world(fail);delete fw.asteroids;aim(fail);assert(jump(fail).activate());advance(fail,fw,2);near(m.hyperionAmbushRemaining(jump(fail)),0);
});
test('assault timer and success provenance survive combat snapshot, reset clears bonus',()=>{
 const e=engine(),s=e.playerShip;aim(s);s.aimTargetWorld.set(0,1600);assert(jump(s).activate());advance(s,{...world(s),ships:[s,e.enemyShip]},1.9);
 const viewer=engine();m.applyCombatSnapshot(viewer,JSON.parse(JSON.stringify(m.captureCombat(e,2,{0:0},0))),true);
 near(m.hyperionAmbushRemaining(jump(viewer.playerShip)),m.hyperionAmbushRemaining(jump(s)));near(viewer.playerShip.system.getWeaponDamageMultiplier('ENERGY'),1.2);
 jump(viewer.playerShip).reset();near(viewer.playerShip.system.getWeaponDamageMultiplier('ENERGY'),1);
});
test('visual phases follow real activation, success, cooldown and interruption',()=>{
 const s=ship(),w=world(s);aim(s);assert(s.system.activate());advance(s,w,1.4);
 assert(m.hyperionVisualState(s).charge>.65);advance(s,w,.7);near(m.hyperionVisualState(s).charge,0);
 const jship=ship(),jw=world(jship),j=jump(jship);aim(jship);assert(j.activate());advance(jship,jw,.85);
 assert(m.hyperionVisualState(jship).jumpCharge>.6);assert.equal(m.hyperionVisualState(jship).arrival,0);
 advance(jship,jw,.5);assert(m.hyperionVisualState(jship).arrival>0);assert(!m.hyperionVisualState(jship).assault);
 advance(jship,jw,.6);assert(m.hyperionVisualState(jship).assault);
 for(const key of ['isDead','isRetreated','isDocked']){jship[key]=true;assert(!m.hyperionVisualState(jship).assault);jship[key]=false;}
 jship.flux.isVenting=true;assert(!m.hyperionVisualState(jship).assault);jship.flux.isVenting=false;
 j.teleportVisual.serial--;assert(!m.hyperionVisualState(jship).assault);j.teleportVisual.serial++;
 advance(jship,jw,6.1);assert(!m.hyperionVisualState(jship).assault);
 const f=ship(),fw=world(f);aim(f);assert(jump(f).activate());advance(f,fw,.7);jump(f).deactivate();
 assert.equal(m.hyperionVisualState(f).arrival,0);assert(!m.hyperionVisualState(f).assault);
 assert.equal(m.hyperionVisualState(engine().enemyShip).charge,0);
});
test('bounded deterministic render, normal blending restored and no ghost recursion',()=>{
 const s=ship(),w=world(s);aim(s);s.system.activate();advance(s,w,1.45);
 let calls=[],blend=[];const ctx={alpha:.5,hitGlowTex:'glow',whiteTex:'white',batcher:{drawSprite:(...v)=>calls.push(v),setBlendMode:v=>blend.push(v),flush:()=>{},resumeProgram:()=>{}},ribbonBatcher:{begin:()=>{},setAlphaDensityScale:()=>{},end:()=>{},drawStrip:(texture,points)=>{assert(m.hyperionFXTextures.includes(texture));assert.equal(points.at(-1).alpha,0);assert.equal(points.at(-1).currentWidth,0);}},textures:{getTexture:url=>url,getTextureInfo:()=>({texture:'mask',width:54,height:144})}};
 const draw=()=>m.renderHyperionSystems(ctx,s,s.pos,s.facingRad,1.45);
 draw();assert(calls.length>=10&&calls.length<45);assert(calls.every(v=>m.hyperionFXTextures.includes(v[0])),'skill still draws primitive glow/white geometry');assert.equal(blend.at(-1),'NORMAL');
 const first=JSON.stringify(calls);calls=[];draw();assert.equal(JSON.stringify(calls),first,'paused frame drift');
 for(const v of calls)for(const n of v.slice(1))assert(Number.isFinite(n));
 s.flux.isOverloaded=true;calls=[];draw();assert.equal(calls.length,0);s.flux.isOverloaded=false;
 advance(s,w,.7);const p=w.projectiles[0];calls=[];assert(m.renderHyperionProjectile(ctx,{...p,elapsedTime:.2},p.pos.clone().add(new m.Vector2(220,0)),0));assert(calls.length>=3&&calls.length<=7);assert(calls.every(v=>m.hyperionFXTextures.includes(v[0])));assert(calls.some(v=>v[0]===m.HYPERION_FX.plasma));assert.equal(blend.at(-1),'NORMAL');
 assert(!m.renderHyperionProjectile(ctx,{...p,specId:'plasma'},p.pos,0));
 const source=readShipPass;assert.equal((source.match(/renderHyperionSystems\(ctx/g)||[]).length,1);
});
test('impact is cosmetic, deterministic and survives ordinary FX snapshot',()=>{
 const e=engine(),s=e.playerShip,t=e.enemyShip,w=world(s);aim(s);s.system.activate();advance(s,w,2.1);
 const p=w.projectiles[0],random=new m.SimulationRandom(123),fx=new m.CombatFXSystem(random),hp=t.hullHp;
 const before=JSON.stringify(random);m.hyperionYamatoHit.hit(p,t,t.pos,true,s,{fx});
 assert.equal(t.hullHp,hp);assert.equal(JSON.stringify(random),before);assert.equal(fx.hitGlows.length,0);assert.equal(fx.shieldRipples.length,0);assert.equal(fx.explosions.length,1);assert.deepEqual(fx.explosions[0].puffs.map(p=>p.texture),[1,2,0,3]);
 e.fxSystem.explosions.push(...fx.explosions);
 const viewer=engine();m.applyCombatSnapshot(viewer,JSON.parse(JSON.stringify(m.captureCombat(e,3,{0:0},0))),true);
 assert.equal(viewer.fxSystem.explosions.length,1);assert.equal(viewer.fxSystem.explosions[0].puffs.length,4);fx.update(2.3);assert.equal(fx.explosions.length,0);
});
test('manual jump preflight rejects occupied, too near, too far and nonfinite points without cooldown or cost',()=>{
 const e=engine(),s=e.playerShip,j=jump(s),slot=s.systems.indexOf(j);
 assert(!m.applyCombatControlCommand(e,{kind:'ship',command:{kind:'system',value:slot},aim:[0,-1200],facing:NaN}).accepted);
 for(const point of [[0,0],[1801,0],[NaN,100],[1400,0]]){
  const result=m.applyCombatControlCommand(e,{kind:'ship',command:{kind:'system',value:slot},aim:point});
  assert(!result.accepted,JSON.stringify(point));assert.equal(j.state,'IDLE');near(s.system.charges,100);
 }
 e.asteroids.push({pos:new m.Vector2(0,1200),radius:30,hp:10});
 assert(!m.applyCombatControlCommand(e,{kind:'ship',command:{kind:'system',value:slot},aim:[0,1200]}).accepted);
 assert.equal(j.state,'IDLE');near(s.system.charges,100);
});
test('local targeting follows exact cursor, marks invalid points, cancels on epoch/autopilot, never activates',()=>{
 const e=engine(),s=e.playerShip,j=jump(s),t=new m.JumpTargeting(),slot=s.systems.indexOf(j),view=m.combatHudView(e);
 s.fireControlMode='MANUAL';s.aimTargetWorld.copy(s.pos);
 t.begin(s.id,2,slot,1800);t.update(view,2,new m.Vector2(0,1200),e);
 assert(t.active&&t.preview.valid);near(t.preview.position.y,1200);assert.equal(j.state,'IDLE');near(s.system.charges,100);
 assert(t.lockPosition());t.update(view,2,new m.Vector2(-1000,1200),e);
 assert(t.choosingFacing);near(t.preview.position.x,0);near(t.preview.position.y,1200);near(Math.abs(t.preview.facing),Math.PI);
 assert.equal(j.state,'IDLE');near(s.system.charges,100);t.cancel();t.begin(s.id,2,slot,1800);
 t.update(view,2,new m.Vector2(0,1801),e);assert(t.active&&!t.preview.valid);near(t.preview.position.y,1801);
 t.update(view,2,undefined,e);assert(t.active&&!t.preview);t.cancel();assert(!t.active&&!t.message);
 t.begin(s.id,2,slot,1800);t.update(view,3,new m.Vector2(0,1200),e);assert(!t.active);
 t.begin(s.id,3,slot,1800);s.fireControlMode='AI';t.update(new m.CombatHudProjector().capture(e),3,new m.Vector2(0,1200),e);assert(!t.active);
 near(s.system.charges,100);assert.equal(j.state,'IDLE');
});
test('authority confirmed manual point remains exact and a small moving blocker aborts rather than relocating',()=>{
 for(const obstruct of [false,true]){
  const e=engine(),s=e.playerShip,j=jump(s);s.fireControlMode='MANUAL';const slot=s.systems.indexOf(j);
  assert(m.applyCombatControlCommand(e,{kind:'ship',command:{kind:'system',value:slot},aim:[0,1200],facing:Math.PI/2}).accepted);
  near(s.facingRad,0);near(j.activationInput.facing,Math.PI/2);
  const w={...world(s),ships:e.ships,asteroids:e.asteroids};j.dispatchEvents(s,w,0);near(j.teleportVisual.destination.y,1200);
  s.aimTargetWorld.set(-1000,-1000);
  if(obstruct)w.asteroids.push({pos:new m.Vector2(0,1200),radius:20,hp:10});
  advance(s,w,1.3);
  if(obstruct){near(s.pos.y,0);near(s.system.charges,100);assert(!j.teleportVisual);}
  else{near(s.pos.y,1200);near(s.pos.x,0);near(s.facingRad,Math.PI/2);assert(s.system.charges<27);assert(j.teleportVisual.origin);}
 }
});
test('all future Hyperion effects are declared in the combat preload closure',()=>{const urls=m.collectCombatTextureUrls(engine());for(const path of m.hyperionFXTextures){assert(urls.includes(path),path+' not preloaded');assert(m.assetManager.hasPath(path),path+' missing from manifest');}});
const M=m.HYPERION_HULLMODS;
const pluginShip=(create=m.createHyperionRepairDesign)=>{
 const evaluated=m.evaluate(create());assert.deepEqual(evaluated.errors,[]);
 return new m.Ship('plugin-test',evaluated.spec,true,new m.Vector2(),0,new m.SimulationRandom(104));
};
const repairDef=m.hyperionHullMods.find(x=>x.id===M.repair);
function repairTick(s,seconds,{regen=false}={}){
 const w=world(s),dt=1/60;
 for(let i=0;i<Math.round(seconds*60);i++){
  s.shield.sinceLastDamageTaken+=dt;
  if(regen)s.system.update(dt);
  repairDef.advanceCombat(s,dt,w);
 }
}
test('hullmods: built-in reactor and legal opt-in fits, conflicts and uninstall restore',()=>{
 assert.deepEqual(hull.builtInHullMods,[M.reactor]);
 assert(m.hullModInstallReason(hull,M.reactor).includes('内置'));
 near(m.hullModOPCost(hull,M.reactor),0);
 const original=m.createHyperionAssaultDesign(),saved=JSON.stringify(original);
 for(const make of [m.createHyperionFocusDesign,m.createHyperionRepairDesign]){
  const d=make(),ev=m.evaluate(d);assert.deepEqual(ev.errors,[]);near(m.hullModOPCost(ev.spec,d.hullMods[0]),25);
  assert(ev.spec.builtInHullMods.includes(M.reactor));assert.deepEqual(m.evaluate(JSON.parse(JSON.stringify(d))).errors,[]);
 }
 assert.equal(JSON.stringify(original),saved);
 const conflict=m.createHyperionFocusDesign();conflict.hullMods.push(M.repair);assert(m.evaluate(conflict).errors.some(x=>x.includes('不兼容')));
 const wrong=m.modManager.requireShip('web_zhuyuan');assert(m.hullModInstallReason(wrong,M.repair));assert.throws(()=>new m.Ship('wrong-hull',{...wrong,hullMods:[M.repair]},true,new m.Vector2(),0));
 const removed=pluginShip(()=>{const d=m.createHyperionFocusDesign();d.hullMods=[];return d;});
 near(removed.system.maxCooldown,18);near(jump(removed).chargeUpDuration,1.2);near(m.hyperionYamatoCost(removed),60);
 const bare=structuredClone(hull);bare.builtInHullMods=[];const unpowered=new m.Ship('no-reactor',bare,true,new m.Vector2(),0);aim(unpowered);
 assert(unpowered.system.activationFailureReason.includes('旗舰反应堆'));near(unpowered.system.chargeRegenRate,0);
});
test('hullmods: focused Yamato actually spends 45 and jump waits 2.4 seconds',()=>{
 const s=pluginShip(m.createHyperionFocusDesign),w=world(s);aim(s);assert(s.system.activate());advance(s,w,2.3);
 assert.equal(w.projectiles.length,1);assert(s.system.charges>=55&&s.system.charges<=56);near(s.system.maxCooldown,14);
 assert(s.system.passiveStatusText.includes('大和45'));assert(s.system.passiveStatusText.includes('2.4s'));
 const t=pluginShip(m.createHyperionFocusDesign),tw=world(t),j=jump(t);aim(t);assert(j.activate());j.dispatchEvents(t,tw,0);
 advance(t,tw,1.3);near(t.pos.x,0);advance(t,tw,1.2);near(t.pos.x,1500);assert(t.system.charges<=26);
});
test('hullmods: repair waits, consumes shared stock, pauses and never creates free hull',()=>{
 const s=pluginShip();s.hullHp=s.maxHullHp*.5;const hp=s.hullHp;
 repairTick(s,5.9);near(s.hullHp,hp);repairTick(s,1.1);
 assert(s.hullHp>hp);near(s.hullHp-hp,(100-s.system.charges)*s.maxHullHp*.005/6);
 const frozen=s.hullHp;repairDef.advanceCombat(s,0,world(s));near(s.hullHp,frozen);
 s.system.charges=0;repairTick(s,1);near(s.hullHp,frozen);assert(m.hyperionRepairStatus(s).includes('储备不足'));
 s.system.charges=1;repairTick(s,1);near(s.hullHp,frozen+s.maxHullHp*.005/6);near(s.system.charges,0);
});
test('hullmods: hull/armor/shield hits and every fire mode interrupt repair',()=>{
 for(const kind of ['hull','armor','shield','manual','autofire','cycle','skill','overload','vent','disabled','retreat','dead']){
  const s=pluginShip();s.hullHp=s.maxHullHp*.5;repairTick(s,7);assert(m.hyperionRepairStatus(s).includes('修复中'));
  if(kind==='hull')s.applyHullDamage(50);
  if(kind==='armor')s.armor.takeDamage(new m.Vector2(0,0),50,'ENERGY',0);
  if(kind==='shield')s.shield.recordDamageContact(50);
  if(kind==='manual')s.isFiringMain=true;
  if(kind==='autofire')s.weapons[0].firingState='ACTIVE';
  if(kind==='cycle')s.weapons[0].firingCycleId++;
  if(kind==='skill'){aim(s);assert(jump(s).activate());}
  if(kind==='overload')s.flux.isOverloaded=true;
  if(kind==='vent')s.flux.isVenting=true;
  if(kind==='disabled')s.system.disabled=true;
  if(kind==='retreat')s.retreating=true;
  if(kind==='dead')s.hullHp=0;
  const hp=s.hullHp,stock=s.system.charges;repairTick(s,1);near(s.hullHp,hp);near(s.system.charges,stock);
  assert(!m.hyperionRepairStatus(s).includes('修复中'),kind);
 }
});
test('hullmods: per-battle repair cap, ceiling and isolation survive tactical reset',()=>{
 const s=pluginShip();s.hullHp=s.maxHullHp*.3;const hp=s.hullHp;
 // Refill energy only, not material, to isolate the finite repair budget.
 for(let i=0;i<70;i++){s.system.charges=100;repairTick(s,1);}
 near(s.hullHp-hp,s.maxHullHp*.2);assert(m.hyperionRepairStatus(s).includes('材料耗尽'));
 s.system.reset();s.applyHullDamage(500);const exhausted=s.hullHp;repairTick(s,8);near(s.hullHp,exhausted);
 const fresh=pluginShip();fresh.hullHp=fresh.maxHullHp*.795;repairTick(fresh,10);near(fresh.hullHp,fresh.maxHullHp*.8);
 assert(m.hyperionRepairStatus(fresh).includes('已达80%'));
 const plain=ship();assert.equal(m.hyperionRepairStatus(plain),undefined);assert(!plain.spec.hullMods?.includes(M.repair));
});
test('native autofire identity baseline remains strict after circular-import fix',()=>{
 const s=ship();assert(m.ShipWeaponControlSystem.hasNativeQueryLoop(s.weaponControl));assert(Object.isFrozen(m.nativeAutofireReaders));
 const original=m.AutofireController.prototype.preAim;
 try {m.AutofireController.prototype.preAim=function(...args){return original.apply(this,args);};assert(!m.ShipWeaponControlSystem.hasNativeQueryLoop(s.weaponControl));}
 finally {m.AutofireController.prototype.preAim=original;}
 assert(m.ShipWeaponControlSystem.hasNativeQueryLoop(s.weaponControl));
});
test('hullmods: real combat repair, HUD projection and plugin resources',()=>{
 const e=engine();e.switchPlayerShip(m.evaluate(m.createHyperionRepairDesign()).spec);
 e.asteroids.length=0;e.nebulae.length=0;e.openBattlefield=true;e.enemyShip.pos.set(30000,30000);
 const s=e.playerShip;s.hullHp=s.maxHullHp*.5;s.shield.setActive(false);
 for(const ship of [s,e.enemyShip])for(const gun of ship.weapons){gun.isDisabled=true;gun.isAutofire=false;}
 const before=s.hullHp;for(let i=0;i<480;i++)e.fixedUpdate(1/60);
 assert(s.hullHp>before);assert(s.system.charges<100);assert(s.system.passiveStatusText.includes('抢修'));
 const urls=m.collectCombatTextureUrls(e);for(const mod of m.hyperionHullMods)for(const url of mod.resources.textures)assert(m.assetManager.hasPath(url),url);
 assert(urls.includes('/game-assets/graphics/hullmods/automated_repair_unit.png'));
 const hud=m.combatHudView(e);assert(hud.playerShip.systems[0].passiveStatusText.includes('抢修'));
 m.setLanControlledRoster(e,new Map([[0,s]]));const frame=m.captureLanDisplayCombat(e,1,{0:0},0,null);assert(JSON.stringify(frame).includes('抢修'));
});
const bytes=await readFile('public/game-assets/graphics/ships/web_sc2_hyperion/hyperion.png');const source=await readFile('output/imagegen/hyperion-v02/hyperion-hull-topview-v02.png');assert(bytes.equals(source));
await writeFile(resolve(out,process.env.HYPERION_CHECK_FILTER?'hullmods-runtime-check.json':'runtime-check.json'),JSON.stringify({filter:process.env.HYPERION_CHECK_FILTER??null,passed:results,artSha256:createHash('sha256').update(bytes).digest('hex'),mounts:hull.weaponSlots.map(s=>({slotId:s.slotId,size:s.slotSize,x:s.x,y:s.y,arc:s.arcDeg})),limitations:['Browser/Worker screenshot verified separately.','Not a standalone installer or release; native weapon assets require compatible host.','No native game UI session, SC2 mechanics parity or multiplayer gameplay claim.']},null,2)+'\n');
console.log('PASS Hyperion bounded integration: '+results.length+' scenarios');
