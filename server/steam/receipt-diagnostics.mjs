// Read-only, bounded diagnostics. No packet IDs, identities, payloads, retries,
// timers or congestion credit. SDK acceptance is NOT proof of remote delivery.
const age = (now, at) => at === null ? null : Math.max(0, now - at);
export class SteamReceiptDiagnostics {
  constructor() {
    this.counts = { rendererBinaryWrites: 0, rendererJsonWrites: 0, rendererPayloadBytes: 0, rendererCanonicalBytes: 0, rendererPending: 0, rendererWritten: 0, rendererWriteErrors: 0, maxRendererWriteMs: 0,
      networkAttempts: 0, networkAccepted: 0, networkErrors: 0, consumptionAttempts: 0, consumptionAccepted: 0, consumptionErrors: 0,
      fastAttempts: 0, fastAccepted: 0, fastRejected: 0 };
    this.networkAt = null; this.consumptionAt = null;
  }
  beginWrite(now = Date.now(), payload = null) {
    this.counts.rendererPending++;
    // Attempted local writes, not network bytes, applied states or receipt credit.
    // Keep scalars only; invalid optional diagnostics cannot affect the transport.
    if (typeof payload?.binary === 'boolean' && [payload.bytes, payload.canonicalBytes].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 32 * 1024 * 1024)) {
      this.counts[payload.binary ? 'rendererBinaryWrites' : 'rendererJsonWrites']++;
      this.counts.rendererPayloadBytes += payload.bytes; this.counts.rendererCanonicalBytes += payload.canonicalBytes;
    }
    return { owner: this, at: now, done: false };
  }
  endWrite(token, error, now = Date.now()) {
    if (!token || token.owner !== this || token.done) return;
    token.done = true; this.counts.rendererPending--;
    this.counts[error ? 'rendererWriteErrors' : 'rendererWritten']++;
    this.counts.maxRendererWriteMs = Math.max(this.counts.maxRendererWriteMs, Math.max(0, now - token.at));
  }
  attempt(consumed) { this.counts[consumed ? 'consumptionAttempts' : 'networkAttempts']++; }
  accepted(consumed, now = Date.now()) {
    this.counts[consumed ? 'consumptionAccepted' : 'networkAccepted']++;
    if (consumed) this.consumptionAt = now; else this.networkAt = now;
  }
  failed(consumed) { this.counts[consumed ? 'consumptionErrors' : 'networkErrors']++; }
  fast(accepted) { this.counts.fastAttempts++; this.counts[accepted ? 'fastAccepted' : 'fastRejected']++; }
  snapshot(now = Date.now()) { return { ...this.counts, networkAgeMs: age(now, this.networkAt), consumptionAgeMs: age(now, this.consumptionAt) }; }
}
export class SteamPollDiagnostics {
  constructor() { this.lastAt = null; this.counts = { calls: 0, packetsRead: 0, discardedPackets: 0, oversizedHeads: 0, invalidPackets: 0, errors: 0, budgetHits: 0, maxGapMs: 0, maxDurationMs: 0 }; }
  begin(now = Date.now()) {
    if (this.lastAt !== null) this.counts.maxGapMs = Math.max(this.counts.maxGapMs, Math.max(0, now - this.lastAt));
    this.lastAt = now; this.counts.calls++; return now;
  }
  end(start, now = Date.now()) { this.counts.maxDurationMs = Math.max(this.counts.maxDurationMs, Math.max(0, now - start)); }
  snapshot(now = Date.now()) { return { ...this.counts, lastAgeMs: age(now, this.lastAt) }; }
}
