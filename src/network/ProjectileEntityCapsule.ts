import { Vector2 } from '../engine/math/Vector2';
import { encodeProjectedBinaryFrame, decodeBinaryFrame } from './BinarySnapshot.mjs';
import { expandSnapshotProjectiles } from './ProjectileProjection';

type Row = Record<string, any>;
type Change = [number, Row, string[]];
export type EntityCapsule = [number, string, number, Change[], Change[], number[], number[] | null];
const MAX_ROWS = 4096, MAX_NODES = 262144, MAX_BASE = 128 * 1024, MAX_DEPTH = 32, MAX_CHARS = 2 * 1024 * 1024;
const denied = new Set(['__proto__', 'prototype', 'constructor']);
const owns = (o: any, key: string) => Object.hasOwn(o, key);
const idOK = (v: any) => typeof v === 'number' && Number.isFinite(v) && v <= Number.MAX_SAFE_INTEGER && v >= 0 && !Object.is(v, -0);
const plain = (v: any) => v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;
const safeKey = (s: any) => typeof s === 'string' && s.length <= 256 && !denied.has(s);
function fail(): never { throw Error('Invalid projectile entity capsule'); }
function freeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) { for (const c of Object.values(v)) freeze(c); Object.freeze(v); }
  return v;
}
export function entityEqual(a: any, b: any): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const ak = Object.keys(a), bk = Object.keys(b);
  return ak.length === bk.length && ak.every(k => owns(b, k) && entityEqual(a[k], b[k]));
}
// Cache only privately frozen/validated trees. Include depth and repeated subtree
// expansion, not merely unique nodes, so templates cannot amplify past budgets.
type Weight = [number, number, number];
const weights = new WeakMap<object, Weight>();
function weight(value: any, depth = 0): Weight {
  if (depth > MAX_DEPTH) fail();
  if (value === null || typeof value === 'boolean') return [1, 0, 0];
  if (typeof value === 'number') { if (!Number.isFinite(value)) fail(); return [1, 0, 0]; }
  if (typeof value === 'string') { if (value.length > 65536) fail(); return [1, value.length, 0]; }
  if (!value || typeof value !== 'object') fail();
  const cached = weights.get(value); if (cached) { if (depth + cached[2] > MAX_DEPTH) fail(); return cached; }
  const keys = Object.keys(value);
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype || value.length > MAX_ROWS || keys.length !== value.length) fail();
  } else {
    if (!plain(value) || keys.length > 256 || keys.some(k => !safeKey(k))) fail();
    if (keys.some(k => k.startsWith('$'))) {
      if (keys.length !== 1) fail();
      if (keys[0] === '$vector') {
        if (!Array.isArray(value.$vector) || value.$vector.length !== 2 || !value.$vector.every(Number.isFinite)) fail();
      } else if (keys[0] === '$undefined') { if (value.$undefined !== 1) fail(); }
      else if (keys[0] === '$number') { if (!['NaN', 'Infinity', '-Infinity'].includes(value.$number)) fail(); }
      else fail();
    }
  }
  let nodes = 1, chars = keys.reduce((n, k) => n + k.length, 0), height = 0;
  for (const key of keys) {
    const w = weight(value[key], depth + 1); nodes += w[0]; chars += w[1]; height = Math.max(height, 1 + w[2]);
    if (nodes > MAX_NODES || chars > MAX_CHARS) fail();
  }
  const result: Weight = [nodes, chars, height]; if (Object.isFrozen(value)) weights.set(value, result); return result;
}
function validateRows(rows: Row[]): void {
  if (rows.length > MAX_ROWS) fail();
  let nodes = 0, chars = 0; const ids = new Set<number>();
  for (const row of rows) {
    if (!plain(row) || !idOK(row.id) || ids.has(row.id) || typeof row.specId !== 'string' || row.specId.length > 256) fail();
    ids.add(row.id); const w = weight(row); nodes += w[0]; chars += w[1];
    if (nodes > MAX_NODES || chars > MAX_CHARS) fail();
  }
}
function difference(base: Row, target: Row): [Row, string[]] {
  const set: Row = {}, remove: string[] = [];
  for (const key of Object.keys(target)) if (!owns(base, key) || !entityEqual(base[key], target[key])) set[key] = target[key];
  for (const key of Object.keys(base)) if (!owns(target, key)) remove.push(key);
  return [set, remove];
}
/** Encoding reference ONLY; every deviation from this exact 1/60 operation
 * sequence is patched. No collision, fade, guidance or deletion inference. */
