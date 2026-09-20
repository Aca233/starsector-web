/** Version 1 lossless-delta reference predictor. Not simulation or interpolation.
 * Only changes selected existing float64 byte spans in an OWNED copy of SWB1.
 * A transport must still send/apply a complete correction and verify its target
 * bytes. This reference alone MUST NEVER be displayed or acknowledged as state.
 *
 * Frozen wire math: basic IEEE-754 +,-,*,/ only, repeated at 1/60 up to 60 steps.
 * No Math.exp/sin/hypot, native engine hooks, field removal or quantization.
 * Unsupported representations fail to null so callers retain ordinary deltas.
 */
import { KEY_DICTIONARY } from './KeyDictionary.mjs';

export const MOTION_REFERENCE_VERSION = 1;
const MAX_BYTES = 2 * 1024 * 1024, MAX_NODES = 262144, MAX_DEPTH = 96, MAX_ROWS = 8192;
const DT = 1 / 60;
const text = new TextDecoder('utf-8', { fatal: true });
const denied = new Set(['__proto__', 'prototype', 'constructor']);
const fields = new Set(['pos', 'prevPos', 'vel', 'life', 'maxLife', 'rotation', 'angularVel', 'material', 'alpha',
  'elapsedTime', 'flightTimeRemaining', 'armingTimeRemaining', 'sourceMoveSpeed', 'rangeRemaining', 'didDamage']);
const fxKinds = new Set(['particles', 'debris', 'hitGlows', 'floatingTexts']);
const numericTags = {
  0xcc: ['getUint8', 1], 0xcd: ['getUint16', 2], 0xce: ['getUint32', 4], 0xcf: ['getBigUint64', 8],
  0xd0: ['getInt8', 1], 0xd1: ['getInt16', 2], 0xd2: ['getInt32', 4], 0xd3: ['getBigInt64', 8],
  0xca: ['getFloat32', 4], 0xcb: ['getFloat64', 8],
};
const invalid = () => { throw Error('Unsupported motion reference'); };
const arrayTag = tag => (tag & 0xf0) === 0x90 || tag === 0xdc || tag === 0xdd;
const mapTag = tag => (tag & 0xf0) === 0x80 || tag === 0xde || tag === 0xdf;
const numericTag = tag => tag < 0x80 || tag >= 0xe0 || Object.hasOwn(numericTags, tag);

