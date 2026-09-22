import { Vector2 } from '../../math/Vector2';
import type { CombatRenderView } from '../../render/CombatRenderView';

// Explicit visual read records. No AI, gameplay callbacks, RNG or authority writes.
// Every field of these native visual types is retained, including optional values.
type FieldType = 'n' | 's' | 'b' | 'id' | 'v' | 'c3' | 'c4' | Schema | readonly [Schema];
interface Schema { fields: readonly (readonly [string, FieldType])[]; keys: ReadonlySet<string> }
const schema = (fields: readonly (readonly [string, FieldType])[]): Schema => {
  if (fields.length > 26) throw new Error('Visual presence mask exceeds exact integer precision');
  return { fields, keys: new Set(fields.map(([key]) => key)) };
};
const particle = schema([['pos','v'],['vel','v'],['life','n'],['maxLife','n'],['size','n'],['color','c3'],['alpha','n'],['material','s'],['startSize','n'],['endSize','n'],['peakAlpha','n'],['rampUpFraction','n'],['fadeOutFraction','n'],['drag','n'],['rotation','n'],['angularVel','n'],['stretch','n']]);
const contrail = schema([['pos','v'],['vel','v'],['life','n'],['maxLife','n'],['size','n'],['maxSize','n'],['alpha','n'],['rotation','n'],['color','c3']]);
const muzzle = schema([['pos','v'],['vel','v'],['size','n'],['life','n'],['maxLife','n'],['color','c4'],['blendMode','s']]);
const glow = schema([['id','n'],['pos','v'],['vel','v'],['diameter','n'],['life','n'],['maxLife','n'],['peakAlpha','n'],['color','c3']]);
const point = schema([['pos','v'],['age','n'],['duration','n'],['baseWidth','n'],['currentWidth','n'],['u','n'],['alpha','n']]);
const strip = schema([['stripId','id'],['points',[point]],['color','c4'],['blendMode','s'],['widenMult','n'],['minSeg','n'],['isDetached','b'],['accumU','n']]);
const puff = schema([['offset','v'],['velocity','v'],['startSize','n'],['endSize','n'],['texture','n'],['rotation','n']]);
const flash = schema([['diameter','n'],['coreDiameter','n'],['color','c3'],['duration','n'],['velocity','v']]);
const flare = schema([['width','n'],['height','n'],['color','c3'],['velocity','v']]);
const explosion = schema([['id','n'],['visualKind','s'],['sourceShipId','s'],['sourceAuthored','b'],['puffs',[puff]],['puffDuration','n'],['flash',flash],['flare',flare],['pos','v'],['radius','n'],['maxRadius','n'],['life','n'],['maxLife','n'],['frame','n'],['rotation','n'],['color','c3'],['hasShockwaveRing','b'],['shockwaveRadius','n'],['maxShockwaveRadius','n'],['clusterSeed','n'],['debrisCount','n'],['smokeDensity','n'],['fireballScale','n']]);
const collections = [
  ['particles',particle], ['contrails',contrail], ['muzzleParticles',muzzle], ['hitGlows',glow],
  ['trailStrips',strip], ['explosions',explosion], ['localParticles',particle],
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
  private readonly ids = new Map<Schema, WeakMap<object, number>>();
  private nextId = 1;
  capture(view: CombatRenderView, recycled?: ArrayBuffer): PackedVisualPacket {
    let data = new Float64Array(recycled && recycled.byteLength >= 8192 && recycled.byteLength % 8 === 0 && recycled.byteLength <= MAX_VALUES * 8 ? recycled : new ArrayBuffer(8192));
    let cursor = 0, records = 0;
    const strings: string[] = [], stringIds = new Map<string, number>(), fields: number[] = [];
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
      if (!v || typeof v !== 'object' || Object.getPrototypeOf(v) !== Object.prototype) unsupported();
      const object = v as RecordValue, keys = Object.keys(object);
      if (keys.some(key => !layout.keys.has(key))) unsupported();
      if (++records > MAX_RECORDS) throw new Error('Visual record budget exceeded');
      let ids = this.ids.get(layout); if (!ids) { ids = new WeakMap(); this.ids.set(layout, ids); }
      let id = ids.get(object); if (id === undefined) { id = this.nextId++; ids.set(object, id); }
      write(id); const maskAt = cursor; write(0); let mask = 0, bit = 1;
      for (const [key, type] of layout.fields) {
        const present = enumerable.call(object, key);
        const value = present ? dataValue(object, key) : undefined;
        const state = !present ? 0 : value === undefined ? 2 : value === null ? 3 : 1;
        mask += state * bit; bit *= 4;
        if (state !== 1) continue;
        if (type === 'n') number(value);
        else if (type === 's') text(value);
        else if (type === 'b') { if (typeof value !== 'boolean') unsupported(); write(Number(value)); }
        else if (type === 'id') { write(typeof value === 'number' ? 0 : 1); if (typeof value === 'number') number(value); else text(value); }
        else if (type === 'v') {
          if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Vector2.prototype || Object.keys(value).length !== 2) unsupported();
          number(dataValue(value, 'x')); number(dataValue(value, 'y'));
        } else if (type === 'c3' || type === 'c4') {
          const length = type === 'c3' ? 3 : 4;
          if (!Array.isArray(value) || value.length !== length || Object.keys(value).length !== length) unsupported();
          for (let i = 0; i < length; i++) number(dataValue(value, String(i)));
        } else if (Array.isArray(type)) array(value, type[0]);
        else record(value, type as Schema);
      }
      data[maskAt] = mask;
    };
    const array = (value: unknown, layout: Schema) => {
      if (!Array.isArray(value) || value.length > MAX_RECORDS) unsupported();
      write(value.length); for (const item of value) record(item, layout);
    };
    for (let i = 0; i < collections.length; i++) {
      const [key, layout] = collections[i], value = key === 'trailStrips' ? Array.from(view[key]) : view[key];
      const start = cursor, oldRecords = records;
      try { array(value, layout); fields.push(i); }
      catch (error) { if (!(error instanceof UnsupportedVisual)) throw error; cursor = start; records = oldRecords; }
    }
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
