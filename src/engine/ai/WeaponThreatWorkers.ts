import type { WeaponThreatFrame } from './WeaponThreatFrame';
import type { WeaponThreatPacket, WeaponThreatRows } from './WeaponThreatKernel';

interface Reply { id: number; ready?: boolean; rows?: WeaponThreatRows; kernelMs?: number; error?: string }
interface Entry { worker: Worker; pending: Map<number, { resolve(value: Reply): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }> }
export interface WeaponThreatWorkerStatus {
  workers: number; ready: boolean; reason: string; completed: number; fallbacks: number;
  observers: number; mounts: number; prepareMs: number; waitMs: number; kernelMs: number; mergeMs: number;
}

/** Persistent workers for a pure numeric stage, without whole-Ship eligibility.
 * Exactly one immutable frame in flight. Failure returns to the SAME frame's
 * synchronous kernel; it never replays controls or advances a second tick. */
export class WeaponThreatWorkers {
  private readonly entries: Entry[] = [];
  private serial = 0;
  private epoch = 0;
  private ready = false;
  private failed = false;
  private busy = false;
  private readonly buffers = new Map<string, SharedArrayBuffer>();
  readonly status: WeaponThreatWorkerStatus = { workers: 0, ready: false, reason: 'not-started', completed: 0, fallbacks: 0,
    observers: 0, mounts: 0, prepareMs: 0, waitMs: 0, kernelMs: 0, mergeMs: 0 };

  compute(frame: WeaponThreatFrame): Promise<void> | void {
    this.status.observers = frame.observerCount; this.status.mounts = frame.mountCount;
    if (frame.observerCount < 8 || frame.mountCount < 128) { this.status.reason = 'small-stage'; return; }
    if (this.failed) return;
    if (typeof Worker === 'undefined' || typeof SharedArrayBuffer === 'undefined' || globalThis.crossOriginIsolated !== true) {
      this.status.reason = 'worker-or-isolation-unavailable'; return;
    }
    const hardware = globalThis.navigator?.hardwareConcurrency ?? 0;
    if (hardware < 4) { this.status.reason = 'hardware-concurrency'; return; }
    if (!this.entries.length) { this.start(Math.min(4, hardware - 1)); return; }
    if (!this.ready) return;
    if (this.busy) throw new Error('Overlapping weapon threat stage');
    return this.run(frame);
  }
  private start(count: number): void {
    const epoch = this.epoch;
    this.status.reason = 'starting';
    try {
      for (let i = 0; i < count; i++) {
        const worker = new Worker(new URL('./weapon-threat.worker.ts', import.meta.url), { type: 'module' });
        const entry: Entry = { worker, pending: new Map() };
        worker.onmessage = ({ data }: MessageEvent<Reply>) => {
          const request = entry.pending.get(data.id);
          if (!request) return;
          entry.pending.delete(data.id); clearTimeout(request.timer);
          if (data.error) request.reject(new Error(data.error)); else request.resolve(data);
        };
        worker.onerror = event => this.fail(new Error(event.message || 'Weapon threat worker failed'));
        worker.onmessageerror = () => this.fail(new Error('Unreadable weapon threat reply'));
        this.entries.push(entry);
      }
      this.status.workers = count;
      void Promise.all(this.entries.map(entry => this.request(entry, {}, 1500))).then(replies => {
        if (epoch !== this.epoch) return;
        if (!replies.every(reply => reply.ready)) throw new Error('Invalid weapon threat worker startup');
        this.ready = this.status.ready = true; this.status.reason = 'parallel';
      }).catch(error => { if (epoch === this.epoch) this.fail(error); });
    } catch (error) { this.fail(error instanceof Error ? error : new Error(String(error))); }
  }
  private request(entry: Entry, message: { packet?: WeaponThreatPacket; indices?: number[] }, timeout: number): Promise<Reply> {
    return new Promise((resolve, reject) => {
      const id = ++this.serial;
      const timer = setTimeout(() => { entry.pending.delete(id); reject(new Error('Weapon threat worker timed out')); }, timeout);
      entry.pending.set(id, { resolve, reject, timer });
      try { entry.worker.postMessage({ id, ...message }); }
      catch (error) { clearTimeout(timer); entry.pending.delete(id); reject(error instanceof Error ? error : new Error(String(error))); }
    });
  }
  private share<T extends Float64Array | Uint8Array>(key: string, values: T): T {
    let buffer = this.buffers.get(key);
    if (!buffer || buffer.byteLength < values.byteLength) {
      buffer = new SharedArrayBuffer(Math.max(8, 2 ** Math.ceil(Math.log2(Math.max(1, values.byteLength)))));
      this.buffers.set(key, buffer);
    }
    const result = values instanceof Float64Array ? new Float64Array(buffer, 0, values.length) : new Uint8Array(buffer, 0, values.length);
    result.set(values); return result as T;
  }
  private async run(frame: WeaponThreatFrame): Promise<void> {
    const epoch = this.epoch, start = performance.now(); this.busy = true;
    try {
      const source = frame.packet;
      const packet: WeaponThreatPacket = { sources: this.share('sources', source.sources), mounts: this.share('mounts', source.mounts),
        observers: this.share('observers', source.observers), visible: this.share('visible', source.visible), teamCount: source.teamCount };
      const groups = Array.from({ length: this.entries.length }, () => [] as number[]);
      for (let i = 0; i < frame.observerCount; i++) groups[i % groups.length].push(i);
      this.status.prepareMs = performance.now() - start;
      const waiting = performance.now();
      const replies = await Promise.all(this.entries.map((entry, i) => this.request(entry, { packet, indices: groups[i] }, 100)));
      if (epoch !== this.epoch) return;
      this.status.waitMs = performance.now() - waiting;
      this.status.kernelMs = Math.max(...replies.map(reply => reply.kernelMs ?? 0));
      if (replies.some(reply => !reply.rows)) throw new Error('Missing weapon threat partition');
      const merging = performance.now(); frame.install(replies.flatMap(reply => reply.rows!));
      this.status.mergeMs = performance.now() - merging; this.status.completed++;
      this.status.reason = 'parallel';
    } catch (error) {
      if (epoch === this.epoch) this.fail(error instanceof Error ? error : new Error(String(error)));
      // No partial install: the engine consumes this captured frame synchronously.
    } finally { if (epoch === this.epoch) this.busy = false; }
  }
  private stop(error: Error): void {
    this.epoch++;
    for (const entry of this.entries) {
      entry.worker.terminate();
      for (const request of entry.pending.values()) { clearTimeout(request.timer); request.reject(error); }
      entry.pending.clear();
    }
    this.entries.length = 0; this.ready = this.status.ready = false; this.status.workers = 0; this.busy = false;
    this.buffers.clear();
  }
  private fail(error: Error): void {
    if (this.failed) return;
    this.failed = true; this.status.fallbacks++; this.status.reason = error.message;
    this.stop(error);
  }
  reset(): void { this.stop(new Error('Weapon threat stage cancelled')); this.failed = false; this.status.reason = 'not-started'; }
}
