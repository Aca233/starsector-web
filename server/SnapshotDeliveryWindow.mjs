/** Reduce replaceable snapshot flight only after measured queue inflation.
 * A delivery ACK is NOT an idle RTT measurement, and can NEVER raise the caller's
 * idle-RTT ceiling. No retransmissions, payload retention, timers or IO here.
 * The usual two extra frames cover serialization and receiver scheduling. Only
 * sub-half-frame BDP routes use two total slots; never cap every link at two.
 */
export class SnapshotDeliveryWindow {
  #now;
  #samples = [];
  #delivered = 0;
  #congested = false;
  #limit = null;
  #routeRtt = null;
  constructor({ now = () => performance.now() } = {}) { this.#now = now; }
  reset() { this.#samples = []; this.#delivered = 0; this.#congested = false; this.#limit = null; this.#routeRtt = null; }
  acknowledge(count) {
    if (!Number.isSafeInteger(count) || count <= 0) return false;
    const at = this.#now();
    if (!Number.isFinite(at)) return false;
    if (this.#samples.length && at < this.#samples.at(-1).at) this.reset();
    this.#delivered += count;
    // Coalesced acknowledgements share an observation, not a zero-duration rate.
    if (this.#samples.at(-1)?.at === at) this.#samples.at(-1).delivered = this.#delivered;
    else this.#samples.push({ at, delivered: this.#delivered });
    while (this.#samples.length > 64 || this.#samples.length > 4 && at - this.#samples[0].at > 500) this.#samples.shift();
    return true;
  }
  get deliveryHz() {
    const first = this.#samples[0], last = this.#samples.at(-1);
    if (!first || !last || last.delivered - first.delivered < 3 || last.at - first.at < 100) return null;
    return (last.delivered - first.delivered) * 1000 / (last.at - first.at);
  }
  limit(ceiling, idleRttMs, latestRttMs) {
    if (!Number.isSafeInteger(ceiling) || ceiling < 2) throw new RangeError('Invalid snapshot window ceiling');
    if (!Number.isFinite(idleRttMs) || idleRttMs < 0 || !Number.isFinite(latestRttMs)) return ceiling;
    if (this.#routeRtt !== null && Math.abs(idleRttMs - this.#routeRtt) > Math.max(5, this.#routeRtt * .1)) {
      this.#congested = false; this.#limit = null;
    }
    this.#routeRtt = idleRttMs;
    // Require both a substantial absolute queue and inflation relative to the
    // route, so high but healthy RTT and one renderer frame do not shrink it.
    const inflated = latestRttMs - idleRttMs >= Math.max(80, idleRttMs * .75);
    if (!this.#congested && !inflated) return ceiling;
    const hz = this.deliveryHz;
    if (hz === null) return ceiling;
    // When a route's BDP is below half a frame, three whole large states
    // mostly buy queue age, not throughput. Two keep serialization overlapped
    // with the ACK flight. Preserve the extra scheduler slot for >= half-frame
    // BDP (including the measured 4Mbps case), not a global two-frame cap.
    const pipeline = idleRttMs * hz / 1000;
    const limit = Math.max(2, Math.min(ceiling, pipeline < .5 ? 2 : Math.ceil(pipeline) + 2));
    // A drained queue is the intended outcome, not evidence that bandwidth has
    // returned. Reopening the full window on a single clean pong causes a
    // repeated multi-second burst/drain cycle on healthy high-RTT slow routes.
    // Faster actual deliveries raise this bounded target without a timer; only
    // clear congestion after it reaches the old ceiling and the route is clear.
    if (!this.#congested) this.#limit = limit;
    else this.#limit = Math.min(ceiling, inflated ? Math.min(this.#limit, limit) : Math.max(this.#limit, limit));
    this.#congested = inflated || this.#limit < ceiling;
    return this.#limit;
  }
}
