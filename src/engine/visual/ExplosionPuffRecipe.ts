import { Vector2 } from '../math/Vector2';
import { SimulationRandom } from '../simulation/SimulationRandom';
import type { ExplosionPuff } from '../simulation/CombatTypes';

/** Versioned deterministic puff recipe. World RNG is still consumed by the
 * original factory; this merely remembers its starting cursor for presentation. */
export type ExplosionPuffRecipe = [number, number, number, number, number, number];
export const MAX_RECIPE_PUFFS = 256;
const enabled = new WeakSet<SimulationRandom>();
const entries = new WeakMap<ExplosionPuff[], { recipe: ExplosionPuffRecipe; values: Float64Array; members: object[][] }>();
const fromAngle = Vector2.fromAngle, clone = Vector2.prototype.clone, add = Vector2.prototype.add;
const reserve = SimulationRandom.prototype.reserveSamples;
const puffKeys = ['texture', 'startSize', 'endSize', 'rotation', 'offset', 'velocity'];
export const explosionPuffCount = (diameter: number): number => Math.ceil(Math.max(5, Math.pow(diameter / 2 / ((20 + 60 * diameter / 500) * .66), 2) * 6));
export function enableExplosionPuffRecipes(random: SimulationRandom): void { enabled.add(random); }

function exactData(object: object, keys: readonly string[]): Record<string, PropertyDescriptor> | null {
  const fields = Object.getOwnPropertyDescriptors(object);
  if (Reflect.ownKeys(fields).length !== keys.length || keys.some(k => !fields[k] || !Object.hasOwn(fields[k], 'value') || !fields[k].enumerable)) return null;
  return fields;
}
function vector(value: unknown): [number, number] | null {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Vector2.prototype) return null;
  const fields = exactData(value, ['x', 'y']);
  if (!fields || ![fields.x.value, fields.y.value].every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e9)) return null;
  return [fields.x.value, fields.y.value];
}
export function beginExplosionPuffRecipe(diameter: number, random: SimulationRandom, rings: boolean, velocity: Vector2): ExplosionPuffRecipe | null {
  if (!enabled.has(random) || Vector2.fromAngle !== fromAngle || Vector2.prototype.clone !== clone || Vector2.prototype.add !== add
    || typeof diameter !== 'number' || !Number.isFinite(diameter) || diameter <= 0 || diameter > 1e6 || typeof rings !== 'boolean') return null;
  const v = vector(velocity), cursor = v ? reserve.call(random, 0) : null;
  return v && cursor !== null && cursor <= 1e18 ? [1, diameter, cursor, rings ? 1 : 0, v[0], v[1]] : null;
}
const invalidData = Symbol('not-data');
// The captured intrinsic checks for accessors without allocating a descriptor
// object for every scalar on every frame. Call only on known factory-owned
// objects/array entries; replacements are rejected by identity below.
const lookupGetter = (Object.prototype as unknown as { __lookupGetter__(key: string): unknown }).__lookupGetter__;
function dataValue(object: object, key: string): unknown {
  return lookupGetter.call(object, key) === undefined ? (object as Record<string, unknown>)[key] : invalidData;
}
function exactKeys(object: object, keys: readonly string[]): boolean {
  const own = Object.keys(object);
  return own.length === keys.length && keys.every((key, i) => key === own[i]);
}
function fingerprint(puffs: ExplosionPuff[], expected?: Float64Array, members?: object[][]): Float64Array | null {
  if (Object.getPrototypeOf(puffs) !== Array.prototype || Reflect.ownKeys(puffs).length !== puffs.length + 1
    || !puffs.length || puffs.length > MAX_RECIPE_PUFFS || (expected && expected.length !== puffs.length * 8)) return null;
  const values = expected ?? new Float64Array(puffs.length * 8);
  let at = 0;
  const number = (v: unknown): boolean => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return false;
    if (expected && !Object.is(v, expected[at])) return false;
    if (!expected) values[at] = v;
    at++; return true;
  };
  for (let i = 0; i < puffs.length; i++) {
    const puff = dataValue(puffs, String(i));
    if (!puff || typeof puff !== 'object' || (members && puff !== members[i][0]) || Object.getPrototypeOf(puff) !== Object.prototype || !exactKeys(puff, puffKeys)) return null;
    for (let k = 0; k < 4; k++) if (!number(dataValue(puff, puffKeys[k]))) return null;
    for (let k = 0; k < 2; k++) {
      const v = dataValue(puff, k ? 'velocity' : 'offset');
      if (!v || typeof v !== 'object' || (members && v !== members[i][k + 1]) || Object.getPrototypeOf(v) !== Vector2.prototype || !exactKeys(v, ['x', 'y'])
        || !number(dataValue(v, 'x')) || !number(dataValue(v, 'y'))) return null;
    }
  }
  return values;
}
export function rememberExplosionPuffs(puffs: ExplosionPuff[], recipe: ExplosionPuffRecipe | null): void {
  if (!recipe || puffs.length !== explosionPuffCount(recipe[1])) return;
  const values = fingerprint(puffs);
  if (values) entries.set(puffs, { recipe, values, members: puffs.map(p => [p, p.offset, p.velocity]) });
}
/** Revalidate because mods may edit/reorder particles after creation. No freezing
 * or changed getter reads: mutated/custom arrays fall back to ordinary capture. */
export function explosionPuffRecipe(puffs: unknown[]): ExplosionPuffRecipe | null {
  const entry = entries.get(puffs as ExplosionPuff[]);
  if (!entry) return null;
  if (!fingerprint(puffs as ExplosionPuff[], entry.values, entry.members)) { entries.delete(puffs as ExplosionPuff[]); return null; }
  return entry.recipe.slice() as ExplosionPuffRecipe;
}
