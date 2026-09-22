// Opt-in authority projection and read-only compatibility queries. No projected class inherits simulation behavior.
import { RenderWeaponDictionary } from './RenderWeaponDictionary';
import { Ship } from '../../simulation/Ship';
import { ShipSystem } from '../../simulation/ShipSystem';
import { Vector2 } from '../../math/Vector2';
import { combatWeaponRange } from '../../simulation/WeaponRange';
import { hasOnlyNativePhaseReaders } from '../../extensions/NativePhaseReaders';
import { hasOnlyNativeRangeModifiers } from '../../extensions/HullMods';
import { pulsePusherOffset } from '../../extensions/ship-systems/PulseDrive';
import { shipPresentationPose } from '../../visual/ShipPresentation';
import type { ShipRenderState, RenderSystem, RenderWeapon } from '../../render/ShipRenderState';
import { weaponPresentationAngle } from '../../visual/WeaponPresentation';
import type { WeaponMount } from '../../simulation/Weapon';

/** Display-only query facade. It deliberately does not inherit any simulation class. */
export class ProjectedRenderShip implements ShipRenderState {
 declare readonly id: ShipRenderState['id'];
 declare readonly spec: ShipRenderState['spec'];
 declare readonly pos: ShipRenderState['pos'];
 declare readonly prevPos: ShipRenderState['prevPos'];
 declare readonly vel: ShipRenderState['vel'];
 declare readonly facingRad: ShipRenderState['facingRad'];
 declare readonly prevFacingRad: ShipRenderState['prevFacingRad'];
 declare readonly angularVelRad: ShipRenderState['angularVelRad'];
 declare readonly hullHp: ShipRenderState['hullHp'];
 declare readonly isDead: ShipRenderState['isDead'];
 declare readonly isDocked: ShipRenderState['isDocked'];
 declare readonly isRetreated: ShipRenderState['isRetreated'];
 declare readonly isAttachedModule: ShipRenderState['isAttachedModule'];
 declare readonly teamId: ShipRenderState['teamId'];
 declare readonly playerTargetId: ShipRenderState['playerTargetId'];
 declare readonly visibilityMask: ShipRenderState['visibilityMask'];
 declare readonly visibilityOverflow: ShipRenderState['visibilityOverflow'];
 declare readonly phaseGhosts: ShipRenderState['phaseGhosts'];
 declare readonly phaseVisualAlpha: ShipRenderState['phaseVisualAlpha'];
 declare readonly engineBoostLevel: ShipRenderState['engineBoostLevel'];
 declare readonly prevEngineBoostLevel: ShipRenderState['prevEngineBoostLevel'];
 declare readonly scorchMarks: ShipRenderState['scorchMarks'];
 declare readonly scorchMarkVersion: ShipRenderState['scorchMarkVersion'];
 declare readonly selectedGroupIndex: ShipRenderState['selectedGroupIndex'];
 declare readonly shield: ShipRenderState['shield'];
 declare readonly flux: ShipRenderState['flux'];
 declare readonly armor: ShipRenderState['armor'];
 declare readonly engineController: ShipRenderState['engineController'];
 declare readonly engineStatuses: ShipRenderState['engineStatuses'];
 declare readonly weapons: ShipRenderState['weapons'];
 declare readonly weaponGroups: ShipRenderState['weaponGroups'];
 declare readonly system: ShipRenderState['system'];
 declare readonly allSystems: ShipRenderState['allSystems'];
 declare readonly sourceCarrier: ShipRenderState['sourceCarrier'];
 declare readonly weaponRanges: Map<RenderWeapon, number>;
 declare readonly presentationPose: ReturnType<typeof shipPresentationPose>;
 interpolatedPos(alpha: number): Vector2 {
  if (this.presentationPose) return this.presentationPose.pos.clone();
  return this.prevPos ? Vector2.lerp(this.prevPos, this.pos, alpha) : this.pos.clone();
 }
 interpolatedFacing(alpha: number): number {
  if (this.presentationPose) return this.presentationPose.facing;
  if (this.prevFacingRad === undefined) return this.facingRad;
  let angle = this.facingRad - this.prevFacingRad;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return this.prevFacingRad + angle * alpha;
 }
 getShieldCenter(pos: Vector2 = this.pos, facing: number = this.facingRad): Vector2 {
  const x = this.spec.shieldCenterX || 0, y = this.spec.shieldCenterY || 0;
  if (x === 0 && y === 0) return pos.clone();
  const cos = Math.cos(facing), sin = Math.sin(facing);
  return new Vector2(pos.x + (x * cos - y * sin), pos.y + (x * sin + y * cos));
 }
 isVisibleTo(side: number | boolean): boolean {
  const team = typeof side === 'boolean' ? (side ? 0 : 1) : side;
  return this.teamId === team || (team < 31 ? !!(this.visibilityMask & (1 << team)) : this.visibilityOverflow === '*' || this.visibilityOverflow.includes('|' + team + '|'));
 }
}
export class ProjectedRenderSystem implements RenderSystem {
 declare readonly activationSerial: RenderSystem['activationSerial'];
 declare readonly available: RenderSystem['available'];
 declare readonly disabled: RenderSystem['disabled'];
 declare readonly effectLevel: RenderSystem['effectLevel'];
 declare readonly fortressVisualLevel: RenderSystem['fortressVisualLevel'];
 declare readonly isActive: RenderSystem['isActive'];
 declare readonly state: RenderSystem['state'];
 declare readonly teleportVisual: RenderSystem['teleportVisual'];
 declare readonly type: RenderSystem['type'];
 declare readonly definition: RenderSystem['definition'];
 declare readonly pulseOffset: number;
}
export class ProjectedRenderWeapon implements RenderWeapon {
 declare readonly arcDeg: RenderWeapon['arcDeg'];
 declare readonly baseAngleDeg: RenderWeapon['baseAngleDeg'];
 declare readonly currentAngleRad: RenderWeapon['currentAngleRad'];
 declare readonly currentSpreadDeg: RenderWeapon['currentSpreadDeg'];
 declare readonly glowAlpha: RenderWeapon['glowAlpha'];
 declare readonly isDisabled: RenderWeapon['isDisabled'];
 declare readonly mountType: RenderWeapon['mountType'];
 declare readonly recoil: RenderWeapon['recoil'];
 declare readonly relativePos: RenderWeapon['relativePos'];
 declare readonly slotId: RenderWeapon['slotId'];
 declare readonly spec: RenderWeapon['spec'];
 declare readonly presentationRelativeAngle: number | undefined;
}
const shipFields = ["id","spec","pos","prevPos","vel","facingRad","prevFacingRad","angularVelRad","hullHp","isDead","isDocked","isRetreated","isAttachedModule","teamId","playerTargetId","visibilityMask","visibilityOverflow","phaseGhosts","phaseVisualAlpha","engineBoostLevel","prevEngineBoostLevel","scorchMarks","scorchMarkVersion","selectedGroupIndex"] as const satisfies readonly (keyof Ship)[];
const shieldFields = ["facingAngleRad","isPhaseEngaged","isVisuallyDeployed","phaseCooldownLevel","phaseEffectLevel","phaseState","radius","renderArcRad","type","visualAlpha"] as const;
const fluxFields = ["fluxPercent","hardFlux","hullSize","isOverloaded","isVenting","maxFlux","overloadTimer"] as const;
const systemFields = ["activationSerial","available","disabled","effectLevel","fortressVisualLevel","isActive","state","teleportVisual","type"] as const;
const engineStatusFields = ["prevThrust","currentThrust","prevSpread","spread"] as const;
const weaponFields = ["arcDeg","baseAngleDeg","currentAngleRad","currentSpreadDeg","glowAlpha","isDisabled","mountType","recoil","relativePos","slotId","spec"] as const;
const nativeQueries = ['interpolatedPos', 'interpolatedFacing', 'getShieldCenter', 'isVisibleTo'] as const;
const queries = nativeQueries.map(key => Ship.prototype[key]);
const nativeRangeReader = ShipSystem.prototype.getWeaponRangePercent;

