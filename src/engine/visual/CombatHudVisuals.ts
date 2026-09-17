import type { Ship } from '../simulation/Ship';

/** Player-console flux warning: _return + renderers/A/I + graphics/util/Fader. */
export class CombatHudVisuals {
  private player: Ship | undefined;
  private phase: 'in' | 'out' | null = null;
  private bounceUp = false;
  private brightness = 0;

  public readonly readFluxFlash = (): number => this.brightness;

  public reset(): void {
    this.player = undefined;
    this.phase = null;
    this.bounceUp = false;
    this.brightness = 0;
  }

  public update(player: Ship, dt: number): void {
    if (player !== this.player) { this.reset(); this.player = player; }
    const enabled = player.flux.fluxPercent > 0.9 || player.flux.isOverloaded || player.flux.isVenting;
    if (enabled && this.phase === null) {
      this.phase = 'in';
      this.bounceUp = true;
      this.brightness = 0;
    } else if (!enabled) {
      // stopFlashing disables the next bounce-up; it does not snap to zero.
      this.bounceUp = false;
    }
    if (dt <= 0 || this.phase === null) return;
    // Native Fader changes direction on the following advance, retaining its
    // one-step endpoint hold instead of substituting a sine/CSS wall-clock pulse.
    const delta = Math.fround(Math.fround(dt) / 0.25);
    if (this.phase === 'in') {
      if (this.brightness === 1) this.phase = 'out';
      else this.brightness = Math.min(1, Math.fround(this.brightness + delta));
    } else {
      if (this.brightness === 0) this.phase = this.bounceUp ? 'in' : null;
      else this.brightness = Math.max(0, Math.fround(this.brightness - delta));
    }
  }
}
