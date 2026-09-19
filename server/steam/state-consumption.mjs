/** Steam snapshot consumption is a separate gate from transport delivery.
 * It stores only ids/counters, never state payloads. Consumption latency must
 * not train the network RTT/window or the shared-uplink controller. */
export class SteamConsumptionWindow {
  constructor({ maxFrames = 32, maxBytes = 65536, maxRawBytes = 33554432 } = {}) {
    this.maxFrames = maxFrames; this.maxBytes = maxBytes; this.maxRawBytes = maxRawBytes;
    this.pending = new Map(); this.bytes = 0; this.rawBytes = 0; this.consumed = 0;
  }
  writable(limit) {
    return this.pending.size < Math.min(this.maxFrames, limit) &&
      this.bytes < this.maxBytes && this.rawBytes < this.maxRawBytes;
  }
  allows(bytes, rawBytes, limit) {
    // Preserve the transport's single-oversized-frame allowance, not a queue.
    return this.writable(limit) && Number.isSafeInteger(bytes) && bytes > 0 &&
      Number.isSafeInteger(rawBytes) && rawBytes > 0 &&
      rawBytes <= this.maxRawBytes - this.rawBytes &&
      (!this.pending.size || bytes <= this.maxBytes - this.bytes);
  }
  track(id, bytes, rawBytes, now = Date.now()) {
    if (this.pending.has(id)) throw Error('Duplicate Steam snapshot receipt id');
    this.pending.set(id, { bytes, rawBytes, since: now });
    this.bytes += bytes; this.rawBytes += rawBytes;
  }
  acknowledge(id) {
    const item = this.pending.get(id);
    if (!item) return false;
    this.pending.delete(id); this.bytes -= item.bytes; this.rawBytes -= item.rawBytes;
    this.consumed++; return true;
  }
  oldestMs(now = Date.now()) {
    const item = this.pending.values().next().value;
    return item ? now - item.since : 0;
  }
  clear() { this.pending.clear(); this.bytes = 0; this.rawBytes = 0; }
}

/** Local renderer seq -> Steam packet id, bounded even if the page stops.
 * New instance per WebSocket/Steam nonce. Exact match+seq only; no cumulative
 * release, no raw worlds, and no trusting a caller-supplied wire packet id. */
export class SteamRendererReceipts {
  constructor({ maxFrames = 32, maxBytes = 33554432 } = {}) {
    this.maxFrames = maxFrames; this.maxBytes = maxBytes;
    this.pending = new Map(); this.bytes = 0;
  }
  key(matchId, seq) {
    return typeof matchId === 'string' && matchId.length > 0 && matchId.length <= 128 &&
      Number.isSafeInteger(seq) && seq >= 0 ? JSON.stringify([matchId, seq]) : null;
  }
  track(state, id, bytes) {
    const key = this.key(state?.matchId, state?.seq);
    if (key === null || this.pending.has(key) || this.pending.size >= this.maxFrames ||
        !Number.isSafeInteger(bytes) || bytes <= 0 || bytes > this.maxBytes - this.bytes) return false;
    this.pending.set(key, { id, bytes }); this.bytes += bytes; return true;
  }
  consume(receipt) {
    const key = this.key(receipt?.matchId, receipt?.seq), item = this.pending.get(key);
    if (!item) return null;
    this.pending.delete(key); this.bytes -= item.bytes; return item.id;
  }
  clear() { this.pending.clear(); this.bytes = 0; }
}