// One cursor, depth/node/byte budgets. Unneeded subtrees are skipped without
// materializing a decoded world; keys can NEVER recurse into arbitrary objects.
class Reader {
  constructor(bytes) { this.bytes = bytes; this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); this.at = 0; this.nodes = 0; }
  guard(size) { if (!Number.isSafeInteger(size) || size < 0 || size > this.bytes.length - this.at) invalid(); }
  visit(depth = 0) { if (++this.nodes > MAX_NODES || depth > MAX_DEPTH) invalid(); }
  byte() { this.guard(1); return this.bytes[this.at++]; }
  unsigned(size) {
    this.guard(size);
    const value = size === 1 ? this.view.getUint8(this.at) : size === 2 ? this.view.getUint16(this.at) : this.view.getUint32(this.at);
    this.at += size; return value;
  }
  string(tag) {
    let length;
    if ((tag & 0xe0) === 0xa0) length = tag & 31;
    else if (tag === 0xd9) length = this.unsigned(1);
    else if (tag === 0xda) length = this.unsigned(2);
    else if (tag === 0xdb) length = this.unsigned(4);
    else return invalid();
    this.guard(length); const value = text.decode(this.bytes.subarray(this.at, this.at + length)); this.at += length; return value;
  }
  scalar() {
    this.visit(); const start = this.at, tag = this.byte();
    if (tag < 0x80) return { value: tag, offset: -1 };
    if (tag >= 0xe0) return { value: tag - 256, offset: -1 };
    if (tag === 0xc0 || tag === 0xc2 || tag === 0xc3) return { value: tag === 0xc0 ? null : tag === 0xc3, offset: -1 };
    const format = numericTags[tag];
    if (format) {
      this.guard(format[1]); const value = Number(this.view[format[0]](this.at)); this.at += format[1];
      if (!Number.isFinite(value)) invalid();
      return { value, offset: tag === 0xcb ? start + 1 : -1 };
    }
    return { value: this.string(tag), offset: -1 };
  }
  key() {
    const key = this.scalar().value;
    const value = typeof key === 'number' && Number.isInteger(key) && key >= 0 && key < KEY_DICTIONARY.length ? KEY_DICTIONARY[key] : key;
    if (typeof value !== 'string' || denied.has(value)) invalid();
    return value;
  }
  count(kind, depth = 0) {
    this.visit(depth); const tag = this.byte(); let count;
    if (kind === 'array' && (tag & 0xf0) === 0x90 || kind === 'map' && (tag & 0xf0) === 0x80) count = tag & 15;
    else if (tag === (kind === 'array' ? 0xdc : 0xde)) count = this.unsigned(2);
    else if (tag === (kind === 'array' ? 0xdd : 0xdf)) count = this.unsigned(4);
    else return invalid();
    if (count > (kind === 'array' ? MAX_NODES : 65536) || count * (kind === 'array' ? 1 : 2) > this.bytes.length - this.at) invalid();
    return count;
  }
  array(fn, maximum = MAX_NODES) { const count = this.count('array'); if (count > maximum) invalid(); for (let i = 0; i < count; i++) fn(i); return count; }
  map(fn) {
    const count = this.count('map'), seen = new Set();
    for (let i = 0; i < count; i++) { const key = this.key(); if (seen.has(key)) invalid(); seen.add(key); fn(key); }
    return count;
  }
  skip(depth = 0) {
    this.visit(depth); const tag = this.bytes[this.at];
    if (arrayTag(tag)) { const count = this.count('array', depth); for (let i = 0; i < count; i++) this.skip(depth + 1); return; }
    if (mapTag(tag)) { const count = this.count('map', depth); for (let i = 0; i < count; i++) { this.key(); this.skip(depth + 1); } return; }
    this.byte(); let length = 0;
    if (tag < 0x80 || tag >= 0xe0 || tag === 0xc0 || tag === 0xc2 || tag === 0xc3) return;
    if ((tag & 0xe0) === 0xa0) length = tag & 31;
    else if (tag === 0xd9) length = this.unsigned(1);
    else if (tag === 0xda) length = this.unsigned(2);
    else if (tag === 0xdb) length = this.unsigned(4);
    else if (numericTags[tag]) length = numericTags[tag][1];
    else invalid();
    this.guard(length); this.at += length;
  }
  number() { const { value, offset } = this.scalar(); if (typeof value !== 'number') invalid(); return { value, offset }; }
  vector() {
    let result;
    if (this.map(key => {
      if (key !== '$vector') return invalid(); result = [];
      if (this.array(() => result.push(this.number()), 2) !== 2) invalid();
    }) !== 1 || !result) invalid();
    return result;
  }
}

function frameReader(value) {
  const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : ArrayBuffer.isView(value)
    ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength) : null;
  if (!bytes || bytes.length < 20 || bytes.length > MAX_BYTES) invalid();
  const reader = new Reader(bytes), view = reader.view;
  if (view.getUint32(0) !== 0x53574231) invalid();
  const headerLength = view.getUint32(4, true);
  if (headerLength < 1 || headerLength > 1024 || 8 + headerLength + 4 >= bytes.length) invalid();
  const header = JSON.parse(text.decode(bytes.subarray(8, 8 + headerLength)));
  if (!header || Object.keys(header).length !== 2 || typeof header.matchId !== 'string' || !header.matchId || header.matchId.length > 128
    || !Number.isSafeInteger(header.seq) || header.seq < 0) invalid();
  reader.at = 8 + headerLength;
  if (view.getUint32(reader.at) !== 0x53574632) invalid(); // Only the frozen SWF2 layout.
  reader.at += 4; return reader;
}

/** A bounded prefix read, not a replacement for the existing state validation. */
export function motionSnapshotTick(bytes) {
  try {
    const reader = frameReader(bytes), count = reader.count('map');
    for (let i = 0; i < count; i++) {
      if (reader.key() === 'tick') { const tick = reader.scalar().value; return Number.isSafeInteger(tick) && tick >= 0 ? tick : null; }
      reader.skip();
    }
  } catch { /* Optional representation. */ }
  return null;
}

