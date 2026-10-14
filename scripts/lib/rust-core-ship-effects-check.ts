import { Ship } from '../../src/engine/simulation/Ship';
import { ShipSystem } from '../../src/engine/simulation/ShipSystem';
import { shipSystemDefinitions } from '../../src/engine/extensions/ship-systems/Registry';
import { burnDrive } from '../../src/engine/extensions/ship-systems/BurnDrive';
import { ammoFeed } from '../../src/engine/extensions/ship-systems/AmmoFeed';
import { highEnergyFocus } from '../../src/engine/extensions/ship-systems/HighEnergyFocus';
import { maneuveringJets } from '../../src/engine/extensions/ship-systems/ManeuveringJets';
import { fortressShield } from '../../src/engine/extensions/ship-systems/FortressShield';
import { plasmaJets } from '../../src/engine/extensions/ship-systems/PlasmaJets';
import { RuntimeCombatModifiers } from '../../src/engine/extensions/RuntimeCombatModifiers';
import { FluxTracker } from '../../src/engine/simulation/FluxTracker';
import { Vector2 } from '../../src/engine/math/Vector2';
import * as Bulkheads from '../../src/engine/content/GlorianaBuiltins';
import * as Hyperion from '../../src/engine/content/HyperionHullMods';
import * as Rocinante from '../../src/engine/content/RocinanteHullMods';
import { hyperionAmbushRemaining } from '../../src/engine/extensions/ship-systems/HyperionSystems';
import { broadsideAt } from '../../src/engine/extensions/ship-systems/GlorianaEdictState';
import type { WeaponMount } from '../../src/engine/simulation/Weapon';
import type { ShipSystemDefinition, SystemModifiers } from '../../src/engine/extensions/ship-systems/Types';
interface Exports extends WebAssembly.Exports {
  memory: WebAssembly.Memory; test_input(n: number): number; test_reset(): number;
  test_modifiers(): number; test_compose(): number; test_dynamic(): number; test_helpers(): number; test_broadside(): number;
  test_jump_initialize(): number; test_jump(): number; test_output_words(): number;
}
const keys = ['disableWeapons', 'disableDefense', 'disableMotion', 'disableVenting', 'disableSystems', 'collisionDisabled', 'visualAlphaMultiplier',
  'sightRadiusFlat', 'sightRadiusPercent', 'shieldDamageMultiplier', 'shieldUpkeepMultiplier', 'hullDamageMultiplier', 'armorDamageMultiplier',
  'empDamageMultiplier', 'repairTimeMultiplier', 'timeMultiplier', 'beamDamageMultiplier', 'recoilMultiplier', 'fighterDamageMultiplier',
  'hardFluxPerSecond', 'softFluxPerSecond', 'speedFlat', 'speedPercent', 'accelerationFlat', 'decelerationFlat', 'dissipationMultiplier',
  'zeroFluxBoostSuppressed', 'accelerationPercent', 'decelerationPercent', 'turnRateFlat', 'turnRatePercent', 'turnAccelerationFlat', 'turnAccelerationPercent'] as const;
const weaponKeys = ['damageMultiplier', 'rateOfFireMultiplier', 'fluxCostMultiplier', 'rangePercent', 'projectileSpeedPercent', 'ammoRegenMultiplier'] as const;
const states = ['IDLE', 'IN', 'ACTIVE', 'OUT', 'COOLDOWN'] as const;
const ids = ['NONE', 'WEB_ZHUYUAN_ECLIPSE_PROTOCOL', 'WEB_GLORIANA_BROADSIDE_EDICT', 'WEB_SC2_HYPERION_YAMATO', 'WEB_SC2_HYPERION_JUMP',
  'WEB_ADUN_ARK_FORGE', 'WEB_ADUN_ARK_BARRIER', 'WEB_ADUN_ARK_REPAIR', 'WEB_ROCINANTE_ATTITUDE', 'WEB_ROCINANTE_FIRE_CONTROL',
  'WEB_ZHEFENG_COMMUTATOR', 'WEB_GRAVITY_WELL', 'WEB_GRAVITY_BATTLE_WELL', 'WEB_GRAVITY_REPULSOR',
  'BURN_DRIVE', 'AMMO_FEED', 'HIGH_ENERGY_FOCUS', 'MANEUVERING_JETS', 'FORTRESS_SHIELD', 'PLASMA_JETS'];
