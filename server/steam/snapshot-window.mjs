/** Delay-based snapshot credit. This controls transport only, never physics Hz.
 * Grow one frame per measured round trip while ACKs show spare path capacity;
 * shrink on persistent queueing, without retransmitting/caching stale state.
 * The independent byte cap in SteamPeer always overrides this count window. */
export const INITIAL_SNAPSHOT_WINDOW = 4;
export const MAX_SNAPSHOT_WINDOW = 32;
export class SnapshotSendWindow {
  constructor() {
    this.limit = INITIAL_SNAPSHOT_WINDOW;
    this.baseRtt = null;
    this.samples = [];
    this.roundAt = null;
    this.roundSamples = []; this.probe = null; this.restoreLimit = INITIAL_SNAPSHOT_WINDOW;
  }
  acknowledge(sample, now, flightSize) {
    if (!Number.isFinite(sample) || sample <= 0) return;
    if (this.probe === 'drain') {
      // The final old ACK means the pipe is empty. Measure the NEXT frame alone,
      // not this last queued frame, before accepting a higher path baseline.
      if (flightSize === 1) this.probe = 'measure';
      return;
    }
    if (this.probe === 'measure') {
      if (flightSize !== 1) return;
      this.baseRtt = sample; this.samples.length = 0; this.roundSamples.length = 0;
      this.limit = this.restoreLimit; this.roundAt = now; this.probe = null;
    }
    // One minimum per second retains a real 30s history at both 5 and 60Hz. A
    // packet-count ring would forget the floor rapidly on fast connections.
    const bucket = Math.floor(now / 1000) * 1000, last = this.samples.at(-1);
    if (last?.at === bucket) last.rtt = Math.min(last.rtt, sample);
    else this.samples.push({ at: bucket, rtt: sample });
    while (this.samples.length > 32 || this.samples[0].at < now - 30000) this.samples.shift();
    const recentFloor = Math.min(...this.samples.map(item => item.rtt));
    if (this.baseRtt !== null && recentFloor > this.baseRtt + Math.max(20, this.baseRtt * .1)) {
      // Persistent congestion must not teach the controller that a stale queue
      // is the new normal RTT. Briefly drain on an upward baseline change only;
      // stable routes never periodically lose credit. Size/timeout caps remain.
      this.restoreLimit = Math.min(INITIAL_SNAPSHOT_WINDOW, this.limit);
      this.limit = 1; this.probe = flightSize === 1 ? 'measure' : 'drain';
      this.roundSamples.length = 0; return;
    }
    this.baseRtt = this.baseRtt === null ? recentFloor : Math.min(this.baseRtt, recentFloor);
    this.roundAt ??= now;
    // The same delay can be one queued small frame or several large ones. This
    // is Vegas-style queue estimation, not a native Steam RTT/bandwidth reading.
    this.roundSamples.push({ queued: flightSize * Math.max(0, 1 - this.baseRtt / sample), full: flightSize >= this.limit });
    if (this.roundSamples.length > 256) this.roundSamples.shift();
    if (now - this.roundAt < Math.max(100, this.baseRtt)) return;
    const values = this.roundSamples.map(item => item.queued).sort((a, b) => a - b);
    const queued = values[Math.floor((values.length - 1) / 2)];
    if (queued > 2) this.limit = Math.max(2, this.limit - 1);
    else if (queued < 1 && this.roundSamples.some(item => item.full)) this.limit = Math.min(MAX_SNAPSHOT_WINDOW, this.limit + 1);
    this.roundAt = now; this.roundSamples.length = 0;
  }
}
