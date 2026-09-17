import { Vector2 } from '../../math/Vector2';
import type { Ship } from '../Ship';
import { isPointInsideShipHull } from './HullGeometry';
import { distanceToDeployedShield } from './ShieldCollisionGeometry';

/** Actual boundary points, not bounding-circle armor or an undeployed full shield. */
export function getShipExplosionContact(ship: Ship, origin: Vector2): { point: Vector2; distance: number; shield: boolean } {
  let point = origin.clone();
  if (!isPointInsideShipHull(ship, origin)) {
    const bounds = ship.spec.bounds;
    let best = Infinity;
    const local = origin.clone().sub(ship.pos).rotate(-ship.facingRad);
    if (bounds && bounds.length >= 3) {
      for (let i = 0; i < bounds.length; i++) {
        const a = new Vector2(...bounds[i]), b = new Vector2(...bounds[(i + 1) % bounds.length]);
        const ab = b.clone().sub(a), length = ab.dot(ab);
        const t = length > 0 ? Math.max(0, Math.min(1, local.clone().sub(a).dot(ab) / length)) : 0;
        const candidate = a.addScaled(ab, t), distance = candidate.distanceTo(local);
        if (distance < best) { best = distance; point = candidate.rotate(ship.facingRad).add(ship.pos); }
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