const legacy = [burnDrive, ammoFeed, highEnergyFocus, maneuveringJets, fortressShield, plasmaJets];
const words = (m: SystemModifiers) => [...keys.map(k => m[k] ?? NaN), ...(['BALLISTIC', 'ENERGY', 'MISSILE'] as const).flatMap(k => weaponKeys.map(w => m.weapons?.[k]?.[w] ?? NaN))];
interface OwnerView { hp: number; dead: boolean; retreated: boolean; retreating: boolean; docked: boolean; phased: boolean; pressure: number; venting: boolean; overloaded: boolean; disabled: number; engineering: boolean; corona: boolean }
const ownerWords = (o: OwnerView) => [o.hp, +o.dead, +o.retreated, +o.retreating, +o.docked, +o.phased, o.pressure, +o.venting, +o.overloaded, o.disabled, +o.engineering, +o.corona];
function owner(o: OwnerView): Ship {
  const flux = new FluxTracker(1000, 0, 'FRIGATE'); flux.softFlux = o.pressure * 1000; flux.isVenting = o.venting; flux.isOverloaded = o.overloaded;
  const runtimeModifiers = new RuntimeCombatModifiers(); if (o.disabled) runtimeModifiers.set('disabled', { disableSystems: o.disabled });
  const result = { hullHp: o.hp, maxHullHp: 1000, isDead: o.dead, isRetreated: o.retreated, retreating: o.retreating, isDocked: o.docked, isPhased: o.phased,
    flux, runtimeModifiers, spec: { id: 'effects', hullMods: o.corona ? ['web_ark_corona_coupler'] : [], builtInHullMods: [], weaponSlots: [] },
    childModules: o.engineering ? [{ hullHp: 1, isDead: false, isRetreated: false, isDocked: false, moduleMount: { slotId: 'AFT' } }] : [],
    allSystems: [], parentShip: null, shield: { sinceLastDamageTaken: 1000, radius: 1000 }, weapons: [], vel: new Vector2(7, -3),
    engineController: { isFlamedOut: false }, getFlameoutRatio: () => 0, engineStatuses: [], hullDamageInterceptors: new Set(),
    armor: {}, isFiringMain: false, hullStats: {} } as unknown as Ship;
  // Load the actual Ship module first to preserve its authored import-cycle root.
  Object.defineProperty(result, 'nativeConstructor', { value: Ship }); return result;
}
interface SystemInput { kind: number; state: number; level: number; retained: number; active: boolean; available: boolean; disabled: boolean; cooldown: number; maxCooldown: number; origin: boolean; collapse: boolean; side: number }
const systemWords = (s: SystemInput) => [s.kind, s.state, s.level, s.retained, +s.active, +s.available, +s.disabled, s.cooldown, s.maxCooldown, +s.origin, +s.collapse, s.side];
function system(s: SystemInput, ship?: Ship): ShipSystem {
  const definition = s.kind >= 14 ? legacy[s.kind - 14] : shipSystemDefinitions.require(ids[s.kind]);
  const result = Object.create(ShipSystem.prototype) as ShipSystem;
  Object.assign(result, { type: s.kind ? ids[s.kind] : 'NONE', definition: s.available ? definition : { ...definition, unavailable: true }, owner: ship,
    state: states[s.state], effectLevel: s.level, outEntryEffectLevel: s.retained, isActive: s.active, disabled: s.disabled, baseFluxCapacity: 1000,
    cooldownTimer: s.cooldown, maxCooldown: s.maxCooldown, activationInput: s.side ? { point: new Vector2(0, s.side * 100), origin: new Vector2(), facing: 0 } : undefined,
    teleportVisual: s.origin ? { origin: new Vector2() } : undefined, gravityField: s.collapse ? { kind: 'COLLAPSE' } : undefined });
  return result;
}
interface SourceSystem { modifiers(capacity?: number): SystemModifiers }
const own = (s: ShipSystem) => (s as unknown as SourceSystem).modifiers(1000);
const controlFlags = (d: ShipSystemDefinition) => [d.controls?.blockFluxDissipation, d.controls?.blockAcceleration, d.controls?.blockStrafing,
  d.controls?.forceAutofire, d.controls?.blockWeapons, d.controls?.blockShields, d.controls?.lockTurning, d.controls?.forceForward,
  d.controls?.blockVenting, d.controls?.releaseOnOut].reduce<number>((n, v, i) => n | (+!!v << i), 0);
