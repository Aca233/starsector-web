import { Ship } from '../../src/engine/simulation/Ship';
import { CombatEngine } from '../../src/engine/simulation/CombatEngine';
import { ArmorGrid } from '../../src/engine/simulation/ArmorGrid';
import { ShipDamageState } from '../../src/engine/simulation/ShipDamageState';
import { FluxTracker } from '../../src/engine/simulation/FluxTracker';
import { Shield } from '../../src/engine/simulation/Shield';
import { ShipSystem } from '../../src/engine/simulation/ShipSystem';
import { CombatFXSystem } from '../../src/engine/simulation/systems/CombatFXSystem';
import { CombatStatsTracker } from '../../src/engine/simulation/systems/CombatStatsTracker';
import { ProjectileExplosionSystem } from '../../src/engine/simulation/systems/weapon/ProjectileExplosionSystem';
import { damageWeaponComponent } from '../../src/engine/simulation/systems/weapon/WeaponComponentHealth';
import { SimulationRandom } from '../../src/engine/simulation/SimulationRandom';
import { Vector2 } from '../../src/engine/math/Vector2';
import { captureCombatAudio } from '../../src/engine/audio/CombatAudioEvents';
import type { WeaponMount, Projectile } from '../../src/engine/simulation/Weapon';
import type { ShipLossNotification } from '../../src/engine/simulation/CombatNotifications';
import type { WeaponSimContext } from '../../src/engine/simulation/systems/weapon/WeaponSimContext';
import type { ExplosionAnimation, HulkFragment, Particle } from '../../src/engine/simulation/CombatTypes';
import type { ShipSystemDefinition } from '../../src/engine/extensions/ship-systems/Types';

interface Exports extends WebAssembly.Exports { memory: WebAssembly.Memory; test_input(n: number): number; test_run(): number; test_output_words(): number }
type PrivateSystem = Omit<ShipSystem, never> & { stageTimer: number; pendingActiveEvents: number; pendingActivationEvents: number; pendingActivationFlux: number; outEntryEffectLevel: number };
interface DeathEngine {
  handleShipDestruction(ship: Ship): void;
  shipLossNotifications: ShipLossNotification[];
  suppressDestructionSideEffects: boolean;
  notificationTime: number;
  transientCombatShips: Set<Ship>;
  random: SimulationRandom; visualRandom: SimulationRandom;
  playerShip: Ship; enemyShip: Ship; fxSystem: CombatFXSystem;
  statsTracker: CombatStatsTracker;
}
interface ExplosionState { projectile: Projectile; life: number; ships: Set<string> }
const sizes = ['FIGHTER', 'FRIGATE', 'DESTROYER', 'CRUISER', 'CAPITAL_SHIP'] as const;
const kinds = ['ENERGY', 'KINETIC', 'HIGH_EXPLOSIVE', 'FRAGMENTATION'] as const;
const statKeys = ['totalDamageDealt', 'kineticDamage', 'heDamage', 'energyDamage', 'fragDamage', 'shieldDamageAbsorbed', 'armorDamageSoaked', 'hullDamageDealt', 'hullDamageTaken', 'shotsFired', 'shotsHit', 'empDamageDealt', 'missilesIntercepted', 'fightersDestroyed', 'fightersLost', 'fightersRebuilt', 'overloadsInflicted', 'overloadsSuffered'] as const;

