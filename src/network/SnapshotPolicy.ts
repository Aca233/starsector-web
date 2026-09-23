import config from "./protocol.json";

/** Small Worker-local telemetry, independent of delivery of a world snapshot.
 * Step/callback timings are wall time, not CPU samples or server RTT. */
export interface HostPerformance {
  capturePlans?: {enabled:boolean;hits:number;compiled:number;fallbacks:number;shapes:number};
  serializer?: {enabled:boolean;reason:string;ready:boolean;busy:boolean;submitted:number;completed:number;cancelled:number;fallbacks:number;prepareMs:number;workerMs:number;tapeBytes:number;transferBytes:number;ageMs:number};
  captureReuse?: { produced: number; reused: number; encodedFragments?: number; retained: boolean };
  io?: { enabled: boolean; sharedCredit?: boolean; sharedCompletions?: number; sent: number; skipped: number; inputs: number; inflight: number; displaySounds: number; flow: import("./SnapshotFlow.mjs").FlowSample };
  flow?: import("./SnapshotFlow.mjs").FlowSample;
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