const view = (): OwnerView => ({ hp: 300, dead: false, retreated: false, retreating: false, docked: false, phased: false, pressure: .43, venting: false, overloaded: false, disabled: 0, engineering: true, corona: false });
const baseSystem = (kind: number): SystemInput => ({ kind, state: 2, level: .57, retained: .57, active: true, available: kind !== 0, disabled: false, cooldown: 11, maxCooldown: 14, origin: true, collapse: false, side: -1 });
type BulkheadState = { used: boolean; remaining: number };
type RepairState = { quiet: number; used: number; tick: number; working: boolean; reason: string; cycles: Map<string, number> };
type Compensation = { x: number; y: number; remaining: number };
function observed<T>(module: unknown): WeakMap<Ship, T> { return (module as { rustEffectsVerifyState: WeakMap<Ship, T> }).rustEffectsVerifyState; }

/** Real source callbacks/readers are the oracle. The verification bundler only
 * exposes the three private WeakMaps; it does not replace callback arithmetic. */
export async function checkRustShipEffects(source: BufferSource) {
  const { instance } = await WebAssembly.instantiate(source, {}), e = instance.exports as Exports;
  let strict = 0, geometry = 0, maxDifference = 0, modifiers = 0, compositions = 0, dynamicSteps = 0, helpers = 0, broadsideBoundaries = 0, jumpEvents = 0;
  const geometryLog: { label: string; actual: number; expected: number; difference: number }[] = [];
  function compare(a: number, b: number, label: string, geometric = false) {
    if (!geometric) { strict++; if (!Object.is(a, b)) throw Error(`${label}: ${a} differs from ${b}`); return; }
    geometry++; if (Object.is(a, b)) return; const difference = Math.abs(a - b), limit = Math.max(1e-9, 32 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b)));
    if (!Number.isFinite(a) || !Number.isFinite(b) || difference > limit) throw Error(`${label}: ${a} differs from ${b}`);
    maxDifference = Math.max(maxDifference, difference); geometryLog.push({ label, actual: a, expected: b, difference });
  }
  function run(name: 'test_modifiers' | 'test_compose' | 'test_dynamic' | 'test_helpers' | 'test_broadside' | 'test_jump', input: number[], expected: number[], label: string) {
    const p = e.test_input(input.length); new Float64Array(e.memory.buffer, p, input.length).set(input); const output = e[name]();
    compare(e.test_output_words(), expected.length, label + ' width'); const values = new Float64Array(e.memory.buffer, output, expected.length);
    expected.forEach((v, i) => compare(values[i], v, `${label} ${i}`, name === 'test_dynamic' && [7, 8].includes(i)
      || name === 'test_jump' && [2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 15, 16, 17, 19, 20, 21].includes(i)));
  }
  // Side selection is a real decision: round-off near the dead cone does not
  // receive the geometry exemption used for published velocity coordinates.
  for (const x of [0, 10, 39, 40, 100, 1e6, 1e12, 1e154]) {
    const y = Math.max(8, x / Math.sqrt(24));
    for (let offset = -16; offset <= 16; offset++) {
      const adjusted = y * (1 + offset * Number.EPSILON);
      for (const sign of [-1, 1]) {
        const point = { x, y: adjusted * sign }, result = broadsideAt(point, { x: 0, y: 0 }, 0);
        run('test_broadside', [point.x, point.y, 0, 0, 0], [result === 'P' ? -1 : result === 'S' ? 1 : 0], `broadside boundary ${x}/${offset}/${sign}`); broadsideBoundaries++;
      }
    }
  }
  for (let kind = 0; kind < ids.length; kind++) for (let scenario = 0; scenario < 120; scenario++) {
    const s = baseSystem(kind), o = view(); s.state = scenario % 5; s.active = s.state > 0 && s.state < 4; s.level = (scenario % 13) / 12; s.retained = .83;
    s.retained = s.state === 3 ? s.retained : s.level;
    s.available &&= scenario % 17 !== 0; s.disabled = scenario % 19 === 0; s.cooldown = scenario % 15; s.origin = scenario % 7 !== 0; s.collapse = scenario % 2 === 0;
    o.hp = scenario % 11 === 0 ? 0 : 300; o.dead = scenario % 23 === 0; o.retreated = scenario % 29 === 0; o.retreating = scenario % 31 === 0;
    o.docked = scenario % 37 === 0; o.phased = scenario % 41 === 0; o.venting = scenario % 43 === 0; o.overloaded = scenario % 47 === 0;
    o.disabled = scenario % 53 === 0 ? 1 : 0; o.engineering = scenario % 2 === 0; o.corona = scenario % 3 === 0; o.pressure = (scenario % 10) / 9;
    const ship = scenario % 9 === 0 ? undefined : owner(o), sys = system(s, ship); if (ship) Object.assign(ship, { allSystems: [sys] });
    const d = sys.definition, pd = scenario % 2 === 0, policy = sys.autofirePolicy({} as WeaponMount);
    // Role eligibility is false for an empty mount/slot list in this set.
    let bits = 0; [sys.blocksFluxDissipation, sys.blocksAcceleration, sys.blocksStrafing, sys.forcesAutofire, sys.blocksWeapons, sys.blocksShields,
      sys.locksTurning, sys.forcesForward, sys.blocksVenting].forEach((v, i) => bits |= +v << i);
    const expected = [...words(own(sys)), hyperionAmbushRemaining(sys), bits, +sys.isPhased, +sys.canFireWeapon({ spec: { isPointDefense: pd } } as WeaponMount),
      policy ? +(policy.priority === 'SUPPRESS') : -1, policy ? +policy.suspended : -1];
    run('test_modifiers', [...systemWords(s), ...ownerWords(o), +!!ship, 1000, controlFlags(d), +!!d.phase, +!!d.phase?.vulnerableChargeUp, +!!d.phase?.vulnerableChargeDown, +pd, 0], expected, `modifier ${kind}/${scenario}`); modifiers++;
  }
  for (let scenario = 0; scenario < 250; scenario++) {
    const o = view(), parentView = view(); o.corona = scenario % 2 === 0; const ship = owner(o), parent = owner(parentView);
    const childInputs = [baseSystem(1), baseSystem(9), baseSystem(5)], parentInputs = [baseSystem(2), baseSystem(5)];
    childInputs[1].available = scenario % 19 !== 0;
    parentInputs[0].side = scenario % 3 === 0 ? 0 : scenario % 2 ? 1 : -1; parentInputs[0].disabled = scenario % 11 === 0;
    parentInputs[1].level = scenario / 250; parentInputs[1].active = scenario % 13 !== 0;
    const childSystems = childInputs.map(s => system(s, ship)), parentSystems = parentInputs.map(s => system(s, parent));
    childSystems[0].auxiliary = childSystems[1]; childSystems[1].auxiliary = childSystems[2];
    const runtime: SystemModifiers = { speedPercent: 7, dissipationMultiplier: .73, weapons: { ENERGY: { damageMultiplier: 1.17, fluxCostMultiplier: 1.11 } } };
    ship.runtimeModifiers.set('fixture', runtime); Object.assign(ship, { system: childSystems[0], allSystems: childSystems, parentShip: parent,
      moduleMount: { slotId: scenario % 2 ? 'S2' : 'P1' }, weapons: [{ spec: { weaponType: 'BALLISTIC' }, isDisabled: false, ammo: 3 }] });
    Object.assign(parent, { allSystems: parentSystems, childModules: [ship] });
    if (scenario % 17 === 0) Object.assign(parent, { isDead: true }); parentView.dead = scenario % 17 === 0;
    const loader = scenario % 5 === 0; if (loader) ship.spec.hullMods = ['web_gloriana_edict_loader']; o.corona &&= !loader;
    const side = scenario % 2 ? 1 : -1; const modulePresent = true;
    run('test_compose', [...childInputs.flatMap(systemWords), ...ownerWords(o), ...ownerWords(parentView), ...parentInputs.flatMap(systemWords), 1, 1, side, 1, +loader, +modulePresent, ...words(runtime)], words(own(childSystems[0])), `compose ${scenario}`); compositions++;
  }
  for (let scenario = 0; scenario < 200; scenario++) {
    const o = view(), ship = owner(o), s = baseSystem(9); s.state = scenario % 5; s.active = s.state > 0 && s.state < 4;
    s.disabled = scenario % 17 === 0; s.available = scenario % 23 !== 0; o.engineering = scenario % 2 === 0; o.corona = scenario % 3 === 0;
    o.venting = scenario % 29 === 0; o.overloaded = scenario % 31 === 0; o.dead = scenario % 37 === 0; o.docked = scenario % 41 === 0;
    Object.assign(ship, owner(o));
    const reactor = system(baseSystem(3), ship), active = scenario % 7 === 0;
    reactor.charges = scenario % 100; Object.assign(ship, { spec: { ...ship.spec, id: 'web_sc2_hyperion', hullMods: ['web_sc2_hyperion_reactor'] }, allSystems: [reactor] });
    const resource = system(baseSystem(4), ship); if (active) { reactor.isActive = true; } else { reactor.isActive = false; }
    const cost = 75, shared = Hyperion.hyperionSharedReason(ship, resource, cost), before = reactor.charges, spent = Hyperion.spendHyperionReactor(ship, resource, cost);
    const reason = !shared ? 0 : shared.startsWith('反应堆正供能') ? 3 : shared.startsWith('反应堆不足') ? 4 : 2;
    const forge = system(baseSystem(5), ship); forge.isActive = false; Object.assign(ship, { allSystems: active ? [forge, resource] : [forge], spec: { ...ship.spec, hullMods: o.corona ? ['web_ark_corona_coupler'] : [] } });
    ship.allSystems.forEach(sys => sys.isActive = active); forge.definition.onAdvance!(ship, .17, undefined!, forge);
    const repairSystem = system(baseSystem(7), ship); repairSystem.state = 'ACTIVE'; repairSystem.isActive = true;
    const part = owner(view()); part.hullHp = 901; Object.assign(ship, { assemblyShips: [part] }); repairSystem.definition.onAdvance!(ship, .17, { ships: [] } as never, repairSystem);
    const target = { x: scenario % 2 ? 9 : -100, y: scenario % 3 ? 75 : 0 }, origin = { x: 2, y: 0 }, facing = scenario % 5 * .37;
    const side = broadsideAt(target, origin, facing);
    const policySystem = system(s, ship), pd = scenario % 13 !== 0;
    const mount = { slotId: 'PDC', mountType: 'TURRET', spec: { id: 'pdc', weaponType: 'BALLISTIC', spawnType: 'BALLISTIC', isPointDefense: true } } as WeaponMount;
    ship.spec.weaponSlots = pd ? [{ slotId: 'PDC', controlRole: 'POINT_DEFENSE', builtIn: true, defaultWeaponId: 'pdc' }] as never : [];
    const policy = policySystem.autofirePolicy(mount);
    run('test_helpers', [...ownerWords(o), before, 1, 1, +active, cost, +active, 901, .17, 0, target.x, target.y, origin.x, origin.y, facing,
      ...systemWords(s), +pd], [reason, +spent, reactor.charges, forge.chargeRegenRate, part.hullHp, side === 'P' ? -1 : side === 'S' ? 1 : 0,
      policy ? +(policy.priority === 'SUPPRESS') : -1, policy ? +policy.suspended : -1], `helpers ${scenario}`); helpers++;
  }
  const seal = Bulkheads.glorianaBuiltins.find(m => m.id === Bulkheads.GLORIANA_BUILTINS.bulkheads)!;
  const repair = Hyperion.hyperionHullMods.find(m => m.id === 'web_sc2_hyperion_field_repair')!;
  const compensator = Rocinante.rocinanteHullMods.find(m => m.id === 'web_expanse_rocinante_recoil_compensator')!;
  for (let scene = 0; scene < 12; scene++) {
    const o = view(), ship = owner(o), core = { type: 'WEB_SC2_HYPERION_YAMATO', charges: scene === 4 ? 1000 : scene % 3 === 0 ? 4 : 100, disabled: false,
      isActive: false, reservedFluxCost: 0 } as ShipSystem;
    const mounts = [0, 1].map(i => ({ slotId: 'slot' + i, firingCycleId: 0, firingState: 'IDLE', triggerHeld: false })) as WeaponMount[];
    Object.assign(ship, { spec: { ...ship.spec, hullMods: ['web_sc2_hyperion_reactor', 'web_sc2_hyperion_field_repair'] }, allSystems: [core], weapons: mounts,
      hullHp: scene >= 6 ? 799 : 300, getFlameoutRatio: () => 0 });
    seal.apply!(ship); repair.apply!(ship); const p = e.test_input(2); new Float64Array(e.memory.buffer, p, 2).set([ship.hullHp, core.charges]); e.test_reset();
    for (let step = 0; step < 190; step++) {
      const dt = [0, .016, .05, .17, .61, 1.3, 7.1][(step + scene) % 7]; ship.flux.softFlux = step % 9 === 0 ? 950 : 0; ship.flux.hardFlux = 0;
      ship.flux.isVenting = step > 20 && step % 37 === 0; ship.flux.isOverloaded = step > 20 && step % 41 === 0;
      const damage = step === 80 ? 1 : 0; if (damage) for (const interceptor of ship.hullDamageInterceptors) interceptor(damage);
      mounts[0].firingCycleId += step === 54 ? 1 : 0; mounts[0].triggerHeld = step === 61;
      const since = step === 81 ? 0 : 1000; ship.shield.sinceLastDamageTaken = since; ship.isFiringMain = step === 99;
      const reserved = step === 1 ? 700 : 0; Object.assign(core, { reservedFluxCost: reserved });
      const railgun = step === 4 || step === 5 || step === 101, attitude = step === 5;
      if (attitude) ship.allSystems.push({ type: 'WEB_ROCINANTE_ATTITUDE', isActive: true } as ShipSystem);
      const engineDamaged = step === 102; Object.assign(ship, { engineStatuses: engineDamaged ? [{ isDisabled: true }] : [] });
      const compEligible = !ship.flux.isVenting && !ship.flux.isOverloaded && !engineDamaged;
      const online = !ship.flux.isVenting && !ship.flux.isOverloaded;
      const beforeSeal = observed<BulkheadState>(Bulkheads).get(ship)!.used;
      seal.advance!(ship, dt, undefined!); repair.advanceCombat!(ship, dt, undefined!);
      const beforeComp = Rocinante.isRocinanteCompensating(ship), beforeSoft = ship.flux.softFlux;
      compensator.onWeaponRecoil!(ship, { spec: { id: railgun ? 'web_expanse_rocinante_railgun' : 'other' } } as WeaponMount, -13.7, 4.9);
      const recoil = ship.flux.softFlux !== beforeSoft && !beforeComp;
      compensator.advance!(ship, dt, undefined!);
      if (attitude) ship.allSystems.pop();
      const b = observed<BulkheadState>(Bulkheads).get(ship)!, r = observed<RepairState>(Hyperion).get(ship)!, c = observed<Compensation>(Rocinante).get(ship);
      const expected = [ship.hullHp, core.charges, ship.flux.softFlux, ship.flux.hardFlux, ship.flux.timeSinceFluxIncrease, +(!beforeSeal && b.used), +recoil, ship.vel.x, ship.vel.y,
        +b.used, b.remaining, r.quiet, r.used, r.tick, +r.working, ['脱战等待', '材料耗尽', '已达80%上限', '储备不足', '修复中'].indexOf(r.reason),
        c ? 1 : 0, c?.x ?? 0, c?.y ?? 0, c?.remaining ?? 0, ...words(ship.runtimeModifiers.value)];
      run('test_dynamic', [dt, step % 9 === 0 ? 950 : 0, 0, +ship.flux.isVenting, +ship.flux.isOverloaded, 1, reserved, damage,
        mounts[0].firingCycleId, 1, +mounts[0].triggerHeld, mounts[1].firingCycleId, 1, 0, +online, 1, +ship.isFiringMain, +attitude, since,
        +railgun, +compEligible, +attitude, -13.7, 4.9, +compEligible], expected, `dynamic ${scene}/${step}`); dynamicSteps++;
    }
  }
  for (let scenario = 0; scenario < 70; scenario++) {
    const o = view(), ship = owner(o), input = baseSystem(4), jump = system(input, ship);
    const core = { type: 'WEB_SC2_HYPERION_YAMATO', charges: scenario % 11 === 0 ? 74 : 100, isActive: false, disabled: false } as ShipSystem;
    const point = new Vector2(scenario % 10 === 0 ? 199.999 : scenario % 13 === 0 ? 1800.0000011 : scenario % 17 === 0 ? 200 : 1200, scenario % 3 ? 0 : 170);
    const origin = new Vector2(0, 0), facing = .31, destinationFacing = scenario * .071;
    Object.assign(ship, { id: '1', spec: { ...ship.spec, id: 'web_sc2_hyperion', collisionRadius: 100, hullMods: ['web_sc2_hyperion_reactor'] },
      pos: origin, prevPos: origin.clone(), vel: new Vector2(7, -3), facingRad: facing, prevFacingRad: facing, teleportSequence: 2,
      teleportCameraOffset: new Vector2(11, -7), hullStats: { systemRangeMultiplier: 1 }, allSystems: [core, jump],
      fireControlMode: scenario % 2 === 0 ? 'MANUAL' : 'AI', aimTargetWorld: point });
    jump.activationSerial = 7; jump.activationInput = scenario % 19 === 0 ? undefined : { point, origin: origin.clone(), velocity: ship.vel.clone(), facing: destinationFacing, target: null };
    const obstacle = { id: '2', pos: point.clone(), spec: { collisionRadius: 130, hullSize: scenario % 7 === 0 ? 'FIGHTER' : 'CRUISER' } } as unknown as Ship;
    const world = { ships: [ship, ...(scenario % 4 === 0 ? [obstacle] : [])], asteroids: scenario % 23 === 0 ? undefined : [{ pos: new Vector2(600, 600), radius: 70, hp: 1 }] } as never;
    const p = e.test_input(16); new Float64Array(e.memory.buffer, p, 16).set([0, 0, 0, 0, 7, -3, facing, facing, 2, 11, -7, +!!jump.activationInput, point.x, point.y, destinationFacing, core.charges]); e.test_jump_initialize();
    let interrupted = false;
    Object.defineProperty(jump, 'deactivate', { value: () => { interrupted = true; } });
    const d = jump.definition;
    for (let event = 0; event < 4; event++) {
      const dx = event === 1 ? scenario % 5 === 0 ? 1050 : 25 : 0, dy = event === 1 ? 5 : 0;
      ship.pos.x += dx; ship.pos.y += dy;
      if (event === 1 && scenario % 9 === 0) { obstacle.pos.copy(point); (world as { ships: Ship[] }).ships.push(obstacle); }
      if (event === 1 && scenario % 14 === 0) { ship.flux.isVenting = true; o.venting = true; }
      if (event === 1 && scenario % 16 === 0) jump.activationInput = undefined;
      if (event === 2) { jump.state = 'COOLDOWN'; jump.isActive = false; input.state = 4; input.active = false; jump.cooldownTimer = 8; input.cooldown = 8; }
      const beforeSequence = ship.teleportSequence; interrupted = false;
      if (event === 0) d.onActivate!(ship, world, jump);
      else if (event === 1) d.onActive!(ship, world, jump);
      else if (event === 2) d.onAdvance!(ship, .17, world, jump);
      else d.onReset!(jump, ship);
      const visual = jump.teleportVisual, visualWords = visual ? [1, visual.serial, visual.destination.x, visual.destination.y, visual.destinationFacing, +!!visual.origin,
        visual.origin?.x ?? 0, visual.origin?.y ?? 0, visual.originFacing ?? 0, +!!jump.activationInput, 0, 0] : [0, 0, 0, 0, 0, 0, 0, 0, 0, +!!jump.activationInput, 0, 0];
      const expected = [+(event === 1 ? beforeSequence !== ship.teleportSequence : interrupted), core.charges, ship.pos.x, ship.pos.y, ship.prevPos.x, ship.prevPos.y,
        ship.vel.x, ship.vel.y, ship.facingRad, ship.prevFacingRad, ship.teleportSequence, ship.teleportCameraOffset.x, ship.teleportCameraOffset.y, ...visualWords, +!!jump.activationInput];
      const actualWorld = world as { ships: Ship[]; asteroids?: { pos: Vector2; radius: number; hp?: number }[] }, rocks = actualWorld.asteroids ?? [];
      run('test_jump', [...ownerWords(o), +jump.disabled, 1, 1, +core.isActive, event, 1800, +(ship.fireControlMode === 'MANUAL'), actualWorld.ships.length, rocks.length,
        dx, dy, +(event === 1 && scenario % 16 === 0), +!!actualWorld.asteroids, ...systemWords(input),
        ...actualWorld.ships.flatMap(s => [Number(s.id), s.pos.x, s.pos.y, s.spec.collisionRadius, +(s.spec.hullSize === 'FIGHTER')]),
        ...rocks.flatMap(r => [r.pos.x, r.pos.y, r.radius, +(r.hp !== undefined), r.hp ?? 0])], expected, `jump ${scenario}/${event}`); jumpEvents++;
    }
  }
  return { passed: true, modifiers, compositions, dynamicSteps, helpers, broadsideBoundaries, jumpEvents, strictFields: strict, geometryFields: geometry, maxGeometryDifference: maxDifference, geometryLog,
    actualSourceReaders: true, callbacksUnchanged: true, productionIntegrated: false, fullBattleReady: false };
}
