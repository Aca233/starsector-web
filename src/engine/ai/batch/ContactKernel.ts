import { assertStageReadable, BodyFlag, ProjectileFlag, type StageReadView } from './StageProtocol';
import { coordinateLength } from '../../math/Vector2';

/** Scalar-only result. Resolving row -> Ship is the damage consumer's job. */
export interface ContactHit {
  shipRow: number;
  kind: 'HULL' | 'SHIELD';
  t: number;
  x: number;
  y: number;
  localX: number;
  localY: number;
}
const rootPair: [number | null, number | null] = [null, null];
function circleRoots(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, radius: number): readonly [number | null, number | null] {
  const dx = bx - ax, dy = by - ay, fx = ax - cx, fy = ay - cy;
  const a = dx * dx + dy * dy, c = fx * fx + fy * fy - radius * radius;
  if (c <= 0) { rootPair[0] = 0; rootPair[1] = null; return rootPair; }
  if (a <= 1e-18) { rootPair[0] = null; rootPair[1] = null; return rootPair; }
  const b = 2 * (fx * dx + fy * dy), d = b * b - 4 * a * c;
  if (d < 0) { rootPair[0] = null; rootPair[1] = null; return rootPair; }
  const root = Math.sqrt(d), inv = .5 / a, t0 = (-b - root) * inv, t1 = (-b + root) * inv;
  rootPair[0] = t0 >= 0 && t0 <= 1 ? t0 : null;
  rootPair[1] = t1 >= 0 && t1 <= 1 ? t1 : null;
  return rootPair;
}
function pointInHullPolygon(
  xy: Readonly<ArrayLike<number>>, first: number, count: number,
  minX: number, maxX: number, minY: number, maxY: number, pad: number,
  x: number, y: number
): boolean {
  if (y < minY || y >= maxY || x < minX - pad || x > maxX + pad) return false;
  let result = false;
  for (let i = 0, j = count - 1; i < count; j = i++) {
    const xi = xy[(first + i) * 2], yi = xy[(first + i) * 2 + 1];
    const xj = xy[(first + j) * 2], yj = xy[(first + j) * 2 + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) result = !result;
  }
  return result;
}
/** Authored concave polygon, including inside-start and inside-end fallback.
 * Port of RuntimeCollisionKernel + Geometry, NOT a radius approximation. */
export function contactHullParameter(v: StageReadView, row: number, ax: number, ay: number, bx: number, by: number): number | null {
  const b = v.bodies, shape = b.geometryRow[row];
  if (shape < 0) {
    const roots = circleRoots(ax, ay, bx, by, b.x[row], b.y[row], b.radius[row]);
    return roots[0] !== null ? roots[0] : roots[1];
  }
  const sx = ax - b.x[row], sy = ay - b.y[row], ex = bx - b.x[row], ey = by - b.y[row];
  const reach = b.hullReach[row];
  if (reach > 0 && Number.isFinite(reach)) {
    const rPad = reach * 1.000001 + 1e-5;
    if ((sx < -rPad && ex < -rPad) || (sx > rPad && ex > rPad)
      || (sy < -rPad && ey < -rPad) || (sy > rPad && ey > rPad)) return null;
    const dx = ex - sx, dy = ey - sy;
    if (Math.abs(sx * dy - sy * dx) > rPad * (Math.abs(dx) + Math.abs(dy))) return null;
  }
  const cos = Math.cos(-b.facing[row]), sin = Math.sin(-b.facing[row]);
  const x0 = sx * cos - sy * sin, y0 = sx * sin + sy * cos;
  const x1 = ex * cos - ey * sin, y1 = ex * sin + ey * cos;
  const g = v.geometry, first = g.offset[shape], count = g.count[shape];
  const minX = g.minX[shape], maxX = g.maxX[shape], minY = g.minY[shape], maxY = g.maxY[shape];
  const pad = 1e-7 * Math.max(1, Math.abs(x0), Math.abs(y0), Math.abs(x1), Math.abs(y1),
    Math.abs(minX), Math.abs(maxX), Math.abs(minY), Math.abs(maxY));
  if (Math.max(x0, x1) < minX - pad || Math.min(x0, x1) > maxX + pad
    || Math.max(y0, y1) < minY - pad || Math.min(y0, y1) > maxY + pad) return null;
  const xy = g.xy;
  if (pointInHullPolygon(xy, first, count, minX, maxX, minY, maxY, pad, x0, y0)) return 0;
  const dx1 = x1 - x0, dy1 = y1 - y0;
  let minT = 1, found = false;
  for (let i = 0, j = count - 1; i < count; j = i++) {
    const x = xy[(first + j) * 2], y = xy[(first + j) * 2 + 1];
    const dx2 = xy[(first + i) * 2] - x, dy2 = xy[(first + i) * 2 + 1] - y;
    const denom = dx1 * dy2 - dy1 * dx2;
    if (Math.abs(denom) < 1e-8) continue;
    const dx3 = x0 - x, dy3 = y0 - y;
    const t = (dx2 * dy3 - dy2 * dx3) / denom, u = (dx1 * dy3 - dy1 * dx3) / denom;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && t <= minT) { minT = t; found = true; }
  }
  return found ? minT : pointInHullPolygon(xy, first, count, minX, maxX, minY, maxY, pad, x1, y1) ? 1 : null;
}
export function contactShieldParameter(v: StageReadView, row: number, ax: number, ay: number, bx: number, by: number): number | null {
  const b = v.bodies;
  if (!b.shieldActive[row]) return null;
  const sx = b.shieldX[row], sy = b.shieldY[row], sr = b.shieldRadius[row];
  if (sr >= 0 && ((ax < sx - sr && bx < sx - sr) || (ax > sx + sr && bx > sx + sr)
    || (ay < sy - sr && by < sy - sr) || (ay > sy + sr && by > sy + sr))) return null;
  const roots = circleRoots(ax, ay, bx, by, sx, sy, sr);
  // Captured with EXACT legacy arithmetic: cos((currentArcDeg * PI) / 360).
  // Dividing a previously rounded radians observation is not that expression.
  const facing = b.shieldFacing[row], halfArcCos = b.shieldHalfArcCos[row];
  for (let i = 0; i < 2; i++) {
    const t = roots[i];
    if (t === null) continue;
    const x = ax + (bx - ax) * t - sx, y = ay + (by - ay) * t - sy;
    const length = coordinateLength(x, y);
    if (length <= 1e-12 || halfArcCos <= -.999999 ||
      (x * Math.cos(facing) + y * Math.sin(facing)) / length >= halfArcCos) return t;
  }
  return null;
}
/** Pure numeric grid. Incremental box reconciliation observes refresh revisions;
 * lifecycle/flux updates don't force rebuilding buckets. No candidate limits. */
