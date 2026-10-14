/** One-time trusted source compilation. No returned object retains a TS solver. */
import { contentRegistry } from '../../content/ContentRegistry';
import type { ShipSpec } from '../../content/ShipSpec';
import type { WeaponSpec } from '../../simulation/Weapon';
import { Ship, nativeFireControlPrototypes, hasNativeMotionBoundary } from '../../simulation/Ship';
import { SimulationRandom } from '../../simulation/SimulationRandom';
import { Vector2 } from '../../math/Vector2';
import { FighterSystem } from '../../simulation/systems/FighterSystem';
import { EngineController } from '../../simulation/systems/EngineController';
import { immutableCopy } from '../../extensions/Immutable';
import { combatSkillErrors } from '../../extensions/CombatSkills';
import { installedHullMods, hullModLoadoutErrors, hasOnlyNativeRangeModifiers, effectiveHullModWeaponSpec,
  type HullModStats } from '../../extensions/HullMods';
import { shipSystemDefinitions, hasNativeSystemStats } from '../../extensions/ship-systems/Registry';
import { weaponEffects } from '../../extensions/weapon-effects/Registry';
import { nativeMines, nativeMinePayload } from '../../extensions/NativeMines';
import { tacticalSystemIds, defenseSystemId, systemLoadoutErrors } from '../../extensions/ship-systems/Loadout';
import type { ExtensionResources } from '../../extensions/Dependencies';
import { hullModDefinitions } from '../../extensions/HullMods';
import bundledPolicy from '../../ai/learning/combat-policy.json';
import { validateCombatPolicy, emptyCombatPolicy, type CombatPolicy } from '../../ai/learning/CombatPolicy';
import { ROCINANTE_WEAPONS } from '../../content/RocinanteArmory';
import { HYPERION_PROJECTILE_ID } from '../../content/HyperionIds';
import { moduleOffset } from '../../content/ModuleGeometry';
import nativeHullFacts from '../../extensions/native-hull-facts.json';
import type { SystemModifiers } from '../../extensions/ship-systems/Types';
import type { ComponentHealthTracker } from '../../simulation/systems/ComponentHealth';
import { compileRustResidentAI, type RustResidentActorMeta } from './RustAIAdmission';
import { compileRustFlightStatic, compileRustFlightMeta, type RustFlightStaticShip, type RustFlightShipMeta } from './RustContentCompilerFlight';
import { compileRustGeneratedAdmission } from './RustGeneratedAdmission';
import { compileRustVisualStatic } from './RustVisualAdmission';
import { compileRustScenePrelude, type RustScenePreludeAdmission } from './RustScenePreludeProtocol';
import { compileRustSceneSystemMetadata, type RustSceneSystemMeta } from './RustSceneShipCommandProtocol';
import { compileRustDroneAdmission, type RustDroneAdmission } from './RustDroneAdmission';
import { droneVariantSpec } from '../../simulation/systems/DroneSystem';
import type { RustBodyHandle, RustCommand, RustMineSpec, RustAuxShip } from './RustCoreProtocol';
import { RustHullSize, RustLifecycleFlag, RustUpkeepControl, RustShipFlag } from './RustCoreProtocol';
import { rustArmorStats, rustFire, rustGravity, rustMotionStats, rustQueryMount, rustSystemKinds,
  rustMirvChild, rustWeaponEffect, rustWorldSystem, rustDeath } from './RustContentCompilerFields';

export const RUST_CONTENT_COMPILER_VERSION = 1;
export type RustRandomCheckpoint = readonly [seed: number, cursor: number, idCounter: number];
export interface RustCompileShip {
  readonly stableId: string; readonly spec: ShipSpec; readonly team: number; readonly player: boolean;
  readonly position: readonly [number, number]; readonly facing: number; readonly velocity?: readonly [number, number];
  readonly shipName?: string; readonly persistentMemberId?: string; readonly transient?: boolean;
  readonly deployment?: 'deployed' | 'reserve'; readonly fireControlMode?: 'AI' | 'MANUAL';
  /** Absent uses primary hostile root; false preserves lazy/manual owner admission. */
  readonly aiMemory?: boolean; readonly initialTargetId?: string;
}
export interface RustCompileInput {
  readonly ships: readonly RustCompileShip[]; readonly seed: number; readonly visualSeed?: number;
  readonly combatCheckpoint?: RustRandomCheckpoint; readonly visualCheckpoint?: RustRandomCheckpoint;
  readonly contentRevision?: number; readonly initializeWings?: boolean; readonly visibilityTeams?: readonly number[];
  /** Private static compilation namespace for a live native roster extension. */
  readonly staticNamespace?: string; readonly templateSpecBase?: number; readonly staticRootTemplates?: boolean;
}
/** Internal trusted cold graph; never accepted from the worker wire or retained. */
export interface RustColdSource {
  readonly roots: readonly Ship[]; readonly flight: FighterSystem;
  readonly random: SimulationRandom; readonly visual: SimulationRandom;
  readonly active: ReadonlySet<Ship>; readonly aiTargets: ReadonlyMap<Ship, Ship | null>;
}
export interface RustCompiledIdentity {
  readonly id: number; readonly stableId: string; readonly handle: RustBodyHandle; readonly specKey: string;
  readonly parentId?: number; readonly carrierId?: number; readonly persistentMemberId?: string;
  readonly transient: boolean; readonly player: boolean; readonly team: number;
  readonly deployment: 'deployed' | 'reserve';
  readonly role: 'capital' | 'module' | 'fighter' | 'bomber';
  readonly mounts: readonly { readonly componentId: number; readonly sourceSlotId: string; readonly weaponKey: string; readonly mountIndex: number }[];
}
export interface RustConstructorInitial {
  readonly id: number;
  readonly armor: { readonly cells: readonly number[]; readonly dirtyVersion: number };
  readonly runtimeModifiers: readonly { readonly id: string; readonly modifiers: Readonly<SystemModifiers> }[];
  readonly components: readonly { readonly componentId: number; readonly health: number; readonly maxHealth: number;
    readonly disabled: boolean; readonly permanent: boolean; readonly disabledTimer: number; readonly disabledDuration: number;
    readonly tracker?: Readonly<ComponentHealthTracker> }[];
  readonly engines: readonly { readonly index: number; readonly health: number; readonly maxHealth: number; readonly disabled: boolean;
    readonly permanent: boolean; readonly tracker: Readonly<ComponentHealthTracker>; readonly contribution: number;
    readonly driftContribution: number; readonly temporary: boolean; readonly glowDisabled: boolean;
    readonly thrust: number; readonly previousThrust: number; readonly spread: number; readonly previousSpread: number }[];
  readonly engineController: { readonly state: 'READY' | 'FLAMING_OUT' | 'DISABLED'; readonly cooldown: number;
    readonly permanentFraction: number; readonly sinceAcceleration: number; readonly sinceSpread: number;
    readonly forcePending: boolean; readonly suppressMessage: boolean };
  readonly readiness: { readonly cr: number; readonly crAtDeployment: number | null; readonly peakRemaining: number;
    readonly shieldTimer: number; readonly shieldInterval: number; readonly shieldIntervalElapsed: boolean; readonly sinceShieldDamage: number };
}
/** Every record is required even when its collection is empty. The kernel must
 * acknowledge/install all domains before its first complete authoritative step. */
