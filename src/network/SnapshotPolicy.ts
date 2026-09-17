/** Relay and host stay lightweight: only snapshot pacing changes, never physics dt. */
export type SnapshotHz = 2 | 5 | 10 | 20;
export function complexitySnapshotHz(activeShips: number, activeCraft: number, captureMs: number): SnapshotHz {
  if (activeShips > 128 || captureMs > 100) return 2;
  if (activeShips > 32 || activeCraft > 256 || captureMs > 40) return 5;
  if (activeCraft > 100 || captureMs > 20) return 10;
  return 20;
}
export class UplinkPacer {
  hz: SnapshotHz = 20;
  private changed = 0;
  private windowAt = 0;
  private attempts = 0;
  private skipped = 0;
  observe(delivery: string, now: number): SnapshotHz {
    if (delivery !== 'sent' && delivery !== 'skipped') return this.hz;
    this.attempts++;
    if (delivery === 'skipped') this.skipped++;
    if (now - this.windowAt < 1000) return this.hz;
    // A single collision with a tiny control packet is not sustained congestion.
    if (this.skipped >= 3 && this.skipped / this.attempts >= .25) {
      this.hz = this.hz > 10 ? 10 : this.hz > 5 ? 5 : 2;
      this.changed = now;
    } else if (this.skipped <= 1 && now - this.changed >= 10000) {
      this.hz = this.hz < 5 ? 5 : this.hz < 10 ? 10 : 20;
      this.changed = now;
    }
    this.windowAt = now;
    this.attempts = this.skipped = 0;
    return this.hz;
  }
}
/** At most two scheduler/backlog recoveries per minute; never silently slow forever. */
export class HostRecoveryBudget {
  private recovered: number[] = [];
  allow(now: number, pauseMs: number): boolean {
    this.recovered = this.recovered.filter(time => now - time < 60000);
    if (pauseMs > 10000 || this.recovered.length >= 2) return false;
    this.recovered.push(now);
    return true;
  }
}
