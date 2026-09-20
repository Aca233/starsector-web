import { dataLoader } from '../src/engine/data/StarsectorDataLoader';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import weapons from '../src/engine/data/generated/weapons.json';
import { Vector2 } from '../src/engine/math/Vector2';
import type { Projectile, WeaponSpec } from '../src/engine/simulation/Weapon';
import { SimulationRandom } from '../src/engine/simulation/SimulationRandom';
import { missileLifecycleSpecFromSource } from '../src/engine/data/MissileLifecycleSpec';
import { initializeSourceProjectile, hasSourceProjectileLifecycle, advanceSourceProjectile, markSourceProjectileImpact } from '../src/engine/simulation/systems/weapon/SourceProjectileLifecycle';
import { initializeSourceMissile, hasSourceMissileLifecycle, advanceSourceMissile, remainingProjectileLifetime } from '../src/engine/simulation/systems/weapon/SourceMissileLifecycle';
import { WeaponSimulationSystem } from '../src/engine/simulation/systems/WeaponSimulationSystem';
import { missileEngineVisual } from '../src/engine/visual/MissileEngineVisuals';
import { appendMissileContrail } from '../src/engine/simulation/MissileContrails';
import { WebGLProjectilePass } from '../src/engine/render/webgl/passes/WebGLProjectilePass';
import { createLanWorld } from '../src/network/LanWorld';
import { assetManager } from '../src/engine/assets/AssetResolver';
import { captureCombat, applyCombatSnapshot } from '../src/network/CombatSnapshot';
import { encodeBinaryState, decodeBinaryState, encodeProjectedBinaryFrame } from '../src/network/BinarySnapshot.mjs';
import { ProjectileThreatIndex } from '../src/engine/ai/ProjectileThreatIndex';
import { assessThreats } from '../src/engine/ai/ThreatAssessment';
import { spawnSystemProjectile } from '../src/engine/extensions/ship-systems/SystemProjectile';