export interface RustMandatoryInstall {
  readonly prelude: RustScenePreludeAdmission;
  readonly read: readonly { readonly id: number; readonly handle: RustBodyHandle; readonly sightFlat: number; readonly sightPercent: number; readonly weaponRepair: number }[];
  readonly drone: RustDroneAdmission;
  readonly systemRead: readonly RustSceneSystemMeta[];
  readonly visual: readonly { readonly id: number; readonly handle: RustBodyHandle; readonly stableId: string; readonly meta: import('./RustVisualAdmission').RustVisualStatic }[];
  readonly phase: { readonly ships: readonly { readonly id: number; readonly handle: RustBodyHandle; readonly anchorCRCost?: number;
    readonly controls: readonly { readonly systemId: number; readonly flags: number; readonly phase: boolean; readonly vulnerableUp: boolean; readonly vulnerableDown: boolean }[] }[] };
  readonly combatPolicy: Readonly<CombatPolicy>;
  readonly constructorInitial: readonly RustConstructorInitial[];
  readonly ai: readonly Readonly<RustResidentActorMeta>[];
  readonly flight: { readonly initializeWings: boolean; readonly wings: readonly { readonly carrierId: number;
    readonly wingId: string; readonly specId: string; readonly role: 'FIGHTER' | 'BOMBER'; readonly count: number;
    readonly name: string; readonly player: boolean; readonly team: number; readonly crr: number;
    readonly rebuildSeconds: number; readonly range?: number; readonly tags?: readonly string[]; readonly craftIds: readonly number[] }[];
    readonly craftModes: readonly { readonly id: number; readonly state: string; readonly timer: number; readonly hasTorpedo?: boolean }[];
    readonly templates: readonly { readonly carrierSpecKey: string; readonly craftSpecKey: string }[];
    readonly ships: readonly RustFlightShipMeta[];
    readonly roots: readonly RustBodyHandle[];
    readonly carrierOrder: readonly RustBodyHandle[];
    readonly formation: { readonly slots: readonly { readonly craft: RustBodyHandle; readonly root: RustBodyHandle; readonly index: number }[];
      readonly footprints: readonly { readonly root: RustBodyHandle; readonly radius: number }[] } };
  readonly aux: { readonly mines: readonly RustMineSpec[]; readonly ships: readonly RustAuxShip[] };
  readonly localHooks: readonly { readonly id: number; readonly hullmodId: string;
    readonly phase: 'prepareStep' | 'combatWorld' | 'weaponRecoil'; readonly sMod: boolean }[];
  readonly slotDictionary: readonly { readonly id: number; readonly slots: readonly { readonly sourceSlotId: string; readonly slotId: number; readonly componentId?: number }[] }[];
  readonly generatedSources: readonly { readonly id: number; readonly sourceSlotId?: string; readonly systemId?: number;
    readonly kind: 'mirv-child' | 'system-resource' | 'mine'; readonly numericSpec?: number; readonly weaponKey: string }[];
  readonly startupRandom: { readonly combat: RustRandomCheckpoint; readonly visual: RustRandomCheckpoint };
}
export interface RustCompiledTemplate {
  readonly samplePlayer?: boolean;
  readonly key: string; readonly sourceSpecId: string; readonly carrierSpecKey?: string; readonly spec: ShipSpec;
  readonly carrierSourceSpecId?: string;
  readonly hullStats: Readonly<HullModStats>; readonly weapons: readonly WeaponSpec[];
  readonly mounts: RustCompiledIdentity['mounts'];
  readonly generatedSources: readonly { readonly sourceSlotId?: string; readonly systemId?: number;
    readonly kind: 'mirv-child' | 'system-resource' | 'mine'; readonly weaponKey: string }[];
  readonly constructorOrder: readonly ('weapons' | 'modules' | 'engines' | 'readiness' | 'hullmodApply')[];
  readonly domains: readonly RustCommand[];
  readonly constructor: RustFlightStaticShip;
  /** Sample-only tracker states are not reused at spawn: native constructor
   * draws fresh trackers from the then-current authoritative RNG. */
  readonly sampleInitial: RustConstructorInitial;
}
export interface RustCompiledContent {
  readonly version: number; readonly contentRevision: number;
  readonly commands: readonly RustCommand[];
  readonly batches: readonly { readonly stage: 'spawn' | 'domains' | 'relations' | 'constructor'; readonly commands: readonly RustCommand[] }[];
  /** Applied only after every mandatory initial-state domain has been installed. */
  readonly finalize: readonly RustCommand[];
  readonly entities: readonly RustCompiledIdentity[];
  readonly reserves: readonly { readonly id: number; readonly handle: RustBodyHandle; readonly stableId: string; readonly specKey: string; readonly team: number; readonly player: boolean;
    readonly persistentMemberId?: string; readonly transient: boolean }[];
  readonly dictionary: { readonly ships: readonly { readonly key: string; readonly spec: ShipSpec; readonly hullStats: Readonly<HullModStats> }[];
    readonly weapons: readonly { readonly key: string; readonly spec: WeaponSpec }[]; readonly templates: readonly RustCompiledTemplate[];
    readonly sources: { readonly ships: readonly ShipSpec[]; readonly weapons: readonly WeaponSpec[] } };
  readonly pending: RustMandatoryInstall;
  readonly startupRNGWitness: { readonly begin: { readonly combat: RustRandomCheckpoint; readonly visual: RustRandomCheckpoint };
    readonly afterRoots: { readonly combat: RustRandomCheckpoint; readonly visual: RustRandomCheckpoint };
    readonly end: { readonly combat: RustRandomCheckpoint; readonly visual: RustRandomCheckpoint };
    readonly roots: readonly { readonly stableId: string; readonly before: RustRandomCheckpoint; readonly after: RustRandomCheckpoint }[] };
  readonly capabilities: readonly string[];
}

const knownEffects = new Map(['com.fs.starfarer.api.impl.combat.TachyonLanceEffect', 'com.fs.starfarer.api.impl.combat.GravitonBeamEffect',
  'com.fs.starfarer.api.impl.combat.SabotOnHitEffect', 'com.fs.starfarer.api.impl.combat.MoteOnHitEffect',
  'web_sc2_hyperion_yamato_impact', 'web_gloriana_siege_impact'].map(id => [id, weaponEffects.get(id)]));
const registryMethods = { shipGet: shipSystemDefinitions.get, hullGet: contentRegistry.getShip,
  weaponGet: contentRegistry.getWeapon, effectGet: weaponEffects.get, hullmodGet: hullModDefinitions.get,
  systemRequire: shipSystemDefinitions.require, systemAll: shipSystemDefinitions.all,
  hullmodRequire: hullModDefinitions.require, hullmodAll: hullModDefinitions.all, effectRequire: weaponEffects.require };
const nativeAdditionalPrototypes = [SimulationRandom, EngineController, FighterSystem].map(type => ({
  prototype: type.prototype, descriptors: Object.getOwnPropertyDescriptors(type.prototype),
}));
function additionalPrototypes(): boolean {
  return nativeAdditionalPrototypes.every(({ prototype, descriptors }) => Object.entries(descriptors).every(([key, old]) => {
    const now = Object.getOwnPropertyDescriptor(prototype, key); return now?.value === old.value && now?.get === old.get && now?.set === old.set;
  }));
}

function plain(value: unknown, path: string, active = new Set<object>()): void {
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') throw Error(path + ': executable/non-data content');
  if (typeof value === 'number' && !Number.isFinite(value)) throw Error(path + ': non-finite content number');
  if (!value || typeof value !== 'object') return;
  if (active.has(value)) throw Error(path + ': cyclic content');
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw Error(path + ': non-plain content');
  active.add(value);
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (!('value' in descriptor)) throw Error(path + '.' + key + ': content accessor');
    plain(descriptor.value, path + '.' + key, active);
  }
  active.delete(value);
}

