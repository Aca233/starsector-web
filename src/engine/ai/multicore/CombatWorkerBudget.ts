/** Session-local wall-cost guard, not a simulation-rate controller.
 * Every probe/trial still executes one full 1/60 authority step. A losing owner
 * path is retired instead of making a low-load room pay worker overhead forever.
 */
export class CombatWorkerBudget {
  constructor(private readonly retryDelayMs = 10000, private readonly freshSerialProbes = false) {}
  private serialMs = 0;
  private parallelMs = 0;
  private serialCount = 0;
  private parallelCount = 0;
  private attempts = 0;
  // Optional local calibration: cold serial warm-up must not be the comparison
  // baseline for an already-warm owner trial. LAN retains its existing policy.
  private serialProbeCount = 0;
  private parallelStarted = false;
  private trialAllowed = false;
  private observedShips = 0;
  private lastRejectedShips = 0;
  private lastRejectedSerialMs = 0;
  private lastRejectedParallelMs = 0;
  private pausedUntil = 0;
  private reasonValue = 'warming-up';
  get status() { return { reason: this.reasonValue, serialMs: this.serialMs,
    parallelMs: this.parallelMs, lastRejectedParallelMs: this.lastRejectedParallelMs, serialSamples: this.serialCount, parallelSamples: this.parallelCount, serialProbeSamples: this.serialProbeCount, lastRejectedSerialMs: this.lastRejectedSerialMs, lastRejectedShips: this.lastRejectedShips }; }
  allow(ships: number, now: number): boolean {
    this.observedShips = ships;
    if (ships < 32) { this.reasonValue = 'small-fleet-serial'; return false; }
    if (now < this.pausedUntil) { this.reasonValue = 'no-measured-benefit'; return false; }
    // A timer alone is not evidence that the same losing workload improved.
    // After the minimum cooldown, reconsider when the fleet changes or current
    // serial work has grown materially. Once admitted, finish the whole trial.
    if (this.freshSerialProbes && !this.trialAllowed && this.lastRejectedParallelMs > 0
      && ships === this.lastRejectedShips && this.serialMs < this.lastRejectedSerialMs * 1.25) {
      this.reasonValue = 'no-measured-benefit'; return false;
    }
    if (this.serialCount < 24) { this.reasonValue = 'warming-up'; return false; }
    if (this.serialMs < 4) { this.reasonValue = 'low-cost-serial'; return false; }
    // Periodic real serial steps update the comparison as ships die or fighting grows.
    if (++this.attempts % 8 === 0) return false;
    this.trialAllowed = true;
    this.reasonValue = this.parallelCount < 12 || this.freshSerialProbes && this.serialProbeCount < 3 ? 'measuring-workers' : 'workers-with-cost-guard';
    return true;
  }
  /** Return true to dispose a slower pool AFTER its current batch has finished. */
  record(ms: number, usedOwners: boolean, now: number): boolean {
    if (!Number.isFinite(ms) || ms < 0) return false;
    if (usedOwners) {
      this.parallelStarted = true;
      this.parallelMs = this.parallelCount++ ? this.parallelMs * .8 + ms * .2 : ms;
      if (this.parallelCount >= 12 && this.serialCount >= 24
        && (!this.freshSerialProbes || this.serialProbeCount >= 3)
        && this.parallelMs > this.serialMs * 1.15 + .5) {
        this.pausedUntil = now + this.retryDelayMs;
        this.lastRejectedParallelMs = this.parallelMs;
        this.lastRejectedSerialMs = this.serialMs; this.lastRejectedShips = this.observedShips;
        this.trialAllowed = false;
        this.parallelStarted = false; this.serialProbeCount = 0;
        this.parallelCount = 0;
        this.parallelMs = 0;
        this.reasonValue = 'no-measured-benefit';
        return true;
      }
    } else {
      if (this.freshSerialProbes && this.parallelStarted) {
        // The first genuine serial probe replaces cold warm-up costs, then use
        // a short EMA of interleaved full steps. Require three probes before
        // rejecting, so one scheduler/GC outlier is not the whole baseline.
        this.serialMs = this.serialProbeCount++ ? this.serialMs * .5 + ms * .5 : ms;
        this.serialCount++;
      } else this.serialMs = this.serialCount++ ? this.serialMs * .9 + ms * .1 : ms;
    }
    return false;
  }
  reset(): void {
    this.serialMs = this.parallelMs = this.serialCount = this.parallelCount = this.attempts = this.pausedUntil = this.lastRejectedParallelMs = 0;
    this.serialProbeCount = 0; this.parallelStarted = this.trialAllowed = false;
    this.observedShips = this.lastRejectedShips = this.lastRejectedSerialMs = 0;
    this.reasonValue = 'warming-up';
  }
}
