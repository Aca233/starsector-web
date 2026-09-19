import { compactProjectileColumns, projectileColumnPlan } from "./ProjectileColumns";
import { CombatFXSystem } from "../engine/simulation/systems/CombatFXSystem";
import { explosionPuffRecipe, explosionPuffCount } from "../engine/visual/ExplosionPuffRecipe";
import { EXPLOSION_PUFF_KEYS, ExplosionPuffDecoder, puffRecipeBudget, reservePuffRecipe } from "./ExplosionPuffCodec";
import type { PuffRecipeBudget } from "./ExplosionPuffCodec";
import { CombatEngine } from "../engine/simulation/CombatEngine";
import { Ship } from "../engine/simulation/Ship";
import { Vector2 } from "../engine/math/Vector2";
import { ShipDamageState } from "../engine/simulation/ShipDamageState";
import { ShipWeaponControlSystem } from "../engine/simulation/systems/ShipWeaponControlSystem";
import { EngineController } from "../engine/simulation/systems/EngineController";
import { canRetainSnapshotTargets } from "./SnapshotTargetRetention";
import type { ShipSpec } from "../engine/content/ShipSpec";
import { validateShipSpec } from "../engine/modding/ContentValidation";
import type { Seat } from "./protocol";

/** P1 presentation projection, NOT a resumable simulation checkpoint. Static specs and executable hooks remain local. */
const SKIP = new Set([
  "__proto__",
  "prototype",
  "constructor",
  "spec",
  "moduleMount",
  "definition",
  "auxiliary", // Immutable skill composition is reconstructed from the local spec, not recursively sent.
  "hullStats",
  "random",
  "visualRandom",
  "autofire",
  "combatShips",
  "currentTargetShip",
  "tacticalAI",
  "fireControlWorld",
  "statusEffects",
  "damageTakenModifiers",
  "externalPhaseEffects",
  "deployedWingCraft",
  "lowCRDamageSequence",
]);
type Wire = any;
/** Each snapshot carries its own field dictionary: reconnect never needs a baseline. */
class SnapshotLayouts {
  readonly puffBudget = puffRecipeBudget();
  // Frame-owned, immutable wire marker; decoded viewer objects are never shared.
  readonly absent = Object.freeze({ $undefined: 1 });
  constructor(readonly compactPuffs = false, readonly compactProjectiles = false) {}
  readonly keys: string[][] = [];
  private byFirst = new Map<string, Map<number, number[]>>();
  record(keys: string[], values: Wire[]): Wire | null {
    if (keys.length < 6 || keys.length > 2048) return null;
    let byLength = this.byFirst.get(keys[0]);
    let candidates = byLength?.get(keys.length);
    for (const id of candidates ?? []) {
      const known = this.keys[id];
      let equal = true;
      for (let i = 0; i < keys.length; i++) if (known[i] !== keys[i]) { equal = false; break; }
      if (equal) return { $record: id, values };
    }
    if (this.keys.length >= 1024 || keys.some(key => key.length > 256)) return null;
    // Compare interned field names instead of JSON-stringifying a shape for every
    // projectile/particle. Bucketing is only an index; equality checks every key.
    if (!byLength) this.byFirst.set(keys[0], byLength = new Map());
    if (!candidates) byLength.set(keys.length, candidates = []);
    const id = this.keys.length;
    this.keys.push(keys); candidates.push(id);
    return { $record: id, values };
  }
}
interface DecodeLayouts { keys: string[][]; puffDecoder: ExplosionPuffDecoder; puffBudget: PuffRecipeBudget }
function snapshotLayouts(value: unknown, puffDecoder: ExplosionPuffDecoder): DecodeLayouts {
  if (value === undefined) value = [];
  if (!Array.isArray(value) || value.length > 1024) throw Error('Invalid snapshot layouts');
  for (const keys of value) {
    if (!Array.isArray(keys) || keys.length > 2048 || keys.some(key => typeof key !== 'string' || key.length > 256 || SKIP.has(key)) || new Set(keys).size !== keys.length)
      throw Error('Invalid snapshot layout keys');
  }
  return { keys: value, puffDecoder, puffBudget: puffRecipeBudget() };
}
// Projection is path-scoped: an unrelated "cells"/"armor"/"healthTracker" is never filtered.
enum CaptureProjection { None, Ship, World, Damage, WeaponControl, EngineControl, Weapons, Engines, Projectiles, Weapon, Engine, Projectile, FX, Explosions, Explosion, ExplosionPuffs }
const capturePrototypes: object[] = [
  Object.prototype, Ship.prototype, Object.prototype, ShipDamageState.prototype,
  ShipWeaponControlSystem.prototype, EngineController.prototype, Array.prototype,
  Array.prototype, Array.prototype, Object.prototype, Object.prototype, Object.prototype,
  CombatFXSystem.prototype, Array.prototype, Object.prototype, Array.prototype,
];
// Full generic reads/recursion below are retained even for omitted fields, so
// accessor scans are unnecessary. Only the path and exact prototype limit projection.
function nativeCaptureProjection(value: object, projection: CaptureProjection): CaptureProjection {
  return projection && Object.getPrototypeOf(value) === capturePrototypes[projection]
    ? projection : CaptureProjection.None;
}
function captureChildProjection(projection: CaptureProjection, key: string): CaptureProjection {
  switch (projection) {
    case CaptureProjection.Ship:
      if (key === 'damageDecals') return CaptureProjection.Damage;
      if (key === 'weaponControl') return CaptureProjection.WeaponControl;
      if (key === 'engineController') return CaptureProjection.EngineControl;
      break;
    case CaptureProjection.World:
      if (key === 'projectiles') return CaptureProjection.Projectiles;
      if (key === 'fxSystem') return CaptureProjection.FX;
      break;
    case CaptureProjection.FX:
      if (key === 'explosions') return CaptureProjection.Explosions;
      break;
    case CaptureProjection.Explosion:
      if (key === 'puffs') return CaptureProjection.ExplosionPuffs;
      break;
    case CaptureProjection.WeaponControl:
      if (key === 'weapons') return CaptureProjection.Weapons;
      break;
    case CaptureProjection.EngineControl:
      if (key === 'engines') return CaptureProjection.Engines;
      break;
  }
  return CaptureProjection.None;
}
function omitCapturedField(projection: CaptureProjection, key: string): boolean {
  switch (projection) {
    case CaptureProjection.Damage: return key === 'armor' || key === 'cells' || key === 'armorRevision';
    case CaptureProjection.Weapon:
    case CaptureProjection.Engine: return key === 'healthTracker';
    case CaptureProjection.Projectile:
      return key === 'spawnLocation' || key === 'sourceDamageMultiplier'
        || key === 'passThroughMissiles' || key === 'passThroughFighters'
        || key === 'passThroughFightersOnlyWhenDestroyed' || key === 'mirv' || key === 'proximityFuse';
    default: return false;
  }
}
function pack(value: any, seen: object[], refs: Map<string, Ship>, layouts: SnapshotLayouts, plain = false, projection = CaptureProjection.None): Wire {
  if (value === undefined) return layouts.compactProjectiles ? layouts.absent : { $undefined: 1 };
  if (typeof value === "number" && !Number.isFinite(value)) return { $number: String(value) };
  if (value === null || typeof value !== "object") return typeof value === "function" ? { $undefined: 1 } : value;
  if (value instanceof Ship && !plain) { refs.set(value.id, value); return { $ship: value.id }; }
  if (value instanceof Vector2) return { $vector: [value.x, value.y] };
  if (ArrayBuffer.isView(value)) return { $typed: value.constructor.name, values: Array.from(value as any) };
  if (projection === CaptureProjection.ExplosionPuffs && layouts.compactPuffs && Array.isArray(value)) {
    const recipe = explosionPuffRecipe(value);
    if (recipe && reservePuffRecipe(layouts.puffBudget, explosionPuffCount(recipe[1]))) return { $explosionPuffs: recipe };
  }
  // Only ancestors can form a cycle. A short path stack avoids Set add/delete
  // churn for every record, while repeated non-cyclic references still expand.
  if (seen.includes(value)) return { $undefined: 1 };
  seen.push(value);
  let result: Wire;
  if (value instanceof Map) result = { $map: [...value.entries()].map(([k, v]) => [pack(k, seen, refs, layouts), pack(v, seen, refs, layouts)]) };
  else if (value instanceof Set) result = { $set: [...value].map(v => pack(v, seen, refs, layouts)) };
  else if (Array.isArray(value)) {
    const memberProjection = projection === CaptureProjection.Weapons ? CaptureProjection.Weapon
      : projection === CaptureProjection.Engines ? CaptureProjection.Engine
      : projection === CaptureProjection.Projectiles ? CaptureProjection.Projectile
      : projection === CaptureProjection.Explosions ? CaptureProjection.Explosion : CaptureProjection.None;
    // Custom array classes/mappers retain their original generic traversal.
    const nativeMembers = memberProjection && Object.getPrototypeOf(value) === Array.prototype && !Object.hasOwn(value, 'map');
    const rows: Wire[] = nativeMembers
      ? value.map(v => pack(v, seen, refs, layouts, false, memberProjection))
      : value.map(v => pack(v, seen, refs, layouts));
    // Factor identical fields before text/binary encoding, after all original
    // getter/Proxy reads and Ship-reference discovery. No generic traversal is
    // skipped or cached, and no temporal snapshot baseline is introduced.
    const columns = projection === CaptureProjection.Projectiles && nativeMembers && layouts.compactProjectiles
      ? compactProjectileColumns(rows, layouts.keys) : null;
    if (columns) { seen.pop(); return columns; }
    const id = rows[0]?.$record;
    let shared = rows.length > 1 && Number.isInteger(id);
    if (shared) for (const row of rows) if (row?.$record !== id) { shared = false; break; }
    if (shared) {
      // Homogeneous particles/projectiles share one record envelope. Reuse the
      // packed array, preserving row order and every value without a frame baseline.
      for (let i = 0; i < rows.length; i++) rows[i] = rows[i].values;
      result = { $records: id, values: rows };
    } else result = rows;
  }
  else {
    // Keep the two read passes (including getter order), but avoid allocating
    // callbacks and recursively dispatching every scalar in particle/ship rows.
    // Compact this fresh key array, not the source object. Still read every
    // allowed property in the first pass before packing any in the second.
    const keys = Object.keys(value);
    if (projection) projection = nativeCaptureProjection(value, projection);
    let count = 0;
    for (const key of keys) {
      if (!SKIP.has(key) && typeof value[key] !== 'function') keys[count++] = key;
    }
    if (count !== keys.length) keys.length = count;
    const values: Wire[] = new Array(keys.length);
    for (let i = 0; i < keys.length; i++) {
      const field = value[keys[i]];
      values[i] = field === null || typeof field === 'string' || typeof field === 'boolean'
        || (typeof field === 'number' && Number.isFinite(field))
        ? field : pack(field, seen, refs, layouts, false, captureChildProjection(projection, keys[i]));
    }
    // Deliberately finish BOTH original read passes and recursive packing before
    // omission. Getter/Proxy reads, cycles, exceptions and Ship-reference discovery
    // must not disappear just because a field is simulation-only. This conservative
    // projection reduces payload, not the cost of visiting the omitted subtrees.
    if (projection === CaptureProjection.Damage || projection === CaptureProjection.Weapon
      || projection === CaptureProjection.Engine || projection === CaptureProjection.Projectile) {
      let kept = 0;
      for (let i = 0; i < keys.length; i++) if (!omitCapturedField(projection, keys[i])) {
        keys[kept] = keys[i]; values[kept++] = values[i];
      }
      keys.length = values.length = kept;
    }
    result = plain ? null : layouts.record(keys, values);
    if (!result) { result = {}; for (let i = 0; i < keys.length; i++) result[keys[i]] = values[i]; }
  }
  seen.pop();
  return result;
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
function unpackRecord(values: Wire[], keys: string[], output: any, ships: Map<string, Ship>, layouts: DecodeLayouts, depth: number) {
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i], value = values[i], previous = output[key];
    if (depth > 64) throw Error("Snapshot nesting exceeds limit");
    output[key] = value === null || typeof value !== 'object' ? value : unpack(value, previous, ships, layouts, depth);
  }
}
function unpack(
  value: Wire,
  target: any,
  ships: Map<string, Ship>,
  layouts: DecodeLayouts,
  depth = 0,
): any {
  if (depth > 64) throw Error("Snapshot nesting exceeds limit");
  if (value === null || typeof value !== "object") return value;
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
      const key = unpack(k, undefined, ships, layouts, depth + 1);
      retained.add(key);
      output.set(key, unpack(v, output.get(key), ships, layouts, depth + 1));
    }
    for (const key of output.keys()) if (!retained.has(key)) output.delete(key);
    return output;
  }
  if (value.$set) {
    const output = target instanceof Set ? target : new Set();
    output.clear();
    for (const v of value.$set) output.add(unpack(v, undefined, ships, layouts, depth + 1));
    return output;
  }
  if (Array.isArray(value)) {
    const output = Array.isArray(target) ? target : [];
    for (let i = 0; i < value.length; i++) {
      const item = value[i], previous = output[i];
      if (depth >= 64) throw Error("Snapshot nesting exceeds limit");
      output[i] = item === null || typeof item !== 'object' ? item : unpack(item, previous, ships, layouts, depth + 1);
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
  const output =
    target && typeof target === "object" && !Array.isArray(target)
      ? target
      : {};
  for (const [k, v] of Object.entries(value)) {
    if (SKIP.has(k)) continue;
    const previous = output[k];
    if (depth >= 64) throw Error("Snapshot nesting exceeds limit");
    output[k] = v === null || typeof v !== 'object' ? v : unpack(v, previous, ships, layouts, depth + 1);
  }
  return output;
}
/** Direct restoration: retain row/field write order and viewer-owned nested
 * objects, even for fields stored only once on the wire. Never alias templates
 * into the engine or assume a renderer/mod has not changed a prior value. */
function unpackProjectileColumns(value: Wire, target: any, ships: Map<string, Ship>, layouts: DecodeLayouts): any[] {
  const plan = projectileColumnPlan(value, layouts.keys);
  const output = Array.isArray(target) ? target : [];
  for (let i = 0; i < plan.rows.length; i++) {
    const row = plan.rows[i], previous = output[i];
    if (!Array.isArray(row)) { output[i] = unpack(row, previous, ships, layouts, 1); continue; }
    const template = plan.templates[row[0]];
    const record = previous && typeof previous === 'object' && !Array.isArray(previous) ? previous : {};
    for (let col = 0; col < template.keys.length; col++) {
      const key = template.keys[col], item = template.dynamic[col] ? row[template.dynamic[col]] : template.fixed[col], prior = record[key];
      record[key] = item === null || typeof item !== 'object' ? item : unpack(item, prior, ships, layouts, 2);
    }
    output[i] = record;
  }
  output.length = plan.rows.length;
  return output;
}
export interface CombatSound {
  id: number;
  key: string;
  volume: number;
  rate: number;
  pos?: [number, number];
}
export interface CombatSnapshot {
  /** Self-contained cosmetic spawn window; not a resumable physics checkpoint. */
  muzzleEvents?: import('./muzzle-events.mjs').MuzzleEventBatch;
  sounds?: CombatSound[];
  deployment?: import("../engine/simulation/CombatDeployment").DeploymentState;
  tick: number;
  acknowledged: Record<Seat, number>;
  ships: Array<{ id: string; state: Wire }>;
  crafts: Array<{ id: string; kind: "fighter" | "bomber" | "drone" | "detached"; spec: number; state: Wire }>;
  craftSpecs: ShipSpec[];
  /** Lossless, self-contained field dictionary for nested presentation records. */
  layouts?: string[][];
  world: Wire;
  simulationMs: number;
  snapshotHz?: number;
  captureMs?: number;
  encodeMs?: number;
  /** Authority clock progress over wall time, including serialization/recovery. */
  realtimeRatio?: number;
  combatRate?: number;
}
const WORLD_KEYS = [
  "combatTime",
  "cameraShakeIntensity",
  "battleResult",
  "environment",
  "projectiles",
  "beams",
  "fxSystem",
  "contrailEngine",
  "asteroidSystem",
  "nebulaSystem",
  "mineSystem",
] as const;
export function captureCombat(
  engine: CombatEngine,
  tick: number,
  acknowledged: Record<Seat, number>,
  simulationMs: number,
  localContrails = false,
  compactPuffs = false,
  compactProjectiles = false,
): CombatSnapshot {
  const world: Record<string, unknown> = {};
  // Ribbons are client cosmetics in LAN. Keep the default projection available
  // for diagnostics/legacy capture; omission preserves the viewer's local engine.
  for (const k of WORLD_KEYS) if (k !== 'contrailEngine' || !localContrails) world[k] = engine[k];
  const capitals = new Set(engine.allCapitalShips);
  const refs = new Map(engine.ships.map(ship => [ship.id, ship]));
  const layouts = new SnapshotLayouts(compactPuffs, compactProjectiles);
  // Root ship/world fields remain named for server validation and playback clocks.
  // Enumerate ship roots directly; nested Ship values still become references.
  const project = (value: unknown, projection = CaptureProjection.Ship) => pack(value, [], refs, layouts, true, projection);
  // A reserve cannot change in simulation. Its frozen match loadout is already present on viewers;
  // avoid resending every inactive weapon/controller/component at snapshot frequency.
  const ships = engine.allCapitalShips.map(ship => ({id:ship.id,state:project(engine.deployment.isReserve(ship.id)
    ? {id:ship.id,teamId:ship.teamId,isPlayer:ship.isPlayer,hullHp:ship.hullHp,currentCR:ship.currentCR,isDead:ship.isDead,isRetreated:ship.isRetreated}
    : ship)}));
  const projectedWorld = project(world, CaptureProjection.World);
  const craftSpecs: ShipSpec[] = [], specs = new Map<string,number>();
  const specObjects = new Map<ShipSpec, number>();
  const fighterSet = new Set(engine.fighters), bomberSet = new Set(engine.bombers), droneSet = new Set(engine.droneSystem.drones);
  const crafts: CombatSnapshot['crafts'] = [];
  // Packing a hull/FX may discover a detached craft still referenced by wrecks or launchers.
  for (const ship of refs.values()) {
    if (capitals.has(ship)) continue;
    let spec = specObjects.get(ship.spec);
    if (spec === undefined) {
      const signature = JSON.stringify(ship.spec);
      spec = specs.get(signature);
      if (spec === undefined) {spec=craftSpecs.length;specs.set(signature,spec);craftSpecs.push(ship.spec);}
      specObjects.set(ship.spec, spec);
    }
    const kind = fighterSet.has(ship) ? 'fighter' : bomberSet.has(ship) ? 'bomber' : droneSet.has(ship) ? 'drone' : 'detached';
    crafts.push({id:ship.id,kind,spec,state:project(ship)});
  }
  return {tick,acknowledged,simulationMs,ships,crafts,craftSpecs,layouts:layouts.keys,world:projectedWorld, ...(engine.deployment.enabled ? {deployment:engine.deployment.snapshot()} : {})};
}
const puffDecoders = new WeakMap<CombatEngine, ExplosionPuffDecoder>();
const displayCrafts = new WeakMap<CombatEngine, Map<string, Ship>>();
const validatedSpecs = new WeakMap<CombatEngine, Set<string>>();
const displayTicks = new WeakMap<CombatEngine, number>();
// Only native roster accessors may share membership within this synchronous apply.
// A custom targeting method is still called normally; never cache its result.
const restoreFindHostile = CombatEngine.prototype.findHostile;
const restoreRosterReaders = ['allCapitalShips', 'capitalShips', 'combatShips', 'ships']
  .map(key => [key, Object.getOwnPropertyDescriptor(CombatEngine.prototype, key)?.get] as const);
function canShareRestoreRoster(engine: CombatEngine): boolean {
  return Object.getPrototypeOf(engine) === CombatEngine.prototype
    && restoreRosterReaders.every(([key, getter]) => !Object.hasOwn(engine, key)
      && Object.getOwnPropertyDescriptor(CombatEngine.prototype, key)?.get === getter);
}
export interface CombatSnapshotBatchOptions {
  /** Opt in ONLY for a locally constructed, non-Proxy native engine/Ship graph.
   * Every endpoint re-audits native methods, plain targeting fields and immutable
   * specs; unsupported hooks/data or ANY invalid retained target use the original
   * full query loop. No state is cached across afterApply callbacks. JavaScript
   * cannot detect transparent Proxies, so callers unable to guarantee their absence
   * must leave this off. Wire frames still receive the normal full validation. */
  nativeTargeting?: boolean;
}

/**
 * Apply SnapshotPlayback's ordered endpoints (normally 0..2), without dropping any.
 * `resetInterpolation` applies to EVERY endpoint, just like the single-frame loop.
 * `afterApply` runs synchronously after each full restore and before the next one;
 * keep per-endpoint prediction handling there. Event payloads are not consumed by
 * this API: preserve the caller's sound/muzzle receive path (do not double-replay).
 * In particular, do not defer MotionPrediction.receive until the final endpoint:
 * its teleport detection needs each authoritative player position, not just the ack.
 * Empty input is a no-op. Errors propagate immediately, retaining the same applied
 * prefix / callback ordering as consecutive applyCombatSnapshot calls.
 *
 * Deliberately retain the full first restore for now. `unpack` merges sparse fields,
 * craft constructors need the first endpoint's specs/carrier state, and native
 * findHostile retains the intermediate target. Even first-only craft can survive
 * through retained world references. A pose-only first restore is not equivalent.
 * With nativeTargeting explicitly enabled, only redundant native target scans are
 * elided, after a fresh whole-roster purity/eligibility audit at each endpoint.
 */
export function applyCombatSnapshots(
  engine: CombatEngine,
  frames: readonly CombatSnapshot[],
  resetInterpolation = false,
  afterApply?: (frame: CombatSnapshot) => void,
  options?: CombatSnapshotBatchOptions,
): void {
  for (const frame of frames) {
    restoreCombatSnapshot(engine, frame, resetInterpolation, options?.nativeTargeting === true);
    afterApply?.(frame);
  }
}

/** Retains existing Ship/component prototypes and static definitions. Never calls fixedUpdate on a guest. */
export function applyCombatSnapshot(
  engine: CombatEngine,
  frame: CombatSnapshot,
  resetInterpolation = false,
) {
  restoreCombatSnapshot(engine, frame, resetInterpolation, false);
}

function restoreCombatSnapshot(
  engine: CombatEngine,
  frame: CombatSnapshot,
  resetInterpolation: boolean,
  nativeTargeting: boolean,
) {
  if (
    !frame ||
    !Number.isSafeInteger(frame.tick) ||
    !Array.isArray(frame.ships) ||
    frame.ships.length !== engine.allCapitalShips.length ||
    new Set(frame.ships.map((row) => row.id)).size !== frame.ships.length
  )
    throw Error("Invalid combat snapshot");
  if (!Array.isArray(frame.crafts) || !Array.isArray(frame.craftSpecs))
    throw Error('Invalid dynamic craft snapshot');
  let puffDecoder = puffDecoders.get(engine);
  if (!puffDecoder) { puffDecoder = new ExplosionPuffDecoder(); puffDecoders.set(engine, puffDecoder); }
  const layouts = snapshotLayouts(frame.layouts, puffDecoder);
  const previousTick = displayTicks.get(engine);
  const continuous = !resetInterpolation && previousTick !== undefined && frame.tick > previousTick && frame.tick - previousTick <= 60;
  // Arrays are unpacked/reused by index, but projectiles are identified by ID.
  // Copy endpoints before unpack mutates/reorders the display objects.
  const projectilePoses = new Map(continuous ? engine.projectiles.map(p => [p.id, {
    pos: p.pos.clone(), tail: p.ballisticTail?.clone(), fade: p.fadeProgress,
  }] as const) : []);
  const capitals = canShareRestoreRoster(engine) ? engine.allCapitalShips : undefined;
  const ships = new Map((capitals ?? engine.allCapitalShips).map((s) => [s.id, s]));
  const capitalSet = capitals ? new Set(capitals) : undefined;
  const previous = displayCrafts.get(engine) ?? new Map([...engine.combatShips.filter(s=>s.isAttachedModule),...engine.fighters,...engine.bombers,...engine.droneSystem.drones].map(s=>[s.id,s]));
  const cache = validatedSpecs.get(engine) ?? new Set<string>();
  for (const spec of frame.craftSpecs) {
    const signature=JSON.stringify(spec);
    if (!cache.has(signature)) {
      validateShipSpec(spec,{allowExistingId:true,requireBundledAssets:true});
      if(cache.size>512)cache.clear();
      cache.add(signature);
    }
  }
  validatedSpecs.set(engine,cache);
  const next = new Map<string,Ship>();
  for (const row of frame.crafts) {
    if (typeof row.id !== 'string' || row.id.length > 256 || ships.has(row.id) || !['fighter','bomber','drone','detached'].includes(row.kind) || !Number.isInteger(row.spec) || !frame.craftSpecs[row.spec]) throw Error('Invalid craft identity');
    const spec=frame.craftSpecs[row.spec];
    const carrierId=row.state?.sourceCarrier?.$ship;
    const carrier=carrierId ? ships.get(carrierId) : undefined;
    const ship=previous.get(row.id) ?? new Ship(row.id,spec,!!row.state?.isPlayer,new Vector2(),0,undefined,undefined,carrier);
    ships.set(row.id,ship);next.set(row.id,ship);
  }
  const fighters:Ship[]=[], bombers:Ship[]=[], drones:Ship[]=[];
  for (const row of frame.crafts) {
    const ship=ships.get(row.id)!;
    if(row.kind==='fighter')fighters.push(ship);
    if(row.kind==='bomber')bombers.push(ship);
    if(row.kind==='drone')drones.push(ship);
  }
  engine.fighters.splice(0,engine.fighters.length,...fighters);
  engine.bombers.splice(0,engine.bombers.length,...bombers);
  engine.droneSystem.drones.splice(0,engine.droneSystem.drones.length,...drones);
  displayCrafts.set(engine,next);
  for (const row of [...frame.ships,...frame.crafts]) {
    const ship = ships.get(row.id);
    if (!ship) throw Error("Unknown ship");
    const wasReserve=engine.deployment.isReserve(ship.id);
    const pos = ship.pos.clone(),
      angle = ship.facingRad,
      teleportSequence = ship.teleportSequence;
    unpack(row.state, ship, ships, layouts);
    const snap = !continuous || wasReserve || ship.teleportSequence !== teleportSequence || (!(capitalSet ? capitalSet.has(ship) : engine.allCapitalShips.includes(ship)) && !previous.has(ship.id));
    ship.prevPos = snap ? ship.pos.clone() : pos;
    ship.prevFacingRad = snap ? ship.facingRad : angle;
  }
  // Only permit presentation fields, never methods or subsystem ownership from the wire.
  for (const key of WORLD_KEYS)
    if (Object.hasOwn(frame.world, key))
      (engine as any)[key] = key === "projectiles" && frame.world[key] && Object.hasOwn(frame.world[key], "$projectileColumns")
        ? unpackProjectileColumns(frame.world[key], engine[key], ships, layouts)
        : unpack(frame.world[key], engine[key], ships, layouts);
  for (const p of engine.projectiles) {
    const prior = projectilePoses.get(p.id);
    p.prevPos = prior?.pos ?? p.pos.clone();
    if (p.ballisticTail) p.prevBallisticTail = prior?.tail ?? p.ballisticTail.clone();
    p.prevFadeProgress = prior?.fade ?? p.fadeProgress;
  }
  displayTicks.set(engine, frame.tick);
  if (engine.deployment.enabled) { if (!frame.deployment) throw Error("Missing deployment snapshot"); engine.deployment.applySnapshot(frame.deployment); }
  for (const root of capitals ?? engine.allCapitalShips) for (const parent of root.assemblyShips) {
    parent.childModules.forEach((child, index) => { child.parentShip = parent; child.moduleMount = parent.spec.modules?.[index] ?? null; });
  }
  const activeShips = engine.ships;
  const retainTargets = nativeTargeting && !!capitals
    && canRetainSnapshotTargets(engine, ships, activeShips, restoreFindHostile);
  for (const ship of ships.values()) {
    ship.combatShips = activeShips;
    if (ship.fireControlMode === 'MANUAL') {
      ship.currentTargetShip = ships.get(ship.playerTargetId ?? '') ?? null;
    } else if (!retainTargets) {
      // Read even an accessor-backed override exactly once, preserving receiver
      // and the original one-argument call for custom/proxied targeting functions.
      const findHostile = engine.findHostile;
      ship.currentTargetShip = capitals && findHostile === restoreFindHostile
        ? Reflect.apply(findHostile, engine, [ship, undefined, activeShips]) ?? null
        : Reflect.apply(findHostile, engine, [ship]) ?? null;
    }
  }
}