function admission(spec: ShipSpec, path: string, seen: Set<ShipSpec>, capabilities: Set<string>): void {
  if (seen.has(spec)) return; seen.add(spec); plain(spec, path);
  const copied = immutableCopy(spec), errors = [...combatSkillErrors(spec.captainSkills), ...hullModLoadoutErrors(spec), ...systemLoadoutErrors(spec)];
  if (errors.length) throw Error(path + ': ' + errors.join('; '));
  if (!hasOnlyNativeRangeModifiers(copied)) throw Error(path + ': unknown/replaced hullmod callback identity');
  const resourceSets: ExtensionResources[] = [];
  for (const mod of installedHullMods(copied)) { capabilities.add('hullmod:' + mod.id); if (mod.resources) resourceSets.push(mod.resources); }
  for (const id of [...tacticalSystemIds(spec), defenseSystemId(spec)]) {
    const definition = shipSystemDefinitions.require(id, path);
    if (!hasNativeSystemStats(definition) || !rustSystemKinds[id]) throw Error(path + ': unknown/replaced Rust system identity ' + id);
    capabilities.add('system:' + id);
    if (definition.resources) resourceSets.push(definition.resources);
  }
  for (const slot of [...spec.weaponSlots, ...(spec.systemWeaponSlots ?? [])]) {
    if (!slot.defaultWeaponId) continue;
    const weapon = contentRegistry.getWeapon(slot.defaultWeaponId);
    if (!weapon) throw Error(path + '.' + slot.slotId + ': unknown weapon ' + slot.defaultWeaponId);
    admitWeapon(weapon, path + '.' + slot.slotId, capabilities);
  }
  for (const resources of resourceSets) {
    for (const id of resources.weapons ?? []) { const weapon = contentRegistry.getWeapon(id);
      if (!weapon) throw Error(path + ': missing generated/system weapon ' + id); admitWeapon(weapon, path + '.generated.' + id, capabilities); }
    for (const id of resources.ships ?? []) { const generated = contentRegistry.getShip(id);
      if (!generated) throw Error(path + ': missing generated ship ' + id); admission(generated, path + '.generated.' + id, seen, capabilities); }
  }
  for (const [i, module] of (spec.modules ?? []).entries()) admission(module.spec, path + '.module[' + i + ']', seen, capabilities);
  for (const [i, wing] of (spec.fighterWings ?? []).entries()) {
    const craft = contentRegistry.getShip(wing.specId);
    if (!craft || craft.hullSize !== 'FIGHTER') throw Error(path + '.wing[' + i + ']: missing actual fighter ' + wing.specId);
    admission(craft, path + '.wing[' + i + ']', seen, capabilities);
    capabilities.add('flight:' + wing.role);
  }
  if (spec.modules?.length) capabilities.add('modules');
  if (spec.voidShield) capabilities.add('void-shield');
}
function admitWeapon(spec: WeaponSpec, path: string, capabilities: Set<string>): void {
  plain(spec, path);
  for (const [hook, id] of [['beam', spec.beamEffect], ['hit', spec.onHitEffect], ['advance', spec.everyFrameEffect]] as const) {
    if (!id) continue;
    const original = knownEffects.get(id), current = weaponEffects.get(id);
    if (!original || current !== original || !original[hook] || !rustWeaponEffect(id)) throw Error(path + ': unknown/replaced ' + hook + ' effect identity ' + id);
    capabilities.add('effect:' + id);
  }
  if (spec.mirv?.childProjectile) {
    for (const [hook, id] of [['beam', spec.mirv.childProjectile.beamEffect], ['hit', spec.mirv.childProjectile.onHitEffect], ['advance', spec.mirv.childProjectile.everyFrameEffect]] as const) {
      if (id) { const original = knownEffects.get(id);
        if (!original || weaponEffects.get(id) !== original || !original[hook]) throw Error(path + ': unknown MIRV child effect ' + id);
        capabilities.add('effect:' + id); }
    }
  }
  if (spec.mirv) capabilities.add('missile:mirv');
  if (spec.gravityTractor) capabilities.add('gravity:tractor');
  if (spec.gravityDeflector) capabilities.add('gravity:deflector');
  if (spec.gravityCoupling) capabilities.add('gravity:coupling');
  if (spec.terrainPenetration) capabilities.add('terrain:penetration');
  if (spec.proximityFuse) capabilities.add('projectile:proximity');
}
function randomAt(seed: number, checkpoint?: RustRandomCheckpoint): SimulationRandom {
  const random = new SimulationRandom(seed);
  if (!checkpoint) return random;
  if (checkpoint[0] !== (checkpoint[0] >>> 0) || !Number.isInteger(checkpoint[1]) || !Number.isFinite(checkpoint[1]) || checkpoint[1] < 0
    || !Number.isSafeInteger(checkpoint[2]) || checkpoint[2] < 0) throw Error('Invalid compiler RNG checkpoint');
  const writable = random as unknown as { initialSeed: number; state: number; idCounter: number };
  writable.initialSeed = checkpoint[0]; writable.state = checkpoint[1]; writable.idCounter = checkpoint[2]; return random;
}
function constructorInitial(ship: Ship, id: number): RustConstructorInitial {
  const readiness = ship as unknown as { crShieldMalfunctionTimer: number; crShieldMalfunctionInterval: number; crShieldMalfunctionIntervalElapsed: boolean };
  const engine = ship.engineController as unknown as { sinceAcceleration: number; sinceSpread: number; forcePending: boolean; suppressMessage: boolean };
  const runtime = ship.runtimeModifiers as unknown as { sources: ReadonlyMap<string, SystemModifiers> };
  return { id, armor: { cells: Array.from(ship.armor.copyCells()), dirtyVersion: ship.armor.dirtyVersion }, runtimeModifiers: [...runtime.sources].map(([source, modifiers]) => ({ id: source, modifiers })),
    components: ship.weapons.map((mount, i) => ({ componentId: i + 1, health: mount.health, maxHealth: mount.maxHealth,
    disabled: mount.isDisabled, permanent: !!mount.isPermanentlyDisabled, disabledTimer: mount.disabledTimer,
    disabledDuration: mount.disabledDuration, tracker: mount.healthTracker ? { ...mount.healthTracker } : undefined })),
    engines: ship.engineStatuses.map((status, i) => ({ index: i, health: status.health, maxHealth: status.maxHealth, disabled: status.isDisabled,
      permanent: status.isPermanentlyDisabled, tracker: { ...status.healthTracker }, contribution: status.contribution,
      driftContribution: status.driftContribution, temporary: status.temporaryMalfunction, glowDisabled: status.glowDisabled,
      thrust: status.currentThrust, previousThrust: status.prevThrust, spread: status.spread, previousSpread: status.prevSpread })),
    engineController: { state: ship.engineController.state, cooldown: ship.engineController.cooldown,
      permanentFraction: ship.engineController.permanentlyDisabledFraction, sinceAcceleration: engine.sinceAcceleration,
      sinceSpread: engine.sinceSpread, forcePending: engine.forcePending, suppressMessage: engine.suppressMessage },
    readiness: { cr: ship.currentCR, crAtDeployment: ship.crAtDeployment, peakRemaining: ship.peakPerformanceRemaining,
      shieldTimer: readiness.crShieldMalfunctionTimer, shieldInterval: readiness.crShieldMalfunctionInterval,
      shieldIntervalElapsed: readiness.crShieldMalfunctionIntervalElapsed, sinceShieldDamage: ship.shield.sinceLastDamageTaken } };
}

