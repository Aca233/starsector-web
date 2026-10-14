import { MissileGuidanceHandler } from '../../src/engine/simulation/systems/weapon/MissileGuidanceHandler';
import { advanceMote } from '../../src/engine/simulation/systems/weapon/MoteGuidance';
import { moteState } from '../../src/engine/extensions/ship-systems/MoteState';
import { SimulationRandom } from '../../src/engine/simulation/SimulationRandom';
import { Vector2 } from '../../src/engine/math/Vector2';
import type { Projectile, MissileMirvSpec } from '../../src/engine/simulation/Weapon';
import type { Ship } from '../../src/engine/simulation/Ship';
import type { WeaponSimContext } from '../../src/engine/simulation/systems/weapon/WeaponSimContext';

interface TestExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory; test_input(n: number): number; test_initialize(): number;
  test_step(): number; test_output_words(): number;
}
interface FlareMemory {
  wait: number; spin: number; seekAfter: number; immune: WeakSet<Projectile>; target?: Projectile; orbitTarget?: Ship;
}
interface SourceFlare { states: WeakMap<Projectile, FlareMemory> }
function optional(value: number | undefined): number[] { return [Number(value !== undefined), value ?? 0]; }
function missileWords(p: Projectile): number[] {
  const d = [p.id, p.id, Number(p.sourceShipId), p.teamId ?? -1, p.isPlayer === undefined ? -1 : Number(p.isPlayer),
    p.pos.x, p.pos.y, p.vel.x, p.vel.y, p.radius, p.elapsedTime, ...optional(p.facingRad), ...optional(p.turnVelocityRad),
    Number(!!p.isGuided), Number(!!p.isRocket), Number(!!p.isFlare), Number(!!p.flareFizzling), p.renderTargetIndicator === undefined ? -1 : Number(p.renderTargetIndicator),
    Number(p.targetShipId ?? 0), p.targetProjectileId ?? 0, ...optional(p.flightTimeRemaining), ...optional(p.engineAcceleration),
    ...optional(p.maxSpeed), ...optional(p.maxTurnRate), ...optional(p.maxTurnAcceleration), ...optional(p.guidanceBonus),
    ...optional(p.eccmChance), ...optional(p.hitpoints), p.damage, ...optional(p.baseDamage), ...optional(p.sourceDamageMultiplier),
    Number(!!p.stageTriggered), ...optional(p.mirvSplitDistance), ...optional(p.flareLife), ...optional(p.flareMaxLife), p.fadeProgress ?? 0,
    Number(!!p.isDisarmed), Number(!!p.collisionDisabled), Number(!!p.didDamage), Number(p.mote !== undefined),
    p.mote?.age ?? 0, p.mote?.turnSign ?? 0, p.mote?.scanRemaining ?? 0];
  while (d.length < 65) d.push(0); return d;
}
function shipWords(s: Ship): number[] {
  const center = s.getShieldCenter(); const d = [Number(s.id), s.teamId ?? -1, Number(s.isPlayer), s.pos.x, s.pos.y, s.vel.x, s.vel.y,
    s.spec.collisionRadius, Number(s.isDead), Number(s.isPhased), Number(s.isRetreated), Number(s.isCollisionless),
    Number(s.spec.hullSize === 'FIGHTER'), Number(s.isVisibleTo(0)), center.x, center.y, s.shield.radius, Number(s.shield.type === 'NONE')];
  while (d.length < 23) d.push(0); return d;
}
function resultWords(p: Projectile): number[] {
  return [p.pos.x, p.pos.y, p.vel.x, p.vel.y, p.elapsedTime, ...optional(p.facingRad), ...optional(p.turnVelocityRad),
    Number(p.targetShipId ?? 0), p.targetProjectileId ?? 0, Number(!!p.stageTriggered), ...optional(p.mirvSplitDistance),
    ...optional(p.flareLife), Number(!!p.flareFizzling), p.fadeProgress ?? 0, Number(p.mote !== undefined), p.mote?.age ?? 0,
    p.mote?.turnSign ?? 0, p.mote?.scanRemaining ?? 0];
}
/** Actual source handlers, including private resident WeakMap/WeakSet state,
 * are the differential oracle. This is not a production-playability test. */
