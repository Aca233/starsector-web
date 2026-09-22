// A shared host uplink cannot afford each guest independently filling 64 KiB.
// ACK-owned bytes only: no unsent state payloads or alternate delivery queues.
export const INITIAL_HOST_SNAPSHOT_BYTES = 64 * 1024;
// Normal multi-peer flight has ONE room ceiling, not 64KiB per guest. At the
// supported 256Kbps collapse probe this leaves space/time for receipt and control
// traffic inside the existing 8s guard. This is not a guarantee for arbitrary
// rates or the existing one-oversized-baseline exception. A lone negotiated
// binary peer retains its separately tested BDP controller.
export const MAX_SHARED_HOST_SNAPSHOT_BYTES = 224 * 1024;
const REQUEST_TTL_MS = 250;
const localWritable = peer => peer.readyState === 1 && peer.inflight.size < peer.snapshotWindow.limit && peer.inflightBytes < (peer.snapshotByteLimit ?? INITIAL_HOST_SNAPSHOT_BYTES);
export class SnapshotHostBudget {
  constructor(peers) { this.peers = peers; this.clear(); }
  clear() { this.singleBinaryPeer = false; this.limitBytes = INITIAL_HOST_SNAPSHOT_BYTES; this.waiting = new Map(); this.samples = []; this.roundAt = null; this.blockedAt = -Infinity; this.lastQueueBytes = 0; }
  totalBytes() { let total = 0; for (const peer of this.peers()) total += peer.inflightBytes; return total; }
  prune(now) {
    for (const [peer, request] of this.waiting) if (now - request.at > REQUEST_TTL_MS || !localWritable(peer)) this.waiting.delete(peer);
    const ready = [...this.peers()].filter(peer => peer.readyState === 1);
    // With one negotiated peer, its measured byte controller IS the host budget.
    // The old per-peer 64KiB clamp would otherwise defeat that controller.
    // Multiple peers still obey the original shared aggregate controller/cap.
    const singleBinaryPeer = ready.length === 1 && ready[0].binarySnapshots === true;
    if (singleBinaryPeer !== this.singleBinaryPeer) {
      // An inactive estimator must not resume with samples from the previous
      // room composition. ACK-owned flight and FIFO intents remain untouched.
      this.samples.length = 0; this.roundAt = null; this.blockedAt = -Infinity; this.lastQueueBytes = null;
    }
    this.singleBinaryPeer = singleBinaryPeer;
    if (this.singleBinaryPeer) { this.limitBytes = ready[0].snapshotByteLimit; this.lastQueueBytes = ready[0].byteWindow?.queueBytes ?? null; }
    else this.limitBytes = Math.min(this.limitBytes, Math.min(MAX_SHARED_HOST_SNAPSHOT_BYTES, INITIAL_HOST_SNAPSHOT_BYTES * Math.max(1, ready.length)));
  }
  remove(peer) { this.waiting.delete(peer); }
  allows(peer, bytes, now = Date.now()) {
    this.prune(now);
    // Repeated intent refreshes its deadline, never its FIFO position. A waiting
    // larger keyframe reserves the next released space; small deltas cannot
    // continually overtake it. The actual next send still uses NEWEST state.
    this.waiting.set(peer, { at: now, bytes });
    const first = this.waiting.keys().next().value, total = this.totalBytes();
    // Reserve space for the oldest waiter, but use surplus credit immediately.
    // Strict FIFO alone wastes an entire broadcast tick when relay iteration
    // has already passed that waiter, capping healthy guests near half rate.
    if (first !== peer && total + bytes + this.waiting.get(first).bytes > this.limitBytes) return false;
    if (total > 0 && total + bytes > this.limitBytes) { this.blockedAt = now; return false; }
    this.waiting.delete(peer); return true;
  }
  acknowledge(sample, baseRtt, now, bytesBeforeAck) {
    if (!Number.isFinite(sample) || sample <= 0 || !Number.isFinite(baseRtt) || baseRtt <= 0) return;
    this.prune(now);
    if (this.singleBinaryPeer) return;
    const queued = bytesBeforeAck * Math.max(0, 1 - baseRtt / sample);
    this.samples.push(queued); if (this.samples.length > 256) this.samples.shift();
    this.roundAt ??= now;
    let roundMs = 100;
    for (const peer of this.peers()) if (peer.readyState === 1 && peer.inflight.size) roundMs = Math.max(roundMs, peer.snapshotWindow.baseRtt ?? sample);
    if (now - this.roundAt < roundMs) return;
    const ordered = this.samples.toSorted((a, b) => a - b);
    this.lastQueueBytes = ordered[Math.floor((ordered.length - 1) / 2)];
    if (this.lastQueueBytes > Math.max(8192, this.limitBytes * .15)) this.limitBytes = Math.max(INITIAL_HOST_SNAPSHOT_BYTES, Math.floor(this.limitBytes * .8));
    else if (this.lastQueueBytes < Math.max(4096, this.limitBytes * .05) && now - this.blockedAt <= roundMs * 2) {
      this.limitBytes += Math.max(4096, Math.min(16384, Math.floor(this.limitBytes * .1)));
    }
    this.roundAt = now; this.samples.length = 0; this.prune(now);
  }
  diagnostics(now = Date.now()) {
    this.prune(now);
    return { limitBytes: this.limitBytes, inflightBytes: this.totalBytes(), waitingPeers: this.waiting.size, estimatedQueueBytes: this.lastQueueBytes === null ? null : Math.round(this.lastQueueBytes) };
  }
}
