/** SWF3 numeric blocks. Exact native element widths; canonical little endian.
 * Each block owns storage, never a view into the engine or a received packet.
 * JSON/tape retain the legacy scalar-array representation. Immutable blocks may
 * be reused locally; every transmitted snapshot still owns a complete payload. */
const kinds = [null, Float32Array, Float64Array, Uint8Array, Uint8ClampedArray,
  Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array];
const littleEndian = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
const HEADER = 8, MAX_BYTES = 16 * 1024 * 1024;
const invalid = () => { throw Error('Invalid packed snapshot numbers'); };
function swap(bytes, width) {
  for (let i = HEADER; i < bytes.length; i += width)
    for (let j = 0; j < width / 2; j++) {
      const x = bytes[i + j]; bytes[i + j] = bytes[i + width - 1 - j]; bytes[i + width - 1 - j] = x;
    }
}
/** Checks the complete wire payload without allocating or trusting its type. */
export function validatePackedNumbers(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < HEADER || bytes.length > MAX_BYTES) return invalid();
  const type = kinds[bytes[0]];
  if (!type || (bytes.length - HEADER) % type.BYTES_PER_ELEMENT) return invalid();
  for (let i = 1; i < HEADER; i++) if (bytes[i] !== 0) return invalid();
  if (type === Float32Array || type === Float64Array) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), width = type.BYTES_PER_ELEMENT;
    for (let i = HEADER; i < bytes.length; i += width)
      if (!Number.isFinite(width === 4 ? view.getFloat32(i, true) : view.getFloat64(i, true))) return invalid();
  }
  return type;
}
const OWNED = Symbol('owned native numeric bytes');
export class PackedSnapshotNumbers {
  #bytes;
  #numbers;
  constructor(bytes, ownership) {
    const type = ownership === OWNED ? kinds[bytes[0]] : validatePackedNumbers(bytes);
    this.#bytes = ownership === OWNED ? bytes : new Uint8Array(bytes);
    const native = littleEndian ? this.#bytes : this.#bytes.slice();
    if (!littleEndian) swap(native, type.BYTES_PER_ELEMENT);
    this.#numbers = new type(native.buffer, HEADER, (native.length - HEADER) / type.BYTES_PER_ELEMENT);
    this.type = type.name;
    Object.freeze(this);
  }
  get byteLength() { return this.#bytes.length; }
  get length() { return this.#numbers.length; }
  // Compatibility inspectors return copies: cached packets cannot share a
  // mutable view with callers, restored worlds, or transferred buffers.
  get bytes() { return this.#bytes.slice(); }
  get numbers() { return this.#numbers.slice(); }
  copyBytesTo(target, offset) { Uint8Array.prototype.set.call(target, this.#bytes, offset); }
  copyNumbersTo(target) { Uint8Array.prototype.set.call(target, this.#numbers); }
  matchesBytes(bytes) {
    if (bytes.length !== this.#bytes.length) return false;
    const a = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
    const b = new DataView(this.#bytes.buffer);
    let i = 0;
    for (; i + 4 <= bytes.length; i += 4) if (a.getUint32(i) !== b.getUint32(i)) return false;
    for (; i < bytes.length; i++) if (bytes[i] !== this.#bytes[i]) return false;
    return true;
  }
  static capture(value) {
    const id = kinds.findIndex(type => type && Object.getPrototypeOf(value) === type.prototype);
    if (id < 1 || HEADER + value.byteLength > MAX_BYTES) return null;
    const type = kinds[id], bytes = new Uint8Array(HEADER + value.byteLength);
    bytes[0] = id;
    const numbers = new type(bytes.buffer, HEADER, value.length);
    numbers.set(value);
    if (type === Float32Array || type === Float64Array) {
      for (let i = 0; i < numbers.length; i++) {
        if (!Number.isFinite(numbers[i])) return null;
        if (numbers[i] === 0) numbers[i] = 0; // Legacy signed-zero canonicalization.
      }
    }
    if (!littleEndian) swap(bytes, type.BYTES_PER_ELEMENT);
    return new PackedSnapshotNumbers(bytes, OWNED);
  }
  toJSON() { return Array.from(this.#numbers); }
}
// Content cache only, never a baseline or revision claimed by an untrusted
// sender. An exact byte comparison proves a hit was already validated. The
// sparse hash merely chooses a slot; collisions still decode/validate normally.
const cache = new Map(), CACHE_BYTES = 4 * 1024 * 1024, CACHE_ENTRIES = 128;
let retainedBytes = 0, hits = 0, misses = 0;
export function readPackedNumbers(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < HEADER || bytes.length > MAX_BYTES) return invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  const key = (Math.imul(bytes.length, 0x9e3779b1) ^ view.getUint32(0)
    ^ view.getUint32(bytes.length - 4) ^ view.getUint32(Math.floor((bytes.length - 4) / 2))) >>> 0;
  const cached = cache.get(key);
  if (cached?.matchesBytes(bytes)) { hits++; return cached; }
  misses++;
  const result = new PackedSnapshotNumbers(bytes), cost = result.byteLength * (littleEndian ? 1 : 2);
  if (cost > CACHE_BYTES) return result;
  if (cached) { retainedBytes -= cached.byteLength * (littleEndian ? 1 : 2); cache.delete(key); }
  while (cache.size && (cache.size >= CACHE_ENTRIES || retainedBytes + cost > CACHE_BYTES)) {
    const oldest = cache.keys().next().value;
    retainedBytes -= cache.get(oldest).byteLength * (littleEndian ? 1 : 2); cache.delete(oldest);
  }
  cache.set(key, result); retainedBytes += cost;
  return result;
}
export function packedNumberCacheStats() { return {entries: cache.size, bytes: retainedBytes, hits, misses}; }
