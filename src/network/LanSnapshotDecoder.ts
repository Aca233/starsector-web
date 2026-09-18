import { decodeBinaryFrame } from './BinarySnapshot.mjs';
import type { CombatSnapshot } from './CombatSnapshot';
import config from './protocol.json';

export interface EncodedHostSnapshot {
  tick: number;
  bytes: number;
  binary?: ArrayBuffer;
  json?: string;
}
export interface SnapshotDecodeStats {
  queued: number;
  queuedBytes: number;
  peakQueued: number;
  peakBytes: number;
  decoded: number;
  backpressure: number;
  waitMs: number;
  maxWaitMs: number;
}
type Schedule = (task: () => void) => () => void;
interface Pending { packet: EncodedHostSnapshot; receivedAt: number }

/** The host's existing one-in-flight gate is a credit, not a decode receipt.
 * Admit/ACK one packet before parsing, reserving a slot for its successor. Hold
 * the next ACK until a decode completes. Thus even a stalled task queue owns at
 * most TWO normal packets (including messages still travelling from the host).
 * host.snapshot(true) bypasses that gate once: reserve a THIRD terminal slot.
 * No encoded packet is replaced: muzzle/sound events must reach the consumer in
 * tick order before SnapshotPlayback is allowed to coalesce world endpoints.
 *
 * A separate decode worker would transfer the bytes cheaply but clone the full
 * decoded graph back onto main. One synchronous decode per task avoids that
 * extra traversal, while early bounded credit lets authority encode in parallel.
 */
export class LanSnapshotDecoder {
  private queue: Pending[] = [];
  private pendingAcks: number[] = [];
  private cancel: (() => void) | null = null;
  private generation = 0;
  private closed = false;
  private highestTick = -1;
  private queuedBytes = 0;
  private peakQueued = 0;
  private peakBytes = 0;
  private decoded = 0;
  private backpressure = 0;
  private waitMs = 0;
  private maxWaitMs = 0;

  constructor(private readonly callbacks: {
    acknowledge: (tick: number) => void;
    consume: (frame: CombatSnapshot, parseMs: number) => void;
    error: (error: unknown) => void;
  }, private readonly schedule: Schedule = task => {
    const timer = setTimeout(task, 0);
    return () => clearTimeout(timer);
  }) {}

  get stats(): SnapshotDecodeStats {
    return { queued: this.queue.length, queuedBytes: this.queuedBytes,
      peakQueued: this.peakQueued, peakBytes: this.peakBytes, decoded: this.decoded,
      backpressure: this.backpressure, waitMs: this.waitMs, maxWaitMs: this.maxWaitMs };
  }

  enqueue(packet: EncodedHostSnapshot): void {
    if (this.closed) return;
    try {
      if (!Number.isSafeInteger(packet.tick) || packet.tick < 0 || packet.tick <= this.highestTick)
        throw Error('主机快照序号重复或倒退');
      if (!Number.isSafeInteger(packet.bytes) || packet.bytes <= 0 || packet.bytes > config.maxSnapshotBytes
        || (packet.binary instanceof ArrayBuffer ? packet.bytes !== packet.binary.byteLength
          : typeof packet.json !== 'string' || packet.json.length > packet.bytes))
        throw Error('主机快照长度无效或超过通信安全预算');
      if (this.queue.length >= 3) throw Error('主机快照超出解码 credits（2 个普通帧 + 1 个末帧）');
      this.highestTick = packet.tick;
      this.queue.push({ packet, receivedAt: performance.now() });
      this.queuedBytes += packet.bytes;
      this.peakQueued = Math.max(this.peakQueued, this.queue.length);
      this.peakBytes = Math.max(this.peakBytes, this.queuedBytes);
      if (this.queue.length < 2) this.callbacks.acknowledge(packet.tick);
      else { this.pendingAcks.push(packet.tick); this.backpressure++; }
      this.scheduleNext();
    } catch (error) { this.fail(error); }
  }

  private scheduleNext(): void {
    if (this.closed || this.cancel || !this.queue.length) return;
    const generation = this.generation;
    this.cancel = this.schedule(() => {
      if (this.closed || generation !== this.generation) return;
      this.cancel = null;
      this.decodeOne();
      this.scheduleNext();
    });
  }

  private decodeOne(): void {
    const pending = this.queue[0];
    if (this.closed || !pending) return;
    const generation = this.generation;
    try {
      const started = performance.now(), { packet } = pending;
      this.waitMs = Math.max(0, started - pending.receivedAt);
      this.maxWaitMs = Math.max(this.maxWaitMs, this.waitMs);
      const frame = packet.binary instanceof ArrayBuffer
        ? decodeBinaryFrame(packet.binary) : JSON.parse(packet.json!) as CombatSnapshot;
      if (frame?.tick !== packet.tick) throw Error('主机快照内容与序号不一致');
      this.callbacks.consume(frame, performance.now() - started);
      if (this.closed || generation !== this.generation) return;
      this.decoded++;
      this.queue.shift();
      this.queuedBytes -= packet.bytes;
      // Release only after consume has retained the discrete events. No further
      // credit is released if parsing/consumption failed or stopped the battle.
      if (this.queue.length < 2) this.releaseAcks();
    } catch (error) { this.fail(error); }
  }

  private releaseAcks(): void {
    const pending = this.pendingAcks;
    this.pendingAcks = [];
    for (const tick of pending) this.callbacks.acknowledge(tick);
  }

  /** Terminal ordering barrier: the host posts its final snapshot immediately
   * before finished. Do not let finished/stop cancel that scheduled decode. */
  flush(): void {
    this.cancel?.(); this.cancel = null; this.generation++;
    while (!this.closed && this.queue.length) this.decodeOne();
  }

  /** Explicit resync/hidden epoch only; ordinary congestion never drops packets.
   * Cancels queued tasks AND releases held credits on the same authority worker. */
  reset(): void {
    if (this.closed) return;
    this.cancel?.(); this.cancel = null; this.generation++;
    this.queue = []; this.queuedBytes = 0;
    try { this.releaseAcks(); } catch (error) { this.fail(error); }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.cancel?.(); this.cancel = null; this.generation++;
    this.queue = []; this.queuedBytes = 0; this.pendingAcks = [];
  }

  private fail(error: unknown): void {
    if (this.closed) return;
    this.close();
    this.callbacks.error(error);
  }
}
