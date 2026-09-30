import type { Ship } from '../simulation/Ship';
import type { Vector2 } from '../math/Vector2';
import { shieldCenterOffset } from '../simulation/collision/ShieldCollisionGeometry';

interface Entry { axis: number; other: number; order: number }

/** Only a closed Worker's already-qualified, per-ship pre-emission transaction
 * may share these reads. No cross-tick state, permissions, or hit results. */
export class PreAimRangeIndex {
  private readonly entries: Entry[] = [];
  private readonly length: number;
  private valid = true;
  private xAxis = true;
  private radius = 0;
  private minVx = Infinity;
  private minVy = Infinity;
  private maxVx = -Infinity;
  private maxVy = -Infinity;
  private magnitude = 1;
  constructor(private readonly ships: readonly Ship[]) {
    this.length = ships.length;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let order = 0; order < ships.length; order++) {
      const ship = ships[order], x = ship.pos.x, y = ship.pos.y, vx = ship.vel.x, vy = ship.vel.y;
      // Acquisition includes an active shield even while its arc is unfolding.
      // Contact geometry's shipFireControlExtent would be too small here.
      const shieldExtent = ship.shield.isActive && ship.shield.type !== 'NONE' && ship.shield.type !== 'PHASE'
        ? ship.shield.radius + shieldCenterOffset(ship) : 0;
      const radius = Math.max(ship.spec.collisionRadius, shieldExtent);
      if (!(radius >= 0) || !Number.isFinite(radius) || !Number.isFinite(x) || !Number.isFinite(y)
        || !Number.isFinite(vx) || !Number.isFinite(vy)) { this.valid = false; return; }
      this.radius = Math.max(this.radius, radius);
      this.minVx = Math.min(this.minVx, vx); this.maxVx = Math.max(this.maxVx, vx);
      this.minVy = Math.min(this.minVy, vy); this.maxVy = Math.max(this.maxVy, vy);
      this.magnitude = Math.max(this.magnitude, Math.abs(x), Math.abs(y));
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      this.entries.push({ axis: x, other: y, order });
    }
    this.xAxis = maxX - minX >= maxY - minY;
    if (!this.xAxis) for (const entry of this.entries) { const x = entry.axis; entry.axis = entry.other; entry.other = x; }
    this.entries.sort((a, b) => a.axis - b.axis || a.order - b.order);
  }
  public query(origin: Vector2, velocity: Vector2, range: number, speed: number, delay: number, beam: boolean): readonly Ship[] {
    if (!this.valid || this.ships.length !== this.length || !this.entries.length
      || !(range >= 0 && speed > 0 && delay >= 0) || !Number.isFinite(range) || !Number.isFinite(speed) || !Number.isFinite(delay)
      || !Number.isFinite(origin.x) || !Number.isFinite(origin.y) || !Number.isFinite(velocity.x) || !Number.isFinite(velocity.y)) return this.ships;
    const limit = range + this.radius;
    const horizon = delay + (beam ? 0 : limit / speed);
    const relativeSpeed = Math.max(Math.abs(this.minVx - velocity.x), Math.abs(this.maxVx - velocity.x))
      + Math.max(Math.abs(this.minVy - velocity.y), Math.abs(this.maxVy - velocity.y));
    const reach = limit + relativeSpeed * horizon;
    const pad = 2e-6 * Math.max(this.magnitude, Math.abs(origin.x), Math.abs(origin.y), Math.abs(reach));
    const bound = reach + pad;
    if (!Number.isFinite(bound)) return this.ships;
    const axis = this.xAxis ? origin.x : origin.y, other = this.xAxis ? origin.y : origin.x;
    // Compare the same coordinate difference as outsideAcquisition, avoiding
    // cancellation from first constructing origin +/- bound at extreme scales.
    let low = 0, high = this.entries.length;
    while (low < high) { const mid = (low + high) >>> 1; if (this.entries[mid].axis - axis < -bound) low = mid + 1; else high = mid; }
    const start = low; high = this.entries.length;
    while (low < high) { const mid = (low + high) >>> 1; if (this.entries[mid].axis - axis <= bound) low = mid + 1; else high = mid; }
    const end = low;
    // Dense windows seldom amortize sorting a subset back to roster order.
    if ((end - start) * 4 >= this.length * 3) return this.ships;
    const orders: number[] = [];
    for (let i = start; i < end; i++) if (Math.abs(this.entries[i].other - other) <= bound) orders.push(this.entries[i].order);
    orders.sort((a, b) => a - b);
    return orders.map(order => this.ships[order]);
  }
}