export async function checkRustMissileGuidance(source: BufferSource) {
  const { instance } = await WebAssembly.instantiate(source, {}); const wasm = instance.exports as TestExports;
  let strict = 0, geometry = 0, maxDifference = 0, steps = 0, splits = 0, childrenCount = 0, decoyLocks = 0;
  const geometryLog: { label: string; actual: number; expected: number; difference: number }[] = [];
  function compare(a: number, b: number, label: string, geometric = false) {
    if (!geometric) { strict++; if (!Object.is(a, b)) throw Error(`${label}: ${a} differs from ${b}`); return; }
    geometry++; if (Object.is(a, b)) return;
    const difference = Math.abs(a - b), limit = Math.max(1e-9, 32 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b)));
    if (!Number.isFinite(a) || !Number.isFinite(b) || difference > limit) throw Error(`${label}: geometry ${a} differs from ${b}`);
    maxDifference = Math.max(maxDifference, difference); geometryLog.push({ label, actual: a, expected: b, difference });
  }
  for (let scenario = 0; scenario < 24; scenario++) {
    const mode = scenario < 10 ? 0 : scenario < 18 ? 1 : 2;
    const sourceShip = makeShip(10, 0, false, new Vector2(), new Vector2(22, 2));
    const ships = [sourceShip, makeShip(11, 1, false, new Vector2(350, 47), new Vector2(-8, 19)),
      makeShip(12, 1, false, new Vector2(520, -84), new Vector2(-3, -9)),
      makeShip(13, 1, true, new Vector2(415, 82), new Vector2(-10, 6))];
    const p = makeProjectile(100, '10', 0, new Vector2(90, 20), new Vector2(30, -9));
    p.facingRad = scenario % 2 ? undefined : .19; p.targetShipId = scenario % 3 ? '11' : '12';
    p.targetProjectileId = scenario === 2 ? 101 : undefined; p.isGuided = scenario !== 0;
    p.engineAcceleration = scenario === 1 ? 0 : 180; p.maxSpeed = scenario === 4 ? 31 : 210;
    p.maxTurnRate = scenario === 1 ? 0 : 1.9; p.maxTurnAcceleration = scenario % 3 ? 2.7 : undefined;
    p.guidanceBonus = scenario % 4 === 0 ? 0 : scenario % 4 === 1 ? .45 : scenario % 4 === 2 ? 1.7 : -.2;
    p.sourceDamageMultiplier = scenario % 2 ? undefined : 1.19;
    p.baseDamage = scenario === 5 ? 0 : 75; p.damage = 90;
    const decoy = makeProjectile(101, '11', 1, new Vector2(245, 58), new Vector2(-20, 4));
    decoy.isFlare = true; decoy.flareFizzling = false; decoy.isGuided = false;
    const missiles = [p, decoy, makeProjectile(102, '11', 1, new Vector2(238, 80), new Vector2(-17, 5)),
      makeProjectile(103, '12', 1, new Vector2(205, -60), new Vector2(-12, 8)),
      makeProjectile(104, '10', 0, new Vector2(110, 14), new Vector2(10, -4)),
      makeProjectile(105, '11', 1, new Vector2(700, -150), new Vector2(-13, 11))];
    missiles[2].eccmChance = scenario % 2 ? 0 : .85;
    missiles[3].eccmChance = .14; missiles[5].renderTargetIndicator = false;
    const sourceLocks: number[][] = [];
    for (const q of missiles.slice(1)) {
      let targetProjectileId = q.targetProjectileId;
      Object.defineProperty(q, 'targetProjectileId', { configurable: true, enumerable: true,
        get: () => targetProjectileId, set: (value: number | undefined) => {
          targetProjectileId = value; if (value === p.id) sourceLocks.push([q.id, value]);
        } });
    }
    if (scenario >= 3 && scenario < 10) p.mirv = makeMirv(scenario);
    if (mode === 1) {
      p.isFlare = true; p.isGuided = false; p.flareLife = 2.6; p.flareMaxLife = 2.6;
      if (scenario !== 17) p.flareBehavior = { mode: (['STANDARD', 'SEEKER', 'JAMMER'] as const)[scenario % 3],
        effectRange: 390, effectChance: scenario === 15 ? 1 : .38, flameoutTime: .6, fadeTime: .25, noEngineGlowTime: .2 };
      if (scenario === 14) { p.isPlayer = undefined; p.teamId = undefined; }
    }
    if (mode === 2) {
      p.mote = { age: scenario === 18 ? -.25 : .49, turnSign: scenario % 2 ? 1 : -1, scanRemaining: 0 };
      p.isDisarmed = scenario === 23;
      missiles[4].mote = { age: 1, turnSign: 1, scanRemaining: 0 }; missiles[5].mote = { age: 1, turnSign: -1, scanRemaining: 0 };
      if (scenario === 19) { missiles[4].targetProjectileId = 102; missiles[5].targetProjectileId = 102; }
      if (scenario === 20) { missiles[4].targetShipId = '13'; missiles[5].targetShipId = '13'; }
      if (scenario === 21) p.pos.set(1, 1);
      if (scenario === 22) p.pos.set(600, 300);
    }
    const random = new SimulationRandom(7291 + scenario), handler = new MissileGuidanceHandler();
    const context = { playerShip: sourceShip, enemyShip: ships[1], fighters: [ships[3]], ships, projectiles: missiles,
      asteroids: [{ pos: new Vector2(330, -95), radius: 30 }], random, visualRandom: new SimulationRandom(11),
      fx: { spawnLauncherSmoke: () => {} } } as unknown as WeaponSimContext;
    const shared = moteState(sourceShip); shared.motes = missiles.filter(q => q.mote !== undefined);
    const config = new Float64Array(32 + ships.length * 23 + missiles.length * 65);
    config.set([mode, 7291 + scenario, ships.length, missiles.length, Number(p.mirv !== undefined),
      p.mirv?.splitRange ?? 0, p.mirv?.splitRangeRange ?? 0, p.mirv?.minTimeToSplit ?? 0, Number(!!p.mirv?.canSplitEarly),
      p.mirv?.numShots ?? 0, Number(!!p.mirv?.evenSpread), p.mirv?.arcDeg ?? 0, p.mirv?.spreadInaccuracyDeg ?? 0,
      p.mirv?.spreadSpeed ?? 0, p.mirv?.spreadSpeedRange ?? 0, Number(p.mirv?.childProjectile?.projRadius !== undefined),
      Number(p.mirv?.childProjectile?.spawnType !== undefined), Number(p.flareBehavior !== undefined),
      p.flareBehavior ? ['STANDARD', 'SEEKER', 'JAMMER'].indexOf(p.flareBehavior.mode) : 0,
      p.flareBehavior?.effectRange ?? 0, p.flareBehavior?.effectChance ?? 0, p.flareBehavior?.flameoutTime ?? 0, p.flareBehavior?.fadeTime ?? 0]);
    let offset = 32; ships.forEach(s => { config.set(shipWords(s), offset); offset += 23; });
    missiles.forEach(q => { config.set(missileWords(q), offset); offset += 65; });
    let pointer = wasm.test_input(config.length); new Float64Array(wasm.memory.buffer, pointer, config.length).set(config); wasm.test_initialize();
    for (let tick = 0; tick < 120; tick++) {
      const dt = tick % 13 === 0 ? .11 : tick % 11 === 0 ? 0 : .04;
      if (tick === 18) ships[1].isDead = true; if (tick === 39) Object.assign(ships[2], { isPhased: true });
      if (tick === 55) ships[1].isDead = false; if (tick === 23) missiles[2].hitpoints = 0;
      if (tick === 43) missiles[3].flightTimeRemaining = 0;
      ships.forEach(s => s.pos.addScaled(s.vel, dt)); missiles.slice(1).forEach(q => q.pos.addScaled(q.vel, dt));
      shared.elapsed += dt; shared.attractorTarget = tick % 20 < 13 ? new Vector2(650, 110) : undefined;
      shared.attractorLock = tick >= 35 && tick < 51 ? ships[1] : undefined;
      const liveMissiles = mode === 2 && tick >= 31 ? missiles.filter((_, k) => k !== 4) : missiles;
      const lockBefore = missiles.map(q => q.targetProjectileId); const len = missiles.length;
      sourceLocks.length = 0;
      p.elapsedTime += dt;
      let removed = false;
      if (mode === 1) removed = handler.updateFlare(p, dt, context, missiles);
      else if (mode === 2) advanceMote(p, dt, context, liveMissiles, ships);
      else removed = handler.updateMissile(p, dt, context, missiles, ships);
      const children = missiles.slice(len); if (!removed) p.pos.addScaled(p.vel, dt);
      pointer = wasm.test_input(1); new Float64Array(wasm.memory.buffer, pointer, 1)[0] = dt;
      const actualPointer = wasm.test_step(); const actual = Array.from(new Float64Array(wasm.memory.buffer, actualPointer, wasm.test_output_words()));
      const label = `scene ${scenario} tick ${tick}`;
      let cursor = 0;
      compare(actual[cursor++], Number(removed), label + ' removed');
      random.checkpointWitness().forEach((v, k) => compare(actual[cursor++], v, label + ' rng ' + k));
      compare(actual[cursor++], children.length, label + ' children'); const lockCountIndex = cursor++;
      compare(actual[lockCountIndex], sourceLocks.length, label + ' lock count');
      resultWords(p).forEach((v, k) => compare(actual[cursor++], v, label + ' missile ' + k, [0, 1, 2, 3, 6, 8].includes(k)));
      const state = (handler as unknown as { flares: SourceFlare }).flares.states.get(p);
      compare(actual[cursor++], Number(state !== undefined), label + ' state');
      if (state) {
        const immune = missiles.slice(0, len).filter(q => state.immune.has(q));
        // The Rust list preserves insertion, WeakSet does not expose order; its
        // membership and count remain strict, and actual spoof order is checked.
        [state.wait, state.spin, state.seekAfter, state.target?.id ?? 0, Number(state.orbitTarget?.id ?? 0), immune.length].forEach((v, k) => compare(actual[cursor++], v, label + ' state ' + k));
        const actualImmune = actual.slice(cursor, cursor + immune.length); cursor += immune.length;
        actualImmune.toSorted((a, b) => a - b).forEach((v, k) => compare(v, immune.map(q => q.id).sort((a, b) => a - b)[k], label + ' immune ' + k));
      }
      const actualLocks = actual[lockCountIndex]; let lockCursor = cursor + len;
      for (let k = 0; k < len; k++) compare(actual[cursor++], missiles[k].targetProjectileId ?? 0, label + ' target ' + k);
      for (let k = 0; k < actualLocks; k++) {
        const target = actual[lockCursor++], decoyId = actual[lockCursor++];
        compare(target, sourceLocks[k][0], label + ' lock target order ' + k);
        compare(decoyId, sourceLocks[k][1], label + ' lock decoy order ' + k);
        compare(decoyId, p.id, label + ' decoy ' + k); const q = missiles.find(q => q.id === target)!;
        compare(q.targetProjectileId ?? 0, decoyId, label + ' ordered lock ' + k);
      }
      // Locks may reaffirm the same decoy; verify changed locks are represented.
      const changed = missiles.slice(0, len).filter((q, k) => q.targetProjectileId !== lockBefore[k]);
      if (mode === 1 && changed.length > actualLocks) throw Error(label + ' missing lock');
      cursor = lockCursor;
      children.forEach((c, k) => {
        const type = c.spawnType === 'BALLISTIC_AS_BEAM' ? 2 : 1;
        const expected = [c.id, Number(c.sourceShipId), 7, c.pos.x, c.pos.y, c.vel.x, c.vel.y, c.facingRad!,
          c.baseDamage!, c.damage, c.empDamage!, 2, c.radius, c.totalRange, c.hitpoints!, type, c.sourceMoveSpeed ?? 0,
          c.sourceVelocity?.x ?? 0, c.sourceVelocity?.y ?? 0, ...optional(c.sourceDamageMultiplier)];
        expected.forEach((v, j) => compare(actual[cursor++], v, `${label} child ${k}/${j}`, [3, 4, 5, 6, 7, 17, 18].includes(j)));
      });
      compare(actual.length, cursor, label + ' output width');
      steps++; childrenCount += children.length; decoyLocks += actualLocks;
      if (removed) { if (children.length) splits++; break; }
    }
  }
  return { passed: true, scenarios: 24, steps, strictFields: strict, geometryFields: geometry, maxGeometryDifference: maxDifference,
    geometryLog, splits, children: childrenCount, decoyLocks, productionIntegrated: false, fullBattleReady: false,
    scope: 'actual-source-missile-flare-mote-guidance' };
}
function makeShip(id: number, team: number, fighter: boolean, pos: Vector2, vel: Vector2): Ship {
  return { id: String(id), teamId: team, isPlayer: team === 0, pos, vel, isDead: false, isPhased: false, isRetreated: false,
    isCollisionless: false, spec: { collisionRadius: fighter ? 18 : 49, hullSize: fighter ? 'FIGHTER' : 'FRIGATE' },
    shield: { type: id === 12 ? 'NONE' : 'FRONT', radius: 63 }, getShieldCenter: () => pos,
    isVisibleTo: () => true } as unknown as Ship;
}
function makeProjectile(id: number, source: string, team: number, pos: Vector2, vel: Vector2): Projectile {
  return { id, sourceShipId: source, teamId: team, isPlayer: team === 0, specId: 'guidance-fixture', pos, prevPos: pos.clone(), vel,
    radius: 3, elapsedTime: 0, damage: 50, baseDamage: 50, damageType: 'ENERGY', rangeRemaining: 1000, totalRange: 1000,
    color: [255, 0, 0], isRocket: true, isGuided: true, hitpoints: 4, maxHitpoints: 4, maxSpeed: 180,
    engineAcceleration: 120, maxTurnRate: 2, maxTurnAcceleration: 5, flightTimeRemaining: 12 } as Projectile;
}
function makeMirv(scenario: number): MissileMirvSpec {
  return { splitRange: scenario === 8 ? 25 : scenario === 9 ? 1500 : 350, splitRangeRange: 60,
    minTimeToSplit: scenario === 9 ? 3 : scenario === 8 ? 8 : .6, canSplitEarly: scenario >= 7, numShots: scenario === 3 ? 1 : scenario === 4 ? 2 : 5,
    damage: 133, emp: 17, damageType: 'HIGH_EXPLOSIVE', childHitpoints: 4, evenSpread: scenario % 2 === 0,
    arcDeg: 28, spreadInaccuracyDeg: 4.5, spreadSpeed: 75, spreadSpeedRange: 35, projectileRange: 799, projectileSpec: '7',
    childProjectile: scenario % 2 ? { projLength: 30, fadeTime: .1 } : { projRadius: 3, spawnType: 'BALLISTIC_AS_BEAM', projLength: 30, fadeTime: .1 } };
}
