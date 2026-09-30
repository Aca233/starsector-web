import { CapturedDisplayDefinition, DisplayDefinitionCapture, DisplayDefinitionRequest } from './display/DisplayDefinitionCapture';
import type { CombatSnapshot } from "./CombatSnapshot";
import { isImmutableMetadata } from "../engine/extensions/Immutable";
export type { CombatSnapshot, CombatSound } from "./CombatSnapshot";
import { lanControlledRoster } from './LanRosterIdentity';
import { LanShipProjection } from './display/LanShipProjection';
import type { CombatSnapshotTarget } from './CombatSnapshotTarget';
import { RecordDeltaCapture, RecordDeltaRestore } from './RecordDeltas';
import { FixedDisplayCapture, FixedDisplayRestore, fixedDisplayField, fixedDisplayStride } from './display/FixedDisplayRecords';
import type { DisplayRecordKind } from './display/FixedDisplayRecords';
import {HostCombatComponentEvents,CombatComponentEventReceiver} from './CombatComponentEvents';
import type {CombatComponentEvent,CombatComponentEventBatch} from './CombatComponentEvents';
import {ArmorGrid} from '../engine/simulation/ArmorGrid';
import {ComponentCapture,ComponentReceiver,sealShipComponents,sealComponentTree,resolveComponent} from './ComponentReplication';
import type {MutationJournal} from './MutationJournal';
import { ownedArmorGrid, captureArmorCells, restoreArmorCells } from './ArmorReplication';
import { PackedSnapshotNumbers } from './PackedSnapshotNumbers.mjs';
import { nativeRecordRestorer } from './NativeRecordRestore.generated';
import type { NativeRecordRestore } from './NativeRecordRestore.generated';
import { validateParticleEvents } from './particle-events.mjs';
import { particleRecipeRow, particleRecipeBudget, DynamicParticleDecoder, PARTICLE_RECIPE_LIMITS } from "../engine/visual/DynamicParticleRecipe";
import type { ParticleRecipeBudget, ParticleRecipe } from "../engine/visual/DynamicParticleRecipe";
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
const captureArrayMap = Array.prototype.map;
/** Each snapshot carries its own field dictionary: reconnect never needs a baseline. */
class SnapshotLayouts {
  // Frame-local only: dictionaries/record IDs and caller-owned packets never
  // leak into the next capture. Only immutableCopy-authored acyclic data qualify.
  readonly immutableRecords = new Map<object, Wire>();
  displayDefinitions?: DisplayDefinitionCapture;
  journal?: MutationJournal;
  display?: FixedDisplayCapture;
  recordDeltas?: RecordDeltaCapture;
  weaponPresentation = false;
  renderDamageMarks = false;
  readonly puffBudget = puffRecipeBudget();
  readonly particleBudget = particleRecipeBudget();
  // Frame-owned, immutable wire marker; decoded viewer objects are never shared.
  readonly absent = Object.freeze({ $undefined: 1 });
  constructor(readonly compactPuffs = false, readonly compactProjectiles = false, readonly nativeCapture = false, readonly compactParticles = false, readonly packedNumbers = false, dictionary?:SnapshotLayouts, readonly persistent=false) {
    if(dictionary){this.keys=dictionary.keys;this.byFirst=dictionary.byFirst;this.planned=dictionary.planned;}
  }
  readonly keys: string[][] = [];
  private planned = new Map<NativeCaptureShape, number>();
  recordPlanned(shape: NativeCaptureShape, values: Wire[]): Wire | null {
    if (shape.keys.length < 6) return null;
    const id = this.planned.get(shape);
    if (id !== undefined) return { $record: id, values };
    // A captured frame owns its dictionary; never expose mutable cached keys.
    const record = this.record(shape.keys.slice(), values);
    if (record) this.planned.set(shape, record.$record);
    return record;
  }
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
    if(this.persistent)Object.freeze(keys);
    this.keys.push(keys); candidates.push(id);
    return { $record: id, values };
  }
}
interface DecodeLayouts { recordDeltas?: RecordDeltaRestore; display?: FixedDisplayRestore; componentDefinitions?:Record<string,any>; components?: ComponentReceiver; nativeRecords?: Map<string[], NativeRecordRestore>; nativeDecode?: (value: Wire, previous: any, depth: number) => any; nativeProjection?: boolean; keys: string[][]; puffDecoder: ExplosionPuffDecoder; puffBudget: PuffRecipeBudget; particleDecoder: DynamicParticleDecoder; particleBudget: ParticleRecipeBudget }
function snapshotLayouts(value: unknown, puffDecoder: ExplosionPuffDecoder, particleDecoder: DynamicParticleDecoder): DecodeLayouts {
  if (value === undefined) value = [];
  if (!Array.isArray(value) || value.length > 1024) throw Error('Invalid snapshot layouts');
  for (const keys of value) {
    if (!Array.isArray(keys) || keys.length > 2048 || keys.some(key => typeof key !== 'string' || key.length > 256 || SKIP.has(key)) || new Set(keys).size !== keys.length)
      throw Error('Invalid snapshot layout keys');
  }
  return { keys: value, puffDecoder, puffBudget: puffRecipeBudget(), particleDecoder, particleBudget: particleRecipeBudget() };
}
// Projection is path-scoped: an unrelated "cells"/"armor"/"healthTracker" is never filtered.
enum CaptureProjection { None, Ship, World, Damage, WeaponControl, EngineControl, Weapons, Engines, Projectiles, Weapon, Engine, Projectile, FX, Explosions, Explosion, DynamicParticles, ExplosionPuffs, RenderDamage, DamageMarks, DamageMark }
const capturePrototypes: object[] = [
  Object.prototype, Ship.prototype, Object.prototype, ShipDamageState.prototype,
  ShipWeaponControlSystem.prototype, EngineController.prototype, Array.prototype,
  Array.prototype, Array.prototype, Object.prototype, Object.prototype, Object.prototype,
  CombatFXSystem.prototype, Array.prototype, Object.prototype, Array.prototype, Array.prototype,
  ShipDamageState.prototype, Array.prototype, Object.prototype,
];
// Path/prototype checks limit omissions. Generic capture still traverses omitted
// fields; only an explicit native-graph caller may skip them before packing.
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
      if (key === 'particles' || key === 'debris') return CaptureProjection.DynamicParticles;
      if (key === 'explosions') return CaptureProjection.Explosions;
      break;
    case CaptureProjection.Explosion:
      if (key === 'puffs') return CaptureProjection.ExplosionPuffs;
      break;
    case CaptureProjection.RenderDamage:
      if (key === 'marks') return CaptureProjection.DamageMarks;
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
// The authority AI/weapon tick owns these fields. No renderer, HUD, prediction
// or replica consumer reads them; presentation snapshots are NOT checkpoints.
const weaponAuthorityFields = new Set(["fireControl", "fireControlTargetShipId", "fireControlTargetProjectileId", "cycleTargetShipId", "cycleTargetProjectileId", "burstFluxReserved", "lifecycleDt", "aimIdleSeconds"]);
function omitCapturedField(projection: CaptureProjection, key: string, weaponPresentation = false): boolean {
  switch (projection) {
    case CaptureProjection.Ship: return key === 'prevPos' || key === 'prevFacingRad';
    case CaptureProjection.Damage:
    case CaptureProjection.RenderDamage: return key === 'armor' || key === 'cells' || key === 'armorRevision';
    case CaptureProjection.DamageMark: return key === 'heat' || key === 'justHit' || key === 'flash'
      || key === 'flashElapsed' || key === 'phase' || key === 'pulsePeriod';
    case CaptureProjection.Weapon: return key === 'healthTracker' || weaponPresentation && weaponAuthorityFields.has(key);
    case CaptureProjection.Engine: return key === 'healthTracker';
    case CaptureProjection.Projectile:
      return key === 'prevPos' || key === 'prevBallisticTail' || key === 'prevFadeProgress'
        || key === 'spawnLocation' || key === 'sourceDamageMultiplier'
        || key === 'passThroughMissiles' || key === 'passThroughFighters'
        || key === 'passThroughFightersOnlyWhenDestroyed' || key === 'mirv' || key === 'proximityFuse';
    default: return false;
  }
}
/** Field traversal plans, never value/snapshot caches. Weak identity ownership
 * cannot retain an engine. A bounded shape interner amortizes layout lookup for
 * the same native projectile/controller type across objects and frames. */
