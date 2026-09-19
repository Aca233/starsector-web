// Experimental, negotiated Sockets state encoding. A complete JSON tree remains
// the contract: no float quantization, schema omissions or chained frame deltas.
import { encode, decode } from '@msgpack/msgpack';
import { deflateRawSync } from 'node:zlib';
import { SteamPacketCodec } from './packet-codec.mjs';

export const SOCKET_PACKED_MAX = 512 * 1024 + 4096;
const HEADER = 16, MAX_NODES = 65536, MAX_DEPTH = 96;
const utf8 = new TextDecoder('utf-8', { fatal: true });
const invalid = () => { throw Error('Invalid packed socket state'); };
const finite = n => { if (!Number.isFinite(n) || Object.is(n, -0)) invalid(); };

// Validate BEFORE the general MessagePack decoder allocates declared arrays or
// maps. Count reserved children as well as visited nodes, so a tiny nested array
// header cannot request many enormous containers. Only the JSON subset is valid:
// string map keys, no extensions/binary/BigInt, finite numbers, bounded UTF-8.
function scan(input, compact = false) {
  if (!Buffer.isBuffer(input) || !input.length || input.length > SOCKET_PACKED_MAX) invalid();
  let at = 0, nodes = 0, reserved = 1;
  const floats = [];
  const take = n => { if (n < 0 || at + n > input.length) invalid(); const p = at; at += n; return p; };
  const length = width => { const p = take(width); return width === 1 ? input[p] : width === 2 ? input.readUInt16BE(p) : input.readUInt32BE(p); };
  function visit(depth, key = false) {
    if (depth > MAX_DEPTH || ++nodes > MAX_NODES) invalid();
    reserved--;
    const tag = input[take(1)];
    let strings = null, children = null, map = false;
    if ((tag & 0xe0) === 0xa0) strings = tag & 31;
    else if (tag === 0xd9 || tag === 0xda || tag === 0xdb) strings = length(tag === 0xd9 ? 1 : tag === 0xda ? 2 : 4);
    if (strings !== null) {
      const p = take(strings), value = utf8.decode(input.subarray(p, p + strings));
      if (key && value === '__proto__') invalid();
      return;
    }
    if (key) invalid();
    if (tag < 0x80 || tag >= 0xe0 || tag === 0xc0 || tag === 0xc2 || tag === 0xc3) return;
    if ((tag & 0xf0) === 0x90) children = tag & 15;
    else if ((tag & 0xf0) === 0x80) { children = (tag & 15) * 2; map = true; }
    else if (tag === 0xdc || tag === 0xdd) children = length(tag === 0xdc ? 2 : 4);
    else if (tag === 0xde || tag === 0xdf) { children = length(tag === 0xde ? 2 : 4) * 2; map = true; }
    if (children !== null) {
      reserved += children;
      if (reserved + nodes > MAX_NODES) invalid();
      for (let i = 0; i < children; i++) visit(depth + 1, map && i % 2 === 0);
      return;
    }
    if (tag === 0xca) { finite(input.readFloatBE(take(4))); return; }
    if (tag === 0xcb) {
      floats.push(at);
      if (!compact) finite(input.readDoubleBE(take(8)));
      return;
    }
    const width = { 0xcc: 1, 0xcd: 2, 0xce: 4, 0xd0: 1, 0xd1: 2, 0xd2: 4 }[tag];
    if (width) { take(width); return; }
    if (tag === 0xcf || tag === 0xd3) {
      const p = take(8), n = tag === 0xcf ? input.readBigUInt64BE(p) : input.readBigInt64BE(p);
      if (n < BigInt(Number.MIN_SAFE_INTEGER) || n > BigInt(Number.MAX_SAFE_INTEGER)) invalid();
      return;
    }
    invalid();
  }
  visit(0);
  if (at !== input.length || reserved !== 0) invalid();
  return floats;
}

