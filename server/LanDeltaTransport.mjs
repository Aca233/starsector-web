import { crc32 } from 'node:zlib';
import { LAN_DELTA_MAX_BYTES, createLanBytePatch, encodeLanPacket, lanBytes } from '../src/network/LanBinaryDelta.mjs';

// One target per broadcast, with shared patch results for equal acknowledged
// anchors. No global history: the target/cache dies after that broadcast.
export function lanDeltaTarget(value, seq, now = performance.now()) {
  const bytes = lanBytes(value);
  if (bytes.length < 4096 || bytes.length > LAN_DELTA_MAX_BYTES) return null;
  return { bytes, seq, crc: crc32(bytes), now, patches: new WeakMap(), patchBuilds: 0, patchMs: 0 };
}
export class LanDeltaSender {
  constructor() { this.reset(); this.totals = { full: 0, delta: 0, anchors: 0, originalBytes: 0, encodedBytes: 0, budgetFallbacks: 0 }; }
  reset() { this.base = null; this.pending = null; this.generation = (this.generation ?? 0) + 1; this.revision = 0; this.choices = new WeakSet(); }
  prepare(target) {
    // Promote at most one reconstructed view per consumption-ACK cycle. The
    // candidate itself may be a delta: no periodic full-frame bandwidth spike.
    const anchor = !this.pending;
    let patch = null, budgetFallback = false;
    if (this.base) {
      if (!target.patches.has(this.base.bytes)) {
        // Bound per-broadcast compute, not just retained bytes. The relay rotates
        // LAN receiver order so divergent slow baselines do not monopolize it.
        if (target.patchBuilds < 2 && target.patchMs < 4) {
          const started = performance.now();
          target.patches.set(this.base.bytes, createLanBytePatch(this.base.bytes, target.bytes));
          target.patchMs += performance.now() - started; target.patchBuilds++;
        } else budgetFallback = true;
      }
      patch = target.patches.get(this.base.bytes) ?? null;
    }
    const packet = encodeLanPacket(target, this.base, patch, anchor);
    const choice = { packet, target, anchor, budgetFallback, delta: !!patch, generation: this.generation, revision: this.revision };
    this.choices.add(choice); return choice;
  }
  commit(choice) {
    if (!this.choices.has(choice) || choice.generation !== this.generation || choice.revision !== this.revision) return false;
    this.choices.delete(choice); this.revision++;
    if (choice.anchor) {
      // Target bytes belong to the immutable incoming WS message and may be
      // shared by peers. Only the confirmed and one pending anchor are retained.
      this.pending = { bytes: choice.target.bytes, seq: choice.target.seq, crc: choice.target.crc, at: choice.target.now };
      this.totals.anchors++;
    }
    this.totals[choice.delta ? 'delta' : 'full']++;
    if (choice.budgetFallback) this.totals.budgetFallbacks++;
    this.totals.originalBytes += choice.target.bytes.length; this.totals.encodedBytes += choice.packet.length;
    return true;
  }
  // Called ONLY after the existing exact LAN consumption-credit membership and
  // match validation succeeds. Cumulative confirmation may cover a pending anchor.
  ack(seq) {
    if (this.pending && seq >= this.pending.seq) { this.base = this.pending; this.pending = null; this.revision++; }
  }
  stats() {
    return { ...this.totals, baseSeq: this.base?.seq ?? null, pendingSeq: this.pending?.seq ?? null,
      retainedBytes: (this.base?.bytes.length ?? 0) + (this.pending?.bytes.length ?? 0) };
  }
}
