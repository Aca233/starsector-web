// Preserve Ship-first initialization for the real in-tree registries.
import { Ship } from '../../src/engine/simulation/Ship';
import { CombatEngine } from '../../src/engine/simulation/CombatEngine';
import combatEngineSource from '../../src/engine/simulation/CombatEngine.ts?raw';
import { clearEffectState } from '../../src/engine/extensions/EffectState';
import { ShipWeaponControlSystem } from '../../src/engine/simulation/systems/ShipWeaponControlSystem';
import { Vector2 } from '../../src/engine/math/Vector2';
import { SimulationRandom } from '../../src/engine/simulation/SimulationRandom';
import { ArmorGrid } from '../../src/engine/simulation/ArmorGrid';
import { ShipDamageState } from '../../src/engine/simulation/ShipDamageState';
import { FluxTracker } from '../../src/engine/simulation/FluxTracker';
import { Shield } from '../../src/engine/simulation/Shield';
import { ShipSystem } from '../../src/engine/simulation/ShipSystem';
import { WeaponSimulationSystem } from '../../src/engine/simulation/systems/WeaponSimulationSystem';
import { CombatFXSystem } from '../../src/engine/simulation/systems/CombatFXSystem';
import { CombatStatsTracker } from '../../src/engine/simulation/systems/CombatStatsTracker';
import { AsteroidSystem } from '../../src/engine/simulation/systems/AsteroidSystem';
import { damageWeaponComponent } from '../../src/engine/simulation/systems/weapon/WeaponComponentHealth';
import { captureCombatAudio } from '../../src/engine/audio/CombatAudioEvents';
import { contentRegistry } from '../../src/engine/content/ContentRegistry';
import type { Projectile, Beam, WeaponMount, WeaponSpec } from '../../src/engine/simulation/Weapon';
import type { WeaponSimContext } from '../../src/engine/simulation/systems/weapon/WeaponSimContext';
interface Exports extends WebAssembly.Exports { memory: WebAssembly.Memory; test_input(n: number): number; test_run(): number; test_beam_refresh(): number; test_output_words(): number }
const sounds = ['shield_hit', 'armor_hit_light', 'armor_hit_solid', 'armor_hit_heavy', 'flak_explosion', 'missile_explosion', 'beam_hit'];
const statsKeys = ['totalDamageDealt', 'kineticDamage', 'heDamage', 'energyDamage', 'fragDamage', 'shieldDamageAbsorbed', 'armorDamageSoaked', 'hullDamageDealt', 'hullDamageTaken', 'shotsFired', 'shotsHit', 'empDamageDealt', 'missilesIntercepted', 'fightersDestroyed', 'fightersLost', 'fightersRebuilt', 'overloadsInflicted', 'overloadsSuffered'] as const;
export async function checkRustWeaponWorld(source: BufferSource) {
  const { instance } = await WebAssembly.instantiate(source, {}), wasm = instance.exports as Exports;
  let strict = 0, geometry = 0, maximumDifference = 0, orderedEvents = 0;
  const geometryLog: { label: string; difference: number }[] = [];
  const failures: string[] = [];
  for (let scene = 0; scene < 33; scene++) {
    const random = new SimulationRandom(8127), visual = new SimulationRandom(15181), fx = new CombatFXSystem(visual), stats = new CombatStatsTracker(), weapon = new WeaponSimulationSystem(), asteroids = new AsteroidSystem(random, visual);
    const ships: Ship[] = [], rows: { v: number[]; g: number[] }[] = [], expected: number[] = [], geometric: boolean[] = [], labels: string[] = [];
    const put = (v: number, g = false, label = '') => { expected.push(v); geometric.push(g); labels.push(label); };
    const record = (v: number[], g: number[] = []) => rows.push({ v, g });
    for (let i = 0; i < 3; i++) {
      const armor = new ArmorGrid(9, 7, 10, 10, 27, -45, -35), decals = new ShipDamageState(armor, visual), flux = new FluxTracker(scene === 1 && i === 1 ? 100 : 10000, 0, 'FRIGATE');
      armor.onCellDamage = (c, r, d) => decals.onCellDamage(c, r, d);
      const spec = { id: i === 0 ? 'fixture-source' : `ship${i + 1}`, nameKey: 'fixture', hullSize: [7, 8].includes(scene) && i === 1 ? 'FIGHTER' : 'FRIGATE', collisionRadius: 30,
        bounds: [[-30, -20], [30, -20], [30, 20], [-30, 20]], mass: 100, spriteHeight: 70, engineSlots: [], weaponSlots: [{ slotId: '1', x: -20, y: 0 }], captainSkills: {},
        hullMods: [], builtInHullMods: [], explosionColor: [230, 130, 90], explosionFlashColor: [247, 164, 31], debrisColor: [100, 130, 160], minPieces: 2, maxPieces: 2 };
      const mount = { slotId: '1', mountType: 'TURRET', relativePos: new Vector2(-20, 0), spec: { id: 'fixture', mountSize: 'SMALL' }, health: 250, maxHealth: 250,
        isDisabled: false, isPermanentlyDisabled: false, disabledDuration: 0, disabledTimer: 0 } as WeaponMount;
      const s = Object.create(Ship.prototype) as Ship, shield = new Shield('OMNI', 360, 42, .83);
      Object.assign(shield, { isActive: i === 1 && [1, 2, 3, 4, 5, 18, 20].includes(scene), currentArcDeg: 360, facingAngleRad: 0 });
      shield.damageTakenModifiers.set('fixture', 1.19); shield.damageTakenModifiers.set('graviton', 1.27); shield.externalDamageTakenMultiplier = () => 1.13; shield.energyDamageTakenMultiplier = 1.07;
      if ([2, 20].includes(scene) && i === 1) shield.configureVoidShield({ layers: 1, integrityPerLayer: 30, rechargePerSecond: 0, hitDelay: .4, restartDelay: 1 });
      const system = new ShipSystem('NONE');
      Object.assign(s, { id: String(i + 1), teamId: i === 0 ? 0 : 1, isPlayer: i === 0, spec, pos: new Vector2(i === 0 ? -1000 : i === 1 ? 100 : scene === 9 ? 160 : 240, i === 2 && scene === 9 ? 30 : 0),
        vel: new Vector2(i * 2, -i), prevPos: new Vector2(), facingRad: 0, angularVelRad: 0, hullHp: 10000,
        hullStats: { hitpoints: 10000, damageToFightersPercent: 0, damageToFightersMultiplier: 1, damageToFrigatesPercent: 0, damageToDestroyersPercent: 0, damageToCruisersPercent: 0, damageToMissilesPercent: 0, damageToMissilesMultiplier: 1,
          explosionDamageMultiplier: 0, explosionRadiusMultiplier: 1, breakProbability: 0 }, armor, damageDecals: decals, flux, shield, isDead: false, parentShip: null, childModules: [], moduleMount: null,
        isRetreated: false, hullDamageSuppressed: false, hullDamageInterceptors: new Set(), system, defenseSystem: new ShipSystem('NONE'), systems: [system], externalPhaseEffects: new Map(),
        runtimeModifiers: { value: {} }, damageTakenModifiers: new Map(), weaponDamageTakenMultiplier: 1.13, engineDamageTakenMultiplier: 1.19,
        weaponControl: { weapons: [mount], damageComponent: (m: WeaponMount, d: number) => damageWeaponComponent(m, d, random) },
        clearInput: () => {}, updateScorchMarks: () => {}, getShieldCenter: () => s.pos.clone(), shipName: `ship${i + 1}`, encounterEffects: { emergencyPhaseDiveUsed: false }, ecmRangePenalty: 0 });
      Object.defineProperties(s, { crDamageTakenMultiplier: { value: 1.13 }, crDamageDealtMultiplier: { value: 1 }, effectiveEmpDamageTakenMultiplier: { value: 1.23 }, damageToTargetWeaponsMultiplier: { value: 1.17 }, damageToTargetEnginesMultiplier: { value: 1.09 }, hasVastBulk: { value: false }, subjectiveTimeMultiplier: { value: 1 } });
      s.system.getShieldDamageMultiplier = () => 1.11;
      flux.onOverloadStarted = () => { if (shield.voidShield) { shield.voidShield.suppressed = true; shield.isActive = false; shield.currentArcDeg = 0; } else shield.setActive(false); };
      if (scene === 6 && i === 1 || scene === 8 && i === 1) for (let r = 0; r < armor.rows; r++) for (let c = 0; c < armor.cols; c++) armor.setCell(c, r, 0);
      if (scene === 8 && i === 1) s.hullHp = 12;
      ships.push(s);
    }
    const blast = { radius: 85, coreRadius: 70, duration: .1, minDamageFraction: 0, collisionClass: 'HITS_SHIPS_AND_ASTEROIDS' } as NonNullable<Projectile['projectileExplosionSpec']>;
    const shot = (serial: number, source: number, x: number, y: number, speed: number, damage: number, kind: Projectile['damageType'] = 'ENERGY') => ({ id: serial / 100, sourceShipId: String(source), teamId: source - 1, isPlayer: source === 1,
      slotId: '1', pos: new Vector2(x, y), prevPos: new Vector2(x, y), vel: new Vector2(speed, 0), facingRad: 0, radius: 2, damage, baseDamage: damage, empDamage: 13,
      damageType: kind, sourceWeaponType: 'ENERGY', specId: 'fixture', spawnType: 'ORDINARY', projLength: 10, rangeRemaining: 1000, totalRange: 1000, elapsedTime: 0,
      spawnLocation: new Vector2(x, y), hitGlowRadius: 18, fringeColor: [200, 130, 90, 255], color: [200, 130, 90], sourceMoveSpeed: speed, inheritedShipVelocity: new Vector2(),
      unfadedDamage: damage, unfadedEmp: 13, tailPos: new Vector2(x, y), tailPosPrevFrame: new Vector2(x, y), fadeProgress: 0, prevFadeProgress: 0 } as unknown as Projectile);
    const p = shot(1, 1, 0, 0, 2000, scene === 5 ? 75 : scene === 17 ? 470 : 220, scene === 3 ? 'KINETIC' : scene === 4 ? 'HIGH_EXPLOSIVE' : scene === 5 ? 'FRAGMENTATION' : 'ENERGY');
    if ([7, 8].includes(scene)) { p.passThroughFighters = true; p.passThroughFightersOnlyWhenDestroyed = scene === 8; }
    if (scene === 9) p.projectileExplosionSpec = blast;
    if ([10, 11].includes(scene)) { p.proximityFuse = { range: 150, explosionRadius: 90 }; if (scene === 11) p.proximityExplosionSpec = blast; }
    if ([10, 12, 13].includes(scene)) { const m = shot(2, 2, 40, 0, 0, 10); m.isRocket = true; m.empDamage = 0; m.armedWhileFizzling = true; m.hitpoints = scene === 12 ? 500 : 50; weapon.projectiles.push(m);
      if (scene === 13) { const m = shot(3, 2, 55, 0, 0, 10); m.isRocket = true; m.empDamage = 0; m.armedWhileFizzling = true; m.hitpoints = 60; weapon.projectiles.push(m); p.passThroughMissiles = true; } }
    const terrainPenetration = { maxRadius: 30, minDamageCost: 20, wreckDamagePerRadius: 1 };
    if ([14, 15].includes(scene)) { p.specId = 'weapon-world-terrain'; if (!contentRegistry.getWeapon(p.specId)) contentRegistry.registerWeapon({ id: p.specId, nameKey: 'terrain fixture', terrainPenetration,
      type: 'ENERGY', mountSize: 'SMALL', weaponType: 'ENERGY', isBeam: false, damagePerShot: 220, damagePerSecond: 0, fluxPerShot: 0, range: 1000, refireDelay: 1, projSpeed: 2000, projRadius: 2, color: [200, 130, 90] } as WeaponSpec, false); }
    if (scene === 14) fx.hulkFragments.push({ id: 1, sourceShip: ships[0], pos: new Vector2(40, 0), vel: new Vector2(2, 3), facingRad: 0, localOffset: new Vector2(), collisionRadius: 13,
      bounds: [[-8, -10], [8, -10], [8, 10], [-8, 10]].map(([x, y]) => new Vector2(x, y)) } as WeaponSimContext['hulkFragments'][number]);
    if (scene === 15) asteroids.asteroids.push({ id: 1, pos: new Vector2(40, 0), vel: new Vector2(2, 3), facingRad: 0, angularVel: 0, radius: 10, mass: 100, hp: 35, maxHp: 35, spriteUrl: '/fixture' });
    if (scene === 16) { p.spawnType = 'BALLISTIC_AS_BEAM'; p.projLength = 30; p.fadeTime = .15; }
    if (scene === 17) p.specId = 'web_adun_solar_lance';
    if (scene === 25) { p.isMine = true; p.isRocket = true; p.flightTimeRemaining = .01; }
    if (scene === 26) { const m = shot(2, 2, 40, 0, 2000, 10); m.isMine = true; m.isRocket = true; m.hitpoints = 50; m.flightTimeRemaining = .01; weapon.projectiles.push(m); }
    if ([27, 28].includes(scene)) {
      p.pos.set(100, 0); p.prevPos.copy(p.pos); p.spawnLocation = p.pos.clone(); p.vel.set(0, 0); p.sourceMoveSpeed = 0; p.rangeRemaining = 0;
      p.isRocket = true; p.inertialFlight = true; p.missileLifecycleSpec = { dudProbabilityOnFlameout: .3, flameoutTime: 0, fadeTime: 0, noEngineGlowTime: 0, fizzleOnReachingWeaponRange: false, noCollisionWhileFading: false, reduceDamageWhileFading: false, collisionClassAfterFlameout: 'NONE' };
      p.systemFuseSeconds = scene === 27 ? .3 : .1; p.systemFadeInSeconds = .2; p.systemExplosionSound = 'missile_explosion'; p.collisionDisabled = true;
      p.missileExplosionVisualSpec = { radius: 23, color: [90, 150, 220, 255], useHitGlowWhenDealingDamage: true }; p.projectileExplosionSpec = blast;
      ships[0].pos.x = 100; ships[1].pos.x = 110; ships[2].pos.x = 160;
    }
    if ([29, 30].includes(scene)) { p.rangeRemaining = 100; p.fizzleAtRange = scene === 29; }
    if ([31, 32].includes(scene)) { p.isRocket = true; p.inertialFlight = true; if (scene === 31) { p.armedWhileFizzling = true; p.missileLifecycleSpec = { dudProbabilityOnFlameout: .3, flameoutTime: 0, fadeTime: 0, noEngineGlowTime: 0, fizzleOnReachingWeaponRange: false, noCollisionWhileFading: false, reduceDamageWhileFading: false, collisionClassAfterFlameout: 'NONE' }; } else p.flightTimeRemaining = .05; }
    weapon.projectiles.push(p);
    const residentWitness = [...weapon.projectiles];
    if (scene >= 18 && scene <= 24) {
      weapon.projectiles.length = 0; ships[0].pos.x = 0;
      const mount = ships[0].weapons[0]; mount.relativePos.set(0, 0); mount.currentAngleRad = 0; mount.firingState = scene === 22 ? 'CHARGEDOWN' : 'ACTIVE'; mount.firingStateTimer = scene === 22 ? .08 : 1; mount.firingCycleId = 1;
      Object.assign(mount.spec, { weaponType: 'ENERGY', isBeam: true, range: 300, projSpeed: 1400, beamSpeed: 1400, damagePerSecond: 800, empPerSecond: 13, beamSourceChargeupTime: .2, beamSourceChargedownTime: .3, beamVisualMode: scene === 22 ? 'BURST' : 'SUSTAINED' });
      weapon.beams.push({ id: .01, sourceShipId: '1', isPlayer: true, teamId: 0, specId: 'fixture', slotId: '1', firingCycleId: 1, startPos: new Vector2(), endPos: new Vector2(300, 0),
        barrelOffset: { x: 0, y: 0 }, damagePerSec: 800, baseDamagePerSec: 800, empPerSec: 13, damageType: 'ENERGY', duration: 1, maxDuration: 1, elapsedTime: 0, width: 4,
        hitGlowSizeMult: 1, color: [255, 100, 50], damageActive: scene !== 23 } as Beam);
      if (scene === 21) { const m = shot(2, 2, 40, 0, 0, 10); m.isRocket = true; m.armedWhileFizzling = true; m.hitpoints = 50; weapon.projectiles.push(m); }
      if (scene === 24) ships[0].isDead = true;
    }
    const armorSparks = fx.spawnArmorDamageSparks.bind(fx); fx.spawnArmorDamageSparks = (...a) => { const first = fx.particles.length; armorSparks(...a); if (!a[0].damageDecals.suppressed) record([0, fx.particles.length - first, ...fx.particles.slice(first).flatMap(p => [p.pos.x, p.pos.y, p.vel.x, p.vel.y, p.size])], Array.from({ length: fx.particles.length - first }, (_, i) => [2 + i * 5, 3 + i * 5, 4 + i * 5, 5 + i * 5]).flat()); };
    const debris = fx.spawnDebris.bind(fx); fx.spawnDebris = (...a) => { const first = fx.debris.length; debris(...a); const particles = fx.debris.slice(first); record([1, ['small', 'medium', 'large'].indexOf(a[4] ?? 'small'), particles.length,
      ...particles.flatMap(d => [d.pos.x, d.pos.y, d.vel.x, d.vel.y, d.rotation, d.angularVel, d.size, d.life, ...d.color, Number(d.spriteUrl!.match(/(?:sml|med|lrg)(\d)/)![1]), +!!d.isGlowing])], particles.flatMap((_, i) => [3, 4, 5, 6, 7].map(n => n + i * 13))); };
    const sparks = fx.spawnSparks.bind(fx); fx.spawnSparks = (...a) => { const first = fx.particles.length; sparks(...a); const particles = fx.particles.slice(first); record([2, particles.length, ...particles.flatMap(p => [p.pos.x, p.pos.y, p.vel.x, p.vel.y, p.life, p.size, p.endSize!, ...p.color, p.peakAlpha!, p.drag!, p.rotation!, p.stretch!])], particles.flatMap((_, i) => [2, 3, 4, 5, 14].map(n => n + i * 14))); };
    const explosion = fx.spawnAuthenticExplosion.bind(fx); fx.spawnAuthenticExplosion = (...a) => { explosion(...a); const x = fx.explosions.at(-1)!; record([3, x.id, x.pos.x, x.pos.y, x.maxRadius, x.maxLife, x.rotation, +!!x.hasShockwaveRing, x.puffs!.length,
      ...x.puffs!.flatMap(p => [p.texture, p.startSize, p.endSize, p.rotation, p.offset.x, p.offset.y, p.velocity.x, p.velocity.y])], [2, 3, 6, ...x.puffs!.flatMap((_, i) => [12, 13, 14, 15, 16].map(n => n + i * 8))]); };
    const damageText = fx.addFloatingDamage.bind(fx); fx.addFloatingDamage = (...a) => { const before = visual.checkpointWitness()[1]; damageText(...a); if (a[1] >= 1) { const x = fx.floatingTexts.find(f => f.life > .15 && f.color.every((v, i) => v === a[2][i]) && (visual.checkpointWitness()[1] === before ? f.pos.distanceTo(a[0]) < 75 : f === fx.floatingTexts.at(-1)))!; record([4, x.id, Number(x.text)]); } };
    const text = fx.addFloatingText.bind(fx); fx.addFloatingText = (...a) => { text(...a); record([4, fx.floatingTexts.at(-1)!.id, -1]); };
    const glows = fx.spawnProjectileHitGlows.bind(fx); fx.spawnProjectileHitGlows = (...a) => { const first = fx.hitGlows.length; glows(...a); const g = fx.hitGlows.slice(first); if (g.length) record([8, g.length, ...g.flatMap(p => [p.id, p.pos.x, p.pos.y, p.vel.x, p.vel.y, p.diameter, p.life, p.peakAlpha, ...p.color, p.spriteUrl ? scene === 17 ? 1 : 0 : 0])], g.flatMap((_, i) => [3, 4, 5, 6].map(n => n + i * 12))); };
    const missileExplosion = fx.spawnSourceMissileExplosion.bind(fx); fx.spawnSourceMissileExplosion = (...a) => { missileExplosion(...a); const x = fx.explosions.at(-1)!; record([10, x.id, x.pos.x, x.pos.y, x.maxRadius, x.maxLife, x.rotation, ...x.color], [2, 3, 6]); };
    const fade = fx.spawnMovingRayImpactFade.bind(fx); fx.spawnMovingRayImpactFade = (...a) => { const first = fx.movingRayFades.length; fade(...a); if (fx.movingRayFades.length > first) throw Error('Unexpected moving ray fixture'); };
    const ctx = { playerShip: ships[0], enemyShip: ships[1], ships, capitalShips: ships.filter(s => s.spec.hullSize !== 'FIGHTER'), fighters: ships.filter(s => s.spec.hullSize === 'FIGHTER'),
      projectiles: weapon.projectiles, hulkFragments: fx.hulkFragments, fx, random, visualRandom: visual, statsTracker: stats, asteroids: asteroids.asteroids,
      addCameraShake: (n: number, d: number) => record([6, n, d]), addRadioMessage: () => {}, contrailEngine: { append: () => {}, detach: (id: number) => record([7, id * 100]) },
      queryAsteroidImpact: (p: Projectile) => asteroids.queryProjectileImpact(p), commitAsteroidImpact: (p: Projectile, hit: Parameters<AsteroidSystem['commitProjectileImpact']>[1]) => asteroids.commitProjectileImpact(p, hit, { spawnDebris: fx.spawnDebris.bind(fx), spawnSparks: fx.spawnSparks.bind(fx), spawnAuthenticExplosion: fx.spawnAuthenticExplosion.bind(fx), detachContrail: (id: number) => { record([7, id * 100]); }, spawnShieldRipple: fx.spawnShieldRipple.bind(fx), addFloatingDamage: fx.addFloatingDamage.bind(fx), addFloatingText: fx.addFloatingText.bind(fx), spawnArmorDamageSparks: fx.spawnArmorDamageSparks.bind(fx), getPlayerPos: () => ships[0].pos }),
      handleShipDestruction: (s: Ship) => (engine as unknown as { handleShipDestruction(s: Ship): void }).handleShipDestruction(s) } as unknown as WeaponSimContext;
    const engine = Object.create(CombatEngine.prototype) as CombatEngine;
    Object.assign(engine, { suppressDestructionSideEffects: false, transientCombatShips: new Set(), shipLossNotifications: [], combatTime: 0, aftermathTime: 0,
      playerShip: ships[0], enemyShip: scene === 8 ? undefined : ships[1], fxSystem: fx, random, visualRandom: visual, statsTracker: stats, weaponSystem: weapon,
      addRadioMessage: () => {}, addFloatingText: fx.addFloatingText.bind(fx), spawnDebris: fx.spawnDebris.bind(fx), addCameraShake: ctx.addCameraShake, getWeaponSimContext: () => ctx });
    const release = captureCombatAudio(a => { if (a.kind === 'play' && a.position && sounds.includes(a.key)) record([5, sounds.indexOf(a.key), a.position[0], a.position[1], a.volume], [2, 3]); });
    try { for (let tick = 0; tick < (scene === 16 ? 4 : scene >= 18 && scene <= 24 ? 5 : 1); tick++) { if (scene < 18 || scene > 24) weapon.updateProjectiles(.1, ctx); else weapon.updateBeams(.1, ctx); } } finally { release(); }
    [random.checkpointWitness()[1], visual.checkpointWitness()[1], visual.checkpointWitness()[2]].forEach((v, i) => put(v, false, 'rng' + i));
    for (const s of ships) {
      [s.hullHp, s.flux.hardFlux, s.flux.softFlux, +s.flux.isOverloaded, s.flux.overloadTimer, +s.shield.isActive, s.shield.currentArcDeg, s.shield.sinceLastDamageTaken, +s.isDead].forEach((v, i) => put(v, false, `ship${s.id} field${i}`));
      s.armor.copyCells().forEach(v => put(v)); const m = s.weapons[0], h = m.healthTracker;
      [1, 0, 0, s.id === '1' && scene >= 18 && scene <= 24 ? -20 : m.relativePos.x, m.relativePos.y, m.health, m.maxHealth, +m.isDisabled, +m.isPermanentlyDisabled, m.disabledDuration, m.disabledTimer, +!!h, h?.repairDuration ?? 0, h?.hitAgo ?? 0, h?.interval ?? 0, h?.elapsed ?? 0, +!!h?.intervalElapsed, 1, 1, 0].forEach(v => put(v));
      [s.shield.voidShield?.integrity ?? 0, s.shield.voidShield?.quietRemaining ?? 0, s.shield.voidShield?.restartRemaining ?? 0, s.shield.voidShield?.breaks ?? 0].forEach(v => put(v));
    }
    for (const side of [stats.playerStats, stats.enemyStats]) statsKeys.forEach(k => put(side[k], false, k));
    put(weapon.projectiles.length); for (const p of weapon.projectiles) { [p.id * 100, p.pos.x, p.pos.y, p.prevPos.x, p.prevPos.y, p.damage, p.empDamage ?? 0, p.baseDamage ?? p.damage, p.rangeRemaining, p.elapsedTime, p.fadeProgress ?? 0, +!!p.didDamage, p.hitpoints ?? 100,
      p.damagedTargetIds?.filter(k => k.startsWith('projectile:')).length ?? 0, p.damagedTargetIds?.filter(k => !k.includes(':')).length ?? 0, p.damagedTargetIds?.filter(k => k.startsWith('terrain:asteroid:')).length ?? 0, p.damagedTargetIds?.filter(k => k.startsWith('terrain:wreck:')).length ?? 0, +!!p.voidShieldHitRecorded, +!!p.systemFuseTriggered, p.armedWhileFizzling === undefined ? -1 : +p.armedWhileFizzling].forEach((v, i) => put(v, i >= 1 && i <= 4, 'projectile' + i)); }
    if (scene >= 25) { const retired = residentWitness.filter(p => !weapon.projectiles.includes(p)); put(retired.length); for (const p of retired) [p.id * 100, p.pos.x, p.pos.y, p.prevPos.x, p.prevPos.y, p.elapsedTime, p.rangeRemaining, p.flightTimeRemaining ?? -1, p.fadeProgress ?? 0, +!!p.didDamage, +!!p.systemFuseTriggered, p.armedWhileFizzling === undefined ? -1 : +p.armedWhileFizzling].forEach((v, i) => put(v, i >= 1 && i <= 4, 'retired' + i)); }
    put(weapon.beams.length); for (const b of weapon.beams) [b.startPos.x, b.startPos.y, b.endPos.x, b.endPos.y, b.elapsedTime, b.duration, b.damagePerSec, b.empPerSec ?? 0, b.brightness ?? 1, +!!b.isHitting, b.elapsedSinceDamage ?? 0,
      b.accumulatedBrightness ?? 0, b.dpsDuration ?? 0, b.damageMultiplier ?? 0, +!!b.hasRecordedHit, +!!b.wasShortened, b.hitGlowBrightness ?? 0, b.hitGlowSizeMult ?? 1, b.contactSurface === 'SHIELD' ? 1 : b.contactSurface === 'HULL' ? 2 : 0, b.contactFxCooldown ?? 0, b.contactSoundCooldown ?? 0].forEach((v, i) => put(v, i < 4, 'beam' + i));
    put(weapon.explosions.active.length); for (const x of weapon.explosions.active) [x.pos.x, x.pos.y, x.life, x.ships.size, x.asteroids.size, x.missiles.size].forEach((v, i) => put(v, i < 2, 'blast' + i));
    put(asteroids.asteroids.length); for (const a of asteroids.asteroids) [a.id, a.hp, a.pos.x, a.pos.y, a.vel.x, a.vel.y].forEach((v, i) => put(v, i >= 2));
    put(fx.floatingTexts.length); for (const x of fx.floatingTexts) [x.id, x.pos.x, x.pos.y, x.vel.x, x.vel.y, Number.isFinite(Number(x.text)) ? Number(x.text) : -1, x.size, x.life, x.maxLife, ...x.color].forEach((v, i) => put(v, i >= 1 && i <= 4, 'float' + i));
    put(rows.length); orderedEvents += rows.length; for (const { v, g } of rows) { put(v.length); v.forEach((n, i) => put(n, g.includes(i), 'event ' + v[0] + ' field ' + i)); }
    const ptr = wasm.test_input(1); new Float64Array(wasm.memory.buffer, ptr, 1).set([scene]); const result = wasm.test_run(); const actual = Array.from(new Float64Array(wasm.memory.buffer, result, wasm.test_output_words()));
    if (actual.length !== expected.length) { const differences = actual.flatMap((a, i) => Object.is(a, expected[i]) ? [] : [`${i} ${labels[i]} ${a}/${expected[i]}`]).slice(0, 12); failures.push(`scene ${scene} length ${actual.length} expected ${expected.length}\n${differences.join('\n')}\nrecords ${JSON.stringify(rows.map(x => [x.v[0], x.v.length]))}`); continue; }
    try { actual.forEach((a, i) => { const b = expected[i], label = `scene ${scene} word ${i} ${labels[i]}`; if (!geometric[i]) { strict++; if (!Object.is(a, b)) throw Error(`${label} strict ${a} expected ${b}`); return; }
      geometry++; if (Object.is(a, b)) return; const difference = Math.abs(a - b), limit = Math.max(1e-9, 32 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b)));
      if (!Number.isFinite(a) || !Number.isFinite(b) || difference > limit) throw Error(`${label} geometry ${a} expected ${b}`); maximumDifference = Math.max(maximumDifference, difference); geometryLog.push({ label, difference }); }); } catch (error) { failures.push(String(error)); }
  }
  // Execute the exact in-tree closure rather than maintaining a copied expected
  // upsert. Its caller is the actual private ShipWeaponControlSystem lifecycle.
  const begin = combatEngineSource.indexOf('const spawnBeam = (b: Beam) => {'), end = combatEngineSource.indexOf('    const spawnFlash =', begin);
  if (begin < 0 || end < 0) throw Error('Actual CombatEngine beam closure not located');
  const factory = new Function('clearEffectState', combatEngineSource.slice(begin, end).replace('(b: Beam)', '(b)') + '\nreturn spawnBeam;') as (this: { beams: Beam[]; statsTracker: CombatStatsTracker }, clear: typeof clearEffectState) => (beam: Beam) => void;
  let beamRefreshes = 0;
  for (let mode = 0; mode < 2; mode++) {
    const random = new SimulationRandom(8127), stats = new CombatStatsTracker(), beams: Beam[] = [], control = new ShipWeaponControlSystem(random), s = Object.create(Ship.prototype) as Ship;
    const system = new ShipSystem('NONE'), flux = new FluxTracker(10000, 0, 'FRIGATE');
    Object.assign(s, { id: '1', teamId: 0, isPlayer: true, pos: new Vector2(), vel: new Vector2(), facingRad: 0, flux, system, sourceCarrier: undefined,
      spec: { id: 'fixture', hullSize: 'FRIGATE', hullMods: [], builtInHullMods: [], weaponSlots: [] }, ecmRangePenalty: 0 });
    Object.defineProperty(s, 'crDamageDealtMultiplier', { value: 1 });
    const spec = { id: 'fixture', type: 'ENERGY', weaponType: 'ENERGY', mountSize: 'SMALL', isBeam: true, beamVisualMode: 'BURST',
      beamSourceChargeupTime: .2, beamSourceChargedownTime: .3, beamDuration: .25, damagePerSecond: 800, empPerSecond: 13,
      refireDelay: .4, fluxPerShot: 0, range: 300, projSpeed: 0, beamWidth: 4, color: [255, 100, 50] } as WeaponSpec;
    const mount = { spec, slotId: '1', mountType: 'TURRET', relativePos: new Vector2(), currentAngleRad: 0, ammo: Infinity, cooldownTimer: 0,
      firingState: 'IDLE', firingStateTimer: 0, firingCycleId: 0, triggerHeld: false, recoil: 0, glowAlpha: 0, currentSpreadDeg: 0, barrelIndex: 0 } as WeaponMount;
    control.weapons.push(mount);
    const methods = control as unknown as { requestWeaponFire(m: WeaponMount, s: Ship, p: (p: Projectile) => void, b: (b: Beam) => void): boolean; advanceWeaponLifecycle(dt: number, m: WeaponMount, s: Ship, can: boolean, p: (p: Projectile) => void, b: (b: Beam) => void): void };
    const upsert = factory.call({ beams, statsTracker: stats }, clearEffectState), expected: number[] = [], geometric: boolean[] = [];
    let serial = 0;
    for (let step = 0; step < 5; step++) {
      if (step === 1) Object.assign(beams[0], { startPos: new Vector2(5, 6), endPos: new Vector2(75, 8), elapsedTime: .12,
        elapsedSinceDamage: .04, accumulatedBrightness: .012, dpsDuration: .1, damageMultiplier: .7, hasRecordedHit: true,
        wasShortened: true, hitGlowBrightness: .8, hitGlowSizeMult: 1.2, contactSurface: 'SHIELD', contactFxCooldown: .02, contactSoundCooldown: .09, damageActive: mode === 0 });
      if (step === 3) { mount.cooldownTimer = 0; mount.firingState = 'IDLE'; mount.firingStateTimer = 0; }
      mount.triggerHeld = true;
      const events: number[] = [], spawn = (b: Beam) => { const previous = beams.find(e => e.sourceShipId === b.sourceShipId && e.slotId === b.slotId);
        const began = !previous || previous.firingCycleId !== b.firingCycleId || previous.damageActive === false;
        if (!previous) serial++; upsert(b); events.push(began ? 41 : 46); };
      const noProjectile = () => { throw Error('Beam source emitted a projectile'); };
      if (step === 0 || step === 3) methods.requestWeaponFire(mount, s, noProjectile, spawn);
      methods.advanceWeaponLifecycle(step === 1 ? .21 : 0, mount, s, step !== 2, noProjectile, spawn);
      const b = beams[0], row = [random.checkpointWitness()[1], serial, beams.length, 1, b.firingCycleId!, b.startPos.x, b.startPos.y, b.endPos.x, b.endPos.y, b.elapsedTime,
        b.duration, b.damagePerSec, b.baseDamagePerSec!, b.empPerSec!, b.baseEmpPerSec!, +(b.elapsedSinceDamage !== undefined), b.elapsedSinceDamage ?? 0, b.accumulatedBrightness ?? 0,
        b.dpsDuration ?? 0, b.damageMultiplier ?? 0, +!!b.hasRecordedHit, +!!b.wasShortened, b.hitGlowBrightness ?? 0, b.hitGlowSizeMult ?? 1,
        b.contactSurface === 'SHIELD' ? 1 : b.contactSurface === 'HULL' ? 2 : 0, b.contactFxCooldown ?? 0, b.contactSoundCooldown ?? 0, +!!b.damageActive, stats.playerStats.shotsFired, events.length, ...events];
      row.forEach((v, i) => { expected.push(v); geometric.push(i >= 5 && i <= 8); }); beamRefreshes += events.filter(e => e === 46).length;
    }
    const ptr = wasm.test_input(1); new Float64Array(wasm.memory.buffer, ptr, 1).set([mode]); const result = wasm.test_beam_refresh(); const actual = new Float64Array(wasm.memory.buffer, result, wasm.test_output_words());
    if (actual.length !== expected.length) throw Error(`beam refresh mode${mode} length ${actual.length}/${expected.length}`);
    actual.forEach((a, i) => { const b = expected[i], delta = Math.abs(a - b), label = `beam refresh mode${mode} word${i}`;
      if (geometric[i]) { geometry++; if (delta > Math.max(1e-9, 32 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b)))) throw Error(`${label} geometry ${a}/${b}`); maximumDifference = Math.max(maximumDifference, delta); }
      else { strict++; if (!Object.is(a, b)) throw Error(`${label} strict ${a}/${b}`); } });
  }
  if (failures.length) throw Error(failures.join('\n'));
  return { passed: true, scenes: 33, beamRefreshScenarios: 2, beamRefreshes, strictFields: strict, geometryFields: geometry, orderedEvents, maximumDifference, geometryLog, actualResidentWeaponWorld: true, actualTsWeaponLoop: true, actualCombatEngineBeamClosure: true, actualDamageAndFactories: true, productionIntegrated: false };
}
