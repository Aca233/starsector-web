import { Vector2 } from '../../math/Vector2';
import type { Ship } from '../Ship';

export interface HullSurfaceSample {
  point: Vector2;
  outward: Vector2;
}

/** Samples the authored ship bounds by perimeter distance and returns an outward-facing surface normal. */
export function sampleShipHullSurface(ship: Ship, normalizedDistance: number): HullSurfaceSample {
  const bounds = ship.spec.bounds;
  if (!bounds || bounds.length < 2) {
    const angle = normalizedDistance * Math.PI * 2 + ship.facingRad;
    return {
      point: ship.pos.clone().add(Vector2.fromAngle(angle, ship.spec.collisionRadius * 0.82)),
      outward: Vector2.fromAngle(angle)
    };
  }

  const lengths: number[] = [];
  let perimeter = 0;
  let signedArea2 = 0;
  for (let i = 0; i < bounds.length; i++) {
    const [x1, y1] = bounds[i];
    const [x2, y2] = bounds[(i + 1) % bounds.length];
    const length = Math.hypot(x2 - x1, y2 - y1);
    lengths.push(length);
    perimeter += length;
    signedArea2 += x1 * y2 - x2 * y1;
  }

  if (perimeter <= 0.001) {
    return { point: ship.pos.clone(), outward: Vector2.fromAngle(ship.facingRad) };
  }

  const wrapped = ((normalizedDistance % 1) + 1) % 1;
  let remaining = wrapped * perimeter;
  const outwardSign = signedArea2 >= 0 ? 1 : -1;
  for (let i = 0; i < bounds.length; i++) {
    const edgeLength = lengths[i];
    if (remaining <= edgeLength || i === bounds.length - 1) {
      const [x1, y1] = bounds[i];
      const [x2, y2] = bounds[(i + 1) % bounds.length];
      const t = edgeLength > 0.001 ? Math.max(0, Math.min(1, remaining / edgeLength)) : 0;
      const localPoint = new Vector2(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t);
      const dx = x2 - x1;
      const dy = y2 - y1;
      const localOutward = edgeLength > 0.001
        ? new Vector2((dy / edgeLength) * outwardSign, (-dx / edgeLength) * outwardSign)
        : new Vector2(1, 0);
      return {
        point: localPoint.rotate(ship.facingRad).add(ship.pos),
        outward: localOutward.rotate(ship.facingRad)
      };
    }
    remaining -= edgeLength;
  }

  return { point: ship.pos.clone(), outward: Vector2.fromAngle(ship.facingRad) };
}

export function getShipHullPerimeterPoint(ship: Ship, normalizedDistance: number): Vector2 {
  return sampleShipHullSurface(ship, normalizedDistance).point;
}

export function isPointInsideShipHull(ship: Ship, worldPoint: Vector2): boolean {
  const bounds = ship.spec.bounds;
  if (!bounds || bounds.length < 3) return worldPoint.distanceTo(ship.pos) <= ship.spec.collisionRadius * 0.82;

  const local = worldPoint.clone().sub(ship.pos).rotate(-ship.facingRad);
  let inside = false;
  for (let i = 0, j = bounds.length - 1; i < bounds.length; j = i++) {
    const [xi, yi] = bounds[i];
    const [xj, yj] = bounds[j];
    const crosses = ((yi > local.y) !== (yj > local.y))
      && local.x < ((xj - xi) * (local.y - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function getShipHullInteriorAnchor(ship: Ship): Vector2 {
  const bounds = ship.spec.bounds;
  if (!bounds || bounds.length < 3) return ship.pos.clone();

  let signedArea2 = 0;
  for (let i = 0; i < bounds.length; i++) {
    const [x1, y1] = bounds[i];
    const [x2, y2] = bounds[(i + 1) % bounds.length];
    signedArea2 += x1 * y2 - x2 * y1;
  }
  const inwardSign = signedArea2 >= 0 ? 1 : -1;
  const inset = Math.max(3, Math.min(10, ship.spec.collisionRadius * 0.04));

  for (let i = 0; i < bounds.length; i++) {
    const [x1, y1] = bounds[i];
    const [x2, y2] = bounds[(i + 1) % bounds.length];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len <= 0.001) continue;
    const local = new Vector2(
      (x1 + x2) * 0.5 + (-dy / len) * inset * inwardSign,
      (y1 + y2) * 0.5 + (dx / len) * inset * inwardSign
    );
    const world = local.rotate(ship.facingRad).add(ship.pos);
    if (isPointInsideShipHull(ship, world)) return world;
  }

  const xs = bounds.map(([x]) => x);
  const ys = bounds.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  for (let gy = 1; gy < 8; gy++) {
    for (let gx = 1; gx < 8; gx++) {
      const local = new Vector2(minX + (maxX - minX) * gx / 8, minY + (maxY - minY) * gy / 8);
      const world = local.rotate(ship.facingRad).add(ship.pos);
      if (isPointInsideShipHull(ship, world)) return world;
    }
  }
  return ship.pos.clone();
}

/** Pulls a point onto/inside the authored bounds; used to keep electrical visual nodes attached to the hull. */
export function constrainPointToShipHull(ship: Ship, worldPoint: Vector2, fallbackInside = getShipHullInteriorAnchor(ship)): Vector2 {
  if (isPointInsideShipHull(ship, worldPoint)) {
    const inset = Vector2.lerp(worldPoint, fallbackInside, 0.06);
    return isPointInsideShipHull(ship, inset) ? inset : worldPoint.clone();
  }

  const bounds = ship.spec.bounds;
  if (!bounds || bounds.length < 2) return fallbackInside.clone();

  const local = worldPoint.clone().sub(ship.pos).rotate(-ship.facingRad);
  let closest = new Vector2();
  let bestDistSq = Number.POSITIVE_INFINITY;
  for (let i = 0; i < bounds.length; i++) {
    const a = new Vector2(bounds[i][0], bounds[i][1]);
    const b = new Vector2(bounds[(i + 1) % bounds.length][0], bounds[(i + 1) % bounds.length][1]);
    const ab = b.clone().sub(a);
    const lenSq = ab.dot(ab);
    const t = lenSq > 1e-9 ? Math.max(0, Math.min(1, local.clone().sub(a).dot(ab) / lenSq)) : 0;
    const candidate = a.clone().add(ab.scale(t));
    const dx = candidate.x - local.x;
    const dy = candidate.y - local.y;
    const distSq = dx * dx + dy * dy;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      closest = candidate;
    }
  }

  const closestWorld = closest.rotate(ship.facingRad).add(ship.pos);
  for (const t of [0.12, 0.24, 0.4, 0.6, 0.8, 1]) {
    const candidate = Vector2.lerp(closestWorld, fallbackInside, t);
    if (isPointInsideShipHull(ship, candidate)) return candidate;
  }
  return fallbackInside.clone();
}