function collect(reader) {
  let layouts, tick; const rows = [];
  const layoutKeys = id => { if (!Number.isInteger(id) || id < 0 || !layouts?.[id]) invalid(); return layouts[id]; };
  const readLayouts = () => {
    layouts = []; reader.array(() => {
      const keys = []; reader.array(() => { const key = reader.scalar().value; if (typeof key !== 'string' || key.length > 256 || denied.has(key)) invalid(); keys.push(key); }, 2048);
      if (new Set(keys).size !== keys.length) invalid(); layouts.push(keys);
    }, 1024);
  };
  const field = key => {
    if (!fields.has(key)) { reader.skip(); return undefined; }
    if (key === 'pos' || key === 'prevPos' || key === 'vel') {
      // Undefined/custom vector markers retain the ordinary delta path.
      return reader.vector();
    }
    if (key === 'material' || key === 'didDamage') return reader.scalar().value;
    if (numericTag(reader.bytes[reader.at])) return reader.number();
    reader.skip(); return undefined;
  };
  const accept = row => {
    if ((row.kind === 'projectiles' || row.life) && row.pos && row.vel) {
      // Partial/custom records are skipped rather than dereferenced during math.
      if (row.kind === 'debris' && (!row.rotation || !row.angularVel)) return;
      rows.push(row); if (rows.length > MAX_ROWS) invalid();
    }
  };
  const rowValues = (keys, kind) => {
    const row = { kind };
    if (reader.array(i => { if (i >= keys.length) invalid(); const value = field(keys[i]); if (value !== undefined) row[keys[i]] = value; }, 2048) !== keys.length) invalid();
    accept(row);
  };
  const record = kind => {
    let keys, values = false;
    if (reader.map(key => {
      if (key === '$record') keys = layoutKeys(reader.scalar().value);
      else if (key === 'values' && keys) { rowValues(keys, kind); values = true; }
      else invalid();
    }) !== 2 || !values) invalid();
  };
  const collection = kind => {
    if (arrayTag(reader.bytes[reader.at])) { reader.array(() => record(kind), MAX_ROWS); return; }
    let keys, values = false;
    if (reader.map(key => {
      if (key === '$records') keys = layoutKeys(reader.scalar().value);
      else if (key === 'values' && keys) { reader.array(() => rowValues(keys, kind), MAX_ROWS); values = true; }
      else invalid();
    }) !== 2 || !values) invalid();
  };
  const fx = () => {
    let keys, values = false;
    if (reader.map(key => {
      if (key === '$record') keys = layoutKeys(reader.scalar().value);
      else if (key === 'values' && keys) {
        if (reader.array(i => { if (i >= keys.length) invalid(); if (fxKinds.has(keys[i])) collection(keys[i]); else reader.skip(); }, 2048) !== keys.length) invalid(); values = true;
      } else invalid();
    }) !== 2 || !values) invalid();
  };
  const projectiles = () => {
    if (arrayTag(reader.bytes[reader.at])) { reader.array(() => record('projectiles'), 4096); return; }
    const templates = []; let gotTemplates = false, gotRows = false, cells = 0;
    // Shared fixed values are readable but NEVER written through a per-row plan.
    const fixed = value => Array.isArray(value) ? value.map(fixed) : value && typeof value === 'object' ? { ...value, offset: -1 } : value;
    if (reader.map(key => {
      if (key === '$projectileColumns') {
        reader.array(() => {
          let keys, indices; const common = Object.create(null);
          if (reader.array(i => {
            if (i === 0) keys = layoutKeys(reader.scalar().value);
            else if (i === 1) {
              indices = []; reader.array(() => { const index = reader.scalar().value;
                if (!Number.isInteger(index) || index < 0 || index >= keys.length || indices.length && index <= indices.at(-1)) invalid(); indices.push(index); }, 256);
            } else if (i === 2) {
              if (reader.array(j => { if (j >= indices.length) invalid(); const name = keys[indices[j]], value = field(name); if (value !== undefined) common[name] = fixed(value); }, 256) !== indices.length) invalid();
            } else invalid();
          }, 3) !== 3 || keys.length > 256) invalid();
          const shared = new Set(indices); templates.push({ common, keys: keys.filter((_key, i) => !shared.has(i)), width: keys.length });
        }, 128); gotTemplates = true;
      } else if (key === 'values' && gotTemplates) {
        reader.array(() => {
          if (!arrayTag(reader.bytes[reader.at])) { record('projectiles'); return; }
          let template, row;
          const count = reader.array(i => {
            if (i === 0) { const id = reader.scalar().value; if (!Number.isInteger(id) || id < 0 || !templates[id]) invalid(); template = templates[id]; row = { ...template.common, kind: 'projectiles' }; }
            else { const name = template.keys[i - 1]; if (i > template.keys.length) invalid(); const value = field(name); if (value !== undefined) row[name] = value; }
          }, 257);
          if (!template || count !== template.keys.length + 1) invalid();
          cells += template.width; if (cells > MAX_NODES) invalid(); accept(row);
        }, 4096); gotRows = true;
      } else invalid();
    }) !== 2 || !gotRows) invalid();
  };
  reader.map(key => {
    if (key === 'tick') tick = reader.scalar().value;
    else if (key === 'layouts') readLayouts();
    else if (key === 'world') reader.map(name => { if (name === 'fxSystem') fx(); else if (name === 'projectiles') projectiles(); else reader.skip(); });
    else reader.skip();
  });
  if (reader.at !== reader.bytes.length || !Number.isSafeInteger(tick) || tick < 0 || !rows.length) invalid();
  return rows;
}

