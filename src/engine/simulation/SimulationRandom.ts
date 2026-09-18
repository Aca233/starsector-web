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

  /** Reserve only contiguous native next() calls. Repeated addition deliberately
   * matches the old cursor even beyond the safe-integer boundary; a multiply or
   * uint32 truncation here would change long-running simulations. */
  public reserveSamples(count: number): number | null {
    const ownNext=Object.getOwnPropertyDescriptor(this,'next');
    const prototypeNext=Object.getOwnPropertyDescriptor(SimulationRandom.prototype,'next');
    if (Object.getPrototypeOf(this) !== SimulationRandom.prototype || prototypeNext?.value !== nativeNext
      || (ownNext && ownNext.value !== nativeNext) || !Number.isSafeInteger(count) || count < 0 || count > 65536) return null;
    const state = Object.getOwnPropertyDescriptor(this, 'state');
    if (!state || !state.writable || !Object.hasOwn(state, 'value') || !Number.isInteger(state.value) || !Number.isFinite(state.value) || state.value < 0) return null;
    const cursor = state.value;
    for (let i = 0; i < count; i++) this.state += 0x6d2b79f5;
    return cursor;
  }

  /** A private cosmetic replay stream; never substitutes the world's RNG. */
  public static fromCursor(cursor: number): SimulationRandom {
    if (!Number.isFinite(cursor) || !Number.isInteger(cursor) || cursor < 0) throw Error('Invalid random cursor');
    const random = new SimulationRandom(0);
    random.state = cursor;
    return random;
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


const nativeNext = SimulationRandom.prototype.next;
