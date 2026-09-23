import { Vector2 } from '../engine/math/Vector2';
import { equalPacked, fieldsWeight, MAX_PROJECTILE_COLUMN_ROWS, MAX_PROJECTILE_COLUMN_CELLS, MAX_PROJECTILE_SHARED_NODES } from './ProjectileColumns';

type Wire = any;
interface CaptureAdapter {
  keys(row: object): string[] | null;
  row(row: object): Wire;
  field(value: unknown, owner: object): Wire;
  compact(rows: Wire[]): Wire | null;
}
interface Group {
  keys: string[];
  indices: number[];
  base: any;
  baseValues?: any[];
  packed?: Wire;
  unsupported?: boolean;
  fixed: Uint8Array;
}
const signatures = new WeakMap<string[], string>();
const counts = { frames: 0, rows: 0, reusedFields: 0, packedFields: 0, fallbackFrames: 0 };
export function nativeProjectileCaptureDiagnostics() { return { ...counts }; }

/** A proof for context-free, pure data only. Unknown structures are packed by
 * the established codec, not assumed unchanged by reference identity. In
 * particular a shared object can contain an ancestor/Ship reference. */
function sameNativeValue(a: any, b: any, cache: WeakMap<object, { base: object; equal: boolean }>, depth = 0): boolean {
  if (a === null || typeof a !== 'object') return typeof a !== 'function' && Object.is(a, b);
  if (b === null || typeof b !== 'object' || depth > 3) return false;
  if (a instanceof Vector2) return b instanceof Vector2 && Object.is(a.x, b.x) && Object.is(a.y, b.y);
  const known = cache.get(a);
  if (known?.base === b) return known.equal;
  const equal = compareNativeContainer(a, b, cache, depth);
  cache.set(a, { base: b, equal }); return equal;
}
function compareNativeContainer(a: any, b: any, cache: WeakMap<object, { base: object; equal: boolean }>, depth: number): boolean {
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length || a.length > 32
      || Object.getPrototypeOf(a) !== Array.prototype || Object.getPrototypeOf(b) !== Array.prototype
      || Object.hasOwn(a, 'map') || Object.hasOwn(b, 'map') || Object.hasOwn(a, 'constructor') || Object.hasOwn(b, 'constructor')) return false;
    for (let i = 0; i < a.length; i++) if (!(i in a) || !(i in b) || !sameNativeValue(a[i], b[i], cache, depth + 1)) return false;
    return true;
  }
  if (Object.getPrototypeOf(a) !== Object.prototype || Object.getPrototypeOf(b) !== Object.prototype) return false;
  const ak = Object.keys(a), bk = Object.keys(b);
  if (ak.length !== bk.length || ak.length > 32) return false;
  for (let i = 0; i < ak.length; i++) if (ak[i] !== bk[i] || !sameNativeValue(a[ak[i]], b[bk[i]], cache, depth + 1)) return false;
  return true;
}

/** Native-authority-only replacement for pack-every-row then compact. Output
 * is the EXISTING self-contained column contract; no temporal template state.
 * Caller guarantees a locally constructed non-Proxy, accessor-free graph, as
 * captureAuthorityCombat already requires. Generic capture never calls this. */
