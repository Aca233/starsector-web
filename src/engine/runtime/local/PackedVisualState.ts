import { Vector2 } from '../../math/Vector2';
import type { CombatRenderView } from '../../render/CombatRenderView';

// Explicit visual read records. No AI, gameplay callbacks, RNG or authority writes.
// Every field of these native visual types is retained, including optional values.
type FieldType = 'n' | 's' | 'b' | 'id' | 'v' | 'va' | 'c3' | 'c4' | Schema | readonly [Schema];
interface Schema { index: number; fullMask: number; fields: readonly (readonly [string, FieldType])[]; keys: ReadonlySet<string> }
let nextSchemaIndex = 0;
const schema = (fields: readonly (readonly [string, FieldType])[]): Schema => {
  if (fields.length > 26) throw new Error('Visual presence mask exceeds exact integer precision');
  return { index: nextSchemaIndex++, fullMask: (4 ** fields.length - 1) / 3, fields, keys: new Set(fields.map(([key]) => key)) };
};
const particle = schema([['pos','v'],['vel','v'],['life','n'],['maxLife','n'],['size','n'],['color','c3'],['alpha','n'],['material','s'],['startSize','n'],['endSize','n'],['peakAlpha','n'],['rampUpFraction','n'],['fadeOutFraction','n'],['drag','n'],['rotation','n'],['angularVel','n'],['stretch','n']]);
const contrail = schema([['pos','v'],['vel','v'],['life','n'],['maxLife','n'],['size','n'],['maxSize','n'],['alpha','n'],['rotation','n'],['color','c3']]);
const muzzle = schema([['pos','v'],['vel','v'],['size','n'],['life','n'],['maxLife','n'],['color','c4'],['blendMode','s'],['underHullShipId','s']]);
const glow = schema([['id','n'],['pos','v'],['vel','v'],['diameter','n'],['life','n'],['maxLife','n'],['peakAlpha','n'],['color','c3'],['spriteUrl','s']]);
const point = schema([['pos','v'],['age','n'],['duration','n'],['baseWidth','n'],['currentWidth','n'],['u','n'],['alpha','n']]);
const strip = schema([['stripId','id'],['points',[point]],['color','c4'],['blendMode','s'],['widenMult','n'],['minSeg','n'],['isDetached','b'],['accumU','n']]);
const puff = schema([['offset','v'],['velocity','v'],['startSize','n'],['endSize','n'],['texture','n'],['rotation','n']]);
const flash = schema([['diameter','n'],['coreDiameter','n'],['color','c3'],['duration','n'],['velocity','v']]);
const flare = schema([['width','n'],['height','n'],['color','c3'],['velocity','v']]);
const explosion = schema([['id','n'],['visualKind','s'],['sourceShipId','s'],['sourceAuthored','b'],['puffs',[puff]],['puffDuration','n'],['flash',flash],['flare',flare],['pos','v'],['radius','n'],['maxRadius','n'],['life','n'],['maxLife','n'],['frame','n'],['rotation','n'],['color','c3'],['hasShockwaveRing','b'],['shockwaveRadius','n'],['maxShockwaveRadius','n'],['clusterSeed','n'],['debrisCount','n'],['smokeDensity','n'],['fireballScale','n']]);
const debris = schema([['pos','v'],['vel','v'],['rotation','n'],['angularVel','n'],['size','n'],['life','n'],['maxLife','n'],['color','c3'],['points','va'],['spriteUrl','s'],['isGlowing','b']]);
const muzzleFlash = schema([['underHullShipId','s'],['id','n'],['specId','s'],['pos','v'],['angleRad','n'],['size','n'],['color','c3'],['life','n'],['maxLife','n']]);
const shieldRipple = schema([['pos','v'],['radius','n'],['maxRadius','n'],['life','n'],['maxLife','n'],['color','c3']]);
const movingRayFade = schema([['id','n'],['headPos','v'],['tailPos','v'],['direction','v'],['moveSpeed','n'],['life','n'],['maxLife','n'],['elapsedTime','n'],['maxPulseLength','n'],['width','n'],['textureType','s'],['textureScrollSpeed','n'],['pixelsPerTexel','n'],['fringeColor','c4'],['coreColor','c4']]);
const collections = [
  ['particles',particle], ['contrails',contrail], ['muzzleParticles',muzzle], ['hitGlows',glow],
  ['trailStrips',strip], ['explosions',explosion], ['localParticles',particle],
  ['debris',debris], ['muzzleFlashes',muzzleFlash], ['shieldRipples',shieldRipple],
  ['localMuzzles',muzzle], ['movingRayFades',movingRayFade],
] as const;
const MAX_VALUES = 8_000_000, MAX_RECORDS = 250_000;
const integer = (n: number) => Number.isSafeInteger(n) && n >= 0;
type RecordValue = Record<string, unknown>;
export interface PackedVisualPacket { buffer: ArrayBuffer; length: number; fields: number[]; strings: string[] }
class UnsupportedVisual extends Error {}
function unsupported(): never { throw new UnsupportedVisual(); }
// Same accessor guard used by ExplosionPuffRecipe: no descriptor allocation in a
// scalar loop. Non-enumerable fields were never part of the compatibility graph.
const enumerable = Object.prototype.propertyIsEnumerable;
const lookupGetter = (Object.prototype as unknown as { __lookupGetter__(key: string): unknown }).__lookupGetter__;
function dataValue(object: object, key: string): unknown {
  if (lookupGetter.call(object, key) !== undefined) unsupported();
  return (object as RecordValue)[key];
}

