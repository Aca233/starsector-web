import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib';
import { decodeCombatState, COMBAT_STATE_MAX_BYTES } from '../../src/network/CriticalCombatState.mjs';
import { visualPacketBytes, visualReceipt, VISUAL_FRAGMENT_BYTES } from '../../src/network/ProjectileVisualPacket.mjs';
import { SteamMotionBudget } from './motion-channel.mjs';

// Optional presentation only. No inputs, damage events or lifecycle messages.
// Every combat frame is complete; visual fragments retain their application ACK.
// A lost frame tears down this optional epoch instead of forging receipt credit.
const MAGIC = 'SWLC', HEADER = 44, MTU = 1200, PART = MTU - HEADER;
const RAW = 65536, WIRE = 32768, TTL = 500;
const nonce = n => typeof n === 'string' && /^[a-f0-9]{32}$/.test(n);
const scope = n => typeof n === 'string' && n.length > 0 && n.length <= 64;
export const isSteamComponentPacket = b => Buffer.isBuffer(b) && b.toString('ascii', 0, 4) === MAGIC;
function validate(m) {
  if (!scope(m?.matchId) || !scope(m.syncId) || !Number.isSafeInteger(m.tick) || m.tick < 0) throw Error('Invalid component epoch');
  if (m.type === 'combat-state') {
    if (typeof m.data !== 'string' || m.data.length > Math.ceil(COMBAT_STATE_MAX_BYTES / 3) * 4 || m.data.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(m.data)) throw Error('Invalid combat payload');
    if (decodeCombatState(Buffer.from(m.data, 'base64')).tick !== m.tick) throw Error('Combat tick mismatch');
  } else if (m.type === 'projectile-visual') visualPacketBytes(m);
  else throw Error('Invalid component family');
  return m;
}
const key = m => JSON.stringify([m.type === 'combat-state' || m.type === 'combat-consumed' ? 'combat' : 'visual', m.matchId, m.syncId, m.tick, m.key ?? null, m.kind ?? null, m.offset ?? null, m.total ?? null]);
function receipt(m, status) {
  if (m.type === 'combat-state') return { type: 'combat-consumed', matchId: m.matchId, syncId: m.syncId, tick: m.tick, status };
  return visualReceipt(m, status);
}
function validStatus(m, status) {
  if (status === 'discarded') return true;
  const partial = m.kind === 'baseline' && m.offset !== undefined && m.offset + VISUAL_FRAGMENT_BYTES < m.total;
  return status === (partial ? 'fragment' : 'consumed');
}
function accepts(m, r) {
  return r && key(m) === key(r) && r.type === (m.type === 'combat-state' ? 'combat-consumed' : 'visual-consumed') && validStatus(m, r.status);
}
export class SteamComponentBudget extends SteamMotionBudget {
  constructor(options = {}) { super({ bytesPerSecond: 128 * 1024, burst: WIRE, ...options }); this.flight = 0; }
}
export function encodeSteamComponent(connection, id, message) {
  if (!nonce(connection) || !Number.isSafeInteger(id) || id < 1) throw Error('Invalid component identity');
  validate(message);
  const raw = Buffer.from(JSON.stringify(message)); if (raw.length > RAW) throw Error('Component raw budget');
  const zipped = deflateRawSync(raw, { level: 1 }), compressed = zipped.length < raw.length, bytes = compressed ? zipped : raw;
  if (bytes.length > WIRE) return null;
  const count = Math.ceil(bytes.length / PART), sum = crc32(raw), packets = [];
  for (let i = 0; i < count; i++) {
    const part = bytes.subarray(i * PART, (i + 1) * PART), p = Buffer.alloc(HEADER + part.length);
    p.write(MAGIC); p[4] = 1; p[5] = Number(compressed); p[6] = i; p[7] = count;
    p.writeDoubleLE(id, 8); p.writeUInt32LE(bytes.length, 16); p.writeUInt32LE(raw.length, 20);
    Buffer.from(connection, 'hex').copy(p, 24); p.writeUInt32LE(sum, 40); part.copy(p, HEADER); packets.push(p);
  }
  return { packets, bytes: bytes.length + count * HEADER };
}
export class SteamComponentSender {
  constructor(connection, budget, sendPacket, failed, { now = () => performance.now() } = {}) {
    this.connection = connection; this.budget = budget; this.sendPacket = sendPacket; this.failed = failed; this.now = now;
    this.serial = 0; this.pending = new Map(); this.bytes = 0; this.reset();
  }
  reset() {
    this.generation = (this.generation ?? 0) + 1;
    this.budget.flight -= this.bytes; this.bytes = 0; this.pending.clear(); this.budget.forget(this.connection);
    this.disabled = null; this.lastConsumed = null;
    this.counts = { sent: 0, consumed: 0, discarded: 0, fragment: 0, skipped: 0, failed: 0 };
  }
  fail(reason) {
    if (this.disabled) return;
    this.disabled = reason; this.counts.failed++;
    this.budget.flight -= this.bytes; this.bytes = 0; this.pending.clear(); this.budget.forget(this.connection);
    const generation = this.generation;
    queueMicrotask(() => { if (this.generation === generation && this.disabled === reason) this.failed(reason); });
  }
  poll() { if ([...this.pending.values()].some(p => this.now() - p.at > TTL)) this.fail('component-loss-or-consumer-stall'); }
  get writable() { this.poll(); return !this.disabled && this.pending.size < 4 && this.bytes < WIRE && this.budget.flight < WIRE * 2; }
  get active() { return !this.disabled && this.lastConsumed !== null && this.now() - this.lastConsumed < 250; }
  send(message) {
    if (!this.writable) return false;
    const encoded = encodeSteamComponent(this.connection, ++this.serial, message);
    if (!encoded || encoded.bytes + this.bytes > WIRE || encoded.bytes + this.budget.flight > WIRE * 2 || !this.budget.take(encoded.bytes, this.connection)) { this.counts.skipped++; return false; }
    // Retain receipt identity only, never a retransmission/payload queue.
    this.pending.set(this.serial, { receipt: receipt(message, 'consumed'), bytes: encoded.bytes, at: this.now() });
    this.bytes += encoded.bytes; this.budget.flight += encoded.bytes;
    for (const p of encoded.packets) {
      let ok = false; try { ok = this.sendPacket(p) === true; } catch { /* optional transport failure */ }
      if (!ok) { this.fail('component-sdk-refused'); return false; }
    }
    this.counts.sent++; return true;
  }
  consume(id, r) {
    this.poll(); const p = this.pending.get(id);
    if (!p || !r || key(p.receipt) !== key(r) || p.receipt.type !== r.type || !validStatus(p.receipt, r.status)) return null;
    this.pending.delete(id); this.bytes -= p.bytes; this.budget.flight -= p.bytes; this.counts[r.status]++;
    if (r.status === 'consumed') this.lastConsumed = this.now();
    return { ...p.receipt, status: r.status };
  }
  stats() { return { ...this.counts, inflight: this.pending.size, bytes: this.bytes, fallback: this.disabled, active: this.active }; }
}
export class SteamComponentReceiver {
  constructor(connection, { now = () => performance.now() } = {}) { this.connection = connection; this.now = now; this.reset(); }
  reset() { this.parts = new Map(); this.receipts = new Map(); this.seen = new Set(); this.high = 0; }
  receive(p, matchId, syncId) {
    if (!scope(matchId) || !scope(syncId) || !isSteamComponentPacket(p) || p.length < HEADER || p.length > MTU || p[4] !== 1 || p[5] > 1 || p.subarray(24, 40).toString('hex') !== this.connection) return null;
    const id = p.readDoubleLE(8), encoded = p.readUInt32LE(16), raw = p.readUInt32LE(20), crc = p.readUInt32LE(40), i = p[6], count = p[7];
    if (!Number.isSafeInteger(id) || id < 1 || id < this.high - 64 || this.seen.has(id) || !encoded || encoded > WIRE || !raw || raw > RAW || count !== Math.ceil(encoded / PART) || i >= count || p.length !== HEADER + Math.min(PART, encoded - i * PART) || !p[5] && raw !== encoded) return null;
    for (const [k, row] of this.parts) if (this.now() - row.at > TTL) this.parts.delete(k);
    let row = this.parts.get(id);
    if (!row) { if (this.parts.size >= 4) return null; row = { encoded, raw, crc, compressed: p[5], parts: new Map(), at: this.now() }; this.parts.set(id, row); }
    if (row.encoded !== encoded || row.raw !== raw || row.crc !== crc || row.compressed !== p[5]) { this.parts.delete(id); return null; }
    row.parts.set(i, Buffer.from(p.subarray(HEADER))); if (row.parts.size !== count) return null;
    this.parts.delete(id);
    try {
      const payload = Buffer.concat(Array.from({ length: count }, (_, j) => row.parts.get(j))), bytes = row.compressed ? inflateRawSync(payload, { maxOutputLength: raw }) : payload;
      if (bytes.length !== raw || crc32(bytes) !== crc || this.receipts.size >= 16) return null;
      const m = validate(JSON.parse(bytes.toString('utf8')));
      if (m.matchId !== matchId || m.syncId !== syncId) return null;
      this.high = Math.max(this.high, id); this.seen.add(id); for (const k of this.seen) if (k < this.high - 64) this.seen.delete(k);
      // An exact application receipt, not successful reassembly, frees flight.
      this.receipts.set(key(m), { id, message: { ...receipt(m, "consumed"), type: m.type } }); return m;
    } catch { return null; }
  }
  consume(r) {
    if (!r) return null;
    const row = this.receipts.get(key(r)); if (!row || !accepts(row.message, r)) return null;
    this.receipts.delete(key(r)); return { component: row.id, receipt: receipt(row.message, r.status) };
  }
}
