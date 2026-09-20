import { createMotionReference, motionSnapshotTick } from '../src/network/SnapshotMotionReference.mjs';
import { crc32 } from 'node:zlib';
import { LAN_DELTA_MAX_BYTES, createLanBytePatch, encodeLanPacket, lanBytes } from '../src/network/LanBinaryDelta.mjs';

// One target per broadcast, with shared patch results for equal retained
// anchors. No global history: the target/cache dies after that broadcast.
export function lanDeltaTarget(value, seq, now = performance.now()) {
  const bytes = lanBytes(value);
  if (bytes.length < 4096 || bytes.length > LAN_DELTA_MAX_BYTES) return null;
  return { bytes, seq, crc: crc32(bytes), now, patches: new WeakMap(), motionPatches: new WeakMap(), patchBuilds: 0, patchMs: 0, packets: new WeakMap(), packetBuilds: 0 };
}
export class LanDeltaSender {
  constructor({ ordered = false, motionReference = false } = {}) { this.ordered = ordered; this.motionReference = motionReference === true; this.reset(); this.totals = { full: 0, delta: 0, anchors: 0, originalBytes: 0, encodedBytes: 0, budgetFallbacks: 0, motionDeltas: 0 }; }
  reset() { this.base = null; this.pending = null; this.generation = (this.generation ?? 0) + 1; this.revision = 0; this.choices = new WeakSet(); }
  prepare(target) {
    // On a reliable ordered WebSocket, the previous successful send is already
    // a safe base: receiver reconstruction precedes consumption/ACK. Waiting an
    // RTT for that ACK needlessly ages the base and inflates moving-state deltas.
    // Keep confirmed-anchor mode for non-FIFO callers and controlled comparisons.
    const anchor = this.ordered || !this.pending;
    let patch = null, budgetFallback = false, motionSteps = 0;
    const cache = this.motionReference ? target.motionPatches : target.patches;
    if (this.base) {
      if (!cache.has(this.base.bytes)) {
        // Bound per-broadcast compute, not just retained bytes. The relay rotates
        // LAN receiver order so divergent slow baselines do not monopolize it.
        if (target.patchBuilds < 2 && target.patchMs < 4) {
          const started = performance.now();
          // A transient compression reference, not the next baseline. Keep
          // original and negotiated caches separate; both share the old total
          // broadcast work budget. Commit ALWAYS retains the full target bytes.
          let source = this.base.bytes, steps = 0;
          if (this.motionReference) {
            const beforeTick = motionSnapshotTick(source), afterTick = motionSnapshotTick(target.bytes);
            const count = beforeTick === null || afterTick === null ? 0 : afterTick - beforeTick;
            if (count > 0 && count <= 60) {
              const predicted = createMotionReference(source, count);
              if (predicted) { source = predicted; steps = count; }
            }
          }
          const candidate = createLanBytePatch(source, target.bytes);
          cache.set(this.base.bytes, this.motionReference ? { patch: candidate, steps: candidate ? steps : 0 } : candidate);
          target.patchMs += performance.now() - started; target.patchBuilds++;
        } else budgetFallback = true;
      }
      const cached = cache.get(this.base.bytes);
      patch = this.motionReference ? cached?.patch ?? null : cached ?? null;
      motionSteps = this.motionReference ? cached?.steps ?? 0 : 0;
    }
    // Prepared packets are immutable broadcast payloads. Equal patch objects
    // still need matching wire base metadata/flags; full packets ignore bases.
    const payload = patch ?? target.bytes;
    let packets = target.packets.get(payload);
    if (!packets) { packets = new Map(); target.packets.set(payload, packets); }
    const key = [patch ? this.base.seq : 0, patch ? this.base.crc : 0, anchor, motionSteps].join(':');
    let packet = packets.get(key);
    if (!packet) { packet = encodeLanPacket(target, this.base, patch, anchor, motionSteps); packets.set(key, packet); target.packetBuilds++; }
    const choice = { packet, target, anchor, budgetFallback, delta: !!patch, motionSteps, generation: this.generation, revision: this.revision };
    this.choices.add(choice); return choice;
  }
  commit(choice) {
    if (!this.choices.has(choice) || choice.generation !== this.generation || choice.revision !== this.revision) return false;
    this.choices.delete(choice); this.revision++;
    if (choice.anchor) {
      // Target bytes belong to the immutable incoming WS message and may be
      // shared by peers. Only the confirmed and one pending anchor are retained.
      const base = { bytes: choice.target.bytes, seq: choice.target.seq, crc: choice.target.crc, at: choice.target.now };
      if (this.ordered) this.base = base;
      else this.pending = base;
      this.totals.anchors++;
    }
    this.totals[choice.delta ? 'delta' : 'full']++;
    if (choice.budgetFallback) this.totals.budgetFallbacks++;
    if (choice.motionSteps) this.totals.motionDeltas++;
    this.totals.originalBytes += choice.target.bytes.length; this.totals.encodedBytes += choice.packet.length;
    return true;
  }
  // Called ONLY after the existing exact LAN consumption-credit membership and
  // match validation succeeds. Cumulative confirmation may cover a pending anchor.
  ack(seq) {
    if (!this.ordered && this.pending && seq >= this.pending.seq) { this.base = this.pending; this.pending = null; this.revision++; }
  }
  stats() {
    return { ...this.totals, baseSeq: this.base?.seq ?? null, pendingSeq: this.pending?.seq ?? null,
      retainedBytes: (this.base?.bytes.length ?? 0) + (this.pending?.bytes.length ?? 0) };
  }
}
