import { Encoder, Decoder } from '@msgpack/msgpack';
import protocol from './protocol.json' with { type: 'json' };

const LIMIT = protocol.maxSnapshotBytes, MAX_DEPTH = 128;
// The library still owns traversal, undefined handling and transfer-safe copies.
// Specialize the string writer from pinned @msgpack/msgpack 3.1.3 only. Its
// internal hooks must be rechecked when upgrading; all numbers use the library.
class SnapshotEncoder extends Encoder {
  strings = new Map();
  encodeString(value) {
    let bytes = this.strings.get(value);
    if (bytes === undefined) {
      // Getters can change a value after compatible(): keep legacy lone-surrogate
      // encoding in that case rather than TextEncoder's replacement character.
      if (value.length > 128 || loneSurrogate.test(value)) return super.encodeString(value);
      const payload = utf8.encode(value), length = payload.length;
      bytes = new Uint8Array(length + (length < 32 ? 1 : length < 256 ? 2 : 3));
      if (length < 32) bytes[0] = 0xa0 + length;
      else if (length < 256) { bytes[0] = 0xd9; bytes[1] = length; }
      else { bytes[0] = 0xda; new DataView(bytes.buffer).setUint16(1, length); }
      bytes.set(payload, bytes.length - length);
      // FIFO replacement prevents unrelated early strings permanently poisoning
      // the cache. Both encoded payloads and keys remain bounded.
      if (this.strings.size >= 1024) this.strings.delete(this.strings.keys().next().value);
      this.strings.set(value, bytes);
    }
    this.ensureBufferSizeToWrite(bytes.length);
    this.bytes.set(bytes, this.pos); this.pos += bytes.length;
  }
}
const encoder = new SnapshotEncoder({ ignoreUndefined: true, maxDepth: MAX_DEPTH });
const decoderOptions = {
  maxStrLength: LIMIT, maxArrayLength: LIMIT, maxMapLength: 65536,
  maxBinLength: 0, maxExtLength: 0,
  mapKeyConverter(key) {
    if (typeof key !== 'string' || ['__proto__', 'prototype', 'constructor'].includes(key)) throw Error('Invalid binary snapshot key');
    return key;
  },
};
const utf8 = new TextEncoder(), text = new TextDecoder('utf-8', { fatal: true });
// Unicode-mode matching treats a valid surrogate pair as one code point. Lone
// surrogates must use JSON's escape representation, never lossy UTF-8 replacement.
const loneSurrogate = /[\uD800-\uDFFF]/u;
// Only short, validated strings are interned; caps keep memory independent of
// long-lived projectile IDs or user-defined keys. Uncached strings are still checked.
const safeKeys = new Set(), safeStrings = new Set();
function validKey(key) {
  if (safeKeys.has(key)) return true;
  if (key === '__proto__' || key === 'prototype' || key === 'constructor' || loneSurrogate.test(key)) return false;
  if (key.length <= 128 && safeKeys.size < 512) safeKeys.add(key);
  return true;
}
function validString(value) {
  if (safeStrings.has(value)) return true;
  if (loneSurrogate.test(value)) return false;
  if (value.length <= 128 && safeStrings.size < 1024) safeStrings.add(value);
  return true;
}
function compatible(value, depth = 0) {
  if (depth > MAX_DEPTH) return false;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return validString(value);
  if (value == null || typeof value === 'boolean') return true;
  if (typeof value !== 'object' || ArrayBuffer.isView(value) || value instanceof Date) return false;
  if (Array.isArray(value)) {
    for (const item of value) {
      if (depth >= MAX_DEPTH) return false;
      if (typeof item === 'number') { if (!Number.isFinite(item)) return false; }
      else if (typeof item === 'string') { if (!validString(item)) return false; }
      else if (item != null && typeof item !== 'boolean' && !compatible(item, depth + 1)) return false;
    }
  } else {
    for (const key of Object.keys(value)) {
      if (!validKey(key)) return false;
      const item = value[key];
      if (depth >= MAX_DEPTH) return false;
      if (typeof item === 'number') { if (!Number.isFinite(item)) return false; }
      else if (typeof item === 'string') { if (!validString(item)) return false; }
      else if (item != null && typeof item !== 'boolean' && !compatible(item, depth + 1)) return false;
    }
  }
  return true;
}
function bytesOf(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw Error('Invalid binary snapshot buffer');
}
/** Reject impossible lengths/depth before the general decoder allocates containers.
 * Only JSON-shaped MessagePack is accepted: no binary blobs, extensions or timestamps. */
