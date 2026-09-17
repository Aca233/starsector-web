import { Vector2 } from '../../math/Vector2';
import { nativeGetShieldCenter, type Ship } from '../Ship';

interface ShieldOffsetMemo { x: number; y: number; facing: number; cx: number | undefined; cy: number | undefined; offset: number }
const shieldOffsets = new WeakMap<Ship, ShieldOffsetMemo>();
/** Exact offset length, including world-coordinate rounding. Invalidate on every source
 * scalar; collision responses and same-step motion must not leave a stale extent. */
export function shieldCenterOffset(ship: Ship): number {
  if (ship.getShieldCenter !== nativeGetShieldCenter) return ship.getShieldCenter().distanceTo(ship.pos);
  let memo = shieldOffsets.get(ship);
  const x = ship.pos.x, y = ship.pos.y, facing = ship.facingRad;
  const cx = ship.spec.shieldCenterX, cy = ship.spec.shieldCenterY;
  if (!memo || !Object.is(memo.x, x) || !Object.is(memo.y, y) || !Object.is(memo.facing, facing)
    || !Object.is(memo.cx, cx) || !Object.is(memo.cy, cy)) {
    const offset = ship.getShieldCenter().distanceTo(ship.pos);
    if (memo) Object.assign(memo, { x, y, facing, cx, cy, offset });
    else { memo = { x, y, facing, cx, cy, offset }; shieldOffsets.set(ship, memo); }
  }
  return memo.offset;
}

const EPSILON = 1e-6;

export interface ShieldCircleContact {
  center: Vector2;
  point: Vector2;
  normal: Vector2;
  penetration: number;
}

export interface ShipDirectionalCollisionExtent {
  distance: number;
  point: Vector2;
  surface: 'HULL' | 'SHIELD';
}

export interface ShieldToShieldContact {
  firstCenter: Vector2;
  secondCenter: Vector2;
  firstPoint: Vector2;
  secondPoint: Vector2;
  point: Vector2;
  normal: Vector2;
  penetration: number;
}

export function isShieldCollisionActive(ship: Ship): boolean {
  return ship.shield.isActive
    && ship.shield.currentArcDeg > 5
    && ship.shield.radius > 0
    && ship.shield.type !== 'NONE'
    && ship.shield.type !== 'PHASE';
}

function normalized(direction: Vector2): Vector2 {
  const length = direction.length();
  return length > EPSILON ? direction.clone().scale(1 / length) : new Vector2(1, 0);
}

function getHullDirectionalExtent(ship: Ship, worldDirection: Vector2): number {
  const bounds = ship.spec.bounds;
  if (!bounds || bounds.length < 3) return Math.max(0, ship.spec.collisionRadius);

  const localDirection = worldDirection.clone().rotate(-ship.facingRad);
  let extent = Number.NEGATIVE_INFINITY;
  for (const [x, y] of bounds) {
    extent = Math.max(extent, x * localDirection.x + y * localDirection.y);
  }
  return Number.isFinite(extent) ? Math.max(0, extent) : Math.max(0, ship.spec.collisionRadius);
}

export function getDirectionalHullCollisionExtent(
  ship: Ship,
  direction: Vector2
): ShipDirectionalCollisionExtent {
  const worldDirection = normalized(direction);
  const distance = getHullDirectionalExtent(ship, worldDirection);
  return {
    distance,
    point: ship.pos.clone().addScaled(worldDirection, distance),
    surface: 'HULL'
  };
}

export function getDirectionalShieldCollisionExtent(
  ship: Ship,
  direction: Vector2
): ShipDirectionalCollisionExtent | null {
  if (!isShieldCollisionActive(ship)) return null;

  const worldDirection = normalized(direction);
  const shieldCenter = ship.getShieldCenter();
  const shieldPoint = shieldCenter.clone().addScaled(worldDirection, ship.shield.radius);
  if (!ship.isShieldPointBlocked(shieldPoint)) return null;

  const shieldOffset = shieldCenter.clone().sub(ship.pos);
  const distance = shieldOffset.dot(worldDirection) + ship.shield.radius;
  if (distance < 0) return null;
  return {
    distance,
    point: shieldPoint,
    surface: 'SHIELD'
  };
}

/**
 * Returns the outer physical extent of the union of the hull outline and the
 * currently deployed shield arc along one world-space direction.
 */
export function getDirectionalShipCollisionExtent(
  ship: Ship,
  direction: Vector2
): ShipDirectionalCollisionExtent {
  const hull = getDirectionalHullCollisionExtent(ship, direction);
  const shield = getDirectionalShieldCollisionExtent(ship, direction);
  if (shield && shield.distance >= hull.distance - EPSILON) return shield;
  return hull;
}

/**
 * Exact shield-circle vs shield-circle contact. The collision normal is based
 * on the real, offset shield centers rather than the ship-center line. A
 * contact only exists when both currently deployed arcs cover their own
 * opposing surface point.
 */
