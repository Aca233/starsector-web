import { Ship } from '../../src/engine/simulation/Ship';
import { ArmorGrid } from '../../src/engine/simulation/ArmorGrid';
import { ShipDamageState } from '../../src/engine/simulation/ShipDamageState';
import { FluxTracker } from '../../src/engine/simulation/FluxTracker';
import { Shield } from '../../src/engine/simulation/Shield';
import { ShipSystem } from '../../src/engine/simulation/ShipSystem';
import { SimulationRandom } from '../../src/engine/simulation/SimulationRandom';
import { Vector2 } from '../../src/engine/math/Vector2';
import { CombatFXSystem } from '../../src/engine/simulation/systems/CombatFXSystem';
import { AsteroidSystem, type AsteroidFXCallbacks } from '../../src/engine/simulation/systems/AsteroidSystem';
import { NebulaSystem } from '../../src/engine/simulation/systems/NebulaSystem';
import { ShipCollisionSystem } from '../../src/engine/simulation/systems/ShipCollisionSystem';
import { ProjectileCollisionHandler } from '../../src/engine/simulation/systems/weapon/ProjectileCollisionHandler';
import type { WeaponSimContext } from '../../src/engine/simulation/systems/weapon/WeaponSimContext';
import { createShipHulk } from '../../src/engine/visual/HulkVisuals';
import { damageWeaponComponent } from '../../src/engine/simulation/systems/weapon/WeaponComponentHealth';
import { captureCombatAudio } from '../../src/engine/audio/CombatAudioEvents';
import type { WeaponMount, Projectile } from '../../src/engine/simulation/Weapon';
import type { HulkFragment } from '../../src/engine/simulation/CombatTypes';