function reference(row: Row, steps: number): Row {
  if (!steps || row.isMine) return row;
  const next = { ...row };
  const pos = row.pos?.$vector?.slice(), vel = row.vel?.$vector;
  for (let i = 0; i < steps; i++) {
    if (pos && vel && !row.didDamage) { pos[0] += vel[0] * (1 / 60); pos[1] += vel[1] * (1 / 60); }
    if (typeof next.elapsedTime === 'number') next.elapsedTime += 1 / 60;
    if (typeof next.flightTimeRemaining === 'number') next.flightTimeRemaining -= 1 / 60;
    if (typeof next.armingTimeRemaining === 'number') next.armingTimeRemaining = Math.max(0, next.armingTimeRemaining - 1 / 60);
    if (typeof next.rangeRemaining === 'number' && typeof next.sourceMoveSpeed === 'number') next.rangeRemaining -= next.sourceMoveSpeed * (1 / 60);
  }
  if (pos) next.pos = { $vector: pos };
  return next;
}
function to64(bytes: Uint8Array): string {
  let raw = ''; for (let i = 0; i < bytes.length; i += 8192) raw += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(raw);
}
function from64(text: string): Uint8Array {
  if (typeof text !== 'string' || !text.length || text.length > Math.ceil(MAX_BASE / 3) * 4 || text.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) fail();
  const raw = atob(text); if (raw.length > MAX_BASE || btoa(raw) !== text) fail();
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
/** TEST CANDIDATE. Native authority only; unknown graphs fail to old capture.
 * Each packet is self-contained, so abandoned captures need no commit/ACK. */
export class NativeProjectileCapsules {
  private previous = new Map<number, Row>();
  private anchor: { tick: number; text: string; rows: Row[]; positions: Map<number, number>; specs: Map<string, number> } | null = null;
  constructor(private skip: ReadonlySet<string>, private omit: (key: string) => boolean) {}
  reset(): void { this.previous.clear(); this.anchor = null; }
  capture(source: any[], tick: number, baseline: () => any): EntityCapsule | null {
    try {
      if (!Number.isSafeInteger(tick) || tick < 0 || Object.getPrototypeOf(source) !== Array.prototype || source.length < 4 || source.length > MAX_ROWS) fail();
      let nodes = 0; const seen = new Set<object>();
      const pack = (v: any, prior: any, depth = 0): any => {
        if (++nodes > MAX_NODES || depth > MAX_DEPTH) fail();
        if (v === undefined) return prior?.$undefined === 1 ? prior : freeze({ $undefined: 1 });
        if (typeof v === 'number' && !Number.isFinite(v)) return prior?.$number === String(v) ? prior : freeze({ $number: String(v) });
        if (v === null || typeof v === 'boolean' || typeof v === 'number') return v;
        if (typeof v === 'string') { if (v.length > 65536) fail(); return v; }
        if (!v || typeof v !== 'object' || seen.has(v)) fail();
        if (Object.getPrototypeOf(v) === Vector2.prototype) {
          if (!Number.isFinite(v.x) || !Number.isFinite(v.y)) fail();
          return prior?.$vector && Object.is(v.x, prior.$vector[0]) && Object.is(v.y, prior.$vector[1]) ? prior : freeze({ $vector: [v.x, v.y] });
        }
        seen.add(v); let result: any;
        if (Array.isArray(v) && Object.getPrototypeOf(v) === Array.prototype) {
          if (v.length > MAX_ROWS || Object.keys(v).length !== v.length) fail();
          let same = Array.isArray(prior) && prior.length === v.length;
          const items = new Array(v.length);
          for (let i = 0; i < v.length; i++) { if (!owns(v, String(i))) fail(); items[i] = pack(v[i], prior?.[i], depth + 1); same = same && Object.is(items[i], prior[i]); }
          result = same ? prior : freeze(items);
        } else if (plain(v)) {
          const keys = Object.keys(v).filter(k => !this.skip.has(k) && typeof v[k] !== 'function');
          if (keys.length > 256 || keys.some(k => !safeKey(k) || k.startsWith('$'))) fail();
          let same = !!plain(prior) && Object.keys(prior).length === keys.length;
          const item: Row = {};
          for (const key of keys) { item[key] = pack(v[key], prior?.[key], depth + 1); same = same && owns(prior, key) && Object.is(item[key], prior[key]); }
          result = same ? prior : freeze(item);
        } else fail();
        seen.delete(v); return result;
      };
      const rows: Row[] = [], next = new Map<number, Row>();
      for (const raw of source) {
        if (!plain(raw) || !idOK(raw.id) || next.has(raw.id)) fail();
        const prior = this.previous.get(raw.id), row: Row = {}; seen.add(raw);
        const keys = Object.keys(raw).filter(k => !this.skip.has(k) && !this.omit(k) && typeof raw[k] !== 'function');
        if (keys.length > 256 || keys.some(k => !safeKey(k) || k.startsWith('$'))) fail();
        for (const key of keys) row[key] = pack(raw[key], prior?.[key]);
        seen.delete(raw); freeze(row); rows.push(row); next.set(raw.id, row);
      }
      validateRows(rows);
      let anchor = this.anchor;
      if (!anchor || tick < anchor.tick || tick - anchor.tick > 30) {
        const bytes = encodeProjectedBinaryFrame(baseline(), true); if (!bytes || bytes.length > MAX_BASE) fail();
        const baseRows = expandSnapshotProjectiles(decodeBinaryFrame(bytes)) as Row[]; validateRows(baseRows);
        anchor = { tick, text: to64(bytes), rows: freeze(baseRows), positions: new Map(baseRows.map((r, i) => [r.id, i])), specs: new Map() };
        baseRows.forEach((r, i) => { if (!anchor!.specs.has(r.specId)) anchor!.specs.set(r.specId, i); });
      }
      const create: Change[] = [], update: Change[] = [], remove: number[] = [], order: number[] = [];
      for (const row of rows) {
        const index = anchor.positions.get(row.id);
        if (index === undefined) {
          const template = anchor.specs.get(row.specId) ?? -1, [set, missing] = difference(template < 0 ? {} : anchor.rows[template], row);
          create.push([template, set, missing]); order.push(-create.length);
        } else {
          const [set, missing] = difference(reference(anchor.rows[index], tick - anchor.tick), row);
          if (Object.keys(set).length || missing.length) update.push([index, set, missing]); order.push(index);
        }
      }
      anchor.rows.forEach((r, i) => { if (!next.has(r.id)) remove.push(i); });
      const sameOrder = order.length === anchor.rows.length && order.every((v, i) => v === i);
      this.previous = next; this.anchor = anchor;
      return freeze([anchor.tick, anchor.text, tick, create, update, remove, sameOrder ? null : order] as EntityCapsule);
    } catch { this.reset(); return null; }
  }
}

/** Optional cache: reconnect, dropped first frame and arbitrary skips work. */
export class ProjectileCapsuleReceiver {
  private text: string | null = null;
  private base: Row[] = [];
  decode(packet: any, tick: number): Row[] {
    if (!Array.isArray(packet) || packet.length !== 7) fail();
    const [baseTick, text, targetTick, create, update, remove, order] = packet;
    if (!Number.isSafeInteger(baseTick) || baseTick < 0 || targetTick !== tick || !Number.isSafeInteger(tick) || tick < baseTick || tick - baseTick > 30) fail();
    let base = this.base;
    if (text !== this.text) { base = expandSnapshotProjectiles(decodeBinaryFrame(from64(text))) as Row[]; validateRows(base); freeze(base); }
    for (const a of [create, update, remove]) if (!Array.isArray(a) || a.length > MAX_ROWS || Object.keys(a).length !== a.length) fail();
    let nodes = 0;
    const copy = (v: any, depth = 0): any => {
      if (++nodes > MAX_NODES || depth > MAX_DEPTH) fail();
      if (v === null || ['boolean', 'number', 'string'].includes(typeof v)) return v;
      if (Array.isArray(v)) { if (v.length > MAX_ROWS || Object.keys(v).length !== v.length) fail(); return v.map(x => copy(x, depth + 1)); }
      if (!plain(v)) fail(); const keys = Object.keys(v); if (keys.length > 256 || keys.some(k => !safeKey(k))) fail();
      const result: Row = {}; for (const key of keys) result[key] = copy(v[key], depth + 1); return result;
    };
    const patch = (row: Row, set: any, missing: any): Row => {
      if (!plain(set) || !Array.isArray(missing) || missing.length > 256 || new Set(missing).size !== missing.length) fail();
      const changes = copy(set), next = { ...row };
      for (const key of missing) { if (!safeKey(key) || !owns(row, key) || owns(changes, key)) fail(); delete next[key]; }
      Object.assign(next, changes); return next;
    };
    const rows: (Row | null)[] = base.map(r => reference(r, tick - baseTick)), touched = new Set<number>();
    for (const item of update) {
      if (!Array.isArray(item) || item.length !== 3) fail(); const [index, set, missing] = item;
      if (!Number.isInteger(index) || index < 0 || index >= base.length || touched.has(index) || owns(set ?? {}, 'id') || !Array.isArray(missing) || missing.includes('id')) fail();
      touched.add(index); rows[index] = patch(rows[index]!, set, missing);
    }
    for (const index of remove) {
      if (!Number.isInteger(index) || index < 0 || index >= base.length || touched.has(index)) fail(); touched.add(index); rows[index] = null;
    }
    const born = create.map((item: any) => {
      if (!Array.isArray(item) || item.length !== 3) fail(); const [template, set, missing] = item;
      if (!Number.isInteger(template) || template < -1 || template >= base.length) fail(); return patch(template < 0 ? {} : base[template], set, missing);
    });
    if (order !== null && (!Array.isArray(order) || order.length > MAX_ROWS || Object.keys(order).length !== order.length)) fail();
    const indices = order ?? base.map((_, i) => i);
    const selected = indices.map((index: any) => {
      if (!Number.isInteger(index) || index >= rows.length || index < -born.length) fail(); const row = index < 0 ? born[-index - 1] : rows[index]; if (!row) fail(); return row;
    });
    if (selected.length !== base.length - remove.length + born.length || new Set(indices).size !== indices.length) fail();
    validateRows(selected); freeze(selected);
    this.text = text; this.base = base; return selected;
  }
}

const restoredKeys = new WeakMap<object, string[]>();
/** Compare with actual viewer data; renderers may have mutated unchanged fields.
 * Delete formerly replicated fields only, preserving local interpolation state. */
export function restoreEntityValue(wire: any, target: any): any {
  if (wire === null || typeof wire !== 'object') return wire;
  if (wire.$undefined) return undefined;
  if (wire.$number) return wire.$number === 'Infinity' ? Infinity : wire.$number === '-Infinity' ? -Infinity : NaN;
  if (wire.$vector) {
    const [x, y] = wire.$vector;
    if (target instanceof Vector2) { if (!Object.is(target.x, x) || !Object.is(target.y, y)) target.set(x, y); return target; }
    return new Vector2(x, y);
  }
  if (Array.isArray(wire)) {
    const out = Array.isArray(target) ? target : [];
    for (let i = 0; i < wire.length; i++) { const next = restoreEntityValue(wire[i], out[i]); if (!owns(out, String(i)) || !Object.is(next, out[i])) out[i] = next; }
    if (out.length !== wire.length) out.length = wire.length; return out;
  }
  const out = plain(target) ? target : {}, keys = Object.keys(wire);
  for (const key of restoredKeys.get(out) ?? []) if (!owns(wire, key)) delete out[key];
  for (const key of keys) { const next = restoreEntityValue(wire[key], out[key]); if (!owns(out, key) || !Object.is(next, out[key])) out[key] = next; }
  restoredKeys.set(out, keys); return out;
}