export function getShieldToShieldContact(first: Ship, second: Ship): ShieldToShieldContact | null {
  if (!isShieldCollisionActive(first) || !isShieldCollisionActive(second)) return null;

  const firstCenter = first.getShieldCenter();
  const secondCenter = second.getShieldCenter();
  const centerDelta = secondCenter.clone().sub(firstCenter);
  const centerDistance = centerDelta.length();
  const combinedRadius = first.shield.radius + second.shield.radius;
  const penetration = combinedRadius - centerDistance;
  if (penetration <= 0) return null;

  let normal: Vector2;
  if (centerDistance > EPSILON) {
    normal = centerDelta.scale(1 / centerDistance);
  } else {
    const shipDelta = second.pos.clone().sub(first.pos);
    normal = normalized(shipDelta.length() > EPSILON ? shipDelta : Vector2.fromAngle(first.facingRad));
  }

  let firstPoint = firstCenter.clone().addScaled(normal, first.shield.radius);
  let secondPoint = secondCenter.clone().addScaled(normal, -second.shield.radius);
  let point: Vector2 | null = null;

  if (first.isShieldPointBlocked(firstPoint) && second.isShieldPointBlocked(secondPoint)) {
    point = firstPoint.clone().add(secondPoint).scale(0.5);
  } else if (centerDistance > EPSILON && centerDistance >= Math.abs(first.shield.radius - second.shield.radius) - EPSILON) {
    // The shortest center-to-center contact can lie outside a narrow shield arc
    // even while the two visible arc curves intersect at a flank. Check the
    // actual circle-circle intersection points before declaring the shields
    // non-colliding.
    const along = (
      first.shield.radius * first.shield.radius
      - second.shield.radius * second.shield.radius
      + centerDistance * centerDistance
    ) / (2 * centerDistance);
    const heightSq = first.shield.radius * first.shield.radius - along * along;
    if (heightSq >= -EPSILON) {
      const base = firstCenter.clone().addScaled(normal, along);
      const tangent = new Vector2(-normal.y, normal.x);
      const height = Math.sqrt(Math.max(0, heightSq));
      const intersections = height <= EPSILON
        ? [base]
        : [
            base.clone().addScaled(tangent, height),
            base.clone().addScaled(tangent, -height)
          ];
      const valid = intersections
        .filter((candidate) => first.isShieldPointBlocked(candidate) && second.isShieldPointBlocked(candidate))
        .sort((a, b) => a.x - b.x || a.y - b.y);
      if (valid[0]) {
        point = valid[0].clone();
        firstPoint = valid[0].clone();
        secondPoint = valid[0].clone();
      }
    }
  }

  if (!point) return null;
  return {
    firstCenter,
    secondCenter,
    firstPoint,
    secondPoint,
    point,
    normal,
    penetration
  };
}

/**
 * Exact circle-vs-shield-surface overlap for physical entities such as
 * asteroids. The returned normal points out from the shield center toward the
 * colliding circle center.
 */
export function getShieldCircleContact(
  ship: Ship,
  circleCenter: Vector2,
  circleRadius: number
): ShieldCircleContact | null {
  if (!isShieldCollisionActive(ship)) return null;

  const center = ship.getShieldCenter();
  const radial = circleCenter.clone().sub(center);
  const distance = radial.length();
  const penetration = ship.shield.radius + Math.max(0, circleRadius) - distance;
  if (penetration <= 0) return null;

  const fallbackFacing = ship.shield.type === 'FRONT' ? ship.facingRad : ship.shield.facingAngleRad;
  const normal = distance > EPSILON ? radial.scale(1 / distance) : Vector2.fromAngle(fallbackFacing);
  const point = center.clone().addScaled(normal, ship.shield.radius);
  if (!ship.isShieldPointBlocked(point)) return null;

  return { center, point, normal, penetration };
}

/** Distance to the actual deployed shield arc, not its full-circle broadphase.
 * Points outside the angular span may still be near a real arc endpoint.
 * With a finite limit, a proven out-of-range result may be Infinity instead of the exact distance. */
export function distanceToDeployedShield(ship: Ship, worldPoint: Vector2, limit = Infinity): number {
  if (!isShieldCollisionActive(ship)) return Number.POSITIVE_INFINITY;
  const center = ship.getShieldCenter();
  const radial = worldPoint.clone().sub(center);
  const radius = ship.shield.radius;
  const facing = ship.shield.type === 'FRONT' ? ship.facingRad : ship.shield.facingAngleRad;
  const halfArc = Math.min(360, ship.shield.currentArcDeg) * Math.PI / 360;
  // Optional distance-limited query: an enclosing square can prove that the
  // exact arc is farther than limit. Near/exceptional cases use the original math.
  const scale = Math.max(1, Math.abs(worldPoint.x), Math.abs(worldPoint.y), Math.abs(center.x), Math.abs(center.y), radius, limit);
  if (limit >= 0 && radius >= 0 && scale <= 1e100 && Number.isFinite(facing) && Number.isFinite(halfArc)) {
    const reach = radius + limit + 1e-7 * scale;
    if (Math.abs(radial.x) > reach || Math.abs(radial.y) > reach) return Infinity;
  }
  const angle = Math.atan2(radial.y, radial.x);
  const diff = Math.atan2(Math.sin(angle - facing), Math.cos(angle - facing));
  if (Math.abs(diff) <= halfArc) return Math.abs(radial.length() - radius);
  let distance = Number.POSITIVE_INFINITY;
  for (const endAngle of [facing - halfArc, facing + halfArc]) {
    distance = Math.min(distance, Math.hypot(radial.x - Math.cos(endAngle) * radius,
      radial.y - Math.sin(endAngle) * radius));
  }
  return distance;
}
