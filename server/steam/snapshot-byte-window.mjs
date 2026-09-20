import { MAX_SNAPSHOT_WINDOW } from './snapshot-window.mjs';
/** ACK-owned byte credit for negotiated binary snapshots. The legacy 64KiB
 * ceiling is unchanged. Grow only after real byte-pressure + successful ACKs
 * show <1 packet queued; shrink at >2. No payload queue, new timer, retry or
 * timeout change. A consumed/forged ACK must never call this controller. */
export const INITIAL_BINARY_SNAPSHOT_BYTES = 64 * 1024;
export const MAX_BINARY_SNAPSHOT_BYTES = 224 * 1024;
export class SnapshotByteWindow {
  constructor() { this.limit = INITIAL_BINARY_SNAPSHOT_BYTES; this.roundAt = null; this.blockedAt = -Infinity; this.samples = []; this.queueBytes = null; }
  blocked(now) { if (Number.isFinite(now)) this.blockedAt = now; }
  acknowledge(sample, baseRtt, now, flightBytes, packetBytes) {
    if (![sample, baseRtt, now, flightBytes, packetBytes].every(Number.isFinite) || sample <= 0 || baseRtt <= 0 || baseRtt > sample
      || !Number.isSafeInteger(flightBytes) || flightBytes < packetBytes || !Number.isSafeInteger(packetBytes) || packetBytes <= 0
      || packetBytes > INITIAL_BINARY_SNAPSHOT_BYTES) return;
    if (this.roundAt !== null && now < this.roundAt) { this.roundAt = null; this.blockedAt = -Infinity; this.samples.length = 0; this.queueBytes = null; return; }
    this.samples.push({ queued: flightBytes * Math.max(0, 1 - baseRtt / sample), bytes: packetBytes });
    if (this.samples.length > 256) this.samples.shift();
    this.roundAt ??= now;
    const roundMs = Math.max(100, baseRtt);
    if (now - this.roundAt < roundMs) return;
    const middle = key => this.samples.map(s => s[key]).sort((a, b) => a - b)[Math.floor((this.samples.length - 1) / 2)];
    const queued = middle('queued'), packet = middle('bytes');
    this.queueBytes = queued;
    if (queued > packet * 2) this.limit = Math.max(INITIAL_BINARY_SNAPSHOT_BYTES, Math.floor(this.limit * .8));
    else if (packet > INITIAL_BINARY_SNAPSHOT_BYTES / MAX_SNAPSHOT_WINDOW && queued < packet && now >= this.blockedAt && now - this.blockedAt <= roundMs * 2) this.limit = Math.min(MAX_BINARY_SNAPSHOT_BYTES, this.limit + 16 * 1024);
    this.roundAt = now; this.samples.length = 0;
  }
}
