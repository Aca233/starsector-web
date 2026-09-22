/** Private same-machine immutable P1 capture tape, never a network wire format.
 * A transferable numeric buffer plus a bounded SMALL string table; no cloning
 * of the world object graph. Fresh trusted captures only: no custom accessors
 * or iterators. Unsupported/large projections retain the synchronous codec. */
import { PackedSnapshotNumbers } from './PackedSnapshotNumbers.mjs';
export const TAPE_MAX_BYTES = 4 * 1024 * 1024;
const MAX_STRINGS = 16384, MAX_CHARS = 262144, NAN = 0x7ff80000;
const NIL = 1, FALSE = 2, TRUE = 3, STRING = 4, ARRAY = 5, MAP = 6;
const unsupported = {};
export class SnapshotTapeWriter {
  constructor() { this.buffer = new ArrayBuffer(512 * 1024); this.bind(); }
  bind() { this.numbers = new Float64Array(this.buffer); this.tags = new Uint32Array(this.buffer); }
  reuse(buffer) { if (buffer instanceof ArrayBuffer && buffer.byteLength >= 512 * 1024 && buffer.byteLength <= TAPE_MAX_BYTES && buffer.byteLength % 8 === 0) { this.buffer = buffer; this.bind(); } }
  ensure(words) {
    const wanted = (this.pos + words) * 8;
    if (wanted > TAPE_MAX_BYTES) throw unsupported;
    if (wanted <= this.buffer.byteLength) return;
    const next = new ArrayBuffer(Math.min(TAPE_MAX_BYTES, Math.max(wanted, this.buffer.byteLength * 2)));
    new Uint8Array(next).set(new Uint8Array(this.buffer)); this.buffer = next; this.bind();
  }
  tag(kind, operand = 0) { this.ensure(1); const at = this.pos++ * 2; this.tags[at] = operand; this.tags[at + 1] = NAN + kind; }
  string(value) {
    let id = this.ids.get(value);
    if (id === undefined) {
      if (this.strings.length >= MAX_STRINGS || this.chars + value.length > MAX_CHARS) throw unsupported;
      id = this.strings.length; this.ids.set(value, id); this.strings.push(value); this.chars += value.length;
    }
    this.tag(STRING, id);
  }
  value(value, depth) {
    if (depth > 128) throw unsupported;
    if (value == null) this.tag(NIL);
    else if (typeof value === 'number') { if (!Number.isFinite(value)) throw unsupported; this.ensure(1); this.numbers[this.pos++] = value; }
    else if (typeof value === 'boolean') this.tag(value ? TRUE : FALSE);
    else if (typeof value === 'string') this.string(value);
    else if (value instanceof PackedSnapshotNumbers) {
      const numbers = value.numbers;
      this.tag(ARRAY, numbers.length); this.ensure(numbers.length);
      for (const item of numbers) this.numbers[this.pos++] = item;
    } else if (Array.isArray(value)) {
      this.tag(ARRAY, value.length); this.ensure(value.length);
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (typeof item === 'number' && Number.isFinite(item)) this.numbers[this.pos++] = item;
        else { this.value(item, depth + 1); this.ensure(value.length - i - 1); }
      }
    } else if (typeof value === 'object' && !ArrayBuffer.isView(value) && !(value instanceof Date)) {
      const keys = Object.keys(value); let count = 0;
      for (const key of keys) if (value[key] !== undefined) count++;
      this.tag(MAP, count);
      for (const key of keys) if (value[key] !== undefined) { this.string(key); this.value(value[key], depth + 1); }
    } else throw unsupported;
  }
  encode(frame) {
    if (this.buffer.byteLength === 0) { this.buffer = new ArrayBuffer(512 * 1024); this.bind(); }
    this.pos = 0; this.chars = 0; this.ids = new Map(); this.strings = [];
    try { this.value(frame, 1); return {buffer:this.buffer, words:this.pos, strings:this.strings}; }
    catch (error) { if (error === unsupported) return null; throw error; }
    finally { this.ids = null; }
  }
}
/** Shared by the object reader and the direct transcoder. This is a PRIVATE
 * same-machine format, never an unchecked network parser. */
export const SNAPSHOT_TAPE_TAGS = Object.freeze({NAN, NIL, FALSE, TRUE, STRING, ARRAY, MAP});
export class SnapshotTapeReader {
  constructor({buffer, words, strings}) {
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength > TAPE_MAX_BYTES || buffer.byteLength % 8
        || !Number.isSafeInteger(words) || words < 1 || words > buffer.byteLength / 8 || !Array.isArray(strings)
        || strings.length > MAX_STRINGS || strings.some(s => typeof s !== 'string')
        || strings.reduce((n,s) => n + s.length, 0) > MAX_CHARS) throw Error('Invalid snapshot tape');
    this.numbers = new Float64Array(buffer); this.tags = new Uint32Array(buffer);
    this.words = words; this.strings = strings; this.pos = 0;
  }
  bad() { throw Error('Invalid snapshot tape'); }
  value(depth) {
    if (depth > 128 || this.pos >= this.words) return this.bad();
    const at = this.pos++, n = this.numbers[at]; if (Number.isFinite(n)) return n;
    const kind = this.tags[at * 2 + 1] - NAN, operand = this.tags[at * 2];
    if (kind === NIL && operand === 0) return null;
    if (kind === FALSE && operand === 0) return false;
    if (kind === TRUE && operand === 0) return true;
    if (kind === STRING) return operand < this.strings.length ? this.strings[operand] : this.bad();
    if (kind === ARRAY) {
      if (operand > this.words - this.pos) return this.bad();
      const rows = new Array(operand); for (let i = 0; i < operand; i++) rows[i] = this.value(depth + 1); return rows;
    }
    if (kind === MAP) {
      if (operand > (this.words - this.pos) / 2) return this.bad();
      const result = Object.create(null);
      for (let i = 0; i < operand; i++) {
        const key = this.value(depth + 1);
        if (typeof key !== 'string' || Object.hasOwn(result, key)) return this.bad();
        result[key] = this.value(depth + 1);
      }
      return result;
    }
    return this.bad();
  }
}
export function readSnapshotTape(tape) {
  const reader = new SnapshotTapeReader(tape), frame = reader.value(1);
  if (reader.pos !== reader.words) return reader.bad(); return frame;
}
