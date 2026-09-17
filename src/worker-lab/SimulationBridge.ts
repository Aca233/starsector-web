import type { CombatEngine } from '../engine/simulation/CombatEngine';
import { applyPresentation } from './PresentationPacket';
import type { PresentationPacket } from './PresentationPacket';
import type { LabConfig, LabInput, LabAction } from './LabSimulation';
import type { LabFrame, LabRequest } from './simulation.worker';

export class SimulationBridge {
  readonly worker: Worker;
  readonly ready: Promise<void>;
  pending: LabFrame | null = null;
  latest: LabFrame | null = null;
  applyMs = 0;
  receivedAt = 0;
  appliedAt = 0;
  inputInFlight = false;
  stopped = false;
  private nextRequest = 0;
  private requests = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private readyTimer: ReturnType<typeof setTimeout>;
  private resolveReady!: () => void;
  private rejectReady!: (error: Error) => void;
  constructor(config: LabConfig, private readonly failed: (message: string) => void) {
    this.ready = new Promise((resolve, reject) => { this.resolveReady = resolve; this.rejectReady = reject; });
    this.worker = new Worker(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' });
    this.readyTimer = setTimeout(() => this.fail('模拟 Worker 启动超时'), 90000);
    this.worker.onerror = event => this.fail(event.message || '模拟 Worker 启动失败');
    this.worker.onmessageerror = () => this.fail('模拟 Worker 消息解码失败');
    this.worker.onmessage = event => {
      if (this.stopped) return;
      const message = event.data;
      if (message.type === 'ready') { clearTimeout(this.readyTimer); this.resolveReady(); }
      else if (message.type === 'error') this.fail(message.message);
      else if (message.type === 'input-received') this.inputInFlight = false;
      else if (message.type === 'frame') {
        if (this.pending) { this.fail('Worker violated single-frame backpressure'); return; }
        this.pending = message; this.receivedAt = performance.now();
      } else if ('requestId' in message) {
        const request = this.requests.get(message.requestId);
        if (request) { clearTimeout(request.timer); this.requests.delete(message.requestId); request.resolve(message); }
      }
    };
    this.send({ type: 'init', config });
  }
  private fail(message: string): void {
    if (this.stopped) return;
    this.dispose(new Error(message)); this.failed(message);
  }
  send(message: LabRequest, transfer: Transferable[] = []): void {
    if (!this.stopped) this.worker.postMessage(message, transfer);
  }
  input(input: LabInput): boolean {
    if (this.inputInFlight || this.stopped) return false;
    this.inputInFlight = true; this.send({ type: 'input', input }); return true;
  }
  action(action: LabAction): void { this.send({ type: 'action', action }); }
  running(value: boolean): void { this.send({ type: 'running', value }); }
  consume(engine: CombatEngine): LabFrame | null {
    const frame = this.pending;
    if (!frame || this.stopped) return null;
    this.pending = null;
    const start = performance.now();
    try {
      applyPresentation(engine, frame.packet);
      this.applyMs = performance.now() - start;
      this.appliedAt = performance.now(); this.latest = frame;
      // Do not retain a detached buffer; metadata/diagnostics remain available.
      const buffer = frame.packet.buffer;
      this.send({ type: 'recycle', buffer }, [buffer]);
      return frame;
    } catch (error) { this.fail(String(error)); return null; }
  }
  request(type: 'advance' | 'inspect', ticks = 0): Promise<{ tick?: number; packet: PresentationPacket; random: unknown; visualRandom: unknown }> {
    if (this.stopped) return Promise.reject(new Error('Simulation worker stopped'));
    const requestId = ++this.nextRequest;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.requests.delete(requestId); reject(new Error('Worker diagnostic timed out')); }, 180000);
      this.requests.set(requestId, { resolve, reject, timer });
      this.send(type === 'advance' ? { type, ticks, requestId } : { type, requestId });
    });
  }
  dispose(error = new Error('Worker lab disposed')): void {
    if (this.stopped) return;
    this.stopped = true; clearTimeout(this.readyTimer); this.rejectReady(error);
    this.worker.terminate(); this.pending = null; this.latest = null;
    for (const request of this.requests.values()) { clearTimeout(request.timer); request.reject(error); }
    this.requests.clear();
  }
}
