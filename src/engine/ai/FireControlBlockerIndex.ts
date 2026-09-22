import { shipFireControlExtent } from './FireControlGeometry';
import type { Ship } from '../simulation/Ship';
import type { Vector2 } from '../math/Vector2';

interface Bounds {
  minX: number; minY: number; maxX: number; maxY: number;
  minVx: number; minVy: number; maxVx: number; maxVy: number;
}
interface Entry extends Bounds { order: number }
interface Node extends Bounds { start: number; end: number; left: number; right: number }

/** Moving broadphase for ONE native pre-emission aim batch, not a fixed-step index.
 * Bounds retain all hull/shield contacts; the caller still executes its original
 * relative-motion narrow phase. No caps on speed, delay, range or flight time. */
export class FireControlBlockerIndex {
  private readonly entries: Entry[] = [];
  private readonly nodes: Node[] = [];
  private readonly unbounded: number[] = [];
  private boundMagnitude = 0;
  private speedMagnitude = 0;
  constructor(private readonly ships: readonly Ship[]) {
    for (let order = 0; order < ships.length; order++) {
      const s = ships[order], extent = shipFireControlExtent(s);
      const e: Entry = { order, minX: s.pos.x - extent, maxX: s.pos.x + extent,
        minY: s.pos.y - extent, maxY: s.pos.y + extent,
        minVx: s.vel.x, maxVx: s.vel.x, minVy: s.vel.y, maxVy: s.vel.y };
      if (!Number.isFinite(extent) || !Number.isFinite(s.facingRad)
        || !Number.isFinite(e.minX + e.maxX + e.minY + e.maxY + e.minVx + e.minVy)) this.unbounded.push(order);
      else this.entries.push(e);
    }
    this.entries.sort((a, b) => a.minX - b.minX || a.order - b.order);
    if (this.entries.length) {
      this.build(0, this.entries.length);
      const root = this.nodes[0];
      this.boundMagnitude = Math.max(Math.abs(root.minX), Math.abs(root.minY), Math.abs(root.maxX), Math.abs(root.maxY));
      this.speedMagnitude = Math.max(Math.abs(root.minVx), Math.abs(root.minVy), Math.abs(root.maxVx), Math.abs(root.maxVy));
    }
  }
  private build(start: number, end: number): number {
    const index = this.nodes.length;
    const node: Node = { start, end, left: -1, right: -1,
      minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity,
      minVx: Infinity, minVy: Infinity, maxVx: -Infinity, maxVy: -Infinity };
    this.nodes.push(node);
    const merge = (b: Bounds) => {
      node.minX = Math.min(node.minX, b.minX); node.minY = Math.min(node.minY, b.minY);
      node.maxX = Math.max(node.maxX, b.maxX); node.maxY = Math.max(node.maxY, b.maxY);
      node.minVx = Math.min(node.minVx, b.minVx); node.minVy = Math.min(node.minVy, b.minVy);
      node.maxVx = Math.max(node.maxVx, b.maxVx); node.maxVy = Math.max(node.maxVy, b.maxVy);
    };
    if (end - start <= 6) for (let i = start; i < end; i++) merge(this.entries[i]);
    else {
      const middle = (start + end) >>> 1;
      node.left = this.build(start, middle); node.right = this.build(middle, end);
      merge(this.nodes[node.left]); merge(this.nodes[node.right]);
    }
    return index;
  }
  public query(origin: Vector2, travel: Vector2, velocity: Vector2, delay: number, time: number): readonly Ship[] {
    if (this.ships.length < 8) return this.ships;
    const finish = delay + time;
    const sx = origin.x + velocity.x * delay, sy = origin.y + velocity.y * delay;
    const ex = sx + travel.x + velocity.x * time, ey = sy + travel.y + velocity.y * time;
    if (!(delay >= 0 && time >= 0) || !Number.isFinite(finish) || !Number.isFinite(sx + sy + ex + ey)) return this.ships;
    const minX = Math.min(sx, ex), minY = Math.min(sy, ey), maxX = Math.max(sx, ex), maxY = Math.max(sy, ey);
    const queryScale = Math.max(1, Math.abs(sx), Math.abs(sy), Math.abs(ex), Math.abs(ey),
      Math.abs(origin.x), Math.abs(origin.y), Math.abs(velocity.x) * finish, Math.abs(velocity.y) * finish);
    // The root bounds every entry's position and speed. One conservative error
    // scale per query covers every node, including its translated endpoints;
    // do not recompute a 20-term maximum for each visited node/leaf.
    const boundScale = this.boundMagnitude + this.speedMagnitude * finish;
    if (!Number.isFinite(boundScale)) return this.ships;
    const pad = 1e-6 * Math.max(queryScale, boundScale);
    const misses = (b: Bounds): boolean => {
      const bx0 = b.minX + Math.min(b.minVx * delay, b.minVx * finish);
      const by0 = b.minY + Math.min(b.minVy * delay, b.minVy * finish);
      const bx1 = b.maxX + Math.max(b.maxVx * delay, b.maxVx * finish);
      const by1 = b.maxY + Math.max(b.maxVy * delay, b.maxVy * finish);
      if (!Number.isFinite(bx0 + by0 + bx1 + by1)) return false;
      // Covers both geometry rounding and the different grouping of relative
      // motion in the authoritative narrow phase. Tangency remains inclusive.
      return bx1 < minX - pad || bx0 > maxX + pad || by1 < minY - pad || by0 > maxY + pad;
    };
    const orders = [...this.unbounded], stack = this.nodes.length ? [0] : [];
    while (stack.length) {
      const node = this.nodes[stack.pop()!];
      if (misses(node)) continue;
      if (node.left >= 0) { stack.push(node.left, node.right); continue; }
      for (let i = node.start; i < node.end; i++) if (!misses(this.entries[i])) orders.push(this.entries[i].order);
    }
    orders.sort((a, b) => a - b);
    return orders.map(order => this.ships[order]);
  }
}