/** Per-encoder identities survive ticks, but field values are sampled anew on every
 * completed authority phase. No AI/weapon controller/armor-cell graphs are walked.
 * Unrecognized query behavior uses the original compatibility bridge instead. */
export class RenderShipProjection {
 private readonly records = new WeakMap<object, object>();
 private readonly weaponDictionary = new RenderWeaponDictionary();
 private readonly sampled = new Map<Ship, Ship | ProjectedRenderShip>();
 begin(): void { this.sampled.clear(); this.weaponDictionary.begin(); }
 finish(): void { this.weaponDictionary.finish(); }
 /** Fall back for the WHOLE frame: a legacy callback can follow owner/carrier
  * references and must never see a partly projected simulation graph. */
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
 project(source: Ship): Ship | ProjectedRenderShip {
  const sampled = this.sampled.get(source);
  if (sampled) return sampled;
  if (!this.supportsShip(source)) {
   this.sampled.set(source, source); return source;
  }
  let target = this.records.get(source) as ProjectedRenderShip | undefined;
  if (!target) { target = new ProjectedRenderShip(); this.records.set(source, target); }
  this.sampled.set(source, target);
  const fields = Object.fromEntries(shipFields.map(key => [key, source[key]]));
  const ranges = target.weaponRanges ?? new Map<RenderWeapon, number>(); ranges.clear();
  const weapons = source.weapons.map(mount => this.weapon(mount));
  for (let i = 0; i < weapons.length; i++) ranges.set(weapons[i], combatWeaponRange(source, source.weapons[i].spec));
  Object.assign(target, fields, {
   shield: Object.assign(this.select(source.shield, shieldFields), { hitSegmentLevels: source.shield.presentationHitSegmentLevels() }), flux: this.select(source.flux, fluxFields),
   armor: this.select(source.armor, ['cellWidth']), engineController: this.select(source.engineController, ['flameAccelerating']),
   engineStatuses: source.engineStatuses.map(status => this.select(status, engineStatusFields)), weapons,
   weaponGroups: source.weaponGroups, system: this.system(source.system), allSystems: source.allSystems.map(system => this.system(system)),
   sourceCarrier: source.sourceCarrier, weaponRanges: ranges, presentationPose: shipPresentationPose(source),
  });
  return target;
 }
}
export function renderWeaponRange(ship: ShipRenderState, mount: RenderWeapon): number {
 if (ship instanceof ProjectedRenderShip) {
  if (!ship.weaponRanges.has(mount)) throw new Error('Missing projected weapon range');
  return ship.weaponRanges.get(mount)!;
 }
 if (ship instanceof Ship) {
  // Inline mounts retain their full authority spec; a narrowed display contract
  // must not be asserted back to a simulation WeaponSpec.
  const source = ship.weapons.find(candidate => candidate === mount);
  if (source) return combatWeaponRange(ship, source.spec);
 }
 throw new Error('Unknown ship presentation');
}
export function renderPulseOffset(system: RenderSystem): number {
 if (system instanceof ProjectedRenderSystem) return system.pulseOffset;
 if (system instanceof ShipSystem) return pulsePusherOffset(system);
 throw new Error('Unknown system presentation');
}

export function renderWeaponAngle(mount: RenderWeapon, facing: number): number | undefined {
 if (mount instanceof ProjectedRenderWeapon) return mount.presentationRelativeAngle === undefined ? undefined : facing + mount.presentationRelativeAngle;
 return weaponPresentationAngle(mount, facing);
}
