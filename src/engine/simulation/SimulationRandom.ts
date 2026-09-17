/** Stateful deterministic random/ID source owned by one combat simulation. */
export class SimulationRandom {
  private initialSeed: number;
  private state: number;
  private idCounter = 0;

  constructor(seed = 0x51a7e5ed) {
    this.initialSeed = seed >>> 0;
    this.state = this.initialSeed;
  }

  public reset(seed = this.initialSeed): void {
    this.initialSeed = seed >>> 0;
    this.state = this.initialSeed;
    this.idCounter = 0;
  }

  public next(): number {
    let t = (this.state += 0x6d2b79f5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  }

  public shuffle<T>(values: T[]): void {
    for (let i=values.length-1;i>0;i--) { const j=Math.floor(this.next()*(i+1)); [values[i],values[j]]=[values[j],values[i]]; }
  }

  public nextNumericId(): number {
    this.idCounter += 1;
    return this.idCounter;
  }

  public nextId(prefix: string): string {
    this.idCounter += 1;
    return `${prefix}_${this.idCounter.toString(36)}`;
  }
}

