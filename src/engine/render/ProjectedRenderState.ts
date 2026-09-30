import { Vector2 } from '../math/Vector2';
import type { ShipRenderState, RenderSystem, RenderWeapon } from './ShipRenderState';
import type { shipPresentationPose } from '../visual/ShipPresentation';

/** Display-only query facade. It deliberately does not inherit any simulation class. */
export class ProjectedRenderShip implements ShipRenderState {
 declare surfaceFeedback: ShipRenderState['surfaceFeedback'];
 declare id: ShipRenderState['id'];
 declare spec: ShipRenderState['spec'];
 declare pos: ShipRenderState['pos'];
 declare prevPos: ShipRenderState['prevPos'];
 declare vel: ShipRenderState['vel'];
 declare facingRad: ShipRenderState['facingRad'];
 declare prevFacingRad: ShipRenderState['prevFacingRad'];
 declare angularVelRad: ShipRenderState['angularVelRad'];
 declare hullHp: ShipRenderState['hullHp'];
 declare maxHullHp: ShipRenderState['maxHullHp'];
 declare isDead: ShipRenderState['isDead'];
 declare isDocked: ShipRenderState['isDocked'];
 declare isRetreated: ShipRenderState['isRetreated'];
 declare isAttachedModule: ShipRenderState['isAttachedModule'];
 declare teamId: ShipRenderState['teamId'];
 declare playerTargetId: ShipRenderState['playerTargetId'];
 declare visibilityMask: ShipRenderState['visibilityMask'];
 declare visibilityOverflow: ShipRenderState['visibilityOverflow'];
 declare phaseGhosts: ShipRenderState['phaseGhosts'];
 declare phaseVisualAlpha: ShipRenderState['phaseVisualAlpha'];
 declare engineBoostLevel: ShipRenderState['engineBoostLevel'];
 declare prevEngineBoostLevel: ShipRenderState['prevEngineBoostLevel'];
 declare scorchMarks: ShipRenderState['scorchMarks'];
 declare scorchMarkVersion: ShipRenderState['scorchMarkVersion'];
 declare fireControlMode: ShipRenderState['fireControlMode'];
 declare selectedGroupIndex: ShipRenderState['selectedGroupIndex'];
 declare shield: ShipRenderState['shield'];
 declare flux: ShipRenderState['flux'];
 declare armor: ShipRenderState['armor'];
 declare engineController: ShipRenderState['engineController'];
 declare engineStatuses: ShipRenderState['engineStatuses'];
 declare weapons: ShipRenderState['weapons'];
 declare weaponGroups: ShipRenderState['weaponGroups'];
 declare system: ShipRenderState['system'];
 declare allSystems: ShipRenderState['allSystems'];
 declare sourceCarrier: ShipRenderState['sourceCarrier'];
 declare weaponRanges: Map<RenderWeapon, number>;
 declare presentationPose: ReturnType<typeof shipPresentationPose>;
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
 declare activationSerial: RenderSystem['activationSerial'];
 declare available: RenderSystem['available'];
 declare disabled: RenderSystem['disabled'];
 declare effectLevel: RenderSystem['effectLevel'];
 declare fortressVisualLevel: RenderSystem['fortressVisualLevel'];
 declare isActive: RenderSystem['isActive'];
 declare state: RenderSystem['state'];
 declare teleportVisual: RenderSystem['teleportVisual'];
 declare gravityField: RenderSystem['gravityField'];
 declare gravityManeuver: RenderSystem['gravityManeuver'];
 declare type: RenderSystem['type'];
 declare definition: RenderSystem['definition'];
 declare pulseOffset: number;
}
export class ProjectedRenderWeapon implements RenderWeapon {
 declare gravityTractor: RenderWeapon['gravityTractor'];
 declare gravityDeflection: RenderWeapon['gravityDeflection'];
 declare loadedMissileLevels: RenderWeapon['loadedMissileLevels'];
 declare arcDeg: RenderWeapon['arcDeg'];
 declare baseAngleDeg: RenderWeapon['baseAngleDeg'];
 declare currentAngleRad: RenderWeapon['currentAngleRad'];
 declare currentSpreadDeg: RenderWeapon['currentSpreadDeg'];
 declare glowAlpha: RenderWeapon['glowAlpha'];
 declare isDisabled: RenderWeapon['isDisabled'];
 declare mountType: RenderWeapon['mountType'];
 declare recoil: RenderWeapon['recoil'];
 declare relativePos: RenderWeapon['relativePos'];
 declare slotId: RenderWeapon['slotId'];
 declare spec: RenderWeapon['spec'];
 declare presentationRelativeAngle: number | undefined;
}
