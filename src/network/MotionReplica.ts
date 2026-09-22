import { Vector2 } from '../engine/math/Vector2';
import { setShipPresentationPose } from '../engine/visual/ShipPresentation';
import type { Ship } from '../engine/simulation/Ship';
import type { CombatEngine } from '../engine/simulation/CombatEngine';
import type { MotionFrame, MotionRow } from './MotionFrame.mjs';
/** Two small authority endpoints, not complete-world replacements. All writes
 * go to render-only poses. No HP, weapon, collision, AI or world tick mutation. */
export class MotionReplica {
  private current: MotionFrame | null = null;
  private previous: MotionFrame | null = null;
  private receivedAt: number | null = null;
  private shown = new Set<Ship>();
  get tick() { return this.current?.tick ?? -1; }
  age(now: number) { return this.receivedAt === null ? null : Math.max(0, now - this.receivedAt); }
  fresh(now: number, worldTick: number) { return this.current !== null && this.tick >= worldTick && this.receivedAt !== null && now - this.receivedAt <= 250; }
  receive(frame: MotionFrame, now: number, worldTick: number) {
    if (frame.tick <= this.tick || frame.tick < worldTick || !Number.isFinite(now)) return false;
    this.previous = this.current; this.current = frame; this.receivedAt = now; return true;
  }
  row(id: string, now: number, worldTick: number): MotionRow | undefined {
    return this.fresh(now, worldTick) ? this.current!.ships.find(s => s[0] === id) : undefined;
  }
  clear() {
    for (const ship of this.shown) setShipPresentationPose(ship, null);
    this.shown.clear(); this.current = this.previous = null; this.receivedAt = null;
  }
  render(engine: CombatEngine, now: number, worldTick: number) {
    for (const ship of this.shown) setShipPresentationPose(ship, null);
    this.shown.clear();
    if (!this.fresh(now, worldTick)) return;
    const latest = this.current!, previous = this.previous, old = new Map(previous?.ships.map(s => [s[0], s]));
    const elapsed = Math.max(0, now - this.receivedAt!);
    // One-tick display buffer; capped dead reckoning is visual only, never a new
    // received packet/ACK. Hold at 100ms, invalidate at 250ms, no indefinite drift.
    const targetTick = latest.tick + elapsed * .06 - 1;
    const span = previous ? latest.tick - previous.tick : 0;
    const alpha = span > 0 ? Math.max(0, Math.min(1, (targetTick - previous!.tick) / span)) : 1;
    const extra = Math.min(.1, Math.max(0, (targetTick - latest.tick) / 60));
    const known = new Map(engine.allCapitalShips.map(s => [s.id, s]));
    for (const row of latest.ships) {
      const ship = known.get(row[0]); if (!ship || ship.isDead || ship.isRetreated || row[8]) continue;
      const before = old.get(row[0]);
      const smooth = before && before[7] === row[7] && before[8] === row[8] && Math.hypot(row[1] - before[1], row[2] - before[2]) < Math.max(100, ship.spec.collisionRadius * 2);
      const angle = smooth ? Math.atan2(Math.sin(row[5] - before![5]), Math.cos(row[5] - before![5])) : 0;
      const x = smooth ? before![1] + (row[1] - before![1]) * alpha : row[1];
      const y = smooth ? before![2] + (row[2] - before![2]) * alpha : row[2];
      // A changed teleport epoch snaps exactly; do not extrapolate a jump.
      const drift = smooth || !before ? extra : 0;
      setShipPresentationPose(ship, { pos: new Vector2(x + row[3] * drift, y + row[4] * drift), facing: (smooth ? before![5] + angle * alpha : row[5]) + row[6] * drift });
      this.shown.add(ship);
    }
  }
}
/** Detached read-only motion base for the existing local input replay. */
export function motionAuthority(ship: Ship, row: MotionRow): Ship {
  const replica = Object.create(ship) as Ship;
  replica.pos = new Vector2(row[1], row[2]); replica.vel = new Vector2(row[3], row[4]);
  replica.facingRad = row[5]; replica.angularVelRad = row[6]; replica.teleportSequence = row[7];
  return replica;
}