interface Exports extends WebAssembly.Exports { memory: WebAssembly.Memory; test_input(n: number): number; test_run(): number; test_output_words(): number }
const keys = ['ship_collision', 'collision_asteroid_ship', 'collision_asteroid_asteroid', 'explosion'];
export async function checkRustTerrainWorld(source: BufferSource) {
  if (!Ship || !createShipHulk) throw Error('Actual source unavailable');
  const { instance } = await WebAssembly.instantiate(source, {}), wasm = instance.exports as Exports;
  let strict = 0, geometry = 0, maximumDifference = 0, events = 0;
  const geometryLog: { label: string; actual: number; expected: number; difference: number }[] = [];
  for (let scene = 0; scene < 44; scene++) {
    const random = new SimulationRandom(8127), visual = new SimulationRandom(15181), fx = new CombatFXSystem(visual), asteroid = new AsteroidSystem(random, visual);
    const rows: number[][] = [], masks: boolean[][] = [], expected: number[] = [], geometric: boolean[] = [];
    const put = (v: number, g = false) => { expected.push(v); geometric.push(g); };
    const row = (r: number[], g: number[] = []) => { rows.push(r); masks.push(r.map((_, i) => g.includes(i))); };
    const ships: Ship[] = [];
    for (let i = 0; i < 2; i++) {
      const p = new Vector2(i === 0 ? 0 : scene % 7 === 0 ? 0 : scene % 7 === 1 ? 75 : 24, i === 1 && scene % 4 === 0 ? 9 : 0);
      const armor = new ArmorGrid(9, 7, 10, 10, 27, -45, -35), decals = new ShipDamageState(armor, visual), flux = new FluxTracker(100000, 0, 'FRIGATE');
      armor.onCellDamage = (c, r, d) => decals.onCellDamage(c, r, d);
      const bounds = scene % 6 === 0 ? [] : scene % 6 === 1 ? [[-30, -20], [30, -20], [30, 20], [4, 20], [4, 4], [-30, 4]] : [[-30, -20], [30, -20], [30, 20], [-30, 20]];
      const mount = { slotId: '1', mountType: 'TURRET', relativePos: new Vector2(3, -4), spec: { mountSize: 'SMALL' }, health: 250, maxHealth: 250,
        isDisabled: false, isPermanentlyDisabled: false, disabledDuration: 0, disabledTimer: 0 } as WeaponMount;
      const s = Object.create(Ship.prototype) as Ship;
      const shieldCenter = () => s.pos.clone().add(new Vector2(i === 0 ? 4 : -3, 2));
      Object.assign(s, { id: String(i + 1), teamId: scene % 5 === 0 ? 0 : i, isPlayer: i === 0, pos: p, vel: i === 0 ? new Vector2(75, 3) : new Vector2(-15, -2), facingRad: i === 0 ? .27 : -.37,
        spec: { hullSize: 'FRIGATE', collisionRadius: 30, bounds, mass: i === 0 ? scene % 3 === 0 ? 100 : 500 : 200, engineSlots: [], spriteHeight: 250,
          weaponSlots: [{ slotId: '1', x: -50, y: 0 }, { slotId: '2', x: 50, y: 0 }, { slotId: '3', x: 0, y: 0 }] },
        hullHp: 10000, hullStats: { hitpoints: 10000 }, armor, damageDecals: decals, flux, isDead: scene === 17 && i === 0,
        parentShip: null, isRetreated: false, hullDamageSuppressed: false, hullDamageInterceptors: new Set(),
        shield: { isActive: scene % 3 !== 0, type: 'OMNI', currentArcDeg: scene % 4 === 0 ? 360 : 80, radius: 33, facingAngleRad: i === 0 ? .1 : 3.2,
          voidShield: scene % 5 === 0 ? {} : undefined,
          recordDamageContact: (d: number) => row([0, i + 1, d]), absorbImpact: (d: number, kind: string, angle: number) => { row([1, i + 1, d, kind === 'KINETIC' ? 1 : 0, angle], [4]); return { flux: d * 2 * .83, absorbed: d, remainingFraction: 0 }; },
          isHitBlocked: (_center: Vector2, point: Vector2) => {
            if (!s.shield.isActive || s.shield.currentArcDeg <= 5) return false;
            const d = point.clone().sub(shieldCenter()); let angle = Math.atan2(d.y, d.x) - s.shield.facingAngleRad;
            while (angle > Math.PI) angle -= 2 * Math.PI; while (angle < -Math.PI) angle += 2 * Math.PI;
            return Math.abs(angle) <= s.shield.currentArcDeg * Math.PI / 360;
          } },
        getShieldCenter: shieldCenter, weaponDamageTakenMultiplier: 1.13, engineDamageTakenMultiplier: 1.19,
        system: { getShieldDamageMultiplier: () => 1.11 }, syncModuleTree: () => {}, terrainSpeedMult: .3,
        weaponControl: { weapons: [mount], damageComponent: (m: WeaponMount, d: number) => damageWeaponComponent(m, d, random) },
      });
      Object.defineProperties(s, { crDamageTakenMultiplier: { value: 1.13 }, effectiveEmpDamageTakenMultiplier: { value: 1.23 }, damageToTargetWeaponsMultiplier: { value: 1.17 },
        damageToTargetEnginesMultiplier: { value: 1.09 }, isCollisionless: { value: scene === 18 && i === 1 }, isStation: { value: scene % 8 === 0 && i === 1 } });
      const takeDamage = armor.takeDamage.bind(armor);
      armor.takeDamage = (local, d, kind, strength = d, beam = false) => { const damage = takeDamage(local, d, kind, strength, beam); row([3, i + 1, local.x, local.y, d, kind === 'KINETIC' ? 1 : 0, strength, damage.armorDamage, damage.hullDamage], [2, 3]); return damage; };
      const hull = s.applyHullDamage.bind(s); s.applyHullDamage = d => { const result = hull(d); row([5, i + 1, d]); return result; };
      const increase = flux.increaseShieldFlux.bind(flux); flux.increaseShieldFlux = (d, hard) => { const result = increase(d, hard); row([2, i + 1, d]); return result; };
      if (scene >= 30) { const shield = new Shield('OMNI', 180, 33, .83);
        Object.assign(shield, { currentArcDeg: 80, facingAngleRad: 1.4, closeTimeRemaining: .35 }); s.shield = shield;
        const systems = [new ShipSystem('NONE'), new ShipSystem('NONE')];
        for (const system of systems) Object.assign(system, { state: 'COOLDOWN', isCoolingDown: true, cooldownTimer: .4, stageTimer: .4, disabled: true });
        s.system = systems[0]; Object.defineProperty(s, 'allSystems', { value: systems });
      }
      ships.push(s);
    }
    const sparks = (s: Ship, local: Vector2, damage: number) => { const first = fx.particles.length; fx.spawnArmorDamageSparks(s, local, damage); const r = [4, Number(s.id), local.x, local.y, damage, fx.particles.length - first], g = [2, 3];
      for (const p of fx.particles.slice(first)) { const offset = r.length; r.push(p.pos.x, p.pos.y, p.vel.x, p.vel.y, p.size); g.push(offset, offset + 1, offset + 2, offset + 3); } row(r, g); };
    const debris = (p: Vector2, count = 3, c: [number, number, number] = [120, 110, 100], speed = 90) => { const first = fx.debris.length; fx.spawnDebris(p, count, c, speed); row([6, p.x, p.y, count, speed, fx.debris.length - first], [1, 2]); };
    const spawnSparks = (p: Vector2, count = 15, c: [number, number, number] = [255, 200, 100]) => { const first = fx.particles.length; fx.spawnSparks(p, count, c);
      const r = [7, p.x, p.y, count, ...c, fx.particles.length - first], g = [1, 2];
      for (const s of fx.particles.slice(first)) { const offset = r.length; r.push(s.pos.x, s.pos.y, s.vel.x, s.vel.y, s.life, s.size, s.endSize!, ...s.color, s.peakAlpha!, s.drag!, s.rotation!, s.stretch!); g.push(offset, offset + 1, offset + 2, offset + 3); } row(r, g);
    };
    const spawnExplosion = (p: Vector2, radius: number, c: [number, number, number]) => { fx.spawnAuthenticExplosion(p, radius, c); const e = fx.explosions.at(-1)!;
      const r = [8, p.x, p.y, radius, ...c, e.id, e.radius, e.maxRadius, e.life, e.rotation, e.shockwaveRadius, e.maxShockwaveRadius, e.puffs!.length], g = [1, 2];
      for (const puff of e.puffs!) { const offset = r.length; r.push(puff.texture, puff.startSize, puff.endSize, puff.rotation, puff.offset.x, puff.offset.y, puff.velocity.x, puff.velocity.y); g.push(offset + 4, offset + 5, offset + 6, offset + 7); } row(r, g);
    };
    const callbacks: AsteroidFXCallbacks = { spawnArmorDamageSparks: sparks, spawnDebris: debris,
      addFloatingDamage: (p, d, c) => row([9, p.x, p.y, d, ...c], [1, 2]), spawnShieldRipple: (p, r, c) => row([10, p.x, p.y, r, ...c], [1, 2]),
      spawnSparks, spawnAuthenticExplosion: spawnExplosion,
      addFloatingText: p => row([13, p.x, p.y], [1, 2]), getPlayerPos: () => ships[0].pos, detachContrail: id => row([14, id]),
    };
    const release = captureCombatAudio(e => { if (e.kind === 'play' && e.position) row([11, keys.indexOf(e.key), ...e.position, e.volume], [2, 3]); });
    const hulks: HulkFragment[] = [], nebula = new NebulaSystem();
    try {
      if (scene < 20) { new NebulaSystem().update(ships); put(Number(new ShipCollisionSystem().resolveShipToShipCollision(ships[0], ships[1], { ...callbacks, addCameraShake: (d, time) => row([12, d, time]) }, .017))); }
      else if (scene === 20) { asteroid.init(); asteroid.update(270); nebula.init(); }
      else if (scene < 30) {
        for (let i = 0; i < 3; i++) asteroid.asteroids.push({ id: i + 1, pos: new Vector2(i === 0 ? 20 : i === 1 ? 25 : 130, i * 2), vel: new Vector2(-17 + i * 4, 3), facingRad: .37, angularVel: .13,
          radius: i === 0 ? 40 : 18, mass: i === 0 ? 1200 : 243, hp: scene % 3 === 0 ? 70 : 600, maxHp: 600, spriteUrl: '/game-assets/graphics/asteroids/asteroid3.png', gravityFixed: scene % 4 === 0 && i === 0 });
        if (scene < 25) asteroid.resolveShipCollisions(ships, callbacks);
        else { const p = { id: .73, prevPos: new Vector2(-100, 0), pos: new Vector2(200, 0), radius: 3, damage: scene % 2 === 0 ? 750 : 30, isRocket: true,
          damagedTargetIds: scene === 29 ? ['terrain:asteroid:1'] : [] } as Projectile;
          const hit = asteroid.queryProjectileImpact(p); if (hit) { put(hit.asteroidIndex); put(hit.t, true); put(hit.point.x, true); put(hit.point.y, true); asteroid.commitProjectileImpact(p, hit, callbacks, undefined, scene % 2 === 0); }
          else for (let i = 0; i < 4; i++) put(-1);
        }
      } else {
        const shape = (scene - 30) % 4;
        const bounds = shape === 0 ? [[-100, -70], [100, -70], [100, 70], [-100, 70]] : shape === 1 ? [[-80, -60], [80, -60], [80, 60], [0, 30], [-80, 60]] : shape === 2 ? [[0, 0], [1, 0], [0, 1]] : [[0, 0], [100, 100], [100, 0], [0, 100]];
        ships[0].spec.hullSize = scene === 37 ? 'FIGHTER' : scene % 2 === 0 ? 'CAPITAL_SHIP' : 'FRIGATE';
        hulks.push({ id: 1, sourceShip: ships[0], age: scene === 37 ? 10.45 : 0, pos: new Vector2(20, -30), vel: new Vector2(7, -3), facingRad: .27, angularVel: .07,
          localOffset: new Vector2(), bounds: bounds.map(([x, y]) => new Vector2(x, y)), visualBounds: null, collisionRadius: 140, mountSlotIds: ['1', '2', '3'],
          breakup: { remainingSplits: 3, interval: .11, elapsed: 0, nextInterval: .08 }, gravityFixed: scene === 38, gravityManaged: scene === 39 });
        fx.hulkFragments = hulks;
        if (scene < 40) for (let tick = 0; tick < 5; tick++) fx.updateHulkFragments(.13);
        else { const p = { id: .73, prevPos: scene === 41 ? new Vector2(20, -30) : new Vector2(-200, scene === 43 ? 500 : -30), pos: new Vector2(200, scene === 43 ? 500 : -30), radius: 3, damage: 45, isRocket: true,
            damagedTargetIds: scene === 42 ? ['terrain:wreck:1'] : [] } as Projectile;
          const handler = new ProjectileCollisionHandler(), ctx = { hulkFragments: hulks, fx: { spawnSparks, spawnDebris: debris } } as unknown as WeaponSimContext;
          handler.applyEnvironmentImpact = (p, point, velocity) => { p.pos.copy(point); row([15, p.id, point.x, point.y, velocity.x, velocity.y], [2, 3, 4, 5]); };
          const hit = handler.queryHulkCollision(p, ctx); if (hit) { [hit.id, hit.t, hit.point.x, hit.point.y, hit.velocity.x, hit.velocity.y, hit.radius].forEach((v, i) => put(v, i > 0)); handler.checkHulkCollision(p, ctx); }
          else for (let i = 0; i < 7; i++) put(-1);
        }
      }
    } finally { release(); }
    [random.checkpointWitness()[1], visual.checkpointWitness()[1], visual.checkpointWitness()[2]].forEach(v => put(v));
    for (const s of ships) { [s.pos.x, s.pos.y, s.vel.x, s.vel.y].forEach(v => put(v, true));
      [s.hullHp, s.flux.hardFlux, s.terrainSpeedMult, s.armor.dirtyVersion, s.damageDecals.revision, (s.damageDecals as unknown as { armorRevision: number }).armorRevision].forEach(v => put(v));
      s.armor.copyCells().forEach(v => put(v)); put(s.scorchMarks.length);
      for (const m of s.scorchMarks) [m.cellIndex, m.localPos.x, m.localPos.y, m.opacity, 0, m.heat, Number(m.justHit), m.flash, m.flashElapsed, m.phase, m.pulsePeriod, m.size, m.rotationRad, ['cracks', 'burns', 'holes'].indexOf(m.kind), m.variant].forEach((v, i) => put(v, i === 1 || i === 2 || i === 12));
      for (const m of s.weapons) { const h = m.healthTracker; [1, 0, 0, m.relativePos.x, m.relativePos.y, m.health, m.maxHealth, Number(m.isDisabled), Number(m.isPermanentlyDisabled), m.disabledDuration, m.disabledTimer, Number(!!h), h?.repairDuration ?? 0, h?.hitAgo ?? 0, h?.interval ?? 0, h?.elapsed ?? 0, Number(h?.intervalElapsed ?? false), 1, 1, 0].forEach(v => put(v)); }
      if (scene >= 30) {
        [s.shield.currentArcDeg, s.shield.facingAngleRad, (s.shield as unknown as { closeTimeRemaining: number }).closeTimeRemaining].forEach((v, i) => put(v, i === 1));
        for (const system of s.allSystems) { const inner = system as unknown as { pendingActivationFlux: number; pendingActivationEvents: number; pendingActiveEvents: number; chargeRegenTimer: number; stageTimer: number; outEntryEffectLevel: number };
          [s.allSystems.indexOf(system) + 1, 1, ['IDLE', 'IN', 'ACTIVE', 'OUT', 'COOLDOWN'].indexOf(system.state), system.effectLevel, Number(system.isActive), Number(system.isCoolingDown), system.activeTimer, system.cooldownTimer, system.charges, system.activationSerial,
            inner.pendingActivationFlux, inner.pendingActivationEvents, inner.pendingActiveEvents, inner.chargeRegenTimer, inner.stageTimer, inner.outEntryEffectLevel, Number(system.disabled)].forEach(v => put(v));
        }
      }
    }
    put(asteroid.asteroids.length);
    for (const a of asteroid.asteroids) [a.id, a.pos.x, a.pos.y, a.vel.x, a.vel.y, a.facingRad, a.angularVel, a.radius, a.mass, a.hp, a.maxHp, a.spriteUrl.includes('big') ? 4 : a.spriteUrl.includes('asteroid3') ? 2 : a.spriteUrl.includes('asteroid2') ? 1 : 0, Number(!!a.gravityFixed)].forEach((v, i) => put(v, i >= 1 && i <= 6));
    put(hulks.length);
    for (const h of hulks) { [h.id, h.age, h.pos.x, h.pos.y, h.vel.x, h.vel.y, h.facingRad, h.angularVel, h.localOffset.x, h.localOffset.y, h.collisionRadius, h.breakup ? 1 : 0, h.bounds.length].forEach((v, i) => put(v, i >= 2 && i <= 10));
      for (const p of h.bounds) { put(p.x, true); put(p.y, true); } put(h.visualBounds?.length ?? 0); for (const p of h.visualBounds ?? []) { put(p.x, true); put(p.y, true); } put(h.mountSlotIds.length); h.mountSlotIds.forEach(id => put(Number(id)));
    }
    put(nebula.nebulae.length); for (const cloud of nebula.nebulae) { [cloud.id, cloud.pos.x, cloud.pos.y, cloud.thickness, cloud.atlasColumn, cloud.atlasRow, cloud.spriteUrl!.length].forEach(v => put(v)); for (const c of cloud.spriteUrl!) put(c.charCodeAt(0)); }
    put(rows.length); events += rows.length; rows.forEach((r, i) => { put(r.length); r.forEach((v, j) => put(v, masks[i][j])); });
    const ptr = wasm.test_input(1); new Float64Array(wasm.memory.buffer, ptr, 1).set([scene]); const output = wasm.test_run(); if (!output) throw Error(`Rust failed scene ${scene}`);
    const actual = Array.from(new Float64Array(wasm.memory.buffer, output, wasm.test_output_words()));
    if (actual.length !== expected.length) throw Error(`Scene ${scene} length ${actual.length} differs from ${expected.length}`);
    actual.forEach((a, i) => { const b = expected[i]; const label = `scene ${scene} word ${i}`;
      if (!geometric[i]) { strict++; if (!Object.is(a, b)) throw Error(`${label}: ${a} differs from ${b}`); return; }
      geometry++; if (Object.is(a, b)) return; const difference = Math.abs(a - b), limit = Math.max(1e-9, 32 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b)));
      if (!Number.isFinite(a) || !Number.isFinite(b) || difference > limit) throw Error(`${label}: geometry ${a} differs from ${b}`);
      maximumDifference = Math.max(maximumDifference, difference); geometryLog.push({ label, actual: a, expected: b, difference });
    });
  }
  return { passed: true, scenes: 44, strictFields: strict, geometryFields: geometry, orderedEvents: events, maximumDifference, geometryLog,
    actualTSOracle: true, actualArmorAndComponents: true, actualHulkSourceShieldAndPrimaryLifecycle: true, actualTerrainVisualFactories: true, hulkFracture: true, shieldCollisionAbsorptionRecorded: true, environmentImpactOwnerRecorded: true, productionIntegrated: false };
}
