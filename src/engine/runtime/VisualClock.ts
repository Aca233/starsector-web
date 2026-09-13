export class VisualClock {
  private timeSeconds = 0;
  private paused = false;

  public get time(): number { return this.timeSeconds; }
  public get isPaused(): boolean { return this.paused; }
  public advance(dt: number): void { if (!this.paused) this.timeSeconds += Math.max(0, dt); }
  public seek(seconds: number): void { this.timeSeconds = Math.max(0, seconds); }
  public reset(): void { this.timeSeconds = 0; this.paused = false; }
  public setPaused(paused: boolean): void { this.paused = paused; }
}
