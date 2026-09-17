import { Vector2 } from '../../math/Vector2';
import { indexedNearestBoundary } from '../../math/PolygonQueryIndex';
import { isImmutableMetadata } from '../../extensions/Immutable';
import type { Ship } from '../Ship';
import { isPointInsideShipHull } from './HullGeometry';
import { distanceToDeployedShield } from './ShieldCollisionGeometry';

const nativeClone = Vector2.prototype.clone, nativeSub = Vector2.prototype.sub;
const nativeRotate = Vector2.prototype.rotate, nativeAdd = Vector2.prototype.add;

/** The indexed path transforms only the winning point. Pose accessors may have
 * side effects on each legacy improvement, so keep their original ordered path. */
function hasDataPose(ship: Ship): boolean {
  const pos = Object.getOwnPropertyDescriptor(ship, 'pos')?.value;
  return typeof Object.getOwnPropertyDescriptor(ship, 'facingRad')?.value === 'number'
    && pos !== null && typeof pos === 'object'
    && typeof Object.getOwnPropertyDescriptor(pos, 'x')?.value === 'number'
    && typeof Object.getOwnPropertyDescriptor(pos, 'y')?.value === 'number';
}

/** Actual boundary points, not bounding-circle armor or an undeployed full shield. */
export function getShipExplosionContact(ship: Ship, origin: Vector2): { point: Vector2; distance: number; shield: boolean } {
  let point = origin.clone();
  if (!isPointInsideShipHull(ship, origin)) {
    const bounds = ship.spec.bounds;
    let best = Infinity;
    const native = origin.clone === nativeClone && Vector2.prototype.sub === nativeSub
      && Vector2.prototype.rotate === nativeRotate && Vector2.prototype.add === nativeAdd;
    const local = origin.clone().sub(ship.pos).rotate(-ship.facingRad);
    if (bounds && bounds.length >= 3) {
      const nearest = native && isImmutableMetadata(bounds) && hasDataPose(ship) && Vector2.prototype.sub === nativeSub
        && Vector2.prototype.rotate === nativeRotate && Vector2.prototype.add === nativeAdd
        ? indexedNearestBoundary(local, bounds) : undefined;
      if (nearest) point = new Vector2(nearest.x, nearest.y).rotate(ship.facingRad).add(ship.pos);
      else for (let i = 0; i < bounds.length; i++) {
        const a = bounds[i], b = bounds[(i + 1) % bounds.length];
        const dx = b[0] - a[0], dy = b[1] - a[1], length = dx * dx + dy * dy;
        const t = length > 0 ? Math.max(0, Math.min(1, ((local.x - a[0]) * dx + (local.y - a[1]) * dy) / length)) : 0;
        const x = a[0] + dx * t, y = a[1] + dy * t, distance = Math.hypot(x - local.x, y - local.y);
        // Keep the original arithmetic and strict tie order; allocate only on improvement.
        if (distance < best) { best = distance; point = new Vector2(x, y).rotate(ship.facingRad).add(ship.pos); }
      }
    } else point = ship.pos.clone().addScaled(origin.clone().sub(ship.pos).normalize(), ship.spec.collisionRadius);
  }
  const hullDistance = point.distanceTo(origin), shieldDistance = distanceToDeployedShield(ship, origin);
  if (shieldDistance > hullDistance || !Number.isFinite(shieldDistance)) return { point, distance: hullDistance, shield: false };
  const center = ship.getShieldCenter(), radial = origin.clone().sub(center);
  const facing = ship.shield.type === 'FRONT' ? ship.facingRad : ship.shield.facingAngleRad;
  const half = Math.min(360, ship.shield.currentArcDeg) * Math.PI / 360;
  const delta = radial.heading() - facing;
  const angle = facing + Math.max(-half, Math.min(half, Math.atan2(Math.sin(delta), Math.cos(delta))));
  point = center.add(Vector2.fromAngle(angle, ship.shield.radius));
  return { point, distance: shieldDistance, shield: true };
}
