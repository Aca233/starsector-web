import { particleReferenceAngle, particleReferenceDrag, encodeParticleMotionResidual, decodeParticleMotionResidual, validateParticleMotion } from "./ParticleMotionReference.mjs";
import { generateParticleBurst, advanceRecipeParticle } from "./ParticleRecipeKernel";
import { Vector2 } from '../math/Vector2';
import { SimulationRandom } from '../simulation/SimulationRandom';
import { DEBRIS_TEXTURES } from '../assets/CombatFXAssets';
import type { Particle, DebrisParticle } from '../simulation/CombatTypes';
export type DynamicParticle = Particle | DebrisParticle;
export type ParticleRecipe = [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number
];
export const PARTICLE_RECIPE_LIMITS = { groups: 128, rows: 4096, steps: 256, work: 262144 } as const;
export interface ParticleRecipeBudget {
    rows: number;
    groups: number;
    work: number;
}
export const particleRecipeBudget = (): ParticleRecipeBudget => ({ rows: 0, groups: 0, work: 0 });
// Charge a self-contained frame for a COLD receiver, not the authority's warm
// replay cache. Joining/rewinding receivers must never reject a legal capture.
const captureGroups = new WeakMap<ParticleRecipeBudget, Map<Group, number>>();
const enabled = new WeakSet<SimulationRandom>();
const entries = new WeakMap<object, {
    group: Group;
    index: number;
    steps: number;
}>();
const clone = Vector2.prototype.clone, add = Vector2.prototype.add, scaled = Vector2.prototype.addScaled, scale = Vector2.prototype.scale, angle = Vector2.fromAngle;
const cursor = SimulationRandom.prototype.reserveSamples;
export function enableDynamicParticleRecipes(random: SimulationRandom) { enabled.add(random); }
const natives = () => Vector2.prototype.clone === clone && Vector2.prototype.add === add && Vector2.prototype.addScaled === scaled && Vector2.prototype.scale === scale && Vector2.fromAngle === angle;
function data(o: object, key: string) { const d = Object.getOwnPropertyDescriptor(o, key); return d && Object.hasOwn(d, 'value') && d.enumerable ? d : null; }
const num = (n: unknown, limit = 1e12): n is number => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= limit;
function vector(v: unknown): v is Vector2 { return !!v && typeof v === 'object' && Object.getPrototypeOf(v) === Vector2.prototype && Reflect.ownKeys(v).length === 2 && num(data(v, 'x')?.value, 1e9) && num(data(v, 'y')?.value, 1e9); }
export function beginParticleRecipe(kind: 0 | 1 | 2 | 3, random: SimulationRandom, pos: Vector2, p0: number, color: [
    number,
    number,
    number
] = [0, 0, 0], speed = 0, category = 0): ParticleRecipe | null {
    if (!enabled.has(random) || !natives() || !vector(pos) || !Array.isArray(color) || Object.getPrototypeOf(color) !== Array.prototype || Reflect.ownKeys(color).length !== 4 || color.length !== 3 || ![0, 1, 2].every(i => num(data(color, String(i))?.value)) || ![p0, speed, category].every(v => num(v)))
        return null;
    const seed = cursor.call(random, 0);
    if (seed === null || seed > 1e18)
        return null;
    const recipe: ParticleRecipe = [1, kind, seed, pos.x, pos.y, p0, color[0], color[1], color[2], speed, category];
    try {
        validateParticleRecipe(recipe);
        return recipe;
    }
    catch {
        return null;
    }
}
export function validateParticleRecipe(value: unknown): ParticleRecipe {
    if (!Array.isArray(value) || value.length !== 11 || !Array.from(value).every(v => num(v, 1e18)) || value[0] !== 1 || ![0, 1, 2, 3].includes(value[1]) || !Number.isInteger(value[2]) || value[2] < 0 || Math.abs(value[3]) > 1e9 || Math.abs(value[4]) > 1e9)
        throw Error('Invalid dynamic particle recipe');
    if (value[1] === 0 ? value[5] <= 0 || value[5] > 1e12 || value.slice(6).some(v => v !== 0) : !Number.isInteger(value[5]) || value[5] < 1 || value[5] > 128 || value.slice(6, 9).some(v => v < 0 || v > 255) || Math.abs(value[9]) > 1e9 || !Number.isInteger(value[10]) || value[10] < 0 || value[10] > 2)
        throw Error('Invalid dynamic particle parameters');
    if (value[1] >= 2 && (value[9] !== 0 || value[10] !== 0) || value[1] === 3 && value.slice(6, 9).some(v => v !== 0))
        throw Error('Invalid particle burst parameters');
    return value as ParticleRecipe;
}
/** Frozen v1 replay of the existing generators. Private RNG only; no engine/FX
 * callbacks, density selection, shader work or simulation updates are invoked. */
