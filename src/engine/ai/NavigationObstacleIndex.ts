import type { Ship } from '../simulation/Ship';

interface Entry { ship: Ship; order: number; x: number; y: number }
/** Internal, phase-local broadphase for a closed native AI phase. Motion and
 * activation effects run after this phase; its owner invalidates each updated
 * ship and closes before physical integration. Never grants that ownership. */
export class NavigationObstacleIndex {
  private active = true;
  private readonly length: number;
  private entries: Entry[] | undefined;
  private rows = new Map<Ship, Entry>();
  private radius = -Infinity;
  private speed = -Infinity;
  private magnitude = 1;
  constructor(private readonly ships: readonly Ship[]) { this.length = ships.length; }

  private bound(ship: Ship): void {
    // Include even disabled/phase shields: toggling activity must not shrink the
    // conservative envelope. Dynamic activation/phase eligibility is read live.
    this.radius = Math.max(this.radius, 0, ship.spec.collisionRadius, ship.shield.radius);
    this.speed = Math.max(this.speed, Math.abs(ship.vel.x) + Math.abs(ship.vel.y));
  }
  private build(): void {
    this.entries = [];
    for (let order = 0; order < this.ships.length; order++) {
      const ship = this.ships[order], x = ship.pos.x, y = ship.pos.y;
      if (!Number.isFinite(x) || !Number.isFinite(y)) { this.close(); return; }
      const row = { ship, order, x, y }; this.entries.push(row); this.rows.set(ship, row);
      this.magnitude = Math.max(this.magnitude, Math.abs(x), Math.abs(y)); this.bound(ship);
    }
    this.entries.sort((a, b) => a.x - b.x || a.order - b.order);
  }
  /** Same membership/order, never a fixed-step cache of live eligibility. */
  select(ships: readonly Ship[], x: number, y: number, radius: number, maxSpeed: number, speed: number, horizon: number): readonly Ship[] | undefined {
    if (!this.active || ships !== this.ships || ships.length !== this.length || horizon < 0) return;
    if (!this.entries) this.build();
    if (!this.active) return;
    const reach = radius + this.radius + (maxSpeed + speed + this.speed) * horizon;
    if (!(reach >= 0) || !Number.isFinite(reach) || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const padding = 1e-9 * Math.max(this.magnitude, Math.abs(x), Math.abs(y), reach);
    const low = x - reach - padding, high = x + reach + padding, vertical = reach + padding;
    if (!Number.isFinite(low) || !Number.isFinite(high) || !Number.isFinite(vertical)) return;
    const entries = this.entries!;
    let left = 0, right = entries.length;
    while (left < right) { const middle = (left + right) >>> 1; if (entries[middle].x < low) left = middle + 1; else right = middle; }
    const first = left; right = entries.length;
    while (left < right) { const middle = (left + right) >>> 1; if (entries[middle].x <= high) left = middle + 1; else right = middle; }
    // Sorting a nearly complete result loses the benefit; exact original scan
    // is always a valid fallback, and never depends on truncating a candidate cap.
    if (left - first > entries.length * .8) return;
    const nearby: Entry[] = [];
    for (let i = first; i < left; i++) if (Math.abs(entries[i].y - y) <= vertical) nearby.push(entries[i]);
    nearby.sort((a, b) => a.order - b.order);
    return nearby.map(row => row.ship);
  }
  invalidate(ship: Ship): void {
    if (!this.active || !this.entries) return;
    const row = this.rows.get(ship);
    if (!row) { this.close(); return; }
    // Be defensive even though current native AI doesn't advance positions.
    if (!Object.is(row.x, ship.pos.x) || !Object.is(row.y, ship.pos.y)) { this.close(); return; }
    this.bound(ship);
  }
  close(): void { this.active = false; this.entries = undefined; this.rows.clear(); }
}