interface NativeCaptureShape { weaponPresentation: boolean; displayKind?: DisplayRecordKind; raw: string[]; projection: CaptureProjection; keys: string[]; children: CaptureProjection[]; indices: number[] }
const damageMarkKeys = ['cellIndex', 'localPos', 'opacity', 'intensity', 'heat', 'justHit', 'flash', 'flashElapsed', 'phase', 'pulsePeriod', 'size', 'rotationRad', 'kind', 'variant'];
const nativeCaptureShapes = new WeakMap<object, NativeCaptureShape>();
const nativeDamageCaptureShapes = new WeakMap<object, NativeCaptureShape>();
// Separate optional-layout caches: toggling a transport must not evict the
// ordinary plan (including paired A/B captures of the same authority object).
const nativeDisplayCaptureShapes = new WeakMap<object, NativeCaptureShape>();
const nativeWeaponCaptureShapes = new WeakMap<object, NativeCaptureShape>();
const internedCaptureShapes = new Map<string, NativeCaptureShape>();
const capturePlansEnabled = import.meta.env.VITE_LAN_CAPTURE_PLANS !== 'false';
const nativeCapturePlanCounts = { hits: 0, compiled: 0, fallbacks: 0 };
/** Cumulative Worker-local plan work, not received Hz or saved network bytes. */
export function capturePlanDiagnostics() {
  return {enabled: capturePlansEnabled, ...nativeCapturePlanCounts, shapes: internedCaptureShapes.size};
}
function nativeCaptureShape(value: object, raw: string[], projection: CaptureProjection, displayKind?: DisplayRecordKind, weaponPresentation = false): NativeCaptureShape | null {
  weaponPresentation = weaponPresentation && projection === CaptureProjection.Weapon;
  const cache = projection === CaptureProjection.RenderDamage || projection === CaptureProjection.DamageMark ? nativeDamageCaptureShapes : weaponPresentation ? nativeWeaponCaptureShapes : displayKind ? nativeDisplayCaptureShapes : nativeCaptureShapes;
  const prior = cache.get(value);
  if (prior && prior.projection === projection && prior.weaponPresentation === weaponPresentation && prior.displayKind === displayKind && prior.raw.length === raw.length) {
    let same = true;
    for (let i = 0; i < raw.length; i++) if (raw[i] !== prior.raw[i]) { same = false; break; }
    if (same) { nativeCapturePlanCounts.hits++; return prior; }
  }
  // Unusual/custom wide shapes use the established path, not an unbounded cache.
  if (raw.length > 256 || raw.some(key => key.length > 128)) { nativeCapturePlanCounts.fallbacks++; return null; }
  const signature = projection + ':' + (displayKind ?? 0) + ':' + Number(weaponPresentation) + ':' + JSON.stringify(raw);
  let shape = internedCaptureShapes.get(signature);
  if (!shape) {
    nativeCapturePlanCounts.compiled++;
    const keys = raw.filter(key => !SKIP.has(key) && !omitCapturedField(projection, key, weaponPresentation) && (!displayKind || !fixedDisplayField(displayKind, key)));
    shape = {raw, projection, displayKind, weaponPresentation, keys, children: keys.map(key => captureChildProjection(projection, key)), indices: keys.map(key => raw.indexOf(key))};
    if (internedCaptureShapes.size >= 1024) internedCaptureShapes.delete(internedCaptureShapes.keys().next().value!);
    internedCaptureShapes.set(signature, shape);
  }
  cache.set(value, shape);
  return shape;
}
function pack(value: any, seen: object[], refs: Map<string, Ship>, layouts: SnapshotLayouts, plain = false, projection = CaptureProjection.None): Wire {
  if(layouts.displayDefinitions&&value instanceof DisplayDefinitionRequest){
    value=value.owner.reference(value.value);
    if(value instanceof CapturedDisplayDefinition)return {$displayDefinition:value.index};
  }
  if(value instanceof Ship&&!plain){layouts.journal?.reference(value);refs.set(value.id,value);return {$ship:value.id};}
  if(layouts.journal&&value&&typeof value==='object'&&seen.includes(value))layouts.journal.cycle();
  if(layouts.journal&&value&&typeof value==='object'&&!seen.includes(value)&&!(value instanceof Ship&&plain))
    return layouts.journal.memo(value,projection+':'+plain+':'+layouts.packedNumbers+':'+layouts.compactProjectiles,refs,(previous,changed)=>packIncremental(value,seen,refs,layouts,plain,projection,previous,changed));
  if (capturePlansEnabled && layouts.nativeCapture && !plain && projection === CaptureProjection.None
    && !layouts.journal && !layouts.display && !layouts.recordDeltas
    && value && typeof value === 'object' && isImmutableMetadata(value)) {
    const prior = layouts.immutableRecords.get(value);
    if (prior !== undefined) return prior;
    const result = packFresh(value,seen,refs,layouts,plain,projection);
    layouts.immutableRecords.set(value,result);
    return result;
  }
  return packFresh(value,seen,refs,layouts,plain,projection);
}
/** A dirty native record updates only changed scalar slots. Re-enter object
 * children to retain dependency/ref discovery; their own journals skip clean work. */
