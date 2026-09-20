import { createHash } from 'node:crypto';
import protocol from '../../src/network/protocol.json' with { type: 'json' };
import { encodeProjectedBinaryFrame, encodeBinaryState, decodeBinaryState } from '../../src/network/BinarySnapshot.mjs';
import { LAN_DELTA_MAX_BYTES, LAN_DELTA_HEADER, LanDeltaReceiver } from '../../src/network/LanBinaryDelta.mjs';
import { lanDeltaTarget, LanDeltaSender } from '../LanDeltaTransport.mjs';
import { SteamSnapshotEncoder, SteamSnapshotSender, SteamSnapshotReceiver } from './snapshot-delta.mjs';

// Negotiated binaryState:1, host->guest states ONLY. Inner SLD1 restores the
// complete SWB1. SSB1 additionally verifies canonical JSON size + SHA256 before
// forwarding to the unchanged local text bridge / issuing any consumption ACK.
const HEADER = 40, MAGIC = 'SSB1';
export const STEAM_BINARY_MAX_BYTES = HEADER + LAN_DELTA_HEADER + LAN_DELTA_MAX_BYTES;
const hash = text => createHash('sha256').update(text).digest();
const invalid = () => { throw Error('无效 Steam 二进制状态'); };
const isState = value => value?.type === 'state' && typeof value.matchId === 'string' && value.matchId.length > 0 && value.matchId.length <= 128
  && Number.isSafeInteger(value.seq) && value.seq >= 0 && value.frame && typeof value.frame === 'object' && !Array.isArray(value.frame)
  && Number.isSafeInteger(value.frame.tick) && value.frame.tick >= 0;
