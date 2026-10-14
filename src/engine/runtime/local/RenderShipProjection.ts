import { ProjectedRenderShip, ProjectedRenderSystem, ProjectedRenderWeapon } from '../../render/ProjectedRenderState';
export { ProjectedRenderShip, ProjectedRenderSystem, ProjectedRenderWeapon } from '../../render/ProjectedRenderState';
// Authority-only explicit projection. No projected class inherits simulation behavior.
import { RenderWeaponDictionary } from './RenderWeaponDictionary';
import { updateProjectionArray, knownProjectionKeys } from './ProjectionArrays';
export { knownProjectionKeys } from './ProjectionArrays';
import { Ship, readShipSystems } from '../../simulation/Ship';
import { ShipSystem } from '../../simulation/ShipSystem';
import { combatWeaponRange } from '../../simulation/WeaponRange';
import { hasOnlyNativePhaseReaders } from '../../extensions/NativePhaseReaders';
import { hasOnlyNativeRangeModifiers } from '../../extensions/HullMods';
import { isImmutableMetadata } from '../../extensions/Immutable';
import { pulsePusherOffset } from '../../extensions/ship-systems/PulseDriveState';
import { shipPresentationPose } from '../../visual/ShipPresentation';
import type { RenderWeapon } from '../../render/ShipRenderState';
import { weaponPresentationAngle } from '../../visual/WeaponPresentation';
import type { WeaponMount } from '../../simulation/Weapon';
import type { ShipSurfaceFeedback } from '../../visual/ShipSurfaceFeedback';

export const renderShipFields = ["id","spec","pos","prevPos","vel","facingRad","prevFacingRad","angularVelRad","hullHp","maxHullHp","isDead","isDocked","isRetreated","isAttachedModule","teamId","playerTargetId","visibilityMask","visibilityOverflow","phaseGhosts","phaseVisualAlpha","engineBoostLevel","prevEngineBoostLevel","scorchMarks","scorchMarkVersion","selectedGroupIndex","fireControlMode","surfaceFeedback"] as const satisfies readonly (keyof Ship)[];
const shieldFields = ["voidShield","facingAngleRad","isPhaseEngaged","isVisuallyDeployed","phaseCooldownLevel","phaseEffectLevel","phaseState","radius","renderArcRad","type","visualAlpha"] as const;
const fluxFields = ["fluxPercent","hardFlux","hullSize","isOverloaded","isVenting","maxFlux","overloadTimer"] as const;
export const renderEngineStatusFields = ["prevThrust","currentThrust","prevSpread","spread"] as const;
const weaponFields = ["arcDeg","baseAngleDeg","currentAngleRad","currentSpreadDeg","glowAlpha","isDisabled","loadedMissileLevels","mountType","recoil","relativePos","slotId","spec","gravityTractor","gravityDeflection"] as const;
const armorFields = ['cellWidth'] as const;
const engineControllerFields = ['flameAccelerating'] as const;
const systemDefinitionFields = ['visuals'] as const;
const projectedShipKeys: string[] = [...renderShipFields, 'shield', 'flux', 'armor', 'engineController', 'engineStatuses', 'weapons', 'weaponGroups', 'system', 'allSystems', 'sourceCarrier', 'weaponRanges', 'presentationPose'];
const projectedWeaponKeys: string[] = [...weaponFields, 'presentationRelativeAngle'];
const projectedShieldKeys: string[] = [...shieldFields, 'hitSegmentLevels'];
const projectedFluxKeys: string[] = [...fluxFields];
const projectedArmorKeys: string[] = [...armorFields];
const projectedEngineControllerKeys: string[] = [...engineControllerFields];
const projectedEngineStatusKeys: string[] = [...renderEngineStatusFields];
const projectedSystemDefinitionKeys: string[] = [...systemDefinitionFields];
const projectedWeaponGroupKeys: string[] = ['index', 'mode', 'isAutofire', 'weaponSlotIds', 'alternatingIndex', 'alternatingElapsed', 'alternatingWasFiring', 'alternatingJustSwitched'];
const projectedSurfaceFeedbackKeys: string[] = ['mode', 'level', 'progress'];
const nativeQueries = ['interpolatedPos', 'interpolatedFacing', 'getShieldCenter', 'isVisibleTo'] as const;
const queries = nativeQueries.map(key => Ship.prototype[key]);
const nativeRangeReader = ShipSystem.prototype.getWeaponRangePercent;

