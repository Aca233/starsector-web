// Actual production MineSystem, retained StealthMinefield and real damage/FX.
import { Ship } from '../../src/engine/simulation/Ship';
import { CombatEngine } from '../../src/engine/simulation/CombatEngine';
import { Vector2 } from '../../src/engine/math/Vector2';
import { SimulationRandom } from '../../src/engine/simulation/SimulationRandom';
import { ArmorGrid } from '../../src/engine/simulation/ArmorGrid';
import { ShipDamageState } from '../../src/engine/simulation/ShipDamageState';
import { FluxTracker } from '../../src/engine/simulation/FluxTracker';
import { Shield } from '../../src/engine/simulation/Shield';
import { ShipSystem } from '../../src/engine/simulation/ShipSystem';
import { MineSystem } from '../../src/engine/simulation/systems/MineSystem';
import { WeaponSimulationSystem } from '../../src/engine/simulation/systems/WeaponSimulationSystem';
import { CombatFXSystem } from '../../src/engine/simulation/systems/CombatFXSystem';
import { CombatStatsTracker } from '../../src/engine/simulation/systems/CombatStatsTracker';
import { damageWeaponComponent } from '../../src/engine/simulation/systems/weapon/WeaponComponentHealth';
import { captureCombatAudio } from '../../src/engine/audio/CombatAudioEvents';
import * as stealth from '../../src/engine/extensions/StealthMinefield';
import type { WeaponMount } from '../../src/engine/simulation/Weapon';
import type { WeaponSimContext } from '../../src/engine/simulation/systems/weapon/WeaponSimContext';
import type { SystemWorld } from '../../src/engine/extensions/ship-systems/Types';
import type { SpatialMine } from '../../src/engine/simulation/CombatTypes';
interface Exports extends WebAssembly.Exports { memory: WebAssembly.Memory; test_input(n: number): number; test_aux(): number; test_aux_guards(): number; test_output_words(): number }
type Explosion = { pos: Vector2; life: number; ships: Set<string>; asteroids: Set<number>; missiles: Set<number> };
type Field = { source: Ship; weapon: string; remaining: number; incoming: { point: Vector2; target: Ship; delay: number }[] };
const sounds = ['mine_spawn', 'mine_teleport', 'mine_ping', 'mine_windup_heavy', 'mine_explosion'];
const statsKeys = ['totalDamageDealt', 'kineticDamage', 'heDamage', 'energyDamage', 'fragDamage', 'shieldDamageAbsorbed', 'armorDamageSoaked', 'hullDamageDealt', 'hullDamageTaken', 'shotsFired', 'shotsHit', 'empDamageDealt', 'missilesIntercepted', 'fightersDestroyed', 'fightersLost', 'fightersRebuilt', 'overloadsInflicted', 'overloadsSuffered'] as const;
export async function checkRustAuxWorld(source: BufferSource) {
  const { instance } = await WebAssembly.instantiate(source, {}), wasm = instance.exports as Exports;
  let strict = 0, geometry = 0, maximumDifference = 0, orderedEvents = 0, ticks = 0;
  const failures: string[] = [], geometryLog: { label: string; difference: number }[] = [];
  for (let scene = 0; scene < 21; scene++) {
    const random = new SimulationRandom(8127), visual = new SimulationRandom(15181), fx = new CombatFXSystem(visual), stats = new CombatStatsTracker(), weapon = new WeaponSimulationSystem(), mines = new MineSystem(random, visual);
    const ships: Ship[] = [], rows: { v: number[]; g: number[] }[] = [], expected: number[] = [], geometric: boolean[] = [], labels: string[] = [];
    const put = (v: number, g = false, label = '') => { expected.push(v); geometric.push(g); labels.push(label); };
    const record = (v: number[], g: number[] = []) => rows.push({ v, g });
    for (let i = 0; i < 3; i++) {
      const armor = new ArmorGrid(9, 7, 10, 10, 27, -45, -35), decals = new ShipDamageState(armor, visual), flux = new FluxTracker(scene === 8 && i === 1 ? 100 : 10000, 0, 'FRIGATE');
      armor.onCellDamage = (c, r, d) => decals.onCellDamage(c, r, d);
      const spec = { id: i === 0 ? 'fixture-source' : `ship${i + 1}`, nameKey: 'fixture', hullSize: 'FRIGATE', collisionRadius: 30,
        bounds: [[-30, -20], [30, -20], [30, 20], [-30, 20]], mass: 100, spriteHeight: 70, engineSlots: [], weaponSlots: [{ slotId: '1', x: -20, y: 0 }], captainSkills: {},
        hullMods: scene === 1 && i === 0 ? ['eccm'] : scene >= 14 && scene < 20 && i < 2 ? [i === 0 && scene % 2 === 1 ? 'stealth_minefield_lt' : 'stealth_minefield'] : [], builtInHullMods: [],
        sourceHullTraits: scene === 19 && i === 2 ? ['DRONE'] : [], explosionColor: [230, 130, 90], explosionFlashColor: [247, 164, 31], debrisColor: [100, 130, 160], minPieces: 2, maxPieces: 2 };
      const mount = { slotId: '1', mountType: 'TURRET', relativePos: new Vector2(-20, 0), spec: { id: 'fixture', mountSize: 'SMALL' }, health: 250, maxHealth: 250,
        isDisabled: false, isPermanentlyDisabled: false, disabledDuration: 0, disabledTimer: 0 } as WeaponMount;
      const s = Object.create(Ship.prototype) as Ship, shield = new Shield(scene === 12 && i === 1 ? 'PHASE' : 'OMNI', 360, 42, .83);
      Object.assign(shield, { isActive: scene === 8 && i === 1, currentArcDeg: 360, facingAngleRad: 0 });
      if (scene === 12 && i === 1) { shield.phaseState = 'ACTIVE'; }
      shield.damageTakenModifiers.set('fixture', 1.19); shield.damageTakenModifiers.set('graviton', 1.27); shield.externalDamageTakenMultiplier = () => 1.13; shield.energyDamageTakenMultiplier = 1.07;
      if (scene === 8 && i === 1) shield.configureVoidShield({ layers: 1, integrityPerLayer: 30, rechargePerSecond: 0, hitDelay: .4, restartDelay: 1 });
      const system = new ShipSystem('NONE');
      Object.assign(s, { id: String(i + 1), teamId: i === 0 ? 0 : 1, isPlayer: i === 0, spec, pos: new Vector2(i === 0 ? -1000 : scene < 7 || scene === 11 || scene === 12 ? 3000 + i * 100 : i === 1 ? 100 : 240, 0),
        vel: new Vector2(i * 2, -i), prevPos: new Vector2(), facingRad: 0, angularVelRad: 0, hullHp: 10000,
        hullStats: { hitpoints: 10000, damageToFightersPercent: 0, damageToFightersMultiplier: 1, damageToFrigatesPercent: 0, damageToDestroyersPercent: 0, damageToCruisersPercent: 0, damageToMissilesPercent: 0, damageToMissilesMultiplier: 1,
          explosionDamageMultiplier: 0, explosionRadiusMultiplier: 1, breakProbability: 0 }, armor, damageDecals: decals, flux, shield, isDead: false, parentShip: null, childModules: [], moduleMount: null,
        isRetreated: false, isDocked: false, isSystemDrone: scene === 19 && i === 2, hullDamageSuppressed: false, hullDamageInterceptors: new Set(), system, defenseSystem: new ShipSystem('NONE'), systems: [system], externalPhaseEffects: new Map(),
        runtimeModifiers: { value: {} }, damageTakenModifiers: new Map(), weaponDamageTakenMultiplier: 1.13, engineDamageTakenMultiplier: 1.19,
        weaponControl: { weapons: [mount], damageComponent: (m: WeaponMount, d: number) => damageWeaponComponent(m, d, random) },
        clearInput: () => {}, updateScorchMarks: () => {}, getShieldCenter: () => s.pos.clone(), shipName: `ship${i + 1}`, encounterEffects: { emergencyPhaseDiveUsed: false }, ecmRangePenalty: 0 });
      Object.defineProperties(s, { crDamageTakenMultiplier: { value: 1.13 }, crDamageDealtMultiplier: { value: scene === 1 && i === 0 ? 1.17 : 1 }, effectiveEmpDamageTakenMultiplier: { value: 1.23 }, damageToTargetWeaponsMultiplier: { value: 1.17 }, damageToTargetEnginesMultiplier: { value: 1.09 }, hasVastBulk: { value: false }, subjectiveTimeMultiplier: { value: 1 } });
      s.system.getShieldDamageMultiplier = () => 1.11;
      if (scene === 1 && i === 0) s.getWeaponDamageMultiplier = () => 1.23;
      flux.onOverloadStarted = () => { if (shield.voidShield) { shield.voidShield.suppressed = true; shield.isActive = false; shield.currentArcDeg = 0; } else shield.setActive(false); };
      if (scene === 9 && i === 1) { for (let r = 0; r < armor.rows; r++) for (let c = 0; c < armor.cols; c++) armor.setCell(c, r, 0); s.hullHp = 12; }
      if ((scene === 7 || scene === 11) && i > 0) s.pos.x = 5000;
      if (scene === 20 && i > 0) s.pos.x = 3000 + i * 100;
      ships.push(s);
    }
    const armorSparks = fx.spawnArmorDamageSparks.bind(fx); fx.spawnArmorDamageSparks = (...a) => { const first = fx.particles.length; armorSparks(...a); if (!a[0].damageDecals.suppressed) record([0, fx.particles.length - first, ...fx.particles.slice(first).flatMap(p => [p.pos.x, p.pos.y, p.vel.x, p.vel.y, p.size])], Array.from({ length: fx.particles.length - first }, (_, i) => [2 + i * 5, 3 + i * 5, 4 + i * 5, 5 + i * 5]).flat()); };
    const debris = fx.spawnDebris.bind(fx); fx.spawnDebris = (...a) => { const first = fx.debris.length; debris(...a); const particles = fx.debris.slice(first); record([1, 0, particles.length,
      ...particles.flatMap(d => [d.pos.x, d.pos.y, d.vel.x, d.vel.y, d.rotation, d.angularVel, d.size, d.life, ...d.color, Number(d.spriteUrl!.match(/(?:sml|med|lrg)(\d)/)![1]), +!!d.isGlowing])], particles.flatMap((_, i) => [3, 4, 5, 6, 7].map(n => n + i * 13))); };
    const sparks = fx.spawnSparks.bind(fx); fx.spawnSparks = (...a) => { const first = fx.particles.length; sparks(...a); const particles = fx.particles.slice(first); record([2, particles.length, ...particles.flatMap(p => [p.pos.x, p.pos.y, p.vel.x, p.vel.y, p.life, p.size, p.endSize!, ...p.color, p.peakAlpha!, p.drag!, p.rotation!, p.stretch!])], particles.flatMap((_, i) => [2, 3, 4, 5, 14].map(n => n + i * 14))); };
    const explosion = fx.spawnAuthenticExplosion.bind(fx); fx.spawnAuthenticExplosion = (...a) => { explosion(...a); const x = fx.explosions.at(-1)!; record([3, x.id, x.pos.x, x.pos.y, x.maxRadius, x.maxLife, x.rotation, +!!x.hasShockwaveRing, x.puffs!.length,
      ...x.puffs!.flatMap(p => [p.texture, p.startSize, p.endSize, p.rotation, p.offset.x, p.offset.y, p.velocity.x, p.velocity.y])], [2, 3, 6, ...x.puffs!.flatMap((_, i) => [12, 13, 14, 15, 16].map(n => n + i * 8))]); };
    const damageText = fx.addFloatingDamage.bind(fx); fx.addFloatingDamage = (...a) => { const before = visual.checkpointWitness()[1]; damageText(...a); if (a[1] >= 1) { const x = fx.floatingTexts.find(f => f.life > .15 && f.color.every((v, i) => v === a[2][i]) && (visual.checkpointWitness()[1] === before ? f.pos.distanceTo(a[0]) < 75 : f === fx.floatingTexts.at(-1)))!; record([4, x.id, Number(x.text)]); } };
    const text = fx.addFloatingText.bind(fx); fx.addFloatingText = (...a) => { text(...a); record([4, fx.floatingTexts.at(-1)!.id, -1]); };
    const serials = new Map<number, number>(), spawned: number[] = [], retired: number[] = []; let serial = 0;
    const ctx = { playerShip: ships[0], enemyShip: ships[1], ships, capitalShips: ships, fighters: [], projectiles: weapon.projectiles, hulkFragments: fx.hulkFragments, fx,
      random, visualRandom: visual, statsTracker: stats, asteroids: [], addCameraShake: () => {}, addRadioMessage: () => {}, contrailEngine: { detach: (id: number) => record([7, serials.get(id)!]) },
      handleShipDestruction: (s: Ship) => (engine as unknown as { handleShipDestruction(s: Ship): void }).handleShipDestruction(s) } as unknown as WeaponSimContext;
    const engine = Object.create(CombatEngine.prototype) as CombatEngine;
    Object.assign(engine, { suppressDestructionSideEffects: false, transientCombatShips: new Set(), shipLossNotifications: [], combatTime: 0, aftermathTime: 0,
      playerShip: ships[0], enemyShip: ships[1], fxSystem: fx, random, visualRandom: visual, statsTracker: stats, weaponSystem: weapon,
      addRadioMessage: () => {}, addFloatingText: fx.addFloatingText.bind(fx), spawnDebris: fx.spawnDebris.bind(fx), addCameraShake: () => {}, getWeaponSimContext: () => ctx });
    const originalSpawn = mines.spawnMine.bind(mines); mines.spawnMine = (...a) => { const m = originalSpawn(...a); serials.set(m.id, ++serial); spawned.push(serial); return m; };
    const privateMines = mines as unknown as { explosions: { active: Explosion[] }; detonate(m: SpatialMine, ctx: WeaponSimContext): void };
    const detonate = privateMines.detonate.bind(mines); privateMines.detonate = (m, c) => { retired.push(serials.get(m.id)!); detonate(m, c); };
    const scope = {}, world = { combatScope: scope, ships, asteroids: [], combatRandom: random,
      spawnNativeMine: (p, s, w, target) => mines.spawnMine(p, s, ctx, w, { facing: Math.atan2(target.pos.y - p.y, target.pos.x - p.x) }), deployMine: (p, s, range) => mines.deployMine(p, s, ctx, range) } as SystemWorld;
    const oracleFields = (stealth as unknown as { oracleFields: WeakMap<object, Field> }).oracleFields;
    const release = captureCombatAudio(a => { if (a.kind === 'play' && a.position && sounds.includes(a.key)) record([5, sounds.indexOf(a.key), a.position[0], a.position[1], a.volume], [2, 3]); });
    const snapshot = () => {
      [random.checkpointWitness()[1], visual.checkpointWitness()[1], visual.checkpointWitness()[2]].forEach(v => put(v)); put(1); put(mines.mines.length);
      for (const m of mines.mines) { [serials.get(m.id)!, m.id, m.weaponId === 'minelayer1' ? 1 : 2, Number(m.sourceShipId), 1, m.teamId!, +(m.sourceIsPlayer !== undefined), +!!m.sourceIsPlayer,
        m.pos.x, m.pos.y, m.vel.x, m.vel.y, m.age, m.fadeInSeconds ?? 1, m.rotation, +m.windupPlayed, m.detonatingTimer, +m.isDetonating, m.triggerRadius, m.explosionRadius, m.damage, m.sourceDamageMultiplier ?? 1, m.life].forEach((v, i) => put(v, i >= 8 && i <= 11, 'mine' + i)); }
      put(privateMines.explosions.active.length); for (const x of privateMines.explosions.active) [x.pos.x, x.pos.y, x.life, x.ships.size, x.asteroids.size, x.missiles.size].forEach((v, i) => put(v, i < 2));
      const f = oracleFields.get(scope); put(+!!f); if (f) { [Number(f.source.id), 1, f.weapon === 'minelayer1' ? 1 : 2, f.remaining, f.incoming.length].forEach(v => put(v)); for (const i of f.incoming) [i.point.x, i.point.y, Number(i.target.id), 1, i.delay].forEach((v, i) => put(v, i < 2)); }
      for (const s of ships) { [s.hullHp, s.flux.hardFlux, s.flux.softFlux, +s.flux.isOverloaded, s.flux.overloadTimer, +s.shield.isActive, s.shield.currentArcDeg, s.shield.sinceLastDamageTaken, +s.isDead].forEach((v, i) => put(v, false, `ship${s.id} field${i}`));
        s.armor.copyCells().forEach(v => put(v)); const m = s.weapons[0], h = m.healthTracker;
        [1, 0, 0, m.relativePos.x, m.relativePos.y, m.health, m.maxHealth, +m.isDisabled, +m.isPermanentlyDisabled, m.disabledDuration, m.disabledTimer, +!!h, h?.repairDuration ?? 0, h?.hitAgo ?? 0, h?.interval ?? 0, h?.elapsed ?? 0, +!!h?.intervalElapsed, 1, 1, 0].forEach(v => put(v));
        [s.shield.voidShield?.integrity ?? 0, s.shield.voidShield?.quietRemaining ?? 0, s.shield.voidShield?.restartRemaining ?? 0, s.shield.voidShield?.breaks ?? 0].forEach(v => put(v)); }
      for (const side of [stats.playerStats, stats.enemyStats]) statsKeys.forEach(k => put(side[k]));
      put(weapon.projectiles.length); for (const p of weapon.projectiles) [serials.get(p.id)!, p.id, Number(p.sourceShipId), p.pos.x, p.pos.y, p.prevPos.x, p.prevPos.y, p.vel.x, p.vel.y, p.damage, p.baseDamage ?? p.damage, p.hitpoints ?? 100, p.rangeRemaining, p.totalRange ?? p.rangeRemaining, p.elapsedTime, +!!p.isDisarmed, +!!p.isMine, +!!p.isRocket, p.spawnLocation?.x ?? p.pos.x, p.spawnLocation?.y ?? p.pos.y].forEach((v, i) => put(v, i >= 3 && i <= 8 || i >= 18));
      put(weapon.explosions.active.length); for (const x of weapon.explosions.active) [x.pos.x, x.pos.y, x.life, x.ships.size, x.asteroids.size, x.missiles.size].forEach((v, i) => put(v, i < 2));
      put(fx.floatingTexts.length); for (const x of fx.floatingTexts) [x.id, x.pos.x, x.pos.y, x.vel.x, x.vel.y, Number.isFinite(Number(x.text)) ? Number(x.text) : -1, x.size, x.life, x.maxLife, ...x.color].forEach((v, i) => put(v, i >= 1 && i <= 4));
      put(spawned.length); spawned.forEach(v => put(v)); put(retired.length); retired.forEach(v => put(v));
      put(rows.length); orderedEvents += rows.length; for (const { v, g } of rows) { put(v.length); v.forEach((n, i) => put(n, g.includes(i), 'event ' + v[0] + ' field ' + i)); } rows.length = 0;
    };
    try {
      if (scene < 14 || scene === 20) {
        if ([2, 3, 4].includes(scene)) { for (let n = 0; n < (scene === 4 ? 14 : 1); n++) mines.deployMine(new Vector2(scene === 3 ? 5000 : 3100, 0), ships[0], ctx, 1000); }
        else mines.spawnMine(new Vector2([8, 9, 10, 13].includes(scene) ? 100 : 0, 0), ships[0], ctx, scene === 1 ? 'minelayer1' : 'minelayer2', { life: scene === 1 ? undefined : scene === 5 ? .2 : .25, stationary: scene === 0 });
      }
      if (scene === 7 || scene === 11) { weapon.projectiles.push({ id: .777, specId: 'fixture', sourceShipId: scene === 11 ? '1' : '2', teamId: scene === 11 ? 0 : 1, isPlayer: scene === 11, isRocket: true, pos: new Vector2(50, 0), prevPos: new Vector2(50, 0), spawnLocation: new Vector2(50, 0), vel: new Vector2(), damage: 1, baseDamage: 1, damageType: 'ENERGY', radius: 2, hitpoints: 500, rangeRemaining: 1000, totalRange: 1000, elapsedTime: 0, color: [255, 100, 50] }); serials.set(.777, 2); serial = 2; }
      const count = scene === 1 ? 210 : [2, 3, 4].includes(scene) ? 90 : scene >= 14 && scene < 20 ? 75 : 42; ticks += count;
      for (let tick = 0; tick < count; tick++) {
        if ([5, 6].includes(scene) && tick === 3) { if (scene === 5) weapon.projectiles[0].isDisarmed = true; else weapon.projectiles.length = 0; }
        if (scene === 13 && tick === 3) ships[0].isDead = true;
        if (scene === 16 && tick === 14) ships[1].isDead = true;
        if (scene === 17 && tick === 14) ships[0].isDead = true;
        if (scene === 18 && tick === 14) { mines.clear(); weapon.projectiles.length = 0; }
        if (scene >= 14 && scene < 20) for (let i = 0; i < 2; i++) stealth.advanceStealthMinefield(ships[i], .1, world);
        if (scene === 20 && tick === 1) { weapon.projectiles[0].pos.set(350, 12); weapon.projectiles[0].vel.set(14, -3); weapon.projectiles[0].isDisarmed = true; }
        if (scene === 10 && tick === 3) weapon.projectiles.length = 0;
        const disarmed = mines.mines.filter(m => weapon.projectiles.some(p => p.id === m.id && p.isDisarmed));
        mines.update(.1, ctx); for (const m of disarmed) if (m.life <= 0) retired.push(serials.get(m.id)!); snapshot();
      }
    } finally { release(); }
    const ptr = wasm.test_input(1); new Float64Array(wasm.memory.buffer, ptr, 1).set([scene]); const result = wasm.test_aux(); const actual = Array.from(new Float64Array(wasm.memory.buffer, result, wasm.test_output_words()));
    if (actual.length !== expected.length) { failures.push(`scene ${scene} length ${actual.length}/${expected.length}; ${actual.flatMap((a, i) => Object.is(a, expected[i]) ? [] : [`${i} ${labels[i]} ${a}/${expected[i]}`]).slice(0, 8).join('; ')}`); continue; }
    try { actual.forEach((a, i) => { const b = expected[i], label = `scene ${scene} word ${i} ${labels[i]}`; if (!geometric[i]) { strict++; if (!Object.is(a, b)) throw Error(`${label} strict ${a} expected ${b}`); return; }
      geometry++; if (Object.is(a, b)) return; const difference = Math.abs(a - b), limit = Math.max(1e-9, 32 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b)));
      if (!Number.isFinite(a) || !Number.isFinite(b) || difference > limit) throw Error(`${label} geometry ${a} expected ${b}`); maximumDifference = Math.max(maximumDifference, difference); if (geometryLog.length < 30) geometryLog.push({ label, difference }); }); } catch (error) { failures.push(String(error)); }
  }
  const ptr = wasm.test_aux_guards(), guards = Array.from(new Float64Array(wasm.memory.buffer, ptr, wasm.test_output_words()));
  const expectedGuards = [8, 1, 0, 0, 4, 1, 0, 0, 2, 1, 0, 0, 2, 1, 0, 0];
  if (guards.length !== expectedGuards.length || guards.some((v, i) => v !== expectedGuards[i])) failures.push('stale/unknown/invalid side effects: ' + JSON.stringify(guards));
  strict += expectedGuards.length;
  if (failures.length) throw Error(failures.join('\n'));
  return { passed: true, scenes: 21, ticks, strictFields: strict, geometryFields: geometry, orderedEvents, maximumDifference, geometryLog, actualResidentMineWorld: true, actualTsMineSystem: true, actualTsSharedStealth: true, actualDamageAndFactories: true, guards: 4, productionIntegrated: false };
}
