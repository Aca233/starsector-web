import { Ship } from '../../src/engine/simulation/Ship';
import { ShipWeaponControlSystem } from '../../src/engine/simulation/systems/ShipWeaponControlSystem';
import { ShipSystem } from '../../src/engine/simulation/ShipSystem';
import { FluxTracker } from '../../src/engine/simulation/FluxTracker';
import { SimulationRandom } from '../../src/engine/simulation/SimulationRandom';
import { Vector2 } from '../../src/engine/math/Vector2';
import { combatProjectileSpeed, combatWeaponRange } from '../../src/engine/simulation/WeaponRange';
import type { WeaponMount, WeaponSpec, Projectile, Beam } from '../../src/engine/simulation/Weapon';
import type { ShipSpec } from '../../src/engine/content/ShipSpec';

interface TestExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory; test_input(n: number): number; test_initialize(): number;
  test_commit(): number; test_output_words(): number;
}
interface SourceMethods {
  requestWeaponFire(m: WeaponMount, s: Ship, p: (p: Projectile) => void, b: (b: Beam) => void): boolean;
  advanceWeaponLifecycle(dt: number, m: WeaponMount, s: Ship, can: boolean, p: (p: Projectile) => void, b: (b: Beam) => void): void;
  programFluxBudget(s: Ship, m: WeaponMount, dt: number): boolean;
}
const states = ['IDLE', 'CHARGING', 'ACTIVE', 'CHARGEDOWN'] as const;
function mountWords(m: WeaponMount): number[] {
  return [1, 1, Number(m.spec.isBeam), Number(m.spec.beamVisualMode === 'BURST'), m.spec.refireDelay,
    m.spec.chargeTime ?? 0, m.spec.burstDelay ?? 0, Number(m.spec.beamBurstDelay !== undefined), m.spec.beamBurstDelay ?? 0,
    Number(m.spec.maxAmmo !== undefined), m.spec.maxAmmo ?? 0, m.spec.ammoRegenPerSec ?? 0, m.spec.minSpread || 0,
    m.spec.spreadDecay || 5, Number(m.spec.id === 'web_gloriana_torpedo'), m.currentAngleRad, m.cooldownTimer,
    m.ammo, m.ammoRechargeProgress, m.lifecycleDt ?? 0, m.burstRemaining, m.burstTimer, Number(m.burstFluxReserved),
    states.indexOf(m.firingState), m.firingStateTimer, Number(m.triggerHeld), m.firingCycleId, m.reloadDelayRemaining ?? 0,
    m.recoil, m.glowAlpha, m.barrelIndex, m.currentSpreadDeg, Number(m.loadedMissileLevels !== undefined),
    m.loadedMissileLevels?.[0] ?? 0, m.loadedMissileLevels?.[1] ?? 0, Number(m.ammo === Infinity)];
}

/** Actual private source stage methods remain the oracle. This isolated fixture
 * checks the cycle/emitter module only; it is not production playability proof. */