export function generateParticleRecipe(r: ParticleRecipe, reference = false): DynamicParticle[] {
    const random = SimulationRandom.fromCursor(r[2]), pos = new Vector2(r[3], r[4]);
    const fromAngle = reference ? (a: number, speed: number) => { const [x,y] = particleReferenceAngle(a,speed); return new Vector2(x,y); } : Vector2.fromAngle;
    if (r[1] === 0) {
        // Frozen armor replay for BOTH native eligibility and portable reference.
        // Future source-generator changes then fail exact eligibility instead of
        // silently diverging in size/color while only motion is corrected.
        let damage = Math.min(100, r[5]);
        if (damage < 10 && random.next() * 10 < damage) damage = 10;
        const out: Particle[] = [];
        for (let i = 0; i < Math.floor(damage / 10); i++) {
            const size = Math.floor(random.next() * 3 + 3);
            const offset = fromAngle(random.next() * Math.PI * 2, random.next() * 10);
            const vel = new Vector2(offset.x * 3 * random.next(), offset.y * 3 * random.next());
            out.push({pos:pos.clone().add(offset),vel,size,life:1,maxLife:1,color:[255,200,55],alpha:1,material:'SOURCE_SMOOTH'});
        }
        return out;
    }
    if (r[1] >= 2)
        return generateParticleBurst(r[1], random, pos, r[5], [r[6], r[7], r[8]], fromAngle);
    const list = [DEBRIS_TEXTURES.small, DEBRIS_TEXTURES.medium, DEBRIS_TEXTURES.large][r[10]]!, baseSize = [8, 12, 16][r[10]]!, maxLife = [1.4, 2.2, 3][r[10]]!, out: DebrisParticle[] = [];
    const color: [
        number,
        number,
        number
    ] = [r[6], r[7], r[8]];
    for (let i = 0; i < r[5]; i++) {
        const a = random.next() * Math.PI * 2, speed = (.35 + random.next() * .65) * r[9], size = baseSize * (.8 + random.next() * .4), isGlowing = random.next() > .35;
        const spriteUrl = list[Math.floor(random.next() * list.length)], shardColor: [
            number,
            number,
            number
        ] = isGlowing ? [255, Math.floor(160 + random.next() * 85), 80] : color;
        const life = maxLife * (.7 + random.next() * .4);
        out.push({ pos: pos.clone(), vel: fromAngle(a, speed), rotation: random.next() * Math.PI * 2, angularVel: (random.next() - .5) * 8, size, life, maxLife: life, color: shardColor, points: [], spriteUrl, isGlowing });
    }
    return out;
}
function advance(p: DynamicParticle, kind: number, integrateMotion: boolean, exp: (value: number) => number) {
    if (kind !== 1) {
        advanceRecipeParticle(p as Particle, integrateMotion, exp);
        return;
    }
    p.life -= 1 / 60;
    if (integrateMotion) p.pos.addScaled(p.vel, 1 / 60);
    {
        const d = p as DebrisParticle;
        if (integrateMotion) d.vel.scale(Math.max(0, 1 - (1 / 60) * .4));
        d.rotation += d.angularVel * (1 / 60);
    }
}
/** Cache belongs to one recipe; advancement never removes/reorders initial IDs. */
class Group {
    values: DynamicParticle[] | null = null;
    step = 0;
    reference: Group | null = null;
    residualSafe = false;
    private readonly exp: (value: number) => number;
    constructor(readonly recipe: ParticleRecipe, readonly integrateMotion = true, readonly portable = false) {
        // Frozen birth groups have at most 128 distinct drag inputs. Compute the
        // portable polynomial once per coefficient, not once per member-step.
        const coefficients = new Map<number, number>();
        this.exp = portable ? value => {
            const known = coefficients.get(value);
            if (known !== undefined) return known;
            const result = particleReferenceDrag(value);
            if (coefficients.size < 128) coefficients.set(value, result);
            return result;
        } : Math.exp;
    }
    at(steps: number, budget: ParticleRecipeBudget): DynamicParticle[] | null {
        if (!Number.isSafeInteger(steps) || steps < 0 || steps > PARTICLE_RECIPE_LIMITS.steps)
            return null;
        const advancing = !this.values || steps !== this.step;
        const count = this.recipe[1] === 0 ? 10 : this.recipe[5], from = this.values && steps >= this.step ? this.step : 0;
        const work = count * (steps - from + (!this.values || steps < this.step ? 1 : 0));
        if (budget.work + work > PARTICLE_RECIPE_LIMITS.work)
            return null;
        budget.work += work;
        if (!this.values || steps < this.step) {
            this.values = generateParticleRecipe(this.portable ? this.recipe.map(v => v === 0 ? 0 : v) as ParticleRecipe : this.recipe, this.portable);
            this.step = 0;
        }
        for (; this.step < steps; this.step++)
            for (const p of this.values)
                advance(p, this.recipe[1], this.integrateMotion, this.exp);
        if (advancing && this.integrateMotion && !this.portable) this.residualSafe = !this.recipe.some(v => Object.is(v, -0)) && !this.values.some(p => [p.pos.x,p.pos.y,p.vel.x,p.vel.y].some(v => Object.is(v, -0)));
        return this.values;
    }
}
export function rememberParticleRecipe(rows: DynamicParticle[], recipe: ParticleRecipe | null) {
    if (!recipe || rows.length > 128 || !rows.length)
        return;
    const group = new Group(recipe);
    rows.forEach((p, index) => entries.set(p, { group, index, steps: 0 }));
}
export function advanceParticleRecipe(p: DynamicParticle, dt: number) {
    const entry = entries.get(p);
    if (!entry)
        return;
    if (dt !== 1 / 60 || entry.steps >= PARTICLE_RECIPE_LIMITS.steps) {
        entries.delete(p);
        return;
    }
    entry.steps++;
}
function exact(a: unknown, b: unknown, depth = 0): boolean {
    if (typeof b !== 'object' || b === null)
        return Object.is(a, b);
    if (!a || typeof a !== 'object' || depth > 4 || Object.getPrototypeOf(a) !== Object.getPrototypeOf(b))
        return false;
    const keys = Reflect.ownKeys(b), actual = Reflect.ownKeys(a);
    if (keys.length !== actual.length || keys.some((k, i) => k !== actual[i]))
        return false;
    for (const k of keys) {
        const x = Object.getOwnPropertyDescriptor(a, k), y = Object.getOwnPropertyDescriptor(b, k);
        if (!x || !y || !Object.hasOwn(x, 'value') || !Object.hasOwn(y, 'value') || x.enumerable !== y.enumerable || !exact(x.value, y.value, depth + 1))
            return false;
    }
    return true;
}
export function particleRecipeRow(p: object, budget: ParticleRecipeBudget): {
    recipe: ParticleRecipe;
    index: number;
    steps: number;
    motion: number[];
} | null {
    const e = entries.get(p);
    if (!e || !natives())
        return null;
    let groups = captureGroups.get(budget);
    if (!groups)
        captureGroups.set(budget, groups = new Map());
    const previous = groups.get(e.group) ?? -1;
    // Custom callers may update only part of a birth group. Keep those rows raw
    // rather than making a decoder rewind repeatedly inside one cold frame.
    if (previous >= 0 && previous !== e.steps)
        return null;
    const count = e.group.recipe[1] === 0 ? 10 : e.group.recipe[5];
    const cost = count * Math.max(0, e.steps - previous);
    // Bound retained initial members as well as emitted survivors; otherwise
    // sparse, interleaved groups could thrash the decoder cache within one frame.
    if (previous < 0) {
        let retained = count;
        for (const g of groups.keys())
            retained += g.recipe[1] === 0 ? 10 : g.recipe[5];
        if (retained > PARTICLE_RECIPE_LIMITS.rows)
            return null;
    }
    if (budget.work + cost > PARTICLE_RECIPE_LIMITS.work)
        return null;
    const rows = e.group.at(e.steps, particleRecipeBudget());
    if (!rows)
        return null;
    budget.work += cost;
    groups.set(e.group, Math.max(previous, e.steps));
    if (!exact(p, rows[e.index])) {
        entries.delete(p);
        return null;
    }
    const source = p as DynamicParticle, motion = [source.pos.x, source.pos.y, source.vel.x, source.vel.y];
    if (!motion.every(v => num(v)))
        return null;
    // sin/cos/exp are implementation-approximated by ECMAScript. Node and
    // Chromium actually differ by ULPs: preserve every dependent state value.
    // Legacy absolute rows preserve existing direct-vs-JSON signed-zero behavior.
    // Select for the WHOLE birth group, never alternate decoder modes per row.
    if (!e.group.residualSafe) return { recipe: e.group.recipe, index: e.index, steps: e.steps, motion };
    e.group.reference ??= new Group(e.group.recipe, true, true);
    const reference = e.group.reference.at(e.steps, particleRecipeBudget())?.[e.index];
    if (!reference) return null;
    const compressed = encodeParticleMotionResidual(motion, [reference.pos.x, reference.pos.y, reference.vel.x, reference.vel.y]);
    return { recipe: e.group.recipe, index: e.index, steps: e.steps, motion: compressed };
}
/** Viewer-private replay cache with per-frame work/row budgets. Expanded wire
 * data is copied by the ordinary snapshot unpacker, never shared with a viewer. */