function preflight(bytes) {
  if (!bytes.length || bytes.length > LIMIT) throw new RangeError('Binary snapshot exceeds budget');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  const stack = [1];
  const need = count => { if (offset + count > bytes.length) throw Error('Truncated binary snapshot'); };
  const length = width => {
    need(width);
    const value = width === 1 ? bytes[offset] : width === 2 ? view.getUint16(offset) : view.getUint32(offset);
    offset += width; return value;
  };
  while (stack.length) {
    if (stack[stack.length - 1] === 0) { stack.pop(); continue; }
    stack[stack.length - 1]--;
    need(1); const tag = bytes[offset++];
    let count = 0, skip = 0, map = false;
    if (tag <= 0x7f || tag >= 0xe0 || tag === 0xc0 || tag === 0xc2 || tag === 0xc3) continue;
    if (tag >= 0xa0 && tag <= 0xbf) skip = tag & 31;
    else if (tag >= 0x90 && tag <= 0x9f) count = tag & 15;
    else if (tag >= 0x80 && tag <= 0x8f) { count = (tag & 15) * 2; map = true; }
    else switch (tag) {
      case 0xcc: case 0xd0: skip = 1; break;
      case 0xcd: case 0xd1: skip = 2; break;
      case 0xca: case 0xce: case 0xd2: skip = 4; break;
      case 0xcb: case 0xcf: case 0xd3: skip = 8; break;
      case 0xd9: skip = length(1); break;
      case 0xda: skip = length(2); break;
      case 0xdb: skip = length(4); break;
      case 0xdc: count = length(2); break;
      case 0xdd: count = length(4); break;
      case 0xde: count = length(2) * 2; map = true; break;
      case 0xdf: count = length(4) * 2; map = true; break;
      default: throw Error('Unsupported binary snapshot tag');
    }
    need(skip); offset += skip;
    if (count) {
      if ((map && count > 131072) || count > bytes.length - offset || stack.length >= MAX_DEPTH) throw Error('Invalid binary snapshot container');
      stack.push(count);
    }
  }
  if (offset !== bytes.length) throw Error('Trailing binary snapshot data');
}
/** Null requests the existing JSON path for rare non-JSON-shaped/Unicode values. */
export function encodeBinaryFrame(frame) {
  if (!compatible(frame)) return null;
  const encoded = encoder.encode(frame); // Owned copy: safe to transfer out of a Worker.
  if (encoded.byteLength > LIMIT) throw new RangeError('Binary snapshot exceeds budget');
  return encoded;
}
// A complete, preflighted frame needs no streaming container-state machine.
// Cache only owned short string bytes, never a view into a received frame.
const decodedStrings = new Array(1024);
const unicode = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const longText = new TextDecoder('utf-8');
const legacyUtf8 = {};
class SnapshotReader {
  offset = 0;
  constructor(bytes) { this.bytes = bytes; this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }
  string(length) {
    const start = this.offset, end = start + length, bytes = this.bytes;
    this.offset = end;
    if (length > 128) {
      // Match the pinned decoder: long strings use TextDecoder (including its
      // BOM/replacement rules); short strings use the legacy JS UTF-8 decoder.
      if (length > 200) return longText.decode(bytes.subarray(start, end));
      try { return unicode.decode(bytes.subarray(start, end)); } catch { throw legacyUtf8; }
    }
    let hash = length, ascii = true;
    for (let i = start; i < end; i++) { const b = bytes[i]; hash = Math.imul(hash, 31) + b | 0; if (b >= 128) ascii = false; }
    const slot = hash & 1023, cached = decodedStrings[slot];
    if (cached && cached.bytes.length === length) {
      let i = 0; while (i < length && cached.bytes[i] === bytes[start + i]) i++;
      if (i === length) return cached.value;
    }
    let value = '';
    if (ascii) { for (let i = start; i < end; i++) value += String.fromCharCode(bytes[i]); }
    else { try { value = unicode.decode(bytes.subarray(start, end)); } catch { throw legacyUtf8; } }
    decodedStrings[slot] = { bytes: new Uint8Array(bytes.subarray(start, end)), value };
    return value;
  }
  array(length) {
    const result = new Array(length);
    for (let i = 0; i < length; i++) result[i] = this.read();
    return result;
  }
  map(length) {
    const result = {};
    for (let i = 0; i < length; i++) {
      const key = this.read();
      if (typeof key !== 'string' || key === '__proto__' || key === 'prototype' || key === 'constructor') throw Error('Invalid binary snapshot key');
      result[key] = this.read();
    }
    return result;
  }
  read() {
    const tag = this.bytes[this.offset++], view = this.view;
    if (tag < 128) return tag;
    if (tag >= 224) return tag - 256;
    if (tag >= 160 && tag < 192) return this.string(tag & 31);
    if (tag >= 144 && tag < 160) return this.array(tag & 15);
    if (tag >= 128 && tag < 144) return this.map(tag & 15);
    const p = this.offset;
    switch (tag) {
      case 0xc0: return null;
      case 0xc2: return false;
      case 0xc3: return true;
      case 0xcc: this.offset++; return this.bytes[p];
      case 0xd0: this.offset++; return view.getInt8(p);
      case 0xcd: this.offset += 2; return view.getUint16(p);
      case 0xd1: this.offset += 2; return view.getInt16(p);
      case 0xce: this.offset += 4; return view.getUint32(p);
      case 0xd2: this.offset += 4; return view.getInt32(p);
      case 0xca: this.offset += 4; return view.getFloat32(p);
      case 0xcb: this.offset += 8; return view.getFloat64(p);
      case 0xcf: this.offset += 8; return view.getUint32(p) * 4294967296 + view.getUint32(p + 4);
      case 0xd3: this.offset += 8; return view.getInt32(p) * 4294967296 + view.getUint32(p + 4);
      case 0xd9: this.offset++; return this.string(this.bytes[p]);
      case 0xda: this.offset += 2; return this.string(view.getUint16(p));
      case 0xdb: this.offset += 4; return this.string(view.getUint32(p));
      case 0xdc: this.offset += 2; return this.array(view.getUint16(p));
      case 0xdd: this.offset += 4; return this.array(view.getUint32(p));
      case 0xde: this.offset += 2; return this.map(view.getUint16(p));
      case 0xdf: this.offset += 4; return this.map(view.getUint32(p));
      default: throw Error('Unsupported binary snapshot tag');
    }
  }
}
export function decodeBinaryFrame(buffer) {
  const bytes = bytesOf(buffer);
  preflight(bytes);
  try { return new SnapshotReader(bytes).read(); }
  catch (error) {
    // Preserve the pinned library's legacy handling of malformed short UTF-8.
    if (error !== legacyUtf8) throw error;
    // Decoder retains its input/partial stack; never share this instance.
    return new Decoder(decoderOptions).decode(bytes);
  }
}
function validHeader(header) {
  return header && Object.keys(header).length === 2 && typeof header.matchId === 'string' && header.matchId.length > 0 && header.matchId.length <= 128 &&
    Number.isSafeInteger(header.seq) && header.seq >= 0;
}
export function encodeBinaryState(matchId, seq, frame) {
  const header = { matchId, seq };
  if (!validHeader(header)) throw Error('Invalid binary state header');
  const meta = utf8.encode(JSON.stringify(header)), payload = bytesOf(frame);
  if (meta.length > 1024 || !payload.length || 8 + meta.length + payload.length > LIMIT) throw new RangeError('Binary snapshot exceeds budget');
  const result = new Uint8Array(8 + meta.length + payload.length);
  result.set([83, 87, 66, 49]); // SWB1: binary snapshot, not a binary control message.
  new DataView(result.buffer).setUint32(4, meta.length, true);
  result.set(meta, 8); result.set(payload, 8 + meta.length);
  return result;
}
export function decodeBinaryState(buffer) {
  const bytes = bytesOf(buffer);
  if (bytes.length < 10 || bytes.length > LIMIT || bytes[0] !== 83 || bytes[1] !== 87 || bytes[2] !== 66 || bytes[3] !== 49) throw Error('Invalid binary state header');
  const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true);
  if (!size || size > 1024 || 8 + size >= bytes.length) throw Error('Invalid binary state header');
  const header = JSON.parse(text.decode(bytes.subarray(8, 8 + size)));
  if (!validHeader(header)) throw Error('Invalid binary state header');
  return { type: 'state', ...header, frame: decodeBinaryFrame(bytes.subarray(8 + size)) };
}
