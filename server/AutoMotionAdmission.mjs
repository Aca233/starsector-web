/** Additive motion needs an actually consumed, recent complete world.
 * A stall revokes eligibility, never credits. Recovery needs sustained fresh
 * receipts in the current epoch; reconnect/visibility alone cannot clear it.
 */
export class AutoMotionAdmission {
  constructor({ now = () => performance.now(), maxAgeMs = 750 } = {}) {
    this.now = now; this.maxAgeMs = maxAgeMs; this.matchId = null;
    this.pending = new Map(); this.world = null; this.fallbackReason = null;
    this.fallbackAt = null; this.recoveries = 0; this.clearRecovery();
  }
  clearRecovery() { this.recoverySince = null; this.recoveryLastAt = null; this.recoveryReceipts = 0; }
  fallback(reason) {
    if (!this.fallbackReason) { this.fallbackReason = reason; this.fallbackAt = this.now(); }
    this.clearRecovery();
  }
  resetEpoch(matchId = this.matchId) {
    if (matchId !== this.matchId) { this.fallbackReason = null; this.fallbackAt = null; this.recoveries = 0; }
    this.matchId = matchId; this.pending.clear(); this.world = null; this.clearRecovery();
  }
  sent(seq, tick) {
    if (!Number.isSafeInteger(seq) || seq < 0 || !Number.isSafeInteger(tick) || tick < 0 || this.pending.has(seq)) return;
    this.pending.set(seq, { tick, at: this.now() });
    while (this.pending.size > 64) this.pending.delete(this.pending.keys().next().value);
  }
  consumed(seq) {
    const row = this.pending.get(seq);
    if (!row) return false;
    const advances = !this.world || row.tick > this.world.tick;
    if (advances) this.world = row;
    for (const id of this.pending.keys()) if (id <= seq) this.pending.delete(id);
    const now = this.now(), age = now - row.at;
    if (age > this.maxAgeMs) this.fallback('whole-state-late');
    else if (this.fallbackReason && advances) {
      // Hysteresis: one burst, duplicate/old receipt or a barely-fresh frame is
      // not recovery. Require >=3 advancing receipts spanning >=500ms, inside
      // half the stale budget, and >=1s since fallback before resuming motion.
      if (age > this.maxAgeMs / 2) this.clearRecovery();
      else {
        if (this.recoveryLastAt !== null && now - this.recoveryLastAt > this.maxAgeMs / 2) this.clearRecovery();
        this.recoverySince ??= now; this.recoveryLastAt = now; this.recoveryReceipts++;
      }
    }
    return true;
  }
  allow(tick) {
    if (!this.world) return false;
    const now = this.now(), age = now - this.world.at, tickAge = (tick - this.world.tick) * 1000 / 60;
    if (age > this.maxAgeMs || tickAge > this.maxAgeMs) { this.fallback('whole-state-stalled'); return false; }
    if (this.fallbackReason) {
      if (age > this.maxAgeMs / 2 || tickAge > this.maxAgeMs / 2 || this.recoveryReceipts < 3 ||
          now - this.recoverySince < 500 || now - this.fallbackAt < 1000) return false;
      this.fallbackReason = null; this.fallbackAt = null; this.recoveries++; this.clearRecovery();
    }
    return true;
  }
  stats() {
    return { mode: 'auto', status: this.fallbackReason ? 'fallback' : this.world ? 'eligible' : 'awaiting-world',
      fallbackReason: this.fallbackReason, worldSenderAgeMs: this.world ? Math.max(0, this.now() - this.world.at) : null,
      pending: this.pending.size, maxAgeMs: this.maxAgeMs, recoveryReceipts: this.recoveryReceipts, recoveries: this.recoveries };
  }
}
