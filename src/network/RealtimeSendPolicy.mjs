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
// One fresh input, critical pose and full snapshot may share a bounded batch.
// Each kind is admitted at most once, in any order, within one simulation tick.
// Consuming a companion NEVER grants another allowance or extends its deadline.
export class RealtimeSendGate {
  #remaining = null;
  #until = -Infinity;
  #canSend(kind, bufferedAmount, now) {
    if (realtimeWritable(bufferedAmount)) { this.reset(); return true; }
    return Number.isFinite(bufferedAmount) && bufferedAmount > 0 && Number.isFinite(now) &&
      now <= this.#until && this.#remaining?.has(kind) === true;
  }
  #sent(kind, now) {
    if (!Number.isFinite(now)) { this.reset(); return; }
    if (this.#remaining !== null) { this.#remaining.delete(kind); return; }
    this.#remaining = new Set(['input', 'motion', 'snapshot']); this.#remaining.delete(kind);
    this.#until = now + 1000 / 60;
  }
  canSendMotion(bufferedAmount, now) { return this.#canSend('motion', bufferedAmount, now); }
  motionSent(now) { this.#sent('motion', now); }
  canSendSnapshot(bufferedAmount, now) { return this.#canSend('snapshot', bufferedAmount, now); }
  snapshotSent(now) { this.#sent('snapshot', now); }
  canSendInput(bufferedAmount, now) { return this.#canSend('input', bufferedAmount, now); }
  inputSent(now) { this.#sent('input', now); }
  reset() { this.#remaining = null; this.#until = -Infinity; }
}
