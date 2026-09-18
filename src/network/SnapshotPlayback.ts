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
      // Start one snapshot behind. Thereafter advance in real time, not over an
      // EMA packet interval (which used to stretch/compress motion on every packet).
      const span = Math.max(3, this.current.tick - this.previousTick);
      const backlog = (newest?.tick ?? this.current.tick) - this.cursor;
      if (this.segmented) this.cursor += gap * .06 * (backlog > Math.max(6, span * 1.5) ? 1.1 : 1);
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