function shipDomains(ship: Ship, id: number, handle: RustBodyHandle): RustCommand[] {
  const hull = ship.flux.hullSize, h = ship.hullStats, a = ship.armor, shield = ship.shield, cr = ship.crEffects;
  const commands: RustCommand[] = [
    { kind: 'initialize-ship', id, handle, config: { maxFlux: ship.flux.maxFlux, baseDissipation: ship.flux.baseDissipation,
      hullSize: RustHullSize[hull], softFlux: ship.flux.softFlux, hardFlux: ship.flux.hardFlux,
      ventRateMultiplier: ship.flux.ventRateMultiplier, overloadTimeMultiplier: ship.flux.overloadTimeMultiplier,
      shieldSoftFluxConversion: ship.flux.shieldSoftFluxConversion, dissipationMultiplier: ship.flux.dissipationMultiplier,
      phaseTimeBonus: h.phaseTimeBonusMultiplier, phaseEffect: shield.phaseEffectLevel,
      externalTimeMultiplier: 1, hardFluxDissipationFraction: h.hardFluxDissipationFraction,
      zeroFluxMinimum: h.zeroFluxMinimumFluxLevel, allowZeroFluxAtAnyLevel: h.allowZeroFluxAtAnyLevel,
      flags: (shield.isActive ? RustShipFlag.ShieldActive : 0) | RustShipFlag.AllowDissipation
        | (ship.isDead ? RustShipFlag.Dead : 0) | (ship.isDocked ? RustShipFlag.Docked : 0) | (ship.isRetreated ? RustShipFlag.Retreated : 0)
        | (ship.retreating ? RustShipFlag.Retreating : 0) } },
    { kind: 'initialize-shield', id, handle, config: { type: shield.type, maxArc: shield.maxArcDeg, radius: shield.radius,
      efficiency: shield.efficiency, upkeepRate: shield.upkeepRate, unfoldMultiplier: shield.unfoldRateMultiplier,
      turnMultiplier: shield.turnRateMultiplier, phaseChargeUp: shield.phaseChargeUpDuration,
      phaseChargeDown: shield.phaseChargeDownDuration, phaseCooldown: shield.phaseCooldownDuration,
      phaseActivationCost: shield.phaseActivationCost, phaseUpkeep: shield.phaseUpkeepPerSecond,
      phaseThresholdMultiplier: shield.phaseMinSpeedFluxThresholdMultiplier, phaseCannotOverload: shield.phaseCanNotCauseOverload,
      centerX: ship.spec.shieldCenterX, centerY: ship.spec.shieldCenterY, toggleLocked: shield.toggleLocked,
      initialActive: shield.isActive, rightClickSystem: ship.spec.rightClickSystemType !== undefined && ship.spec.rightClickSystemType !== 'NONE' } },
    { kind: 'shield-mitigation', id, handle, damageMultiplier: h.shieldDamageMultiplier,
      energyMultiplier: shield.energyDamageTakenMultiplier, externalMultiplier: ship.externalDamageTakenMultiplier },
    { kind: 'shield-input', id, handle, aimX: ship.aimTargetWorld.x, aimY: ship.aimTargetWorld.y },
    { kind: 'initialize-armor', id, handle, config: { cols: a.cols, rows: a.rows, cellWidth: a.cellWidth, cellHeight: a.cellHeight,
      armorRating: a.maxArmorRating, minX: a.minX, minY: a.minY, maxHull: ship.maxHullHp, hullHp: ship.hullHp,
      effectiveMultiplier: a.effectiveArmorMultiplier, dynamicMultiplier: a.dynamicEffectiveArmorMultiplier?.() ?? 1,
      maxReduction: a.maxDamageReduction, minResidualMultiplier: a.minArmorFractionMultiplier } },
    { kind: 'armor-stats', id, handle, stats: rustArmorStats(ship) },
    { kind: 'initialize-combat', id, handle, geometry: { team: ship.teamId, hullSize: hull, radius: ship.spec.collisionRadius,
      bounds: ship.spec.bounds, player: ship.isPlayer } },
    { kind: 'combat-attributes', id, handle, attributes: { ai: ship.fireControlMode === 'AI', damageTaken: ship.crDamageTakenMultiplier,
      damageToFightersPercent: h.damageToFightersPercent, damageToFightersMultiplier: h.damageToFightersMultiplier,
      damageToFrigatesPercent: h.damageToFrigatesPercent, damageToDestroyersPercent: h.damageToDestroyersPercent,
      damageToCruisersPercent: h.damageToCruisersPercent } },
    { kind: 'damage-policy', id, handle, policy: { empMultiplier: ship.empDamageTakenMultiplier, weaponMultiplier: ship.weaponDamageTakenMultiplier,
      engineMultiplier: ship.engineDamageTakenMultiplier, damageToWeapons: ship.damageToTargetWeaponsMultiplier,
      damageToEngines: ship.damageToTargetEnginesMultiplier, baseCriticalDamage: ship.baseCriticalMalfunctionDamage,
      criticalDamageMultiplier: ship.criticalMalfunctionDamageMultiplier, crDamageMultiplier: ship.crDamageTakenMultiplier } },
  ];
  if (h.voidShield) commands.push({ kind: 'configure-void-shield', id, handle, spec: h.voidShield });
  ship.allSystems.forEach((system, i) => {
    const controls = system.definition.controls; let flags = +system.available | (system.definition.toggle ? RustLifecycleFlag.Toggle : 0)
      | (system.definition.charges !== undefined && system.definition.usesChargesForActivation !== false ? RustLifecycleFlag.UsesCharges : 0)
      | (system.generatesHardFlux ? RustLifecycleFlag.HardFlux : 0);
    if (controls?.cancelOnBrake) flags |= RustLifecycleFlag.CancelOnBrake;
    if (controls?.cancelOnRetreat) flags |= RustLifecycleFlag.CancelOnRetreat;
    if (controls?.cancelOnFlameout) flags |= RustLifecycleFlag.CancelOnFlameout;
    const specId = id * 100 + i + 1;
    commands.push({ kind: 'define-lifecycle', id: specId, spec: { chargeUp: system.chargeUpDuration, active: system.activeDuration,
      chargeDown: system.chargeDownDuration, cooldown: system.maxCooldown, maxCharges: system.maxCharges, initialCharges: system.charges,
      chargeRegen: system.chargeRegenRate, fluxCostPerUse: system.fluxCostPerUse, flags } },
    { kind: 'install-system', id, handle, systemId: i + 1, specId, defense: system === ship.defenseSystem },
    { kind: 'system-upkeep', id, handle, systemId: i + 1, policy: { gate: 14,
      controls: (controls?.blockShields ? RustUpkeepControl.BlockShields : 0) | (controls?.blockFluxDissipation ? RustUpkeepControl.BlockDissipation : 0)
        | (controls?.lockTurning ? RustUpkeepControl.LockTurning : 0) | (controls?.blockVenting ? RustUpkeepControl.BlockVenting : 0)
        | (controls?.releaseOnOut ? RustUpkeepControl.ReleaseOnOut : 0) | (controls?.blockWeapons ? RustUpkeepControl.BlockWeapons : 0)
        | (controls?.forceAutofire ? RustUpkeepControl.ForceAutofire : 0) } });
  });
  ship.weapons.forEach((mount, i) => commands.push({ kind: 'install-weapon-health', id, handle,
    config: { componentId: i + 1, size: mount.spec.mountSize, mount: mount.mountType,
      x: mount.relativePos.x, y: mount.relativePos.y, healthMultiplier: ship.weaponHealthMultiplier } }));
  commands.push({ kind: 'initialize-weapons', id, handle, facing: (ship.weaponControl as unknown as {previousHullFacingRad:number}).previousHullFacingRad, manual: ship.fireControlMode === 'MANUAL',
    mounts: ship.weapons.map((mount, i) => ({ componentId: i + 1, type: mount.spec.weaponType, beam: mount.spec.isBeam,
      burstBeam: mount.spec.beamVisualMode === 'BURST', refireDelay: mount.spec.refireDelay, chargeTime: mount.spec.chargeTime,
      burstDelay: mount.spec.burstDelay, beamBurstDelay: mount.spec.beamBurstDelay, maxAmmo: mount.spec.maxAmmo,
      ammoRegen: mount.spec.ammoRegenPerSec, minSpread: mount.spec.minSpread, spreadDecay: mount.spec.spreadDecay,
      torpedoRack: !!mount.loadedMissileLevels,
      initial: { angle: mount.currentAngleRad, cooldown: mount.cooldownTimer, ammo: mount.ammo,
        recharge: mount.ammoRechargeProgress, lifecycleDt: mount.lifecycleDt, burstRemaining: mount.burstRemaining,
        burstTimer: mount.burstTimer, burstReserved: mount.burstFluxReserved, firingState: mount.firingState,
        firingTimer: mount.firingStateTimer, triggerHeld: mount.triggerHeld, cycleId: mount.firingCycleId,
        reloadDelay: mount.reloadDelayRemaining, recoil: mount.recoil, glow: mount.glowAlpha, barrel: mount.barrelIndex,
        spread: mount.currentSpreadDeg, loaded: mount.loadedMissileLevels } })),
    groups: ship.weaponGroups.map(group => ({ index: group.index, mode: group.mode, autofire: group.isAutofire,
      members: group.weaponSlotIds.map(slot => ship.weapons.findIndex(mount => mount.slotId === slot) + 1).filter(component => component > 0),
      alternatingIndex: group.alternatingIndex, alternatingElapsed: group.alternatingElapsed,
      alternatingWasFiring: group.alternatingWasFiring, alternatingJustSwitched: group.alternatingJustSwitched })) },
  { kind: 'weapon-policy', id, handle, policy: { manual: ship.fireControlMode === 'MANUAL', combatRepairMultiplier: ship.combatWeaponRepairTimeMultiplier,
    underFire: ship.canRepairModulesUnderFire, malfunctionChance: cr.weaponMalfunctionChance,
    criticalChance: cr.criticalMalfunctionChance, currentCR: ship.currentCR, repairMultiplier: ship.system.getRepairTimeMultiplier(),
    recoilMultiplier: ship.system.getRecoilMultiplier(), rate: ['BALLISTIC', 'ENERGY', 'MISSILE'].map(type => ship.system.getWeaponRateOfFireMultiplier(type as 'BALLISTIC' | 'ENERGY' | 'MISSILE')) as [number, number, number],
    ammoRegen: ['BALLISTIC', 'ENERGY', 'MISSILE'].map(type => ship.system.getAmmoRegenMultiplier(type as 'BALLISTIC' | 'ENERGY' | 'MISSILE')) as [number, number, number], selectedGroupIndex: ship.weaponControl.selectedGroupIndex } },
  { kind: 'initialize-fire', id, handle, mounts: ship.weapons.map((mount, i) => rustFire(ship, mount, id * 1000 + i + 1)) },
  { kind: 'initialize-engines', id, handle, hullSize: hull, radius: ship.spec.collisionRadius,
    healthMultiplier: ship.engineHealthMultiplier, slots: ship.spec.engineSlots.map(slot => ({ x: slot.x, y: slot.y, width: slot.width,
      length: slot.length, systemActivated: slot.systemActivated, maneuver: slot.maneuver })) },
  { kind: 'engine-motion-stats', id, handle, stats: rustMotionStats(ship) },
  { kind: 'engine-policy', id, handle, canRepair: true, repairMultiplier: ship.combatEngineRepairTimeMultiplier,
    underFire: ship.canRepairModulesUnderFire, malfunctionChance: cr.engineMalfunctionChance, criticalChance: cr.criticalMalfunctionChance },
  { kind: 'initialize-readiness', id, handle, config: { cr: ship.currentCR, peakRemaining: ship.peakPerformanceRemaining,
    malfunctionRange: ship.crMalfunctionRangeMultiplier, criticalChanceMultiplier: ship.criticalMalfunctionChanceMultiplier,
    weaponChanceBonus: h.weaponMalfunctionChanceBonus, criticalChanceBonus: h.criticalMalfunctionChanceBonus,
    peakCRSeconds: h.peakCRSec, crLossPerSecond: h.crLossPerSec } },
  { kind: 'effect-attributes', id, handle, shieldPierced: ship.shieldPiercedMultiplier });
  return commands;
}

