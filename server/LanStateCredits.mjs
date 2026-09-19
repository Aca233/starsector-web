/**
 * Per-receiver credit accounting for best-effort LAN state snapshots.
 *
 * Call recordNetworkRtt ONLY with externally measured native ping/pong RTT.
 * Application ACK timing must never feed this estimator: an ACK means main
 * decoded and consumed a state, NOT that the GPU displayed it.
 *
 * Reserve immediately before sending a state. A false return means skip that
 * unsent best-effort state, as with the existing TCP-buffer skip policy. There
 * is no payload queue, world/raw-packet retention, retransmission, timeout or
 * flush. Inputs, control messages and terminal controls remain on the original
 * FIFO path and must not use this gate. This module does not change simulation
 * 1/60, target 60 Hz, AIowners0, or any Steam path.
 */
export class LanStateCredits {
  #maxBytes;
  #maxFrames;
  #hz;
  #rtts = [];
  #inflight = new Map();
  #lastSeq = -1;
  #bytes = 0;
  #peakCount = 0;
  #peakBytes = 0;
  #sent = 0;
  #acked = 0;
  #rejected = 0;

  constructor({ maxBytes = 33554432, maxFrames = 64, hz = 60 } = {}) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
      throw new RangeError('maxBytes must be a positive safe integer');
    }
    if (!Number.isSafeInteger(maxFrames) || maxFrames < 2) {
      throw new RangeError('maxFrames must be a safe integer >= 2');
    }
    if (!Number.isFinite(hz) || hz <= 0) {
      throw new RangeError('hz must be positive and finite');
    }
    this.#maxBytes = maxBytes;
    this.#maxFrames = maxFrames;
    this.#hz = hz;
  }

  // Invalid samples neither enter nor evict from the last-five sample window.
  recordNetworkRtt(ms) {
    if (!Number.isFinite(ms) || ms < 0) return false;
    if (this.#rtts.length === 5) this.#rtts.shift();
    this.#rtts.push(ms);
    return true;
  }

  get capacity() {
    if (this.#rtts.length === 0) return 2;
    const rtt = Math.min(...this.#rtts);
    return Math.max(2, Math.min(this.#maxFrames, Math.ceil(rtt * this.#hz / 1000) + 1));
  }

  // Only successful reservations advance the sequence high-water mark.
  // A failed attempt retains no entry and can be retried after credits return.
  reserve(seq, bytes) {
    if (
      !Number.isSafeInteger(seq) || seq < 0 || seq <= this.#lastSeq ||
      !Number.isSafeInteger(bytes) || bytes <= 0 || bytes > this.#maxBytes ||
      this.#inflight.size >= this.capacity ||
      bytes > this.#maxBytes - this.#bytes
    ) {
      this.#rejected++;
      return false;
    }
    this.#inflight.set(seq, bytes);
    this.#lastSeq = seq;
    this.#bytes += bytes;
    this.#sent++;
    this.#peakCount = Math.max(this.#peakCount, this.#inflight.size);
    this.#peakBytes = Math.max(this.#peakBytes, this.#bytes);
    return true;
  }

  // Exact membership is mandatory BEFORE any cumulative release. False ACKs
  // do not alter counters, the sequence high-water mark, credits, or RTTs.
  ack(seq) {
    if (!Number.isSafeInteger(seq) || seq < 0 || !this.#inflight.has(seq)) return false;
    for (const [pendingSeq, bytes] of this.#inflight) {
      if (pendingSeq > seq) break;
      this.#inflight.delete(pendingSeq);
      this.#bytes -= bytes;
      this.#acked++;
    }
    return true;
  }

  // New accounting epoch: clear window, seq, peaks and counters; retain RTTs.
  // New connections should construct a new instance, not reuse an old epoch.
  reset() {
    this.#inflight.clear();
    this.#lastSeq = -1;
    this.#bytes = 0;
    this.#peakCount = 0;
    this.#peakBytes = 0;
    this.#sent = 0;
    this.#acked = 0;
    this.#rejected = 0;
  }

  // Detached scalar snapshot; sent/acked count frames, rejected counts failed
  // reserve calls (validation, count or bytes). All counters are since reset.
  stats() {
    return {
      capacity: this.capacity,
      inflight: this.#inflight.size,
      bytes: this.#bytes,
      peakCount: this.#peakCount,
      peakBytes: this.#peakBytes,
      sent: this.#sent,
      acked: this.#acked,
      rejected: this.#rejected,
    };
  }
}