/** Lossless, dense visual arrays. Unlike the compatibility graph this performs no
 * per-field identity lookup, graph edge allocation, or full-record delta comparison.
 * Extended records explicitly fall back to the graph, never lose unknown fields. */
export class PackedVisualEncoder {
  private readonly ids: (WeakMap<object, number> | undefined)[] = [];
  private nextId = 1;
  private lastCapacity = 8192;
  capture(view: CombatRenderView, recycled?: ArrayBuffer, fastShapes = false): PackedVisualPacket {
    let data = new Float64Array(recycled && recycled.byteLength >= 8192 && recycled.byteLength % 8 === 0 && recycled.byteLength <= MAX_VALUES * 8 ? recycled : new ArrayBuffer(this.lastCapacity));
    let cursor = 0, records = 0;
    const strings: string[] = [], stringIds = new Map<string, number>(), fields: number[] = [];
    const reserve = (count: number) => {
      const needed = cursor + count;
      if (needed > MAX_VALUES) throw new Error('Visual buffer budget exceeded');
      if (needed > data.length) {
        let cap = data.length;
        while (cap < needed) cap = Math.min(MAX_VALUES, cap * 2);
        const grown = new Float64Array(cap); grown.set(data); data = grown;
      }
    };
    const write = (n: number) => {
      if (cursor >= MAX_VALUES) throw new Error('Visual buffer budget exceeded');
      if (cursor === data.length) { const grown = new Float64Array(Math.min(MAX_VALUES, data.length * 2)); grown.set(data); data = grown; }
      data[cursor++] = n;
    };
    const text = (v: unknown) => {
      if (typeof v !== 'string') unsupported();
      const s = v as string; let id = stringIds.get(s);
      if (id === undefined) { id = strings.length; strings.push(s); stringIds.set(s, id); }
      write(id);
    };
    const number = (v: unknown) => { if (typeof v !== 'number') unsupported(); write(v as number); };
    const record = (v: unknown, layout: Schema): void => {
      if (!v || typeof v !== 'object' || (fastShapes ? (v as object).constructor !== Object : Object.getPrototypeOf(v) !== Object.prototype)) unsupported();
      const object = v as RecordValue;
      if (!fastShapes) {
        for (const key in object) {
          if (enumerable.call(object, key) && !layout.keys.has(key)) unsupported();
        }
      }
      if (++records > MAX_RECORDS) throw new Error('Visual record budget exceeded');
      let ids = this.ids[layout.index]; if (!ids) { ids = new WeakMap(); this.ids[layout.index] = ids; }
      let id = ids.get(object); if (id === undefined) { id = this.nextId++; ids.set(object, id); }
      if (fastShapes) {
        if (layout === point) {
          const pt = object as { pos: Vector2; age: number; duration: number; baseWidth: number; currentWidth: number; u: number; alpha: number };
          const pos = pt.pos;
          if (pos && pos.constructor === Vector2 && typeof pt.age === 'number' && typeof pt.duration === 'number'
            && typeof pt.baseWidth === 'number' && typeof pt.currentWidth === 'number' && typeof pt.u === 'number' && typeof pt.alpha === 'number') {
            reserve(10);
            data[cursor++] = id; data[cursor++] = point.fullMask;
            data[cursor++] = pos.x; data[cursor++] = pos.y;
            data[cursor++] = pt.age; data[cursor++] = pt.duration;
            data[cursor++] = pt.baseWidth; data[cursor++] = pt.currentWidth;
            data[cursor++] = pt.u; data[cursor++] = pt.alpha;
            return;
          }
        } else if (layout === puff) {
          const pf = object as { offset: Vector2; velocity: Vector2; startSize: number; endSize: number; texture: number; rotation: number };
          const off = pf.offset, vel = pf.velocity;
          if (off && off.constructor === Vector2 && vel && vel.constructor === Vector2
            && typeof pf.startSize === 'number' && typeof pf.endSize === 'number' && typeof pf.texture === 'number' && typeof pf.rotation === 'number') {
            reserve(10);
            data[cursor++] = id; data[cursor++] = puff.fullMask;
            data[cursor++] = off.x; data[cursor++] = off.y;
            data[cursor++] = vel.x; data[cursor++] = vel.y;
            data[cursor++] = pf.startSize; data[cursor++] = pf.endSize;
            data[cursor++] = pf.texture; data[cursor++] = pf.rotation;
            return;
          }
        } else if (layout === contrail) {
          const ct = object as { pos: Vector2; vel: Vector2; life: number; maxLife: number; size: number; maxSize: number; alpha: number; rotation: number; color: number[] };
          const pos = ct.pos, vel = ct.vel, col = ct.color;
          if (pos && pos.constructor === Vector2 && vel && vel.constructor === Vector2
            && typeof ct.life === 'number' && typeof ct.maxLife === 'number' && typeof ct.size === 'number'
            && typeof ct.maxSize === 'number' && typeof ct.alpha === 'number' && typeof ct.rotation === 'number'
            && Array.isArray(col) && col.length === 3 && typeof col[0] === 'number' && typeof col[1] === 'number' && typeof col[2] === 'number') {
            reserve(15);
            data[cursor++] = id; data[cursor++] = contrail.fullMask;
            data[cursor++] = pos.x; data[cursor++] = pos.y;
            data[cursor++] = vel.x; data[cursor++] = vel.y;
            data[cursor++] = ct.life; data[cursor++] = ct.maxLife;
            data[cursor++] = ct.size; data[cursor++] = ct.maxSize;
            data[cursor++] = ct.alpha; data[cursor++] = ct.rotation;
            data[cursor++] = col[0]; data[cursor++] = col[1]; data[cursor++] = col[2];
            return;
          }
        }
      }
      write(id); const maskAt = cursor; write(0); let mask = 0, bit = 1;
      const schemaFields = layout.fields;
      for (let f = 0; f < schemaFields.length; f++) {
        const [key, type] = schemaFields[f];
        let state: number, value: unknown;
        if (fastShapes) {
          value = object[key];
          state = value !== undefined ? (value === null ? 3 : 1) : (Object.hasOwn(object, key) ? 2 : 0);
        } else {
          const present = enumerable.call(object, key);
          value = present ? dataValue(object, key) : undefined;
          state = !present ? 0 : value === undefined ? 2 : value === null ? 3 : 1;
        }
        mask += state * bit; bit *= 4;
        if (state !== 1) continue;
        if (type === 'n') number(value);
        else if (type === 's') text(value);
        else if (type === 'b') { if (typeof value !== 'boolean') unsupported(); write(Number(value)); }
        else if (type === 'id') { write(typeof value === 'number' ? 0 : 1); if (typeof value === 'number') number(value); else text(value); }
        else if (type === 'v') {
          if (!value || typeof value !== 'object' || (fastShapes ? (value as object).constructor !== Vector2 : Object.getPrototypeOf(value) !== Vector2.prototype)) unsupported();
          if (fastShapes) {
            number((value as Vector2).x); number((value as Vector2).y);
          } else {
            if (!enumerable.call(value, 'x') || !enumerable.call(value, 'y')) unsupported();
            let vKeys = 0;
            for (const k in value) if (enumerable.call(value, k)) vKeys++;
            if (vKeys !== 2) unsupported();
            number(dataValue(value, 'x')); number(dataValue(value, 'y'));
          }
        } else if (type === 'va') {
          if (!Array.isArray(value) || value.length > MAX_RECORDS) unsupported();
          if (!fastShapes) {
            let aKeys = 0;
            for (const k in value) if (enumerable.call(value, k)) aKeys++;
            if (aKeys !== value.length) unsupported();
          }
          write(value.length);
          for (let i = 0; i < value.length; i++) {
            const pt = fastShapes ? value[i] : (enumerable.call(value, String(i)) ? dataValue(value, String(i)) : unsupported());
            if (!pt || typeof pt !== 'object' || (fastShapes ? (pt as object).constructor !== Vector2 : Object.getPrototypeOf(pt) !== Vector2.prototype)) unsupported();
            if (fastShapes) {
              number((pt as Vector2).x); number((pt as Vector2).y);
            } else {
              if (!enumerable.call(pt, 'x') || !enumerable.call(pt, 'y')) unsupported();
              let vKeys = 0;
              for (const k in pt) if (enumerable.call(pt, k)) vKeys++;
              if (vKeys !== 2) unsupported();
              number(dataValue(pt, 'x')); number(dataValue(pt, 'y'));
            }
          }
        } else if (type === 'c3' || type === 'c4') {
          const length = type === 'c3' ? 3 : 4;
          if (!Array.isArray(value) || value.length !== length) unsupported();
          if (fastShapes) {
            for (let i = 0; i < length; i++) number(value[i]);
          } else {
            let cKeys = 0;
            for (const k in value) if (enumerable.call(value, k)) cKeys++;
            if (cKeys !== length) unsupported();
            for (let i = 0; i < length; i++) {
              const idx = i === 0 ? '0' : i === 1 ? '1' : i === 2 ? '2' : '3';
              if (!enumerable.call(value, idx)) unsupported();
              number(dataValue(value, idx));
            }
          }
        } else if (Array.isArray(type)) array(value, type[0]);
        else record(value, type as Schema);
      }
      data[maskAt] = mask;
    };
    const array = (value: unknown, layout: Schema) => {
      if (!Array.isArray(value) || value.length > MAX_RECORDS) unsupported();
      write(value.length); for (let i = 0; i < value.length; i++) record(value[i], layout);
    };
    for (let i = 0; i < collections.length; i++) {
      const [key, layout] = collections[i];
      const raw = view[key];
      const value = key === 'trailStrips' && !Array.isArray(raw) ? Array.from(view.trailStrips) : raw;
      const start = cursor, oldRecords = records;
      try { array(value, layout); fields.push(i); }
      catch (error) { if (!(error instanceof UnsupportedVisual)) throw error; cursor = start; records = oldRecords; }
    }
    this.lastCapacity = data.buffer.byteLength;
    return { buffer: data.buffer as ArrayBuffer, length: cursor, fields, strings };
  }
}

