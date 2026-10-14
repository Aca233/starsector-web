import { Ship } from '../../src/engine/simulation/Ship';
import { Vector2 } from '../../src/engine/math/Vector2';
import { SimulationRandom } from '../../src/engine/simulation/SimulationRandom';
import { ProjectileExplosionSystem } from '../../src/engine/simulation/systems/weapon/ProjectileExplosionSystem';
import { ProjectileCollisionHandler } from '../../src/engine/simulation/systems/weapon/ProjectileCollisionHandler';
import { getShipExplosionContact } from '../../src/engine/simulation/collision/ExplosionContact';
import { distanceToDeployedShield } from '../../src/engine/simulation/collision/ShieldCollisionGeometry';
import { distanceToShipHull } from '../../src/engine/simulation/collision/HullGeometry';
import { captureCombatAudio } from '../../src/engine/audio/CombatAudioEvents';
import { bindProjectileSource } from '../../src/engine/simulation/systems/weapon/OutgoingDamage';
import { segmentCircleEntry } from '../../src/engine/math/Geometry';
import { segmentHullHit } from '../../src/engine/visual/HulkGeometry';
import type { Projectile, ProjectileExplosionSpec } from '../../src/engine/simulation/Weapon';
import type { WeaponSimContext } from '../../src/engine/simulation/systems/weapon/WeaponSimContext';

interface Exports extends WebAssembly.Exports { memory: WebAssembly.Memory; test_input(n: number): number; test_reset(): number; test_run(): number; test_output_words(): number }
interface ExplosionState { pos: Vector2; life: number; ships: Set<string>; missiles: Set<number>; asteroids: Set<number>;
  voidScreens: Map<string, { center: Vector2; radius: number; teamId: number; fraction: number }> }
