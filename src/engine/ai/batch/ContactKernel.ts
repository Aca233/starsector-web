import { BodyFlag, ProjectileFlag, type StageView } from './StageProtocol';
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
function circleRoots(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, radius: number): [number | null, number | null] {
  const dx = bx - ax, dy = by - ay, fx = ax - cx, fy = ay - cy;
  const a = dx * dx + dy * dy, c = fx * fx + fy * fy - radius * radius;
  if (c <= 0) return [0, null];
  if (a <= 1e-18) return [null, null];
  const b = 2 * (fx * dx + fy * dy), d = b * b - 4 * a * c;
  if (d < 0) return [null, null];
  const root = Math.sqrt(d), inv = .5 / a, t0 = (-b - root) * inv, t1 = (-b + root) * inv;
  return [t0 >= 0 && t0 <= 1 ? t0 : null, t1 >= 0 && t1 <= 1 ? t1 : null];
}
/** Authored concave polygon, including inside-start and inside-end fallback.
 * Port of RuntimeCollisionKernel + Geometry, NOT a radius approximation. */
export function contactHullParameter(v: StageView, row: number, ax: number, ay: number, bx: number, by: number): number | null {
  const b = v.bodies, shape = b.geometryRow[row];
  if (shape < 0) return circleRoots(ax, ay, bx, by, b.x[row], b.y[row], b.radius[row]).find(t => t !== null) ?? null;
  const cos = Math.cos(-b.facing[row]), sin = Math.sin(-b.facing[row]);
  const sx = ax - b.x[row], sy = ay - b.y[row], ex = bx - b.x[row], ey = by - b.y[row];
  const x0 = sx * cos - sy * sin, y0 = sx * sin + sy * cos;
  const x1 = ex * cos - ey * sin, y1 = ex * sin + ey * cos;
  const g = v.geometry, first = g.offset[shape], count = g.count[shape];
  const pad = 1e-7 * Math.max(1, Math.abs(x0), Math.abs(y0), Math.abs(x1), Math.abs(y1),
    Math.abs(g.minX[shape]), Math.abs(g.maxX[shape]), Math.abs(g.minY[shape]), Math.abs(g.maxY[shape]));
  if (Math.max(x0, x1) < g.minX[shape] - pad || Math.min(x0, x1) > g.maxX[shape] + pad
    || Math.max(y0, y1) < g.minY[shape] - pad || Math.min(y0, y1) > g.maxY[shape] + pad) return null;
  const inside = (x: number, y: number): boolean => {
    let result = false;
    for (let i = 0, j = count - 1; i < count; j = i++) {
      const xi = g.xy[(first + i) * 2], yi = g.xy[(first + i) * 2 + 1];
      const xj = g.xy[(first + j) * 2], yj = g.xy[(first + j) * 2 + 1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) result = !result;
    }
    return result;
  };
  if (inside(x0, y0)) return 0;
  const dx1 = x1 - x0, dy1 = y1 - y0;
  let minT = 1, found = false;
  for (let i = 0; i < count; i++) {
    const j = (i + count - 1) % count, x = g.xy[(first + j) * 2], y = g.xy[(first + j) * 2 + 1];
    const dx2 = g.xy[(first + i) * 2] - x, dy2 = g.xy[(first + i) * 2 + 1] - y;
    const denom = dx1 * dy2 - dy1 * dx2;
    if (Math.abs(denom) < 1e-8) continue;
    const dx3 = x0 - x, dy3 = y0 - y;
    const t = (dx2 * dy3 - dy2 * dx3) / denom, u = (dx1 * dy3 - dy1 * dx3) / denom;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && t <= minT) { minT = t; found = true; }
  }
  return found ? minT : inside(x1, y1) ? 1 : null;
}
export function contactShieldParameter(v: StageView, row: number, ax: number, ay: number, bx: number, by: number): number | null {
  const b = v.bodies;
  if (!b.shieldActive[row]) return null;
  const roots = circleRoots(ax, ay, bx, by, b.shieldX[row], b.shieldY[row], b.shieldRadius[row]);
  // Captured with EXACT legacy arithmetic: cos((currentArcDeg * PI) / 360).
  // Dividing a previously rounded radians observation is not that expression.
  const facing = b.shieldFacing[row], halfArcCos = b.shieldHalfArcCos[row];
  for (const t of roots) {
    if (t === null) continue;
    const x = ax + (bx - ax) * t - b.shieldX[row], y = ay + (by - ay) * t - b.shieldY[row];
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
  private readonly candidates = new Set<number>();
  private readonly cellSize = 384;
  private box(v: StageView, row: number): [number, number, number, number] | undefined {
    const b = v.bodies, reach = b.hullReach[row], radius = Math.max(0, b.shieldRadius[row]);
    const minX = Math.min(b.x[row] - reach, b.shieldX[row] - radius), maxX = Math.max(b.x[row] + reach, b.shieldX[row] + radius);
    const minY = Math.min(b.y[row] - reach, b.shieldY[row] - radius), maxY = Math.max(b.y[row] + reach, b.shieldY[row] + radius);
    const pad = 1e-7 * Math.max(1, Math.abs(minX), Math.abs(maxX), Math.abs(minY), Math.abs(maxY));
    const box: [number, number, number, number] = [
      Math.floor((minX - pad) / this.cellSize), Math.floor((minY - pad) / this.cellSize),
      Math.floor((maxX + pad) / this.cellSize), Math.floor((maxY + pad) / this.cellSize)
    ];
    // An exceptional/huge box is fully queried from a side set, never dropped.
    return box.every(Number.isFinite) && (box[2] - box[0] + 1) * (box[3] - box[1] + 1) <= Math.max(1, v.bodyCount * 4) ? box : undefined;
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
  private reconcile(v: StageView): void {
    if (this.epoch !== v.epoch) {
      this.cells.clear(); this.boxes.length = 0; this.exceptional.clear(); this.epoch = v.epoch; this.revision = -1;
    }
    if (this.revision === v.revision) return;
    for (let row = 0; row < v.bodyCount; row++) {
      const old = this.boxes[row], box = this.box(v, row);
      if (old && box && old.every((n, i) => n === box[i])) continue;
      if (old) this.change(row, old, false);
      if (box) { this.change(row, box, true); this.exceptional.delete(row); }
      else this.exceptional.add(row);
      this.boxes[row] = box;
    }
    this.revision = v.revision;
  }
  findHit(v: StageView, projectileRow: number): ContactHit | null {
    if (!v.active || !v.valid || projectileRow < 0) throw new Error('Contact requires a live numeric stage');
    this.reconcile(v);
    const p = v.projectiles, b = v.bodies, r = projectileRow;
    const ax = p.prevX[r], ay = p.prevY[r], bx = p.x[r], by = p.y[r], padding = Math.max(0, p.radius[r]);
    const minX = Math.floor((Math.min(ax, bx) - padding) / this.cellSize), maxX = Math.floor((Math.max(ax, bx) + padding) / this.cellSize);
    const minY = Math.floor((Math.min(ay, by) - padding) / this.cellSize), maxY = Math.floor((Math.max(ay, by) + padding) / this.cellSize);
    this.candidates.clear();
    const cellCount = (maxX - minX + 1) * (maxY - minY + 1);
    if (![minX, minY, maxX, maxY].every(Number.isFinite) || cellCount > Math.max(1, v.bodyCount * 4)) {
      for (let row = 0; row < v.bodyCount; row++) this.candidates.add(row);
    } else {
      for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++)
        for (const row of this.cells.get(y)?.get(x) ?? []) this.candidates.add(row);
      for (const row of this.exceptional) this.candidates.add(row);
    }
    const excluded = v.damagedRows.get(r);
    let bestRow = -1, bestT = Infinity, kind: ContactHit['kind'] = 'HULL';
    // Strict < preserves semantic roster ties; shield precedes hull on a tie.
    for (const row of [...this.candidates].sort((a, b) => a - b)) {
      if (row === p.sourceRow[r] || excluded?.has(row) || b.flags[row] & (BodyFlag.DEAD | BodyFlag.COLLISIONLESS)
        || (p.flags[r] & ProjectileFlag.FILTER_TEAM) && b.team[row] === p.team[r]) continue;
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
