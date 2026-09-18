/** Session-local wall-cost guard, not a simulation-rate controller.
 * Every probe/trial still executes one full 1/60 authority step. A losing owner
 * path is retired instead of making a low-load room pay worker overhead forever.
 */
export class HostAiBudget {
  private serialMs = 0;
  private parallelMs = 0;
  private serialCount = 0;
  private parallelCount = 0;
  private attempts = 0;
  private lastRejectedParallelMs = 0;
  private pausedUntil = 0;
  private reasonValue = 'warming-up';
  get status() { return { reason: this.reasonValue, serialMs: this.serialMs,
    parallelMs: this.parallelMs, lastRejectedParallelMs: this.lastRejectedParallelMs, serialSamples: this.serialCount, parallelSamples: this.parallelCount }; }
  allow(ships: number, now: number): boolean {
    if (ships < 32) { this.reasonValue = 'small-fleet-serial'; return false; }
    if (now < this.pausedUntil) { this.reasonValue = 'no-measured-benefit'; return false; }
    if (this.serialCount < 24) { this.reasonValue = 'warming-up'; return false; }
    if (this.serialMs < 4) { this.reasonValue = 'low-cost-serial'; return false; }
    // Periodic real serial steps update the comparison as ships die or fighting grows.
    if (++this.attempts % 8 === 0) return false;
    this.reasonValue = this.parallelCount < 12 ? 'measuring-workers' : 'workers-with-cost-guard';
    return true;
  }
  /** Return true to dispose a slower pool AFTER its current batch has finished. */
  record(ms: number, usedOwners: boolean, now: number): boolean {
    if (!Number.isFinite(ms) || ms < 0) return false;
    if (usedOwners) {
      this.parallelMs = this.parallelCount++ ? this.parallelMs * .8 + ms * .2 : ms;
      if (this.parallelCount >= 12 && this.serialCount >= 24
        && this.parallelMs > this.serialMs * 1.15 + .5) {
        this.pausedUntil = now + 10000;
        this.lastRejectedParallelMs = this.parallelMs;
        this.parallelCount = 0;
        this.parallelMs = 0;
        this.reasonValue = 'no-measured-benefit';
        return true;
      }
    } else { this.serialMs = this.serialCount++ ? this.serialMs * .9 + ms * .1 : ms; }
    return false;
  }
  reset(): void {
    this.serialMs = this.parallelMs = this.serialCount = this.parallelCount = this.attempts = this.pausedUntil = this.lastRejectedParallelMs = 0;
    this.reasonValue = 'warming-up';
  }
}
