import { Ship } from '../../src/engine/simulation/Ship';
import { ArmorGrid } from '../../src/engine/simulation/ArmorGrid';
import { ShipDamageState } from '../../src/engine/simulation/ShipDamageState';
import { FluxTracker } from '../../src/engine/simulation/FluxTracker';
import { Shield } from '../../src/engine/simulation/Shield';
import { ShipSystem } from '../../src/engine/simulation/ShipSystem';
import { SimulationRandom } from '../../src/engine/simulation/SimulationRandom';
import { Vector2 } from '../../src/engine/math/Vector2';
import { CombatFXSystem } from '../../src/engine/simulation/systems/CombatFXSystem';
import { AsteroidSystem } from '../../src/engine/simulation/systems/AsteroidSystem';
import { NebulaSystem } from '../../src/engine/simulation/systems/NebulaSystem';
import { ShipCollisionSystem } from '../../src/engine/simulation/systems/ShipCollisionSystem';
import { ProjectileCollisionHandler } from '../../src/engine/simulation/systems/weapon/ProjectileCollisionHandler';
import { ProjectileExplosionSystem } from '../../src/engine/simulation/systems/weapon/ProjectileExplosionSystem';
import { damageWeaponComponent } from '../../src/engine/simulation/systems/weapon/WeaponComponentHealth';
import { captureCombatAudio } from '../../src/engine/audio/CombatAudioEvents';
import type { WeaponMount, Projectile } from '../../src/engine/simulation/Weapon';
import type { WeaponSimContext } from '../../src/engine/simulation/systems/weapon/WeaponSimContext';
interface Exports extends WebAssembly.Exports { memory: WebAssembly.Memory; test_input(n: number): number; test_run(): number; test_contracts(): number; test_output_words(): number }
export async function checkRustTerrainOwner(source: BufferSource) {
  const { instance } = await WebAssembly.instantiate(source, {}), wasm = instance.exports as Exports;
  let strict = 0, geometry = 0, maximumDifference = 0, events = 0;
  const geometryLog: { label: string; difference: number }[] = [];
  for (let scene = 0; scene < 15; scene++) {
    const random = new SimulationRandom(8127), visual = new SimulationRandom(15181), fx = new CombatFXSystem(visual), asteroid = new AsteroidSystem(random, visual);
    const rows: number[][] = [], ships: Ship[] = [], expected: number[] = [], geometric: boolean[] = [];
    const put = (v: number, g = false) => { expected.push(v); geometric.push(g); };
    for (let i = 0; i < 3; i++) {
      const armor = new ArmorGrid(9, 7, 10, 10, 27, -45, -35), decals = new ShipDamageState(armor, visual), flux = new FluxTracker(scene === 1 && i === 0 ? 100 : 100000, 0, 'FRIGATE');
      armor.onCellDamage = (c, r, d) => decals.onCellDamage(c, r, d);
      if (scene === 14) decals.suppressed = true;
      const mount = { slotId: '1', mountType: 'TURRET', relativePos: new Vector2(3, -4), spec: { mountSize: 'SMALL' }, health: 250, maxHealth: 250,
        isDisabled: false, isPermanentlyDisabled: false, disabledDuration: 0, disabledTimer: 0 } as WeaponMount;
      const s = Object.create(Ship.prototype) as Ship, shield = new Shield(scene === 4 ? 'FRONT' : 'OMNI', scene === 4 ? 80 : 360, 33, .83);
      Object.assign(shield, { isActive: [0, 1, 3, 4].includes(scene), currentArcDeg: scene === 4 ? 80 : 360, facingAngleRad: i === 0 ? .1 : 3.2 });
      if (scene === 3) shield.configureVoidShield({ layers: 2, integrityPerLayer: 50, rechargePerSecond: 0, hitDelay: .4, restartDelay: 1 });
      Object.assign(s, { id: String(i + 1), teamId: i === 2 ? 0 : i, isPlayer: i === 0, pos: new Vector2(i === 0 ? 0 : i === 1 ? 24 : 300, i === 1 ? 9 : 0), vel: new Vector2(i === 0 ? 75 : -15, i === 0 ? 3 : -2), facingRad: i === 0 ? .27 : -.37, angularVelRad: i === 0 ? .17 : .07,
        spec: { hullSize: 'FRIGATE', collisionRadius: 30, bounds: [[-30, -20], [30, -20], [30, 20], [-30, 20]], mass: i === 0 ? 500 : 200, engineSlots: [], spriteHeight: 250, moduleAnchor: [0, 0], sourceHullTraits: scene === 2 && i === 1 ? ['STATION'] : scene === 6 && i === 2 ? ['INDEPENDENT_ROTATION'] : [],
          weaponSlots: [{ slotId: '1', x: -50, y: 0 }, { slotId: '2', x: 50, y: 0 }], captainSkills: {} },
        hullHp: 10000, hullStats: { hitpoints: 10000, damageToFightersMultiplier: 1, damageToFightersPercent: 0, damageToFrigatesPercent: 0, damageToDestroyersPercent: 0, damageToCruisersPercent: 0, damageToCapitalsPercent: 0 }, armor, damageDecals: decals, flux, shield, isDead: false, parentShip: null, moduleMount: null, childModules: [],
        isRetreated: false, hullDamageSuppressed: false, hullDamageInterceptors: new Set(), damageTakenModifiers: new Map(),
        getShieldCenter: () => s.pos.clone().add(new Vector2(i === 0 ? 4 : -3, 2).rotate(s.facingRad)), weaponDamageTakenMultiplier: 1.13, engineDamageTakenMultiplier: 1.19,
        system: { getShieldDamageMultiplier: () => 1.11 }, terrainSpeedMult: .3, encounterEffects: { emergencyPhaseDiveUsed: false }, fighterRecall: false,
        weaponControl: { weapons: [mount], damageComponent: (m: WeaponMount, d: number) => damageWeaponComponent(m, d, random) },
      });
      Object.defineProperties(s, { crDamageTakenMultiplier: { value: 1.13 }, effectiveEmpDamageTakenMultiplier: { value: 1.23 }, damageToTargetWeaponsMultiplier: { value: 1.17 }, damageToTargetEnginesMultiplier: { value: 1.09 }, isCollisionless: { value: false }, hasVastBulk: { value: false } });
      flux.onOverloadStarted = () => { if (s.shield.voidShield) { s.shield.voidShield.suppressed = true; s.shield.isActive = false; s.shield.currentArcDeg = 0; } else s.shield.setActive(false); };
      if (scene === 13) {
        Object.assign(shield, { maxArcDeg: 180, currentArcDeg: 80, facingAngleRad: 1.4, closeTimeRemaining: .35 });
        const systems = [new ShipSystem('NONE'), new ShipSystem('NONE')];
        for (const system of systems) Object.assign(system, { state: 'COOLDOWN', isCoolingDown: true, cooldownTimer: .4, stageTimer: .4, disabled: true });
        s.system = systems[0]; Object.defineProperty(s, 'allSystems', { value: systems });
      }
      ships.push(s);
    }
    if (scene >= 5) { ships[2].parentShip = ships[0]; ships[2].moduleMount = { x: 50, y: 12, angleDeg: .4 * 180 / Math.PI, spec: ships[2].spec } as Ship['moduleMount']; ships[0].childModules.push(ships[2]); }
    const armorSparks = (s: Ship, local: Vector2, damage: number) => { const first = fx.particles.length; fx.spawnArmorDamageSparks(s, local, damage); if (!s.damageDecals.suppressed) rows.push([0, fx.particles.length - first]); };
    const debris = (p: Vector2, n = 3, c: [number, number, number] = [120, 110, 100], speed = 90) => { const first = fx.debris.length; fx.spawnDebris(p, n, c, speed); rows.push([1, fx.debris.length - first]); };
    const sparks = (p: Vector2, n = 15, c: [number, number, number] = [255, 200, 100]) => { const first = fx.particles.length; fx.spawnSparks(p, n, c); rows.push([2, fx.particles.length - first]); };
    const explosion = (p: Vector2, radius: number, color: [number, number, number]) => { fx.spawnAuthenticExplosion(p, radius, color); const e = fx.explosions.at(-1)!; rows.push([3, e.id, e.puffs!.length]); };
    const callbacks = { spawnArmorDamageSparks: armorSparks, spawnDebris: debris, spawnSparks: sparks, spawnAuthenticExplosion: explosion,
      addFloatingDamage: (_: Vector2, d: number) => rows.push([4, d]), spawnShieldRipple: (_: Vector2, r: number) => rows.push([5, r]),
      addFloatingText: () => rows.push([8]), getPlayerPos: () => ships[0].pos, detachContrail: (id: number) => rows.push([9, id]), addCameraShake: (n: number, duration: number) => rows.push([7, n, duration]) };
    const release = captureCombatAudio(e => { if (e.kind === 'play' && e.position && ['ship_collision', 'collision_asteroid_ship', 'collision_asteroid_asteroid', 'explosion'].includes(e.key)) rows.push([6, ['ship_collision', 'collision_asteroid_ship', 'collision_asteroid_asteroid', 'explosion'].indexOf(e.key), e.volume]); });
    let hulks = 0, blast = false;
    try {
      if (scene < 8 || scene === 14) { new NebulaSystem().update(ships); put(Number(new ShipCollisionSystem().resolveShipToShipCollision(ships[0], ships[1], callbacks, .017))); }
      else if (scene < 12) { asteroid.asteroids.push({ id: 1, pos: new Vector2(20, 0), vel: new Vector2(-17, 3), facingRad: .37, angularVel: .13, radius: 40, mass: 1200, hp: 600, maxHp: 600, spriteUrl: '/game-assets/graphics/asteroids/asteroid3.png', gravityFixed: scene === 9 }); asteroid.resolveShipCollisions(ships, callbacks); }
      else if (scene === 13) {
        fx.hulkFragments.push({ id: 1, sourceShip: ships[0], age: 0, pos: new Vector2(20, -30), vel: new Vector2(7, -3), facingRad: .27, angularVel: .07,
          localOffset: new Vector2(), bounds: [[-100, -70], [100, -70], [100, 70], [-100, 70]].map(([x, y]) => new Vector2(x, y)), visualBounds: null,
          collisionRadius: 140, mountSlotIds: ['1', '2'], breakup: { remainingSplits: 3, interval: .11, elapsed: 0, nextInterval: .08 } });
        for (let tick = 0; tick < 5; tick++) fx.updateHulkFragments(.13); hulks = fx.hulkFragments.length;
      }
      else {
        const p = { id: .73, sourceShipId: '1', teamId: 0, isPlayer: true, prevPos: new Vector2(-100, 0), pos: new Vector2(100, 0), vel: new Vector2(300, 0), radius: 3, damage: 45, baseDamage: 45, damageType: 'ENERGY', specId: 'fixture', projLength: 0,
          spawnLocation: new Vector2(-100, 0), projectileExplosionSpec: { duration: .1, radius: 210, coreRadius: 200, minDamageFraction: 0, collisionClass: 'HITS_SHIPS_AND_ASTEROIDS' } } as Projectile;
        const hulk = { id: 1, sourceShip: ships[0], pos: new Vector2(), vel: new Vector2(2, 3), facingRad: 0, localOffset: new Vector2(), collisionRadius: 70,
          bounds: [[-60, -30], [60, -30], [60, 30], [-60, 30]].map(([x, y]) => new Vector2(x, y)) } as WeaponSimContext['hulkFragments'][number]; hulks = 1;
        const fxAdapter = { ...callbacks, spawnArmorDamageSparks: armorSparks, spawnProjectileHitGlows: (p: Projectile, pos: Vector2, target: Pick<Ship, 'vel'>, result: Parameters<CombatFXSystem['spawnProjectileHitGlows']>[3]) => fx.spawnProjectileHitGlows(p, pos, target, result), spawnMovingRayImpactFade: (p: Projectile, pos: Vector2) => fx.spawnMovingRayImpactFade(p, pos) };
        const ctx = { playerShip: ships[0], enemyShip: ships[1], ships, fighters: [], capitalShips: ships, hulkFragments: [hulk], asteroids: [], projectiles: [p], fx: fxAdapter,
          addCameraShake: () => {}, handleShipDestruction: () => { throw Error('Unexpected lethal fixture'); } } as unknown as WeaponSimContext;
        const handler = new ProjectileCollisionHandler(), sourceExplosion = new ProjectileExplosionSystem();
        const impact = handler.applyEnvironmentImpact.bind(handler);
        handler.applyEnvironmentImpact = (p, point, velocity, ctx, asteroidId) => { rows.push([10, point.x, point.y, velocity.x, velocity.y, 0, 1]); impact(p, point, velocity, ctx, asteroidId); };
        ctx.spawnProjectileExplosion = (p, point, shipId, asteroidId) => { sourceExplosion.spawn(p, point, ctx, shipId, asteroidId); blast = true; };
        handler.checkHulkCollision(p, ctx);
      }
    } finally { release(); }
    [random.checkpointWitness()[1], visual.checkpointWitness()[1], visual.checkpointWitness()[2]].forEach(v => put(v));
    for (const s of ships) {
      [s.pos.x, s.pos.y, s.vel.x, s.vel.y, s.facingRad, s.angularVelRad].forEach(v => put(v, true));
      [s.hullHp, s.flux.hardFlux, s.flux.softFlux, Number(s.flux.isOverloaded), s.flux.overloadTimer, Number(s.shield.isActive), s.shield.currentArcDeg, s.shield.sinceLastDamageTaken, s.terrainSpeedMult, s.teamId, Number(s.isPlayer)].forEach(v => put(v));
      s.armor.copyCells().forEach(v => put(v)); const m = s.weapons[0], h = m.healthTracker;
      [1, 0, 0, m.relativePos.x, m.relativePos.y, m.health, m.maxHealth, Number(m.isDisabled), Number(m.isPermanentlyDisabled), m.disabledDuration, m.disabledTimer, Number(!!h), h?.repairDuration ?? 0, h?.hitAgo ?? 0, h?.interval ?? 0, h?.elapsed ?? 0, Number(h?.intervalElapsed ?? false), 1, 1, 0].forEach(v => put(v));
      [s.shield.voidShield?.integrity ?? 0, s.shield.voidShield?.quietRemaining ?? 0, s.shield.voidShield?.restartRemaining ?? 0, s.shield.voidShield?.breaks ?? 0].forEach(v => put(v));
      if (scene === 13) {
        [s.shield.facingAngleRad, (s.shield as unknown as { closeTimeRemaining: number }).closeTimeRemaining].forEach((v, i) => put(v, i === 0));
        for (const system of s.allSystems) { const inner = system as unknown as { pendingActivationFlux: number; pendingActivationEvents: number; pendingActiveEvents: number; chargeRegenTimer: number; stageTimer: number; outEntryEffectLevel: number };
          [s.allSystems.indexOf(system) + 1, 1, ['IDLE', 'IN', 'ACTIVE', 'OUT', 'COOLDOWN'].indexOf(system.state), system.effectLevel, Number(system.isActive), Number(system.isCoolingDown), system.activeTimer, system.cooldownTimer, system.charges, system.activationSerial,
            inner.pendingActivationFlux, inner.pendingActivationEvents, inner.pendingActiveEvents, inner.chargeRegenTimer, inner.stageTimer, inner.outEntryEffectLevel, Number(system.disabled)].forEach(v => put(v));
        }
        [s.armor.dirtyVersion, s.damageDecals.revision, (s.damageDecals as unknown as { armorRevision: number }).armorRevision].forEach(v => put(v)); put(s.scorchMarks.length);
        for (const m of s.scorchMarks) [m.cellIndex, m.localPos.x, m.localPos.y, m.opacity, 0, m.heat, Number(m.justHit), m.flash, m.flashElapsed, m.phase, m.pulsePeriod, m.size, m.rotationRad, ['cracks', 'burns', 'holes'].indexOf(m.kind), m.variant].forEach((v, i) => put(v, i === 1 || i === 2 || i === 12));
      }
    }
    put(asteroid.asteroids.length); for (const a of asteroid.asteroids) [a.pos.x, a.pos.y, a.vel.x, a.vel.y, a.hp].forEach((v, i) => put(v, i < 4)); put(hulks); put(Number(blast));
    if (scene === 13) for (const h of fx.hulkFragments) {
      [h.id, h.age, h.pos.x, h.pos.y, h.vel.x, h.vel.y, h.facingRad, h.angularVel, h.localOffset.x, h.localOffset.y, h.collisionRadius, h.breakup ? 1 : 0, h.bounds.length].forEach((v, i) => put(v, i >= 2 && i <= 10));
      for (const p of h.bounds) { put(p.x, true); put(p.y, true); } put(h.visualBounds?.length ?? 0); for (const p of h.visualBounds ?? []) { put(p.x, true); put(p.y, true); } put(h.mountSlotIds.length); h.mountSlotIds.forEach(id => put(Number(id)));
    }
    put(rows.length); events += rows.length; for (const r of rows) { put(r.length); r.forEach((v, i) => put(v, r[0] === 10 && i >= 1 && i <= 4)); }
    const ptr = wasm.test_input(1); new Float64Array(wasm.memory.buffer, ptr, 1).set([scene]); let result: number; try { result = wasm.test_run(); } catch (error) { throw Error(`scene ${scene} Wasm trap: ${String(error)}`, { cause: error }); } const actual = Array.from(new Float64Array(wasm.memory.buffer, result, wasm.test_output_words()));
    if (actual.length !== expected.length) throw Error(`scene ${scene} length ${actual.length} expected ${expected.length}`);
    actual.forEach((a, i) => { const b = expected[i], label = `scene ${scene} word ${i}`; if (!geometric[i]) { strict++; if (!Object.is(a, b)) throw Error(`${label} strict ${a} expected ${b}`); return; }
      geometry++; if (Object.is(a, b)) return; const difference = Math.abs(a - b), limit = Math.max(1e-9, 32 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b)));
      if (!Number.isFinite(a) || !Number.isFinite(b) || difference > limit) throw Error(`${label} geometry ${a} expected ${b}`); maximumDifference = Math.max(maximumDifference, difference); geometryLog.push({ label, difference });
    });
  }
  const contractPtr = wasm.test_contracts(), contracts = Array.from(new Float64Array(wasm.memory.buffer, contractPtr, wasm.test_output_words()));
  if (contracts.some(v => v !== 1) || contracts.length !== 9) throw Error(`Owner contracts failed ${JSON.stringify(contracts)}`);
  strict += contracts.length;
  return { passed: true, scenes: 15, strictFields: strict, geometryFields: geometry, orderedEvents: events, maximumDifference, geometryLog, actualShieldArmorComponents: true, actualModulePose: true, actualImmediateExplosion: true, actualHulkCooldownAndSplit: true, staleGenerationAndRestoreChecks: contracts.length, actualResidentOwner: true, productionIntegrated: false };
}
