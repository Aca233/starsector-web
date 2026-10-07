import type { Vector2 } from '../math/Vector2';

interface Contact { pos: Pick<Vector2, 'x' | 'y'>; vel: Pick<Vector2, 'x' | 'y'> }
interface Entry { axis: number; other: number; order: number }

/** Per-shooter acquisition observation. A conservative envelope for constant-speed
 * intercepts, not a hit result. Every selected contact still needs exact checks. */
export class AcquisitionRangeIndex<T extends Contact> {
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
  constructor(private readonly contacts: readonly T[], extent: (contact: T) => number) {
    this.length = contacts.length;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let order = 0; order < contacts.length; order++) {
      const contact = contacts[order], x = contact.pos.x, y = contact.pos.y, vx = contact.vel.x, vy = contact.vel.y;
      const radius = extent(contact);
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
  query(origin: Vector2, velocity: Vector2, range: number, speed: number, delay: number, beam: boolean): readonly T[] {
    if (!this.valid || this.contacts.length !== this.length || !this.entries.length
      || !(range >= 0 && speed > 0 && delay >= 0) || !Number.isFinite(range) || !Number.isFinite(speed) || !Number.isFinite(delay)
      || !Number.isFinite(origin.x) || !Number.isFinite(origin.y) || !Number.isFinite(velocity.x) || !Number.isFinite(velocity.y)) return this.contacts;
    const limit = range + this.radius;
    const horizon = delay + (beam ? 0 : limit / speed);
    const relativeSpeed = Math.max(Math.abs(this.minVx - velocity.x), Math.abs(this.maxVx - velocity.x))
      + Math.max(Math.abs(this.minVy - velocity.y), Math.abs(this.maxVy - velocity.y));
    const reach = limit + relativeSpeed * horizon;
    const pad = 2e-6 * Math.max(this.magnitude, Math.abs(origin.x), Math.abs(origin.y), Math.abs(reach));
    const bound = reach + pad;
    if (!Number.isFinite(bound)) return this.contacts;
    const axis = this.xAxis ? origin.x : origin.y, other = this.xAxis ? origin.y : origin.x;
    let low = 0, high = this.entries.length;
    while (low < high) { const mid = (low + high) >>> 1; if (this.entries[mid].axis - axis < -bound) low = mid + 1; else high = mid; }
    const start = low; high = this.entries.length;
    while (low < high) { const mid = (low + high) >>> 1; if (this.entries[mid].axis - axis <= bound) low = mid + 1; else high = mid; }
    const end = low;
    // Dense results retain the original scan rather than paying to reorder most contacts.
    if ((end - start) * 4 >= this.length * 3) return this.contacts;
    const orders: number[] = [];
    for (let i = start; i < end; i++) if (Math.abs(this.entries[i].other - other) <= bound) orders.push(this.entries[i].order);
    orders.sort((a, b) => a - b);
    return orders.map(order => this.contacts[order]);
  }
}
