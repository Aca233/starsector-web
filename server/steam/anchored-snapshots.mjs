// Experimental protocol component, NOT enabled by SteamGateway. A future native
// transport must negotiate it and deliver anchor/control messages reliably while
// sending replaceable snapshots with bounded, congestion-aware admission. Merely
// changing the legacy SendType is NOT sufficient (1200-byte unreliable limit).
import { SteamSnapshotSender, SteamSnapshotReceiver } from './snapshot-delta.mjs';

const uint = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const newer = (value, previous) => previous === null || value !== previous && ((value - previous) >>> 0) < 0x80000000;
const anchorOf = (target, at) => ({ token: target.token, value: target.value, size: target.size, at });

export class SteamAnchoredSender {
  constructor({ adaptive = false } = {}) { this.adaptive = adaptive; this.generation = 0; this.reset(); }
  reset() {
    this.generation++;
    this.revision = 0;
    this.choices = new WeakSet();
    this.confirmed = null;
    this.pending = null;
    this.sentAnchors = 0;
    this.sentSnapshots = 0; this.snapshotBytes = 0;
  }
  choice(kind, fields = {}) {
    const choice = { ...fields, kind, generation: this.generation, revision: this.revision };
    this.choices.add(choice);
    return choice;
  }
  prepare(text, encoder, codec, now = Date.now()) {
    const target = encoder.prepare(text, codec);
    // Large/deep states need an explicitly designed reliable fallback. Do not
    // silently put them in the lossy path or claim this prototype covers them.
    if (!target) return this.choice('unsupported');
    const base = this.confirmed ?? this.pending;
    if (base && base.value.matchId !== target.value.matchId) return this.choice('reset-required');
    // Room-level credit can deliberately reduce delivered rate. A fixed 5s
    // reliable checkpoint for every guest would then consume the whole shared
    // uplink. Refresh only after enough admitted snapshot bytes amortize it;
    // independent deltas remain valid against the same acknowledged anchor.
    if (!base || !this.pending && now - base.at >= 5000 && (!this.adaptive || this.snapshotBytes >= target.full.payload.length * 4)) {
      return this.choice('anchor', { target, prepared: target.full, at: now });
    }
    // Reuse the production bounded, lossless patch encoder, but ALWAYS diff
    // against the confirmed anchor (or the sole initial anchor while its ACK
    // travels back). A dropped intermediate snapshot cannot break a chain.
    const encoderState = new SteamSnapshotSender();
    encoderState.base = base;
    encoderState.fullAt = now;
    return this.choice('snapshot', encoderState.prepare(text, encoder, codec, now));
  }
  commit(choice) {
    if (!this.choices.has(choice)) return false;
    this.choices.delete(choice);
    if (choice.generation !== this.generation || choice.revision !== this.revision) return false;
    if (choice.kind === 'anchor') {
      // A choice prepared before an anchor commit/ACK cannot resurrect a retired
      // baseline, even after the pending slot has become empty again. WeakSet
      // ownership also prevents duplicate/cross-sender commits without retaining
      // an unbounded history of prepared worlds. Commit immediately after send.
      if (this.pending) return false;
      this.pending = anchorOf(choice.target, choice.at);
      this.revision++;
      this.sentAnchors++; this.snapshotBytes = 0;
      return true;
    }
    if (choice.kind === 'snapshot') { this.sentSnapshots++; this.snapshotBytes += choice.prepared.payload.length; return true; }
    return false;
  }
  acknowledgeAnchor(token) {
    // Caller MUST verify the current connection nonce before passing an ACK.
    // Token/generation counters are not wire authentication across reconnects.
    if (!uint(token) || this.pending?.token !== token) return false;
    this.confirmed = this.pending;
    this.pending = null;
    this.revision++;
    return true;
  }
  diagnostics() {
    return {
      anchorCount: Number(!!this.confirmed) + Number(!!this.pending),
      anchorCanonicalBytes: (this.confirmed?.size ?? 0) + (this.pending?.size ?? 0),
      sentAnchors: this.sentAnchors, sentSnapshots: this.sentSnapshots, snapshotBytes: this.snapshotBytes, adaptive: this.adaptive,
    };
  }
}

export class SteamAnchoredReceiver {
  constructor() { this.reset(); }
  reset() {
    this.anchors = new Map();
    this.newestAnchor = null;
    this.deliveredToken = null;
    this.matchId = null;
    this.delivered = 0;
    this.stale = 0;
    this.misses = 0;
  }
  metadata(envelope) {
    if (envelope?.type !== 'steam-state' || envelope.v !== 1 || !uint(envelope.token)
      || !(envelope.base === null || uint(envelope.base))) throw Error('Invalid anchored snapshot envelope');
  }
  checkMatch(data) {
    if (this.matchId !== null && data.matchId !== this.matchId) throw Error('Anchored match requires explicit reset');
  }
  deliver(envelope, data) {
    if (!newer(envelope.token, this.deliveredToken)) { this.stale++; return null; }
    this.matchId = data.matchId;
    this.deliveredToken = envelope.token;
    this.delivered++;
    return data;
  }
  receiveAnchor(envelope) {
    this.metadata(envelope);
    if (envelope.base !== null) throw Error('Anchor must be a complete state');
    const decoder = new SteamSnapshotReceiver(), { data } = decoder.receive(envelope);
    this.checkMatch(data);
    const existing = this.anchors.get(envelope.token);
    if (existing && (existing.hash !== envelope.hash || existing.size !== envelope.size)) throw Error('Anchor token reused for different state');
    if (newer(envelope.token, this.newestAnchor)) {
      this.anchors.set(envelope.token, { ...decoder.base, hash: envelope.hash });
      this.newestAnchor = envelope.token;
      while (this.anchors.size > 2) this.anchors.delete(this.anchors.keys().next().value);
    }
    // ACK valid duplicate anchors too, but never renew presentation liveness or
    // reinsert a retired anchor that arrived late. The sender matches its pending
    // token on the current connection before changing its confirmed baseline.
    return { data: this.deliver(envelope, data), anchorAck: envelope.token, needsAnchor: false };
  }
  receiveSnapshot(envelope) {
    this.metadata(envelope);
    if (!newer(envelope.token, this.deliveredToken)) { this.stale++; return { data: null, needsAnchor: false }; }
    const base = envelope.base === null ? null : this.anchors.get(envelope.base);
    if (envelope.base !== null && !base) { this.misses++; return { data: null, needsAnchor: true }; }
    const decoder = new SteamSnapshotReceiver();
    decoder.base = base;
    const { data } = decoder.receive(envelope);
    this.checkMatch(data);
    return { data: this.deliver(envelope, data), needsAnchor: false };
  }
  diagnostics() {
    return {
      anchorCount: this.anchors.size,
      anchorCanonicalBytes: [...this.anchors.values()].reduce((sum, anchor) => sum + anchor.size, 0),
      delivered: this.delivered, stale: this.stale, misses: this.misses,
    };
  }
}
