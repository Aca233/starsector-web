/** Production additive-motion guard. Never owns/frees network credits or payloads.
 * Only a validated, outstanding renderer state-consumed receipt grants eligibility.
 * Full-world sender age includes time since send, NOT just time since ACK. Tick
 * distance is an additional bound. Neither is a claimed input-to-photon metric.
 * Fallback is sticky for the match, including resync/visibility, to avoid flapping.
 */
export class AutoMotionAdmission {
  constructor({ now = () => performance.now(), maxAgeMs = 750 } = {}) {
    this.now = now; this.maxAgeMs = maxAgeMs; this.matchId = null;
    this.pending = new Map(); this.world = null; this.fallbackReason = null;
  }
  resetEpoch(matchId = this.matchId) {
    if (matchId !== this.matchId) this.fallbackReason = null;
    this.matchId = matchId; this.pending.clear(); this.world = null;
  }
  sent(seq, tick) {
    if (!Number.isSafeInteger(seq) || seq < 0 || !Number.isSafeInteger(tick) || tick < 0) return;
    this.pending.set(seq, { tick, at: this.now() });
    // Mirrors the existing maximum full-state credit count; stores scalars only.
    while (this.pending.size > 64) this.pending.delete(this.pending.keys().next().value);
  }
  consumed(seq) {
    const row = this.pending.get(seq);
    if (!row) return false;
    if (!this.world || row.tick >= this.world.tick) this.world = row;
    for (const id of this.pending.keys()) if (id <= seq) this.pending.delete(id);
    if (this.now() - row.at > this.maxAgeMs) this.fallbackReason ??= 'whole-state-late';
    return true;
  }
  allow(tick) {
    if (this.fallbackReason || !this.world) return false;
    if (this.now() - this.world.at > this.maxAgeMs || (tick - this.world.tick) * 1000 / 60 > this.maxAgeMs) {
      this.fallbackReason = 'whole-state-stalled'; return false;
    }
    return true;
  }
  stats() {
    return { mode: 'auto', status: this.fallbackReason ? 'fallback' : this.world ? 'eligible' : 'awaiting-world',
      fallbackReason: this.fallbackReason, worldSenderAgeMs: this.world ? Math.max(0, this.now() - this.world.at) : null,
      pending: this.pending.size, maxAgeMs: this.maxAgeMs };
  }
}
