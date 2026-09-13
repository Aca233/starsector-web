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
  resourceRecreations: number;
  drawCalls: number;
  memoryBytes: number | null;
}

export class PerformanceMetrics {
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
    resourceRecreations: 0,
    drawCalls: 0,
    memoryBytes: null
  };

  private smooth(current: number, sample: number): number {
    return current === 0 ? sample : current * 0.9 + sample * 0.1;
  }

  public recordTiming(key: 'simulationMs' | 'visualUpdateMs' | 'renderPreparationMs' | 'drawSubmitMs', ms: number): void {
    this.snapshot[key] = this.smooth(this.snapshot[key], Math.max(0, ms));
  }
}
