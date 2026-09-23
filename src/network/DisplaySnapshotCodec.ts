import { Vector2 } from '../engine/math/Vector2';
import { PackedSnapshotNumbers } from './PackedSnapshotNumbers.mjs';
import { DynamicParticleDecoder, PARTICLE_RECIPE_LIMITS, particleRecipeBudget, type ParticleRecipeBudget } from '../engine/visual/DynamicParticleRecipe';
import { ExplosionPuffDecoder, EXPLOSION_PUFF_KEYS, puffRecipeBudget, type PuffRecipeBudget } from './ExplosionPuffCodec';
import { projectileColumnPlan } from './ProjectileColumns';
import { displayRecordRestorer, type DisplayRecordRestore } from './DisplayRecordRestore.generated';
type Wire=any;
const SKIP=new Set(['__proto__','prototype','constructor']);
export interface DisplayDecodeLayouts {
 keys:string[][]; records:Map<readonly string[],DisplayRecordRestore>; puffDecoder:ExplosionPuffDecoder;puffBudget:PuffRecipeBudget;
 particleDecoder:DynamicParticleDecoder;particleBudget:ParticleRecipeBudget; }
type DecodeLayouts=DisplayDecodeLayouts;
export function displayLayouts(value:unknown,puffDecoder:ExplosionPuffDecoder,particleDecoder:DynamicParticleDecoder):DisplayDecodeLayouts {
 if(value===undefined)value=[];
 if(!Array.isArray(value)||value.length>1024)throw Error('Invalid display layouts');
 for(const keys of value)if(!Array.isArray(keys)||keys.length>2048||keys.some(key=>typeof key!=='string'||key.length>256||SKIP.has(key))||new Set(keys).size!==keys.length)throw Error('Invalid display layout keys');
 const records=new Map<readonly string[],DisplayRecordRestore>();
 for(const keys of value){const restore=displayRecordRestorer(keys);if(restore)records.set(keys,restore);}
 return {keys:value,records,puffDecoder,puffBudget:puffRecipeBudget(),particleDecoder,particleBudget:particleRecipeBudget()};
}
export function assertDataField(target:object,key:string):void {
 if(SKIP.has(key))throw Error('Invalid display property');
 for(let owner:any=target;owner;owner=Object.getPrototypeOf(owner)) {
  const property=Object.getOwnPropertyDescriptor(owner,key);
  if(!property)continue;
  if(typeof property.value==='function'||property.get||property.set)throw Error('Display data shadows a read capability: '+key);
  break;
 }
}
const typed: Record<string, any> = {
  Float32Array,
  Float64Array,
  Uint8Array,
  Uint8ClampedArray,
  Uint16Array,
  Uint32Array,
  Int8Array,
  Int16Array,
  Int32Array,
};
/** Copy scalar record fields directly; only tagged/structured values need recursive decoding.
 * Keep the same depth budget even for primitives at the final level. */
