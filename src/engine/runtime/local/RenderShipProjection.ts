import { ProjectedRenderShip, ProjectedRenderSystem, ProjectedRenderWeapon } from '../../render/ProjectedRenderState';
export { ProjectedRenderShip, ProjectedRenderSystem, ProjectedRenderWeapon } from '../../render/ProjectedRenderState';
// Authority-only explicit projection. No projected class inherits simulation behavior.
import { RenderWeaponDictionary } from './RenderWeaponDictionary';
import { Ship } from '../../simulation/Ship';
import { ShipSystem } from '../../simulation/ShipSystem';
import { combatWeaponRange } from '../../simulation/WeaponRange';
import { hasOnlyNativePhaseReaders } from '../../extensions/NativePhaseReaders';
import { hasOnlyNativeRangeModifiers } from '../../extensions/HullMods';
import { pulsePusherOffset } from '../../extensions/ship-systems/PulseDrive';
import { shipPresentationPose } from '../../visual/ShipPresentation';
import type { RenderWeapon } from '../../render/ShipRenderState';
import { weaponPresentationAngle } from '../../visual/WeaponPresentation';
import type { WeaponMount } from '../../simulation/Weapon';

export const renderShipFields = ["id","spec","pos","prevPos","vel","facingRad","prevFacingRad","angularVelRad","hullHp","isDead","isDocked","isRetreated","isAttachedModule","teamId","playerTargetId","visibilityMask","visibilityOverflow","phaseGhosts","phaseVisualAlpha","engineBoostLevel","prevEngineBoostLevel","scorchMarks","scorchMarkVersion","selectedGroupIndex"] as const satisfies readonly (keyof Ship)[];
const shieldFields = ["facingAngleRad","isPhaseEngaged","isVisuallyDeployed","phaseCooldownLevel","phaseEffectLevel","phaseState","radius","renderArcRad","type","visualAlpha"] as const;
const fluxFields = ["fluxPercent","hardFlux","hullSize","isOverloaded","isVenting","maxFlux","overloadTimer"] as const;
const systemFields = ["activationSerial","available","disabled","effectLevel","fortressVisualLevel","isActive","state","teleportVisual","type"] as const;
export const renderEngineStatusFields = ["prevThrust","currentThrust","prevSpread","spread"] as const;
const weaponFields = ["arcDeg","baseAngleDeg","currentAngleRad","currentSpreadDeg","glowAlpha","isDisabled","mountType","recoil","relativePos","slotId","spec"] as const;
const nativeQueries = ['interpolatedPos', 'interpolatedFacing', 'getShieldCenter', 'isVisibleTo'] as const;
const queries = nativeQueries.map(key => Ship.prototype[key]);
const nativeRangeReader = ShipSystem.prototype.getWeaponRangePercent;

/** Per-encoder identities survive ticks, but field values are sampled anew on every
 * completed authority phase. No AI/weapon controller/armor-cell graphs are walked.
 * Unrecognized query behavior requires an explicit authority-side adapter. */
export class RenderShipProjection {
 private readonly records = new WeakMap<object, object>();
 private readonly weaponDictionary = new RenderWeaponDictionary();
 private readonly sampled = new Map<Ship, ProjectedRenderShip>();
 begin(): void { this.sampled.clear(); this.weaponDictionary.begin(); }
 finish(): void { this.weaponDictionary.finish(); }
 /** Check the WHOLE frame before capture; never mix a simulation object into
  * a partially projected owner/carrier graph. */
 supports(roots: readonly Ship[]): boolean {
  const pending = [...roots], seen = new Set<Ship>();
  while (pending.length) {
   const source = pending.pop()!;
   if (seen.has(source)) continue;
   seen.add(source);
   if (!this.supportsShip(source)) return false;
   if (source.sourceCarrier) pending.push(source.sourceCarrier);
  }
  return true;
 }
 private supportsShip(source: Ship): boolean {
  return hasOnlyNativePhaseReaders(source.externalPhaseEffects) && !(nativeQueries.some((key, i) => source[key] !== queries[i]) || !hasOnlyNativeRangeModifiers(source.spec)
   || (source.sourceCarrier && !hasOnlyNativeRangeModifiers(source.sourceCarrier.spec))
   || source.allSystems.some(system => !system.hasNativeStats || system.getWeaponRangePercent !== nativeRangeReader));
 }
 private select<T extends object, K extends keyof T>(source: T, keys: readonly K[]): Pick<T, K> {
  let target = this.records.get(source) as Pick<T, K> | undefined;
  if (!target) { target = Object.create(null) as Pick<T, K>; this.records.set(source, target); }
  for (const key of keys) target[key] = source[key];
  return target;
 }
 private weapon(source: WeaponMount): ProjectedRenderWeapon {
  let target = this.records.get(source) as ProjectedRenderWeapon | undefined;
  if (!target) { target = new ProjectedRenderWeapon(); this.records.set(source, target); }
  Object.assign(target, Object.fromEntries(weaponFields.map(key => [key, source[key]])), { spec: this.weaponDictionary.project(source.spec), presentationRelativeAngle: weaponPresentationAngle(source, 0) });
  return target;
 }
 private system(source: ShipSystem): ProjectedRenderSystem {
  let target = this.records.get(source) as ProjectedRenderSystem | undefined;
  if (!target) { target = new ProjectedRenderSystem(); this.records.set(source, target); }
  const values = Object.fromEntries(systemFields.map(key => [key, source[key]]));
  Object.assign(target, values, { definition: this.select(source.definition, ['visuals']), pulseOffset: pulsePusherOffset(source) });
  return target;
 }
 project(source: Ship): ProjectedRenderShip {
  const sampled = this.sampled.get(source);
  if (sampled) return sampled;
  if (!this.supportsShip(source)) {
   throw new Error('Display projection unsupported; an authority-side presentation adapter is required');
  }
  let target = this.records.get(source) as ProjectedRenderShip | undefined;
  if (!target) { target = new ProjectedRenderShip(); this.records.set(source, target); }
  this.sampled.set(source, target);
  const fields = Object.fromEntries(renderShipFields.map(key => [key, source[key]]));
  const ranges = target.weaponRanges ?? new Map<RenderWeapon, number>(); ranges.clear();
  const weapons = source.weapons.map(mount => this.weapon(mount));
  for (let i = 0; i < weapons.length; i++) ranges.set(weapons[i], combatWeaponRange(source, source.weapons[i].spec));
  Object.assign(target, fields, {
   shield: Object.assign(this.select(source.shield, shieldFields), { hitSegmentLevels: source.shield.presentationHitSegmentLevels() }), flux: this.select(source.flux, fluxFields),
   armor: this.select(source.armor, ['cellWidth']), engineController: this.select(source.engineController, ['flameAccelerating']),
   engineStatuses: source.engineStatuses.map(status => this.select(status, renderEngineStatusFields)), weapons,
   weaponGroups: source.weaponGroups, system: this.system(source.system), allSystems: source.allSystems.map(system => this.system(system)),
   sourceCarrier: source.sourceCarrier ? this.project(source.sourceCarrier) : undefined, weaponRanges: ranges, presentationPose: shipPresentationPose(source),
  });
  return target;
 }
}
export { renderWeaponRange, renderPulseOffset, renderWeaponAngle } from '../../render/ShipRenderQueries';
