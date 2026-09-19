// Experimental end-to-end state credit shared by a room, in addition to (not
// instead of) native pending-byte admission. Only authenticated remote receipts
// for packets actually admitted to the SDK can grant credit. No timer fabricates
// ACKs. Limits include packets already outside the SDK in an external FIFO.
export const SOCKET_FLIGHT_LIMITS = Object.freeze({ initial: 49152, min: 24576, max: 131072, peer: 49152, packets: 2048 });
const key = p => p.epoch + ':' + p.id + ':' + p.index;
export class SteamSocketFlightBudget {
  constructor({ inputOnly = false } = {}) {
    this.inputOnly = inputOnly;
    this.waiters = new Map(); this.records = new Map(); this.bytes = 0; this.count = 0; this.limit = inputOnly ? 8256 : SOCKET_FLIGHT_LIMITS.initial;
    this.adjustedAt = -Infinity; this.serial = 0;
    this.stats = { peakBytes: 0, acknowledged: 0, ignoredReceipts: 0, increased: 0, reduced: 0, orphanBytes: 0, lostPackets: 0, lostBytes: 0 };
  }
  record(session) {
    let r = this.records.get(session);
    if (!r) { r = { packets: new Map(), bytes: 0, baseRtt: null, rtt: null, retired: false, lastReceiptAt: null, drainedAt: null, drainedSerial: 0 }; this.records.set(session, r); }
    return r;
  }
  allows(session, bytes, job = null) {
    // Do not let a stream of tiny lossy fragments perpetually consume the
    // credit needed to finish another peer's already-started reliable fragment.
    for (const [peer, waiting] of this.waiters) if (peer.state === 'closed' || waiting.job && !peer.stateJob && !peer.latest && !peer.controls.some(job => job.frame.kind !== 'control')) this.waiters.delete(peer);
    this.waiters.set(session, { bytes, job });
    const first = [...this.waiters].find(([peer, request]) => {
      const candidate = this.record(peer); return !candidate.retired && candidate.bytes + request.bytes <= SOCKET_FLIGHT_LIMITS.peer;
    });
    // Earmark the head waiter's next packet, not the whole room. The native
    // pacer rotates independently: strict FIFO admission otherwise wastes an
    // entire poll whenever it visits a later peer before the head. Other peers
    // may use genuinely spare credit without consuming the reserved bytes/slot.
    const reserved = first && first[0] !== session ? first[1].bytes : 0;
    const r = this.record(session);
    return !r.retired && Number.isSafeInteger(bytes) && bytes > 0 && this.count + Number(reserved > 0) < SOCKET_FLIGHT_LIMITS.packets
      && this.bytes + bytes + reserved <= this.limit && r.bytes + bytes <= SOCKET_FLIGHT_LIMITS.peer;
  }
  track(session, packet, now, job = null) {
    if (!this.allows(session, packet.bytes, job)) throw Error('State admission exceeded end-to-end credit');
    const r = this.record(session), k = key(packet);
    if (r.packets.has(k)) throw Error('Duplicate admitted state packet');
    this.waiters.delete(session);
    r.packets.set(k, { ...packet, at: now, serial: ++this.serial }); r.bytes += packet.bytes;
    this.bytes += packet.bytes; this.count++; this.stats.peakBytes = Math.max(this.stats.peakBytes, this.bytes);
  }
  acknowledge(session, packets, now) {
    const r = this.records.get(session);
    for (const [epoch, id, index] of packets) {
      const k = key({ epoch, id, index }), p = r?.packets.get(k);
      if (!p || now <= p.at) { this.stats.ignoredReceipts++; continue; }
      r.packets.delete(k); r.bytes -= p.bytes; this.bytes -= p.bytes; this.count--; this.stats.acknowledged++; r.lastReceiptAt = now;
      // Missing UNRELIABLE packets are reconciled only after a fresh native
      // lane-empty observation AND a newer snapshot, admitted after that
      // observation, has actually returned a receipt. No elapsed-time-only
      // credit and no credit from control pongs masquerading as state delivery.
      if (p.kind === 'snapshot' && r.drainedAt !== null && p.at >= r.drainedAt) {
        const grace = Math.max(1000, (r.baseRtt ?? 300) * 3);
        for (const [missingKey, missing] of r.packets) if (missing.kind === 'snapshot' && missing.serial <= r.drainedSerial && now - missing.at >= grace) {
          r.packets.delete(missingKey); r.bytes -= missing.bytes; this.bytes -= missing.bytes; this.count--;
          this.stats.lostPackets++; this.stats.lostBytes += missing.bytes;
        }
        r.drainedAt = null; r.drainedSerial = 0;
      }
      const sample = now - p.at; r.baseRtt = r.baseRtt === null ? sample : Math.min(r.baseRtt, sample);
      r.rtt = r.rtt === null ? sample : r.rtt * .8 + sample * .2;
      if (this.inputOnly) continue;
      if (now - this.adjustedAt < Math.max(100, Math.min(500, r.baseRtt))) continue;
      const delay = r.rtt - r.baseRtt;
      if (delay > Math.max(100, r.baseRtt * .5)) { this.limit = Math.max(SOCKET_FLIGHT_LIMITS.min, Math.floor(this.limit * .7)); this.stats.reduced++; this.adjustedAt = now; }
      else if (delay < 50 && this.bytes >= this.limit * .5) { this.limit = Math.min(SOCKET_FLIGHT_LIMITS.max, this.limit + 8256); this.stats.increased++; this.adjustedAt = now; }
    }
  }
  observeNative(session, status, now) {
    const r = this.records.get(session);
    if (!r || r.retired || status?.available !== true || status.lanes?.[2]?.pendingBytes !== 0) return;
    // Keep the earliest unconsumed empty-lane barrier. Replacing it every 25ms
    // would ensure no round-trip receipt could ever cross the chosen barrier.
    if (r.drainedAt === null) { r.drainedAt = now; r.drainedSerial = this.serial; }
  }
  expired(session, now) {
    const r = this.records.get(session); if (!r || r.retired || !r.packets.size) return false;
    for (const packet of r.packets.values()) if (now - packet.at > 8000 && (packet.kind !== 'snapshot' || r.lastReceiptAt === null || now - r.lastReceiptAt > 8000)) return true;
    return false;
  }
  cancelWait(session) { this.waiters.delete(session); }
  retire(session) {
    this.waiters.delete(session);
    const r = this.records.get(session); if (!r || r.retired) return;
    // Closing a native handle cannot retract packets already in the router.
    // Keep debt rather than granting a fresh window to a reconnect loop.
    r.retired = true; this.stats.orphanBytes += r.bytes;
    if (!r.bytes) this.records.delete(session);
  }
  clear() { this.waiters.clear(); this.records.clear(); this.bytes = 0; this.count = 0; }
  diagnostics() { return { bytes: this.bytes, packets: this.count, limit: this.limit, waiters: this.waiters.size, peers: this.records.size, ...this.stats }; }
}
