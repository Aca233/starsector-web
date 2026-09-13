export type PerformanceTimingKey = 'simulationMs' | 'visualUpdateMs' | 'renderPreparationMs' | 'drawSubmitMs';

export interface PerformanceSnapshot {
  simulationMs: number;
  visualUpdateMs: number;
  renderPreparationMs: number;
  drawSubmitMs: number;
  gpuTimeMs: number | null;
  gpuTimerAvailable: boolean;
  projectileCount: number;
  particleCount: number;
  textureCount: number;
  pendingTextureUploads: number;
  textureUploads: number;
  textureInvalidations: number;
  resourceRecreations: number;
  drawCalls: number;
  memoryBytes: number | null;
}

export interface TimingDistribution {
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

export interface PerformanceReport {
  sampleCount: number;
  windowSeconds: number;
  gpuSampleCount: number;
  gpuTimerAvailable: boolean;
  timings: {
    simulationMs: TimingDistribution;
    visualUpdateMs: TimingDistribution;
    renderPreparationMs: TimingDistribution;
    drawSubmitMs: TimingDistribution;
    frameCpuMs: TimingDistribution;
    gpuTimeMs: TimingDistribution | null;
  };
  counts: {
    maxProjectiles: number;
    maxParticles: number;
    maxDrawCalls: number;
  };
  memory: {
    available: boolean;
    startBytes: number | null;
    endBytes: number | null;
    minBytes: number | null;
    maxBytes: number | null;
    deltaBytes: number | null;
  };
  resources: {
    startTextures: number;
    endTextures: number;
    maxTextures: number;
    maxPendingUploads: number;
    uploadsDelta: number;
    invalidationsDelta: number;
    recreationsDelta: number;
  };
}

interface PerformanceSample {
  capturedAtMs: number;
  simulationMs: number;
  visualUpdateMs: number;
  renderPreparationMs: number;
  drawSubmitMs: number;
  gpuTimeMs: number | null;
  gpuTimerAvailable: boolean;
  projectileCount: number;
  particleCount: number;
  textureCount: number;
  pendingTextureUploads: number;
  textureUploads: number;
  textureInvalidations: number;
  resourceRecreations: number;
  drawCalls: number;
  memoryBytes: number | null;
}

export interface FrameTelemetry {
  gpuTimeMs: number | null;
  gpuTimerAvailable: boolean;
  projectileCount: number;
  particleCount: number;
  textureCount: number;
  pendingTextureUploads: number;
  textureUploads: number;
  textureInvalidations: number;
  resourceRecreations: number;
  drawCalls: number;
  memoryBytes: number | null;
}

const ZERO_TIMING = (): Record<PerformanceTimingKey, number> => ({
  simulationMs: 0,
  visualUpdateMs: 0,
  renderPreparationMs: 0,
  drawSubmitMs: 0
});

const EMPTY_DISTRIBUTION = (): TimingDistribution => ({ mean: 0, p50: 0, p95: 0, p99: 0, max: 0 });

/**
 * Browser-main-thread performance telemetry. Timing samples are wall-clock CPU-side
 * measurements. GPU time is populated only by a real EXT_disjoint_timer_query_webgl2
 * result supplied by the renderer.
 */
export class PerformanceMetrics {
  private static readonly MAX_SAMPLES = 12000;

  public snapshot: PerformanceSnapshot = {
    simulationMs: 0,
    visualUpdateMs: 0,
    renderPreparationMs: 0,
    drawSubmitMs: 0,
    gpuTimeMs: null,
    gpuTimerAvailable: false,
    projectileCount: 0,
    particleCount: 0,
    textureCount: 0,
    pendingTextureUploads: 0,
    textureUploads: 0,
    textureInvalidations: 0,
    resourceRecreations: 0,
    drawCalls: 0,
    memoryBytes: null
  };

  private frameTiming: Record<PerformanceTimingKey, number> = ZERO_TIMING();
  private samples: PerformanceSample[] = [];
  private windowStartedAtMs = performance.now();

  private smooth(current: number, sample: number): number {
    return current === 0 ? sample : current * 0.9 + sample * 0.1;
  }

  public recordTiming(key: PerformanceTimingKey, ms: number): void {
    const sample = Math.max(0, ms);
    this.snapshot[key] = this.smooth(this.snapshot[key], sample);
    this.frameTiming[key] += sample;
  }