/** Validation runs before either graph or packed records can change. The apply pass
 * contains only bounded reads/copies; published arrays are stable display-owned data. */
export class PackedVisualDecoder {
  private pools = new Map<Schema, Map<number, RecordValue>>();
  private arrays = new Map<number, RecordValue[]>();
  validate(packet: PackedVisualPacket): void {
    if (!packet || !(packet.buffer instanceof ArrayBuffer) || !integer(packet.length) || packet.length > MAX_VALUES
      || packet.length * 8 > packet.buffer.byteLength || !Array.isArray(packet.fields) || packet.fields.length > collections.length
      || !Array.isArray(packet.strings) || packet.strings.length > MAX_VALUES) throw new Error('Invalid visual packet');
    let textLength = 0;
    for (const s of packet.strings) { if (typeof s !== 'string') throw new Error('Invalid visual string'); textLength += s.length; }
    if (textLength > MAX_VALUES) throw new Error('Visual string budget exceeded');
    const data = new Float64Array(packet.buffer, 0, packet.length);
    let cursor = 0, records = 0;
    const seen = new Map<number, Schema>();
    const read = () => { if (cursor >= data.length) throw new Error('Truncated visual data'); return data[cursor++]; };
    const text = () => { const id = read(); if (!integer(id) || id >= packet.strings.length) throw new Error('Invalid visual string index'); };
    const record = (layout: Schema): void => {
      const id = read(); let mask = read();
      if (!integer(id) || !id || !integer(mask) || mask >= 4 ** layout.fields.length || (seen.has(id) && seen.get(id) !== layout)) throw new Error('Invalid visual record');
      seen.set(id, layout);
      if (++records > MAX_RECORDS) throw new Error('Visual record budget exceeded');
      // Native trail points and puffs dominate row count. Their full layouts are
      // exactly eight Float64 values, with no strings, IDs or nested row bounds.
      if ((layout === point || layout === puff) && mask === (4 ** layout.fields.length - 1) / 3) {
        cursor += 8; if (cursor > data.length) throw new Error('Truncated visual data'); return;
      }
      for (const [, type] of layout.fields) {
        const state = mask % 4; mask = Math.floor(mask / 4); if (state !== 1) continue;
        if (type === 'n') read();
        else if (type === 's') text();
        else if (type === 'b') { const b = read(); if (b !== 0 && b !== 1) throw new Error('Invalid visual boolean'); }
        else if (type === 'id') { const tag = read(); if (tag === 0) read(); else if (tag === 1) text(); else throw new Error('Invalid visual ID'); }
        else if (type === 'v') { read(); read(); }
        else if (type === 'va') {
          const count = read();
          if (!integer(count) || count > MAX_RECORDS) throw new Error('Invalid visual vector array');
          cursor += count * 2;
          if (cursor > data.length) throw new Error('Truncated visual data');
        }
        else if (type === 'c3' || type === 'c4') { for (let i = 0; i < (type === 'c3' ? 3 : 4); i++) read(); }
        else if (Array.isArray(type)) array(type[0]);
        else record(type as Schema);
      }
    };
    const array = (layout: Schema) => { const count = read(); if (!integer(count) || count > MAX_RECORDS) throw new Error('Invalid visual count'); for (let i = 0; i < count; i++) record(layout); };
    let prior = -1;
    for (const field of packet.fields) { if (!integer(field) || field >= collections.length || field <= prior) throw new Error('Invalid visual collection'); prior = field; array(collections[field][1]); }
    if (cursor !== data.length) throw new Error('Trailing visual data');
  }
  /** Caller must validate before mutating any presentation state. */
  applyValidated(packet: PackedVisualPacket, view: CombatRenderView): void {
    const data = new Float64Array(packet.buffer, 0, packet.length), next = new Map<Schema, Map<number, RecordValue>>();
    let cursor = 0;
    const record = (layout: Schema): RecordValue => {
      const id = data[cursor++]; let mask = data[cursor++];
      let pool = next.get(layout); if (!pool) { pool = new Map(); next.set(layout, pool); }
      const target = pool.get(id) ?? this.pools.get(layout)?.get(id) ?? {};
      pool.set(id, target);
      if (mask === (4 ** layout.fields.length - 1) / 3) {
        if (layout === point) {
          const pos = target.pos instanceof Vector2 ? target.pos : new Vector2();
          pos.x = data[cursor++]; pos.y = data[cursor++]; target.pos = pos;
          target.age = data[cursor++]; target.duration = data[cursor++]; target.baseWidth = data[cursor++];
          target.currentWidth = data[cursor++]; target.u = data[cursor++]; target.alpha = data[cursor++];
          return target;
        }
        if (layout === puff) {
          const offset = target.offset instanceof Vector2 ? target.offset : new Vector2();
          const velocity = target.velocity instanceof Vector2 ? target.velocity : new Vector2();
          offset.x = data[cursor++]; offset.y = data[cursor++]; target.offset = offset;
          velocity.x = data[cursor++]; velocity.y = data[cursor++]; target.velocity = velocity;
          target.startSize = data[cursor++]; target.endSize = data[cursor++];
          target.texture = data[cursor++]; target.rotation = data[cursor++];
          return target;
        }
      }
      for (const [key, type] of layout.fields) {
        const state = mask % 4; mask = Math.floor(mask / 4);
        if (state === 0) { if (Object.hasOwn(target, key)) delete target[key]; continue; }
        if (state !== 1) { target[key] = state === 2 ? undefined : null; continue; }
        if (type === 'n') target[key] = data[cursor++];
        else if (type === 's') target[key] = packet.strings[data[cursor++]];
        else if (type === 'b') target[key] = data[cursor++] === 1;
        else if (type === 'id') target[key] = data[cursor++] === 0 ? data[cursor++] : packet.strings[data[cursor++]];
        else if (type === 'v') {
          const v = target[key] instanceof Vector2 ? target[key] as Vector2 : new Vector2();
          v.x = data[cursor++]; v.y = data[cursor++]; target[key] = v;
        } else if (type === 'va') {
          const arr = Array.isArray(target[key]) ? target[key] as Vector2[] : [];
          const length = data[cursor++]; arr.length = length;
          for (let i = 0; i < length; i++) {
            const v = arr[i] instanceof Vector2 ? arr[i] : new Vector2();
            v.x = data[cursor++]; v.y = data[cursor++]; arr[i] = v;
          }
          target[key] = arr;
        } else if (type === 'c3' || type === 'c4') {
          const v = Array.isArray(target[key]) ? target[key] as number[] : [];
          const length = type === 'c3' ? 3 : 4; v.length = length; for (let i = 0; i < length; i++) v[i] = data[cursor++]; target[key] = v;
        } else if (Array.isArray(type)) target[key] = array(type[0], target[key]);
        else target[key] = record(type as Schema);
      }
      return target;
    };
    const array = (layout: Schema, existing?: unknown): RecordValue[] => {
      const target = Array.isArray(existing) ? existing : [], length = data[cursor++]; target.length = length;
      for (let i = 0; i < length; i++) target[i] = record(layout); return target;
    };
    const arrays = new Map<number, RecordValue[]>();
    for (const field of packet.fields) {
      const [key, layout] = collections[field], value = array(layout, this.arrays.get(field));
      arrays.set(field, value); (view as unknown as RecordValue)[key] = value;
    }
    this.pools = next; this.arrays = arrays;
  }
}
export function omitPackedVisuals(view: Record<string, unknown>, packet: PackedVisualPacket): void {
  for (const field of packet.fields) view[collections[field][0]] = null;
}

export const packedVisualFields = collections.map(([key]) => key);
