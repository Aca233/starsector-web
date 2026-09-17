import { signedAngle } from '../../../math/Angles';
import type { Ship } from '../../Ship';
import type { WeaponMount } from '../../Weapon';
/** Native WeaponGroup.weaponsThatWouldBeFiredAtPoint: manual trigger is not an AI aim gate. */
export function manualFireSlots(ship: Ship, mounts: WeaponMount[], activeSlots: ReadonlySet<string>, alternatingSlot?: string): Set<string> {
  if (alternatingSlot !== undefined) return new Set([alternatingSlot]);
  const result = new Set<string>();
  let closest: WeaponMount | undefined, closestDistance = Infinity;
  for (const mount of mounts) {
    if (!activeSlots.has(mount.slotId)) continue;
    const position = mount.relativePos.clone().rotate(ship.facingRad).add(ship.pos);
    const target = Math.atan2(ship.aimTargetWorld.y-position.y,ship.aimTargetWorld.x-position.x);
    const distance = Math.max(0, Math.abs(signedAngle(target-ship.facingRad-mount.baseAngleDeg*Math.PI/180))-mount.arcDeg*Math.PI/360);
    if (distance <= 1e-9 || mount.mountType === 'HARDPOINT' || mount.arcDeg <= 10 || mount.spec.alwaysFire) result.add(mount.slotId);
    if (distance < closestDistance) { closest = mount; closestDistance = distance; }
  }
  if (!result.size && closest) result.add(closest.slotId);
  return result;
}
/** Tracker uses a hull-relative angle, finite motor speed and never crosses the forbidden arc. */
export function advanceTurretAim(current: number, base: number, target: number, arcDeg: number, turnRate: number, pivotRate: number, dt: number): number {
  const halfArc = Math.min(Math.PI,arcDeg*Math.PI/360);
  const unlimited = arcDeg >= 360;
  const clamp = (v:number) => unlimited ? signedAngle(v) : Math.max(-halfArc,Math.min(halfArc,signedAngle(v)));
  const relative = clamp(current-base), desired = clamp(target-base);
  const error = unlimited ? signedAngle(desired-relative) : desired-relative;
  // Native tracker compensates a fast hull turn against the turret motor (5 degrees/sec margin).
  const opposedPivotRate = Math.sign(error) !== Math.sign(pivotRate) && turnRate > 0 ? Math.abs(pivotRate) : 0;
  const effectiveRate = Math.max(turnRate, opposedPivotRate-5*Math.PI/180);
  return base + relative + Math.sign(error)*Math.min(Math.abs(error),Math.max(0,effectiveRate)*dt);
}
