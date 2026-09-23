/** Sequential wall-clock slices of the REAL scheduled simulation, not CPU usage.
 * Worker kernel time overlaps `wait` and must never be added to these slices. */
export const COMBAT_STEP_PHASES = [
  'input', 'dispatch', 'wait', 'sessionSetup', 'enginePrelude', 'fleetAI',
  'shipsWeapons', 'wingsDrones', 'terrainStatus', 'shipCollision',
  'projectilesBeams', 'trailsMinesFX', 'aftermath', 'sessionRestore', 'finalize'
] as const;
export type CombatStepPhase = typeof COMBAT_STEP_PHASES[number];
export type StepOutcome = 'completed' | 'error' | 'discarded';
export interface StepProfileOptions { sampleEvery?: number; capacity?: number }
export interface StepProfileContext { reason: string; commits?: number; fallbacks?: number }
const phaseIndex = new Map(COMBAT_STEP_PHASES.map((name, i) => [name, i]));
const outcomes: StepOutcome[] = ['completed', 'error', 'discarded'];
const stride = COMBAT_STEP_PHASES.length;

function distribution(values: number[]) {
  if (!values.length) return null;
  values.sort((a, b) => a - b);
  const percentile = (p: number) => values[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)];
  return { mean: values.reduce((a, b) => a + b, 0) / values.length,
    p50: percentile(.5), p95: percentile(.95), p99: percentile(.99), max: values[values.length - 1] };
}

/** Opt-in, bounded diagnostics. Nothing is attached to CombatEngine/Ship or snapshots.
 * Buffers are allocated on enable; only one tiny span object per sampled attempt.
 * Report aggregation/allocations occur on demand, never on a simulation tick. */
export class CombatStepProfiler {
  public readonly sampleEvery: number;
  public readonly capacity: number;
  private readonly durations: Float64Array;
  private readonly totals: Float64Array;
  private readonly sequences: Float64Array;
  private readonly dt: Float64Array;
  private readonly status: Uint8Array;
  private readonly predictions: Uint8Array;
  private readonly commits: Float64Array;
  private readonly fallbacks: Float64Array;
  private readonly reasons: string[];
  private attempts = 0;
  private recorded = 0;
  private active?: CombatStepSpan;

  constructor(options: StepProfileOptions = {}, private readonly clock = () => performance.now()) {
    this.sampleEvery = options.sampleEvery ?? 10;
    this.capacity = options.capacity ?? 600;
    if (!Number.isInteger(this.sampleEvery) || this.sampleEvery < 1 || this.sampleEvery > 600
      || !Number.isInteger(this.capacity) || this.capacity < 1 || this.capacity > 10000) {
      throw new RangeError('Step profiling requires sampleEvery 1..600 and capacity 1..10000');
    }
    this.durations = new Float64Array(this.capacity * stride);
    this.totals = new Float64Array(this.capacity);
    this.sequences = new Float64Array(this.capacity);
    this.dt = new Float64Array(this.capacity);
    this.status = new Uint8Array(this.capacity);
    this.predictions = new Uint8Array(this.capacity);
    this.commits = new Float64Array(this.capacity);
    this.fallbacks = new Float64Array(this.capacity);
    this.reasons = new Array<string>(this.capacity).fill('unknown');
  }

  public begin(dt: number): CombatStepSpan | undefined {
    // One authority attempt at a time. Do not corrupt a pending async sample.
    if (this.active) return undefined;
    const sequence = ++this.attempts;
    if ((sequence - 1) % this.sampleEvery) return undefined;
    const slot = this.recorded % this.capacity;
    this.durations.fill(0, slot * stride, (slot + 1) * stride);
    this.sequences[slot] = sequence;
    this.dt[slot] = dt;
    const span = new CombatStepSpan(this.durations, slot * stride, this.clock, (outcome, prediction, total, context) => {
      if (this.active !== span) return;
      this.totals[slot] = total;
      this.status[slot] = outcomes.indexOf(outcome);
      this.predictions[slot] = Number(prediction);
      this.commits[slot] = context?.commits ?? 0;
      this.fallbacks[slot] = context?.fallbacks ?? 0;
      this.reasons[slot] = context?.reason ?? outcome;
      this.recorded++;
      this.active = undefined;
    });
    this.active = span;
    return span;
  }

  public reset(): void {
    this.active?.finish('discarded');
    this.attempts = 0;
    this.recorded = 0;
  }

  public getReport() {
    // A pending row can overwrite the oldest committed row in a full ring.
    // Exclude that leased row until finish; never expose partial timing as a tick.
    const count = Math.min(this.recorded, this.capacity - Number(!!this.active));
    const rows = Array.from({ length: count }, (_, i) => (this.recorded - count + i) % this.capacity);
    const completed = rows.filter(i => this.status[i] === 0);
    const reasons: Record<string, number> = Object.create(null);
    for (const i of rows) reasons[this.reasons[i]] = (reasons[this.reasons[i]] ?? 0) + 1;
    return {
      unit: 'wall-ms' as const, scope: 'scheduled simulation; excludes visual update and render' as const,
      sampleEvery: this.sampleEvery, capacity: this.capacity, attempts: this.attempts,
      recorded: this.recorded, retained: rows.length, pending: !!this.active,
      overwritten: Math.max(0, this.recorded - this.capacity), completed: completed.length,
      errors: rows.filter(i => this.status[i] === 1).length,
      discarded: rows.filter(i => this.status[i] === 2).length,
      predictionSamples: rows.reduce((n, i) => n + this.predictions[i], 0),
      workerCommits: rows.reduce((n, i) => n + this.commits[i], 0),
      workerFallbacks: rows.reduce((n, i) => n + this.fallbacks[i], 0), reasons,
      total: distribution(completed.map(i => this.totals[i])),
      phases: Object.fromEntries(COMBAT_STEP_PHASES.map((name, phase) =>
        [name, distribution(completed.map(i => this.durations[i * stride + phase]))])),
      samples: rows.map(i => ({ sequence: this.sequences[i], dt: this.dt[i], outcome: outcomes[this.status[i]],
        prediction: !!this.predictions[i], reason: this.reasons[i], totalMs: this.totals[i] }))
    };
  }
}

export class CombatStepSpan {
  public predictionRequested = false;
  private active = true;
  private phase = 0;
  private readonly started: number;
  private last: number;
  constructor(private readonly data: Float64Array, private readonly offset: number,
    private readonly clock: () => number,
    private readonly commit: (outcome: StepOutcome, prediction: boolean, total: number, context?: StepProfileContext) => void) {
    this.started = this.last = clock();
  }
  public mark(phase: CombatStepPhase): void {
    if (!this.active) return;
    const now = this.clock();
    this.data[this.offset + this.phase] += now - this.last;
    this.last = now;
    this.phase = phaseIndex.get(phase)!;
  }
  public finish(outcome: StepOutcome, context?: StepProfileContext): void {
    if (!this.active) return;
    const now = this.clock();
    this.data[this.offset + this.phase] += now - this.last;
    this.active = false;
    this.commit(outcome, this.predictionRequested, now - this.started, context);
  }
}
