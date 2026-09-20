import { Worker } from 'node:worker_threads';
import { SNAPSHOT_PREPARE_WORKER_URL, SNAPSHOT_PREPARE_WORKER_KIND } from './snapshot-prepare-worker.mjs';
import { SNAPSHOT_PREPARE_LIMITS } from './snapshot-prepare-state.mjs';

// No native SDK calls or credit grants in the worker. A preparation is only a
// proposal; main-thread admission and successful native fragments decide commit.
export class SnapshotPrepareBroker {
  constructor({ deliver, onFault, workerFactory = () => new Worker(SNAPSHOT_PREPARE_WORKER_URL, {
    workerData: { kind: SNAPSHOT_PREPARE_WORKER_KIND },
  }), timeoutMs = 8000 } = {}) {
    this.deliver = deliver; this.onFault = onFault; this.workerFactory = workerFactory; this.timeoutMs = timeoutMs;
    this.records = new Map(); this.owners = new Map(); this.serial = 0; this.keySerial = 0;
    this.worker = null; this.ready = false; this.closed = false; this.failed = false;
    this.active = null; this.latest = null; this.scheduled = null; this.timer = null;
    this.metrics = { offered: 0, replaced: 0, prepared: 0, accepted: 0, stale: 0, faults: 0,
      workMs: 0, maxWorkMs: 0, queueMs: 0, maxQueueMs: 0, maxRetained: 0 };
  }
  diagnostics() {
    return { ...this.metrics, workMs: Math.round(this.metrics.workMs * 1000) / 1000,
      queueMs: Math.round(this.metrics.queueMs * 1000) / 1000,
      active: !!this.active, pending: !!this.latest, ready: this.ready, failed: this.failed };
  }
  peerDiagnostics(owner) { return this.owners.get(owner)?.stats ?? null; }
  ensureWorker() {
    if (this.worker || this.closed) return;
    try {
      this.worker = this.workerFactory();
      this.worker.on('message', message => { try { this.receive(message); } catch { this.fail(); } });
      this.worker.on('error', () => this.fail());
      this.worker.on('exit', () => { if (!this.closed) this.fail(); });
      this.worker.unref?.(); this.armDeadline();
    } catch { this.fail(); }
  }
  // Match the existing 8s transport failure horizon; do not introduce a 2s
  // disconnect merely because the helper event loop had a brief heavy stall.
  armDeadline() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.fail(), this.timeoutMs); this.timer.unref?.();
  }
  post(message, transfer = []) { this.worker.postMessage(message, transfer); }
  offer(owner, value) {
    if (this.closed) return false;
    let record = this.owners.get(owner);
    if (!record) {
      if (this.records.size >= SNAPSHOT_PREPARE_LIMITS.peers) { this.fail(); return false; }
      record = { key: ++this.keySerial, epoch: 0, binary: owner.binarySnapshots, owner, stats: null };
      this.records.set(record.key, record); this.owners.set(owner, record);
    }
    // Every recipient of a broadcast shares the immutable relay descriptor (or
    // string). Retain only this latest descriptor; transfer its bytes, never
    // structured-clone the decoded world.
    if (!this.latest || this.latest.value !== value) {
      if (this.latest) this.metrics.replaced++;
      this.latest = { value, at: performance.now(), peers: new Map() }; this.metrics.offered++;
    }
    this.latest.peers.set(record.key, { key: record.key, epoch: record.epoch, binary: record.binary });
    this.metrics.maxRetained = Math.max(this.metrics.maxRetained, Number(!!this.active) + 1);
    this.ensureWorker(); this.schedule(); return !this.closed;
  }
  schedule() {
    if (this.closed || this.scheduled || !this.ready || this.active || !this.latest) return;
    this.scheduled = setImmediate(() => { this.scheduled = null; try { this.start(); } catch { this.fail(); } });
  }
  start() {
    if (this.closed || this.active || !this.latest) return;
    const job = this.latest; this.latest = null;
    const peers = [...job.peers.values()].filter(p => {
      const r = this.records.get(p.key);
      return r && r.epoch === p.epoch && r.owner.snapshotWritable;
    });
    if (!peers.length) return;
    const value = job.value, binary = typeof value !== 'string';
    // Never detach relay/shared codec bytes. Only this bounded copy is moved.
    const input = binary ? { kind: 'binary', data: Uint8Array.from(value.bytes).buffer } : { kind: 'json', data: value };
    const queueMs = performance.now() - job.at;
    this.metrics.queueMs += queueMs; this.metrics.maxQueueMs = Math.max(this.metrics.maxQueueMs, queueMs);
    this.active = { id: ++this.serial, peers: new Map(peers.map(p => [p.key, p])), stage: 'prepare' };
    this.armDeadline();
    this.post({ op: 'prepare', id: this.active.id, input, peers, now: Date.now() }, binary ? [input.data] : []);
  }
  receive(message) {
    if (this.closed) return;
    if (message?.op === 'fault') { this.fail(); return; }
    if (message?.op === 'ready') {
      if (this.ready) throw Error('Duplicate ready');
      this.ready = true; clearTimeout(this.timer); this.schedule(); return;
    }
    if (message?.op === 'reset' || message?.op === 'retired') return;
    const job = this.active;
    if (!job || job.id !== message?.id) throw Error('Unexpected preparation transaction');
    if (message.op === 'prepared' && job.stage === 'prepare') {
      if (!Array.isArray(message.results) || message.results.length !== job.peers.size ||
          !Number.isFinite(message.workMs) || message.workMs < 0) throw Error('Invalid preparation');
      const seen = new Set();
      for (const result of message.results) {
        const p = job.peers.get(result.key);
        if (!p || p.epoch !== result.epoch || seen.has(result.key)) throw Error('Invalid preparation peer');
        seen.add(result.key);
        if (!result.stale && (!(result.prepared?.payload instanceof ArrayBuffer) ||
            !Number.isSafeInteger(result.stateBytes) || result.stateBytes < 1 ||
            result.stateBytes > SNAPSHOT_PREPARE_LIMITS.inputBytes)) throw Error('Invalid preparation payload');
      }
      this.metrics.prepared++; this.metrics.workMs += message.workMs;
      this.metrics.maxWorkMs = Math.max(this.metrics.maxWorkMs, message.workMs);
      const accepted = [];
      for (const result of message.results) {
        const r = this.records.get(result.key);
        if (!r || r.epoch !== result.epoch || result.stale) { this.metrics.stale++; continue; }
        if (this.deliver(r.owner, { ...result, prepared: { ...result.prepared, payload: Buffer.from(result.prepared.payload) } })) {
          accepted.push(r.key); this.metrics.accepted++;
        }
      }
      job.stage = 'commit'; this.armDeadline(); this.post({ op: 'commit', id: job.id, accepted }); return;
    }
    if (message.op === 'committed' && job.stage === 'commit') {
      for (const stat of message.stats) {
        const record = this.records.get(stat.key);
        if (record?.epoch === stat.epoch) record.stats = stat.delta;
      }
      clearTimeout(this.timer); this.active = null; this.schedule(); return;
    }
    throw Error('Unexpected preparation reply');
  }
  reset(owner) {
    const r = this.owners.get(owner); if (!r || this.closed) return;
    r.epoch++; r.stats = null; this.latest?.peers.delete(r.key);
    if (this.latest && !this.latest.peers.size) this.latest = null;
    try { if (this.worker) this.post({ op: 'reset', key: r.key, epoch: r.epoch }); } catch { this.fail(); }
  }
  retire(owner) {
    const r = this.owners.get(owner); if (!r) return;
    this.owners.delete(owner); this.records.delete(r.key); this.latest?.peers.delete(r.key);
    if (this.latest && !this.latest.peers.size) this.latest = null;
    try { if (this.worker && !this.closed) this.post({ op: 'retire', key: r.key }); } catch { this.fail(); }
  }
  fail() {
    if (this.closed) return;
    this.failed = true; this.metrics.faults++;
    const owners = [...this.owners.keys()];
    void this.close(); this.onFault?.(owners);
  }
  async close() {
    if (this.closed) return this.termination;
    this.closed = true; clearTimeout(this.timer); clearImmediate(this.scheduled);
    this.latest = null; this.active = null; this.records.clear(); this.owners.clear();
    this.termination = this.worker?.terminate().catch(() => {});
    return this.termination;
  }
}
