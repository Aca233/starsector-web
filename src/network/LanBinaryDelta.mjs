import { createMotionReference } from './SnapshotMotionReference.mjs';
/** Lossless byte delta for negotiated, reliable LAN WebSockets only.
 * The full SWB1 remains the decoded contract; nothing is quantized or omitted.
 * At most two marked anchors are retained by a receiver, never every snapshot.
 */
export const LAN_DELTA_MAX_BYTES = 2 * 1024 * 1024;
export const LAN_DELTA_HEADER = 36;
const MAGIC = 0x534c4431; // SLD1, distinct from existing SWB1/SWF2.
// motionReference:1 is a separately negotiated extension. Bits 8..13 carry
// 1..60 reference steps ONLY with DELTA|MOTION_REFERENCE. The base CRC still
// names the ORIGINAL retained anchor; the target CRC verifies corrected bytes.
const DELTA = 1, ANCHOR = 2, MOTION_REFERENCE = 4;
const table = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
const crcTables = [table];
for (let k = 1; k < 8; k++) crcTables.push(Uint32Array.from(crcTables[k - 1], c => table[c & 255] ^ (c >>> 8)));
const headerText = new TextDecoder('utf-8', { fatal: true });
const invalid = () => { throw Error('Invalid LAN delta/baseline'); };
export function lanBytes(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return invalid();
}
export function lanCrc32(value) {
  const bytes = lanBytes(value); let crc = -1;
  let i = 0;
  if (bytes.length >= 8) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const [t0, t1, t2, t3, t4, t5, t6, t7] = crcTables;
    for (; i + 8 <= bytes.length; i += 8) {
      const a = crc ^ view.getUint32(i, true), b = view.getUint32(i + 4, true);
      crc = t7[a & 255] ^ t6[a >>> 8 & 255] ^ t5[a >>> 16 & 255] ^ t4[a >>> 24]
        ^ t3[b & 255] ^ t2[b >>> 8 & 255] ^ t1[b >>> 16 & 255] ^ t0[b >>> 24];
    }
  }
  for (; i + 4 <= bytes.length; i += 4) {
    const c = crc ^ (bytes[i] | bytes[i + 1] << 8 | bytes[i + 2] << 16 | bytes[i + 3] << 24);
    crc = crcTables[3][c & 255] ^ crcTables[2][c >>> 8 & 255] ^ crcTables[1][c >>> 16 & 255] ^ table[c >>> 24];
  }
  for (; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}
export function isLanDelta(value) {
  const b = lanBytes(value);
  return b.length >= 4 && new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(0) === MAGIC;
}
/** Pure bounded prototype-free matcher. One continuity candidate plus two hash
 * candidates per position; no chain walk or retained cross-snapshot history. */