export function packSocketState(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > SOCKET_PACKED_MAX) invalid();
  const value = JSON.parse(text);
  // MessagePack's UTF-8 encoder replaces lone UTF-16 surrogates. Reject those
  // candidates rather than silently changing string/key data; JSON fallback is
  // still lossless. This traversal does not mutate the caller's parsed state.
  const pending = [{ value, depth: 0 }]; let nodes = 0;
  while (pending.length) {
    const { value: v, depth } = pending.pop();
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) invalid();
    if (typeof v === 'string' && !v.isWellFormed()) invalid();
    if (v && typeof v === 'object') {
      const keys = Object.keys(v);
      if (nodes + pending.length + keys.length > MAX_NODES) invalid();
      for (const k of keys) {
        if (!k.isWellFormed() || k === '__proto__') invalid();
        pending.push({ value: v[k], depth: depth + 1 });
      }
    }
  }
  if (JSON.stringify(value) !== text) invalid();
  const message = Buffer.from(encode(value, { maxDepth: MAX_DEPTH + 1 }));
  const floats = scan(message), count = floats.length;
  if (HEADER + message.length > SOCKET_PACKED_MAX) invalid();
  const skeletonLength = message.length - count * 8;
  const packed = Buffer.alloc(HEADER + message.length);
  packed.write('SMF1', 0, 'ascii'); packed.writeUInt32LE(skeletonLength, 4);
  packed.writeUInt32LE(count, 8); packed.writeUInt32LE(Buffer.byteLength(text), 12);
  let source = 0, target = HEADER;
  for (let i = 0; i < count; i++) {
    const p = floats[i]; message.copy(packed, target, source, p); target += p - source; source = p + 8;
    for (let plane = 0; plane < 8; plane++) packed[HEADER + skeletonLength + plane * count + i] = message[p + plane];
  }
  message.copy(packed, target, source);
  return packed;
}

export function unpackSocketState(packed) {
  if (!Buffer.isBuffer(packed) || packed.length < HEADER || packed.length > SOCKET_PACKED_MAX || packed.toString('ascii', 0, 4) !== 'SMF1') invalid();
  const size = packed.readUInt32LE(4), count = packed.readUInt32LE(8), jsonBytes = packed.readUInt32LE(12);
  if (!size || count > MAX_NODES || !jsonBytes || jsonBytes > SOCKET_PACKED_MAX || HEADER + size + count * 8 !== packed.length) invalid();
  const skeleton = packed.subarray(HEADER, HEADER + size), floats = scan(skeleton, true);
  if (floats.length !== count) invalid();
  const message = Buffer.alloc(size + count * 8);
  let source = 0, target = 0;
  for (let i = 0; i < count; i++) {
    const p = floats[i]; skeleton.copy(message, target, source, p); target += p - source; source = p;
    for (let plane = 0; plane < 8; plane++) message[target + plane] = packed[HEADER + size + plane * count + i];
    finite(message.readDoubleBE(target)); target += 8;
  }
  skeleton.copy(message, target, source);
  const value = decode(message, { maxStrLength: SOCKET_PACKED_MAX, maxBinLength: 0, maxExtLength: 0, maxArrayLength: MAX_NODES, maxMapLength: MAX_NODES });
  if (Buffer.byteLength(JSON.stringify(value)) !== jsonBytes) invalid();
  return value;
}

export class SteamSocketStateCodec extends SteamPacketCodec {
  constructor() { super(); this.packedCache = null; this.packedPreparations = 0; }
  prepare(op, value) {
    const original = super.prepare(op, value);
    // Controls, input, handshake and oversized full fallbacks keep JSON. The
    // wire/session layer restricts this encoding to negotiated anchor/snapshot.
    if (op !== 'data' || !original.raw.startsWith('{"type":"steam-state",')) return original;
    if (this.packedCache?.original === original) return this.packedCache.prepared;
    let prepared = original;
    try {
      const packed = packSocketState(original.raw), payload = deflateRawSync(packed, { level: 1 });
      this.packedPreparations++;
      if (payload.length + 16 < original.payload.length) prepared = { raw: original.raw, payload, rawBytes: packed.length, zipped: true, packedState: true };
    } catch { /* Bounded lossless JSON fallback, never remove state fields. */ }
    this.packedCache = { original, prepared }; return prepared;
  }
  clear() { super.clear(); this.packedCache = null; }
}
