/** Shared browser -> relay admission for LAN and Steam.
 * This is LOCAL queued bytes (including I/O-worker reservations), not RTT,
 * remote delivery, TCP congestion control, or a replacement for Steam ACKs.
 * Live state/input must not build a FIFO of obsolete samples. Retry from the
 * producer's newest state on its normal next tick; retain discrete actions
 * until send succeeds. Reliable lifecycle/receipt messages bypass this policy.
 */
export function realtimeWritable(bufferedAmount) {
  return Number.isFinite(bufferedAmount) && bufferedAmount === 0;
}

/** Never own an extra payload queue. The caller keeps its bounded action list;
 * blocked/failed sends preserve its exact contents and sequence counters.
 * Successful send means local admission only, NOT a remote action ACK.
 */
export function submitRealtimeInput({ canSend, takeBudget, createInput, send, accepted }) {
  if (!canSend() || !takeBudget()) return false;
  const input = createInput();
  if (!send(input)) return false;
  accepted(input);
  return true;
}
// One fresh input and snapshot may share a batch, in either callback order.
// Otherwise a consistently first producer could starve the other forever.
// The one-shot companion allowance expires after one simulation interval. A
// trailing send consumes it without granting another: no alternating FIFO.
export class RealtimeSendGate {
  #tailKind = null;
  #tailUntil = -Infinity;
  #canSend(kind, bufferedAmount, now) {
    if (realtimeWritable(bufferedAmount)) { this.reset(); return true; }
    return Number.isFinite(bufferedAmount) && bufferedAmount > 0 &&
      this.#tailKind === kind && Number.isFinite(now) && now <= this.#tailUntil;
  }
  #sent(kind, now) {
    if (this.#tailKind === kind || !Number.isFinite(now)) { this.reset(); return; }
    this.#tailKind = kind === 'input' ? 'snapshot' : 'input';
    this.#tailUntil = now + 1000 / 60;
  }
  canSendSnapshot(bufferedAmount, now) { return this.#canSend('snapshot', bufferedAmount, now); }
  snapshotSent(now) { this.#sent('snapshot', now); }
  canSendInput(bufferedAmount, now) { return this.#canSend('input', bufferedAmount, now); }
  inputSent(now) { this.#sent('input', now); }
  reset() { this.#tailKind = null; this.#tailUntil = -Infinity; }
}