  public finalizeFrame(telemetry: FrameTelemetry): void {
    this.snapshot.gpuTimeMs = telemetry.gpuTimeMs;
    this.snapshot.gpuTimerAvailable = telemetry.gpuTimerAvailable;
    this.snapshot.projectileCount = telemetry.projectileCount;
    this.snapshot.particleCount = telemetry.particleCount;
    this.snapshot.textureCount = telemetry.textureCount;
    this.snapshot.pendingTextureUploads = telemetry.pendingTextureUploads;
    this.snapshot.textureUploads = telemetry.textureUploads;
    this.snapshot.textureInvalidations = telemetry.textureInvalidations;
    this.snapshot.resourceRecreations = telemetry.resourceRecreations;
    this.snapshot.drawCalls = telemetry.drawCalls;
    this.snapshot.memoryBytes = telemetry.memoryBytes;

    this.samples.push({
      capturedAtMs: performance.now(),
      ...this.frameTiming,
      ...telemetry
    });
    if (this.samples.length > PerformanceMetrics.MAX_SAMPLES) {
      this.samples.splice(0, this.samples.length - PerformanceMetrics.MAX_SAMPLES);
    }
    this.frameTiming = ZERO_TIMING();
  }

  public resetWindow(): void {
    this.samples = [];
    this.frameTiming = ZERO_TIMING();
    this.windowStartedAtMs = performance.now();
  }

  public get sampleCount(): number {
    return this.samples.length;
  }

  public getReport(): PerformanceReport {
    const samples = this.samples;
    const timing = (selector: (sample: PerformanceSample) => number): TimingDistribution => {
      if (samples.length === 0) return EMPTY_DISTRIBUTION();
      return this.distribution(samples.map(selector));
    };
    const gpuValues = samples
      .map((sample) => sample.gpuTimeMs)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const memoryValues = samples
      .map((sample) => sample.memoryBytes)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const first = samples[0];
    const last = samples[samples.length - 1];
    const startMemory = first?.memoryBytes ?? null;
    const endMemory = last?.memoryBytes ?? null;

    return {
      sampleCount: samples.length,
      windowSeconds: samples.length > 1
        ? Math.max(0, (last.capturedAtMs - first.capturedAtMs) / 1000)
        : Math.max(0, (performance.now() - this.windowStartedAtMs) / 1000),
      gpuSampleCount: gpuValues.length,
      gpuTimerAvailable: samples.some((sample) => sample.gpuTimerAvailable),
      timings: {
        simulationMs: timing((sample) => sample.simulationMs),
        visualUpdateMs: timing((sample) => sample.visualUpdateMs),
        renderPreparationMs: timing((sample) => sample.renderPreparationMs),
        drawSubmitMs: timing((sample) => sample.drawSubmitMs),
        frameCpuMs: timing((sample) => sample.simulationMs + sample.visualUpdateMs + sample.renderPreparationMs + sample.drawSubmitMs),
        gpuTimeMs: gpuValues.length > 0 ? this.distribution(gpuValues) : null
      },
      counts: {
        maxProjectiles: this.maxOf(samples, (sample) => sample.projectileCount),
        maxParticles: this.maxOf(samples, (sample) => sample.particleCount),
        maxDrawCalls: this.maxOf(samples, (sample) => sample.drawCalls)
      },
      memory: {
        available: memoryValues.length > 0,
        startBytes: startMemory,
        endBytes: endMemory,
        minBytes: memoryValues.length > 0 ? Math.min(...memoryValues) : null,
        maxBytes: memoryValues.length > 0 ? Math.max(...memoryValues) : null,
        deltaBytes: startMemory != null && endMemory != null ? endMemory - startMemory : null
      },
      resources: {
        startTextures: first?.textureCount ?? 0,
        endTextures: last?.textureCount ?? 0,
        maxTextures: this.maxOf(samples, (sample) => sample.textureCount),
        maxPendingUploads: this.maxOf(samples, (sample) => sample.pendingTextureUploads),
        uploadsDelta: first && last ? Math.max(0, last.textureUploads - first.textureUploads) : 0,
        invalidationsDelta: first && last ? Math.max(0, last.textureInvalidations - first.textureInvalidations) : 0,
        recreationsDelta: first && last ? Math.max(0, last.resourceRecreations - first.resourceRecreations) : 0
      }
    };
  }

  private distribution(values: number[]): TimingDistribution {
    if (values.length === 0) return EMPTY_DISTRIBUTION();
    const sorted = [...values].sort((a, b) => a - b);
    const percentile = (ratio: number) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];
    const total = sorted.reduce((sum, value) => sum + value, 0);
    return {
      mean: total / sorted.length,
      p50: percentile(0.50),
      p95: percentile(0.95),
      p99: percentile(0.99),
      max: sorted[sorted.length - 1]
    };
  }

  private maxOf(samples: PerformanceSample[], selector: (sample: PerformanceSample) => number): number {
    let max = 0;
    for (const sample of samples) max = Math.max(max, selector(sample));
    return max;
  }
}