/** Compilation itself is pure with respect to the caller's active simulation.
 * ContentRegistry revision is checked before/after; all constructor RNG is private. */
export function compileRustContent(input: RustCompileInput, cold?: RustColdSource): RustCompiledContent {
  const revision = contentRegistry.revision;
  if (!Number.isInteger(input.seed) || !Number.isFinite(input.seed)
    || input.visualSeed !== undefined && (!Number.isInteger(input.visualSeed) || !Number.isFinite(input.visualSeed))) throw Error('Invalid compiler RNG seed');
  if (input.contentRevision !== undefined && input.contentRevision !== revision) throw Error('Rust content revision changed before compilation');
  if (!nativeFireControlPrototypes() || !additionalPrototypes() || shipSystemDefinitions.get !== registryMethods.shipGet
    || contentRegistry.getShip !== registryMethods.hullGet || contentRegistry.getWeapon !== registryMethods.weaponGet
    || weaponEffects.get !== registryMethods.effectGet || hullModDefinitions.get !== registryMethods.hullmodGet
    || shipSystemDefinitions.require !== registryMethods.systemRequire || shipSystemDefinitions.all !== registryMethods.systemAll
    || hullModDefinitions.require !== registryMethods.hullmodRequire || hullModDefinitions.all !== registryMethods.hullmodAll
    || weaponEffects.require !== registryMethods.effectRequire) throw Error('Unknown/replaced combat prototype or registry reader identity');
  const selected = input.ships;
  const stableIds = new Set<string>(), seen = new Set<ShipSpec>(), capabilities = new Set<string>();
  for (const entry of input.ships) {
    if (!entry.stableId || stableIds.has(entry.stableId)) throw Error('Duplicate/empty Rust ship identity ' + entry.stableId);
    stableIds.add(entry.stableId);
    if (!Number.isSafeInteger(entry.team) || entry.team < 0 || entry.team > 0xffffffff || !Number.isFinite(entry.facing)
      || typeof entry.player !== 'boolean' || entry.position.length !== 2 || !entry.position.every(Number.isFinite)
      || entry.velocity && (entry.velocity.length !== 2 || !entry.velocity.every(Number.isFinite))
      || entry.fireControlMode !== undefined && entry.fireControlMode !== 'AI' && entry.fireControlMode !== 'MANUAL') throw Error('Invalid ship startup pose/team/control');
    admission(entry.spec, entry.stableId, seen, capabilities);
  }
  if (cold && (cold.roots.length !== selected.length || cold.roots.some((ship, i) => ship.id !== selected[i].stableId || ship.spec !== selected[i].spec))) throw Error('Cold compiler graph differs');
  const random = cold?.random ?? randomAt(input.seed, input.combatCheckpoint), visual = cold?.visual ?? randomAt(input.visualSeed ?? ((input.seed ^ 0x9e3779b9) >>> 0), input.visualCheckpoint);
  const checkpoint = () => ({ combat: random.checkpointWitness(), visual: visual.checkpointWitness() });
  const begin = checkpoint(), rootWitness: { stableId: string; before: RustRandomCheckpoint; after: RustRandomCheckpoint }[] = [];
  const roots = cold ? [...cold.roots] : selected.map(entry => {
    const before = random.checkpointWitness(), ship = new Ship(entry.stableId, immutableCopy(entry.spec), entry.player,
      new Vector2(...entry.position), entry.facing, random, visual);
    ship.teamId = entry.team; ship.vel.set(...(entry.velocity ?? [0, 0]));
    ship.fireControlMode = entry.fireControlMode ?? (entry.player ? 'MANUAL' : 'AI');
    if (entry.shipName !== undefined) ship.shipName = entry.shipName;
    for (const part of ship.assemblyShips) part.teamId = entry.team;
    if (!hasNativeMotionBoundary(ship)) throw Error(entry.stableId + ': replaced source motion callback');
    rootWitness.push({ stableId: entry.stableId, before, after: random.checkpointWitness() }); return ship;
  });
  const afterRoots = checkpoint(), flight = cold?.flight ?? new FighterSystem(random, visual), initializeWings = input.initializeWings !== false;
  const activeRoots = roots.filter((_, i) => selected[i].deployment !== 'reserve');
  if (initializeWings && !cold) for (const root of activeRoots) flight.addCarrier(root);
  const ships = [...roots.flatMap(root => root.assemblyShips), ...flight.fighters, ...flight.bombers];
  const identities = new Map(ships.map((ship, i) => [ship, { id: i + 1, handle: { slot: i, generation: 1 } }]));
  const requireIdentity = (ship: Ship) => { const identity = identities.get(ship); if (!identity) throw Error('Missing compiler closure identity ' + ship.id); return identity; };
  const shipDictionary: { key: string; spec: ShipSpec; hullStats: Readonly<HullModStats> }[] = [], weapons: { key: string; spec: WeaponSpec }[] = [];
  const specKeys = new Map<Ship, string>();
  ships.forEach((ship, i) => { const key = (input.staticNamespace ?? '') + 'entity-spec:' + (i + 1); specKeys.set(ship, key); shipDictionary.push({ key, spec: ship.spec, hullStats: ship.hullStats }); });
  const spawn: RustCommand[] = [], domains: RustCommand[] = [], relations: RustCommand[] = [], entities: RustCompiledIdentity[] = [];
  const constructorStates: RustConstructorInitial[] = [], ai: RustMandatoryInstall['ai'][number][] = [], aux: RustMandatoryInstall['aux']['ships'][number][] = [];
  const localHooks: RustMandatoryInstall['localHooks'][number][] = [], slots: RustMandatoryInstall['slotDictionary'][number][] = [];
  const phase: RustMandatoryInstall['phase']['ships'][number][] = [];
  const generatedSources: RustMandatoryInstall['generatedSources'][number][] = [];
  const activeShips = cold?.active ?? new Set([...activeRoots.flatMap(root => root.assemblyShips), ...flight.fighters, ...flight.bombers]);
  const rootEntry = (ship: Ship): RustCompileShip | undefined => { let root = ship; while (root.parentShip) root = root.parentShip;
    if (root.sourceCarrier) return rootEntry(root.sourceCarrier); return selected[roots.indexOf(root)]; };
  const teams = input.visibilityTeams ?? [...new Set(input.ships.map(ship => ship.team))], scope = ships.filter(ship => activeShips.has(ship)).map(ship => requireIdentity(ship));
  const tieOrder = ships.map((_, i) => i).sort((a, b) => ships[a].id.localeCompare(ships[b].id));
  const tieRanks: number[] = []; let rank = 0;
  tieOrder.forEach((index, i) => { if (i && ships[index].id.localeCompare(ships[tieOrder[i - 1]].id) !== 0) rank++; tieRanks[index] = rank; });
  ships.forEach((ship, index) => {
    const { id, handle } = requireIdentity(ship), entry = selected[roots.indexOf(ship)], deploymentEntry = rootEntry(ship), specKey = specKeys.get(ship)!;
    const motion = Array<number>(22).fill(0); motion.splice(0, 6, ship.pos.x, ship.pos.y, ship.vel.x, ship.vel.y, ship.facingRad, ship.angularVelRad); motion[18] = 1;
    spawn.push({ kind: 'spawn', id, motion }); domains.push(...shipDomains(ship, id, handle)); constructorStates.push(constructorInitial(ship, id));
    const mounts = ship.weapons.map((mount, i) => { const weaponKey = 'entity-weapon:' + id + ':' + (i + 1);
      weapons.push({ key: weaponKey, spec: mount.spec }); return { componentId: i + 1, sourceSlotId: mount.slotId, weaponKey, mountIndex: i }; });
    ship.weapons.forEach((mount, i) => { const child = rustMirvChild(mount.spec); if (!child) return;
      const weaponKey = 'generated-mirv:' + id + ':' + (i + 1); weapons.push({ key: weaponKey, spec: child });
      generatedSources.push({ id, sourceSlotId: mount.slotId, kind: 'mirv-child', numericSpec: id * 1000 + i + 1, weaponKey }); });
    ship.allSystems.forEach((system, i) => { for (const weaponId of system.definition.resources?.weapons ?? []) {
      const source = contentRegistry.getWeapon(weaponId)!;
      const weaponKey = 'generated-system:' + id + ':' + (i + 1) + ':' + source.id;
      weapons.push({ key: weaponKey, spec: source });
      generatedSources.push({ id, systemId: i + 1, sourceSlotId: source.id === HYPERION_PROJECTILE_ID ? 'SYS_YAMATO' : undefined,
        kind: 'system-resource', weaponKey });
    } });
    entities.push({ id, stableId: ship.id, handle, specKey, parentId: ship.parentShip ? requireIdentity(ship.parentShip).id : undefined,
      carrierId: ship.sourceCarrier ? requireIdentity(ship.sourceCarrier).id : undefined, persistentMemberId: entry?.persistentMemberId,
      transient: !!entry?.transient || !!ship.sourceCarrier, player: ship.isPlayer, team: ship.teamId,
      deployment: deploymentEntry?.deployment === 'reserve' ? 'reserve' : 'deployed',
      role: ship.parentShip ? 'module' : flight.bombers.includes(ship) ? 'bomber' : flight.fighters.includes(ship) ? 'fighter' : 'capital', mounts });
    relations.push({ kind: 'initialize-system-world', id, handle, config: rustWorldSystem(ship, other => requireIdentity(other).handle) },
    { kind: 'initialize-world-ship', id, handle, config: rustDeath(ship, !!ship.sourceCarrier || !!entry?.transient) },
    { kind: 'initialize-fire-query', id, handle, ship: { visibility: teams.map(team => ({ team, visible: true })), scope,
      player: ship.isPlayer, vast: ship.hasVastBulk, noFireThrough: ship.spec.sourceHullTraits?.includes('do_not_fire_through'),
      pdIgnoresFlares: ship.hullStats.pdIgnoresFlares, accuracy: ship.hullStats.autofireAimAccuracy,
      nativeThreat: ship.hasNativeThreatPhaseHooks, finish: 1, pressure: 1,
      tieRank: tieRanks[index], adaptiveBudget: true }, mounts: ship.weapons.map(mount => rustQueryMount(ship, mount)) },
    { kind: 'fire-controls', id, handle, aim: [ship.aimTargetWorld.x, ship.aimTargetWorld.y], trigger: false,
      selectedGroup: ship.weaponControl.selectedGroupIndex, ai: ship.fireControlMode === 'AI' });
    const gravity = rustGravity(ship);
    if (gravity.systems.length || gravity.mounts.length) relations.push({ kind: 'initialize-gravity-ship', id, handle, ...gravity });
    ship.weapons.forEach((mount, i) => relations.push({ kind: 'recoil-source', id, handle, index: i,
      railgun: mount.spec.id === ROCINANTE_WEAPONS.railgun,
      pointDefenseRole: ship.spec.weaponSlots.find(slot => slot.slotId === mount.slotId)?.controlRole === 'POINT_DEFENSE' }));
    const mods = installedHullMods(ship.spec), stealths = mods.filter(mod => mod.id === 'stealth_minefield' || mod.id === 'stealth_minefield_lt');
    const facts = nativeHullFacts as Record<string, { deployCR: number }>;
    phase.push({ id, handle, anchorCRCost: mods.some(mod => mod.id === 'phase_anchor')
      ? ship.spec.deploymentCRCost ?? (facts[ship.spec.sourceHullId ?? ship.spec.id]?.deployCR ?? 0) / 100 : undefined,
    controls: ship.allSystems.map((system, i) => ({ systemId: i + 1, flags: (() => { const c = system.definition.controls;
      return (c?.blockFluxDissipation ? 1 : 0) | (c?.blockAcceleration ? 2 : 0) | (c?.blockStrafing ? 4 : 0)
        | (c?.forceAutofire ? 8 : 0) | (c?.blockWeapons ? 16 : 0) | (c?.blockShields ? 32 : 0)
        | (c?.lockTurning ? 64 : 0) | (c?.forceForward ? 128 : 0) | (c?.blockVenting ? 256 : 0) | (c?.releaseOnOut ? 512 : 0); })(), phase: !!system.definition.phase,
      vulnerableUp: !!system.definition.phase?.vulnerableChargeUp, vulnerableDown: !!system.definition.phase?.vulnerableChargeDown })) });
    const payloads = (['minelayer1', 'minelayer2'] as const).map(weapon => { const payload = effectiveHullModWeaponSpec(ship.spec, nativeMinePayload(weapon));
      const weaponKey = 'generated-mine:' + id + ':' + weapon; weapons.push({ key: weaponKey, spec: payload });
      generatedSources.push({ id, kind: 'mine', weaponKey });
      return { damage: payload.damagePerShot, launchSpeed: payload.launchSpeed ?? payload.projSpeed,
        hp: payload.missileHp ?? 500, flight: payload.flightTime ?? 20 };
    }) as unknown as RustAuxShip['payloads'];
    aux.push({ id, handle, stealth: stealths.length ? stealths[0].id === 'stealth_minefield_lt' ? 1 : 2 : undefined,
      stealthHooks: stealths.length,
      ineligible: ship.isAttachedModule || ship.spec.hullSize === 'FIGHTER' || !!ship.spec.sourceHullTraits?.some(trait => ['STATION', 'STATION_MODULE', 'DRONE'].includes(trait)), drone: ship.isSystemDrone,
      travelSystems: ship.allSystems.flatMap((system, i) => system.definition.sourceIds.includes('traveldrive') ? [i + 1] : []), payloads });
    for (const mod of mods) {
      if (mod.advance) localHooks.push({ id, hullmodId: mod.id, phase: 'prepareStep', sMod: !!ship.spec.sMods?.includes(mod.id) });
      if (mod.advanceCombat) localHooks.push({ id, hullmodId: mod.id, phase: 'combatWorld', sMod: !!ship.spec.sMods?.includes(mod.id) });
      if (mod.onWeaponRecoil) localHooks.push({ id, hullmodId: mod.id, phase: 'weaponRecoil', sMod: !!ship.spec.sMods?.includes(mod.id) });
    }
    slots.push({ id, slots: ship.spec.weaponSlots.map((slot, i) => ({ sourceSlotId: slot.slotId, slotId: i + 1,
      componentId: mounts.find(mount => mount.sourceSlotId === slot.slotId)?.componentId })) });
  });
  const memoryOwners = new Map<Ship, Ship | null>(cold?.aiTargets);
  if (!cold) roots.forEach((ship, index) => { const entry = selected[index]; if (entry.deployment === 'reserve' || entry.aiMemory === false || entry.aiMemory === undefined && entry.player) return;
    const target = entry.initialTargetId ? ships.find(other => activeShips.has(other) && other.id === entry.initialTargetId) : activeRoots.find(other => other.teamId !== ship.teamId);
    if (entry.initialTargetId && !target) throw Error(ship.id + ': missing initial AI target ' + entry.initialTargetId);
    memoryOwners.set(ship, target ?? null); });
  ai.push(...compileRustResidentAI(ships, new Map(ships.map(ship => [ship, requireIdentity(ship).handle])),
    new Map(ships.flatMap(ship => ship.weapons.map((mount, i) => [mount, i + 1] as const))), memoryOwners));
  const templates: RustCompiledTemplate[] = [], templateIds = new Map<string, string>();
  function template(spec: ShipSpec, carrier?: Ship, actualModule?: Ship): string {
    const pointDefense = carrier?.spec.captainSkills?.point_defense;
    const craftSpec = pointDefense ? { ...spec, captainSkills: { ...spec.captainSkills, point_defense: pointDefense } } : spec;
    const sourceKey = JSON.stringify([craftSpec, carrier?.spec, carrier ? specKeys.get(carrier) : undefined, actualModule?.moduleMount, actualModule?.parentShip ? specKeys.get(actualModule.parentShip) : undefined,actualModule?.isPlayer]); const cached = templateIds.get(sourceKey); if (cached) return cached;
    const key = (input.staticNamespace ?? '') + 'template:' + (templates.length + 1), sample = actualModule ?? new Ship('template-sample:' + key, immutableCopy(craftSpec), false,
      new Vector2(), 0, new SimulationRandom(0), new SimulationRandom(0), carrier);
    templateIds.set(sourceKey, key);
    specKeys.set(sample, key);
    const numeric = (input.templateSpecBase ?? 1_000_000) + templates.length + 1;
    if (!Number.isSafeInteger(numeric) || numeric < 1 || numeric * 100 + sample.allSystems.length > 0xffffffff) throw Error('Rust template lifecycle identity exhausted');
    const sampleDomains = shipDomains(sample, numeric, { slot: 0, generation: 1 });
    sample.weapons.forEach((mount, i) => sampleDomains.push({ kind: 'recoil-source', id: numeric,
      handle: { slot: 0, generation: 1 }, index: i, railgun: mount.spec.id === ROCINANTE_WEAPONS.railgun,
      pointDefenseRole: sample.spec.weaponSlots.find(slot => slot.slotId === mount.slotId)?.controlRole === 'POINT_DEFENSE' }));
    const templateMounts = sample.weapons.map((mount, i) => { const weaponKey = 'template-weapon:' + key + ':' + (i + 1);
      weapons.push({ key: weaponKey, spec: mount.spec }); return { componentId: i + 1, sourceSlotId: mount.slotId, weaponKey, mountIndex: i }; });
    const templateSources: RustCompiledTemplate['generatedSources'][number][] = [];
    sample.weapons.forEach((mount, i) => { const child = rustMirvChild(mount.spec); if (!child) return;
      const weaponKey = 'template-mirv:' + key + ':' + (i + 1); weapons.push({ key: weaponKey, spec: child });
      templateSources.push({ sourceSlotId: mount.slotId, kind: 'mirv-child', weaponKey }); });
    sample.allSystems.forEach((system, i) => { for (const weaponId of system.definition.resources?.weapons ?? []) {
      const source = contentRegistry.getWeapon(weaponId)!;
      const weaponKey = 'template-system:' + key + ':' + (i + 1) + ':' + source.id; weapons.push({ key: weaponKey, spec: source });
      templateSources.push({ systemId: i + 1, sourceSlotId: source.id === HYPERION_PROJECTILE_ID ? 'SYS_YAMATO' : undefined,
        kind: 'system-resource', weaponKey });
    } });
    for (const mine of ['minelayer1', 'minelayer2'] as const) {
      const payload = effectiveHullModWeaponSpec(sample.spec, nativeMinePayload(mine));
      const weaponKey = 'template-mine:' + key + ':' + mine; weapons.push({ key: weaponKey, spec: payload });
      templateSources.push({ kind: 'mine', weaponKey });
    }
    const compiled = { key, sourceSpecId: spec.id, samplePlayer:sample.isPlayer, carrierSpecKey: carrier ? specKeys.get(carrier) : undefined,
      carrierSourceSpecId: carrier?.spec.id,
      spec: sample.spec, hullStats: sample.hullStats, weapons: sample.weapons.map(mount => mount.spec), mounts: templateMounts, generatedSources: templateSources,
      constructorOrder: ['weapons', 'modules', 'engines', 'readiness', 'hullmodApply'] as RustCompiledTemplate['constructorOrder'], domains: sampleDomains,
      sampleInitial: constructorInitial(sample, 1), constructor: undefined as unknown as RustFlightStaticShip };
    templates.push(compiled);
    const children = sample.childModules.map(child => { const mount = child.moduleMount!, offset = moduleOffset(mount);
      return { template: template(child.spec, child.sourceCarrier, child), offset: [offset.x, offset.y] as const, angle: mount.angleDeg * Math.PI / 180,
        independent: !!child.spec.sourceHullTraits?.includes('INDEPENDENT_ROTATION'), manual: child.fireControlMode === 'MANUAL' }; });
    compiled.constructor = compileRustFlightStatic(sample, sampleDomains, rustDeath(sample), children,
      teams.map(team => ({ team, visible: true })), id => template(contentRegistry.getShip(id)!, sample), key, compileRustGeneratedAdmission(sample, key));
    return key;
  }
  const reserves = roots.flatMap((ship, i) => selected[i].deployment === 'reserve' ? [{ ...requireIdentity(ship), stableId: ship.id, specKey: specKeys.get(ship)!, team: ship.teamId,
    player: ship.isPlayer, persistentMemberId: selected[i].persistentMemberId, transient: !!selected[i].transient }] : []);
  const flightTemplates: RustMandatoryInstall['flight']['templates'][number][] = [];
  if (input.staticRootTemplates) for (const root of roots) template(root.spec,undefined,root);
  for (const ship of ships.filter(ship => !ship.sourceCarrier)) for (const wing of ship.spec.fighterWings ?? [])
    flightTemplates.push({ carrierSpecKey: specKeys.get(ship)!, craftSpecKey: template(contentRegistry.getShip(wing.specId)!, ship) });
  const drone = compileRustDroneAdmission(ships, new Map(ships.map(ship => [ship, requireIdentity(ship).handle])),
    (_carrier, data) => template(droneVariantSpec(data)));
  const flightPrivate = flight as unknown as { playerWings: { wingId: string; carrierId: string; specId: string; name: string; role: 'FIGHTER' | 'BOMBER'; isPlayer: boolean; teamId: number; crr: number; maxCrafts: number; rebuildSeconds: number; range?: number; tags?: string[] }[];
    enemyWings: { wingId: string; carrierId: string; specId: string; name: string; role: 'FIGHTER' | 'BOMBER'; isPlayer: boolean; teamId: number; crr: number; maxCrafts: number; rebuildSeconds: number; range?: number; tags?: string[] }[];
    carriers: Map<string, Ship>; formation: { slots: WeakMap<Ship, { root: Ship; index: number }>; footprints: WeakMap<Ship, number> };
    fighterAIModes: Map<string, { state: string; timer: number }>; bomberAIModes: Map<string, { state: string; timer: number; hasTorpedo: boolean }> };
  const wings = [...flightPrivate.playerWings, ...flightPrivate.enemyWings].map(wing => ({ carrierId: entities.find(entity => entity.stableId === wing.carrierId)!.id,
    wingId: wing.wingId, specId: wing.specId, role: wing.role, count: wing.maxCrafts, rebuildSeconds: wing.rebuildSeconds,
    name: wing.name, player: wing.isPlayer, team: wing.teamId, crr: wing.crr,
    range: wing.range, tags: wing.tags, craftIds: ships.filter(ship => ship.flightDeckWingId === wing.wingId).map(ship => requireIdentity(ship).id) }));
  const craftModes = [...flightPrivate.fighterAIModes, ...flightPrivate.bomberAIModes].map(([stableId, mode]) => ({
    id: entities.find(entity => entity.stableId === stableId)!.id, ...mode }));
  const flightShips = ships.map(ship => compileRustFlightMeta(ship, requireIdentity(ship).id, requireIdentity(ship).handle,
    other => requireIdentity(other).handle, id => template(contentRegistry.getShip(id)!, ship), specKeys.get(ship)!));
  const formation = { slots: ships.flatMap(ship => { const slot = flightPrivate.formation.slots.get(ship);
    return slot ? [{ craft: requireIdentity(ship).handle, root: requireIdentity(slot.root).handle, index: slot.index }] : []; }),
    footprints: ships.flatMap(ship => { const radius = flightPrivate.formation.footprints.get(ship);
      return radius !== undefined ? [{ root: requireIdentity(ship).handle, radius }] : []; }) };
  if (revision !== contentRegistry.revision) throw Error('Rust content revision changed during compilation');
  const end = checkpoint();
  const initial: RustCommand[] = constructorStates.map(state => ({ kind: 'initialize-constructor-state',
    id: state.id, handle: entities.find(entity => entity.id === state.id)!.handle, initial: state }));
  return immutableCopy({ version: RUST_CONTENT_COMPILER_VERSION, contentRevision: revision, commands: [...spawn, ...domains, ...relations, ...initial],
    batches: [{ stage: 'spawn', commands: spawn }, { stage: 'domains', commands: domains }, { stage: 'relations', commands: relations },
      { stage: 'constructor', commands: initial }],
    finalize: [{ kind: 'initialize-startup-random', ...end }],
    entities, reserves, dictionary: { ships: shipDictionary, weapons, templates,
      sources: { ships: [...seen], weapons: [...new Map([...seen].flatMap(spec => {
        const required = [...spec.weaponSlots, ...(spec.systemWeaponSlots ?? [])].flatMap(slot => slot.defaultWeaponId ? [slot.defaultWeaponId] : []);
        for (const id of [...tacticalSystemIds(spec), defenseSystemId(spec)]) required.push(...(shipSystemDefinitions.require(id).resources?.weapons ?? []));
        for (const mod of installedHullMods(spec)) required.push(...(mod.resources?.weapons ?? []));
        return required.map(id => [id, contentRegistry.getWeapon(id)!] as const);
      })).values()] } },
    pending: { prelude: compileRustScenePrelude(ships, new Map(ships.map(ship => [ship, requireIdentity(ship).handle])), new Map(ships.map(ship => [ship, requireIdentity(ship).id]))),
      read: ships.map(ship => ({ ...requireIdentity(ship), sightFlat: ship.hullStats.sightRadiusFlat, sightPercent: ship.hullStats.sightRadiusPercent, weaponRepair: ship.combatWeaponRepairTimeMultiplier })),
      drone, systemRead: compileRustSceneSystemMetadata(ships, new Map(ships.map(ship => [ship, requireIdentity(ship).handle])), new Map(ships.map(ship => [ship, requireIdentity(ship).id]))),
      visual: ships.map(ship => ({ ...requireIdentity(ship), stableId: ship.id, meta: compileRustVisualStatic(ship) })),
      phase: { ships: phase }, combatPolicy: validateCombatPolicy(bundledPolicy) ? bundledPolicy : emptyCombatPolicy(),
      constructorInitial: constructorStates, ai, flight: { initializeWings, wings, craftModes, templates: flightTemplates,
        ships: flightShips, roots: roots.filter(ship => activeShips.has(ship)).map(ship => requireIdentity(ship).handle),
        carrierOrder: [...flightPrivate.carriers.values()].map(ship => requireIdentity(ship).handle), formation },
      aux: { mines: (['minelayer1', 'minelayer2'] as const).map((weapon, i) => { const spec = nativeMines[weapon], blast = spec.behaviorSpec.explosionSpec;
        return { weapon: i + 1 as 1 | 2, damage: spec.damage, speed: spec.speed, hp: spec.hitpoints, radius: spec.collisionRadius,
          visualRadius: spec.explosionRadius, acceleration: spec.engineSpec.acc, trigger: spec.behaviorSpec.range,
          delay: spec.behaviorSpec.delay, windup: spec.behaviorSpec.windupDelay, blastRadius: blast.radius, blastCore: blast.coreRadius,
          blastDuration: blast.duration, color: spec.explosionColor.slice(0, 3) as [number, number, number],
          glow: spec.glowColor.slice(0, 3) as [number, number, number] }; }), ships: aux },
      localHooks, slotDictionary: slots, generatedSources, startupRandom: end },
    startupRNGWitness: { begin, afterRoots, end, roots: rootWitness }, capabilities: [...capabilities].sort() });
}