const rangeModifierReaders = ['getWeaponRangePercent'] as const;

/** Targets are projector-owned records, never source components or received DTOs. */
function copyFields<T extends object, K extends keyof T>(target: object, source: T, keys: readonly K[]): void {
 const output = target as Record<keyof T, unknown>;
 for (let i = 0; i < keys.length; i++) {
  const key = keys[i];
  output[key] = source[key];
 }
}

/** Per-encoder identities survive ticks, but field values are sampled anew on every
 * completed authority phase. No AI/weapon controller/armor-cell graphs are walked.
 * Unrecognized query behavior requires an explicit authority-side adapter. */
export class RenderShipProjection {
 private readonly records = new WeakMap<object, object>();
 private readonly surfaceFeedbacks = new WeakMap<Ship, { mode: ShipSurfaceFeedback['mode']; level: number; progress: number }>();
 private readonly weaponDictionary = new RenderWeaponDictionary();
 private readonly sampled = new Map<Ship, ProjectedRenderShip>();
 private readonly supported = new Set<Ship>();
 private readonly verifiedWorkerShips = new WeakSet<Ship>();
 private readonly rangeStates = new WeakMap<Ship, { ecm: number; carrierSpec: unknown; bPct: number; ePct: number; mPct: number }>();
 private readonly pending: Ship[] = [];
 private workerOwned = false;
 private readonly projectWeaponBound = (mount: WeaponMount): ProjectedRenderWeapon => this.weapon(mount);
 private readonly projectEngineStatusBound = (status: Ship['engineStatuses'][number]): Pick<Ship['engineStatuses'][number], typeof renderEngineStatusFields[number]> => this.engineStatus(status);
 private readonly projectSystemBound = (sys: ShipSystem): ProjectedRenderSystem => this.system(sys);
 begin(workerOwned = false): void { this.workerOwned = workerOwned; this.sampled.clear(); this.supported.clear(); this.weaponDictionary.begin(workerOwned); }
 finish(): void { this.weaponDictionary.finish(); }
 /** Check the WHOLE frame before capture; never mix a simulation object into
  * a partially projected owner/carrier graph. */
 supports(roots: readonly Ship[]): boolean {
  const pending = this.pending;
  pending.length = roots.length;
  for (let i = 0; i < roots.length; i++) pending[i] = roots[i];
  return this.drainPending();
 }
 supportsEngine(
  playerShip: Ship,
  enemyShip: Ship,
  ships: readonly Ship[],
  allCapitalShips: readonly Ship[],
  hulkFragments: readonly { readonly sourceShip: Ship }[],
 ): boolean {
  const pending = this.pending;
  pending.length = 0;
  pending.push(playerShip, enemyShip);
  for (let i = 0; i < ships.length; i++) pending.push(ships[i]);
  for (let i = 0; i < allCapitalShips.length; i++) pending.push(allCapitalShips[i]);
  for (let i = 0; i < hulkFragments.length; i++) pending.push(hulkFragments[i].sourceShip);
  return this.drainPending();
 }
 private drainPending(): boolean {
  const pending = this.pending;
  while (pending.length) {
   const source = pending.pop()!;
   if (this.supported.has(source)) continue;
   if (!this.supportsShip(source)) { pending.length = 0; return false; }
   this.supported.add(source);
   if (source.sourceCarrier) pending.push(source.sourceCarrier);
  }
  return true;
 }
 private supportsShip(source: Ship): boolean {
  if (!hasOnlyNativePhaseReaders(source.externalPhaseEffects)) return false;
  if (this.workerOwned && this.verifiedWorkerShips.has(source)) return true;
  if (!hasOnlyNativeRangeModifiers(source.spec)
   || (source.sourceCarrier && !hasOnlyNativeRangeModifiers(source.sourceCarrier.spec))) return false;
  for (let i = 0; i < nativeQueries.length; i++) {
   if (source[nativeQueries[i]] !== queries[i]) return false;
  }
  const systems = readShipSystems(source);
  for (let i = 0; i < systems.length; i++) {
   const system = systems[i];
   if (!system.hasNativeStats || system.getWeaponRangePercent !== nativeRangeReader) return false;
  }
  if (this.workerOwned && isImmutableMetadata(source.spec)) {
   this.verifiedWorkerShips.add(source);
   const vs = source.shield.voidShield;
   if (vs && !knownProjectionKeys.has(vs)) knownProjectionKeys.set(vs, Object.keys(vs));
   const groups = source.weaponGroups;
   for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    if (!knownProjectionKeys.has(g)) {
     const k = Object.keys(g);
     if (k.length === 8 && k[0] === 'index' && k[1] === 'mode' && k[2] === 'isAutofire' && k[3] === 'weaponSlotIds' && k[4] === 'alternatingIndex' && k[5] === 'alternatingElapsed' && k[6] === 'alternatingWasFiring' && k[7] === 'alternatingJustSwitched') {
      knownProjectionKeys.set(g, projectedWeaponGroupKeys);
     }
    }
   }
  }
  return true;
 }
 private select<T extends object, K extends keyof T>(source: T, keys: readonly K[], knownKeys?: string[]): Pick<T, K> {
  let target = this.records.get(source) as Pick<T, K> | undefined;
  if (!target) {
   target = {} as Pick<T, K>;
   this.records.set(source, target);
   if (knownKeys) knownProjectionKeys.set(target, knownKeys);
  }
  for (let i = 0; i < keys.length; i++) {
   const key = keys[i];
   target[key] = source[key];
  }
  return target;
 }
 private engineStatus(source: Ship['engineStatuses'][number]): Pick<Ship['engineStatuses'][number], typeof renderEngineStatusFields[number]> {
  let target = this.records.get(source) as Pick<Ship['engineStatuses'][number], typeof renderEngineStatusFields[number]> | undefined;
  if (!target) {
   target = { prevThrust: 0, currentThrust: 0, prevSpread: 0, spread: 0 };
   this.records.set(source, target);
   knownProjectionKeys.set(target, projectedEngineStatusKeys);
  }
  target.prevThrust = source.prevThrust;
  target.currentThrust = source.currentThrust;
  target.prevSpread = source.prevSpread;
  target.spread = source.spread;
  return target;
 }
 private weapon(source: WeaponMount): ProjectedRenderWeapon {
  let target = this.records.get(source) as ProjectedRenderWeapon | undefined;
  if (!target) {
   target = new ProjectedRenderWeapon();
   this.records.set(source, target);
   knownProjectionKeys.set(target, projectedWeaponKeys);
  }
  target.arcDeg = source.arcDeg;
  target.baseAngleDeg = source.baseAngleDeg;
  target.currentAngleRad = source.currentAngleRad;
  target.currentSpreadDeg = source.currentSpreadDeg;
  target.glowAlpha = source.glowAlpha;
  target.isDisabled = source.isDisabled;
  target.loadedMissileLevels = source.loadedMissileLevels;
  target.mountType = source.mountType;
  target.recoil = source.recoil;
  target.relativePos = source.relativePos;
  target.slotId = source.slotId;
  target.spec = this.weaponDictionary.project(source.spec);
  target.gravityTractor = source.gravityTractor;
  target.gravityDeflection = source.gravityDeflection;
  target.presentationRelativeAngle = weaponPresentationAngle(source, 0);
  return target;
 }
 private system(source: ShipSystem): ProjectedRenderSystem {
  let target = this.records.get(source) as ProjectedRenderSystem | undefined;
  let isNew = false;
  if (!target) {
   target = new ProjectedRenderSystem();
   this.records.set(source, target);
   isNew = true;
  }
  target.gravityPolarity = source.gravityPolarity;
  target.gravityControlHeld = source.gravityControlHeld;
  target.activationSerial = source.activationSerial;
  target.available = source.available;
  target.disabled = source.disabled;
  target.effectLevel = source.effectLevel;
  target.fortressVisualLevel = source.fortressVisualLevel;
  target.isActive = source.isActive;
  target.state = source.state;
  target.teleportVisual = source.teleportVisual;
  target.type = source.type;
  if (source.definition.gravityDirectionalPush) target.gravityPush = source.gravityPush;
  if (source.definition.gravityField || source.definition.gravityCollapse) target.gravityField = source.gravityField;
  if (source.definition.gravityManeuver) target.gravityManeuver = source.gravityManeuver;
  target.definition = this.select(source.definition, systemDefinitionFields, projectedSystemDefinitionKeys);
  target.pulseOffset = pulsePusherOffset(source);
  if (isNew && (this.workerOwned || isImmutableMetadata(source.definition))) {
   knownProjectionKeys.set(target, Object.keys(target));
   const vis = source.definition.visuals;
   if (vis && typeof vis === 'object' && !knownProjectionKeys.has(vis)) knownProjectionKeys.set(vis, Object.keys(vis));
  }
  return target;
 }
 project(source: Ship): ProjectedRenderShip {
  const sampled = this.sampled.get(source);
  if (sampled) return sampled;
  if (!this.supported.has(source)) {
   if (!this.supportsShip(source)) {
    throw new Error('Display projection unsupported; an authority-side presentation adapter is required');
   }
   this.supported.add(source);
  }
  let target = this.records.get(source) as ProjectedRenderShip | undefined;
  if (!target) {
   target = new ProjectedRenderShip();
   this.records.set(source, target);
   knownProjectionKeys.set(target, projectedShipKeys);
  }
  this.sampled.set(source, target);
  if (this.workerOwned) {
   target.id = source.id; target.spec = source.spec; target.pos = source.pos; target.prevPos = source.prevPos;
   target.vel = source.vel; target.facingRad = source.facingRad; target.prevFacingRad = source.prevFacingRad;
   target.angularVelRad = source.angularVelRad; target.hullHp = source.hullHp; target.maxHullHp = source.maxHullHp;
   target.isDead = source.isDead; target.isDocked = source.isDocked; target.isRetreated = source.isRetreated;
   target.isAttachedModule = source.isAttachedModule; target.teamId = source.teamId;
   target.playerTargetId = source.playerTargetId; target.visibilityMask = source.visibilityMask;
   target.visibilityOverflow = source.visibilityOverflow; target.phaseGhosts = source.phaseGhosts;
   target.phaseVisualAlpha = source.phaseVisualAlpha; target.engineBoostLevel = source.engineBoostLevel;
   target.prevEngineBoostLevel = source.prevEngineBoostLevel; target.scorchMarks = source.scorchMarks;
   target.scorchMarkVersion = source.scorchMarkVersion; target.selectedGroupIndex = source.selectedGroupIndex;
   target.fireControlMode = source.fireControlMode;
   const sf = source.surfaceFeedback;
   if (sf) {
    let sfRec = this.surfaceFeedbacks.get(source);
    if (!sfRec) {
     sfRec = { mode: sf.mode, level: sf.level, progress: sf.progress };
     this.surfaceFeedbacks.set(source, sfRec);
     knownProjectionKeys.set(sfRec, projectedSurfaceFeedbackKeys);
    } else {
     sfRec.mode = sf.mode;
     sfRec.level = sf.level;
     sfRec.progress = sf.progress;
    }
    target.surfaceFeedback = sfRec;
   } else {
    target.surfaceFeedback = undefined;
   }
  } else {
   copyFields(target, source, renderShipFields);
  }
  const weapons = updateProjectionArray(target.weapons, source.weapons, this.projectWeaponBound);
  let ranges = target.weaponRanges;
  if (!ranges) {
   ranges = new Map<RenderWeapon, number>();
  } else if (ranges.size !== weapons.length) {
   ranges.clear();
  }
  const rangeModifiers = source.system.readModifierTable?.(rangeModifierReaders);
  let skipRangeUpdate = false;
  if (this.workerOwned && rangeModifiers !== undefined && ranges.size === weapons.length && isImmutableMetadata(source.spec)) {
   const wMods = rangeModifiers.weapons;
   const bPct = wMods?.BALLISTIC?.rangePercent ?? 0;
   const ePct = wMods?.ENERGY?.rangePercent ?? 0;
   const mPct = wMods?.MISSILE?.rangePercent ?? 0;
   const carrierSpec = source.sourceCarrier?.spec;
   const prev = this.rangeStates.get(source);
   if (prev && prev.ecm === source.ecmRangePenalty && prev.carrierSpec === carrierSpec && prev.bPct === bPct && prev.ePct === ePct && prev.mPct === mPct) {
    skipRangeUpdate = true;
   } else if (prev) {
    prev.ecm = source.ecmRangePenalty; prev.carrierSpec = carrierSpec; prev.bPct = bPct; prev.ePct = ePct; prev.mPct = mPct;
   } else {
    this.rangeStates.set(source, { ecm: source.ecmRangePenalty, carrierSpec, bPct, ePct, mPct });
   }
  }
  if (!skipRangeUpdate) {
   for (let i = 0; i < weapons.length; i++) {
    const w = weapons[i];
    if (ranges.size === weapons.length && !ranges.has(w)) {
     ranges.clear();
     for (let j = 0; j < i; j++) ranges.set(weapons[j], combatWeaponRange(source, source.weapons[j].spec, rangeModifiers));
    }
    ranges.set(w, combatWeaponRange(source, source.weapons[i].spec, rangeModifiers));
   }
  }
  let shield = this.records.get(source.shield) as { -readonly [K in keyof ProjectedRenderShip['shield']]: ProjectedRenderShip['shield'][K] } | undefined;
  if (!shield) {
   shield = {} as { -readonly [K in keyof ProjectedRenderShip['shield']]: ProjectedRenderShip['shield'][K] };
   this.records.set(source.shield, shield);
   knownProjectionKeys.set(shield, projectedShieldKeys);
  }
  const srcShield = source.shield;
  shield.voidShield = srcShield.voidShield;
  shield.facingAngleRad = srcShield.facingAngleRad;
  shield.isPhaseEngaged = srcShield.isPhaseEngaged;
  shield.isVisuallyDeployed = srcShield.isVisuallyDeployed;
  shield.phaseCooldownLevel = srcShield.phaseCooldownLevel;
  shield.phaseEffectLevel = srcShield.phaseEffectLevel;
  shield.phaseState = srcShield.phaseState;
  shield.radius = srcShield.radius;
  shield.renderArcRad = srcShield.renderArcRad;
  shield.type = srcShield.type;
  shield.visualAlpha = srcShield.visualAlpha;
  shield.hitSegmentLevels = srcShield.presentationHitSegmentLevels();
  target.shield = shield;

  let flux = this.records.get(source.flux) as { -readonly [K in keyof ProjectedRenderShip['flux']]: ProjectedRenderShip['flux'][K] } | undefined;
  if (!flux) {
   flux = {} as { -readonly [K in keyof ProjectedRenderShip['flux']]: ProjectedRenderShip['flux'][K] };
   this.records.set(source.flux, flux);
   knownProjectionKeys.set(flux, projectedFluxKeys);
  }
  const srcFlux = source.flux;
  flux.fluxPercent = srcFlux.fluxPercent;
  flux.hardFlux = srcFlux.hardFlux;
  flux.hullSize = srcFlux.hullSize;
  flux.isOverloaded = srcFlux.isOverloaded;
  flux.isVenting = srcFlux.isVenting;
  flux.maxFlux = srcFlux.maxFlux;
  flux.overloadTimer = srcFlux.overloadTimer;
  target.flux = flux;

  let armor = this.records.get(source.armor) as { cellWidth: number } | undefined;
  if (!armor) {
   armor = { cellWidth: source.armor.cellWidth };
   this.records.set(source.armor, armor);
   knownProjectionKeys.set(armor, projectedArmorKeys);
  } else {
   armor.cellWidth = source.armor.cellWidth;
  }
  target.armor = armor;

  let engineController = this.records.get(source.engineController) as { flameAccelerating: boolean } | undefined;
  if (!engineController) {
   engineController = { flameAccelerating: source.engineController.flameAccelerating };
   this.records.set(source.engineController, engineController);
   knownProjectionKeys.set(engineController, projectedEngineControllerKeys);
  } else {
   engineController.flameAccelerating = source.engineController.flameAccelerating;
  }
  target.engineController = engineController;

  target.engineStatuses = updateProjectionArray(target.engineStatuses, source.engineStatuses, this.projectEngineStatusBound);
  target.weapons = weapons;
  target.weaponGroups = source.weaponGroups;
  const primarySys = this.system(source.system);
  target.system = primarySys;
  if (this.workerOwned && !source.systems[1] && source.spec.rightClickSystemType === undefined && !Object.hasOwn(source, 'allSystems')) {
   const prevAll = target.allSystems as ProjectedRenderSystem[] | undefined;
   if (Array.isArray(prevAll) && prevAll.length === 1) {
    prevAll[0] = primarySys;
   } else {
    target.allSystems = [primarySys];
   }
  } else {
   target.allSystems = updateProjectionArray(target.allSystems, readShipSystems(source), this.projectSystemBound);
  }
  target.sourceCarrier = source.sourceCarrier ? this.project(source.sourceCarrier) : undefined;
  target.weaponRanges = ranges;
  target.presentationPose = shipPresentationPose(source);
  return target;
 }
}
export { renderWeaponRange, renderPulseOffset, renderWeaponAngle } from '../../render/ShipRenderQueries';
