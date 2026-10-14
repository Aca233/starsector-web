import type { StageReadView } from './StageProtocol';
import { contactHullParameter } from './ContactKernel';
import { signedAngle } from '../../math/Angles';
import { coordinateLength } from '../../math/Vector2';

/** Acquisition tests the FIRST circle entry only (not its second root). */
export function fireCircle(ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, radius: number): number | null {
  if (radius >= 0 && ((ax < cx - radius && bx < cx - radius) || (ax > cx + radius && bx > cx + radius)
    || (ay < cy - radius && by < cy - radius) || (ay > cy + radius && by > cy + radius))) return null;
  const fx = ax - cx, fy = ay - cy, dx = bx - ax, dy = by - ay;
  const c = fx * fx + fy * fy - radius * radius;
  if (c <= 0) return 0;
  const fDotD = fx * dx + fy * dy;
  if (fDotD >= 0) return null;
  const a = dx * dx + dy * dy;
  if (a <= 1e-12) return null;
  const b = 2 * fDotD, d = b * b - 4 * a * c;
  if (d < 0) return null;
  const first = (-b - Math.sqrt(d)) / (2 * a);
  return first >= 0 && first <= 1 ? first : null;
}

export function fireShieldCovered(v: StageReadView, shieldOn: ArrayLike<number>, row: number, x: number, y: number): boolean {
  const b = v.bodies;
  if (!(b.shieldArc[row] > 5 * Math.PI / 180) || b.shieldType[row] === 0 || b.shieldType[row] === 3 || !shieldOn[row]) return false;
  const dx = x - b.shieldX[row], dy = y - b.shieldY[row];
  const scale = b.shieldRadius[row] / Math.max(.001, coordinateLength(dx, dy));
  const px = b.shieldX[row] + dx * scale, py = b.shieldY[row] + dy * scale;
  return Math.abs(signedAngle(Math.atan2(py - b.shieldY[row], px - b.shieldX[row]) - b.shieldFacing[row])) <= b.shieldArc[row] / 2;
}

/** Authored hull + actual deployed shield. No Ship, Vector2, callback or candidate
 * wrapper allocation occurs. Matches Ship.isShieldPointBlocked's >5-degree gate. */
export function fireSegment(v: StageReadView, shieldOn: ArrayLike<number>, row: number,
  ax: number, ay: number, bx: number, by: number, ignoreShield = false): number | null {
  const b = v.bodies;
  let first = b.geometryRow[row] < 0 ? fireCircle(ax, ay, bx, by, b.x[row], b.y[row], b.radius[row])
    : contactHullParameter(v, row, ax, ay, bx, by);
  if (!ignoreShield && shieldOn[row] && b.shieldArc[row] > 5 * Math.PI / 180 && b.shieldType[row] !== 0 && b.shieldType[row] !== 3) {
    const t = fireCircle(ax, ay, bx, by, b.shieldX[row], b.shieldY[row], b.shieldRadius[row]);
    if (t !== null && Math.abs(signedAngle(Math.atan2(
      ay + (by - ay) * t - b.shieldY[row], ax + (bx - ax) * t - b.shieldX[row]) - b.shieldFacing[row]))
      <= b.shieldArc[row] / 2) first = first === null ? t : Math.min(first, t);
  }
  return first;
}