const classes = ['HITS_SHIPS_AND_ASTEROIDS', 'MISSILE_FF', 'MISSILE_NO_FF', 'PROJECTILE_FF', 'PROJECTILE_NO_FF'] as const;
const kinds = ['ENERGY', 'KINETIC', 'HIGH_EXPLOSIVE', 'FRAGMENTATION'];
export async function checkRustExplosionEffects(source: BufferSource) {
  // Required actual TS module initialization order before circular handlers.
  if (typeof Ship !== 'function') throw Error('Ship source module unavailable');
  const { instance } = await WebAssembly.instantiate(source, {}), wasm = instance.exports as Exports;
  let strict = 0, geometry = 0, maximumDifference = 0, events = 0;
  const geometryLog: { label: string; actual: number; expected: number; difference: number }[] = [];
  function compare(a: number, b: number, label: string, geometric = false) {
    if (!geometric) { strict++; if (!Object.is(a, b)) throw Error(`${label}: ${a} differs from ${b}`); return; }
    geometry++; if (Object.is(a, b)) return;
    const difference = Math.abs(a - b), limit = Math.max(1e-9, 32 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b)));
    if (!Number.isFinite(a) || !Number.isFinite(b) || difference > limit) throw Error(`${label}: geometry ${a} differs from ${b}`);
    maximumDifference = Math.max(maximumDifference, difference); geometryLog.push({ label, actual: a, expected: b, difference });
  }
  for (let scene = 0; scene < 54; scene++) {
    let rows: number[][] = [], missiles: Projectile[] = [];
    const d = Array<number>(31).fill(0);
    d[1] = scene % 4 === 0 ? -15 : scene % 4 === 1 ? 22 : scene % 4 === 2 ? 57 : 95;
    d[2] = scene % 3 === 0 ? 19 : 2; d[3] = 7; d[4] = -3; d[5] = scene % 5 === 0 ? 0 : 65;
    d[6] = scene % 6 === 0 ? 70 : 18; d[7] = .12; d[8] = .17; d[9] = scene % 5;
    d[10] = scene % 3 === 0 ? 15 : 40; d[11] = scene % 7 === 0 ? 0 : 50; d[12] = Number(scene % 4 === 0);
    d[13] = Number(scene >= 32 && scene % 3 === 0); d[14] = Number(scene === 38); d[15] = Number(scene === 39);
    d[16] = Number(scene % 3 === 0); d[17] = Number(scene % 4 !== 0); d[18] = scene % 4 === 0 ? 101 : 0;
    d[19] = Number(scene % 2); d[20] = scene === 11 ? 2 : 0; d[21] = Number(scene % 2 === 0); d[22] = Number(scene % 3 === 0);
    d[23] = Number(scene % 2 === 0); d[24] = Number(scene % 5 === 0); d[25] = scene % 3 === 0 ? 360 : 60; d[26] = .37;
    d[27] = scene >= 30 && scene % 4 === 0 ? .5 : 2; d[28] = Number(scene % 2); d[29] = scene % 7 === 0 ? 2 : 0; d[30] = .017;
    if (scene >= 40 && scene < 48) {
      d[1] = 75; d[2] = 0; d[13] = 0; d[14] = 0; d[15] = 0; d[17] = 1; d[27] = scene % 3 === 0 ? .2 : 2;
      if (scene === 42) d[27] = segmentCircleEntry(new Vector2(-60, 0), new Vector2(75, 0), new Vector2(27, 2), 5)!;
    }
    const set = () => { const ptr = wasm.test_input(d.length); new Float64Array(wasm.memory.buffer, ptr, d.length).set(d); };
    set(); wasm.test_reset();
    const random = new SimulationRandom(8427), visualRandom = new SimulationRandom(17181), system = new ProjectileExplosionSystem(), handler = new ProjectileCollisionHandler();
    const ships: Ship[] = [];
    for (let index = 0; index < 4; index++) {
      const x = index * 37, id = String(index + 1), isVoid = !!d[22] && index === 1;
      const ship = {} as Ship;
      const shield = { isActive: !!d[21] && index === 1, type: 'OMNI', currentArcDeg: d[25], facingAngleRad: d[26], radius: 32, voidShield: isVoid ? {} : undefined,
        damageTakenMultiplierFor: () => 1.17,
        absorbImpact: (amount: number, type: string, angle: number) => { rows.push([1, index + 1, amount, kinds.indexOf(type), angle]); return isVoid ? { flux: 0, absorbed: amount * .6, remainingFraction: .4 } : { flux: amount * .83, absorbed: amount, remainingFraction: 0 }; } };
      let lastDamage = { armorDamage: 0, hullDamage: 0 }, lastPoint = new Vector2();
      Object.assign(ship, { id, teamId: index === 0 ? 0 : 1, isPlayer: index === 0, isDead: false, isCollisionless: false,
        spec: { hullSize: index === 2 ? 'FIGHTER' : 'FRIGATE', collisionRadius: 20, engineSlots: [], bounds: d[24] ? [] : [[-18, -13], [18, -13], [18, 13], [-18, 13]] },
        pos: new Vector2(x, 0), facingRad: 0, shield, flux: { increaseShieldFlux: (amount: number, hard: boolean) => rows.push([2, index + 1, amount, Number(hard)]) },
        system: { getShieldDamageMultiplier: () => 1.11 }, hullHp: 10000,
        armor: { localToGrid: () => ({ c: 0, r: 0 }), takeDamage: (point: Vector2, amount: number, type: string, strength = amount) => {
          rows.push([3, index + 1, point.x, point.y, amount, kinds.indexOf(type), strength]); lastPoint = point; return lastDamage = { armorDamage: amount * .7, hullDamage: amount * .3 };
        } }, applyHullDamage: (amount: number) => rows.push([4, index + 1, amount]), weapons: [], weaponControl: { weapons: [], damageComponent: () => {} },
        getShieldCenter: () => new Vector2(x + 3, 0),
      });
      Object.defineProperty(ship, 'crDamageTakenMultiplier', { value: 1.13 });
      Object.defineProperty(ship, 'assemblyRoot', { value: ship, configurable: true });
      Object.defineProperty(ship, 'effectiveEmpDamageTakenMultiplier', { get() { rows.push([5, index + 1, lastPoint.x, lastPoint.y, lastDamage.armorDamage, lastDamage.hullDamage, 0, 71]); return 0; } });
      ships.push(ship);
    }
    if (d[22]) { Object.defineProperty(ships[3], 'assemblyRoot', { value: ships[1] }); }
    const source = { id: '71', spec: {}, hullStats: { damageToMissilesPercent: 13, damageToMissilesMultiplier: 1,
      damageToFightersPercent: 0, damageToFightersMultiplier: 1, damageToFrigatesPercent: 0, damageToDestroyersPercent: 0, damageToCruisersPercent: 0 } } as unknown as Ship;
    for (let i = 0; i < 3; i++) missiles.push({ id: 100 + i, sourceShipId: String(80 + i), teamId: i === 2 ? 0 : 1, isPlayer: i === 2,
      pos: new Vector2(27 + i * 13, 2), radius: 3, isRocket: true, isFlare: i === 1, flareFizzling: false, collisionDisabled: false,
      hitpoints: d[23] ? 100 : 1000 } as Projectile);
    const asteroids = [{ id: 200, pos: new Vector2(60, 30), radius: 8, hp: 100 }];
    const ctx = { random, visualRandom, ships, capitalShips: ships.filter(s => s.spec.hullSize !== 'FIGHTER'), fighters: [ships[2]],
      playerShip: { ...ships[0], id: '71', pos: ships[0].pos }, enemyShip: ships[1], projectiles: missiles, asteroids, hulkFragments: [],
      fx: {
        contrails: [] as { pos: Vector2; vel: Vector2; life: number; size: number; maxSize: number; rotation: number }[],
        addFloatingDamage: (point: Vector2, amount: number, color: number[]) => rows.push([12, point.x, point.y, amount, ...color]),
        addFloatingText: (point: Vector2, text: string) => rows.push([13, point.x, point.y, text === 'BURST INTERCEPTED' ? 0 : 1]),
        spawnArmorDamageSparks: (ship: Ship, point: Vector2, amount: number) => rows.push([19, Number(ship.id), point.x, point.y, amount]),
        spawnAuthenticExplosion: (point: Vector2, radius: number, color: number[], _ring: boolean, kind?: string) => rows.push([15, point.x, point.y, radius, ...color, Number(kind === 'missile')]),
        spawnSourceMissileExplosion: (point: Vector2, spec: { radius?: number }) => rows.push([16, point.x, point.y, spec.radius ?? 0]),
        spawnSparks: (point: Vector2, count: number, color: number[]) => rows.push([17, point.x, point.y, count, ...color]),
        spawnShieldRipple: (point: Vector2) => rows.push([20, point.x, point.y]),
      }, statsTracker: { recordDamageDealt: (player: boolean, type: string, amount: number, layer: string, emp = 0, targetPlayer?: boolean) => rows.push([11, Number(player), kinds.indexOf(type), ['SHIELD', 'ARMOR', 'HULL'].indexOf(layer), amount, emp, targetPlayer === undefined ? -1 : Number(targetPlayer)]),
        recordShotHit: (player: boolean) => rows.push([23, Number(player)]), recordMissileIntercepted: (player: boolean) => rows.push([24, Number(player)]) },
      contrailEngine: { detach: (id: number) => rows.push([25, id]) }, addCameraShake: () => rows.push([21]),
      addRadioMessage: (_speaker: string, _who: string, text: string) => rows.push([22, text.includes('敌机') ? 1 : 0, text.includes('敌机') ? 1 : Number(text.match(/(\d+) 枚/)?.[1])]),
      handleShipDestruction: () => {},
      queryAsteroidImpact: () => null,
      commitAsteroidImpact: (p: Projectile, hit: { point: Vector2 }) => rows.push([9, 200, p.damage, hit.point.x, hit.point.y]),
    } as unknown as WeaponSimContext;
    // Emitter binding uses ctx.ships; include the real source without changing
    // target traversal by binding the initial payload against a temporary scope.
    const make = () => ({ id: 900, sourceShipId: '71', teamId: 0, isPlayer: true, damage: 197, damageType: 'ENERGY',
      pos: new Vector2(d[1], d[2]), prevPos: new Vector2(-60, 0), vel: new Vector2(d[3], d[4]), radius: 2, rangeRemaining: d[11],
      isRocket: !!d[13], isFlare: !!d[14], didDamage: !!d[15], spawnType: d[16] ? 'BALLISTIC_AS_BEAM' : undefined,
      interceptsMissiles: !!d[17], targetProjectileId: d[18] || undefined, passThroughMissiles: !!d[19],
      voidShieldBlockedRoot: d[20] ? String(d[20]) : undefined, sourceWeaponType: 'BALLISTIC',
    } as Projectile);
    const originalHp = new Map(missiles.map(m => [m.id, m.hitpoints!]));
    for (const missile of missiles) Object.defineProperty(missile, 'hitpoints', { get() { return originalHp.get(missile.id); }, set(v: number) {
      rows.push([7, missile.id, v]); originalHp.set(missile.id, v);
    }, configurable: true });
    const originalSplice = missiles.splice.bind(missiles);
    missiles.splice = (start, deleteCount, ...items) => { if (deleteCount === 1) rows.push([8, missiles[start].id]); return originalSplice(start, deleteCount!, ...items); };
    // Record one real proximity source spawn, then let its standard system run.
    ctx.spawnProjectileExplosion = (p, point) => system.spawn(p, point, ctx);
    handler.runtimeCollisionKernel.findHits = () => d[27] < 1 ? [{ t: d[27] }] as never : [null] as never;
    const dispose = captureCombatAudio(e => { if (e.kind === 'play') rows.push([14, ...(e.position ?? [0, 0]), e.volume]); });
    try {
      const op = scene < 6 ? 0 : scene < 20 ? 1 : scene < 26 ? 3 : scene < 32 ? 4 : scene < 40 ? 6 : scene < 48 ? 5 : 7;
      for (let tick = 0; tick < (op === 1 ? 10 : 1); tick++) {
        rows = []; ctx.fx.contrails.length = 0; d[0] = op === 1 && tick > 0 ? 2 : op;
        const p = bindProjectileSource(make(), source), spec = { radius: d[5], coreRadius: d[6], duration: d[7], minDamageFraction: d[8], collisionClass: classes[d[9]] } as ProjectileExplosionSpec;
        p.projectileExplosionSpec = spec; p.proximityFuse = { range: d[10], explosionRadius: d[5], coreRadius: d[6] };
        if (d[12]) p.proximityExplosionSpec = spec;
        let value = 0;
        if (op === 0) { const c = getShipExplosionContact(ships[1], p.pos, !!d[28]); rows.push([30, c.point.x, c.point.y, c.distance, Number(c.shield), distanceToDeployedShield(ships[1], p.pos), distanceToShipHull(ships[1], p.pos)]); }
        else if (op === 1) { if (tick === 0) system.spawn(p, p.pos, ctx, d[29] ? String(d[29]) : undefined); else system.update(d[30], ctx); }
        else if (op === 3) {
          // Source/legacy callbacks are suppressed solely to observe trigger;
          // commit paths are separately compared in op4.
          const probe = new ProjectileCollisionHandler(), probeCtx = { ...ctx, spawnProjectileExplosion: () => {}, fx: new Proxy({}, { get: () => () => {} }) } as unknown as WeaponSimContext;
          p.proximityExplosionSpec = spec; value = Number(probe.checkProximityFuse(p, probeCtx, missiles)); rows = [];
        }
        else if (op === 4) handler.checkProximityFuse(bindProjectileSource({ ...p, rangeRemaining: 0 }, source), ctx, missiles);
        else if (op === 5) {
          let best = Infinity, target: Projectile | undefined;
          for (const missile of missiles) {
            if (missile.isPlayer) continue;
            const t = segmentCircleEntry(p.prevPos, p.pos, missile.pos, missile.radius + (d[16] ? 0 : 2));
            if (t !== null && t < best) { best = t; target = missile; }
          }
          if (target && best < d[27]) { value = 1; const point = Vector2.lerp(p.prevPos, p.pos, best); rows.push([31, target.id, best, point.x, point.y]); }
        }
        else if (op === 7) {
          const poly = [[0, -10], [20, -10], [20, 10], [0, 10], [0, -10], [3, -3], [3, 3], [7, 3], [7, -3], [3, -3], [0, -10]].map(([x, y]) => new Vector2(x, y));
          value = segmentHullHit(p.prevPos, p.pos, poly) ?? -1; rows.push([33, value]);
        }
        else {
          p.projectileExplosionSpec = undefined;
          const hit = handler.checkMissileInterception(p, ctx, missiles); value = Number(!!hit);
          if (hit) rows.push([32, hit.targetProjectileId, Number(hit.targetDestroyed), Number(hit.consumesProjectile), p.pos.x, p.pos.y, p.damagedTargetIds?.length ?? 0]);
        }
        if (ctx.fx.contrails.length) {
          const smoke = ctx.fx.contrails.map(s => [18, s.pos.x, s.pos.y, s.vel.x, s.vel.y, s.life, s.size, s.maxSize, s.rotation]);
          const insert = rows.findIndex(row => row[0] === 7 || row[0] === 21 || row[0] === 1 || row[0] === 3);
          rows.splice(insert < 0 ? rows.length : insert, 0, ...smoke);
        }
        set(); const pointer = wasm.test_run(), actual = Array.from(new Float64Array(wasm.memory.buffer, pointer, wasm.test_output_words()));
        const expected = [value, random.checkpointWitness()[1], visualRandom.checkpointWitness()[1], missiles.length];
        for (const m of missiles) expected.push(m.id, m.hitpoints!);
        expected.push(system.active.length);
        for (const raw of system.active) {
          const e = raw as unknown as ExplosionState; expected.push(e.pos.x, e.pos.y, e.life, e.ships.size, e.missiles.size, e.asteroids.size, e.voidScreens.size);
          for (const ids of [e.ships, e.missiles, e.asteroids]) for (const id of ids) expected.push(Number(id));
          for (const [root, screen] of e.voidScreens) expected.push(Number(root), screen.center.x, screen.center.y, screen.radius, screen.teamId, screen.fraction);
        }
        expected.push(rows.length); const geometric = new Set<number>();
        for (const row of rows) {
          const offset = expected.length + 1;
          const indices = row[0] === 1 ? [4] : row[0] === 3 || row[0] === 5 || row[0] === 19 ? [2, 3] : row[0] === 9 ? [3, 4]
            : [12, 13, 14, 15, 16, 17, 20].includes(row[0]) ? [1, 2] : row[0] === 18 ? [1, 2, 3, 4, 8] : row[0] === 30 ? [1, 2, 3, 5, 6] : row[0] === 32 ? [4, 5] : [];
          for (const i of indices) geometric.add(offset + i); expected.push(row.length, ...row);
        }
        compare(actual.length, expected.length, `scene ${scene} tick ${tick} width`);
        for (let i = 0; i < expected.length; i++) compare(actual[i], expected[i], `scene ${scene} tick ${tick} field ${i}`, geometric.has(i));
        events += rows.length;
      }
    } finally { dispose(); }
  }
  return { passed: true, scenes: 54, strictFields: strict, geometryFields: geometry, maximumDifference, geometryLog, events,
    realDamageIntegrated: false, productionIntegrated: false };
}
