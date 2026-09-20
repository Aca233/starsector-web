/** Renderer-only telemetry. No timers, SDK/network queries, global entry scans or
 * retained PerformanceEntries. Caller samples on the existing 1 Hz log timer.
 * Long-task aggregates cover this instance (one battle mount), not one interval. */
type Heap = { usedJSHeapSize?: unknown; totalJSHeapSize?: unknown; jsHeapSizeLimit?: unknown };
type RuntimePerformance = { readonly memory?: Heap };
const finite = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? value : null;

export class NetworkRuntimeDiagnostics {
  private observer: PerformanceObserver | null = null;
  private active = true;
  private supported = false;
  private count = 0;
  private totalMs = 0;
  private maxMs = 0;

  constructor(private previousSampleAt: number,
    private readonly clock: RuntimePerformance = globalThis.performance as RuntimePerformance,
    Observer: typeof PerformanceObserver | undefined = globalThis.PerformanceObserver) {
    try {
      if (!Observer?.supportedEntryTypes?.includes('longtask')) return;
      this.observer = new Observer(list => {
        if (this.active) this.add(list.getEntriesByType('longtask'));
      });
      // Do not replay buffered tasks from before this battle mounted.
      this.observer.observe({ entryTypes: ['longtask'] });
      this.supported = true;
    } catch {
      this.disposeObserver();
    }
  }

  private add(entries: PerformanceEntry[]): void {
    for (const entry of entries) {
      const duration = finite(entry.duration);
      if (entry.entryType !== 'longtask' || duration === null) continue;
      this.count++;
      this.totalMs += duration;
      this.maxMs = Math.max(this.maxMs, duration);
    }
  }

  /** Lifecycle writes neither advance the sample clock nor invent timer delays. */
  sample(now: number, periodic: boolean) {
    if (this.active && this.observer) {
      try { this.add(this.observer.takeRecords()); } catch { /* Optional telemetry. */ }
    }
    const interval = periodic ? finite(now - this.previousSampleAt) : null;
    if (periodic) this.previousSampleAt = now;
    let used: number | null = null, total: number | null = null, limit: number | null = null;
    if (this.active) {
      try {
        const heap = this.clock?.memory;
        used = finite(heap?.usedJSHeapSize); total = finite(heap?.totalJSHeapSize); limit = finite(heap?.jsHeapSizeLimit);
      } catch { /* Non-standard Chromium memory API may be absent or inaccessible. */ }
    }
    return {
      sampleIntervalMs: interval,
      sampleDelayMs: interval === null ? null : Math.max(0, interval - 1000),
      longTaskSupported: this.supported,
      longTaskCount: this.supported ? this.count : null,
      longTaskTotalMs: this.supported ? this.totalMs : null,
      longTaskMaxMs: this.supported ? this.maxMs : null,
      jsHeapAvailable: used !== null || total !== null || limit !== null,
      jsHeapUsedBytes: used, jsHeapTotalBytes: total, jsHeapLimitBytes: limit,
    };
  }

  private disposeObserver(): void {
    try { this.observer?.disconnect(); } catch { /* Cleanup must not break unmount. */ }
    this.observer = null;
  }

  dispose(): void {
    this.active = false;
    this.disposeObserver();
  }
}
