import { Vector2 } from '../math/Vector2';
import { segmentPolygonEntry, isPointInPolygon, segmentCircleEntry } from '../math/Geometry';
import type { Ship } from '../simulation/Ship';
import type { WeaponMount } from '../simulation/Weapon';

interface HullBounds { minX: number; minY: number; maxX: number; maxY: number; extent: number }
const immutableHullBounds = new WeakMap<[number, number][], HullBounds>();

/** Cache only deeply frozen authored geometry. Mutable/refit bounds are read afresh. */
function hullBounds(points: [number, number][]): HullBounds {
  const cached = immutableHullBounds.get(points);
  if (cached) return cached;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let immutable = Object.isFrozen(points);
  for (const point of points) {
    minX = Math.min(minX, point[0]); minY = Math.min(minY, point[1]);
    maxX = Math.max(maxX, point[0]); maxY = Math.max(maxY, point[1]);
    immutable = immutable && Object.isFrozen(point);
  }
  const bounds = { minX, minY, maxX, maxY,
    extent: Math.max(Math.abs(minX), Math.abs(maxX)) + Math.max(Math.abs(minY), Math.abs(maxY)) };
  if (immutable) immutableHullBounds.set(points, bounds);
  return bounds;
}

function mayCrossHull(start: Vector2, end: Vector2, bounds: HullBounds): boolean {
  // Inclusive, padded rejection only; all possible contacts retain the old narrow phase.
  // Do not use collisionRadius: authored vertices can extend beyond it.
  const pad = 1e-7 * Math.max(1, Math.abs(start.x), Math.abs(start.y), Math.abs(end.x), Math.abs(end.y),
    Math.abs(bounds.minX), Math.abs(bounds.minY), Math.abs(bounds.maxX), Math.abs(bounds.maxY));
  return !(Math.max(start.x, end.x) < bounds.minX-pad || Math.min(start.x, end.x) > bounds.maxX+pad
    || Math.max(start.y, end.y) < bounds.minY-pad || Math.min(start.y, end.y) > bounds.maxY+pad);
}

/** Every rotated authored hull fits this box. Reject far world-space segments
 * before allocating/rotating local endpoints; collisionRadius is not a hull bound. */
function mayReachHull(ship: Ship, start: Vector2, end: Vector2, bounds: HullBounds): boolean {
  const pad = 1e-7 * Math.max(1, Math.abs(start.x), Math.abs(start.y), Math.abs(end.x), Math.abs(end.y),
    Math.abs(ship.pos.x), Math.abs(ship.pos.y), bounds.extent);
  const extent = bounds.extent + pad;
  return !(Math.max(start.x, end.x) < ship.pos.x - extent || Math.min(start.x, end.x) > ship.pos.x + extent
    || Math.max(start.y, end.y) < ship.pos.y - extent || Math.min(start.y, end.y) > ship.pos.y + extent);
}

/** Smallest nonnegative solution to |relativePosition + relativeVelocity*t| = speed*t.
 * Uses a stable quadratic and handles equal-speed/linear and unreachable cases explicitly. */
export function interceptTime(position: Vector2, velocity: Vector2, speed: number): number | null {
  return interceptTimeComponents(position.x, position.y, velocity.x, velocity.y, speed);
}

/** Same stable interception equation for callers already holding scalar components. */
export function interceptTimeComponents(px: number, py: number, vx: number, vy: number, speed: number): number | null {
  if (!(speed > 0) || !Number.isFinite(speed)) return null;
  const c = px * px + py * py;
  if (c < 1e-12) return 0;
  const velocitySquared = vx * vx + vy * vy;
  const a = velocitySquared - speed * speed;
  const b = 2 * (px * vx + py * vy);
  if (Math.abs(a) <= 1e-10 * Math.max(speed * speed, velocitySquared, 1)) {
    return b < -1e-10 ? -c / b : null;
  }
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const q = -.5 * (b + (b >= 0 ? 1 : -1) * Math.sqrt(discriminant));
  const first = q / a, second = q === 0 ? Infinity : c / q;
  const firstValid = first >= 0 && Number.isFinite(first);
  const secondValid = second >= 0 && Number.isFinite(second);
  return firstValid ? secondValid ? Math.min(first, second) : first : secondValid ? second : null;
}

interface MuzzleRotations {
  shipFacing: number; shipCos: number; shipSin: number;
  barrelAngle: number; barrelCos: number; barrelSin: number;
}
const muzzleRotations = new WeakMap<WeaponMount, MuzzleRotations>();

