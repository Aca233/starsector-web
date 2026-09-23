import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib';
import { motionFromText } from '../../src/network/MotionFrame.mjs';
import { AutoMotionAdmission } from '../AutoMotionAdmission.mjs';

// Independent, self-contained pose datagrams. NEVER send input, actions, damage,
// lifecycle or delta baselines here. Missing fragments expire, not retransmit.
const MAGIC = 'SWMO', HEADER = 40, MTU = 1200, PART = MTU - HEADER;
const MAX_RAW = 16384, TTL = 250;
const validNonce = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
const scope = value => typeof value === 'string' && value.length > 0 && value.length <= 128;
export const isSteamMotionPacket = packet => Buffer.isBuffer(packet) && packet.toString('ascii', 0, 4) === MAGIC;
function validate(message) {
  if (message?.type !== 'motion' || !scope(message.matchId) || !scope(message.syncId) || typeof message.data !== 'string') throw Error('Invalid Steam motion scope');
  return motionFromText(message.data).tick;
}
export function encodeSteamMotion(connection, message) {
  if (!validNonce(connection)) throw Error('Invalid Steam motion connection');
  const tick = validate(message);
  const raw = Buffer.from(JSON.stringify({ type: 'motion', matchId: message.matchId, syncId: message.syncId, data: message.data }));
  if (raw.length > MAX_RAW) throw Error('Steam motion exceeds budget');
  const compressed = deflateRawSync(raw, { level: 1 }), zipped = compressed.length < raw.length;
  const payload = zipped ? compressed : raw, count = Math.ceil(payload.length / PART), checksum = crc32(raw);
  const packets = [];
  for (let index = 0; index < count; index++) {
    const part = payload.subarray(index * PART, (index + 1) * PART), packet = Buffer.alloc(HEADER + part.length);
    packet.write(MAGIC); packet[4] = 1; packet[5] = Number(zipped); packet[6] = index; packet[7] = count;
    packet.writeDoubleLE(tick, 8); packet.writeUInt16LE(payload.length, 16); packet.writeUInt16LE(raw.length, 18);
    Buffer.from(connection, 'hex').copy(packet, 20); packet.writeUInt32LE(checksum, 36); part.copy(packet, HEADER); packets.push(packet);
  }
  return { tick, packets, bytes: payload.length + count * HEADER };
}
/** One room-wide wire budget, not one full-rate allowance per recipient. No queue. */
export class SteamMotionBudget {
  constructor({ now = () => performance.now(), bytesPerSecond = 65536, burst = 16384 } = {}) {
    this.now = now; this.rate = bytesPerSecond; this.burst = burst; this.tokens = burst; this.at = now(); this.waiting = new Map();
  }
  forget(key) { this.waiting.delete(key); }
  take(bytes, key) {
    const at = this.now(); this.tokens = Math.min(this.burst, this.tokens + Math.max(0, at - this.at) * this.rate / 1000); this.at = Math.max(at, this.at);
    if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > this.burst) return false;
    for (const [id, row] of this.waiting) if (at - row.at > 250) this.waiting.delete(id);
    this.waiting.set(key, { bytes, at });
    const first = this.waiting.keys().next().value;
    if (bytes + (first !== key ? this.waiting.get(first).bytes : 0) > this.tokens) return false;
    this.waiting.delete(key); this.tokens -= bytes; return true;
  }
}
/** Per authenticated peer. Full-world and pose receipts never train network RTT. */
export class SteamMotionSender {
  constructor(connection, budget, sendPacket, { now = () => performance.now() } = {}) {
    this.connection = connection; this.budget = budget; this.sendPacket = sendPacket; this.now = now;
    this.guard = new AutoMotionAdmission({ now }); this.reset();
  }
  reset(matchId = this.matchId ?? null) {
    if (matchId !== this.matchId) {
      this.failures = 0; this.fallback = null;
      this.counts = { sent: 0, consumed: 0, superseded: 0, expired: 0, skipped: 0, refused: 0, wireBytes: 0 };
    }
    this.budget.forget(this.connection);
    this.worlds = new Map(); this.pending = new Map(); this.bytes = 0; this.lastTick = -1; this.syncId = null;
    this.matchId = matchId; this.guard.resetEpoch(matchId);
  }
  worldSent(id, { matchId, seq, tick }) {
    if (!scope(matchId) || !Number.isSafeInteger(seq) || seq < 0 || !Number.isSafeInteger(tick) || tick < 0) return;
    if (this.matchId !== matchId) this.reset(matchId);
    this.worlds.set(id, { seq, tick }); this.guard.sent(seq, tick);
    while (this.worlds.size > 64) this.worlds.delete(this.worlds.keys().next().value);
  }
  worldConsumed(id, discarded = false) {
    const row = this.worlds.get(id); if (!row) return false;
    this.worlds.delete(id);
    if (discarded || !this.guard.consumed(row.seq)) return false;
    // A real newer complete world already contains these poses. Retire them as
    // superseded, NOT motion-consumed or lost, even if its reliable packet won
    // the race with the datagram. Otherwise healthy fast links falsely fall back.
    this.lastTick = Math.max(this.lastTick, row.tick);
    for (const [tick, pending] of this.pending) if (tick <= row.tick) {
      this.pending.delete(tick); this.bytes -= pending.bytes; this.counts.superseded++;
    }
    return true;
  }
  expire() {
    for (const [tick, row] of this.pending) if (this.now() - row.at > TTL) {
      this.pending.delete(tick); this.bytes -= row.bytes; this.counts.expired++; this.failures++;
    }
    // Loss is not a forged consumption ACK. Sustained failure disables only the
    // optional lane; complete reliable snapshots continue at the same cadence.
    if (this.failures >= 3) this.fallback = 'motion-loss-or-consumer-stall';
  }
  send(message) {
    this.expire();
    const tick = validate(message);
    if (this.fallback || message.matchId !== this.matchId || !this.guard.allow(tick) || tick <= this.lastTick || this.pending.size >= 4) { this.counts.skipped++; return false; }
    if (this.syncId !== null && this.syncId !== message.syncId) return false; // launch resets before a new sync
    const encoded = encodeSteamMotion(this.connection, message);
    if (this.bytes + encoded.bytes > 16384 || !this.budget.take(encoded.bytes, this.connection)) { this.counts.skipped++; return false; }
    this.syncId = message.syncId; this.lastTick = tick;
    this.pending.set(tick, { at: this.now(), bytes: encoded.bytes }); this.bytes += encoded.bytes;
    for (const packet of encoded.packets) {
      let accepted = false; try { accepted = this.sendPacket(packet) === true; } catch { /* SDK refusal drops this pose, not the session. */ }
      if (!accepted) { this.counts.refused++; return false; }
      this.counts.wireBytes += packet.length;
    }
    this.counts.sent++; return true;
  }
  consumed(receipt) {
    this.expire();
    if (receipt?.matchId !== this.matchId || receipt.syncId !== this.syncId || !this.pending.has(receipt.tick)) return false;
    // A completed newer pose replaces older complete/lost ones; not a bulk ACK.
    for (const [tick, row] of this.pending) if (tick <= receipt.tick) { this.pending.delete(tick); this.bytes -= row.bytes; }
    this.counts.consumed++; this.failures = 0; return true;
  }
  stats() { return { ...this.counts, inflight: this.pending.size, bytes: this.bytes, fallback: this.fallback, world: this.guard.stats() }; }
}
/** Guest only. Connection is checked BEFORE accepting fragments or allocating. */
export class SteamMotionReceiver {
  constructor(connection, { now = () => performance.now() } = {}) { this.connection = connection; this.now = now; this.hidden = false; this.reset(); }
  reset(matchId = null, syncId = null) {
    this.matchId = matchId; this.syncId = syncId; this.parts = new Map(); this.receipts = new Map();
    this.worlds = new Map(); this.ready = false; this.lastTick = -1;
  }
  setHidden(hidden) {
    if (this.hidden === hidden) return;
    this.hidden = hidden; this.ready = false; this.parts.clear(); this.receipts.clear(); this.worlds.clear();
  }
  // Only metadata for worlds actually forwarded to this browser. After a
  // visibility/resync boundary, an older receipt cannot re-arm datagrams.
  worldReceived(id, state) {
    if (this.hidden || !this.syncId || state?.matchId !== this.matchId || !Number.isSafeInteger(state.frame?.tick)) return;
    this.worlds.set(id, state.frame.tick);
    while (this.worlds.size > 64) this.worlds.delete(this.worlds.keys().next().value);
  }
  worldConsumed(id) {
    const tick = this.worlds.get(id);
    if (tick === undefined || this.hidden) return false;
    this.worlds.delete(id); this.lastTick = Math.max(this.lastTick, tick); this.ready = true;
    for (const old of this.parts.keys()) if (old <= this.lastTick) this.parts.delete(old);
    return true;
  }
  receive(packet) {
    if (!this.ready || this.hidden || !this.matchId || !this.syncId || !isSteamMotionPacket(packet) || packet.length < HEADER || packet.length > MTU || packet[4] !== 1 || packet[5] > 1 || packet.subarray(20, 36).toString('hex') !== this.connection) return null;
    const tick = packet.readDoubleLE(8), index = packet[6], count = packet[7], encoded = packet.readUInt16LE(16), raw = packet.readUInt16LE(18), checksum = packet.readUInt32LE(36);
    if (!Number.isSafeInteger(tick) || tick < 0 || tick <= this.lastTick || encoded < 1 || encoded > MAX_RAW || raw < 1 || raw > MAX_RAW || count !== Math.ceil(encoded / PART) || index >= count || packet.length !== HEADER + Math.min(PART, encoded - index * PART) || (!packet[5] && encoded !== raw)) return null;
    const at = this.now(); for (const [id, row] of this.parts) if (at - row.at > TTL) this.parts.delete(id);
    let row = this.parts.get(tick);
    if (!row) {
      if (this.parts.size >= 2) { const oldest = Math.min(...this.parts.keys()); if (tick <= oldest) return null; this.parts.delete(oldest); }
      row = { at, encoded, raw, count, checksum, zipped: packet[5], parts: new Map() }; this.parts.set(tick, row);
    }
    if (row.encoded !== encoded || row.raw !== raw || row.count !== count || row.checksum !== checksum || row.zipped !== packet[5]) { this.parts.delete(tick); return null; }
    if (!row.parts.has(index)) row.parts.set(index, Buffer.from(packet.subarray(HEADER)));
    if (row.parts.size !== count) return null;
    this.parts.delete(tick);
    try {
      const input = Buffer.concat(Array.from({ length: count }, (_, i) => row.parts.get(i)), encoded);
      const data = row.zipped ? inflateRawSync(input, { maxOutputLength: raw }) : input;
      if (data.length !== raw || crc32(data) !== checksum) return null;
      const message = JSON.parse(data.toString('utf8'));
      if (message.matchId !== this.matchId || message.syncId !== this.syncId || validate(message) !== tick || this.receipts.size >= 16) return null;
      this.lastTick = tick; this.receipts.set(tick, true); return message;
    } catch { return null; } // Corrupt/missing optional poses never kill the reliable stream.
  }
  consume(receipt) {
    if (receipt?.matchId !== this.matchId || receipt.syncId !== this.syncId || !this.receipts.has(receipt.tick)) return null;
    for (const tick of this.receipts.keys()) if (tick <= receipt.tick) this.receipts.delete(tick);
    return { motion: 1, matchId: this.matchId, syncId: this.syncId, tick: receipt.tick };
  }
}
