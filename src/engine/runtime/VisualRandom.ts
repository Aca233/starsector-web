/** Stateless seeded visual noise: the same seed/channel/index always matches. */
export class VisualRandom {
  constructor(public seed = 0x51f15e) {}

  public reseed(seed: number): void { this.seed = seed >>> 0; }

  public sample(channel: string, index = 0): number {
    let h = (2166136261 ^ this.seed ^ (index * 0x9e3779b9)) >>> 0;
    for (let i = 0; i < channel.length; i++) {
      h ^= channel.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    h ^= h >>> 16;
    h = Math.imul(h, 0x7feb352d) >>> 0;
    h ^= h >>> 15;
    h = Math.imul(h, 0x846ca68b) >>> 0;
    h ^= h >>> 16;
    return h / 0x100000000;
  }

  public signed(channel: string, index = 0): number { return this.sample(channel, index) * 2 - 1; }
  public frame(channel: string, time: number, hz = 60): number {
    return this.sample(channel, Math.floor(Math.max(0, time) * hz));
  }
}