export async function checkRustWeaponFire(source: BufferSource) {
  const { instance } = await WebAssembly.instantiate(source, {});
  const wasm = instance.exports as TestExports;
  let strict = 0, geometry = 0, maxDifference = 0, emissions = 0, starts = 0, rejected = 0;
  const geometryLog: { label: string; actual: number; expected: number; difference: number }[] = [];
  function compare(a: number, b: number, label: string, geometric = false) {
    if (!geometric) { strict++; if (!Object.is(a, b)) throw Error(`${label}: ${a} differs from ${b}`); return; }
    geometry++; if (Object.is(a, b)) return;
    const difference = Math.abs(a - b), limit = Math.max(1e-9, 32 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b)));
    if (!Number.isFinite(a) || !Number.isFinite(b) || difference > limit) throw Error(`${label}: geometry ${a} differs from ${b}`);
    maxDifference = Math.max(maxDifference, difference); geometryLog.push({ label, actual: a, expected: b, difference });
  }
  for (let scenario = 0; scenario < 32; scenario++) {
    const beam = scenario >= 12 && scenario < 24 || [25, 26, 28, 31].includes(scenario);
    const burstBeam = scenario % 3 === 0, rocket = !beam && scenario % 4 === 2;
    const random = new SimulationRandom(7291), flux = new FluxTracker(1000, 0, 'FRIGATE');
    flux.softFlux = scenario % 7 === 0 ? 940 : 40; flux.hardFlux = 17;
    const owner = Object.create(Ship.prototype) as Ship;
    const shipSpec = { id: 'fire-domain', hullSize: 'FRIGATE', hullMods: [], builtInHullMods: [], weaponSlots: [] } as unknown as ShipSpec;
    Object.assign(owner, { id: 'fire-domain', spec: shipSpec, pos: new Vector2(100, -50), vel: new Vector2(7, -3), facingRad: .27,
      flux, isPlayer: false, teamId: 2, isDead: false, isRetreated: false, isDocked: false, currentCR: .7,
      ecmRangePenalty: 7, hullStats: { fluxDissipation: 0 }, parentShip: null, runtimeModifiers: { empty: false, value: {
        recoilMultiplier: 1.17, beamDamageMultiplier: 1.09, weapons: { BALLISTIC: { damageMultiplier: 1.21, fluxCostMultiplier: 1.13 } } } },
      currentTargetShip: { id: '47' }, fireControlMode: scenario % 2 ? 'AI' : 'MANUAL' });
    Object.defineProperty(owner, 'crDamageDealtMultiplier', { value: 1.07 });
    const system = new ShipSystem('NONE', 1000, owner); Object.assign(owner, { system });
    const offsets = scenario % 3 !== 1;
    const spec = { id: scenario === 4 ? 'web_gloriana_torpedo' : 'fire-domain-' + scenario,
      weaponType: 'BALLISTIC', mountSize: 'SMALL', isBeam: beam, beamVisualMode: burstBeam ? 'BURST' : 'SUSTAINED',
      refireDelay: .7, chargeTime: scenario % 3 === 0 ? 0 : .21, burstDelay: scenario % 4 === 0 ? .00001 : .08,
      burstSize: scenario % 3 + 1, interruptibleBurst: scenario % 2 === 1, autoCharge: scenario % 4 === 0,
      fluxPerShot: scenario % 5 === 0 ? 0 : 37, fluxPerSecond: beam ? 71 : 0,
      beamSourceChargeupTime: scenario % 4 === 0 ? 0 : .17, beamSourceChargedownTime: scenario % 5 === 0 ? 0 : .23,
      beamDuration: .31, beamBurstDelay: .9, beamFireOnlyOnFullCharge: scenario % 2 === 0,
      maxAmmo: scenario % 6 === 1 ? undefined : scenario === 4 ? 2 : 7, range: 1000 / .93,
      minSpread: .7, maxSpread: 13, spreadPerShot: 2.3, spreadDecay: 5,
      turretOffsets: offsets ? [3, -4, -2, 6] : undefined, damagePerShot: 127, damagePerSecond: 197,
      empPerShot: 13, empPerSecond: 23, projSpeed: 317, projRadius: 3, color: [255, 100, 50],
      isPointDefense: scenario % 4 === 0, isRocket: rocket, spawnType: rocket ? 'MISSILE' : 'BALLISTIC',
      launchSpeed: 67, flightTime: 9, fireRecoilSpeed: scenario % 4 === 3 ? 0 : .47,
      missileLifecycleSpec: rocket ? { dudProbabilityOnFlameout: .23, flameoutTime: 1, fadeTime: .5,
        noEngineGlowTime: .7, collisionClassAfterFlameout: 'NONE', fizzleOnReachingWeaponRange: true,
        noCollisionWhileFading: true, reduceDamageWhileFading: false } : undefined } as WeaponSpec;
    const mount = { slotId: '1', spec, mountType: 'TURRET', relativePos: new Vector2(11, -9), currentAngleRad: .37,
      cooldownTimer: 0, ammo: spec.maxAmmo ?? Infinity, ammoRechargeProgress: 0, lifecycleDt: 0,
      burstRemaining: 0, burstTimer: 0, burstFluxReserved: false, firingState: 'IDLE', firingStateTimer: 0,
      triggerHeld: false, firingCycleId: 0, reloadDelayRemaining: scenario === 9 ? .1 : 0,
      recoil: 0, glowAlpha: 0, barrelIndex: 0, currentSpreadDeg: .7, isDisabled: false,
      fireControl: {}, fireControlTargetShipId: '47', fireControlTargetProjectileId: '73' } as unknown as WeaponMount;
    if (scenario === 24) { mount.burstRemaining = 3; mount.burstTimer = .01; mount.burstFluxReserved = true; mount.ammo = 2.4; }
    if (scenario === 25) { mount.firingState = 'ACTIVE'; mount.firingStateTimer = Infinity; mount.firingCycleId = 17; }
    if (scenario === 26) { mount.firingState = 'CHARGING'; mount.firingStateTimer = .09; mount.firingCycleId = 17; }
    if (scenario === 27) { mount.firingState = 'CHARGING'; mount.firingStateTimer = .05; spec.autoCharge = true; }
    if (scenario === 28) { mount.firingState = 'CHARGEDOWN'; mount.firingStateTimer = .04; mount.firingCycleId = 17; }
    if (scenario === 29) mount.ammo = .5;
    if (scenario === 30) { mount.reloadDelayRemaining = .3; }
    if (scenario === 31) { spec.beamSourceChargeupTime = .17; spec.beamSourceChargedownTime = 0; spec.beamFireOnlyOnFullCharge = false; }
    const control = new ShipWeaponControlSystem(random); control.weapons.push(mount);
    const methods = control as unknown as SourceMethods;
    const initialize = new Float64Array(62);
    initialize.set(mountWords(mount)); initialize.set([spec.burstSize ?? 1, Number(spec.interruptibleBurst), Number(spec.autoCharge),
      spec.fluxPerShot, spec.fluxPerSecond ?? 0, spec.beamSourceChargeupTime ?? 0, spec.beamSourceChargedownTime ?? 0,
      spec.beamDuration ?? .001, Number(spec.beamFireOnlyOnFullCharge), Number(spec.beamVisualMode === 'SUSTAINED'),
      spec.maxSpread ?? 0, spec.spreadPerShot ?? 0, Number(offsets), spec.fireRecoilSpeed ?? 0, Number(spec.isPointDefense), Number(rocket), Number(rocket)], 36);
    initialize[60] = flux.softFlux; initialize[61] = flux.hardFlux;
    const initPointer = wasm.test_input(initialize.length);
    new Float64Array(wasm.memory.buffer, initPointer, initialize.length).set(initialize); wasm.test_initialize();
    for (let step = 0; step < 50; step++) {
      const dt = step % 8 === 0 ? .31 : step % 5 === 0 ? 0 : .06;
      const trigger = step % 12 < 8 && !(scenario >= 25 && step === 0);
      const requested = trigger && step % 13 !== 9, can = step % 17 !== 11;
      const allowed = step % 19 !== 15, suspended = step % 16 === 12, recheck = scenario % 2 === 1;
      // Pre-fire clocks are covered by P1f; this fixture isolates their resulting
      // lifecycle amount. It does not refresh cooldown or ammo between commits.
      mount.lifecycleDt = dt; mount.triggerHeld = trigger;
      const input = new Float64Array([Number(requested), Number(trigger), 0, Number(allowed), Number(suspended), Number(recheck), dt,
        Number(can), Number(owner.fireControlMode === 'AI')]);
      const inputPointer = wasm.test_input(input.length);
      new Float64Array(wasm.memory.buffer, inputPointer, input.length).set(input);
      const actualPtr = wasm.test_commit(); const actual = Array.from(new Float64Array(wasm.memory.buffer, actualPtr, wasm.test_output_words()));
      const expected: number[][] = []; let started = false, budgetRejected = false;
      const oldVelocity = owner.vel.clone();
      const onProjectile = (p: Projectile) => {
        const angle = p.facingRad!; const recoil = spec.fireRecoilSpeed ?? 0;
        expected.push([0, p.id, 1, mount.firingCycleId, p.pos.x, p.pos.y, p.vel.x, p.vel.y, angle,
          p.barrelOffset?.x ?? 0, p.barrelOffset?.y ?? 0, p.baseDamage!, p.sourceDamageMultiplier!, p.damage, p.empDamage!, p.totalRange, 0,
          Number(p.targetShipId ?? 0), Number(p.targetProjectileId ?? 0), p.armedWhileFizzling === undefined ? -1 : Number(p.armedWhileFizzling),
          p.maxFlightTime ?? 0, p.vel.x - Math.cos(angle) * (rocket ? 67 : combatProjectileSpeed(owner, spec)),
          p.vel.y - Math.sin(angle) * (rocket ? 67 : combatProjectileSpeed(owner, spec)), -Math.cos(angle) * recoil, -Math.sin(angle) * recoil]);
      };
      const onBeam = (b: Beam) => {
        const active = b.barrelOffset !== undefined;
        const kind = active ? 1 : mount.firingState === 'CHARGING' && Math.abs(b.duration - (spec.beamSourceChargeupTime ?? 0)) < 1e-12 ? 2 : 3;
        expected.push([kind, b.id, 1, b.firingCycleId!, b.startPos.x, b.startPos.y, 0, 0,
          active ? NaN : mount.currentAngleRad, b.barrelOffset?.x ?? 0, b.barrelOffset?.y ?? 0,
          b.baseDamagePerSec!, 1.07 * 1.21 * 1.09, b.damagePerSec, b.empPerSec!, combatWeaponRange(owner, spec), b.duration,
          0, 0, -1, 0, owner.vel.x, owner.vel.y, 0, 0]);
      };
      const originalAllowed = system.canFireWeapon; system.canFireWeapon = () => allowed;
      try {
        let admitted = requested;
        if (admitted && recheck && !methods.programFluxBudget(owner, mount, dt)) { admitted = false; budgetRejected = true; }
        if (can && admitted) started = methods.requestWeaponFire(mount, owner, onProjectile, onBeam);
        if (!(suspended && can && allowed)) methods.advanceWeaponLifecycle(dt, mount, owner, can && allowed, onProjectile, onBeam);
      } finally { system.canFireWeapon = originalAllowed; }
      const label = `scenario ${scenario} step ${step}`;
      mountWords(mount).forEach((v, i) => compare(actual[i], v, `${label} mount ${i}`, i === 15));
      const witness = random.checkpointWitness(); const metadata = [flux.softFlux, flux.hardFlux, owner.vel.x, owner.vel.y,
        ...witness, Number(started), Number(budgetRejected), expected.length];
      metadata.forEach((v, i) => compare(actual[36 + i], v, `${label} meta ${i}`, i === 2 || i === 3));
      expected.forEach((record, i) => record.forEach((v, k) => {
        // Beam spread only controls visual muzzle angle; real ray follows mount.
        if (Number.isNaN(v)) return;
        compare(actual[46 + i * 25 + k], v, `${label} emission ${i}/${k}`, [4, 5, 6, 7, 8, 21, 22, 23, 24].includes(k));
      }));
      if (!expected.length) { compare(owner.vel.x, oldVelocity.x, label + ' silent vx', true); compare(owner.vel.y, oldVelocity.y, label + ' silent vy', true); }
      starts += Number(started); rejected += Number(budgetRejected); emissions += expected.length;
    }
  }
  return { passed: true, scenarios: 32, steps: 1600, strictFields: strict, geometryFields: geometry,
    maxGeometryDifference: maxDifference, geometryLog, realEmissions: emissions, startedCycles: starts,
    orderedFluxRejections: rejected, fullBattleReady: false, scope: 'actual-source-fire-cycle-and-emitter-module' };
}