export async function checkRustWorldDamage(source: BufferSource) {
  if (typeof Ship !== 'function' || typeof CombatEngine !== 'function') throw Error('Actual source initialization failed');
  const { instance } = await WebAssembly.instantiate(source, {}), wasm = instance.exports as Exports;
  let strict = 0, geometry = 0, maximumDifference = 0, events = 0, chainedExplosions = 0;
  const geometryLog: { label: string; actual: number; expected: number; difference: number }[] = [];
  const compare = (actual: number, expected: number, label: string, geometric: boolean) => {
    if (!geometric) { strict++; if (!Object.is(actual, expected)) throw Error(`${label}: ${actual} differs from ${expected}`); return; }
    geometry++; if (Object.is(actual, expected)) return;
    const difference = Math.abs(actual - expected), limit = Math.max(1e-9, 32 * Number.EPSILON * Math.max(1, Math.abs(actual), Math.abs(expected)));
    if (!Number.isFinite(actual) || !Number.isFinite(expected) || difference > limit) throw Error(`${label}: geometry ${actual} differs from ${expected}`);
    maximumDifference = Math.max(maximumDifference, difference); geometryLog.push({ label, actual, expected, difference });
  };
  for (let scene = 0; scene < 30; scene++) {
    const random = new SimulationRandom(8127), visual = new SimulationRandom(15181), stats = new CombatStatsTracker(), fx = new CombatFXSystem(visual), explosions = new ProjectileExplosionSystem();
    const rows: number[][] = [], masks: boolean[][] = [];
    const row = (values: number[], geometric: number[] = []) => { rows.push(values); masks.push(values.map((_, i) => geometric.includes(i))); };
    const ships: Ship[] = [];
    for (let i = 0; i < 4; i++) {
      const size = i === 0 ? sizes[scene % 5] : i === 1 ? 'FRIGATE' : i === 2 ? 'CRUISER' : 'FIGHTER';
      const radius = i === 0 ? scene % 3 === 0 ? 90 : 35 : 20, x = i === 0 ? 0 : i === 1 ? 10 : i === 2 ? 50 : 80;
      const capacity = scene % 6 === 0 ? 0 : i === 0 ? 1500 : 600;
      const armor = new ArmorGrid(9, 7, 10, 10, 27, -45, -35), decals = new ShipDamageState(armor, visual), flux = new FluxTracker(capacity, 0, size);
      armor.onCellDamage = (c, r, d) => decals.onCellDamage(c, r, d); decals.suppressed = scene % 11 === 0;
      flux.isVenting = i % 2 === 0; flux.ventProgress = .4;
      const system = () => {
        const s = Object.create(ShipSystem.prototype) as PrivateSystem;
        Object.assign(s, { type: 'fixture', definition: { chargeUp: .1, active: 1, chargeDown: .2, cooldown: .7 } as ShipSystemDefinition,
          state: 'ACTIVE', effectLevel: 1, isActive: true, isCoolingDown: false, activeTimer: .95, cooldownTimer: 0,
          maxCharges: 2, charges: 2, activationSerial: 1, pendingActivationFlux: 0, pendingActivationEvents: 1, pendingActiveEvents: 1,
          chargeRegenTimer: 0, stageTimer: .95, outEntryEffectLevel: 0, disabled: false, gravityControlHeld: true,
          chargeUpDuration: .1, activeDuration: 1, chargeDownDuration: .2, maxCooldown: .7, chargeRegenRate: 0, maxDuration: 1,
        }); return s;
      };
      const systems = [system(), system()];
      const mount = { slotId: '1', mountType: 'TURRET', relativePos: new Vector2(3, -4), spec: { mountSize: 'SMALL' }, health: 250, maxHealth: 250,
        isDisabled: false, isPermanentlyDisabled: false, disabledDuration: 0, disabledTimer: 0 } as WeaponMount;
      const s = Object.create(Ship.prototype) as Ship;
      Object.assign(s, { id: String(i + 1), shipName: `Ship ${i + 1}`, teamId: i % 2, isPlayer: i % 2 === 0,
        spec: { id: `fixture_${i + 1}`, nameKey: `Hull ${i + 1} (test)`, hullSize: size, collisionRadius: radius,
          bounds: [[-18, -13], [18, -13], [18, 13], [-18, 13]], minPieces: scene % 4 === 0 ? 1 : 2, maxPieces: scene % 4 === 0 ? 1 : 4,
          weaponSlots: [{ slotId: '1', installation: true }, { slotId: '2', installation: true }, { slotId: '3', installation: true }],
          explosionColor: [231, 132, 91], explosionFlashColor: [247, 164, 31], debrisColor: [100, 130, 160], engineSlots: [] },
        pos: new Vector2(x, -5), vel: new Vector2(7, -3), facingRad: .27, angularVelRad: .07, throttle: 1, brakeInput: true, strafeInput: -.5, turnInput: .7,
        hullHp: i === 0 ? 0 : 120, hullStats: { hitpoints: 120, explosionDamageMultiplier: scene % 9 === 0 ? 0 : 1, explosionRadiusMultiplier: 1.17,
          breakProbability: scene % 3 === 0 ? 1 : scene % 3 === 1 ? 0 : .25 },
        armor, flux, damageDecals: decals, isDead: false, parentShip: null, childModules: [], isRetreated: false, isDocked: false,
        hullDamageSuppressed: false, hullDamageInterceptors: new Set(), shield: new Shield('OMNI', 360, 32),
        systems: [systems[0]], system: systems[0], defenseSystem: systems[1], getShieldCenter: () => new Vector2(x + 3, -2),
        weaponDamageTakenMultiplier: 1.13, engineDamageTakenMultiplier: 1.19,
        weaponControl: { weapons: [mount], damageComponent: (m: WeaponMount, d: number) => damageWeaponComponent(m, d, random) },
      });
      Object.defineProperties(s, { crDamageTakenMultiplier: { value: 1.13 }, effectiveEmpDamageTakenMultiplier: { value: 1.23 },
        damageToTargetWeaponsMultiplier: { value: 1.17 }, damageToTargetEnginesMultiplier: { value: 1.09 }, isCollisionless: { value: false },
        isAttachedModule: { value: i === 1 || i === 0 && scene % 8 === 0 } });
      const clear = Ship.prototype.clearInput;
      s.clearInput = () => { const vent = s.flux.isVenting; clear.call(s); row([2, i + 1, Number(vent)]); };
      // Capture the real parent-first mutation and force child HP ordering.
      let dead = false, hp = i === 0 ? 0 : 120;
      Object.defineProperty(s, 'isDead', { get: () => dead, set: value => { dead = value; if (value) row([0, i + 1]); } });
      Object.defineProperty(s, 'hullHp', { get: () => hp, set: value => { if (i === 1 && value === 0 && !dead && ships[0]?.isDead && ships[0].childModules.includes(s)) row([1, i + 1]); hp = value; } });
      ships.push(s);
    }
    if (scene % 2 === 0) { ships[0].childModules.push(ships[1]); ships[1].parentShip = ships[0]; }
    const engine = Object.create(CombatEngine.prototype) as DeathEngine;
    const losses = Array.from({ length: 64 }, (_, i) => ({ id: String(100 + i), shipName: '', hullName: '', teamId: 0, time: 0, status: 'destroyed' } as ShipLossNotification));
    const originalPush = losses.push.bind(losses);
    losses.push = (...entries) => { for (const loss of entries) row([3, Number(loss.id), loss.teamId, loss.time]); return originalPush(...entries); };
    Object.defineProperty(engine, 'notificationTime', { value: 42.5 });
    Object.assign(engine, { playerShip: ships[0], enemyShip: ships[2], suppressDestructionSideEffects: scene === 13,
      transientCombatShips: new Set(scene % 7 === 0 ? [ships[0]] : []), shipLossNotifications: losses,
      random, visualRandom: visual, fxSystem: fx, statsTracker: stats, weaponSystem: { explosions },
      addRadioMessage: (_name: string, speaker: string) => row([9, Number(speaker === 'HQ')]),
      addFloatingText: (p: Vector2, text: string) => row([10, Number(text === 'HULL DESTROYED'), p.x, p.y], [2, 3]),
      addCameraShake: (amount: number, duration: number) => row([12, amount, duration]),
      spawnDebris: (p: Vector2, count: number, color: [number, number, number], speed: number) => {
        const first = fx.debris.length; fx.spawnDebris(p, count, color, speed);
        const values = [11, count], geometric: number[] = [];
        for (const d of fx.debris.slice(first)) { const offset = values.length;
          values.push(d.pos.x, d.pos.y, d.vel.x, d.vel.y, d.rotation, d.angularVel, d.size, d.life, ...d.color, Number(d.spriteUrl!.match(/sml(\d)/)![1]), Number(d.isGlowing));
          geometric.push(...[0, 1, 2, 3, 4].map(i => offset + i));
        } row(values, geometric);
      },
    });
    const explosionPush = fx.explosions.push.bind(fx.explosions);
    fx.explosions.push = (...entries: ExplosionAnimation[]) => { for (const s of entries) {
      const values = [8, s.id, s.pos.x, s.pos.y, s.radius * 2, s.life, s.puffDuration!, s.flash!.diameter, s.flash!.coreDiameter ?? -1, s.puffs!.length, s.flare?.width ?? -1, s.flare?.height ?? -1];
      const geometric = [2, 3];
      for (const p of s.puffs!) { const offset = values.length; values.push(p.texture, p.startSize, p.endSize, p.rotation, p.offset.x, p.offset.y, p.velocity.x, p.velocity.y); geometric.push(...[3, 4, 5, 6, 7].map(i => offset + i)); }
      row(values, geometric);
    } return explosionPush(...entries); };
    const hulkPush = fx.hulkFragments.push.bind(fx.hulkFragments);
    fx.hulkFragments.push = (...entries: HulkFragment[]) => { for (const h of entries) {
      row([13, h.id, Number(h.sourceShip.id), h.pos.x, h.pos.y, h.vel.x, h.vel.y, h.facingRad, h.angularVel, h.collisionRadius,
        h.breakup?.remainingSplits ?? 0, h.breakup?.interval ?? 0, h.breakup?.elapsed ?? 0, h.breakup?.nextInterval ?? 0, h.mountSlotIds.length, ...h.mountSlotIds.map(Number)], [3, 4, 5, 6, 7]);
    } return hulkPush(...entries); };
    const armorSparks = fx.spawnArmorDamageSparks.bind(fx);
    fx.spawnArmorDamageSparks = (s, local, damage) => {
      const first = fx.particles.length; armorSparks(s, local, damage);
      if (s.damageDecals.suppressed) return;
      const values = [14, Number(s.id), local.x, local.y, damage, fx.particles.length - first], geometric = [2, 3];
      for (const p of fx.particles.slice(first) as Particle[]) { const offset = values.length; values.push(p.pos.x, p.pos.y, p.vel.x, p.vel.y, p.size); geometric.push(...[0, 1, 2, 3].map(i => offset + i)); } row(values, geometric);
    };
    const fighterKill = stats.recordFighterKill.bind(stats);
    stats.recordFighterKill = p => { fighterKill(p); row([4, Number(p)]); };
    const recordDamage = stats.recordDamageDealt.bind(stats);
    stats.recordDamageDealt = (p, kind, amount, layer, emp = 0, target = !p) => { recordDamage(p, kind, amount, layer, emp, target); row([15, Number(p), kinds.indexOf(kind), ['SHIELD', 'ARMOR', 'HULL'].indexOf(layer), amount, emp, Number(target)]); };
    const ctx = { random, visualRandom: visual, playerShip: ships[0], enemyShip: ships[2], fighters: [ships[3]], ships, projectiles: [], asteroids: [],
      fx: { spawnArmorDamageSparks: fx.spawnArmorDamageSparks.bind(fx), addFloatingDamage: (p: Vector2, amount: number, color: [number, number, number]) => row([17, p.x, p.y, amount, ...color], [1, 2]) },
      statsTracker: stats, handleShipDestruction: (s: Ship) => engine.handleShipDestruction(s),
    } as unknown as WeaponSimContext;
    Object.assign(engine, { getWeaponSimContext: () => ctx });
    const spawn = explosions.spawn.bind(explosions);
    explosions.spawn = (p, point, context, exclude, asteroid) => { row([5, p.id, Number(p.sourceShipId), p.damage, p.projectileExplosionSpec!.radius, p.projectileExplosionSpec!.coreRadius, p.projectileExplosionSpec!.duration]); spawn(p, point, context, exclude, asteroid); };
    const releaseAudio = captureCombatAudio(event => { if (event.kind !== 'play' || !event.position) return;
      const id = Number(ships.find(s => s.pos.x === event.position![0])!.id);
      if (event.key === 'explosion') row([6, id, ...event.position, event.volume], [2, 3]);
      if (event.key === 'disabled_large') row([7, id, ...event.position], [2, 3]);
    });
    try { engine.handleShipDestruction(ships[0]); engine.handleShipDestruction(ships[0]); engine.handleShipDestruction(ships[3]); } finally { releaseAudio(); }
    const deathRows = rows.length;
    for (let i = 0; i < 8; i++) { const p = i % 2 === 0; stats.recordShotFired(p); stats.recordShotHit(p); stats.recordMissileIntercepted(p); stats.recordFighterRebuilt(p); stats.recordOverload(p);
      // Counter exercise does not belong to the death event stream.
      recordDamage(p, kinds[i % 4], i - 2, ['SHIELD', 'ARMOR', 'HULL'][i % 3] as 'SHIELD', i % 2 === 0 ? 3 : -1, i % 3 === 0 ? p : !p); }
    rows.length = masks.length = deathRows;
    const expected: number[] = [], geometric: boolean[] = [];
    const put = (value: number, geo = false) => { expected.push(value); geometric.push(geo); };
    const putAll = (values: Iterable<number>) => { for (const v of values) put(v); };
    putAll([random.checkpointWitness()[1], visual.checkpointWitness()[1], visual.checkpointWitness()[2]]);
    for (const fleet of [stats.playerStats, stats.enemyStats]) putAll(statKeys.map(k => fleet[k]));
    put(losses.length); for (const l of losses) putAll([Number(l.id), l.teamId, l.time]);
    for (const s of ships) {
      const scars = s.damageDecals;
      putAll([2 | (s.isDead ? 16 : 0), s.hullHp, Number(s.flux.isVenting), s.flux.ventProgress, s.throttle, Number(s.brakeInput), s.strafeInput, s.turnInput, s.armor.dirtyVersion, scars.revision, (scars as unknown as { armorRevision: number }).armorRevision]);
      putAll(s.armor.copyCells()); put(scars.marks.length);
      for (const m of scars.marks) { const values = [m.cellIndex, m.localPos.x, m.localPos.y, m.opacity, 0, m.heat, Number(m.justHit), m.flash, m.flashElapsed, m.phase, m.pulsePeriod, m.size, m.rotationRad, ['cracks', 'burns', 'holes'].indexOf(m.kind), m.variant]; values.forEach((v, i) => put(v, i === 1 || i === 2 || i === 12)); }
      for (const [index, sys] of (s.allSystems as unknown as PrivateSystem[]).entries()) putAll([index + 1, 1, ['IDLE', 'IN', 'ACTIVE', 'OUT', 'COOLDOWN'].indexOf(sys.state), sys.effectLevel, Number(sys.isActive), Number(sys.isCoolingDown), sys.activeTimer, sys.cooldownTimer, sys.charges, sys.activationSerial, sys.pendingActivationFlux, sys.pendingActivationEvents, sys.pendingActiveEvents, 0, sys.stageTimer, sys.outEntryEffectLevel, Number(sys.disabled)]);
      for (const m of s.weapons) { const t = m.healthTracker; putAll([1, 0, 0, m.relativePos.x, m.relativePos.y, m.health, m.maxHealth, Number(m.isDisabled), Number(m.isPermanentlyDisabled), m.disabledDuration, m.disabledTimer,
        Number(!!t), t?.repairDuration ?? 0, t?.hitAgo ?? 0, t?.interval ?? 0, t?.elapsed ?? 0, Number(t?.intervalElapsed ?? false), 1, 1, 0]); }
    }
    const active = explosions.active as unknown as ExplosionState[];
    put(active.length); for (const e of active) { putAll([Number(e.projectile.sourceShipId), e.projectile.id, e.projectile.damage, e.life, e.ships.size]); putAll([...e.ships].map(Number)); }
    chainedExplosions += active.length; put(rows.length); events += rows.length;
    rows.forEach((r, i) => { put(r.length); r.forEach((value, j) => put(value, masks[i][j])); });
    const finalized = stats.finalizeBattle(scene % 2 === 0, 42.5, 'player', 'enemy', scene % 3 - .5, scene % 4 / 2);
    stats.reset(); putAll([4, 0, finalized.playerHullDamageRatio, finalized.enemyHullDamageRatio, finalized.playerStats.totalDamageDealt, stats.playerStats.totalDamageDealt, stats.enemyStats.totalDamageDealt]);
    const ptr = wasm.test_input(1); new Float64Array(wasm.memory.buffer, ptr, 1).set([scene]); const output = wasm.test_run();
    if (!output) throw Error(`Rust world failed scene ${scene}`);
    const actual = Array.from(new Float64Array(wasm.memory.buffer, output, wasm.test_output_words()));
    if (actual.length !== expected.length) throw Error(`Scene ${scene}: ${actual.length} words differ from ${expected.length}`);
    actual.forEach((a, i) => compare(a, expected[i], `scene ${scene} word ${i}`, geometric[i]));
  }
  return { passed: true, scenes: 30, strictFields: strict, geometryFields: geometry, orderedEvents: events, chainedExplosions, maximumDifference, geometryLog,
    actualTSDeathEntry: true, realArmorAndComponents: true, realImmediateChainExplosions: true, fullProductionWorld: false, originalLiveUIVerified: false };
}
