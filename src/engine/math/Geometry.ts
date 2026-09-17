import { Vector2 } from './Vector2';

export interface PolygonHitResult {
  hit: boolean;
  point: Vector2;
  normal: Vector2;
  t: number;
}

/**
 * 点在多边形内判定 (Point in Polygon - 射线法)
 */
export function isPointInPolygon(p: { x: number; y: number }, polygon: [number, number][]): boolean {
  if (!polygon || polygon.length < 3) return false;
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    const intersect = ((yi > p.y) !== (yj > p.y)) &&
      (p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * 两线段相交判定与交点解算
 */
export function intersectSegments(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  p4: { x: number; y: number }
): { t: number; u: number; x: number; y: number } | null {
  const dx1 = p2.x - p1.x;
  const dy1 = p2.y - p1.y;
  const dx2 = p4.x - p3.x;
  const dy2 = p4.y - p3.y;

  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < 1e-8) return null;

  const dx3 = p1.x - p3.x;
  const dy3 = p1.y - p3.y;

  const t = (dx2 * dy3 - dy2 * dx3) / denom;
  const u = (dx1 * dy3 - dy1 * dx3) / denom;

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return {
      t,
      u,
      x: p1.x + t * dx1,
      y: p1.y + t * dy1
    };
  }
  return null;
}

/**
 * 检测线段 (如子弹轨迹或光束) 是否穿透/命中多边形边界
 */
export function intersectSegmentWithPolygon(
  start: { x: number; y: number },
  end: { x: number; y: number },
  polygon: [number, number][]
): PolygonHitResult | null {
  if (!polygon || polygon.length < 3) return null;

  let minT = 1.0;
  let hitPoint: Vector2 | null = null;
  let hitNormal = new Vector2();
  let found = false;

  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const p3 = { x: polygon[j][0], y: polygon[j][1] };
    const p4 = { x: polygon[i][0], y: polygon[i][1] };
    const res = intersectSegments(start, end, p3, p4);
    if (res && res.t <= minT) {
      minT = res.t;
      hitPoint = new Vector2(res.x, res.y);
      const edgeDx = p4.x - p3.x;
      const edgeDy = p4.y - p3.y;
      hitNormal.set(-edgeDy, edgeDx).normalize();
      found = true;
    }
  }

  if (found && hitPoint) {
    return {
      hit: true,
      point: hitPoint,
      normal: hitNormal,
      t: minT
    };
  }

  // 若末端直接包含在多边形内部
  if (isPointInPolygon(end, polygon)) {
    return {
      hit: true,
      point: new Vector2(end.x, end.y),
      normal: new Vector2(0, 0),
      t: 1.0
    };
  }

  return null;
}

/** Parameter-only counterpart of intersectSegmentWithPolygon. Fire-control rays
 * do not consume the contact point/normal; keep the exact edge order, arithmetic,
 * inclusive ties and inside-end fallback without constructing those unused values. */
export function segmentPolygonEntry(
  start: { x: number; y: number }, end: { x: number; y: number }, polygon: [number, number][]
): number | null {
  if (!polygon || polygon.length < 3) return null;
  const dx1 = end.x - start.x, dy1 = end.y - start.y;
  let minT = 1.0, found = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const ax = polygon[j][0], ay = polygon[j][1];
    const dx2 = polygon[i][0] - ax, dy2 = polygon[i][1] - ay;
    const denom = dx1 * dy2 - dy1 * dx2;
    if (Math.abs(denom) < 1e-8) continue;
    const dx3 = start.x - ax, dy3 = start.y - ay;
    const t = (dx2 * dy3 - dy2 * dx3) / denom;
    const u = (dx1 * dy3 - dy1 * dx3) / denom;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && t <= minT) {
      minT = t;
      found = true;
    }
  }
  return found ? minT : isPointInPolygon(end, polygon) ? 1.0 : null;
}

/** First swept segment/circle contact, including a segment beginning inside. */
export function segmentCircleEntry(start: Vector2, end: Vector2, center: Vector2, radius: number): number | null {
  // Same quadratic and arithmetic order, without two temporary Vector2 objects.
  const dx = end.x - start.x, dy = end.y - start.y;
  const fx = start.x - center.x, fy = start.y - center.y;
  const c = fx * fx + fy * fy - radius * radius;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy;
  if (a <= 1e-12) return null;
  const b = 2 * (fx * dx + fy * dy), discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const t = (-b - Math.sqrt(discriminant)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}