const publicRoot = path.resolve('public');
globalThis.fetch = async (input: any) => { const p = path.resolve(publicRoot, String(input).replace(/^\//, '')); if (!p.startsWith(publicRoot + path.sep)) throw Error('Outside assets'); return new Response(fs.readFileSync(p)); };
await assetManager.ensureManifestLoaded();
const match: any = { id: 'lifecycle-test', seed: 1511506142, hostId: 'p0', snapshotHz: 60,
  players: [{ id: 'p0', seat: 0, team: 0, hull: 'hammerhead', design: null }, { id: 'p1', seat: 1, team: 1, hull: 'hammerhead', design: null }],
  options: { aiHulls: [[], []], assignment: 'teams', battleSize: 3200, initialDeploymentLimit: null } };
const make = () => createLanWorld(match).engine;
const approx = (a: number, b: number) => assert.ok(Math.abs(a-b)<1e-7, `${a} != ${b}`);
function shot(id = 'reaper', overrides: Partial<Projectile> = {}): Projectile {
  const w = (weapons as any)[id] as WeaponSpec;
  const p: Projectile = { ...w, id: 1, specId: id, sourceShipId: 'p0', teamId: 0, isPlayer: true,
    pos: new Vector2(), prevPos: new Vector2(), vel: new Vector2(w.projSpeed, 0),
    damage: w.damagePerShot, empDamage: w.empPerShot, damageType: w.type, radius: w.projRadius,
    rangeRemaining: w.range, totalRange: w.range, elapsedTime: 0, flightTimeRemaining: w.flightTime,
    maxFlightTime: w.flightTime, armingTimeRemaining: 0, facingRad: 0, hitpoints: w.missileHp,
    ...overrides };
  initializeSourceProjectile(p, w.projSpeed);
  initializeSourceMissile(p, new SimulationRandom(12));
  return p;
}
function context(h = make(), ships: any[] = []) {
  return { playerShip: h.playerShip, enemyShip: h.enemyShip, fighters: [], ships, hulkFragments: [], fx: h.fxSystem,
    random: new SimulationRandom(23), visualRandom: new SimulationRandom(24), contrailEngine: h.contrailEngine,
    addRadioMessage() {}, addCameraShake() {}, handleShipDestruction() {} } as any;
}

test('native defaults and all registered projectile types carry bounded source metadata', () => {
  assert.deepEqual(missileLifecycleSpecFromSource({}), { flameoutTime: 4, noEngineGlowTime: 2.5, fadeTime: .5, dudProbabilityOnFlameout: .5,
    collisionClassAfterFlameout: 'MISSILE_FF', fizzleOnReachingWeaponRange: false, noCollisionWhileFading: false, reduceDamageWhileFading: false });
  assert.equal(Object.values(weapons).filter(w => (w as any).missileLifecycleSpec).length, 59);
  assert.equal(weapons.plasma.spawnType, 'PLASMA'); assert.equal(weapons.voltaic_cannon.spawnType, 'PLASMA');
  assert.equal(weapons.reaper.missileLifecycleSpec.flameoutTime, 3);
  assert.equal(weapons.harpoon.missileLifecycleSpec.flameoutTime, 4);
  assert.equal(weapons.amsrm.missileLifecycleSpec.reduceDamageWhileFading, true);
});

test('plasma has no ballistic-length prerequisite; source-relative range, linear fade/damage/EMP and soft flux', () => {
  for (const id of ['plasma','voltaic_cannon']) {
    const p = shot(id, { damage: 100, empDamage: 50, rangeRemaining: 10, vel: new Vector2(1000,0) });
    initializeSourceProjectile(p, 100, new Vector2(900,0));
    assert.equal(p.projLength, undefined); assert.equal(hasSourceProjectileLifecycle(p), true);
    assert.equal(advanceSourceProjectile(p,.1), false); approx(p.pos.x,100); approx(p.rangeRemaining,0); approx(p.damage,100);
    assert.equal(advanceSourceProjectile(p,.25), false); approx(p.damage,50); approx(p.empDamage!,25); approx(p.fadeProgress!,.5); assert.equal(p.softFlux,true);
    assert.equal(advanceSourceProjectile(p,.25), true); approx(p.damage,0);
    assert.equal(markSourceProjectileImpact(shot(id)),false);
  }
});

test('ballistic squared falloff/remnants and authored zero-fade expiry remain unchanged', () => {
  const p=shot('heavyblaster',{damage:100, rangeRemaining:0});
  assert.equal(hasSourceProjectileLifecycle(p),true);
  p.fadeProgress=.5; advanceSourceProjectile(p,.01); approx(p.damage,25); assert.equal(markSourceProjectileImpact(p),true);
  for(const id of ['voidblaster','inimical_emanation','shockrepeater','voltaic_discharge']) assert.equal(hasSourceProjectileLifecycle(shot(id)),false);
});

test('reaper/harpoon/annihilator/swarmer coast for their authored lifetime; fuel does not explode', () => {
  for (const id of ['reaper','harpoon','annihilator','swarmer']) {
    const p = shot(id,{flightTimeRemaining:.1}); p.armedWhileFizzling=true;
    assert.equal(advanceSourceMissile(p,.1),false); assert.equal(p.isGuided,false); approx(p.damage,(weapons as any)[id].damagePerShot);
    const s=p.missileLifecycleSpec!;
    assert.equal(advanceSourceMissile(p,s.flameoutTime-s.fadeTime/2),false); approx(p.fadeProgress!,.5);
    approx(p.damage,(weapons as any)[id].damagePerShot); approx(remainingProjectileLifetime(p),s.fadeTime/2);
    assert.equal(advanceSourceMissile(p,s.fadeTime/2+.00001),true);
  }
});

test('dud state sampled once from combat RNG; special lifecycle owners excluded', () => {
  const a=shot(),b=shot(),ra=new SimulationRandom(78),rb=new SimulationRandom(78);
  initializeSourceMissile(a,ra); initializeSourceMissile(b,rb); assert.equal(a.armedWhileFizzling,b.armedWhileFizzling); assert.equal(ra.next(),rb.next());
  a.armedWhileFizzling=false; a.flightTimeRemaining=0; advanceSourceMissile(a,.1); assert.equal(a.isDisarmed,true); assert.notEqual(a.collisionDisabled,true);
  for (const flags of [{isFlare:true},{isMine:true},{mote:{}},{systemFuseSeconds:1}]) assert.equal(hasSourceMissileLifecycle(shot('reaper',flags as any)),false);
});

test('range fizzle uses launch displacement rather than accumulated curved path', () => {
  const p=shot('amsrm',{flightTimeRemaining:100, totalRange:100});
  p.rangeRemaining=-1000; p.pos.set(50,0); advanceSourceMissile(p,.1); assert.equal(p.missileFizzleTime,undefined);
  p.pos.set(101,0); advanceSourceMissile(p,.1); assert.ok(p.missileFizzleTime!>0); assert.equal(p.armedWhileFizzling,true);
  approx(p.fadeProgress!,.2); approx(p.damage, p.unfadedDamage!*.8); assert.equal(p.softFlux,true);
});

test('noCollisionWhileFading takes precedence over damage fade; explicit NONE disables collisions', () => {
  const p=shot('assaying_rift',{flightTimeRemaining:0}); const damage=p.damage;
  p.missileLifecycleSpec={...p.missileLifecycleSpec!,reduceDamageWhileFading:true};
  advanceSourceMissile(p,.1); assert.equal(p.collisionDisabled,true); assert.equal(p.damage,damage);
  const none=shot('reaper',{flightTimeRemaining:0}); none.missileLifecycleSpec={...none.missileLifecycleSpec!,collisionClassAfterFlameout:'NONE'};
  advanceSourceMissile(none,.01); assert.equal(none.collisionDisabled,true);
});

test('simulation retains inertial missile at expiry, stops guidance/contrail, then quietly removes it', () => {
  const system=new WeaponSimulationSystem(),ctx=context();
  let guidance=0, explosions=0, detach=0;
  system.missileGuidance.updateMissile=()=>{guidance++; return false;};
  system.explosions.spawn=()=>{explosions++;}; ctx.contrailEngine={detach(){detach++;}};
  const p=shot('reaper',{flightTimeRemaining:.01,vel:new Vector2(100,0)}); p.armedWhileFizzling=false;
  system.projectiles=[p]; system.updateProjectiles(.02,ctx);
  assert.equal(system.projectiles.length,1); approx(p.pos.x,2); assert.equal(guidance,0); assert.equal(detach,1);
  system.updateProjectiles(2.99,ctx); assert.equal(system.projectiles.length,0); assert.equal(explosions,0);
});

test('coasting engine glow and missile trails end without a persistent powered trail', () => {
  const p=shot('reaper',{flightTimeRemaining:0}); p.missileFizzleTime=1.25;
  const visual=missileEngineVisual(p)!; assert.ok(visual && visual.glowAlpha>0);
  const powered=shot('reaper'); approx(visual.glowAlpha,missileEngineVisual(powered)!.glowAlpha*.5);
  p.missileFizzleTime=2.5; assert.equal(missileEngineVisual(p),null);
  let points=0; const c={isEnabled:true,addPoint(){points++;}} as any;
  appendMissileContrail(c,p); assert.equal(points,0); appendMissileContrail(c,powered); assert.equal(points,1);
});

function renderAlphas(p: Projectile, alpha=.5) {
  const sprites: any[][]=[];
  const engine={projectiles:[p],fxSystem:{movingRayFades:[]},muzzleParticles:[],muzzleFlashes:[]} as any;
  new WebGLProjectilePass().renderProjectilesAndMuzzle(engine, {alpha,hitGlowTex:'glow',
    textures:{getTexture:(p:string)=>p}, batcher:{setBlendMode(){},drawSprite(...args:any[]){sprites.push(args);},flush(){},resumeProgram(){}},
    ribbonBatcher:{begin(){},end(){},drawEnginePlume(){}}} as any);
  return sprites;
}
test('actual WebGL projectile pass interpolates plasma glow/core and missile body fade', () => {
  const p=shot('plasma'); p.prevFadeProgress=.25; p.fadeProgress=.75;
  const sprites=renderAlphas(p); assert.equal(sprites.length,2); approx(sprites[0][11],.45); approx(sprites[1][11],.475);
  const m=shot('reaper'); m.prevFadeProgress=.25; m.fadeProgress=.75; m.missileFizzleTime=2.75;
  const missile=renderAlphas(m); assert.equal(missile.length,1); approx(missile[0][11],.5);
});

test('coasting live missiles remain AI threats with and without broadphase; duds are ignored', () => {
  const h=make(), target=h.enemyShip; target.pos.set(400,0); target.vel.set(0,0); target.weapons.length=0;
  const p=shot('reaper',{flightTimeRemaining:0,vel:new Vector2(300,0)}); p.armedWhileFizzling=true; advanceSourceMissile(p,.1);
  const world={ships:[target],projectiles:[p],beams:[]} as any;
  const plain=assessThreats(target,world,3,.5);
  world.projectileThreatIndex=new ProjectileThreatIndex([p]); const indexed=assessThreats(target,world,3,.5);
  assert.ok(plain.threats.some(t=>t.kind==='PROJECTILE')); assert.deepEqual(indexed,plain);
  p.isDisarmed=true; assert.equal(assessThreats(target,world,3,.5).threats.length,0);
});

test('JSON/binary combat snapshots preserve plasma and missile fizzle/RNG/origin state', () => {
  const host=make(); const p=shot('reaper',{flightTimeRemaining:0}); p.armedWhileFizzling=true; advanceSourceMissile(p,2.75);
  const plasma=shot('plasma',{rangeRemaining:0}); advanceSourceProjectile(plasma,.25); host.projectiles=[p,plasma];
  const frame=captureCombat(host,1,{0:1,1:1},0,null);
  for(const snapshot of [JSON.parse(JSON.stringify(frame)),decodeBinaryState(encodeBinaryState(match.id,1,encodeProjectedBinaryFrame(frame))).frame]) {
    const client=make(); applyCombatSnapshot(client,snapshot);
    const [m,e]=client.projectiles; assert.equal(m.missileFizzleTime,2.75); assert.equal(m.armedWhileFizzling,true);
    assert.deepEqual(m.missileLifecycleSpec,p.missileLifecycleSpec); assert.ok(m.missileRangeOrigin instanceof Vector2);
    assert.equal(e.spawnType,'PLASMA'); assert.equal(e.fadeProgress,.5); assert.equal(e.damage,plasma.damage);
    assert.equal(advanceSourceMissile(m,.1),false); assert.equal(advanceSourceMissile(m,.2),true);
  }
});

test('real spec-backed system emission initializes missile lifecycle but preserves fuse overrides', () => {
  const h=make(); const world={combatRandom:new SimulationRandom(19),projectiles:[]} as any;
  const p=spawnSystemProjectile(h.playerShip,'reaper',new Vector2(30,40),0,world);
  assert.equal(p.missileLifecycleSpec!.flameoutTime,3); assert.equal(typeof p.armedWhileFizzling,'boolean'); assert.equal(p.missileRangeOrigin!.x,30);
  const fuse=spawnSystemProjectile(h.playerShip,'reaper',new Vector2(),0,world,{systemFuseSeconds:1}); assert.equal(fuse.armedWhileFizzling,undefined);
});

test('mounted weapon firing carries source metadata and construction-time dud state', () => {
  const h=make(),ship=h.playerShip,mount=ship.weapons[0],out: Projectile[]=[];
  mount.spec={...(weapons.reaper as any),fluxPerShot:0}; mount.ammo=10;
  assert.equal(ship.weaponControl.fireWeapon(mount,ship,p=>out.push(p),()=>{}),true);
  assert.ok(out.length>0); assert.equal(out[0].missileLifecycleSpec!.flameoutTime,3); assert.equal(typeof out[0].armedWhileFizzling,'boolean');
  mount.spec={...(weapons.plasma as any),fluxPerShot:0};
  ship.weaponControl.fireWeapon(mount,ship,p=>out.push(p),()=>{});
  const p=out.at(-1)!; assert.equal(p.spawnType,'PLASMA'); assert.ok(p.sourceMoveSpeed!>0);
});

test('real shield contact after fuel exhaustion damages for live torpedo, never for dud; plasma fades to soft flux', () => {
  for (const kind of ['live','dud','plasma']) {
    const h=make(),ship=h.enemyShip, system=new WeaponSimulationSystem(); ship.pos.set(300,0); ship.vel.set(0,0);
    ship.shield.isActive=true; ship.shield.currentArcDeg=360; ship.shield.radius=100;
    const p=shot(kind==='plasma'?'plasma':'reaper',{flightTimeRemaining:kind==='plasma'?undefined:0, vel:new Vector2(1000,0),
      damage:100, damageType:'ENERGY', rangeRemaining:0, sourceShipId:h.playerShip.id,teamId:h.playerShip.teamId,
      projectileExplosionSpec:undefined, onHitEffect:undefined});
    p.armedWhileFizzling=kind==='live';
    system.projectiles=[p]; system.updateProjectiles(.25,context(h,[ship]));
    if(kind==='dud'){assert.equal(ship.flux.totalFlux,0); assert.equal(system.projectiles.length,1);}
    else {assert.ok(ship.flux.totalFlux>0);assert.equal(system.projectiles.length,0);
      if(kind==='plasma'){assert.equal(ship.flux.hardFlux,0);assert.ok(ship.flux.softFlux>0);}else assert.ok(ship.flux.hardFlux>0);}
  }
});

test('real source loader agrees with bounded generated refresh for plasma, torpedoes and special fading missiles', async () => {
  const root=path.resolve('../starsector-core');
  const read=async (file: string)=>{const full=path.resolve(root,file);if(!full.startsWith(root+path.sep))throw Error('Outside source');return fs.readFileSync(full,'utf8');};
  for(const id of ['plasma','voltaic_cannon','reaper','harpoon','amsrm','assaying_rift']) {
    const loaded=await dataLoader.loadWeaponFromSource(id,read,{reportApproximation(){}}),generated=(weapons as any)[id];
    for(const field of ['spawnType','flightTime','missileLifecycleSpec']) assert.deepEqual((loaded as any)[field],generated[field],id+'.'+field);
  }
});

test('all 59 registered missile/torpedo entries reach the authored half-fade and expiry boundaries', () => {
  for(const [id,w]of Object.entries(weapons)) {
    if(!(w as any).missileLifecycleSpec)continue;
    const p=shot(id,{flightTimeRemaining:0});p.armedWhileFizzling=true;
    const spec=p.missileLifecycleSpec!,half=spec.flameoutTime-spec.fadeTime/2;
    assert.equal(advanceSourceMissile(p,half),false,id);approx(p.fadeProgress!,.5);
    if(spec.noCollisionWhileFading)assert.equal(p.collisionDisabled,true,id);
    else if(spec.reduceDamageWhileFading)approx(p.damage,p.unfadedDamage!*.5);
    else approx(p.damage,p.unfadedDamage!);
    assert.equal(advanceSourceMissile(p,spec.fadeTime/2+1e-6),true,id);
  }
});

test('unarmed coasting missiles remain interceptable; fading collisionless missiles do not', () => {
  const h=make(),system=new WeaponSimulationSystem(),ctx=context(h);
  for(const disabled of [false,true]) {
    const missile=shot('reaper',{id:2,sourceShipId:'p1',flightTimeRemaining:0,teamId:1,isPlayer:false,pos:new Vector2(50,0)});
    missile.armedWhileFizzling=false;advanceSourceMissile(missile,.1);missile.collisionDisabled=disabled;
    const pd=shot('heavyblaster',{damage:1000,prevPos:new Vector2(),pos:new Vector2(100,0),onHitEffect:undefined});
    const hit=system.collisionHandler.checkMissileInterception(pd,ctx,[missile]);
    if(disabled)assert.equal(hit,null);else {assert.ok(hit);assert.equal(hit.targetDestroyed,true);}
  }
});
