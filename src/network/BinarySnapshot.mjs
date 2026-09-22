import { PackedSnapshotNumbers, validatePackedNumbers, readPackedNumbers } from './PackedSnapshotNumbers.mjs';
import { SnapshotTapeReader, SNAPSHOT_TAPE_TAGS } from './SnapshotTape.mjs';
import { boundedSnapshotReader } from './BoundedSnapshotReader.mjs';
import { FIXED_TAG_BYTES } from './BinaryTagWidths.mjs';
import { Encoder, Decoder } from '@msgpack/msgpack';
import { RELAY_FRAME_FIELDS } from './CombatFrameSummary.mjs';
import protocol from './protocol.json' with { type: 'json' };
import { KEY_DICTIONARY } from './KeyDictionary.mjs';

// One bounded, frozen lookup constructed at module load, never per frame.
const keyCodes = Object.freeze(Object.assign(Object.create(null),
  Object.fromEntries(KEY_DICTIONARY.map((key, code) => [key, code]))));
function dictionaryKey(code) {
  if (!Number.isInteger(code) || code < 0 || code >= KEY_DICTIONARY.length) throw Error('Invalid binary snapshot key');
  return KEY_DICTIONARY[code];
}

const LIMIT = protocol.maxSnapshotBytes, MAX_DEPTH = 128;
// The library still owns traversal, undefined handling and transfer-safe copies.
// Specialize the string writer from pinned @msgpack/msgpack 3.1.3 only. Its
// internal hooks must be rechecked when upgrading. The conservative numeric writer
// stays with the library; shared authorities opt into the exact writer below.
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
// Preserve legacy UTF-8 fallback while applying the same SWF2-only key rule.
const dictionaryDecoderOptions = {
  ...decoderOptions,
  mapKeyConverter(key) {
    return decoderOptions.mapKeyConverter(typeof key === 'number' ? dictionaryKey(key) : key);
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
  if (typeof value !== 'object' || value instanceof PackedSnapshotNumbers || ArrayBuffer.isView(value) || value instanceof Date) return false;
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
 * SWF3 alone adds validated numeric blocks; never arbitrary extensions/timestamps. */
function preflight(bytes, packed = false) {
  if (!bytes.length || bytes.length > LIMIT) throw new RangeError('Binary snapshot exceeds budget');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Bounded explicit stack; validation still precedes all graph allocations.
  const stack = new Uint32Array(MAX_DEPTH);
  let offset = 0, level = 0, remaining = 1;
  while (true) {
    if (remaining === 0) { if (level === 0) break; remaining = stack[--level]; continue; }
    remaining--;
    if (offset >= bytes.length) throw Error('Truncated binary snapshot');
    const tag = bytes[offset++], fixedWidth = FIXED_TAG_BYTES[tag];
    if (fixedWidth) {
      offset += fixedWidth - 1;
      if (offset > bytes.length) throw Error('Truncated binary snapshot');
      continue;
    }
    let count = 0, skip = 0, map = false;
    const bin = tag === 0xc4 || tag === 0xc5 || tag === 0xc6;
    if (bin && !packed) throw Error('Unsupported binary snapshot tag');
    if (tag >= 0x90 && tag <= 0x9f) count = tag & 15;
    else if (tag >= 0x80 && tag <= 0x8f) { count = (tag & 15) * 2; map = true; }
    else {
      let width;
      switch (tag) {
        case 0xc4: case 0xd9: width = 1; break;
        case 0xc5: case 0xda: case 0xdc: case 0xde: width = 2; break;
        case 0xc6: case 0xdb: case 0xdd: case 0xdf: width = 4; break;
        default: throw Error('Unsupported binary snapshot tag');
      }
      if (width > bytes.length - offset) throw Error('Truncated binary snapshot');
      const length = width === 1 ? bytes[offset] : width === 2 ? view.getUint16(offset) : view.getUint32(offset);
      offset += width;
      if (tag <= 0xdb) skip = length;
      else { map = tag >= 0xde; count = map ? length * 2 : length; }
    }
    if (skip > bytes.length - offset) throw Error('Truncated binary snapshot');
    if (bin) validatePackedNumbers(bytes.subarray(offset, offset + skip));
    offset += skip;
    if (count) {
      if ((map && count > 131072) || count > bytes.length - offset || level + 1 >= MAX_DEPTH) throw Error('Invalid binary snapshot container');
      stack[level++] = remaining; remaining = count;
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

// This entry point is for captureCombat's newly-created declarative projection,
// not a user object with accessors/iterators. Validate while writing instead of
// traversing the large projection once in compatible() and again in Encoder.
// Keep encodeBinaryFrame's legacy two-pass behavior for arbitrary callers.
// No values/keys bypass validation. SWF2 prefixes a key-only MessagePack variant.
// Numeric wire semantics stay unchanged (non-integer numbers: float64).
const incompatible = {};
/** One immutable captured tick only. These are independently owned bytes, not
 * views into transferable outputs. Never cache mutable publication metadata or
 * one-shot sounds; the owner drops this object before mutating the next tick.
 * This is encoding reuse, NOT a network baseline or compressed wire protocol. */
export class ProjectionEncodingCache {
  constructor(frame) {
    this.candidates = new WeakSet(); this.fragments = new WeakMap();
    this.bytes = 0; this.hits = 0; this.packed = false;
    for (const key of ['world', 'ships', 'crafts', 'craftSpecs', 'layouts', 'deployment']) {
      const value = frame[key];
      if (value && typeof value === 'object') this.candidates.add(value);
    }
  }
  get(value) {
    const bytes = this.fragments.get(value);
    if (bytes) this.hits++;
    return bytes;
  }
  retain(value, bytes, start, end) {
    const size = end - start;
    if (!this.candidates.has(value) || this.bytes + size > LIMIT) return;
    this.fragments.set(value, bytes.slice(start, end)); this.bytes += size;
  }
}
class ProjectedSnapshotEncoder extends SnapshotEncoder {
  reinitializeState() {
    super.reinitializeState();
    this.packed = false;
    this.writeU32(0x53574632); // Upgraded to SWF3 only when numeric blocks occur.
  }
  doEncode(value, depth) {
    if (depth > this.maxDepth) throw Error('Snapshot exceeds maximum depth');
    if (value == null) this.encodeNil();
    else if (typeof value === 'number') { if (!Number.isFinite(value)) throw incompatible; this.encodeNumber(value); }
    else if (typeof value === 'string') { if (!validString(value)) throw incompatible; this.encodeString(value); }
    else if (typeof value === 'boolean') this.encodeBoolean(value);
    else if (value instanceof PackedSnapshotNumbers) {
      this.packed = true;
      if (this.projectionCache) this.projectionCache.packed = true;
      const size = value.byteLength;
      this.ensureBufferSizeToWrite(size + 5);
      if (size < 256) { this.writeU8(0xc4); this.writeU8(size); }
      else if (size < 65536) { this.writeU8(0xc5); this.writeU16(size); }
      else { this.writeU8(0xc6); this.writeU32(size); }
      value.copyBytesTo(this.bytes, this.pos); this.pos += size;
    } else if (typeof value !== 'object' || ArrayBuffer.isView(value) || value instanceof Date) throw incompatible;
    else if (Array.isArray(value)) this.encodeArray(value, depth);
    else this.encodeMap(value, depth);
  }
  encodeMap(value, depth) {
    const keys = Object.keys(value);
    let count = 0;
    for (const key of keys) {
      if (!validKey(key)) throw incompatible;
      if (value[key] !== undefined) count++;
    }
    if (count < 16) this.writeU8(0x80 + count);
    else if (count < 65536) { this.writeU8(0xde); this.writeU16(count); }
    else { this.writeU8(0xdf); this.writeU32(count); }
    for (const key of keys) {
      const item = value[key];
      if (item !== undefined) {
        const code = keyCodes[key];
        if (code === undefined) this.encodeString(key);
        else this.writeU8(code); // 0..127 positive fixint, ONLY in map-key position.
        const cache = depth === 1 && item && typeof item === 'object' ? this.projectionCache : null;
        const fragment = cache?.get(item);
        if (fragment) {
          this.ensureBufferSizeToWrite(fragment.length);
          this.bytes.set(fragment, this.pos); this.pos += fragment.length;
        } else if (cache) {
          const start = this.pos;
          this.doEncode(item, depth + 1);
          cache.retain(item, this.bytes, start, this.pos);
        } else this.doEncode(item, depth + 1);
      }
    }
  }
}
// Shared-authority opt-in. Same MessagePack numeric widths and values as pinned
// @msgpack/msgpack 3.1.3, with one capacity check and direct tag+payload writes.
// Keep its original 64-bit integer helper for the uncommon >32-bit safe integers.
// This private instance uses fixed defaults: no forceFloat32/forceIntegerToFloat.
class FastProjectedSnapshotEncoder extends ProjectedSnapshotEncoder {
  encodeArray(value, depth) {
    const size = value.length;
    if (size < 16) this.writeU8(0x90 + size);
    else if (size < 65536) { this.writeU8(0xdc); this.writeU16(size); }
    else if (size < 4294967296) { this.writeU8(0xdd); this.writeU32(size); }
    else throw Error(`Too large array: ${size}`);
    // Preserve the library's iterator, holes, accessor and live-length behavior.
    // Check depth AFTER advancing the iterator, just as doEncode would, even
    // when a custom iterator yields values for an initially empty array.
    for (const item of value) {
      if (depth >= this.maxDepth) throw Error('Snapshot exceeds maximum depth');
      if (typeof item === 'number') {
        if (!Number.isFinite(item)) throw incompatible;
        this.encodeNumber(item);
      } else if (item == null) this.encodeNil();
      else this.doEncode(item, depth + 1);
    }
  }
  encodeNumber(value) {
    this.ensureBufferSizeToWrite(9);
    const at = this.pos, bytes = this.bytes, view = this.view;
    if (!Number.isSafeInteger(value)) {
      bytes[at] = 0xcb; view.setFloat64(at + 1, value); this.pos = at + 9;
    } else if (value >= 0) {
      if (value < 128) { bytes[at] = value; this.pos = at + 1; }
      else if (value < 256) { bytes[at] = 0xcc; bytes[at + 1] = value; this.pos = at + 2; }
      else if (value < 65536) { bytes[at] = 0xcd; view.setUint16(at + 1, value); this.pos = at + 3; }
      else if (value < 4294967296) { bytes[at] = 0xce; view.setUint32(at + 1, value); this.pos = at + 5; }
      else super.encodeNumber(value);
    } else {
      if (value >= -32) { bytes[at] = 256 + value; this.pos = at + 1; }
      else if (value >= -128) { bytes[at] = 0xd0; view.setInt8(at + 1, value); this.pos = at + 2; }
      else if (value >= -32768) { bytes[at] = 0xd1; view.setInt16(at + 1, value); this.pos = at + 3; }
      else if (value >= -2147483648) { bytes[at] = 0xd2; view.setInt32(at + 1, value); this.pos = at + 5; }
      else super.encodeNumber(value);
    }
  }
}
const fastProjectedEncoder = new FastProjectedSnapshotEncoder({ ignoreUndefined: true, maxDepth: MAX_DEPTH });
const projectedEncoder = new ProjectedSnapshotEncoder({ ignoreUndefined: true, maxDepth: MAX_DEPTH });
/** Fresh captureCombat projection only. Null retains the existing JSON fallback. */
export function encodeProjectedBinaryFrame(frame, fastNumbers = false, projectionCache = null) {
  const writer = fastNumbers ? fastProjectedEncoder : projectedEncoder;
  writer.projectionCache = projectionCache;
  try {
    // encode() owns its output; the next encode must not mutate transferred bytes.
    const bytes = writer.encode(frame);
    if (writer.packed || projectionCache?.packed) bytes[3] = 51; // SWF3, same dictionary
    if (bytes.length > LIMIT) throw new RangeError('Binary snapshot exceeds budget');
    return bytes;
  } catch (error) {
    if (error === incompatible) return null;
    throw error;
  } finally {
    writer.projectionCache = null; // Never retain a capture in the singleton encoder.
  }
}

// Private tape -> the SAME owned SWF2 bytes. No bulk DTO reconstruction: only
// the small root sound batch is materialized, preserving the existing ID-based
// display/network sound contract. Default synchronous encoding stays unchanged.
class TapeSnapshotEncoder extends FastProjectedSnapshotEncoder {
  tapeValue(reader, depth) {
    if (depth > MAX_DEPTH || reader.pos >= reader.words) return reader.bad();
    const at = reader.pos++, value = reader.numbers[at];
    if (Number.isFinite(value)) { this.encodeNumber(value); return; }
    const kind = reader.tags[at * 2 + 1] - SNAPSHOT_TAPE_TAGS.NAN, size = reader.tags[at * 2];
    switch (kind) {
      case SNAPSHOT_TAPE_TAGS.NIL:
      case SNAPSHOT_TAPE_TAGS.FALSE:
      case SNAPSHOT_TAPE_TAGS.TRUE:
        if (size !== 0) return reader.bad();
        this.writeU8(kind === SNAPSHOT_TAPE_TAGS.NIL ? 0xc0 : kind === SNAPSHOT_TAPE_TAGS.FALSE ? 0xc2 : 0xc3); return;
      case SNAPSHOT_TAPE_TAGS.STRING: {
        if (size >= reader.strings.length) return reader.bad();
        const str = reader.strings[size]; if (!validString(str)) throw incompatible;
        this.encodeString(str); return;
      }
      case SNAPSHOT_TAPE_TAGS.ARRAY:
        if (size > reader.words - reader.pos || (size > 0 && depth >= MAX_DEPTH)) return reader.bad();
        if (size < 16) this.writeU8(0x90 + size);
        else if (size < 65536) { this.writeU8(0xdc); this.writeU16(size); }
        else { this.writeU8(0xdd); this.writeU32(size); }
        for (let i = 0; i < size; i++) {
          // Common numeric rows do not re-enter the recursive dispatcher.
          if (reader.pos >= reader.words) return reader.bad();
          const n = reader.numbers[reader.pos];
          if (Number.isFinite(n)) { reader.pos++; this.encodeNumber(n); }
          else this.tapeValue(reader, depth + 1);
        }
        return;
      case SNAPSHOT_TAPE_TAGS.MAP: {
        if (size > (reader.words - reader.pos) / 2 || (size > 0 && depth >= MAX_DEPTH)) return reader.bad();
        if (size < 16) this.writeU8(0x80 + size);
        else if (size < 65536) { this.writeU8(0xde); this.writeU16(size); }
        else { this.writeU8(0xdf); this.writeU32(size); }
        // Most projection envelopes have just one or two fields. Check duplicate
        // keys without allocating a Set for every vector/record wrapper.
        const keys = size > 2 ? new Set() : null;
        let first, lastIndex = -1, stringKeys = false;
        for (let i = 0; i < size; i++) {
          const key = reader.value(depth + 1);
          if (typeof key !== 'string' || (keys ? keys.has(key) : i > 0 && key === first)) return reader.bad();
          if (!validKey(key)) throw incompatible;
          if (keys) keys.add(key); else first = key;
          // Native Object.keys tapes have canonical integer-key order. A
          // handcrafted tape with another order must fall back, not silently
          // change the old object reader's JavaScript property enumeration.
          const digit = key.charCodeAt(0), index = digit >= 48 && digit <= 57 ? Number(key) : -1;
          if (Number.isInteger(index) && index >= 0 && index < 4294967295 && String(index) === key) {
            if (stringKeys || index <= lastIndex) throw incompatible;
            lastIndex = index;
          } else stringKeys = true;
          const code = keyCodes[key];
          if (code === undefined) this.encodeString(key); else this.writeU8(code);
          if (depth === 1 && key === 'sounds') {
            this.soundStart = this.pos;
            this.sounds = reader.value(depth + 1);
            this.doEncode(this.sounds, depth + 1);
            this.soundEnd = this.pos;
          } else this.tapeValue(reader, depth + 1);
        }
        return;
      }
      default: return reader.bad();
    }
  }
  transcode(tape) {
    const reader = new SnapshotTapeReader(tape);
    this.reinitializeState(); this.soundStart = -1; this.soundEnd = -1; this.sounds = undefined;
    try {
      this.tapeValue(reader, 1);
      if (reader.pos !== reader.words) return reader.bad();
      if (this.pos > LIMIT) throw new RangeError('Binary snapshot exceeds budget');
      return {bytes:this.bytes.slice(0, this.pos), sounds:this.sounds, soundStart:this.soundStart, soundEnd:this.soundEnd};
    } catch (error) {
      if (error === incompatible) return null;
      throw error;
    } finally { this.sounds = undefined; }
  }
}
const tapeSnapshotEncoder = new TapeSnapshotEncoder({ignoreUndefined:true,maxDepth:MAX_DEPTH});
/** Private trusted SnapshotTape only, NOT bytes received from a peer. Null uses
 * the broker's existing synchronous fallback; malformed tapes throw. */
export function encodeProjectedSnapshotTape(tape) { return tapeSnapshotEncoder.transcode(tape); }
// Sounds live one level below the frame root. Retain that exact depth budget.
class TapeSoundEncoder extends FastProjectedSnapshotEncoder {
  doEncode(value, depth) { super.doEncode(value, depth === 1 ? 2 : depth); }
}
const tapeSoundEncoder = new TapeSoundEncoder({ignoreUndefined:true,maxDepth:MAX_DEPTH});
/** Replaces only a recorded root sounds value. All other bytes stay identical,
 * including field order and dictionary IDs. Returned bytes own their storage. */
export function replaceProjectedTapeSounds(frame, sounds) {
  if (frame.soundStart < 0 || frame.soundEnd < frame.soundStart || frame.soundEnd > frame.bytes.length) throw Error('Missing tape sounds');
  let encoded;
  try { encoded = tapeSoundEncoder.encode(sounds); }
  catch (error) { if (error === incompatible) return null; throw error; }
  const payload = encoded.subarray(4); // Discard ONLY the helper's SWF2 magic.
  const size = frame.bytes.length - (frame.soundEnd - frame.soundStart) + payload.length;
  if (size > LIMIT) throw new RangeError('Binary snapshot exceeds budget');
  const result = new Uint8Array(size);
  result.set(frame.bytes.subarray(0, frame.soundStart)); result.set(payload, frame.soundStart);
  result.set(frame.bytes.subarray(frame.soundEnd), frame.soundStart + payload.length);
  return result;
}

// A complete, preflighted frame needs no streaming container-state machine.
// Cache only owned short string bytes, never a view into a received frame.
const decodedStrings = new Array(1024);
const unicode = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const longText = new TextDecoder('utf-8');
const legacyUtf8 = {};
class SnapshotReader {
  offset = 0;
  constructor(bytes, dictionary = false, packed = false) { this.bytes = bytes; this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); this.dictionary = dictionary; this.packed = packed; }
  binary(length) {
    if (!this.packed) throw Error('Unsupported binary snapshot tag');
    if (length > this.bytes.length - this.offset) throw Error('Truncated binary snapshot');
    const value = readPackedNumbers(this.bytes.subarray(this.offset, this.offset + length));
    this.offset += length; return value;
  }
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
    // preflight() has already checked every tag, bound and container depth.
    // Numeric tuples dominate compact combat arrays; avoid recursive dispatch
    // for their common tags, retaining read() for all other MessagePack values.
    const bytes = this.bytes, view = this.view;
    for (let i = 0; i < length; i++) {
      const at = this.offset, tag = bytes[at];
      if (tag < 128) { result[i] = tag; this.offset = at + 1; }
      else if (tag >= 224) { result[i] = tag - 256; this.offset = at + 1; }
      else if (tag === 0xcb) { result[i] = view.getFloat64(at + 1); this.offset = at + 9; }
      else if (tag === 0xc0) { result[i] = null; this.offset = at + 1; }
      else if (tag === 0xc2 || tag === 0xc3) { result[i] = tag === 0xc3; this.offset = at + 1; }
      else if (tag === 0xcc) { result[i] = bytes[at + 1]; this.offset = at + 2; }
      else if (tag === 0xcd) { result[i] = view.getUint16(at + 1); this.offset = at + 3; }
      else if (tag === 0xce) { result[i] = view.getUint32(at + 1); this.offset = at + 5; }
      else result[i] = this.read();
    }
    return result;
  }
  map(length) {
    const result = {};
    for (let i = 0; i < length; i++) {
      const at = this.offset, tag = this.bytes[at];
      let key;
      // preflight already validated the bytes. Dictionary uint keys need no
      // generic value dispatch, but still pass dictionary/range/denylist checks.
      if (this.dictionary && (tag < 128 || tag === 0xcc || tag === 0xcd)) {
        if (tag < 128) { key = tag; this.offset = at + 1; }
        else if (tag === 0xcc) { key = this.bytes[at + 1]; this.offset = at + 2; }
        else { key = this.view.getUint16(at + 1); this.offset = at + 3; }
      } else key = this.read();
      if (this.dictionary && typeof key === 'number') key = dictionaryKey(key);
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
      case 0xc4: this.offset++; return this.binary(this.bytes[p]);
      case 0xc5: this.offset += 2; return this.binary(view.getUint16(p));
      case 0xc6: this.offset += 4; return this.binary(view.getUint32(p));
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
/** Same preflight and all-map-key checks as a full decode, but no unneeded
 * presentation object graph. Never accept a client-supplied summary instead.
 * Scalars/strings use the original reader, including its legacy UTF8 fallback.
 */
class RelaySnapshotReader extends SnapshotReader {
  key() {
    let key = this.read();
    if (this.dictionary && typeof key === 'number') key = dictionaryKey(key);
    if (typeof key !== 'string' || key === '__proto__' || key === 'prototype' || key === 'constructor') throw Error('Invalid binary snapshot key');
    return key;
  }
  container() {
    const at = this.offset, tag = this.bytes[at];
    if (tag >= 0x80 && tag < 0x90) { this.offset++; return { map: true, length: tag & 15 }; }
    if (tag >= 0x90 && tag < 0xa0) { this.offset++; return { map: false, length: tag & 15 }; }
    if (tag === 0xdc || tag === 0xde) { this.offset += 3; return { map: tag === 0xde, length: this.view.getUint16(at + 1) }; }
    if (tag === 0xdd || tag === 0xdf) { this.offset += 5; return { map: tag === 0xdf, length: this.view.getUint32(at + 1) }; }
    return null;
  }
  discard() {
    const at = this.offset, tag = this.bytes[at];
    // Dominant numeric tuples: validate bounds in preflight, advance without
    // allocating their containing arrays or reading numbers nobody will use.
    if (tag < 0x80 || tag >= 0xe0 || tag === 0xc0 || tag === 0xc2 || tag === 0xc3) { this.offset++; return; }
    if (tag === 0xcc || tag === 0xd0) { this.offset += 2; return; }
    if (tag === 0xcd || tag === 0xd1) { this.offset += 3; return; }
    if (tag === 0xca || tag === 0xce || tag === 0xd2) { this.offset += 5; return; }
    if (tag === 0xcb || tag === 0xcf || tag === 0xd3) { this.offset += 9; return; }
    if (this.packed && (tag === 0xc4 || tag === 0xc5 || tag === 0xc6)) {
      // preflight validated the block, including its finite/type/size contract.
      const width = tag === 0xc4 ? 1 : tag === 0xc5 ? 2 : 4, at = this.offset + 1;
      const length = width === 1 ? this.bytes[at] : width === 2 ? this.view.getUint16(at) : this.view.getUint32(at);
      this.offset = at + width + length; return;
    }
    const c = this.container();
    if (!c) { this.read(); return; }
    for (let i = 0; i < c.length; i++) { if (c.map) this.key(); this.discard(); }
  }
  project(fields) {
    if (fields === true) return this.read();
    const c = this.container();
    if (!c) return this.read(); // Preserve wrong types; semantic validation rejects them.
    if (!c.map) {
      if (Array.isArray(fields) && fields.length) {
        const out = new Array(c.length);
        for (let i = 0; i < c.length; i++) out[i] = this.project(fields[0]);
        return out;
      }
      for (let i = 0; i < c.length; i++) this.discard();
      return [];
    }
    const out = {};
    for (let i = 0; i < c.length; i++) {
      const key = this.key();
      if (!Array.isArray(fields) && Object.hasOwn(fields, key)) out[key] = this.project(fields[key]);
      else this.discard();
    }
    return out;
  }
}
// Rare malformed-short-UTF8 compatibility falls back to the unchanged library
// decoder, then uses this selection. It is not permission to bypass validation.
function selectRelayFields(value, fields) {
  if (fields === true || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return Array.isArray(fields) && fields.length ? value.map(row => selectRelayFields(row, fields[0])) : [];
  const out = {};
  if (!Array.isArray(fields)) for (const key of Object.keys(fields)) if (Object.hasOwn(value, key)) out[key] = selectRelayFields(value[key], fields[key]);
  return out;
}
// Rare malformed UTF8 compatibility still enforces the same numeric blocks.
function hydratePacked(value) {
  if (value instanceof Uint8Array) return readPackedNumbers(value);
  if (Array.isArray(value)) { for (let i = 0; i < value.length; i++) value[i] = hydratePacked(value[i]); }
  else if (value && typeof value === 'object') for (const key of Object.keys(value)) value[key] = hydratePacked(value[key]);
  return value;
}
const BoundedSnapshotReader = boundedSnapshotReader(SnapshotReader, dictionaryKey, LIMIT, MAX_DEPTH);
function decodeFrame(buffer, relay = false) {
  const packet = bytesOf(buffer);
  const signature = packet.length >= 4 && packet[0] === 83 && packet[1] === 87 && packet[2] === 70;
  const packed = signature && packet[3] === 51;
  const dictionary = packed || signature && packet[3] === 50;
  // Count the SWF2 prefix toward the SAME total budget; preflight depth is unchanged.
  if (dictionary && packet.length > LIMIT) throw new RangeError('Binary snapshot exceeds budget');
  const bytes = dictionary ? packet.subarray(4) : packet;
  // Ordinary packets are validated as they are decoded, not scanned twice.
  // Keep the old parser for exact error precedence and rare legacy UTF8.
  if (!relay) {
    try { return new BoundedSnapshotReader(bytes, dictionary, packed).complete(); }
    catch { /* No partial value escaped. Legacy validation below is authoritative. */ }
  }
  preflight(bytes, packed);
  try { return relay ? new RelaySnapshotReader(bytes, dictionary, packed).project(RELAY_FRAME_FIELDS) : new SnapshotReader(bytes, dictionary, packed).read(); }
  catch (error) {
    // Preserve the pinned library's legacy handling of malformed short UTF-8.
    if (error !== legacyUtf8) throw error;
    // Decoder retains its input/partial stack; never share this instance.
    const options = dictionary ? dictionaryDecoderOptions : decoderOptions;
    const decoded = new Decoder(packed ? {...options, maxBinLength: LIMIT} : options).decode(bytes);
    const value = packed ? hydratePacked(decoded) : decoded;
    return relay ? selectRelayFields(value, RELAY_FRAME_FIELDS) : value;
  }
}
export function decodeBinaryFrame(buffer) { return decodeFrame(buffer); }
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
function decodeState(buffer, relay = false) {
  const bytes = bytesOf(buffer);
  if (bytes.length < 10 || bytes.length > LIMIT || bytes[0] !== 83 || bytes[1] !== 87 || bytes[2] !== 66 || bytes[3] !== 49) throw Error('Invalid binary state header');
  const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true);
  if (!size || size > 1024 || 8 + size >= bytes.length) throw Error('Invalid binary state header');
  const header = JSON.parse(text.decode(bytes.subarray(8, 8 + size)));
  if (!validHeader(header)) throw Error('Invalid binary state header');
  return { type: 'state', ...header, frame: decodeFrame(bytes.subarray(8 + size), relay) };
}
export function decodeBinaryState(buffer) { return decodeState(buffer); }
/** Relay-only projection. Must still pass summarizeCombatFrame before forwarding the ORIGINAL bytes. */
export function decodeBinaryStateForRelay(buffer) { return decodeState(buffer, true); }
