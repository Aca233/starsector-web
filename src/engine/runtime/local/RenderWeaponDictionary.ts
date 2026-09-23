import { immutableCopy } from '../../extensions/Immutable';
import type { RenderWeaponSpec } from '../../render/ShipRenderState';
import type { WeaponSpec } from '../../simulation/Weapon';

const fields = ['id', 'spawnType', 'isRocket', 'isBeam', 'hardpointUsesHullSprite',
  'turretSpriteUrl', 'hardpointSpriteUrl', 'hardpointGunSpriteUrl', 'turretGunSpriteUrl',
  'glowSpriteUrl', 'hardpointGlowSpriteUrl', 'mountSize', 'visualRecoil', 'renderBarrelBelow',
  'weaponType', 'animationType', 'projSpeed', 'projSpriteUrl', 'beamEffect', 'onHitEffect',
  'everyFrameEffect'] as const satisfies readonly (keyof RenderWeaponSpec)[];
const childFields = ['onHitEffect', 'turretSpriteUrl', 'turretGunSpriteUrl', 'hardpointSpriteUrl',
  'hardpointGunSpriteUrl', 'glowSpriteUrl', 'hardpointGlowSpriteUrl', 'projSpriteUrl'] as const;
type Scalar = string | number | boolean | null | undefined;
interface Interned { key: string; spec: RenderWeaponSpec }
interface SourceSample { values: Scalar[]; changed: boolean; entry?: Interned }
const colorAt = fields.length;
const mirvAt = colorAt + 6; // state, length, four optional channels
const childAt = mirvAt + 2; // MIRV state, child state
const state = (value: unknown) => value === undefined ? 0 : value === null ? 1 : 2;
function store(sample: SourceSample, index: number, value: unknown): void {
  const type = typeof value;
  if (value !== null && type !== 'undefined' && type !== 'string' && type !== 'number' && type !== 'boolean')
    throw new Error('Unsupported non-scalar weapon presentation field');
  if (!Object.is(sample.values[index], value)) sample.changed = true;
  sample.values[index] = value as Scalar;
}
/** Used only when a source changes. Markers cannot collide with scalar strings,
 * and -0/NaN/infinities must not collapse to 0/null in an intern key. */
function signature(values: Scalar[]): string {
  return JSON.stringify(values, (_key, value) => value === undefined ? ['undefined']
    : typeof value === 'number' && Object.is(value, -0) ? ['-0']
      : typeof value === 'number' && !Number.isFinite(value) ? ['number', String(value)] : value);
}
function createSpec(values: Scalar[]): RenderWeaponSpec {
  const spec: Record<string, unknown> = {};
  for (let i = 0; i < fields.length; i++) spec[fields[i]] = values[i];
  spec.glowColor = values[colorAt] === 0 ? undefined : values[colorAt] === 1 ? null
    : values.slice(colorAt + 2, colorAt + 2 + (values[colorAt + 1] as number));
  let child: Record<string, unknown> | null | undefined;
  if (values[mirvAt + 1] === 1) child = null;
  else if (values[mirvAt + 1] === 2) {
    child = {};
    for (let i = 0; i < childFields.length; i++) child[childFields[i]] = values[childAt + i];
  }
  spec.mirv = values[mirvAt] === 0 ? undefined : values[mirvAt] === 1 ? null : { childProjectile: child };
  // This assertion is solely the typed construction of the declared data schema;
  // no narrowed record is cast back to an executable simulation object.
  return immutableCopy(spec) as RenderWeaponSpec;
}

/** An epoch-local dictionary of copied renderer data, never of mutable authority specs.
 * Each source is sampled on every call. Unchanged sources allocate no projection graph,
 * and equal copies share an immutable metadata entry, regardless of their source object identities.
 * begin/finish bound strong intern retention to the publication's reachable specs. */
export class RenderWeaponDictionary {
  private readonly sources = new WeakMap<WeaponSpec, SourceSample>();
  private retained = new Map<string, Interned>();
  private live = new Map<string, Interned>();
  begin(): void { this.live.clear(); }
  finish(): void {
    const old = this.retained;
    this.retained = this.live;
    this.live = old;
    this.live.clear();
  }
  get size(): number { return this.retained.size; }
  project(source: WeaponSpec): RenderWeaponSpec {
    let sample = this.sources.get(source);
    if (!sample) { sample = { values: [], changed: true }; this.sources.set(source, sample); }
    sample.changed = !sample.entry;
    for (let i = 0; i < fields.length; i++) store(sample, i, source[fields[i]]);
    const color = source.glowColor;
    if (color != null && (!Array.isArray(color) || color.length > 4))
      throw new Error('Unsupported weapon presentation color');
    store(sample, colorAt, state(color));
    store(sample, colorAt + 1, color?.length ?? 0);
    for (let i = 0; i < 4; i++) store(sample, colorAt + 2 + i, color?.[i]);
    const mirv = source.mirv, child = mirv?.childProjectile;
    store(sample, mirvAt, state(mirv));
    store(sample, mirvAt + 1, state(child));
    for (let i = 0; i < childFields.length; i++) store(sample, childAt + i, child?.[childFields[i]]);
    const key = sample.changed ? signature(sample.values) : sample.entry!.key;
    // Retained entries store the canonical key too, so thousands of equal sources
    // don't retain separate copies of the serialized key string.
    const entry = this.live.get(key) ?? this.retained.get(key)
      ?? (!sample.changed ? sample.entry! : { key, spec: createSpec(sample.values) });
    sample.entry = entry;
    this.live.set(entry.key, entry);
    return entry.spec;
  }
}