export function createLanBytePatch(before, after) {
  const base = lanBytes(before), target = lanBytes(after);
  if (!base.length || base.length > LAN_DELTA_MAX_BYTES || !target.length || target.length > LAN_DELTA_MAX_BYTES) return null;
  const slots = 65536, newest = new Int32Array(slots).fill(-1), older = new Int32Array(slots).fill(-1);
  const a = new DataView(base.buffer, base.byteOffset, base.byteLength), b = new DataView(target.buffer, target.byteOffset, target.byteLength);
  const hash = (v, i) => Math.imul(v.getUint32(i, true) ^ v.getUint32(i + 8, true), 0x9e3779b1) >>> 16;
  // Four-byte indexing finds unchanged float32-aligned runs that eight-byte
  // sampling misses. Hash slots, 16-byte minimum copies and
  // the output/work budgets stay bounded; the SLD1 decoder is unchanged.
  for (let i = 0; i + 16 <= base.length; i += 4) { const h = hash(a, i); older[h] = newest[h]; newest[h] = i; }
  // Abort on non-beneficial patches instead of allocating an expansion. Require
  // >50% raw saving to offset copy metadata before permessage-deflate.
  const out = new Uint8Array(Math.ceil(target.length / 2)); let pos = 0, literalAt = 0, i = 0, shift = 0;
  const vint = n => { while (n >= 128) { out[pos++] = (n & 127) | 128; n >>>= 7; } out[pos++] = n; };
  const literal = end => {
    const length = end - literalAt;
    if (length) { if (pos + length + 5 > out.length) return false; vint(length * 2); out.set(target.subarray(literalAt, end), pos); pos += length; }
    return true;
  };
  while (i + 16 <= target.length) {
    const h = hash(b, i); let best = -1, length = 0;
    // Record layouts usually keep the previous copy's displacement even
    // after a changed numeric field. That exact candidate can survive hash
    // collisions and need not be four-byte aligned. It is never a prediction:
    // every copied byte must match. Prefer it on ties for stable copy offsets.
    for (let slot = 0; slot < 3; slot++) {
      const c = slot === 0 ? i + shift : slot === 1 ? newest[h] : older[h];
      if (c < 0 || c + 16 > base.length) continue;
      if (a.getUint32(c) !== b.getUint32(i) || a.getUint32(c + 4) !== b.getUint32(i + 4) ||
          a.getUint32(c + 8) !== b.getUint32(i + 8) || a.getUint32(c + 12) !== b.getUint32(i + 12)) continue;
      let n = 16;
      while (c + n + 4 <= base.length && i + n + 4 <= target.length &&
          a.getUint32(c + n) === b.getUint32(i + n)) n += 4;
      while (c + n < base.length && i + n < target.length && base[c + n] === target[i + n]) n++;
      if (n > length) { best = c; length = n; }
    }
    if (length >= 16) {
      if (!literal(i) || pos + 10 > out.length) return null;
      shift = best - i; vint(length * 2 + 1); vint(best); i += length; literalAt = i;
    } else i++;
  }
  if (!literal(target.length)) return null;
  return out.slice(0, pos);
}
export function encodeLanPacket({ bytes, seq, crc }, base, patch, anchor = false, motionSteps = 0) {
  bytes = lanBytes(bytes);
  if (!Number.isSafeInteger(seq) || seq < 0 || !bytes.length || bytes.length > LAN_DELTA_MAX_BYTES || (patch && !base)) invalid();
  if (!Number.isInteger(motionSteps) || motionSteps < 0 || motionSteps > 60 || motionSteps && !patch) invalid();
  const payload = patch ?? bytes, out = new Uint8Array(LAN_DELTA_HEADER + payload.length), view = new DataView(out.buffer);
  view.setUint32(0, MAGIC); view.setUint32(4, (patch ? DELTA : 0) | (anchor ? ANCHOR : 0) | (motionSteps ? MOTION_REFERENCE | motionSteps << 8 : 0));
  view.setFloat64(8, patch ? base.seq : 0); view.setFloat64(16, seq); view.setUint32(24, bytes.length);
  view.setUint32(28, patch ? base.crc : 0); view.setUint32(32, crc); out.set(payload, LAN_DELTA_HEADER);
  return out;
}
export class LanDeltaReceiver {
  #anchors = new Map();
  #motionReference = false;
  constructor({ motionReference = false } = {}) { this.#motionReference = motionReference === true; }
  setMotionReference(enabled) { this.reset(); this.#motionReference = enabled === true; }
  reset() { this.#anchors.clear(); }
  get retainedBytes() { let bytes = 0; for (const anchor of this.#anchors.values()) bytes += anchor.bytes.length; return bytes; }
  decode(value) {
    const packet = lanBytes(value);
    if (!isLanDelta(packet)) { this.reset(); return packet; }
    try {
      if (packet.length <= LAN_DELTA_HEADER || packet.length > LAN_DELTA_MAX_BYTES + LAN_DELTA_HEADER) invalid();
      const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength), flags = view.getUint32(4), baseSeq = view.getFloat64(8), seq = view.getFloat64(16), size = view.getUint32(24), baseCrc = view.getUint32(28), crc = view.getUint32(32);
      const motionSteps = flags >>> 8, motion = !!(flags & MOTION_REFERENCE);
      if (flags & ~0x3f07 || (motion ? !this.#motionReference || !(flags & DELTA) || motionSteps < 1 || motionSteps > 60 : motionSteps !== 0)) invalid();
      if (!Number.isSafeInteger(seq) || seq < 0 || !Number.isSafeInteger(baseSeq) || baseSeq < 0 || !size || size > LAN_DELTA_MAX_BYTES) invalid();
      let bytes;
      if (flags & DELTA) {
        const base = this.#anchors.get(baseSeq);
        if (!base || base.crc !== baseCrc || baseSeq >= seq) invalid();
        const source = motion ? createMotionReference(base.bytes, motionSteps) : base.bytes;
        if (!source) invalid();
        bytes = new Uint8Array(size); let read = LAN_DELTA_HEADER, written = 0, operations = 0;
        const vint = () => {
          let n = 0;
          for (let k = 0; k < 5; k++) {
            if (read >= packet.length) invalid(); const x = packet[read++];
            if (k === 4 && x > 15) invalid(); n += (x & 127) * 2 ** (k * 7);
            if (!(x & 128)) return n;
          }
          return invalid();
        };
        while (read < packet.length) {
          if (++operations > 262144) invalid();
          const tag = vint(), length = Math.floor(tag / 2);
          if (!length || length > size - written) invalid();
          if (tag & 1) {
            const offset = vint(); if (offset > source.length - length) invalid();
            bytes.set(source.subarray(offset, offset + length), written);
          } else {
            if (length > packet.length - read) invalid(); bytes.set(packet.subarray(read, read + length), written); read += length;
          }
          written += length;
        }
        if (written !== size) invalid();
      } else {
        if (baseSeq || baseCrc || packet.length !== LAN_DELTA_HEADER + size) invalid();
        bytes = packet.subarray(LAN_DELTA_HEADER);
      }
      if (lanCrc32(bytes) !== crc) invalid();
      if (bytes.length < 10 || new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0) !== 0x53574231) invalid();
      const headerLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true);
      if (!headerLength || headerLength > 1024 || 8 + headerLength >= bytes.length) invalid();
      const inner = JSON.parse(headerText.decode(bytes.subarray(8, 8 + headerLength)));
      if (inner.seq !== seq || typeof inner.matchId !== 'string' || !inner.matchId || inner.matchId.length > 128 ||
          ((flags & DELTA) && this.#anchors.get(baseSeq).matchId !== inner.matchId)) invalid();
      // Retain private owned bytes: callers cannot corrupt future restoration by
      // mutating the returned full packet. No decoded object graph is retained.
      if (flags & ANCHOR) {
        if (this.#anchors.has(seq) || (this.#anchors.size && seq <= [...this.#anchors.keys()].at(-1))) invalid();
        this.#anchors.set(seq, { bytes: bytes.slice(), crc, matchId: inner.matchId });
        if (this.#anchors.size > 2) this.#anchors.delete(this.#anchors.keys().next().value);
      }
      return bytes;
    } catch (error) { this.reset(); throw error; }
  }
}
