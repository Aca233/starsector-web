import config from "./protocol.json";

/** Small Worker-local telemetry, independent of delivery of a world snapshot.
 * Step/callback timings are wall time, not CPU samples or server RTT. */
export interface HostPerformance {
  tick: number;
  callbackGapMs: number;
  lastStepMs: number;
  maxStepMs: number;
  backlogMs: number;
  simulationMs: number;
  captureMs: number;
  encodeMs: number;
  realtimeRatio?: number;
  combatRate?: number;
}

/** Requested wire cadence, not measured receive throughput. Backpressure still
 * bounds queued snapshots; neither fleet size nor CPU estimates lower this target. */
export const LAN_SNAPSHOT_HZ = config.snapshotHz;

/** Count accepted snapshots in an actual trailing second, never clamp the
 * interval to a target rate. Initial/reconnected windows remain unmeasured. */
export class SnapshotReceiveRate {
  private times: number[] = [];
  private startedAt: number | null = null;
  receive(now: number): void {
    this.startedAt ??= now;
    this.times.push(now);
    this.prune(now);
  }
  sample(now: number): number | null {
    this.prune(now);
    return this.startedAt === null || now - this.startedAt < 1000 ? null : this.times.length;
  }
  reset(): void { this.times = []; this.startedAt = null; }
  private prune(now: number): void {
    while (this.times.length && this.times[0] <= now - 1000) this.times.shift();
  }
}

/** At most two scheduler/backlog recoveries per minute; never silently slow forever. */
export class HostRecoveryBudget {
  private recovered: number[] = [];
  allow(now: number, pauseMs: number, backgroundPause = false): boolean {
    // Only scheduler suspension is exempt; physics backlog still uses the budget.
    if (backgroundPause && pauseMs <= config.backgroundGraceMs) return true;
    this.recovered = this.recovered.filter(time => now - time < 60000);
    if (pauseMs > 10000 || this.recovered.length >= 2) return false;
    this.recovered.push(now);
    return true;
  }
}