function envelope(target, packet) {
  const out = Buffer.allocUnsafe(HEADER + packet.length);
  out.write(MAGIC); out.writeUInt32LE(target.size, 4); target.hash.copy(out, 8); out.set(packet, HEADER);
  return out;
}
/** One broadcast cache, including negative eligibility; no history of worlds. */
export class SteamBinarySnapshotEncoder {
  constructor() { this.legacy = new SteamSnapshotEncoder(); this.clear(); }
  clear() { this.text = null; this.current = null; this.relayText = null; this.legacy.clear(); }
  prepare(text) {
    if (this.text === text) return this.current;
    this.text = text; this.current = null; this.relayText = null;
    // Internal relay handoff ONLY, after binary decode and host/match/frame
    // validation. It owns immutable SWB1 bytes and the corresponding plain state.
    // No network peer may construct this descriptor or bypass relay validation.
    const relay = typeof text !== 'string' ? text : null;
    if (relay) text = this.relayText = JSON.stringify(relay.state);
    const rawBytes = Buffer.byteLength(text);
    if (rawBytes < 4096 || rawBytes > protocol.maxSnapshotBytes) return null;
    let value, frame, bytes;
    try {
      value = relay ? relay.state : JSON.parse(text);
      // SWB1 defines these four ordered keys. Extra/reordered fields, Unicode
      // not representable losslessly, unsafe dictionary keys or big/custom data
      // keep the old full/tree format instead of being removed or rejected.
      if (!isState(value) || Object.keys(value).join('|') !== 'type|matchId|seq|frame') return null;
      // JSON.parse gives fresh plain data with no getters, custom iterators or
      // prototypes. The projected writer validates every value/key while writing.
      if (relay) bytes = relay.bytes;
      else {
        frame = encodeProjectedBinaryFrame(value.frame);
        if (!frame) return null;
        bytes = encodeBinaryState(value.matchId, value.seq, frame);
      }
    } catch { return null; }
    const delta = lanDeltaTarget(bytes, value.seq);
    if (!delta) return null;
    const canonical = relay ? text : JSON.stringify(value), size = Buffer.byteLength(canonical);
    if (size > protocol.maxSnapshotBytes) return null;
    this.legacy.clear();
    return this.current = { delta, size, hash: hash(canonical), matchId: value.matchId, prepared: new WeakMap() };
  }
}
/** Previous successful native send is the only compression base. */
export class SteamBinarySnapshotSender {
  constructor() {
    this.sender = new LanDeltaSender({ ordered: true, motionReference: true });
    this.legacy = new SteamSnapshotSender(); this.matchId = null; this.revision = 0; this.choices = new WeakSet();
  }
  reset() { this.sender.reset(); this.legacy.reset(); this.matchId = null; this.revision++; this.choices = new WeakSet(); }
  diagnostics() {
    const d = this.sender.stats(), old = this.legacy.diagnostics();
    return { ...old, fullStates: old.fullStates + d.full, deltaStates: old.deltaStates + d.delta,
      baselineBytes: this.sender.base?.bytes.length ?? old.baselineBytes,
      binaryFullStates: d.full, binaryDeltaStates: d.delta, motionDeltas: d.motionDeltas, budgetFallbacks: d.budgetFallbacks };
  }
  prepare(text, encoder, codec, now = Date.now()) {
    const target = encoder.prepare(text);
    if (typeof text !== 'string') text = encoder.relayText;
    let result;
    if (!target) {
      const legacy = this.legacy.prepare(text, encoder.legacy, codec, now);
      result = { ...legacy, legacy };
    } else {
      // A new match or periodic checkpoint is a self-contained state. Never
      // checkpoint a skipped/failed send: fullAt advances only at commit.
      const reset = this.matchId !== target.matchId || now - this.fullAt >= 10000;
      const stream = reset ? new LanDeltaSender({ ordered: true, motionReference: true }) : this.sender;
      const choice = stream.prepare(target.delta);
      const key = choice.delta ? stream.base.bytes : target.delta.bytes;
      let cached = target.prepared.get(key);
      // Work-budget full fallback may differ from a cached delta for this base.
      if (!cached || cached.delta !== choice.delta || cached.motionSteps !== choice.motionSteps) {
        cached = { prepared: codec.prepareBinaryState(envelope(target, choice.packet)), delta: choice.delta, motionSteps: choice.motionSteps };
        target.prepared.set(key, cached);
      }
      result = { prepared: cached.prepared, target, delta: choice.delta, motionSteps: choice.motionSteps, stream, choice, now };
    }
    result.rawBytes = Buffer.byteLength(text);
    result.revision = this.revision; this.choices.add(result); return result;
  }
  commit(choice) {
    if (!this.choices.has(choice) || choice.revision !== this.revision) return false;
    this.choices.delete(choice); this.revision++;
    if (choice.legacy) {
      this.legacy.commit(choice.legacy); this.sender.reset(); this.matchId = null; return true;
    }
    if (!choice.stream.commit(choice.choice)) return false;
    // Preserve counters across checkpoint streams without preserving old bases.
    if (choice.stream !== this.sender) {
      for (const key of Object.keys(this.sender.totals)) choice.stream.totals[key] += this.sender.totals[key];
      this.sender = choice.stream;
    }
    this.matchId = choice.target.matchId; this.legacy.reset();
    if (!choice.delta) this.fullAt = choice.now;
    return true;
  }
}
export class SteamBinarySnapshotReceiver {
  constructor() {
    this.receiver = new LanDeltaReceiver({ motionReference: true }); this.legacy = new SteamSnapshotReceiver();
    this.base = null; this.fullStates = 0; this.deltaStates = 0; this.misses = 0; this.motionDeltas = 0;
  }
  reset() { this.receiver.reset(); this.base = null; }
  diagnostics() {
    const old = this.legacy.diagnostics();
    return { fullStates: this.fullStates + old.fullStates, deltaStates: this.deltaStates + old.deltaStates,
      misses: this.misses + old.misses, baselineBytes: this.receiver.retainedBytes || old.baselineBytes,
      binaryFullStates: this.fullStates, binaryDeltaStates: this.deltaStates, motionDeltas: this.motionDeltas };
  }
  receive(data) {
    if (!Buffer.isBuffer(data)) {
      const incoming = this.legacy.receive(data);
      if (incoming.data?.type === 'state' || incoming.needsFull) this.reset();
      return incoming;
    }
    try {
      if (data.length <= HEADER + LAN_DELTA_HEADER || data.length > STEAM_BINARY_MAX_BYTES || data.toString('ascii', 0, 4) !== MAGIC) invalid();
      const size = data.readUInt32LE(4), packet = data.subarray(HEADER);
      if (!size || size > protocol.maxSnapshotBytes || packet.readUInt32BE(0) !== 0x534c4431) invalid();
      const flags = packet.readUInt32BE(4), baseSeq = packet.readDoubleBE(8), seq = packet.readDoubleBE(16), targetSize = packet.readUInt32BE(24);
      const delta = !!(flags & 1), motion = !!(flags & 4), steps = flags >>> 8;
      if (flags & ~0x3f07 || !(flags & 2) || (motion ? !delta || steps < 1 || steps > 60 : steps !== 0)
        || !Number.isSafeInteger(seq) || seq < 0 || !Number.isSafeInteger(baseSeq) || baseSeq < 0 || !targetSize || targetSize > LAN_DELTA_MAX_BYTES
        || (delta ? baseSeq >= seq : baseSeq !== 0 || packet.readUInt32BE(28) !== 0 || packet.length !== LAN_DELTA_HEADER + targetSize)) invalid();
      if (delta && this.base?.seq !== baseSeq) {
        this.reset(); this.misses++; return { data: null, needsFull: true };
      }
      if (!delta) this.reset(); // Full supports a new match/sequence epoch.
      const bytes = this.receiver.decode(packet), value = decodeBinaryState(bytes);
      if (!isState(value)) invalid();
      const canonical = JSON.stringify(value);
      if (Buffer.byteLength(canonical) !== size || !hash(canonical).equals(data.subarray(8, HEADER))) invalid();
      this.base = { seq }; this.legacy.base = null;
      if (delta) this.deltaStates++; else this.fullStates++;
      if (motion) this.motionDeltas++;
      // Expose only the fully restored, canonical-SHA-validated SWB1. The local
      // bridge may forward these same bytes; never forward a delta/reference.
      return { data: value, canonicalText: canonical, binaryState: bytes, needsFull: false };
    } catch (error) { this.reset(); throw error; }
  }
}