export function captureNativeProjectileColumns(source: any[], adapter: CaptureAdapter): { rows: Wire[]; columns: Wire | null } | null {
  if (source.length < 4 || source.length > MAX_PROJECTILE_COLUMN_ROWS) return null;
  const groups = new Map<string, Map<string, Group>>(), membership: (Group | null)[] = [];
  let groupCount = 0, cells = 0;
  // Complete the cheap structural check before altering the frame dictionary.
  for (let i = 0; i < source.length; i++) {
    const row = source[i];
    if (!row || Object.getPrototypeOf(row) !== Object.prototype) { counts.fallbackFrames++; return null; }
    const keys = adapter.keys(row);
    if (!keys || keys.length < 6 || keys.length > 256 || (cells += keys.length) > MAX_PROJECTILE_COLUMN_CELLS) { counts.fallbackFrames++; return null; }
    if (typeof row.specId !== 'string') { membership.push(null); continue; }
    let signature = signatures.get(keys);
    if (!signature) { signature = JSON.stringify(keys); signatures.set(keys, signature); }
    let bySpec = groups.get(signature);
    if (!bySpec) groups.set(signature, bySpec = new Map());
    let group = bySpec.get(row.specId);
    if (!group) {
      if (++groupCount > 128) { counts.fallbackFrames++; return null; }
      group = { keys, indices: [], base: row, fixed: new Uint8Array(keys.length).fill(1) };
      bySpec.set(row.specId, group);
    }
    group.indices.push(i); membership.push(group);
  }
  const rows: Wire[] = new Array(source.length); let compatible = true, recompact = false, reused = 0, packed = 0;
  const valuePairs = new WeakMap<object, { base: object; equal: boolean }>();
  for (let i = 0; i < source.length; i++) {
    const row = source[i], group = membership[i];
    if (!group || !group.packed || group.unsupported || group.indices.length < 4) {
      rows[i] = adapter.row(row);
      if (!Number.isInteger(rows[i]?.$record) || !Array.isArray(rows[i]?.values)) { compatible = false; if (group) group.unsupported = true; }
      if (group && !group.packed) {
        group.packed = rows[i]; group.baseValues = group.keys.map(key => row[key]);
        if (rows[i]?.values?.length !== group.keys.length) { group.unsupported = true; recompact = true; }
      }
      continue;
    }
    const base = group.packed.values, values = new Array(group.keys.length);
    for (let col = 0; col < group.keys.length; col++) {
      const key = group.keys[col], value = row[key];
      if (typeof value === 'function') { rows[i] = adapter.row(row); recompact = true; break; }
      const original = group.baseValues![col];
      if (Object.is(value, original) && (value === null || typeof value !== 'object')
          || sameNativeValue(value, original, valuePairs)) { values[col] = base[col]; reused++; }
      else {
        values[col] = value === null || typeof value === 'string' || typeof value === 'boolean'
          || (typeof value === 'number' && Number.isFinite(value)) ? value : adapter.field(value, row); packed++;
        if (!equalPacked(values[col], base[col])) group.fixed[col] = 0;
      }
    }
    rows[i] ??= { $record: group.packed.$record, values };
  }
  counts.frames++; counts.rows += rows.length; counts.reusedFields += reused; counts.packedFields += packed;
  if (!compatible) return { rows, columns: null };
  if (recompact) return { rows, columns: adapter.compact(rows) };
  // Follow the old layout/spec insertion order, not merely native shape order:
  // interleaved specs can establish a nested layout before another projectile.
  const ordered = [...groups.values()].flatMap(bySpec => [...bySpec.values()]);
  const byLayout = new Map<number, Group[]>();
  for (const group of ordered) {
    const id = group.packed.$record;
    let list = byLayout.get(id); if (!list) byLayout.set(id, list = []);
    list.push(group);
  }
  const templates: Wire[] = [], output = rows.slice(); let repeatedNodes = 0;
  for (const list of byLayout.values()) for (const group of list) {
    if (group.indices.length < 4) continue;
    const fixed: number[] = [], dynamic: number[] = [];
    for (let col = 0; col < group.keys.length; col++) (group.fixed[col] ? fixed : dynamic).push(col);
    if (fixed.length < 8 || fixed.length * (group.indices.length - 1) < 64) continue;
    const values = fixed.map(col => group.packed.values[col]);
    repeatedNodes += fieldsWeight(values) * group.indices.length;
    if (repeatedNodes > MAX_PROJECTILE_SHARED_NODES) return { rows, columns: null };
    const id = templates.length;
    templates.push([group.packed.$record, fixed, values]);
    for (const i of group.indices) output[i] = [id, ...dynamic.map(col => rows[i].values[col])];
  }
  return { rows, columns: templates.length ? { $projectileColumns: templates, values: output } : null };
}
