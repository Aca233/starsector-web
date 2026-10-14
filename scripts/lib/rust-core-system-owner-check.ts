// Joint oracle: the real shared Wasm owns system/world/fire state. Reference
// actors execute actual Ship, weapon, system and installed hullmod methods.
import '../../src/engine/simulation/CombatEngine';
import { Ship, type ShipStepState } from '../../src/engine/simulation/Ship';
import { ShipSystem } from '../../src/engine/simulation/ShipSystem';
import { SimulationRandom } from '../../src/engine/simulation/SimulationRandom';
import { Vector2 } from '../../src/engine/math/Vector2';
import { RustCombatCore, RustCoreCommandError } from '../../src/engine/runtime/rust/RustCombatCore';
import { RustFiringState, RustHullSize, RustLifecycleFlag, RustUpkeepControl, type RustBodyHandle,
  type RustCommand, type RustCoreSnapshot, type RustFireSpec, type RustSystemWorldConfig } from '../../src/engine/runtime/rust/RustCoreProtocol';
import { contentRegistry } from '../../src/engine/content/ContentRegistry';
import { hyperionYamatoProjectile } from '../../src/engine/content/HyperionPack';
import { HYPERION_HULLMODS } from '../../src/engine/content/HyperionIds';
import { hyperionRepairStatus } from '../../src/engine/content/HyperionHullMods';
import { ROCINANTE_MODS, ROCINANTE_HULL_ID } from '../../src/engine/content/RocinanteIds';
import { ROCINANTE_WEAPONS } from '../../src/engine/content/RocinanteArmory';
import { isRocinanteCompensating } from '../../src/engine/content/RocinanteHullMods';
import { ZHEFENG_MODS } from '../../src/engine/content/ZhefengIds';
import { ARK_HULLMODS, ADUN_ARK_ID } from '../../src/engine/content/AdunArkIds';
import { GLORIANA_BUILTINS, glorianaBulkheadStatus } from '../../src/engine/content/GlorianaBuiltins';
import { GLORIANA_HULLMODS } from '../../src/engine/content/GlorianaHullMods';
import { installedHullMods, hullModRangeBaseFlat, hullModRangePercent, hullModRangeFlat,
  hullModRangeMultiplier, hullModRangeThresholdStats, fighterWeaponRangeFlat } from '../../src/engine/extensions/HullMods';
import { combatProjectileSpeed } from '../../src/engine/simulation/WeaponRange';
import { WeaponSimulationSystem } from '../../src/engine/simulation/systems/WeaponSimulationSystem';
import type { WeaponSimContext } from '../../src/engine/simulation/systems/weapon/WeaponSimContext';
import type { Projectile, Beam, WeaponSpec, WeaponMount } from '../../src/engine/simulation/Weapon';
import type { ShipSpec, WeaponMountSlotConfig } from '../../src/engine/content/ShipSpec';
import type { SystemModifiers, SystemWorld } from '../../src/engine/extensions/ship-systems/Types';
import type { FireControlWorld } from '../../src/engine/ai/AutofireController';
import type { StageView } from '../../src/engine/ai/batch/StageBridge';
import type { WeaponControlStep, WeaponFirePlan } from '../../src/engine/simulation/systems/ShipWeaponControlSystem';
import { InFlightFireBudget } from '../../src/engine/ai/InFlightFireBudget';
import { fireStage } from './rust-core-fire-query-oracle';

const kindNames = ['NONE', 'ECLIPSE', 'EDICT', 'YAMATO', 'JUMP', 'ARK_FORGE', 'ARK_BARRIER', 'ARK_REPAIR', 'ROC_ATTITUDE', 'ROC_FIRE', 'ZHEFENG'] as const;
const systemIds = ['NONE', 'WEB_ZHUYUAN_ECLIPSE_PROTOCOL', 'WEB_GLORIANA_BROADSIDE_EDICT', 'WEB_SC2_HYPERION_YAMATO', 'WEB_SC2_HYPERION_JUMP',
  'WEB_ADUN_ARK_FORGE', 'WEB_ADUN_ARK_BARRIER', 'WEB_ADUN_ARK_REPAIR', 'WEB_ROCINANTE_ATTITUDE', 'WEB_ROCINANTE_FIRE_CONTROL', 'WEB_ZHEFENG_COMMUTATOR'];
const states = ['IDLE', 'IN', 'ACTIVE', 'OUT', 'COOLDOWN'];
const scalars: (keyof SystemModifiers)[] = ['disableWeapons', 'disableDefense', 'disableMotion', 'disableVenting', 'disableSystems', 'collisionDisabled',
  'visualAlphaMultiplier', 'sightRadiusFlat', 'sightRadiusPercent', 'shieldDamageMultiplier', 'shieldUpkeepMultiplier', 'hullDamageMultiplier',
  'armorDamageMultiplier', 'empDamageMultiplier', 'repairTimeMultiplier', 'timeMultiplier', 'beamDamageMultiplier', 'recoilMultiplier', 'fighterDamageMultiplier',
  'hardFluxPerSecond', 'softFluxPerSecond', 'speedFlat', 'speedPercent', 'accelerationFlat', 'decelerationFlat', 'dissipationMultiplier',
  'zeroFluxBoostSuppressed', 'accelerationPercent', 'decelerationPercent', 'turnRateFlat', 'turnRatePercent', 'turnAccelerationFlat', 'turnAccelerationPercent'];
const weaponKeys = ['damageMultiplier', 'rateOfFireMultiplier', 'fluxCostMultiplier', 'rangePercent', 'projectileSpeedPercent', 'ammoRegenMultiplier'] as const;
interface PrivateSystem { pendingActivationFlux: number; pendingActivationEvents: number; pendingActiveEvents: number;
  chargeRegenTimer: number; stageTimer: number; outEntryEffectLevel: number }
interface FireMethods {
  requestWeaponFire(m: WeaponMount, s: Ship, p: (p: Projectile) => void, b: (b: Beam) => void): boolean;
  advanceWeaponLifecycle(dt: number, m: WeaponMount, s: Ship, can: boolean, p: (p: Projectile) => void, b: (b: Beam) => void): void;
  programFluxBudget(s: Ship, m: WeaponMount, dt: number): boolean;
  planNumericFire(s: WeaponControlStep, w: FireControlWorld, v: StageView): WeaponFirePlan;
}
interface FixtureShip { hull: string; systems?: number[]; weapons?: WeaponSpec[]; roles?: WeaponMountSlotConfig['controlRole'][];
  railguns?: boolean[];
  mods?: string[]; builtins?: string[]; hp?: number; position?: [number, number]; parent?: number; slot?: string; carrier?: number;
  traits?: number; side?: -1 | 0 | 1; shield?: ShipSpec['shieldType']; query?: boolean; team?: number; }