function unpackRecord(values: Wire[], keys: string[], output: any, ships: Map<string, object>, layouts: DecodeLayouts, depth: number) {
  const fixed=layouts.records.get(keys);
  if(fixed){fixed(values,output,ships,layouts,depth,unpackDisplay,assertDataField);return;}
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i], value = values[i];
    if (depth > 64) throw Error("Snapshot nesting exceeds limit");

    assertDataField(output,key);
    const previous = output[key];
    output[key] = value === null || typeof value !== 'object' ? value : unpackDisplay(value, previous, ships, layouts, depth);
  }
}
export function unpackDisplay(
  value: Wire,
  target: any,
  ships: Map<string, object>,
  layouts: DecodeLayouts,
  depth = 0,
): any {
  if (depth > 64) throw Error("Snapshot nesting exceeds limit");
  if (value === null || typeof value !== "object") return value;
  if(Object.hasOwn(value,'$component'))throw Error('Simulation component envelopes are not a display protocol');
  if (Object.hasOwn(value, '$record')) {
    const keys = Number.isInteger(value.$record) && value.$record >= 0 ? layouts.keys[value.$record] : undefined;
    if (!keys || !Array.isArray(value.values) || value.values.length !== keys.length) throw Error('Invalid snapshot record');
    const output = target && typeof target === 'object' && !Array.isArray(target) ? target : {};
    unpackRecord(value.values, keys, output, ships, layouts, depth + 1);
    return output;
  }
  if (value.$undefined) return undefined;
  if (value.$ship) {
    const ship = ships.get(value.$ship);
    if (!ship) throw Error("Unknown snapshot ship");
    return ship;
  }
  if (value.$vector) {
    if (
      !Array.isArray(value.$vector) ||
      value.$vector.length !== 2 ||
      !value.$vector.every(Number.isFinite)
    )
      throw Error("Invalid vector");
    return target instanceof Vector2
      ? target.set(value.$vector[0], value.$vector[1])
      : new Vector2(value.$vector[0], value.$vector[1]);
  }
  if (value.$number)
    return value.$number === "Infinity"
      ? Infinity
      : value.$number === "-Infinity"
        ? -Infinity
        : NaN;
  if (value.$typed) {
    if (value.values instanceof PackedSnapshotNumbers) {
      if (!Object.hasOwn(typed, value.$typed) || value.$typed !== value.values.type)
        throw Error("Invalid typed array");
      const block = value.values;
      const output = target instanceof typed[value.$typed] && target.length === block.length
        ? target : new typed[value.$typed](block.length);
      block.copyNumbersTo(output); return output;
    }
    if (!Object.hasOwn(typed, value.$typed) || !Array.isArray(value.values))
      throw Error("Invalid typed array");
    if (target instanceof typed[value.$typed] && target.length === value.values.length) {
      target.set(value.values);
      return target;
    }
    return new typed[value.$typed](value.values);
  }
  if (value.$map) {
    const output = target instanceof Map ? target : new Map();
    const retained = new Set();
    for (const [k, v] of value.$map) {
      const key = unpackDisplay(k, undefined, ships, layouts, depth + 1);
      retained.add(key);
      output.set(key, unpackDisplay(v, output.get(key), ships, layouts, depth + 1));
    }
    for (const key of output.keys()) if (!retained.has(key)) output.delete(key);
    return output;
  }
  if (value.$set) {
    const output = target instanceof Set ? target : new Set();
    output.clear();
    for (const v of value.$set) output.add(unpackDisplay(v, undefined, ships, layouts, depth + 1));
    return output;
  }
  if (Array.isArray(value)) {
    const output = Array.isArray(target) ? target : [];
    for (let i = 0; i < value.length; i++) {
      const item = value[i], previous = output[i];
      if (depth >= 64) throw Error("Snapshot nesting exceeds limit");
      output[i] = item === null || typeof item !== 'object' ? item : unpackDisplay(item, previous, ships, layouts, depth + 1);
    }
    output.length = value.length;
    return output;
  }
  // Batch detection comes after vectors/typed values: hot scalar records do not
  // pay another marker lookup for every coordinate in a particle trail.
  if (Object.hasOwn(value, '$records')) {
    const keys = Number.isInteger(value.$records) && value.$records >= 0 ? layouts.keys[value.$records] : undefined;
    if (!keys || !Array.isArray(value.values)) throw Error('Invalid snapshot records');
    const rows = value.values;
    if (rows.length && depth + 1 > 64) throw Error("Snapshot nesting exceeds limit");
    const output = Array.isArray(target) ? target : [];
    for (let row = 0; row < rows.length; row++) {
      const values = rows[row];
      if (!Array.isArray(values) || values.length !== keys.length) throw Error('Invalid snapshot record row');
      const previous = output[row];
      const record = previous && typeof previous === 'object' && !Array.isArray(previous) ? previous : {};
      unpackRecord(values, keys, record, ships, layouts, depth + 2);
      output[row] = record;
    }
    output.length = rows.length;
    return output;
  }
  if (Object.hasOwn(value, '$dynamicParticles')) {
    const data = value.$dynamicParticles;
    if (Object.keys(value).length !== 1 || !Array.isArray(data) || data.length !== 3 || (data[0] !== 1 && data[0] !== 2) || !Array.isArray(data[1]) || !Array.isArray(data[2])
        || data[1].length > PARTICLE_RECIPE_LIMITS.groups || data[2].length > PARTICLE_RECIPE_LIMITS.rows || depth + 3 > 64) throw Error('Invalid dynamic particle envelope');
    const output = Array.isArray(target) ? target : [], recipes = data[1], rows = data[2];
    if (layouts.particleBudget.groups + recipes.length > PARTICLE_RECIPE_LIMITS.groups) throw Error('Dynamic particle group budget exceeded');
    layouts.particleBudget.groups += recipes.length;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];let expanded: Wire;
      if (Array.isArray(row)) {
        if (row.length !== 4 || !Number.isSafeInteger(row[0]) || row[0] < 0 || row[0] >= recipes.length) throw Error('Invalid dynamic particle reference');
        if (!Array.isArray(row[3]) || (data[0] === 1 ? row[3].length !== 4 : row[3].length !== 4 && row[3].length !== 5)) throw Error('Missing authoritative particle motion');
        expanded = layouts.particleDecoder.expand(recipes[row[0]], row[1], row[2], layouts.particleBudget, row[3]);
      } else {
        if (!row || typeof row !== 'object' || Object.keys(row).length !== 1 || !Object.hasOwn(row,'raw')) throw Error('Invalid ordinary particle reference');
        expanded = row.raw;
      }
      output[i] = unpackDisplay(expanded, output[i], ships, layouts, depth + 3);
    }
    output.length = rows.length; return output;
  }
  // Like batched records, recipes are cold relative to vector decoding.
  if (Object.hasOwn(value, '$explosionPuffs')) {
    if (Object.keys(value).length !== 1) throw Error('Invalid explosion puff envelope');
    const rows = layouts.puffDecoder.expand(value.$explosionPuffs, layouts.puffBudget);
    if (depth + 2 > 64) throw Error('Snapshot nesting exceeds limit');
    const output = Array.isArray(target) ? target : [];
    for (let row = 0; row < rows.length; row++) {
      const previous = output[row];
      const record = previous && typeof previous === 'object' && !Array.isArray(previous) ? previous : {};
      unpackRecord(rows[row] as Wire[], EXPLOSION_PUFF_KEYS, record, ships, layouts, depth + 2);
      output[row] = record;
    }
    output.length = rows.length;
    return output;
  }
  if (['$d','$ds','$recordDelta','$recordDeltas'].some(key=>Object.hasOwn(value,key)))throw Error('Retired display encoding');
  const output =
    target && typeof target === "object" && !Array.isArray(target)
      ? target
      : {};
  for (const [k, v] of Object.entries(value)) {
    if (SKIP.has(k)) throw Error('Invalid display property');
    assertDataField(output,k);
    const previous = output[k];
    if (depth >= 64) throw Error("Snapshot nesting exceeds limit");
    output[k] = v === null || typeof v !== 'object' ? v : unpackDisplay(v, previous, ships, layouts, depth + 1);
  }
  return output;
}
/** Direct restoration: retain row/field write order and viewer-owned nested
 * objects, even for fields stored only once on the wire. Never alias templates
 * into the engine or assume a renderer/mod has not changed a prior value. */
export function unpackDisplayProjectiles(value: Wire, target: any, ships: Map<string, object>, layouts: DecodeLayouts): any[] {
  const plan = projectileColumnPlan(value, layouts.keys);
  const output = Array.isArray(target) ? target : [];
  for (let i = 0; i < plan.rows.length; i++) {
    const row = plan.rows[i], previous = output[i];
    if (!Array.isArray(row)) { output[i] = unpackDisplay(row, previous, ships, layouts, 1); continue; }
    const template = plan.templates[row[0]];
    const record = previous && typeof previous === 'object' && !Array.isArray(previous) ? previous : {};
    for (let col = 0; col < template.keys.length; col++) {
      const key = template.keys[col]; assertDataField(record,key); const item = template.dynamic[col] ? row[template.dynamic[col]] : template.fixed[col], prior = record[key];
      record[key] = item === null || typeof item !== 'object' ? item : unpackDisplay(item, prior, ships, layouts, 2);
    }
    output[i] = record;
  }
  output.length = plan.rows.length;
  return output;
}