function packIncremental(value:any,seen:object[],refs:Map<string,Ship>,layouts:SnapshotLayouts,plain:boolean,projection:CaptureProjection,previous:Wire,changed:ReadonlySet<string>|null):Wire{
 if(!previous||!changed||plain||Array.isArray(value)||value instanceof ArmorGrid||value instanceof Map||value instanceof Set
   ||ArrayBuffer.isView(value)||value instanceof Vector2)return packFresh(value,seen,refs,layouts,plain,projection);
 const record=Object.hasOwn(previous,'$record');
 if(!record&&Object.keys(previous).some(key=>key.startsWith('$')))return packFresh(value,seen,refs,layouts,plain,projection);
 const keys:string[]=record?layouts.keys[previous.$record]:Object.keys(previous);
 const values:Wire[]=record?previous.values.slice():keys.map(key=>previous[key]);
 seen.push(value);
 try{for(let i=0;i<keys.length;i++){
  const key=keys[i],prior=values[i];if(!changed.has(key)&&(prior===null||typeof prior!=='object'))continue;
  const field=value[key];if(typeof field==='function'){seen.pop();return packFresh(value,seen,refs,layouts,plain,projection);}
  values[i]=field===null||typeof field==='string'||typeof field==='boolean'||typeof field==='number'&&Number.isFinite(field)?field:pack(field,seen,refs,layouts,false,captureChildProjection(projection,key));
 }}finally{if(seen.at(-1)===value)seen.pop();}
 const result=record?{$record:previous.$record,values}:Object.fromEntries(keys.map((key,i)=>[key,values[i]]));
 layouts.journal!.record(value,result,keys);return result;
}
function packFresh(value: any, seen: object[], refs: Map<string, Ship>, layouts: SnapshotLayouts, plain = false, projection = CaptureProjection.None): Wire {
  if (value === undefined) return layouts.compactProjectiles ? layouts.absent : { $undefined: 1 };
  if (typeof value === "number" && !Number.isFinite(value)) return { $number: String(value) };
  if (value === null || typeof value !== "object") return typeof value === "function" ? { $undefined: 1 } : value;
  // Native capture owns this graph. Arrays cannot be any of the tagged leaf
  // classes; avoid repeated prototype walks for every nested row/value array.
  // Generic/custom callers retain their original instanceof/read ordering.
  if (projection === CaptureProjection.Damage && layouts.renderDamageMarks) projection = CaptureProjection.RenderDamage;
  const nativeArray = layouts.nativeCapture && Array.isArray(value);
  if (!nativeArray) {
    if (value instanceof Ship && !plain) { refs.set(value.id, value); return { $ship: value.id }; }
    if (value instanceof Vector2) return { $vector: [value.x, value.y] };
    if (ArrayBuffer.isView(value)) return { $typed: value.constructor.name,
      values: layouts.nativeCapture && layouts.packedNumbers
        ? PackedSnapshotNumbers.capture(value) ?? Array.from(value as any) : Array.from(value as any) };
  }
  if (projection === CaptureProjection.ExplosionPuffs && layouts.compactPuffs && Array.isArray(value)) {
    const recipe = explosionPuffRecipe(value);
    if (recipe && reservePuffRecipe(layouts.puffBudget, explosionPuffCount(recipe[1]))) return { $explosionPuffs: recipe };
  }
  if (seen.includes(value)) return { $undefined: 1 };
  if (projection === CaptureProjection.DynamicParticles && layouts.compactParticles && Array.isArray(value)
      && Object.getPrototypeOf(value) === Array.prototype && !Object.hasOwn(value, 'map') && value.map === captureArrayMap
      && value.length <= PARTICLE_RECIPE_LIMITS.rows && Reflect.ownKeys(value).length === value.length + 1) {
    const recipes: ParticleRecipe[] = [], ids = new Map<ParticleRecipe, number>(), items: Wire[] = []; let encoded = 0;
    for (let i = 0; i < value.length; i++) {
      const d = Object.getOwnPropertyDescriptor(value, String(i));
      if (!d || !Object.hasOwn(d, 'value')) { encoded = 0; break; }
      const row = d.value && typeof d.value === 'object' ? particleRecipeRow(d.value, layouts.particleBudget) : null;
      if (row && layouts.particleBudget.rows < PARTICLE_RECIPE_LIMITS.rows && (ids.has(row.recipe) || layouts.particleBudget.groups < PARTICLE_RECIPE_LIMITS.groups)) {
        let id = ids.get(row.recipe);
        if (id === undefined) { id = recipes.length; recipes.push(row.recipe.slice() as ParticleRecipe); ids.set(row.recipe,id); layouts.particleBudget.groups++; }
        items.push([id,row.index,row.steps,row.motion]); encoded++; layouts.particleBudget.rows++;
      } else items.push(null);
    }
    if (encoded) {
      seen.push(value);
      try { for (let i = 0; i < items.length; i++) if (items[i] === null) items[i] = { raw: pack(value[i], seen, refs, layouts) }; } finally { seen.pop(); }
      return { $dynamicParticles: [2,recipes,items] };
    }
  }
  // Only ancestors can form a cycle. A short path stack avoids Set add/delete
  // churn for every record, while repeated non-cyclic references still expand.
  if (seen.includes(value)) return { $undefined: 1 };
  seen.push(value);
  let result: Wire;
  if (!nativeArray && value instanceof Map) result = { $map: [...value.entries()].map(([k, v]) => [pack(k, seen, refs, layouts), pack(v, seen, refs, layouts)]) };
  else if (!nativeArray && value instanceof Set) result = { $set: [...value].map(v => pack(v, seen, refs, layouts)) };
  else if (nativeArray || Array.isArray(value)) {
    const memberProjection = projection === CaptureProjection.Weapons ? CaptureProjection.Weapon
      : projection === CaptureProjection.Engines ? CaptureProjection.Engine
      : projection === CaptureProjection.Projectiles ? CaptureProjection.Projectile
      : projection === CaptureProjection.Explosions ? CaptureProjection.Explosion
      : projection === CaptureProjection.DamageMarks ? CaptureProjection.DamageMark : CaptureProjection.None;
    // Custom array classes/mappers retain their original generic traversal.
    const nativeMembers = memberProjection && Object.getPrototypeOf(value) === Array.prototype && !Object.hasOwn(value, 'map')
      && (projection !== CaptureProjection.DamageMarks || !Object.hasOwn(value, 'constructor')
        && value.map === captureArrayMap && value.constructor === Array && Array[Symbol.species] === Array);
    let rows: Wire[];
    if (nativeArray && Object.getPrototypeOf(value) === Array.prototype &&
        !Object.hasOwn(value, 'map') && !Object.hasOwn(value, 'constructor') &&
        value.map === captureArrayMap && value.constructor === Array && Array[Symbol.species] === Array) {
      // Same captured length and HasProperty semantics as map (including holes),
      // without a recursive call/callback for each scalar cell. Never reuse rows.
      rows = new Array(value.length);
      for (let i = 0; i < rows.length; i++) if (i in value) {
        const v = value[i];
        rows[i] = v === null || typeof v === 'string' || typeof v === 'boolean'
          || (typeof v === 'number' && Number.isFinite(v)) ? v
          : pack(v, seen, refs, layouts, false, nativeMembers ? memberProjection : CaptureProjection.None);
      }
    } else rows = nativeMembers ? value.map(v => pack(v, seen, refs, layouts, false, memberProjection))
      : value.map(v => pack(v, seen, refs, layouts));
    // Factor identical fields before text/binary encoding, after all original
    // getter/Proxy reads and Ship-reference discovery. No generic traversal is
    // skipped or cached, and no temporal snapshot baseline is introduced.
    const columns = projection === CaptureProjection.Projectiles && nativeMembers && layouts.compactProjectiles
      ? compactProjectileColumns(rows, layouts.keys) : null;
    if (columns) { seen.pop(); return columns; }
    if (layouts.recordDeltas && rows.length && (memberProjection === CaptureProjection.Weapon || memberProjection === CaptureProjection.Engine)
      && rows.every(row => row?.$recordDelta)) {
      for (let i = 0; i < rows.length; i++) rows[i] = rows[i].$recordDelta;
      seen.pop(); return { $recordDeltas: rows };
    }
    const kind: DisplayRecordKind | undefined = rows[0]?.$d?.[0];
    const displayId = rows[0]?.$d?.[2]?.$record, displayOffset = rows[0]?.$d?.[1];
    if (kind && rows.every((row, i) => row?.$d?.[0] === kind && row?.$d?.[2] && Object.keys(row.$d[2]).length === 0 && row.$d[1] === displayOffset + i * fixedDisplayStride(kind))) {
      seen.pop(); return { $ds: [kind, displayOffset, rows.length] };
    }
    if (kind && Number.isInteger(displayId) && rows.every((row, i) => row?.$d?.[0] === kind && row?.$d?.[2]?.$record === displayId && row.$d[1] === displayOffset + i * fixedDisplayStride(kind))) {
      result = { $ds: [kind, displayOffset, { $records: displayId, values: rows.map(row => row.$d[2].values) }] };
      seen.pop(); return result;
    }
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
    let keys = Object.keys(value);
    if (projection) projection = nativeCaptureProjection(value, projection);
    // Only the owned default mark layout is a presentation record. Mods,
    // reordered/added/deleted fields retain the complete generic contract.
    if (projection === CaptureProjection.DamageMark && (keys.length !== damageMarkKeys.length
      || keys.some((key, i) => key !== damageMarkKeys[i]))) projection = CaptureProjection.None;
    let values: Wire[];
    const displayKind: DisplayRecordKind | undefined = layouts.display ? (projection === CaptureProjection.Weapon ? 1 : projection === CaptureProjection.Engine ? 2 : undefined) : undefined;
    const displayShape = displayKind && capturePlansEnabled ? nativeCaptureShape(value, keys, projection, displayKind, layouts.weaponPresentation) : null;
    const sampledFields = displayShape ? Object.values(value) : undefined;
    const displayOffset = displayKind ? layouts.display!.capture(displayKind, value, displayShape?.raw, sampledFields) : null;
    const fixedKind: DisplayRecordKind | undefined = displayOffset === null ? undefined : displayKind;
    const shape = fixedKind && displayShape ? displayShape : layouts.nativeCapture && capturePlansEnabled ? nativeCaptureShape(value, keys, projection, fixedKind, layouts.weaponPresentation) : null;
    let planned = false;
    const armorCells = layouts.nativeCapture && layouts.packedNumbers && ownedArmorGrid(value)
      ? captureArmorCells(value) : null;
    if (armorCells) {
      // Known owned component: do not read/escape or repack the cell buffer.
      // Preserve all other fields, ordering, extension values and reference discovery.
      values = []; let count = 0;
      for (const key of keys) {
        if (SKIP.has(key) || omitCapturedField(projection, key, layouts.weaponPresentation) || (fixedKind && fixedDisplayField(fixedKind, key))) continue;
        if (key === 'cells') { keys[count++] = key; values.push(armorCells); continue; }
        const field = value[key];
        if (typeof field === 'function') continue;
        keys[count++] = key;
        values.push(field === null || typeof field === 'string' || typeof field === 'boolean'
          || (typeof field === 'number' && Number.isFinite(field)) ? field
          : pack(field, seen, refs, layouts, false, captureChildProjection(projection, key)));
      }
      keys.length = count;
    } else if (shape) {
      // Explicit native graph only: own enumerable data fields, no accessors/Proxies.
      // Read once in the just-validated raw key order. Indexed projection avoids
      // megamorphic property lookup per field; indices are invalidated on ANY
      // shape/order change above. Never cache field values in a traversal plan.
      const fields = sampledFields ?? Object.values(value);
      if (!plain && layouts.recordDeltas && (projection === CaptureProjection.Weapon || projection === CaptureProjection.Engine)) {
        const row = layouts.recordDeltas.recordNative(value, shape.keys, fields, shape.indices,
          (field, slot) => pack(field, seen, refs, layouts, false, shape.children[slot]));
        if (row) { seen.pop(); return row; }
      }
      keys = shape.keys;
      values = fields;
      let written = 0;
      let filtered: string[] | null = null;
      for (let i = 0; i < keys.length; i++) {
        const field = fields[shape.indices[i]];
        // Function/value transitions remain live, and must not corrupt the plan.
        if (typeof field === 'function') { filtered ??= keys.slice(0, i); continue; }
        if (filtered) filtered.push(keys[i]);
        // Retained raw indices increase monotonically; writing behind the read
        // cursor cannot replace a field we have yet to visit. This array belongs
        // to THIS capture, never the authority or any other frame.
        values[written++] = field === null || typeof field === 'string' || typeof field === 'boolean'
          || (typeof field === 'number' && Number.isFinite(field))
          ? field : pack(field, seen, refs, layouts, false, shape.children[i]);
      }
      values.length = written;
      if (filtered) keys = filtered;
      else planned = true;
    } else if (layouts.nativeCapture) {
      // Explicitly trusted, locally constructed authority graph: no getters or
      // Proxies. Read retained fields once, and never allocate simulation-only
      // subtrees merely to discard them. Do not infer this contract from a proto.
      values = [];
      let count = 0;
      for (const key of keys) {
        if (SKIP.has(key) || omitCapturedField(projection, key, layouts.weaponPresentation) || (fixedKind && fixedDisplayField(fixedKind, key))) continue;
        const field = value[key];
        if (typeof field === 'function') continue;
        keys[count++] = key;
        values.push(field === null || typeof field === 'string' || typeof field === 'boolean'
          || (typeof field === 'number' && Number.isFinite(field))
          ? field : pack(field, seen, refs, layouts, false, captureChildProjection(projection, key)));
      }
      keys.length = count;
    } else {
      // Generic callers retain BOTH read passes and recursive packing before
      // omission: getter/Proxy reads, exceptions and Ship discovery are observable.
      let count = 0;
      for (const key of keys) {
        if (!SKIP.has(key) && typeof value[key] !== 'function') keys[count++] = key;
      }
      if (count !== keys.length) keys.length = count;
      values = new Array(keys.length);
      for (let i = 0; i < keys.length; i++) {
        const field = value[keys[i]];
        values[i] = field === null || typeof field === 'string' || typeof field === 'boolean'
          || (typeof field === 'number' && Number.isFinite(field))
          ? field : pack(field, seen, refs, layouts, false, captureChildProjection(projection, keys[i]));
      }
      if (projection === CaptureProjection.Ship || projection === CaptureProjection.Damage
        || projection === CaptureProjection.RenderDamage || projection === CaptureProjection.DamageMark || projection === CaptureProjection.Weapon
        || projection === CaptureProjection.Engine || projection === CaptureProjection.Projectile) {
        let kept = 0;
        for (let i = 0; i < keys.length; i++) if (!omitCapturedField(projection, keys[i])) {
          keys[kept] = keys[i]; values[kept++] = values[i];
        }
        keys.length = values.length = kept;
      }
    }
    result = !plain && layouts.recordDeltas && (projection === CaptureProjection.Weapon || projection === CaptureProjection.Engine)
      ? layouts.recordDeltas.record(value, keys, values)
      : plain ? null : planned ? layouts.recordPlanned(shape!, values) : layouts.record(keys, values);
    if (!result) { result = {}; for (let i = 0; i < keys.length; i++) result[keys[i]] = values[i]; }
    if (fixedKind) result = { $d: [fixedKind, displayOffset, result] };
    if(layouts.journal&&!plain)layouts.journal.record(value,result,keys);
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
  const armor = layouts.nativeProjection && ownedArmorGrid(output);
  const native = armor ? undefined : layouts.nativeRecords?.get(keys);
  if (native) { native(values, output, depth, layouts.nativeDecode!); return; }
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i], value = values[i];
    if (depth > 64) throw Error("Snapshot nesting exceeds limit");
    if (armor && key === "cells" && restoreArmorCells(output, value)) continue;
    const previous = output[key];
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
  if(Object.hasOwn(value,'$component')) {
    const restore=(data:any)=>unpack(data,target,ships,layouts,depth+1);
    return layouts.components?layouts.components.restore(value,target,restore):restore(resolveComponent(value,layouts.componentDefinitions??{}));
  }
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
    // One dispatch per homogeneous list, not a Map lookup/armor probe per row.
    // A layout containing cells must retain the owned ArmorGrid special case.
    const native = keys.includes('cells') ? undefined : layouts.nativeRecords?.get(keys);
    if (native?.rows) { native.rows(rows, output, depth + 2, layouts.nativeDecode!); return output; }
    for (let row = 0; row < rows.length; row++) {
      const values = rows[row];
      if (!Array.isArray(values) || values.length !== keys.length) throw Error('Invalid snapshot record row');
      const previous = output[row];
      const record = previous && typeof previous === 'object' && !Array.isArray(previous) ? previous : {};
      if (native) native(values, record, depth + 2, layouts.nativeDecode!);
      else unpackRecord(values, keys, record, ships, layouts, depth + 2);
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
        if (layouts.nativeProjection) {
          output[i] = layouts.particleDecoder.restoreInto(recipes[row[0]], row[1], row[2], layouts.particleBudget, row[3], output[i], depth + 3);
          continue;
        }
        expanded = layouts.particleDecoder.expand(recipes[row[0]], row[1], row[2], layouts.particleBudget, row[3]);
      } else {
        if (!row || typeof row !== 'object' || Object.keys(row).length !== 1 || !Object.hasOwn(row,'raw')) throw Error('Invalid ordinary particle reference');
        expanded = row.raw;
      }
      output[i] = unpack(expanded, output[i], ships, layouts, depth + 3);
    }
    output.length = rows.length; return output;
  }
  // Like batched records, recipes are cold relative to vector decoding.
  if (Object.hasOwn(value, '$explosionPuffs')) {
    if (Object.keys(value).length !== 1) throw Error('Invalid explosion puff envelope');
    if (layouts.nativeProjection) return layouts.puffDecoder.restoreInto(value.$explosionPuffs, layouts.puffBudget, target, depth + 2);
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
  // Fixed leaves are rare; common records/vectors return before these marker checks.
  if (Object.hasOwn(value, '$ds') || Object.hasOwn(value, '$d')) {
    const batch = Object.hasOwn(value, '$ds'), tuple = batch ? value.$ds : value.$d;
    if (!layouts.display || Object.keys(value).length !== 1 || !Array.isArray(tuple) || tuple.length !== 3) throw Error('Invalid fixed display tuple');
    const [kind, offset, state] = tuple;
    if (batch) {
      const empty = typeof state === 'number';
      if (empty ? !Number.isSafeInteger(state) || state < 0 || state > 32768 : !state || !Object.hasOwn(state, '$records') || !Array.isArray(state.values)) throw Error('Invalid fixed display records');
      const count = empty ? state : state.values.length;
      layouts.display.validateBatch(kind, offset, count);
      const output = empty ? Array.isArray(target) ? target : [] : unpack(state, target, ships, layouts, depth + 1);
      if (empty) { for (let i = 0; i < count; i++) if (!output[i] || typeof output[i] !== 'object' || Array.isArray(output[i])) output[i] = {}; output.length = count; }
      layouts.display.bindBatchValidated(kind, offset, output);
      return output;
    }
    layouts.display.validate(kind, offset);
    if (!state || typeof state !== 'object' || Array.isArray(state) || Object.hasOwn(state, '$d') || Object.hasOwn(state, '$ds')) throw Error('Invalid fixed display state');
    const output = unpack(state, target, ships, layouts, depth + 1);
    layouts.display.bindValidated(kind, offset, output);
    return output;
  }
  if (Object.hasOwn(value, '$recordDeltas')) {
    const rows = value.$recordDeltas;
    if (!layouts.recordDeltas || Object.keys(value).length !== 1 || !Array.isArray(rows) || rows.length > 32768) throw Error('Invalid record delta batch');
    if (rows.length && depth + 2 > 64) throw Error('Snapshot nesting exceeds limit');
    const output = Array.isArray(target) ? target : [];
    const decode = (wire: Wire, previous: any) => unpack(wire, previous, ships, layouts, depth + 2);
    for (let i = 0; i < rows.length; i++) output[i] = layouts.recordDeltas.apply(rows[i], output[i], decode, layouts.nativeProjection);
    output.length = rows.length; return output;
  }
  if (Object.hasOwn(value, '$recordDelta')) {
    if (!layouts.recordDeltas || Object.keys(value).length !== 1) throw Error('Missing or invalid record delta definitions');
    if (depth + 1 > 64) throw Error('Snapshot nesting exceeds limit');
    return layouts.recordDeltas.apply(value.$recordDelta, target,
      (wire, previous) => unpack(wire, previous, ships, layouts, depth + 1), layouts.nativeProjection);
  }
  const output =
    target && typeof target === "object" && !Array.isArray(target)
      ? target
      : {};
  // Network DTOs have no getters/Proxies. Avoid a temporary [key,value]
  // allocation per field; still restore EVERY retained field against the live
  // target. Arbitrary callers keep Object.entries and its eager read ordering.
  if (layouts.nativeProjection) {
    const armor = ownedArmorGrid(output);
    for (const k of Object.keys(value)) {
      if (SKIP.has(k)) continue;
      const v = value[k];
      if (depth >= 64) throw Error("Snapshot nesting exceeds limit");
      if (armor && k === "cells" && restoreArmorCells(output, v)) continue;
      const previous = output[k];
      if((v===null||typeof v!=='object')&&Object.is(v,previous))continue;
      output[k] = v === null || typeof v !== 'object' ? v : unpack(v, previous, ships, layouts, depth + 1);
    }
    return output;
  }
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
  // The column plan has already validated every template and row. Decode only
  // fixed scalar tags once per template; no structured object is shared with
  // a mutable viewer. References/collections/malformed tags retain unpack.
  const restorers = layouts.nativeProjection ? plan.templates.map(t => {
    for (let col = 0; col < t.keys.length; col++) {
      if (t.dynamic[col]) continue;
      const item = t.fixed[col];
      if (!item || typeof item !== 'object' || Object.keys(item).length !== 1) continue;
      if (Object.hasOwn(item, '$undefined') && item.$undefined) t.fixed[col] = undefined;
      else if (Object.hasOwn(item, '$number') && item.$number) t.fixed[col] = item.$number === 'Infinity' ? Infinity : item.$number === '-Infinity' ? -Infinity : NaN;
    }
    return layouts.nativeRecords?.get(t.keys)?.columns;
  }) : undefined;
  const output = Array.isArray(target) ? target : [];
  for (let i = 0; i < plan.rows.length; i++) {
    const row = plan.rows[i], previous = output[i];
    if (!Array.isArray(row)) { output[i] = unpack(row, previous, ships, layouts, 1); continue; }
    const template = plan.templates[row[0]];
    const record = previous && typeof previous === 'object' && !Array.isArray(previous) ? previous : {};
    const native = restorers?.[row[0]];
    if (native) { native(row, template.fixed, template.dynamic, record, 2, layouts.nativeDecode!); output[i] = record; continue; }
    for (let col = 0; col < template.keys.length; col++) {
      const key = template.keys[col], item = template.dynamic[col] ? row[template.dynamic[col]] : template.fixed[col], prior = record[key];
      record[key] = item === null || typeof item !== 'object' ? item : unpack(item, prior, ships, layouts, 2);
    }
    output[i] = record;
  }
  output.length = plan.rows.length;
  return output;
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
const componentCaptures=new WeakMap<CombatEngine,ComponentCapture>();
const componentDictionaries=new WeakMap<CombatEngine,SnapshotLayouts>();
const componentReceivers=new WeakMap<CombatSnapshotTarget,ComponentReceiver>();
let componentEventEpoch=0;
const hostComponentEvents=new WeakMap<CombatEngine,{host:HostCombatComponentEvents;tick:number;batch?:CombatComponentEventBatch}>();
const receivedComponentEvents=new WeakMap<CombatSnapshotTarget,CombatComponentEventReceiver>();
const componentNotices=new WeakMap<CombatSnapshotTarget,readonly CombatComponentEvent[]>();
const NO_COMPONENT_EVENTS:readonly CombatComponentEvent[]=Object.freeze([]);
/** Notifications from the most recently restored endpoint; never damage commands. */
export function combatComponentNotices(engine:CombatSnapshotTarget):readonly CombatComponentEvent[]{return componentNotices.get(engine)??NO_COMPONENT_EVENTS;}
const displayGenerations=new WeakMap<CombatSnapshotTarget,Map<string,number>>();
const validatedComponentSpecs=new WeakSet<object>();
const componentOmit=(_source:object,key:string)=>SKIP.has(key);
const componentReference=(source:object)=>source instanceof Ship;
const recordDeltaCaptures = new WeakMap<CombatEngine, RecordDeltaCapture>();
const WORLD_COMPONENTS=new Set<string>(["environment","asteroidSystem","nebulaSystem","mineSystem"]);
export function componentCaptureDiagnostics(engine:CombatEngine){return componentCaptures.get(engine)?.journal.stats;}
// Reuse authority-local projection layouts, not captured frames. Values are
// sampled anew; pack() still owns every emitted mutable wire row. Weak engine
// ownership releases the whole cache with the battle, including display specs.
const lanDisplayProjectors = new WeakMap<CombatEngine, LanShipProjection>();
export function captureCombat(
  engine: CombatEngine,
  tick: number,
  acknowledged: Record<Seat, number>,
  simulationMs: number,
  localContrails = false,
  compactPuffs = false,
  compactProjectiles = false,
  // Opt in only for a locally constructed, non-Proxy native engine graph.
  // Not a property inferred from prototypes or untrusted wire data.
  nativeCapture = false,
  compactParticles = false,
  packedNumbers = false,
  componentMode = false,
  fixedDisplay = false,
  recordDeltas = false,
  // Authority-only presentation omission; legacy/native diagnostic capture stays full.
  weaponPresentation = false,
  // Exact authority-computed appearance only; never a simulation checkpoint.
  renderDamageMarks = false,
  displayOnly = false,
  displayDefinitions = false,
): CombatSnapshot {
  const definitions = displayOnly && displayDefinitions ? new DisplayDefinitionCapture() : undefined;
  let displayProjector: LanShipProjection | undefined;
  if (displayOnly) {
    displayProjector = lanDisplayProjectors.get(engine);
    if (!displayProjector) { displayProjector = new LanShipProjection(); lanDisplayProjectors.set(engine, displayProjector); }
    displayProjector.begin(definitions);
  }
  let components:ComponentCapture|undefined;
  if(componentMode&&nativeCapture&&!displayOnly){components=componentCaptures.get(engine);if(!components){components=new ComponentCapture(componentOmit,componentReference);componentCaptures.set(engine,components);}components.begin();}
  const world: Record<string, unknown> = {};
  // Ribbons are client cosmetics in LAN. Keep the default projection available
  // for diagnostics/legacy capture; omission preserves the viewer's local engine.
  for (const k of WORLD_KEYS) if ((k !== 'contrailEngine' || !localContrails)&&!(components&&WORLD_COMPONENTS.has(k))) world[k] = engine[k];
  const capitals = new Set(engine.allCapitalShips);
  const refs = new Map(engine.ships.map(ship => [ship.id, ship]));
  const layouts = new SnapshotLayouts(compactPuffs, compactProjectiles, nativeCapture, compactParticles, packedNumbers,components?componentDictionaries.get(engine):undefined,!!components);
  layouts.displayDefinitions = definitions;
  layouts.weaponPresentation = nativeCapture && weaponPresentation && !components;
  layouts.renderDamageMarks = nativeCapture && renderDamageMarks && !components;
  if(components)componentDictionaries.set(engine,layouts);
  if (fixedDisplay && nativeCapture && !components) layouts.display = new FixedDisplayCapture();
  if (recordDeltas && nativeCapture && !components && !layouts.display) {
    let capture = recordDeltaCaptures.get(engine);
    if (!capture) { capture = new RecordDeltaCapture(); recordDeltaCaptures.set(engine, capture); }
    capture.begin(); layouts.recordDeltas = capture;
  }
  // Root ship/world fields remain named for server validation and playback clocks.
  // Enumerate ship roots directly; nested Ship values still become references.
  const project = (value: unknown, projection = CaptureProjection.Ship) => {
    layouts.journal=projection===CaptureProjection.Ship?components?.journal:undefined;
    const data=pack(value, [], refs, layouts, true, projection);
    return layouts.journal?sealShipComponents(data,components):data;
  };
  // A reserve cannot change in simulation. Its frozen match loadout is already present on viewers;
  // avoid resending every inactive weapon/controller/component at snapshot frequency.
  const ships = engine.allCapitalShips.map(ship => ({id:ship.id,...(components?{generation:components.generation(ship)}:{}),state:project(displayProjector ? displayProjector.project(ship) : engine.deployment.isReserve(ship.id)
    ? {id:ship.id,teamId:ship.teamId,isPlayer:ship.isPlayer,hullHp:ship.hullHp,currentCR:ship.currentCR,isDead:ship.isDead,isRetreated:ship.isRetreated}
    : ship)}));
  const projectedWorld = project(world, CaptureProjection.World);
  if(components)for(const k of WORLD_KEYS)if(WORLD_COMPONENTS.has(k)){layouts.journal=components.journal;const value=pack(engine[k],[],refs,layouts);projectedWorld[k]=value&&typeof value==='object'?sealComponentTree(value,components):value;}
  const craftSpecs: Wire[] = [], specs = new Map<string,number>();
  const specObjects = new Map<ShipSpec, number>();
  const fighterSet = new Set(engine.fighters), bomberSet = new Set(engine.bombers), droneSet = new Set(engine.droneSystem.drones);
  const crafts: CombatSnapshot['crafts'] = [];
  // Packing a hull/FX may discover a detached craft still referenced by wrecks or launchers.
  for (const ship of refs.values()) {
    if (capitals.has(ship)) continue;
    let spec = specObjects.get(ship.spec);
    if (spec === undefined) {
      const definition=components?.definition(ship.spec);
      const signature = definition?.signature ?? JSON.stringify(ship.spec);
      spec = specs.get(signature);
      if (spec === undefined) {spec=craftSpecs.length;specs.set(signature,spec);craftSpecs.push(definition?.capsule ?? ship.spec);}
      specObjects.set(ship.spec, spec);
    }
    const kind = fighterSet.has(ship) ? 'fighter' : bomberSet.has(ship) ? 'bomber' : droneSet.has(ship) ? 'drone' : 'detached';
    crafts.push({id:ship.id,...(components?{generation:components.generation(ship)}:{}),kind,spec,state:project(displayProjector ? displayProjector.project(ship) : ship)});
  }
  if(displayProjector) {
    for(let i=0;i<ships.length;i++) {
      const spec=engine.allCapitalShips[i].spec;
      let index=specObjects.get(spec);
      if(index===undefined){const signature=JSON.stringify(spec);index=specs.get(signature);
        if(index===undefined){index=craftSpecs.length;craftSpecs.push(spec);specs.set(signature,index);}specObjects.set(spec,index);}
      (ships[i] as {spec?:number}).spec=index;
    }
    displayProjector.finish();
  }
  components?.finish();
  const frame:CombatSnapshot={...(components?{componentMode:1 as const,componentDefinitions:components.definitionFrame()}:{}),tick,acknowledged,simulationMs,ships,crafts,craftSpecs,layouts:components?layouts.keys.slice():layouts.keys,world:projectedWorld, ...(engine.deployment.enabled ? {deployment:engine.deployment.snapshot()} : {})};
  if(displayOnly) {
    frame.displayVersion=definitions?2:1;
    if(definitions)frame.displayDefinitions=definitions.entries;
    frame.deployment=engine.deployment.snapshot();
    frame.displayWorld=project({multiTeamBattle:engine.multiTeamBattle,openBattlefield:engine.openBattlefield,
      simulationPointLimit:engine.simulationPointLimit,commandPoints:engine.commandPoints,orders:engine.orders,
      shipLossNotifications:engine.shipLossNotifications});
    frame.controlled=Object.fromEntries(lanControlledRoster(engine));
    // v2 publications own nested rebuild queues too; a shallow wing copy can
    // otherwise change while the encoder/helper still owns this completed tick.
    frame.displayWings={player:engine.playerWings.map(wing=>definitions?{...wing,tags:wing.tags?.slice(),rebuildQueue:wing.rebuildQueue.map(row=>({...row}))}:({...wing})),enemy:engine.enemyWings.map(wing=>definitions?{...wing,tags:wing.tags?.slice(),rebuildQueue:wing.rebuildQueue.map(row=>({...row}))}:({...wing}))};
  }
  if (layouts.display) frame.fixedDisplay = layouts.display.finish();
  if (layouts.recordDeltas) frame.recordDefinitions = layouts.recordDeltas.finish();
  if(components){
    let events=hostComponentEvents.get(engine);
    if(!events||tick<events.tick){events={host:new HostCombatComponentEvents('authority-'+(++componentEventEpoch)),tick:-1};hostComponentEvents.set(engine,events);}
    // Re-publication of an unchanged simulation tick must not duplicate notices.
    if(tick>events.tick){try{events.batch=events.host.capture(frame);}catch{events.batch=undefined;}events.tick=tick;}
    if(events.batch)frame.combatEvents=events.batch;
  }
  return frame;
}
/** Dedicated entity capture for a locally constructed authority. Shares the
 * existing projection/omission contract without traversing ships or world FX.
 * Native/custom callers must obey the same nativeCapture restriction as above. */
export function captureProjectileProjection(engine: CombatEngine) {
  const layouts = new SnapshotLayouts(false, true, true);
  const refs = new Map(engine.ships.map(ship => [ship.id, ship]));
  const projectiles = pack(engine.projectiles, [], refs, layouts, false, CaptureProjection.Projectiles);
  return { world: { projectiles }, layouts: layouts.keys };
}
const puffDecoders = new WeakMap<CombatSnapshotTarget, ExplosionPuffDecoder>();
const particleDecoders = new WeakMap<CombatSnapshotTarget, DynamicParticleDecoder>();
const displayCrafts = new WeakMap<CombatSnapshotTarget, Map<string, Ship>>();
const validatedSpecs = new WeakMap<CombatSnapshotTarget, Set<string>>();
const displayTicks = new WeakMap<CombatSnapshotTarget, number>();
const projectileWorldTicks = new WeakMap<CombatSnapshotTarget, number>();
/** Compact world ticks do not supersede the independent projectile stream. */
export const projectileSnapshotTick = (engine: CombatSnapshotTarget): number => projectileWorldTicks.get(engine) ?? -1;
// Only native roster accessors may share membership within this synchronous apply.
// A custom targeting method is still called normally; never cache its result.
const restoreFindHostile = CombatEngine.prototype.findHostile;
const restoreRosterReaders = ['allCapitalShips', 'capitalShips', 'combatShips', 'ships']
  .map(key => [key, Object.getOwnPropertyDescriptor(CombatEngine.prototype, key)?.get] as const);
function canShareRestoreRoster(engine: CombatSnapshotTarget): boolean {
  return Object.getPrototypeOf(engine) === CombatEngine.prototype
    && restoreRosterReaders.every(([key, getter]) => !Object.hasOwn(engine, key)
      && Object.getOwnPropertyDescriptor(CombatEngine.prototype, key)?.get === getter);
}
export interface CombatSnapshotBatchOptions {
  /** Opt in ONLY for a locally constructed, non-Proxy native authority/diagnostic engine graph.
   * Every endpoint re-audits native methods, plain targeting fields and immutable
   * specs; unsupported hooks/data or ANY invalid retained target use the original
   * full query loop. No state is cached across afterApply callbacks. JavaScript
   * cannot detect transparent Proxies, so callers unable to guarantee their absence
   * must leave this off. Wire frames still receive the normal full validation. */
  nativeTargeting?: boolean;
  /** Locally owned non-Proxy authority/diagnostic world + ordinary decoded DTO frames only. No
   * custom accessors on either graph. Generic/mod callers must leave false. */
  nativeProjection?: boolean;
  /** Separate lifecycle/HP notifications after each successful full endpoint. */
  afterComponentEvents?: (events:readonly CombatComponentEvent[])=>void;
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
  engine: CombatSnapshotTarget,
  frames: readonly CombatSnapshot[],
  resetInterpolation = false,
  afterApply?: (frame: CombatSnapshot) => void,
  options?: CombatSnapshotBatchOptions,
): void {
  for (const frame of frames) {
    restoreCombatSnapshot(engine, frame, resetInterpolation, options?.nativeTargeting === true, options?.nativeProjection === true);
    options?.afterComponentEvents?.(combatComponentNotices(engine));
    afterApply?.(frame);
  }
}

/** Retains existing Ship/component prototypes and static definitions. Never calls fixedUpdate on a guest. */
export function applyCombatSnapshot(
  engine: CombatSnapshotTarget,
  frame: CombatSnapshot,
  resetInterpolation = false,
) {
  restoreCombatSnapshot(engine, frame, resetInterpolation, false);
}

function restoreCombatSnapshot(
  engine: CombatSnapshotTarget,
  frame: CombatSnapshot,
  resetInterpolation: boolean,
  nativeTargeting: boolean,
  nativeProjection = false,
) {
  if (
    !frame ||
    !Number.isSafeInteger(frame.tick) ||
    !Array.isArray(frame.ships) ||
    frame.ships.length !== engine.allCapitalShips.length ||
    new Set(frame.ships.map((row) => row.id)).size !== frame.ships.length
  )
    throw Error("Invalid combat snapshot");
  if(frame.componentMode!==undefined&&frame.componentMode!==1)throw Error('Invalid component protocol');
  if(frame.componentMode===1&&[...frame.ships,...(frame.crafts??[])].some(row=>!Number.isSafeInteger(row.generation)||row.generation!<=0))throw Error('Invalid entity generation');
  if (frame.particleEvents !== undefined) validateParticleEvents(frame.particleEvents);
  if (frame.projectileVisuals !== undefined && (frame.projectileVisuals !== 1 || !Array.isArray(frame.world?.projectiles) || frame.world.projectiles.length)) throw Error('Invalid separate projectile snapshot');
  if (!Array.isArray(frame.crafts) || !Array.isArray(frame.craftSpecs))
    throw Error('Invalid dynamic craft snapshot');
  let puffDecoder = puffDecoders.get(engine);
  if (!puffDecoder) { puffDecoder = new ExplosionPuffDecoder(); puffDecoders.set(engine, puffDecoder); }
  let particleDecoder = particleDecoders.get(engine);
  if (!particleDecoder) { particleDecoder = new DynamicParticleDecoder(); particleDecoders.set(engine,particleDecoder); }
  const layouts = snapshotLayouts(frame.layouts, puffDecoder, particleDecoder);
  layouts.nativeProjection = nativeProjection;
  if (frame.fixedDisplay !== undefined) layouts.display = new FixedDisplayRestore(frame.fixedDisplay);
  if (frame.recordDefinitions !== undefined) layouts.recordDeltas = new RecordDeltaRestore(frame.recordDefinitions);
  layouts.componentDefinitions=frame.componentDefinitions;
  let componentReceiver:ComponentReceiver|undefined;
  if(frame.componentMode===1){componentReceiver=componentReceivers.get(engine);if(!componentReceiver){componentReceiver=new ComponentReceiver(componentOmit,componentReference);componentReceivers.set(engine,componentReceiver);}
    componentReceiver.begin(JSON.stringify([[...frame.ships,...frame.crafts].map(r=>[r.id,r.generation]),layouts.keys]),resetInterpolation,layouts.keys,frame.componentDefinitions??{});
    if(nativeProjection)layouts.components=componentReceiver;
  }
  const frameSpecs=frame.craftSpecs.map((spec,index)=>frame.componentMode===1?componentReceiver!.definition(index,spec):spec);
  if (nativeProjection) {
    layouts.nativeRecords = new Map();
    for (const keys of layouts.keys) {
      const native = nativeRecordRestorer(keys);
      if (native) layouts.nativeRecords.set(keys, native);
    }
    layouts.nativeDecode = (value, previous, depth) => unpack(value, previous, ships, layouts, depth);
  }
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
  for (const spec of frameSpecs) {
    if(frame.componentMode===1&&validatedComponentSpecs.has(spec))continue;
    if(frame.componentMode===1){validateShipSpec(spec,{allowExistingId:true,requireBundledAssets:true});validatedComponentSpecs.add(spec);continue;}
    const signature=JSON.stringify(spec);
    if (!cache.has(signature)) {
      validateShipSpec(spec,{allowExistingId:true,requireBundledAssets:true});
      if(cache.size>512)cache.clear();
      cache.add(signature);
    }
  }
  validatedSpecs.set(engine,cache);
  const generations=displayGenerations.get(engine)??new Map<string,number>();
  const nextGenerations=new Map<string,number>();
  const next = new Map<string,Ship>();
  for (const row of frame.crafts) {
    if (typeof row.id !== 'string' || row.id.length > 256 || ships.has(row.id) || !['fighter','bomber','drone','detached'].includes(row.kind) || !Number.isInteger(row.spec) || !frameSpecs[row.spec]) throw Error('Invalid craft identity');
    const spec=frameSpecs[row.spec];
    const carrierId=row.state?.sourceCarrier?.$ship;
    const carrier=carrierId ? ships.get(carrierId) : undefined;
    const sameLifetime=frame.componentMode!==1||!generations.has(row.id)||generations.get(row.id)===row.generation;
    const ship=(sameLifetime?previous.get(row.id):undefined) ?? new Ship(row.id,frame.componentMode===1?structuredClone(spec):spec,!!row.state?.isPlayer,new Vector2(),0,undefined,undefined,carrier);
    if(frame.componentMode===1)nextGenerations.set(row.id,row.generation!);
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
  displayGenerations.set(engine,nextGenerations);
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
  if (resetInterpolation || frame.projectileVisuals !== 1) projectileWorldTicks.set(engine, frame.projectileVisuals === 1 ? -1 : frame.tick);
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
  componentReceiver?.finish();
  let notices=NO_COMPONENT_EVENTS;
  if(frame.componentMode===1&&frame.combatEvents){
    let receiver=receivedComponentEvents.get(engine);
    if(!receiver||resetInterpolation){receiver=new CombatComponentEventReceiver();receivedComponentEvents.set(engine,receiver);}
    // Optional notices can never veto or repeat an authoritative full restore.
    try{notices=receiver.observeSnapshot(frame.combatEvents.epoch,frame,frame.combatEvents);}catch{receivedComponentEvents.delete(engine);}
  }else receivedComponentEvents.delete(engine);
  componentNotices.set(engine,notices);
}
