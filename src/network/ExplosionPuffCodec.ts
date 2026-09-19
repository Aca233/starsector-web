import { SimulationRandom } from '../engine/simulation/SimulationRandom';
import { Vector2 } from '../engine/math/Vector2';
import { createExplosionPuffs } from '../engine/visual/ExplosionVisuals';
import { explosionPuffCount, MAX_RECIPE_PUFFS } from '../engine/visual/ExplosionPuffRecipe';

export const EXPLOSION_PUFF_KEYS = ['texture', 'startSize', 'endSize', 'rotation', 'offset', 'velocity'];
export const MAX_FRAME_RECIPE_PUFFS = 8192, MAX_FRAME_PUFF_RECIPES = 512;
export interface PuffRecipeBudget { puffs: number; recipes: number }
export const puffRecipeBudget = (): PuffRecipeBudget => ({ puffs: 0, recipes: 0 });
export function reservePuffRecipe(budget: PuffRecipeBudget, count: number): boolean {
  if (count > MAX_FRAME_RECIPE_PUFFS - budget.puffs || budget.recipes >= MAX_FRAME_PUFF_RECIPES) return false;
  budget.puffs += count; budget.recipes++; return true;
}
function validate(value: unknown): number[] {
  if (!Array.isArray(value) || value.length !== 6 || Array.from(value).some(v => typeof v !== 'number' || !Number.isFinite(v))
    || value[0] !== 1 || value[1] <= 0 || value[1] > 1e6 || !Number.isInteger(value[2]) || value[2] < 0 || value[2] > 1e18
    || (value[3] !== 0 && value[3] !== 1) || Math.abs(value[4]) > 1e9 || Math.abs(value[5]) > 1e9) throw Error('Invalid explosion puff recipe');
  return value;
}
/** Per-viewer bounded cache. Templates stay private: unpack copies their values
 * into viewer-owned objects, so later visual/mod edits cannot poison the cache. */
export class ExplosionPuffDecoder {
  private entries = new Map<string, { wire: unknown[]; count: number }>();
  private retained = 0;
  get retainedPuffs(): number { return this.retained; }
  get retainedRecipes(): number { return this.entries.size; }
  expand(value: unknown, budget: PuffRecipeBudget): unknown[] {
    const recipe = validate(value), count = explosionPuffCount(recipe[1]);
    if (count > MAX_RECIPE_PUFFS || !reservePuffRecipe(budget, count)) throw Error('Explosion puff recipe budget exceeded');
    const key = recipe.map(v => Object.is(v, -0) ? '-0' : String(v)).join(',');
    const cached = this.entries.get(key);
    if (cached) { this.entries.delete(key); this.entries.set(key, cached); return cached.wire; }
    const puffs = createExplosionPuffs(recipe[1], SimulationRandom.fromCursor(recipe[2]), recipe[3] === 1, new Vector2(recipe[4], recipe[5]));
    // Existing JSON and SWF2 integer encoding canonicalize signed zero. Match
    // that wire contract rather than introducing -0 only on the recipe path.
    const n = (v: number) => v === 0 ? 0 : v;
    const wire = puffs.map(p => Object.freeze([p.texture, p.startSize, p.endSize, p.rotation,
      Object.freeze({ $vector: Object.freeze([n(p.offset.x), n(p.offset.y)]) }), Object.freeze({ $vector: Object.freeze([n(p.velocity.x), n(p.velocity.y)]) })]));
    while (this.entries.size && (this.entries.size >= 128 || this.retained + count > MAX_FRAME_RECIPE_PUFFS)) {
      const oldest = this.entries.keys().next().value!; this.retained -= this.entries.get(oldest)!.count; this.entries.delete(oldest);
    }
    Object.freeze(wire); this.entries.set(key, { wire, count }); this.retained += count;
    return wire;
  }
}
