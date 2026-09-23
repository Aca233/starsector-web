import { SnapshotDeliveryWindow } from './SnapshotDeliveryWindow.mjs';
/** Exact consumption credit for the independent small-state lane. Delivery
 * turnaround is NOT idle RTT. Only the lane's pre-publication ping can establish
 * an initial idle RTT ceiling. Never keep state payloads or retransmit stale poses. */
export class MotionDeliveryWindow {
  constructor({ now = () => performance.now() } = {}) { this.now = now; this.networkRttMs = null; this.delivery = new SnapshotDeliveryWindow({ now }); this.reset(); }
  reset() {
    this.pending = new Map(); this.bytes = 0; this.lastSeq = this.lastOfferedSeq = -1;
    this.sent = this.acked = this.skipped = 0; this.minAckMs = this.lastAckMs = null;
    this.lastAckAt = this.lastSentAt = this.lastOfferedAt = null; this.delivery.reset();
  }
  recordNetworkRtt(ms) { if (Number.isFinite(ms) && ms >= 0) this.networkRttMs = ms; }
  get idleCapacity() { return this.networkRttMs === null ? 2 : Math.max(2, Math.min(16, Math.ceil(this.networkRttMs * .06) + 2)); }
  get capacity() { return this.delivery.limit(this.idleCapacity, this.networkRttMs, this.lastAckMs); }
  offer(seq) {
    if (!Number.isSafeInteger(seq) || seq < 0 || seq <= this.lastOfferedSeq) return false;
    this.lastOfferedSeq = seq; this.lastOfferedAt = this.now(); return true;
  }
  canReserve(seq,bytes) {
    return Number.isSafeInteger(seq)&&seq>=0&&seq>this.lastSeq&&Number.isSafeInteger(bytes)&&bytes>0&&bytes<=16384&&this.pending.size<this.capacity&&this.bytes+bytes<=32768;
  }
  // Skip codec preparation too when a receiver has no consumption credit.
  // This prevents stalled recipients consuming the room's shared delta budget.
  mayPrepare(seq) { if(this.canReserve(seq,1))return true;this.skipped++;return false; }
  reserve(seq, bytes) {
    this.offer(seq);
    if (!this.canReserve(seq,bytes)) { this.skipped++; return false; }
    const at = this.now(); this.pending.set(seq, { bytes, at }); this.bytes += bytes; this.lastSeq = seq; this.lastSentAt = at; this.sent++; return true;
  }
  ack(seq) {
    const row = this.pending.get(seq); if (!row) return false;
    const now = this.now(), ms = Math.max(0, now - row.at);let released = 0;
    this.minAckMs = this.minAckMs === null ? ms : Math.min(this.minAckMs, ms); this.lastAckMs = ms; this.lastAckAt = now;
    for (const [id, item] of this.pending) { if (id > seq) break; this.pending.delete(id); this.bytes -= item.bytes; this.acked++; released++; }
    this.delivery.acknowledge(released); return true;
  }
  // A backed-up ACK is congestion, NOT evidence the optional lane disappeared.
  // Keep yielding bulk bandwidth while fresh critical authority is being offered.
  // No new supported poses / lost lane / resync restore the old complete path.
  get active() { return this.lastAckAt !== null && this.lastOfferedAt !== null && this.now() - this.lastOfferedAt < 250; }
  get fresh() { return this.lastAckAt !== null && this.now() - this.lastAckAt < 500; }
  get detailIntervalMs() {
    if (!this.active) return 0;
    const oldest = this.pending.values().next().value;
    const turnaround = Math.max(this.lastAckMs ?? 0, oldest ? this.now() - oldest.at : 0);
    return turnaround > Math.max(120, (this.networkRttMs ?? this.minAckMs ?? 0) * 1.75) ? 500 : 200;
  }
  stats() { return { active: this.active, fresh: this.fresh, sent: this.sent, consumed: this.acked, skipped: this.skipped, inflight: this.pending.size, bytes: this.bytes, capacity: this.capacity, idleRttMs: this.networkRttMs, deliveryHz: this.delivery.deliveryHz, acknowledgementMs: this.lastAckMs, detailIntervalMs: this.detailIntervalMs }; }
}
