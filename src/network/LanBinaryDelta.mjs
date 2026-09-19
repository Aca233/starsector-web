/** Lossless byte delta for negotiated, reliable LAN WebSockets only.
 * The full SWB1 remains the decoded contract; nothing is quantized or omitted.
 * At most two marked anchors are retained by a receiver, never every snapshot.
 */
export const LAN_DELTA_MAX_BYTES = 2 * 1024 * 1024;
export const LAN_DELTA_HEADER = 36;
const MAGIC = 0x534c4431; // SLD1, distinct from existing SWB1/SWF2.
const DELTA = 1, ANCHOR = 2;
const table = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
const crcTables = [table];
for (let k = 1; k < 4; k++) crcTables.push(Uint32Array.from(crcTables[k - 1], c => table[c & 255] ^ (c >>> 8)));
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
/** Pure bounded prototype-free matcher. At most two 16-byte candidates per
 * position; no quadratic chain walk for repetitive/adversarial input. */
export function createLanBytePatch(before, after) {
  const base = lanBytes(before), target = lanBytes(after);
  if (!base.length || base.length > LAN_DELTA_MAX_BYTES || !target.length || target.length > LAN_DELTA_MAX_BYTES) return null;
  const slots = 65536, newest = new Int32Array(slots).fill(-1), older = new Int32Array(slots).fill(-1);
  const a = new DataView(base.buffer, base.byteOffset, base.byteLength), b = new DataView(target.buffer, target.byteOffset, target.byteLength);
  const hash = (v, i) => Math.imul(v.getUint32(i, true) ^ v.getUint32(i + 8, true), 0x9e3779b1) >>> 16;
  for (let i = 0; i + 16 <= base.length; i += 8) { const h = hash(a, i); older[h] = newest[h]; newest[h] = i; }
  // Abort on non-beneficial patches instead of allocating an expansion. Require
  // >50% raw saving to offset copy metadata before permessage-deflate.
  const out = new Uint8Array(Math.ceil(target.length / 2)); let pos = 0, literalAt = 0, i = 0;
  const vint = n => { while (n >= 128) { out[pos++] = (n & 127) | 128; n >>>= 7; } out[pos++] = n; };
  const literal = end => {
    const length = end - literalAt;
    if (length) { if (pos + length + 5 > out.length) return false; vint(length * 2); out.set(target.subarray(literalAt, end), pos); pos += length; }
    return true;
  };
  while (i + 16 <= target.length) {
    const h = hash(b, i); let best = -1, length = 0;
    for (let slot = 0; slot < 2; slot++) {
      const c = slot ? older[h] : newest[h]; if (c < 0) continue;
      let n = 0; while (n < 16 && base[c + n] === target[i + n]) n++;
      if (n < 16) continue;
      while (c + n < base.length && i + n < target.length && base[c + n] === target[i + n]) n++;
      if (n > length) { best = c; length = n; }
    }
    if (length >= 16) {
      if (!literal(i) || pos + 10 > out.length) return null;
      vint(length * 2 + 1); vint(best); i += length; literalAt = i;
    } else i++;
  }
  if (!literal(target.length)) return null;
  return out.slice(0, pos);
}
export function encodeLanPacket({ bytes, seq, crc }, base, patch, anchor = false) {
  bytes = lanBytes(bytes);
  if (!Number.isSafeInteger(seq) || seq < 0 || !bytes.length || bytes.length > LAN_DELTA_MAX_BYTES || (patch && !base)) invalid();
  const payload = patch ?? bytes, out = new Uint8Array(LAN_DELTA_HEADER + payload.length), view = new DataView(out.buffer);
  view.setUint32(0, MAGIC); view.setUint32(4, (patch ? DELTA : 0) | (anchor ? ANCHOR : 0));
  view.setFloat64(8, patch ? base.seq : 0); view.setFloat64(16, seq); view.setUint32(24, bytes.length);
  view.setUint32(28, patch ? base.crc : 0); view.setUint32(32, crc); out.set(payload, LAN_DELTA_HEADER);
  return out;
}
export class LanDeltaReceiver {
  #anchors = new Map();
  reset() { this.#anchors.clear(); }
  get retainedBytes() { let bytes = 0; for (const anchor of this.#anchors.values()) bytes += anchor.bytes.length; return bytes; }
  decode(value) {
    const packet = lanBytes(value);
    if (!isLanDelta(packet)) { this.reset(); return packet; }
    try {
      if (packet.length <= LAN_DELTA_HEADER || packet.length > LAN_DELTA_MAX_BYTES + LAN_DELTA_HEADER) invalid();
      const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength), flags = view.getUint32(4), baseSeq = view.getFloat64(8), seq = view.getFloat64(16), size = view.getUint32(24), baseCrc = view.getUint32(28), crc = view.getUint32(32);
      if (![0, DELTA, ANCHOR, DELTA | ANCHOR].includes(flags) || !Number.isSafeInteger(seq) || seq < 0 || !Number.isSafeInteger(baseSeq) || baseSeq < 0 || !size || size > LAN_DELTA_MAX_BYTES) invalid();
      let bytes;
      if (flags & DELTA) {
        const base = this.#anchors.get(baseSeq);
        if (!base || base.crc !== baseCrc || baseSeq >= seq) invalid();
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
            const offset = vint(); if (offset > base.bytes.length - length) invalid();
            bytes.set(base.bytes.subarray(offset, offset + length), written);
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
