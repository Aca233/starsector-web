import type { CombatSnapshot } from './CombatSnapshot';

/** A bounded, tick-based display clock. Packet arrival never restarts an animation.
 * No simulation/extrapolation: when authority stops, presentation stops too. */
export class SnapshotPlayback {
  private queue: CombatSnapshot[] = [];
  private current: CombatSnapshot | null = null;
  private previousTick = 0;
  private previousTime = 0;
  private cursor = 0;
  private lastAt: number | null = null;
  private receivedTick = -1;
  private segmented = false;
  // Tick progress per observed delivery, not per packet: a relay may release
  // several 60 Hz packets together. Only small numeric histories are retained.
  private intervals: number[] = [];
  private cadence = 1;
  private sampledTick = -1;
  private phases: number[] = [];
  private jitter = 1;

  push(frame: CombatSnapshot): boolean {
    if (frame.tick <= this.receivedTick) return false;
    this.receivedTick = frame.tick;
    this.queue.push(frame);
    // The producer/relay still has its own backpressure. Never retain seconds of
    // megabyte world snapshots when a tab is hidden or the renderer is blocked.
    if (this.queue.length > 8) this.queue.splice(0, this.queue.length - 8);
    return true;
  }

  sample(now: number, immediate = false) {
    const gap = this.lastAt === null ? 0 : Math.max(0, now - this.lastAt);
    this.lastAt = now;
    // Use an upper quantile of recent delivery spans so isolated loss/stalls do
    // not become the permanent buffer size, while sustained low rates do adapt.
    if (this.receivedTick > this.sampledTick) {
      if (this.sampledTick >= 0) {
        this.intervals.push(this.receivedTick - this.sampledTick);
        if (this.intervals.length > 32) this.intervals.shift();
        const sorted = [...this.intervals].sort((a, b) => a - b);
        this.cadence = sorted[Math.floor((sorted.length - 1) * .9)];
      }
      // Arrival phase spread measures jitter without clock synchronization.
      // Keep 1..2 ticks of guard, rather than following individual packet times.
      this.phases.push(now * .06 - this.receivedTick);
      if (this.phases.length > 32) this.phases.shift();
      const phases = [...this.phases].sort((a, b) => a - b);
      const spread = phases[Math.floor((phases.length - 1) * .9)] - phases[Math.floor((phases.length - 1) * .1)];
      this.jitter = Math.max(1, Math.min(2, Math.ceil(spread - 1e-6)));
      this.sampledTick = this.receivedTick;
    }
    const newest = this.queue.at(-1);
    const reset = !!newest && (!this.current || immediate || gap > 500 || newest.tick - this.cursor > 60);
    const frames: CombatSnapshot[] = [];
    if (reset) {
      this.queue.length = 0;
      this.current = newest!;
      this.previousTick = this.cursor = newest!.tick;
      this.previousTime = newest!.world.combatTime;
      this.segmented = false;
      frames.push(newest!);
    } else if (this.current) {
      const latestTick = newest?.tick ?? this.current.tick;
      // At stable 60 Hz: target <= 2 ticks (33 ms), hard ceiling 6 (100 ms).
      // This is a ceiling/repair target, not a mandatory added delay: ordinary
      // one-tick-behind playback stays exactly 1x; never rewind to fill a buffer.
      const target = this.cadence + this.jitter;
      const limit = Math.max(6, this.cadence * 2 + 2);
      const advance = gap * .06;
      if (this.segmented) {
        this.cursor += advance;
        // Correct only the debt LEFT AFTER normal advancement. Comparing the
        // pre-advance backlog leaves a rate-dependent, persistent extra tick.
        const excess = latestTick - this.cursor - target;
        if (excess > 0) this.cursor += Math.min(advance * .1, excess);
      }
      // Severe debt is stale presentation, not physics to resimulate. Skip it
      // within known authority, then retain the actual bracketing endpoints.
      // A low delivery rate gets a proportional bound, not a forced 60 Hz jump.
      if (latestTick - this.cursor > limit) this.cursor = latestTick - target;
      while (this.queue.length && this.cursor >= this.current.tick) {
        this.previousTick = this.current.tick;
        this.previousTime = this.current.world.combatTime;
        this.current = this.queue.shift()!;
        this.segmented = true;
        frames.push(this.current);
      }
      this.cursor = Math.min(this.cursor, this.current.tick);
    }
    const span = (this.current?.tick ?? 0) - this.previousTick;
    const alpha = span > 0 ? Math.max(0, Math.min(1, (this.cursor - this.previousTick) / span)) : 1;
    return {
      // A stalled RAF needs only the final pair of endpoints, not eight expensive
      // world restorations in a burst. Discrete authority is never simulated here.
      frames: frames.length > 2 ? frames.slice(-2) : frames, reset, alpha,
      visualTime: this.previousTime + ((this.current?.world.combatTime ?? this.previousTime) - this.previousTime) * alpha,
      delayMs: Math.max(0, this.receivedTick - this.cursor) * 1000 / 60,
    };
  }
}