/** Returns null for unsupported/over-budget inputs. Input buffers (including
 * Node Buffers/subarrays) are never mutated. No hidden retained state or cache. */
export function createMotionReference(bytes, steps) {
  if (!Number.isSafeInteger(steps) || steps < 1 || steps > 60) return null;
  try {
    const reader = frameReader(bytes), rows = collect(reader);
    const result = Uint8Array.from(reader.bytes), view = new DataView(result.buffer);
    const write = (span, value) => { if (span?.offset >= 0 && Number.isFinite(value)) view.setFloat64(span.offset, value); };
    for (const row of rows) {
      let x = row.pos[0].value, y = row.pos[1].value, vx = row.vel[0].value, vy = row.vel[1].value;
      if (row.kind === 'projectiles') {
        let px, py, elapsed = row.elapsedTime?.value, flight = row.flightTimeRemaining?.value,
          arming = row.armingTimeRemaining?.value, range = row.rangeRemaining?.value;
        for (let i = 0; i < steps; i++) {
          px = x; py = y; elapsed += DT; flight -= DT; arming = Math.max(0, arming - DT);
          if (row.didDamage !== true) { x += vx * DT; y += vy * DT; }
          if (row.sourceMoveSpeed) range -= row.sourceMoveSpeed.value * DT;
        }
        write(row.pos[0], x); write(row.pos[1], y); write(row.prevPos?.[0], px); write(row.prevPos?.[1], py);
        write(row.elapsedTime, elapsed); write(row.flightTimeRemaining, flight); write(row.armingTimeRemaining, arming); write(row.rangeRemaining, range);
      } else {
        let life = row.life.value, rotation = row.rotation?.value;
        for (let i = 0; i < steps; i++) {
          life -= DT; x += vx * DT; y += vy * DT;
          if (row.kind === 'debris') { vx *= Math.max(0, 1 - DT * .4); vy *= Math.max(0, 1 - DT * .4); rotation += row.angularVel.value * DT; }
          else if (row.kind === 'floatingTexts') { vx *= Math.max(0, 1 - DT * 1.1); vy *= Math.max(0, 1 - DT * 1.1); }
        }
        write(row.life, life); write(row.pos[0], x); write(row.pos[1], y); write(row.vel[0], vx); write(row.vel[1], vy); write(row.rotation, rotation);
        if (row.kind === 'particles' && (!row.material || row.material === 'SOURCE_SMOOTH') && row.maxLife) write(row.alpha, Math.max(0, life / row.maxLife.value));
      }
    }
    return result;
  } catch { return null; }
}
