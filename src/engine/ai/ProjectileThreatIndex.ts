import type { Projectile } from '../simulation/Weapon';
import type { Ship } from '../simulation/Ship';
import type { Vector2 } from '../math/Vector2';

interface Entry { order: number; minX: number; minY: number; maxX: number; maxY: number }
interface Node extends Omit<Entry, 'order'> { start: number; end: number; left: number; right: number }

/** Broadphase for one synchronous, audited native AI phase only. Projectile motion
 * and system events execute after that phase. It never caches a threat/ETA or limits
 * its horizon; every retained projectile still uses the live narrow-phase formula. */
export class ProjectileThreatIndex {
  private active = true;
  private readonly entries: Entry[] = [];
  private readonly nodes: Node[] = [];
  private readonly unbounded: number[] = [];
  private readonly guided = new Map<string, number[]>();
  private readonly sourceLength: number;

  constructor(private readonly source: readonly Projectile[]) {
    this.sourceLength = source.length;
    for (let order = 0; order < source.length; order++) {
      const p = source[order];
      if (p.isGuided && p.targetShipId !== undefined) {
        let group = this.guided.get(p.targetShipId);
        if (!group) { group = []; this.guided.set(p.targetShipId, group); }
        group.push(order);
      }
      // Full remaining straight trajectory, independent of the assessed ship's
      // horizon. Unbounded/exceptional lifetimes cannot safely enter the tree.
      let lifetime = Infinity;
      if (p.flightTimeRemaining !== undefined) lifetime = p.flightTimeRemaining;
      else if (p.rangeRemaining !== undefined) lifetime = Math.max(0, p.rangeRemaining)
        / Math.max(1, p.sourceMoveSpeed ?? p.vel.length())
        + Math.max(0, (p.fadeTime ?? 0) * (1 - (p.fadeProgress ?? 0)));
      const x = p.pos.x, y = p.pos.y, endX = x + p.vel.x * lifetime, endY = y + p.vel.y * lifetime;
      const radius = Math.abs(p.radius) + Math.abs(p.proximityFuse?.range ?? 0);
      const pad = 1e-6 * Math.max(1, Math.abs(x), Math.abs(y), Math.abs(endX), Math.abs(endY), radius);
      const extent = radius + pad;
      const entry = { order, minX: Math.min(x, endX) - extent, minY: Math.min(y, endY) - extent,
        maxX: Math.max(x, endX) + extent, maxY: Math.max(y, endY) + extent };
      if (!(lifetime > 0) || !Number.isFinite(lifetime)
        || !Number.isFinite(entry.minX + entry.minY + entry.maxX + entry.maxY)) this.unbounded.push(order);
      else this.entries.push(entry);
    }
    // One sort and a balanced interval hierarchy. Bounds include Y as well as X;
    // leaves preserve source indices, not object identity (duplicate entries matter).
    this.entries.sort((a, b) => a.minX - b.minX || a.order - b.order);
    if (this.entries.length) this.build(0, this.entries.length);
  }

  private build(start: number, end: number): number {
    const index = this.nodes.length;
    const node: Node = { start, end, minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, left: -1, right: -1 };
    this.nodes.push(node);
    if (end - start <= 8) {
      for (let i = start; i < end; i++) {
        const e = this.entries[i];
        node.minX = Math.min(node.minX, e.minX); node.minY = Math.min(node.minY, e.minY);
        node.maxX = Math.max(node.maxX, e.maxX); node.maxY = Math.max(node.maxY, e.maxY);
      }
    } else {
      const mid = (start + end) >>> 1;
      node.left = this.build(start, mid); node.right = this.build(mid, end);
      const a = this.nodes[node.left], b = this.nodes[node.right];
      node.minX = Math.min(a.minX, b.minX); node.minY = Math.min(a.minY, b.minY);
      node.maxX = Math.max(a.maxX, b.maxX); node.maxY = Math.max(a.maxY, b.maxY);
    }
    return index;
  }

  /** Always close in finally, including an AI exception. Never reuse after motion,
   * weapon emission, system-event dispatch or a later/external AI invocation. */
  public close(): void { this.active = false; }

  public query(source: readonly Projectile[], ship: Ship, center: Vector2, radius: number, horizon: number): readonly Projectile[] | null {
    if (!this.active || !ship.hasNativeThreatPhaseHooks || source !== this.source || source.length !== this.sourceLength
      || !(horizon > 0) || !Number.isFinite(horizon)) return null;
    const endX = center.x + ship.vel.x * horizon, endY = center.y + ship.vel.y * horizon;
    const extent = Math.abs(radius) + 1e-6 * Math.max(1, Math.abs(center.x), Math.abs(center.y), Math.abs(endX), Math.abs(endY), Math.abs(radius));
    const minX = Math.min(center.x, endX) - extent, minY = Math.min(center.y, endY) - extent;
    const maxX = Math.max(center.x, endX) + extent, maxY = Math.max(center.y, endY) + extent;
    if (!Number.isFinite(minX + minY + maxX + maxY)) return null;
    const orders = new Set(this.unbounded);
    // A pursuing missile can turn outside its current straight swept box.
    for (const order of this.guided.get(ship.id) ?? []) orders.add(order);
    const stack = this.nodes.length ? [0] : [];
    while (stack.length) {
      const node = this.nodes[stack.pop()!];
      if (node.maxX < minX || node.minX > maxX || node.maxY < minY || node.minY > maxY) continue;
      if (node.left >= 0) { stack.push(node.left, node.right); continue; }
      for (let i = node.start; i < node.end; i++) {
        const e = this.entries[i];
        if (!(e.maxX < minX || e.minX > maxX || e.maxY < minY || e.minY > maxY)) orders.add(e.order);
      }
    }
    return [...orders].sort((a, b) => a - b).map(order => source[order]);
  }
}