export class ContactKernel {
  private epoch = -1;
  private revision = -1;
  private readonly cells = new Map<number, Map<number, Set<number>>>();
  private boxes: Array<[number, number, number, number] | undefined> = [];
  private readonly exceptional = new Set<number>();
  private readonly candidateList: number[] = [];
  private candidateStamp = new Int32Array(256);
  private stampId = 0;
  private readonly cellSize = 384;
  private box(v: StageReadView, row: number): [number, number, number, number] | undefined {
    const b = v.bodies, reach = b.hullReach[row], radius = Math.max(0, b.shieldRadius[row]);
    const minX = Math.min(b.x[row] - reach, b.shieldX[row] - radius), maxX = Math.max(b.x[row] + reach, b.shieldX[row] + radius);
    const minY = Math.min(b.y[row] - reach, b.shieldY[row] - radius), maxY = Math.max(b.y[row] + reach, b.shieldY[row] + radius);
    const pad = 1e-7 * Math.max(1, Math.abs(minX), Math.abs(maxX), Math.abs(minY), Math.abs(maxY));
    const x0 = Math.floor((minX - pad) / this.cellSize), y0 = Math.floor((minY - pad) / this.cellSize);
    const x1 = Math.floor((maxX + pad) / this.cellSize), y1 = Math.floor((maxY + pad) / this.cellSize);
    // An exceptional/huge box is fully queried from a side set, never dropped.
    return Number.isFinite(x0) && Number.isFinite(y0) && Number.isFinite(x1) && Number.isFinite(y1)
      && (x1 - x0 + 1) * (y1 - y0 + 1) <= Math.max(1, v.bodyCount * 4) ? [x0, y0, x1, y1] : undefined;
  }
  private change(row: number, box: [number, number, number, number], add: boolean): void {
    for (let y = box[1]; y <= box[3]; y++) for (let x = box[0]; x <= box[2]; x++) {
      let line = this.cells.get(y), bucket = line?.get(x);
      if (add) {
        if (!line) { line = new Map(); this.cells.set(y, line); }
        if (!bucket) { bucket = new Set(); line.set(x, bucket); }
        bucket.add(row);
      } else {
        bucket?.delete(row); if (bucket?.size === 0) line?.delete(x); if (line?.size === 0) this.cells.delete(y);
      }
    }
  }
  private reconcile(v: StageReadView): void {
    if (this.epoch !== v.epoch) {
      this.cells.clear(); this.boxes.length = 0; this.exceptional.clear(); this.epoch = v.epoch; this.revision = -1;
    }
    if (this.revision === v.revision) return;
    for (let row = 0; row < v.bodyCount; row++) {
      const old = this.boxes[row], box = this.box(v, row);
      if (old && box && old[0] === box[0] && old[1] === box[1] && old[2] === box[2] && old[3] === box[3]) continue;
      if (old) this.change(row, old, false);
      if (box) { this.change(row, box, true); this.exceptional.delete(row); }
      else this.exceptional.add(row);
      this.boxes[row] = box;
    }
    this.revision = v.revision;
  }
  findHit(v: StageReadView, projectileRow: number): ContactHit | null {
    assertStageReadable(v, 'PROJECTILE_CONTACT');
    if (!Number.isInteger(projectileRow) || projectileRow < 0 || projectileRow >= v.projectileCount)
      throw new Error('Contact requires a published projectile row');
    this.reconcile(v);
    const p = v.projectiles, b = v.bodies, r = projectileRow;
    const ax = p.prevX[r], ay = p.prevY[r], bx = p.x[r], by = p.y[r], padding = Math.max(0, p.radius[r]);
    const minX = Math.floor((Math.min(ax, bx) - padding) / this.cellSize), maxX = Math.floor((Math.max(ax, bx) + padding) / this.cellSize);
    const minY = Math.floor((Math.min(ay, by) - padding) / this.cellSize), maxY = Math.floor((Math.max(ay, by) + padding) / this.cellSize);
    const excluded = v.damagedRows.get(r);
    const sourceRow = p.sourceRow[r], filterTeam = (p.flags[r] & ProjectileFlag.FILTER_TEAM) !== 0, pTeam = p.team[r];
    const candidateList = this.candidateList;
    candidateList.length = 0;
    const cellCount = (maxX - minX + 1) * (maxY - minY + 1);
    if (!(Number.isFinite(minX) && Number.isFinite(minY) && Number.isFinite(maxX) && Number.isFinite(maxY)) || cellCount > Math.max(1, v.bodyCount * 4)) {
      for (let row = 0; row < v.bodyCount; row++) {
        if (row === sourceRow || (b.flags[row] & (BodyFlag.DEAD | BodyFlag.COLLISIONLESS))
          || (filterTeam && b.team[row] === pTeam) || excluded?.has(row)) continue;
        candidateList.push(row);
      }
    } else {
      if (this.candidateStamp.length < v.bodyCount) this.candidateStamp = new Int32Array(Math.max(v.bodyCount * 2, 256));
      const stamp = ++this.stampId, stamps = this.candidateStamp;
      for (let y = minY; y <= maxY; y++) {
        const line = this.cells.get(y);
        if (!line) continue;
        for (let x = minX; x <= maxX; x++) {
          const bucket = line.get(x);
          if (!bucket) continue;
          for (const row of bucket) {
            if (stamps[row] === stamp) continue;
            stamps[row] = stamp;
            if (row === sourceRow || (b.flags[row] & (BodyFlag.DEAD | BodyFlag.COLLISIONLESS))
              || (filterTeam && b.team[row] === pTeam) || excluded?.has(row)) continue;
            candidateList.push(row);
          }
        }
      }
      for (const row of this.exceptional) {
        if (stamps[row] === stamp) continue;
        stamps[row] = stamp;
        if (row === sourceRow || (b.flags[row] & (BodyFlag.DEAD | BodyFlag.COLLISIONLESS))
          || (filterTeam && b.team[row] === pTeam) || excluded?.has(row)) continue;
        candidateList.push(row);
      }
      if (candidateList.length > 1) candidateList.sort((a, bRow) => a - bRow);
    }
    if (candidateList.length === 0) return null;
    let bestRow = -1, bestT = Infinity, kind: ContactHit['kind'] = 'HULL';
    // Strict < preserves semantic roster ties; shield precedes hull on a tie.
    for (let i = 0; i < candidateList.length; i++) {
      const row = candidateList[i];
      const shield = contactShieldParameter(v, row, ax, ay, bx, by);
      if (shield !== null && (bestRow < 0 || shield < bestT)) { bestT = shield; bestRow = row; kind = 'SHIELD'; }
      const hull = contactHullParameter(v, row, ax, ay, bx, by);
      if (hull !== null && (bestRow < 0 || hull < bestT)) { bestT = hull; bestRow = row; kind = 'HULL'; }
    }
    if (bestRow < 0) return null;
    const x = ax + (bx - ax) * bestT, y = ay + (by - ay) * bestT;
    const dx = x - b.x[bestRow], dy = y - b.y[bestRow], cos = Math.cos(-b.facing[bestRow]), sin = Math.sin(-b.facing[bestRow]);
    return { shipRow: bestRow, kind, t: bestT, x, y, localX: dx * cos - dy * sin, localY: dx * sin + dy * cos };
  }
}