const bounds: [number, number][] = [[-35, -35], [35, -35], [35, 35], [-35, 35]];
function insist(value: unknown, label: string): asserts value { if (!value) throw Error(label); }
function salt(value: string) { let h = 2166136261; for (const c of value) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
function words(system: ShipSystem) {
  const p = system as unknown as PrivateSystem;
  return [states.indexOf(system.state), system.effectLevel, +system.isActive, +system.isCoolingDown, system.activeTimer, system.cooldownTimer,
    system.charges, system.activationSerial, p.pendingActivationFlux, p.pendingActivationEvents, p.pendingActiveEvents,
    p.chargeRegenTimer, p.stageTimer, p.outEntryEffectLevel, +system.disabled];
}
function modifierWords(value: Readonly<SystemModifiers>) {
  const values = scalars.map(key => value[key] as number | undefined);
  for (const type of ['BALLISTIC', 'ENERGY', 'MISSILE'] as const) for (const key of weaponKeys) values.push(value.weapons?.[type]?.[key]);
  return { mask: values.reduce((mask, v, i) => mask + (v === undefined ? 0 : 2 ** i), 0), values: values.map(v => v ?? 0) };
}
function gun(id: string, changes: Partial<WeaponSpec> = {}): WeaponSpec {
  return { id, nameKey: id, weaponType: 'ENERGY', mountSize: 'SMALL', isBeam: false, refireDelay: .32, chargeTime: 0,
    burstSize: 1, burstDelay: .04, interruptibleBurst: false, fluxPerShot: 17, fluxPerSecond: 0, maxAmmo: 200, ammoRegenPerSec: 0,
    minSpread: 0, maxSpread: 0, spreadPerShot: 0, spreadDecay: 5, type: 'ENERGY', turnRateDegPerSec: 120,
    damagePerShot: 70, damagePerSecond: 0, empPerShot: 3, projSpeed: 600, range: 500, projRadius: 1,
    color: [255, 100, 50], ordnancePointCost: 2, ...changes } as WeaponSpec;
}
function fireSpec(ship: Ship, mount: WeaponMount): RustFireSpec {
  const w = mount.spec, range = hullModRangeThresholdStats(ship.spec);
  return { burstSize: w.burstSize, interruptible: w.interruptibleBurst, autoCharge: w.autoCharge,
    fluxPerShot: w.fluxPerShot, fluxPerSecond: w.fluxPerSecond, beamChargeup: w.beamSourceChargeupTime, beamChargedown: w.beamSourceChargedownTime,
    beamDuration: w.beamDuration, beamFireOnlyFull: w.beamFireOnlyOnFullCharge, sustained: w.beamVisualMode !== 'BURST',
    maxSpread: w.maxSpread, spreadPerShot: w.spreadPerShot, relativePos: [mount.relativePos.x, mount.relativePos.y],
    damagePerShot: w.damagePerShot, damagePerSecond: w.damagePerSecond, empPerShot: w.empPerShot, empPerSecond: w.empPerSecond,
    recoilSpeed: w.fireRecoilSpeed, pointDefense: w.isPointDefense,
    range: w.range, speed: w.projSpeed,
    rangeInputs: { base: w.range + hullModRangeBaseFlat(ship.spec, w), percent: hullModRangePercent(ship.spec, w),
      multiplier: hullModRangeMultiplier(ship.spec, w), flat: hullModRangeFlat(ship.spec, w), threshold: range.rangeThreshold,
      pastMultiplier: range.rangePastThresholdMultiplier, shipMultiplier: ship.spec.weaponRangeMult ?? 1,
      authoredRange: w.range, authoredSpeed: w.projSpeed, speedBonus: w.projectileSpeedBonusPercent,
      carrierFlat: ship.sourceCarrier ? fighterWeaponRangeFlat(ship.sourceCarrier.spec, w) : 0 },
    delivery: { spawnType: w.spawnType ?? 'ORDINARY', damageType: w.type, weaponType: w.weaponType,
      length: w.projLength, fadeTime: w.fadeTime, radius: w.projRadius, armingTime: w.armingTime, angularVelocity: w.angularVelocityRad,
      beamSpeed: w.beamSpeed } };
}

export async function checkRustCore(wasm: BufferSource) {
  let strictFields = 0, geometryFields = 0, maxGeometryDifference = 0, steps = 0, scenarios = 0, sourceShips = 0, spawns = 0, rollbackChecks = 0;
  const geometryLog: { label: string; actual: number; expected: number; difference: number }[] = [];
  const coverage = { eclipse: 0, simultaneous: 0, zhefeng: 0, rocRole: 0, yamato: 0, ark: 0, edict: 0, bulkheads: 0, repair: 0, recoil: 0,
    repairShortCompletedCycle: 0, repairMaterialExhausted: 0, repairCeilingReached: 0, arkBoundaryCraftUntouched: 0 };
  function compare(a: number, b: number, label: string, geometric = false) {
    if (!geometric) { strictFields++; if (!Object.is(a, b)) throw Error(`${label}: Rust ${a} differs from actual TS ${b}`); return; }
    geometryFields++; if (Object.is(a, b)) return;
    const difference = Math.abs(a - b), limit = Math.max(1e-9, 32 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b)));
    insist(Number.isFinite(a) && Number.isFinite(b) && difference <= limit, `${label}: Rust geometry ${a} differs from actual TS ${b}`);
    maxGeometryDifference = Math.max(maxGeometryDifference, difference); geometryLog.push({ label, actual: a, expected: b, difference });
  }
  if (!contentRegistry.getWeapon(hyperionYamatoProjectile.id)) contentRegistry.registerWeapon(hyperionYamatoProjectile, false);
  async function fixture(name: string, configs: FixtureShip[]) {
    scenarios++;
    const seed = 7181 + scenarios, core = await RustCombatCore.create(wasm, seed), random = new SimulationRandom(seed),
      visual = new SimulationRandom((seed ^ 0x9e3779b9) >>> 0), simulation = new WeaponSimulationSystem();
    const ships: Ship[] = [], handles: RustBodyHandle[] = [], serials = new Map<number, number>(), sourceSpeeds = new Map<number, number>(); let serial = 0, tick = 0;
    for (let index = 0; index < configs.length; index++) {
      const c = configs[index], id = index + 1;
      const hullSize = c.hull === 'web_sc2_hyperion' || c.hull === ADUN_ARK_ID || c.hull.startsWith('web_gloriana') ? 'CAPITAL_SHIP'
        : c.hull === 'web_zhefeng' ? 'DESTROYER' : 'FRIGATE';
      const installedWeapons = (c.weapons ?? []).map((w, i) => ({ ...w, id: `${w.id}-joint-${scenarios}-${index}-${i}` }));
      installedWeapons.forEach(w => contentRegistry.registerWeapon(w, false));
      const position = new Vector2(...(c.position ?? [index * 120, 0] as [number, number]));
      const slots: WeaponMountSlotConfig[] = installedWeapons.map((w, i) => ({ slotId: String(i + 1), mountType: 'TURRET',
        slotSize: w.mountSize, x: 0, y: 0, baseAngleDeg: 0, arcDeg: 360, defaultWeaponId: w.id, builtIn: !!c.roles?.[i], controlRole: c.roles?.[i] }));
      const spec: ShipSpec = { id: c.hull, sourceHullId: c.hull, isModuleHull: c.parent !== undefined,
        nameKey: c.hull, descKey: c.hull, designationKey: c.hull, spriteUrl: '', spriteWidth: 70, spriteHeight: 70, pivotX: 35, pivotY: 35,
        collisionRadius: 50, mass: 100, hullSize, maxSpeed: 0, acceleration: 0, deceleration: 0, maxTurnRateDeg: 0,
        turnAccelerationDeg: 0, hitpoints: 1000, armorRating: 27, armorCols: 9, armorRows: 7, maxFlux: 10000,
        fluxDissipation: c.hull === 'web_zhefeng' ? 50 : 0,
        peakCRSec: 0, shieldType: c.shield ?? 'NONE', shieldArcDeg: 360, shieldRadius: 1000, shieldEfficiency: 1, shieldUpkeep: 0,
        systemType: systemIds[c.systems?.[0] ?? 0], systemTypes: (c.systems ?? [0]).map(k => systemIds[k]), defenseSystemType: 'NONE',
        weaponSlots: slots, engineSlots: [], hullMods: c.mods ?? [], builtInHullMods: c.builtins ?? [], bounds,
        systemWeaponSlots: c.systems?.includes(3) ? [{ slotId: 'SYS_YAMATO', x: 369, y: 0, arcDeg: 0, baseAngleDeg: 0, mountType: 'HIDDEN', slotSize: 'LARGE' }] : [] };
      const ship = new Ship(String(id), spec, true, position, 0, random, visual, c.carrier === undefined ? undefined : ships[c.carrier]);
      // The fixture uses an authored short burst to exercise the real registered
      // railgun-only recoil hook without replacing the shared weapon catalogue.
      ship.weapons.forEach((m, i) => { if (c.railguns?.[i]) { m.spec = { ...m.spec, id: ROCINANTE_WEAPONS.railgun }; slots[i].defaultWeaponId = m.spec.id; } });
      sourceShips++; ship.hullHp = c.hp ?? ship.maxHullHp; ship.teamId = c.team ?? 0; ship.aimTargetWorld.set(position.x + 100000, position.y);
      ship.fireControlMode = c.query ? 'AI' : 'MANUAL'; ship.visibilityMask = 3;
      if (c.parent !== undefined) {
        ship.parentShip = ships[c.parent]; ship.moduleMount = { slotId: c.slot!, x: position.x - ship.parentShip.pos.x,
          y: position.y - ship.parentShip.pos.y, angleDeg: 0, spec }; ship.parentShip.childModules.push(ship);
      }
      ships.push(ship);
      const motion = new Float64Array(22); motion[0] = position.x; motion[1] = position.y; motion[18] = 1;
      core.apply([{ kind: 'spawn', id, motion }]); const handle = core.snapshot().bodies[index].handle; handles.push(handle);
      const a = ship.armor;
      const install: RustCommand[] = [
        { kind: 'initialize-ship', id, handle, config: { maxFlux: ship.flux.maxFlux, baseDissipation: ship.flux.baseDissipation, hullSize: RustHullSize[hullSize] } },
        { kind: 'initialize-shield', id, handle, config: { type: ship.shield.type, maxArc: ship.shield.maxArcDeg, radius: ship.shield.radius,
          efficiency: ship.shield.efficiency, upkeepRate: ship.shield.upkeepRate } },
        { kind: 'shield-input', id, handle, aimX: ship.aimTargetWorld.x, aimY: ship.aimTargetWorld.y },
        { kind: 'initialize-armor', id, handle, config: { cols: a.cols, rows: a.rows, cellWidth: a.cellWidth, cellHeight: a.cellHeight,
          armorRating: a.maxArmorRating, minX: a.minX, minY: a.minY, maxHull: ship.maxHullHp, hullHp: ship.hullHp,
          effectiveMultiplier: a.effectiveArmorMultiplier, dynamicMultiplier: 1, maxReduction: a.maxDamageReduction, minResidualMultiplier: a.minArmorFractionMultiplier } },
        { kind: 'initialize-combat', id, handle, geometry: { team: ship.teamId, hullSize, radius: spec.collisionRadius, bounds, player: true } },
        { kind: 'combat-attributes', id, handle, attributes: { ai: c.query ?? false } },
      ];
      ship.allSystems.forEach((s, i) => {
        const specId = id * 100 + i + 1;
        let flags = +s.available | (s.definition.toggle ? RustLifecycleFlag.Toggle : 0)
          | (s.definition.charges !== undefined && s.definition.usesChargesForActivation !== false ? RustLifecycleFlag.UsesCharges : 0)
          | (s.generatesHardFlux ? RustLifecycleFlag.HardFlux : 0);
        const controls = s.definition.controls;
        if (controls?.cancelOnBrake) flags |= RustLifecycleFlag.CancelOnBrake;
        if (controls?.cancelOnRetreat) flags |= RustLifecycleFlag.CancelOnRetreat;
        if (controls?.cancelOnFlameout) flags |= RustLifecycleFlag.CancelOnFlameout;
        install.push({ kind: 'define-lifecycle', id: specId, spec: { chargeUp: s.chargeUpDuration, active: s.activeDuration,
          chargeDown: s.chargeDownDuration, cooldown: s.maxCooldown, maxCharges: s.maxCharges, initialCharges: s.charges,
          chargeRegen: s.chargeRegenRate, fluxCostPerUse: s.fluxCostPerUse, flags } },
        { kind: 'install-system', id, handle, systemId: i + 1, specId, defense: s === ship.defenseSystem });
        const policy = (controls?.blockShields ? RustUpkeepControl.BlockShields : 0) | (controls?.blockFluxDissipation ? RustUpkeepControl.BlockDissipation : 0)
          | (controls?.lockTurning ? RustUpkeepControl.LockTurning : 0) | (controls?.blockVenting ? RustUpkeepControl.BlockVenting : 0)
          | (controls?.releaseOnOut ? RustUpkeepControl.ReleaseOnOut : 0) | (controls?.blockWeapons ? RustUpkeepControl.BlockWeapons : 0)
          | (controls?.forceAutofire ? RustUpkeepControl.ForceAutofire : 0);
        install.push({ kind: 'system-upkeep', id, handle, systemId: i + 1, policy: { gate: 14, controls: policy } });
      });
      ship.weapons.forEach((m, i) => install.push({ kind: 'install-weapon-health', id, handle, config: { componentId: i + 1,
        size: m.spec.mountSize, mount: m.mountType, x: m.relativePos.x, y: m.relativePos.y, healthMultiplier: ship.weaponHealthMultiplier } }));
      install.push({ kind: 'initialize-weapons', id, handle, facing: 0, manual: !c.query,
        mounts: ship.weapons.map((m, i) => ({ componentId: i + 1, type: m.spec.weaponType, beam: m.spec.isBeam, burstBeam: m.spec.beamVisualMode === 'BURST',
          refireDelay: m.spec.refireDelay, chargeTime: m.spec.chargeTime, burstDelay: m.spec.burstDelay, beamBurstDelay: m.spec.beamBurstDelay, maxAmmo: m.spec.maxAmmo,
          ammoRegen: m.spec.ammoRegenPerSec, minSpread: m.spec.minSpread, spreadDecay: m.spec.spreadDecay })),
        groups: ship.weaponGroups.map(g => ({ index: g.index, mode: g.mode, autofire: g.isAutofire,
          members: g.weaponSlotIds.map(slot => ship.weapons.findIndex(m => m.slotId === slot) + 1).filter(id => id > 0) })) },
      { kind: 'initialize-fire', id, handle, mounts: ship.weapons.map(m => fireSpec(ship, m)) },
      { kind: 'initialize-engines', id, handle, hullSize, radius: spec.collisionRadius, slots: [] },
      { kind: 'engine-motion-stats', id, handle, stats: { accelerationBase: 0, accelerationPercent: 0, accelerationMultiplier: 1,
        decelerationBase: 0, decelerationPercent: 0, decelerationMultiplier: 1, speedBase: 0, speedPercent: 0, speedMultiplier: 1,
        turnAccelerationBaseDeg: 0, turnAccelerationPercent: 0, turnAccelerationMultiplier: 1, turnRateBaseDeg: 0, turnRatePercent: 0,
        turnRateMultiplier: 1, terrainMultiplier: 1, readinessMultiplier: 1, specAcceleration: 0, specTurnAccelerationDeg: 0,
        zeroFluxSpeedBonus: 50, zeroFluxTurnMultiplier: 1.25 } },
      { kind: 'initialize-readiness', id, handle, config: { cr: .7, peakRemaining: 0, peakCRSeconds: 0, crLossPerSecond: 0 } });
      try { core.apply(install); } catch (error) { throw Error(`${name} install ${id}: ${String(error)}\n${JSON.stringify(install)}`); }
    }
    const worldInstall: RustCommand[] = [];
    ships.forEach((s, i) => {
      const c = configs[i], config: RustSystemWorldConfig = { traits: c.traits ?? 0, parent: c.parent === undefined ? undefined : handles[c.parent],
        carrierRoot: c.carrier === undefined ? undefined : handles[ships.indexOf(s.sourceCarrier!.assemblyRoot)],
        children: s.childModules.map(child => handles[ships.indexOf(child)]), side: c.side ?? 0, rangeMultiplier: s.hullStats.systemRangeMultiplier,
        yamatoMuzzle: c.systems?.includes(3) ? [369, 0] : undefined,
        systems: s.allSystems.map((sys, j) => ({ systemId: j + 1, kind: kindNames[systemIds.indexOf(sys.type)] })),
        bulkheads: [...(c.mods ?? []), ...(c.builtins ?? [])].includes(GLORIANA_BUILTINS.bulkheads),
        fieldRepair: c.mods?.includes(HYPERION_HULLMODS.repair), compensation: c.mods?.includes(ROCINANTE_MODS.compensator),
        yamato: c.systems?.includes(3) ? { damage: hyperionYamatoProjectile.damagePerShot, emp: hyperionYamatoProjectile.empPerShot ?? 0,
          range: hyperionYamatoProjectile.range, speed: hyperionYamatoProjectile.projSpeed, launchSpeed: hyperionYamatoProjectile.launchSpeed,
          speedBonus: hyperionYamatoProjectile.projectileSpeedBonusPercent, weaponType: hyperionYamatoProjectile.weaponType,
          delivery: { spawnType: hyperionYamatoProjectile.spawnType ?? 'ORDINARY', damageType: hyperionYamatoProjectile.type,
            weaponType: hyperionYamatoProjectile.weaponType, radius: hyperionYamatoProjectile.projRadius,
            length: hyperionYamatoProjectile.projLength, fadeTime: hyperionYamatoProjectile.fadeTime } } : undefined };
      worldInstall.push({ kind: 'initialize-system-world', id: i + 1, handle: handles[i], config });
      s.weapons.forEach((m, j) => worldInstall.push({ kind: 'recoil-source', id: i + 1, handle: handles[i], index: j,
        railgun: m.spec.id === ROCINANTE_WEAPONS.railgun, pointDefenseRole: s.spec.weaponSlots[j].controlRole === 'POINT_DEFENSE' }));
    });
    if (configs.some(c => c.query)) ships.forEach((s, i) => worldInstall.push({ kind: 'initialize-fire-query', id: i + 1, handle: handles[i],
      ship: { visibility: [{ team: 0, visible: true }], scope: handles.map((handle, j) => ({ id: j + 1, handle })), player: s.isPlayer,
        finish: 1, pressure: 1, tieRank: i, adaptiveBudget: true },
      mounts: s.weapons.map(m => ({ flags: (m.spec.isPointDefense ? 2 : 0), hints: 0, baseAngleDeg: 0, arcDeg: 360,
        turnRateDeg: m.spec.turnRateDegPerSec ?? 30, sizeScale: .25, schedulingSalt: salt(s.id + '/' + m.slotId) })) }));
    core.apply(worldInstall);
    if (configs.some(c => c.query)) core.apply(ships.map((s, i) => ({ kind: 'fire-controls', id: i + 1, handle: handles[i],
      aim: [s.aimTargetWorld.x, s.aimTargetWorld.y], trigger: false, selectedGroup: s.weaponControl.selectedGroupIndex, ai: configs[i].query ?? false } as RustCommand)));
    const fx = new Proxy({ explosions: [] }, { get: (target, key) => key === 'explosions' ? target.explosions : () => {} }) as unknown as WeaponSimContext['fx'];
    const ctx = { playerShip: ships[0], enemyShip: ships[ships.length - 1], fighters: [], ships, hulkFragments: [], fx, random, visualRandom: visual,
      addRadioMessage: () => {}, addCameraShake: () => {}, handleShipDestruction: () => { throw Error(name + ': fixture destruction'); } } satisfies WeaponSimContext;
    const world: SystemWorld = { ships, projectiles: simulation.projectiles, asteroids: [], combatRandom: random, deployMine: () => {} };
    function remember() { for (const p of simulation.projectiles) if (!serials.has(p.id)) {
      serials.set(p.id, ++serial); const source = ships.find(s => s.id === p.sourceShipId)!;
      sourceSpeeds.set(p.id, combatProjectileSpeed(source, hyperionYamatoProjectile)); spawns++;
    } }
    const onProjectile = (p: Projectile) => { simulation.projectiles.push(p); serials.set(p.id, ++serial);
      const source = ships.find(s => s.id === p.sourceShipId)!;
      sourceSpeeds.set(p.id, combatProjectileSpeed(source, source.weapons.find(m => m.slotId === p.slotId)!.spec)); spawns++;
    };
    const onBeam = (b: Beam) => { simulation.beams.push(b); serials.set(b.id, ++serial); spawns++; };
    function aim(index: number, x: number, y: number) {
      ships[index].aimTargetWorld.set(x, y); core.apply([{ kind: 'shield-input', id: index + 1, handle: handles[index], aimX: x, aimY: y }]);
    }
    function activate(index: number, sys = 0) {
      const ship = ships[index], s = ship.allSystems[sys], reason = s.activationFailureReason;
      insist(s.activate(), `${name} activate ${s.type}: ${reason}`);
      core.apply([{ kind: 'accepted-system', id: index + 1, handle: handles[index], systemId: sys + 1, point: [ship.aimTargetWorld.x, ship.aimTargetWorld.y] }]);
    }
    function interrupt(index: number, sys = 0) {
      ships[index].allSystems[sys].deactivate(); core.apply([{ kind: 'system', id: index + 1, handle: handles[index], systemId: sys + 1, operation: 'interrupt' }]);
    }
    function flux(index: number, amount: number, hard = false) {
      ships[index].flux.increaseFlux(amount, hard); core.apply([{ kind: 'flux', id: index + 1, handle: handles[index], operation: 'increase', amount, hard }]);
    }
    function damage(index: number, amount: number) {
      ships[index].applyHullDamage(amount); core.apply([{ kind: 'hull-damage', id: index + 1, handle: handles[index], damage: amount }]);
    }
    function armorDamage(index: number, amount: number) {
      ships[index].armor.takeDamage(new Vector2(), amount, 'ENERGY', amount, false);
      core.apply([{ kind: 'armor-impact', id: index + 1, handle: handles[index], x: 0, y: 0, damage: amount,
        damageType: 'ENERGY', hitStrength: amount, applyHull: false }]);
    }
    function pilot(index: number, trigger: boolean, ai: boolean) {
      const ship = ships[index]; ship.isFiringMain = trigger; ship.fireControlMode = ai ? 'AI' : 'MANUAL';
      core.apply([{ kind: 'fire-controls', id: index + 1, handle: handles[index], aim: [ship.aimTargetWorld.x, ship.aimTargetWorld.y], trigger,
        selectedGroup: ship.weaponControl.selectedGroupIndex, ai }]);
    }
    function shield(index: number, active: boolean) {
      ships[index].shield.setActive(active); core.apply([{ kind: 'shield', id: index + 1, handle: handles[index], operation: active ? 'raise-raw' : 'lower-raw' }]);
    }
    function verify(snap: RustCoreSnapshot) {
      const label = `${name} tick ${tick}`;
      random.checkpointWitness().forEach((v, i) => compare(snap.random[i], v, label + ' RNG ' + i));
      visual.checkpointWitness().forEach((v, i) => compare(snap.visualRandom[i], v, label + ' visual RNG ' + i));
      compare(snap.lastOrdnanceSerial, serial, label + ' ordnance serial'); compare(snap.projectiles.length, simulation.projectiles.length, label + ' projectiles');
      compare(snap.beams.length, simulation.beams.length, label + ' beams');
      ships.forEach((ship, i) => {
        const a = snap.bodies[i].ship!, w = a.systemWorld!; insist(w, label + ' missing owned world');
        compare(a.flux[8], ship.flux.softFlux, label + ` ship ${i} soft`); compare(a.flux[9], ship.flux.hardFlux, label + ` ship ${i} hard`);
        compare(a.armor!.values[14], ship.hullHp, label + ` ship ${i} hp`); compare(a.armor!.values[12], ship.armor.dirtyVersion, label + ` ship ${i} armor version`);
        ship.armor.copyCells().forEach((v, j) => compare(a.armor!.cells[j], v, label + ` ship ${i} armor ${j}`));
        [ship.pos.x, ship.pos.y, ship.vel.x, ship.vel.y, ship.facingRad, ship.angularVelRad].forEach((v, j) => compare(snap.bodies[i].motion[j], v, label + ` ship ${i} pose ${j}`, true));
        compare(a.shield![6], +ship.shield.isActive, label + ` ship ${i} shield active`); compare(a.shield![11], +ship.shield.isRaiseRequested && !ship.shield.isActive ? 1 : 0, label + ` ship ${i} pending raise`);
        compare(a.shield![28], ship.shield.sinceLastDamageTaken, label + ` ship ${i} shield damage age`);
        const m = modifierWords(ship.system.readModifierTable()!); compare(w[46], m.mask, label + ` ship ${i} modifier mask`);
        m.values.forEach((v, j) => compare(w[47 + j], v, label + ` ship ${i} modifier ${j}`));
        ship.allSystems.forEach((s, j) => {
          // Lifecycle record starts with its identity/spec, then the actual state.
          words(s).forEach((v, k) => compare(a.systems[j].values[k + 2], v, label + ` ship ${i} ${s.type} lifecycle ${k}`));
          const metaOffset = 98 + w[20] * 2 + j * 28;
          compare(w[metaOffset + 2], s.chargeRegenRate, label + ` ship ${i} ${s.type} dynamic regen`);
          compare(w[metaOffset + 3], +!!s.activationInput, label + ` ship ${i} ${s.type} accepted input`);
          if (s.activationInput) {
            const input = s.activationInput;
            [input.point.x, input.point.y, input.origin.x, input.origin.y, input.velocity.x, input.velocity.y, input.facing]
              .forEach((v, k) => compare(w[metaOffset + 4 + k], v, label + ` ship ${i} ${s.type} captured ${k}`, true));
          }
        });
        ship.weapons.forEach((mount, j) => {
          const values = a.weapons!.mounts[j];
          [mount.cooldownTimer, mount.ammo, mount.ammoRechargeProgress, mount.lifecycleDt ?? 0, mount.burstRemaining, mount.burstTimer, +!!mount.burstFluxReserved,
            RustFiringState[mount.firingState], mount.firingStateTimer, +mount.triggerHeld, mount.firingCycleId, mount.reloadDelayRemaining ?? 0,
            mount.recoil, mount.glowAlpha, mount.barrelIndex, mount.currentSpreadDeg].forEach((v, k) => compare(values[16 + k], v, label + ` ship ${i} weapon ${j} tracker ${k}`));
          // ABI12 publishes the immutable range inputs. Actual dynamic results
          // are checked on each emitted projectile below.
          const ranges = a.weaponRanges?.[j], input = fireSpec(ship, mount).rangeInputs!; if (ranges) {
            [j, input.base, input.percent, input.multiplier, input.flat, +!!(input.threshold !== undefined), input.threshold ?? 0,
              input.pastMultiplier, input.shipMultiplier, input.authoredRange, input.authoredSpeed, input.speedBonus ?? 0, input.carrierFlat ?? 0]
              .forEach((v, k) => compare(ranges[k], v, label + ` ship ${i} weapon ${j} installed range ${k}`));
          }
          if (configs[i].query) {
            // ABI policy fields describe an explicitly installed override;
            // effective owner policy is consumed locally by Rust fire_query.
            // Compare its observable source decision at the real plan boundary.
            const memory = a.fireMemories[j], reasons = ['FIRE', 'NO_TARGET', 'ALIGNING', 'FRIENDLY_BLOCKED', 'OBSTACLE_BLOCKED',
              'CONSERVING_AMMO', 'FLUX_BUDGET', 'UNAVAILABLE', 'DEFENSIVE_HOLD', 'REASSIGNING'];
            compare(memory[13], reasons.indexOf(mount.fireControl?.reason ?? 'NO_TARGET'), label + ` ship ${i} weapon ${j} actual role fire decision`);
          }
        });
        if (configs[i].mods?.includes(ROCINANTE_MODS.compensator)) compare(w[34], +isRocinanteCompensating(ship), label + ' actual recoil callback');
        if (configs[i].mods?.includes(HYPERION_HULLMODS.repair)) {
          const reasons = ['脱战等待', '材料耗尽', '已达80%上限', '储备不足', '修复中'];
          const wait = w[31] === 0 ? ` ${Math.max(0, 6 - Math.min(w[27], ship.shield.sinceLastDamageTaken)).toFixed(1)}s` : '';
          const expectedStatus = `抢修${reasons[w[31]]}${wait} · 材料余${Math.max(0, 100 * (.2 - w[28] / ship.maxHullHp)).toFixed(1)}%船体`;
          insist(hyperionRepairStatus(ship) === expectedStatus, label + ': actual field repair status differs: ' + hyperionRepairStatus(ship) + ' / ' + expectedStatus);
        }
      });
      simulation.projectiles.forEach((p, i) => {
        const a = snap.projectiles[i];
        [[0, serials.get(p.id)!], [1, p.id], [19, p.damage], [20, p.empDamage ?? 0], [21, p.baseDamage!], [22, p.rangeRemaining], [23, p.totalRange],
          [24, p.elapsedTime], [25, p.sourceMoveSpeed ?? sourceSpeeds.get(p.id)!], [34, p.fadeProgress ?? 0], [35, p.prevFadeProgress ?? 0], [39, +!!p.softFlux]]
          .forEach(([k, v]) => compare(a[k], v, label + ` projectile ${i} field ${k}`));
        [p.pos.x, p.pos.y, p.prevPos.x, p.prevPos.y, p.vel.x, p.vel.y, p.facingRad ?? 0]
          .forEach((v, k) => compare(a[12 + k], v, label + ` projectile ${i} geometry ${k}`, true));
      });
      simulation.beams.forEach((b, i) => {
        const a = snap.beams[i]; compare(a[0], serials.get(b.id)!, label + ` beam ${i} serial`); compare(a[1], b.id, label + ` beam ${i} RNG id`);
        [b.elapsedTime, b.duration, b.damagePerSec, b.empPerSec ?? 0, b.brightness ?? 0, +!!(b.damageActive !== false), +!!b.isHitting,
          +!!(b.elapsedSinceDamage !== undefined), b.elapsedSinceDamage ?? 0, b.accumulatedBrightness ?? 0, b.dpsDuration ?? 0, b.damageMultiplier ?? 0]
          .forEach((v, k) => compare(a[16 + k], v, label + ` beam ${i} clock ${k}`));
        [b.startPos.x, b.startPos.y, b.endPos.x, b.endPos.y, b.rayEndPrevFrame!.x, b.rayEndPrevFrame!.y]
          .forEach((v, k) => compare(a[8 + k], v, label + ` beam ${i} geometry ${k}`, true));
      });
    }
    async function step(dt: number, requests: boolean[][] = []) {
      const stages = new Map<Ship, ShipStepState>(), controls = new Map<Ship, WeaponControlStep>();
      const fireWorld: FireControlWorld = { ships, projectiles: simulation.projectiles, missiles: [], asteroids: [],
        fireBudget: new InFlightFireBudget(ships, simulation.projectiles) };
      for (const ship of ships) { const stage = ship.prepareStep(dt, null, fireWorld); if (stage) stages.set(ship, stage); }
      for (const [ship, stage] of stages) ship.integrateStep(stage);
      for (const [ship, stage] of stages) controls.set(ship, ship.weaponControl.advanceState(stage.effectiveDt, ship));
      for (const [ship, state] of controls) {
        const index = ships.indexOf(ship), methods = ship.weaponControl as unknown as FireMethods;
        if (configs[index].query) {
          const view = fireStage(ships, simulation.projectiles, handles, serials), plan = methods.planNumericFire(state, fireWorld, view);
          view.close(); ship.weaponControl.commitFire(plan, onProjectile, onBeam);
        } else {
          const intents: RustCommand[] = [];
          ship.weapons.forEach((mount, j) => {
            const requested = requests[index]?.[j] ?? false, allowed = ship.system.canFireWeapon(mount);
            intents.push({ kind: 'fire-intent', id: index + 1, handle: handles[index], index: j, requested, triggerHeld: requested, angle: mount.currentAngleRad });
            mount.triggerHeld = requested;
            // Direct fixture intents represent a manual group, which bypasses
            // autofire policy. Permission still cancels a real forbidden cycle.
            const admitted = requested && allowed && methods.programFluxBudget(ship, mount, dt);
            if (admitted && state.canShipFire) methods.requestWeaponFire(mount, ship, onProjectile, onBeam);
            methods.advanceWeaponLifecycle(mount.lifecycleDt ?? dt, mount, ship, state.canShipFire && allowed, onProjectile, onBeam);
          }); core.apply(intents);
        }
      }
      for (const [ship, stage] of stages) ship.finishStep(stage);
      for (const ship of ships) if (!ship.isDead && !ship.isRetreated && !ship.isDocked) {
        for (const sys of ship.allSystems) sys.dispatchEvents(ship, world, dt * ship.subjectiveTimeMultiplier);
        for (const mod of installedHullMods(ship.spec)) mod.advanceCombat?.(ship, dt, world);
      }
      remember(); simulation.updateProjectiles(dt, ctx); simulation.updateBeams(dt, ctx); core.step(dt); tick++; steps++;
      try { verify(core.snapshot()); } catch (error) {
        throw Error(String(error) + '\nSource fire ' + JSON.stringify(ships.map(s => s.weapons.map(m => ({ ammo: m.ammo, cycle: m.firingCycleId, decision: m.fireControl?.reason }))))
          + '\nRust fire ' + JSON.stringify(core.snapshot().bodies.map(b => b.ship!.weapons!.mounts.map(m => ({ ammo: m[17], cycle: m[26] })) )));
      }
      core.acknowledgeEvents(core.snapshot().lastEventSequence);
    }
    async function guards() {
      const before = JSON.stringify(core.snapshot()), old = handles[0];
      for (const h of [{ slot: old.slot, generation: old.generation + 1 }, { slot: 999999, generation: 1 }]) {
        try { core.apply([{ kind: 'flux', id: 1, handle: old, operation: 'increase', amount: 1 },
          { kind: 'accepted-system', id: 1, handle: h, systemId: 1, point: [800, 0] }]); throw Error(name + ': stale owner accepted'); }
        catch (e) { insist(e instanceof RustCoreCommandError && e.code === 4, name + ': wrong stale owner rejection'); }
        insist(JSON.stringify(core.snapshot()) === before, name + ': stale owner batch partially committed'); rollbackChecks++;
      }
      if (ships.length > 1) {
        try { core.apply([{ kind: 'flux', id: 1, handle: old, operation: 'increase', amount: 1 },
          { kind: 'accepted-system', id: 1, handle: old, systemId: 1, point: [800, 0], target: { id: 2,
            handle: { slot: handles[1].slot, generation: handles[1].generation + 1 } } }]); throw Error(name + ': stale target accepted'); }
        catch (e) { insist(e instanceof RustCoreCommandError && e.code === 4, name + ': wrong stale target rejection'); }
        insist(JSON.stringify(core.snapshot()) === before, name + ': stale target batch partially committed'); rollbackChecks++;
      }
      const projection = core.snapshot(); projection.bodies[0].ship!.systemWorld!.fill(999);
      insist(JSON.stringify(core.snapshot()) === before, name + ': projection mutated owner authority'); rollbackChecks++;
    }
    return { core, ships, handles, simulation, activate, interrupt, flux, damage, armorDamage, pilot, shield, aim, step, guards, verify };
  }

  // Live resource changes from each preceding emission must be visible to the
  // next same-tick source damage read. The railgun callback is a real hullmod.
  for (const recoil of [false, true]) {
    const f = await fixture(recoil ? 'eclipse railgun same burst' : 'eclipse simultaneous burst', [{ hull: recoil ? ROCINANTE_HULL_ID : 'web_zhuyuan', systems: [1],
      mods: recoil ? [ROCINANTE_MODS.compensator] : [], railguns: [recoil], weapons: [gun(recoil ? 'joint-recoil-railgun' : 'joint-eclipse-1',
        { burstSize: 3, burstDelay: 0, fireRecoilSpeed: recoil ? 7 : 0 }), gun('joint-eclipse-2', { burstSize: 2, burstDelay: .04 })] }]);
    try {
      f.flux(0, 1300); f.activate(0); await f.step(.2, [[true, true]]);
      const first = f.simulation.projectiles.slice(0, 2); insist(first.length === 2 && first[1].damage > first[0].damage,
        'actual simultaneous emissions did not reread preceding live flux');
      await f.step(.21, [[false, false]]);
      insist(f.simulation.projectiles.some(p => p.damage > first[0].damage), 'actual later burst did not see full Eclipse strength');
      for (let i = 0; i < 15; i++) await f.step([.017, .055, .24][i % 3], [[i % 2 === 0, i % 3 === 0]]);
      await f.step(3.7); await f.step(.8); await f.guards(); coverage.eclipse++; coverage.simultaneous++; if (recoil) coverage.recoil++;
    } finally { f.core.dispose(); }
  }
  const z = await fixture('zhefeng shield cycle OUT', [{ hull: 'web_zhefeng', systems: [10], builtins: [ZHEFENG_MODS.capacitor], shield: 'FRONT',
    weapons: [gun('joint-zhefeng-main', { weaponType: 'BALLISTIC', chargeTime: .4 }), gun('joint-zhefeng-pd', { weaponType: 'BALLISTIC', isPointDefense: true })] }]);
  try {
    z.shield(0, true); await z.step(.1, [[true, true]]); insist(z.ships[0].weapons[0].firingState === 'CHARGING', 'actual Zhefeng main cycle not started');
    z.activate(0); await z.step(.2, [[true, true]]);
    insist(z.ships[0].weapons[0].firingState === 'IDLE' && z.ships[0].weapons[0].ammo === 200 && z.ships[0].weapons[1].ammo < 200,
      'actual Zhefeng IN did not cancel main cycle while allowing PD');
    await z.step(1.31, [[true, true]]); insist(z.ships[0].system.state === 'ACTIVE' && !z.ships[0].shield.isActive && !z.ships[0].shield.isRaiseRequested,
      'actual Zhefeng ACTIVE did not lower shield and clear pending raise');
    await z.step(.2, [[true, true]]); await z.step(2.81, [[false, false]]);
    insist(z.ships[0].system.state === 'OUT', 'actual Zhefeng OUT not reached');
    z.shield(0, true); await z.step(.1, [[true, true]]); insist(z.ships[0].shield.isActive, 'actual Zhefeng OUT shield permission not restored');
    await z.step(1.1); await z.guards(); coverage.zhefeng++;
  } finally { z.core.dispose(); }

  const r = await fixture('rocinante slot role policy', [{ hull: ROCINANTE_HULL_ID, systems: [9], query: true, weapons: [
    gun('joint-roc-role', { weaponType: 'BALLISTIC', spawnType: 'BALLISTIC', isPointDefense: true, aiHints: ['PD'], refireDelay: .067 }),
    gun('joint-roc-ordinary-pd', { weaponType: 'BALLISTIC', spawnType: 'BALLISTIC', isPointDefense: true, aiHints: ['PD'], refireDelay: .1 })], roles: ['POINT_DEFENSE', undefined] }]);
  try {
    r.activate(0); await r.step(.15, [[true, true]]);
    insist(r.ships[0].weapons[0].fireControl?.reason === 'REASSIGNING' && r.ships[0].weapons[1].fireControl?.reason === 'NO_TARGET',
      'actual RocFire slot role did not distinguish reassigned built-in PDC');
    await r.step(.16, [[true, true]]);
    r.pilot(0, true, false);
    for (let i = 0; i < 8; i++) await r.step(.067, [[true, true]]);
    r.interrupt(0); await r.step(.1, [[true, true]]); await r.step(.21, [[true, true]]); await r.guards(); coverage.rocRole++;
  } finally { r.core.dispose(); }

  for (const focus of [false, true]) {
    const y = await fixture('yamato real system-only ' + focus, [{ hull: 'web_sc2_hyperion', systems: [3], traits: 2 | 4 | (focus ? 8 : 0),
      builtins: [HYPERION_HULLMODS.reactor], mods: focus ? [HYPERION_HULLMODS.focus] : [], weapons: [gun('joint-yamato-normal')] }]);
    try {
      y.aim(0, 900, 0); y.activate(0); await y.step(.8); await y.step(1.21); await y.step(.2); await y.step(.5); await y.step(1);
      insist(y.simulation.projectiles.length > 0, 'actual Yamato did not produce a projectile'); await y.guards(); coverage.yamato++;
    } finally { y.core.dispose(); }
  }

  const ark = await fixture('ark engineering shared ordered healing', [
    { hull: ADUN_ARK_ID, systems: [5, 6, 7], mods: [ARK_HULLMODS.coupler], traits: 16, hp: 500, shield: 'FRONT', weapons: [gun('joint-ark-core')] },
    { hull: 'web_ark_aft', parent: 0, slot: 'AFT', position: [-120, 0], traits: 32, hp: 350 },
    { hull: 'web_ark_fore', parent: 0, slot: 'FORE', position: [120, 0], hp: 300, weapons: [gun('joint-ark-fore')] },
    { hull: 'joint-ark-craft-1', carrier: 0, position: [998, 0], hp: 200 },
    { hull: 'joint-ark-craft-boundary', carrier: 0, position: [1000, 0], hp: 200 }]);
  try {
    const healingBefore = ark.ships.map(s => s.hullHp);
    ark.shield(0, true); ark.activate(0, 2); await ark.step(.71); await ark.step(.3); await ark.step(.2);
    insist(ark.ships.slice(0, 4).every((s, i) => s.hullHp > healingBefore[i]) && ark.ships[4].hullHp === healingBefore[4],
      'actual Ark ordered repair did not heal assembly/inside craft while excluding boundary craft'); coverage.arkBoundaryCraftUntouched++;
    await ark.step(6.5); await ark.step(1);
    ark.activate(0); await ark.step(.81, [[true], [], [true]]); ark.interrupt(0); await ark.step(.7);
    ark.damage(1, 350); await ark.step(.8); await ark.step(.4); await ark.step(60);
    ark.activate(0, 1); await ark.step(.26); await ark.step(.4); ark.interrupt(0, 1); await ark.step(.6); await ark.guards(); coverage.ark++;
  } finally { ark.core.dispose(); }

  const g = await fixture('gloriana live seal parent edict', [
    { hull: 'web_gloriana', systems: [2], traits: 1, weapons: [], hp: 800 },
    { hull: 'web_gloriana_p1', parent: 0, slot: 'P1', side: -1, position: [0, -120], traits: 64,
      mods: [GLORIANA_HULLMODS.loader], builtins: [GLORIANA_BUILTINS.bulkheads, GLORIANA_BUILTINS.ordnance],
      weapons: [gun('joint-gloriana-p', { weaponType: 'BALLISTIC', mountSize: 'EXTRA_LARGE' })] },
    { hull: 'web_gloriana_s1', parent: 0, slot: 'S1', side: 1, position: [0, 120], builtins: [GLORIANA_BUILTINS.bulkheads],
      weapons: [gun('joint-gloriana-s', { weaponType: 'BALLISTIC' })] }]);
  try {
    g.aim(0, 0, -800); g.activate(0); await g.step(.41, [[], [true], [true]]); await g.step(.4, [[], [true], [true]]);
    g.damage(1, 650); await g.step(.1, [[], [true], [true]]);
    insist(glorianaBulkheadStatus(g.ships[0])?.startsWith('封舱 P1 '), 'actual bulkhead source did not trigger');
    for (let i = 0; i < 7; i++) await g.step(.8, [[], [true], [true]]); await g.step(.6); await g.step(.5); await g.guards(); coverage.edict++; coverage.bulkheads++;
  } finally { g.core.dispose(); }

  const h = await fixture('hyperion repair short cycle damage budget', [{ hull: 'web_sc2_hyperion', systems: [3], traits: 2 | 4,
    builtins: [HYPERION_HULLMODS.reactor], mods: [HYPERION_HULLMODS.repair], hp: 300,
    weapons: [gun('joint-repair-short', { isBeam: true, beamVisualMode: 'BURST', refireDelay: .05, beamBurstDelay: .05,
      beamDuration: .01, beamSourceChargeupTime: 0, beamSourceChargedownTime: 0, fluxPerShot: 0, fluxPerSecond: 17,
      damagePerSecond: 70, empPerSecond: 3, beamSpeed: 1400 })] }]);
  try {
    await h.step(5.9); await h.step(.1, [[true]]);
    insist(h.ships[0].weapons[0].firingCycleId === 1 && h.ships[0].weapons[0].firingState === 'IDLE'
      && h.ships[0].hullHp === 300 && hyperionRepairStatus(h.ships[0])?.startsWith('抢修脱战等待 6.0s'),
      'actual completed short beam cycle did not interrupt quiet repair'); coverage.repairShortCompletedCycle++;
    await h.step(.1); await h.step(5.8); await h.step(.3); await h.step(.2);
    h.damage(0, 1); await h.step(6); await h.step(.3);
    h.armorDamage(0, 1); await h.step(.1); await h.step(6);
    // Long quiet run reaches the actual source budget. Reactor regeneration and
    // repair spend occur at their real pre/post stage, without external refill.
    for (let i = 0; i < 50; i++) await h.step(2);
    insist(hyperionRepairStatus(h.ships[0])?.startsWith('抢修材料耗尽'), 'actual Hyperion material budget not exhausted'); coverage.repairMaterialExhausted++;
    await h.guards(); coverage.repair++;
  } finally { h.core.dispose(); }

  const ceiling = await fixture('hyperion repair actual ceiling', [{ hull: 'web_sc2_hyperion', systems: [3], traits: 2 | 4,
    builtins: [HYPERION_HULLMODS.reactor], mods: [HYPERION_HULLMODS.repair], hp: 795 }]);
  try {
    await ceiling.step(6); await ceiling.step(2);
    insist(ceiling.ships[0].hullHp === ceiling.ships[0].maxHullHp * .8
      && hyperionRepairStatus(ceiling.ships[0])?.startsWith('抢修已达80%上限'), 'actual Hyperion repair ceiling not reached');
    const charges = ceiling.ships[0].allSystems[0].charges;
    await ceiling.step(.1); insist(ceiling.ships[0].allSystems[0].charges >= charges, 'actual ceiling consumed reactor reserve');
    await ceiling.guards(); coverage.repairCeilingReached++;
  } finally { ceiling.core.dispose(); }

  return { passed: true, scenarios, steps, sourceShips, spawns, strictFields, geometryFields, maxGeometryDifference, geometryLog, rollbackChecks, coverage,
    actualShipConstructor: true, actualShipPrepareIntegrateFinish: true, actualSourceSystemsAndHullMods: true, actualOrderedFire: true,
    productionIntegrated: false, fullBattleReady: false,
    scope: 'shared-resident-system-owner-real-ship-fire-dynamic-hullmod-joint-oracle',
    limitations: ['Direct mount intent scenes execute actual request/advance lifecycle methods; they do not prove full autonomous target acquisition.',
      'Dynamic WeakMap internals are checked through actual resource/HP/modifier results and source status, without exposing production state.',
      'No original live UI, networking recovery, or full seven-pack playable battle is claimed by this domain check.'] };
}