export class DynamicParticleDecoder {
    private groups = new Map<string, Group>();
    private retained = 0;
    stats() { return { groups: this.groups.size, particles: this.retained }; }
    private particle(recipe: unknown, index: number, steps: number, budget: ParticleRecipeBudget, motion?: unknown): DynamicParticle {
        const r = validateParticleRecipe(recipe);
        if (!Number.isSafeInteger(index) || index < 0 || index >= 128 || ++budget.rows > PARTICLE_RECIPE_LIMITS.rows)
            throw Error('Dynamic particle row budget exceeded');
        // Legacy absolute rows skip motion replay. Residual rows use the frozen
        // portable reference; only the corrected exact values leave this cache.
        const corrected = motion !== undefined;
        if (corrected) validateParticleMotion(motion);
        const residual = Array.isArray(motion) && motion.length === 5;
        const key = (residual ? 'r1:' : corrected ? 'c:' : 'u:') + r.map(v => Object.is(v, -0) ? '-0' : String(v)).join(',');
        let group = this.groups.get(key);
        if (!group) {
            const count = r[1] === 0 ? 10 : r[5];
            while (this.groups.size && (this.groups.size >= PARTICLE_RECIPE_LIMITS.groups || this.retained + count > PARTICLE_RECIPE_LIMITS.rows)) {
                const first = this.groups.keys().next().value!, old = this.groups.get(first)!;
                this.retained -= old.recipe[1] === 0 ? 10 : old.recipe[5];
                this.groups.delete(first);
            }
            group = new Group(r.slice() as ParticleRecipe, residual || !corrected, residual);
            this.groups.set(key, group);
            this.retained += count;
        }
        // Keep groups touched in this frame ahead of unused previous modes.
        this.groups.delete(key); this.groups.set(key, group);
        const rows = group.at(steps, budget), p = rows?.[index];
        if (!p)
            throw Error('Invalid dynamic particle row');
        return p;
    }
    expand(recipe: unknown, index: number, steps: number, budget: ParticleRecipeBudget, motion?: unknown): Record<string, unknown> {
        const p = this.particle(recipe, index, steps, budget, motion);
        const wire: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(p))
            wire[k] = v instanceof Vector2 ? { $vector: [v.x, v.y] } : Array.isArray(v) ? v.slice() : v;
        if (motion !== undefined) {
            const actual = decodeParticleMotionResidual(motion, [p.pos.x,p.pos.y,p.vel.x,p.vel.y]);
            wire.pos = { $vector: actual.slice(0, 2) };
            wire.vel = { $vector: actual.slice(2, 4) };
        }
        return wire;
    }
    /** Native DTO receiver only. Copy the private replay result straight into
     * viewer-owned rows, without constructing a tagged wire tree first. Never
     * expose replay objects: local visuals may mutate every restored field. */
    restoreInto(recipe: unknown, index: number, steps: number, budget: ParticleRecipeBudget,
        motion: unknown, target: unknown, depth: number): Record<string, unknown> {
        const p = this.particle(recipe, index, steps, budget, motion);
        const actual = motion === undefined ? null : decodeParticleMotionResidual(motion, [p.pos.x, p.pos.y, p.vel.x, p.vel.y]);
        if (depth > 64) throw Error('Snapshot nesting exceeds limit');
        const output = target && typeof target === 'object' && !Array.isArray(target)
            ? target as Record<string, unknown> : {};
        const fields = p as unknown as Record<string, unknown>;
        for (const key of Object.keys(fields)) {
            if (depth >= 64) throw Error('Snapshot nesting exceeds limit');
            const value = fields[key];
            if (value instanceof Vector2) {
                const offset = key === 'pos' ? 0 : 2;
                const x = actual ? actual[offset] : value.x, y = actual ? actual[offset + 1] : value.y;
                if (!Number.isFinite(x) || !Number.isFinite(y)) throw Error('Invalid vector');
                const previous = output[key];
                output[key] = previous instanceof Vector2 ? previous.set(x, y) : new Vector2(x, y);
            } else if (Array.isArray(value)) {
                // Generated recipes contain only numeric color/empty points
                // arrays. Preserve the old depth/error prefix and array identity.
                const previous = output[key], array = Array.isArray(previous) ? previous : [];
                for (let i = 0; i < value.length; i++) {
                    if (depth + 1 >= 64) throw Error('Snapshot nesting exceeds limit');
                    array[i] = value[i];
                }
                array.length = value.length; output[key] = array;
            } else if (!Object.is(output[key], value)) output[key] = value;
        }
        return output;
    }
}
