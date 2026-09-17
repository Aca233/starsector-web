import type { VisualRandom } from '../runtime/VisualRandom';

/** renderers/damage/oooo_1: randomized EMP texture orientation and pulse envelope. */
export class OverloadFlicker {
  public cycle = -1;
  public angle = 0;
  public duration = 0;
  public peak = 0;
  public brightness = 1;
  private elapsed = 0;

  private next(random: VisualRandom, channel: string): void {
    this.cycle++;
    this.duration = .25 * (.25 + random.sample(channel + ':duration', this.cycle) * .75);
    this.peak = Math.min(1, .5 + random.sample(channel + ':peak', this.cycle) * .75);
    this.angle = random.sample(channel + ':angle', this.cycle) * Math.PI * 2;
    this.brightness = 1;
    this.elapsed = 0;
  }

  public update(dt: number, random: VisualRandom, channel: string): void {
    if (this.cycle < 0) this.next(random, channel);
    if (!(dt > 0)) return;
    this.elapsed += dt;
    if (this.elapsed > this.duration) { this.next(random, channel); return; }
    if (this.elapsed > this.duration / 5) {
      this.brightness = Math.max(0, this.brightness - dt / (this.duration * .8));
    } else this.brightness = 1;
  }

  public get alpha(): number { return this.brightness * this.peak; }
}

/** FluxTracker D.getEMPDisplayMult: full strength until the last .25 seconds. */
export function overloadFade(remaining: number): number {
  return Math.max(0, Math.min(1, remaining / .25));
}

/** I.java: one 128..256 tile, or four 256 tiles at +/-96 for large hulls. */
export function overloadTiles(width: number, height: number): { x: number; y: number; size: number; angle: number }[] {
  const extent = Math.max(width, height);
  if (extent <= 256) return [{ x: 0, y: 0, size: Math.max(128, extent), angle: 0 }];
  return [
    { x: -96, y: -96, size: 256, angle: 0 },
    { x: -96, y: 96, size: 256, angle: Math.PI / 2 },
    { x: 96, y: 96, size: 256, angle: Math.PI },
    { x: 96, y: -96, size: 256, angle: Math.PI * 1.5 },
  ];
}