/** Same next-barrel muzzle used by ShipWeaponControlSystem.fireWeapon (before spread). */
export function weaponMuzzle(ship: Ship, mount: WeaponMount, out = new Vector2()): Vector2 {
  const primary = mount.mountType === 'HARDPOINT' ? mount.spec.hardpointOffsets : mount.spec.turretOffsets;
  const secondary = mount.mountType === 'HARDPOINT' ? mount.spec.turretOffsets : mount.spec.hardpointOffsets;
  const offsets = primary && primary.length >= 2 ? primary : secondary;
  let rotation = muzzleRotations.get(mount);
  // Reuse only pure trigonometric results, never a position or mutable barrel offset.
  // Object.is distinguishes signed zero and handles NaN exactly as Math.sin/cos do.
  if (!rotation) {
    rotation = { shipFacing: ship.facingRad, shipCos: Math.cos(ship.facingRad), shipSin: Math.sin(ship.facingRad),
      barrelAngle: mount.currentAngleRad, barrelCos: Math.cos(mount.currentAngleRad), barrelSin: Math.sin(mount.currentAngleRad) };
    muzzleRotations.set(mount, rotation);
  } else {
    if (!Object.is(rotation.shipFacing, ship.facingRad)) {
      rotation.shipFacing = ship.facingRad;
      rotation.shipCos = Math.cos(ship.facingRad); rotation.shipSin = Math.sin(ship.facingRad);
    }
    if (!Object.is(rotation.barrelAngle, mount.currentAngleRad)) {
      rotation.barrelAngle = mount.currentAngleRad;
      rotation.barrelCos = Math.cos(mount.currentAngleRad); rotation.barrelSin = Math.sin(mount.currentAngleRad);
    }
  }
  // Same rotate/add order, but callers doing many forecasts can reuse the result.
  // Read inputs before writing out, so it may also alias an input vector.
  const x = mount.relativePos.x ?? 0, y = mount.relativePos.y ?? 0;
  let mx = x*rotation.shipCos-y*rotation.shipSin + ship.pos.x;
  let my = x*rotation.shipSin+y*rotation.shipCos + ship.pos.y;
  if (offsets && offsets.length >= 2) {
    const i = (mount.barrelIndex % Math.floor(offsets.length / 2)) * 2;
    // Vector2's constructor used zero for undefined offsets (e.g. a negative barrel index).
    const ox = offsets[i] ?? 0, oy = offsets[i + 1] ?? 0;
    mx += ox*rotation.barrelCos-oy*rotation.barrelSin;
    my += ox*rotation.barrelSin+oy*rotation.barrelCos;
  }
  return out.set(mx, my);
}

/** Rotation-independent bound for the live next-barrel muzzle, including offset
 * fallback and fractional/negative barrel indices. Never cache mutable mount data. */
export function weaponMuzzleExtent(mount: WeaponMount): number {
  let extent = Math.abs(mount.relativePos.x ?? 0) + Math.abs(mount.relativePos.y ?? 0);
  const primary = mount.mountType === 'HARDPOINT' ? mount.spec.hardpointOffsets : mount.spec.turretOffsets;
  const secondary = mount.mountType === 'HARDPOINT' ? mount.spec.turretOffsets : mount.spec.hardpointOffsets;
  const offsets = primary && primary.length >= 2 ? primary : secondary;
  if (offsets && offsets.length >= 2) {
    const i = (mount.barrelIndex % Math.floor(offsets.length / 2)) * 2;
    extent += Math.abs(offsets[i] ?? 0) + Math.abs(offsets[i + 1] ?? 0);
  }
  return extent;
}

/** First hull/deployed-shield contact along a segment in the target's current frame.
 * Translation prediction belongs to the caller. Rotation during flight is not predicted. */
export function shipSegmentEntry(ship: Ship, start: Vector2, end: Vector2): number | null {
  let first = Infinity;
  if (ship.spec.bounds && ship.spec.bounds.length >= 3) {
    const bounds = hullBounds(ship.spec.bounds);
    if (mayReachHull(ship, start, end, bounds)) {
      const localStart = start.clone().sub(ship.pos).rotate(-ship.facingRad);
      const localEnd = end.clone().sub(ship.pos).rotate(-ship.facingRad);
      if (mayCrossHull(localStart, localEnd, bounds)) {
        if (isPointInPolygon(localStart, ship.spec.bounds)) first = 0;
        else first = segmentPolygonEntry(localStart, localEnd, ship.spec.bounds) ?? Infinity;
      }
    }
  } else {
    first = segmentCircleEntry(start, end, ship.pos, ship.spec.collisionRadius) ?? Infinity;
  }
  if (ship.shield.isActive && ship.shield.currentArcDeg > 0 && ship.shield.type !== 'NONE' && ship.shield.type !== 'PHASE') {
    const t = segmentCircleEntry(start, end, ship.getShieldCenter(), ship.shield.radius);
    if (t !== null && ship.isShieldPointBlocked(start.clone().addScaled(end.clone().sub(start), t))) first = Math.min(first, t);
  }
  return Number.isFinite(first) ? first : null;
}
