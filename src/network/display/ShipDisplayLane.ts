import { validSurfaceFeedback } from '../../engine/visual/ShipSurfaceFeedback';
import { validLoadedMissileLevels } from '../../engine/visual/GlorianaTorpedoVisuals';
/** Experimental fixed-layout renderer lane. Not the LAN HUD/prediction protocol.
 * Hot fields are read directly from owned Float64 storage. Only definitions and
 * variable visual tails use the bounded metadata codec; no Ship is restored. */
import { encode, decode } from '@msgpack/msgpack';
import '../../engine/simulation/CombatEngine';
import type { CombatRenderView } from '../../engine/render/CombatRenderView';
import { validateSystemVisuals } from '../../engine/extensions/ship-systems/NativeSystemVisuals';
import { assetManager } from '../../engine/assets/AssetResolver';
import { requireWeaponEffect } from '../../engine/extensions/weapon-effects/Registry';
import { validateShipSpec } from '../../engine/modding/ContentValidation';
import { Vector2 } from '../../engine/math/Vector2';
import type { Ship } from '../../engine/simulation/Ship';
import type { ShipRenderState } from '../../engine/render/ShipRenderState';
import { RenderWeaponDictionary } from '../../engine/runtime/local/RenderWeaponDictionary';
import { combatWeaponRange } from '../../engine/simulation/WeaponRange';
import { pulsePusherOffset } from '../../engine/extensions/ship-systems/PulseDriveState';
import { shipPresentationPose } from '../../engine/visual/ShipPresentation';
import { weaponPresentationAngle } from '../../engine/visual/WeaponPresentation';
import { isImmutableMetadata } from '../../engine/extensions/Immutable';
import { RenderShipProjection, ProjectedRenderShip, ProjectedRenderSystem, ProjectedRenderWeapon } from '../../engine/runtime/local/RenderShipProjection';
import { DisplayBufferRecord } from './ShipDisplayBuffer';
import * as layout from './ShipDisplayLayout';

const MAGIC = 0x31445353, HEADER = 40, MAX_BYTES = 8 * 1024 * 1024;
const MAX_SHIPS = 512, MAX_ITEMS = 32768, MAX_DEFINITIONS = 4096;
const forbidden = new Set(['__proto__', 'constructor', 'prototype']);
const littleEndian = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
const finiteInt = (n: unknown, max: number): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= max;
const check = (ok: unknown, message: string): void => { if (!ok) throw new Error('Ship display: ' + message); };
const SHIP_EXTRA = ['id', 'playerTargetId', 'visibilityOverflow', 'phaseGhosts', 'scorchMarks', 'weaponGroups', 'presentationPose', 'fireControlMode', 'surfaceFeedback'] as const;
const SHIELD_EXTRA = ['type', 'phaseState', 'hitSegmentLevels'] as const;
const FLUX_EXTRA = ['hullSize'] as const;
const SYSTEM_EXTRA = ['state', 'type', 'teleportVisual', 'pulseOffset'] as const;
const WEAPON_EXTRA = ['mountType', 'slotId', 'presentationRelativeAngle', 'loadedMissileLevels'] as const;

// Uniform container tags avoid collisions with user metadata. Special numbers,
// undefined, vectors and absent fields retain their existing display semantics.
function packMetadata(value: any, depth = 0, budget = { nodes: 0 }): any {
 check(depth <= 32 && ++budget.nodes <= 200000, 'metadata budget');
 if (value === undefined) return [0];
 if (typeof value === 'number') return Number.isNaN(value) ? [1, 0] : value === Infinity ? [1, 1] : value === -Infinity ? [1, 2] : Object.is(value, -0) ? [1, 3] : value;
 if (value === null || typeof value === 'boolean') return value;
 if (typeof value === 'string') { check(value.length <= 65536, 'string budget'); return value; }
 if (value instanceof Vector2) return [2, packMetadata(value.x, depth + 1, budget), packMetadata(value.y, depth + 1, budget)];
 if (value instanceof Float32Array) { check(value.length <= MAX_ITEMS, 'typed visual budget'); return [5, Array.from(value, v => packMetadata(v, depth + 1, budget))]; }
 if (Array.isArray(value)) { check(value.length <= MAX_ITEMS, 'array budget'); return [3, value.map(v => packMetadata(v, depth + 1, budget))]; }
 check(value && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null), 'unsupported metadata');
 const keys = Object.keys(value); check(keys.length <= 2048 && keys.every(k => !forbidden.has(k)), 'metadata fields');
 return [4, keys.map(key => [key, packMetadata(value[key], depth + 1, budget)])];
}
function unpackMetadata(value: any, depth = 0, budget = { nodes: 0 }): any {
 check(depth <= 32 && ++budget.nodes <= 200000, 'metadata budget');
 if (!Array.isArray(value)) { check(value === null || ['number', 'string', 'boolean'].includes(typeof value), 'metadata scalar'); if (typeof value === 'string') check(value.length <= 65536, 'string budget'); return value; }
 const tag = value[0];
 if (tag === 0 && value.length === 1) return undefined;
 if (tag === 1 && value.length === 2) { check(finiteInt(value[1], 3), 'number tag'); return [NaN, Infinity, -Infinity, -0][value[1]]; }
 if (tag === 2 && value.length === 3) { const x = unpackMetadata(value[1], depth + 1, budget), y = unpackMetadata(value[2], depth + 1, budget); check(typeof x === 'number' && typeof y === 'number', 'vector'); return new Vector2(x, y); }
 if (tag === 5 && value.length === 2 && Array.isArray(value[1])) { check(value[1].length <= MAX_ITEMS, 'typed visual budget'); const values = value[1].map((v: any) => unpackMetadata(v, depth + 1, budget)); check(values.every((v: any) => typeof v === 'number'), 'typed visual value'); return new Float32Array(values); }
 check(value.length === 2 && (tag === 3 || tag === 4) && Array.isArray(value[1]) && value[1].length <= MAX_ITEMS, 'metadata container');
 if (tag === 3) return value[1].map((v: any) => unpackMetadata(v, depth + 1, budget));
 const result: Record<string, any> = {};
 for (const pair of value[1]) {
  check(Array.isArray(pair) && pair.length === 2 && typeof pair[0] === 'string' && pair[0].length <= 256 && !forbidden.has(pair[0]) && !Object.hasOwn(result, pair[0]), 'metadata key');
  result[pair[0]] = unpackMetadata(pair[1], depth + 1, budget);
 }
 return result;
}

function numberFields(value: any, fields: readonly string[]): boolean {
 return value && typeof value === 'object' && fields.every(key => typeof value[key] === 'number');
}
function validateShipExtras(extra: any): void {
 check(validSurfaceFeedback(extra.surfaceFeedback), 'surface feedback');
 check(extra.fireControlMode === 'AI' || extra.fireControlMode === 'MANUAL', 'fire-control mode');
 check((extra.playerTargetId === null || typeof extra.playerTargetId === 'string') && typeof extra.visibilityOverflow === 'string', 'ship display strings');
 check(Array.isArray(extra.phaseGhosts) && extra.phaseGhosts.length <= 256 && extra.phaseGhosts.every((v: any) => numberFields(v, ['facingRad', 'alpha', 'life', 'maxLife']) && v.pos instanceof Vector2), 'phase ghosts');
 check(Array.isArray(extra.scorchMarks) && extra.scorchMarks.length <= MAX_ITEMS && extra.scorchMarks.every((v: any) => numberFields(v, ['cellIndex', 'opacity', 'intensity', 'heat', 'flash', 'flashElapsed', 'phase', 'pulsePeriod', 'size', 'rotationRad', 'variant']) && typeof v.justHit === 'boolean' && ['cracks', 'burns', 'holes'].includes(v.kind) && v.localPos instanceof Vector2), 'scorch marks');
 check(extra.presentationPose === undefined || numberFields(extra.presentationPose, ['facing']) && extra.presentationPose.pos instanceof Vector2, 'presentation pose');
 check(Array.isArray(extra.weaponGroups) && extra.weaponGroups.length <= 512 && extra.weaponGroups.every((v: any) => numberFields(v, ['index', 'alternatingIndex']) && ['LINKED', 'ALTERNATING'].includes(v.mode) && typeof v.isAutofire === 'boolean' && Array.isArray(v.weaponSlotIds) && v.weaponSlotIds.length <= 512 && v.weaponSlotIds.every((id: any) => typeof id === 'string' && id.length <= 256)), 'weapon groups');
}
function validateSystemExtras(extra: any): void {
 check(typeof extra.type === 'string' && ['IDLE', 'IN', 'ACTIVE', 'OUT', 'COOLDOWN'].includes(extra.state) && typeof extra.pulseOffset === 'number', 'system metadata');
 const v = extra.teleportVisual;
 check(v === undefined || numberFields(v, ['serial', 'destinationFacing']) && v.destination instanceof Vector2 && (v.origin === undefined || v.origin instanceof Vector2) && (v.originFacing === undefined || typeof v.originFacing === 'number'), 'teleport metadata');
}
function validateWeapon(spec: any, extra: any, checkDefinition: boolean): void {
 check(extra.loadedMissileLevels === undefined || validLoadedMissileLevels(extra.loadedMissileLevels), 'loaded missile levels');
 check(typeof extra.slotId === 'string' && extra.slotId.length <= 256 && ['TURRET', 'HARDPOINT', 'HIDDEN'].includes(extra.mountType) && (extra.presentationRelativeAngle === undefined || typeof extra.presentationRelativeAngle === 'number'), 'weapon metadata');
 if (!checkDefinition) return;
 check(typeof spec.id === 'string' && spec.id.length <= 256, 'weapon definition');
 // Admit only data and bundled effect/texture references at the cold boundary.
 for (const [key, value] of Object.entries(spec)) if (key !== 'glowColor' && key !== 'mirv') check(value == null || ['number', 'string', 'boolean', 'undefined'].includes(typeof value), 'weapon definition field');
 const assets = ['displayIconUrl', 'turretSpriteUrl', 'hardpointSpriteUrl', 'turretGunSpriteUrl', 'hardpointGunSpriteUrl', 'glowSpriteUrl', 'hardpointGlowSpriteUrl', 'projSpriteUrl'];
 const resources = (value: any): void => {
  for (const key of assets) if (value[key] != null && value[key] !== '') check(typeof value[key] === 'string' && assetManager.isLoaded && assetManager.hasPath(value[key]), 'unbundled weapon asset');
  for (const [key, kind] of [['onHitEffect', 'hit'], ['beamEffect', 'beam'], ['everyFrameEffect', 'advance']] as const) if (value[key] != null && value[key] !== '') requireWeaponEffect(value[key], kind, 'ship display');
 };
 resources(spec);
 if (spec.mirv != null) { check(typeof spec.mirv === 'object' && !Array.isArray(spec.mirv), 'mirv display'); if (spec.mirv.childProjectile != null) { check(typeof spec.mirv.childProjectile === 'object' && !Array.isArray(spec.mirv.childProjectile), 'mirv child display'); resources(spec.mirv.childProjectile); } }
 check(spec.glowColor == null || Array.isArray(spec.glowColor) && spec.glowColor.length <= 4 && spec.glowColor.every((v: any) => typeof v === 'number'), 'weapon glow');
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
function freezeMetadata(value: any): any { if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const v of Object.values(value)) freezeMetadata(v); Object.freeze(value); } return value; }
interface Definition { id: number; value: any; bytes: Uint8Array }
interface RecordRow { at: number; extra: any }
interface WeaponRow extends RecordRow { life: number; definition: number; position: number; range: number }
interface SystemRow extends RecordRow { life: number; definition: number }
interface ShipRow extends RecordRow {
 life: number; definition: number; carrier: number; vectors: number;
 shield: RecordRow; flux: RecordRow; armor: number; accelerating: boolean;
 systems: SystemRow[]; system: number; engines: number[]; weapons: WeaponRow[];
}
interface Payload { definitions: Array<[number, any]>; ships: ShipRow[] }
export interface ShipDisplayFrame { readonly epoch: number; readonly tick: number; readonly ships: readonly ProjectedRenderShip[]; readonly bytes: number }

/** One encoder per acknowledged reliable stream. ACK only after receiver validation,
 * never after send(). Unacknowledged definitions repeat, so skipped display frames
 * do not lose definitions. No second production ACK mechanism is installed here. */
export class ShipDisplayEncoder {
 private readonly projection = new RenderShipProjection();
 private readonly weapons = new RenderWeaponDictionary();
 private readonly systemDefinitions = new WeakMap<object, { visuals: unknown }>();
 private readonly identities = new WeakMap<object, number>();
 private nextIdentity = 1;
 private nextDefinition = 1;
 private readonly immutableDefinitions = new WeakMap<object, Definition>();
 private readonly mutableDefinitions = new WeakMap<object, Definition>();
 private readonly known = new Set<number>();
 private readonly sent = new Map<number, number[]>();
 private lastTick = -1;
 constructor(readonly epoch = 1) { check(finiteInt(epoch, 0xffffffff) && epoch > 0, 'epoch'); }
 private identity(value: object): number { let id = this.identities.get(value); if (!id) { id = this.nextIdentity++; check(id <= 0xffffffff, 'identity budget'); this.identities.set(value, id); } return id; }
 private definition(value: object): Definition {
  const immutable = isImmutableMetadata(value), cache = immutable ? this.immutableDefinitions : this.mutableDefinitions;
  const previous = cache.get(value); if (immutable && previous) return previous;
  const packed = packMetadata(value), bytes = encode(packed);
  if (previous && equalBytes(previous.bytes, bytes)) return previous;
  check(this.nextDefinition <= MAX_DEFINITIONS, 'definition budget; new epoch required');
  const entry = { id: this.nextDefinition++, value: packed, bytes }; cache.set(value, entry); return entry;
 }
 acknowledge(tick: number): boolean {
  const definitions = this.sent.get(tick); if (!definitions) return false;
  for (const id of definitions) this.known.add(id);
  for (const t of this.sent.keys()) if (t <= tick) this.sent.delete(t);
  return true;
 }
 capture(roots: readonly Ship[], tick: number, reset = false): ArrayBuffer | null {
  check(finiteInt(tick, Number.MAX_SAFE_INTEGER) && tick > this.lastTick, 'non-monotonic tick');
  reset ||= this.lastTick < 0;
  check(roots.length <= MAX_SHIPS && new Set(roots).size === roots.length, 'ship roster');
  if (!this.projection.supports(roots)) return null;
  this.weapons.begin();
  const ships: Ship[] = [...roots], reached = new Set(ships);
  for (let i = 0; i < ships.length; i++) { const carrier = ships[i].sourceCarrier; if (carrier && !reached.has(carrier)) { check(ships.length < MAX_SHIPS, 'carrier roster'); ships.push(carrier); reached.add(carrier); } }
  const numbers: number[] = [], definitions = new Map<number, Definition>(), used = new Set<number>();
  const define = (value: object): number => { const entry = this.definition(value); used.add(entry.id); if (reset || !this.known.has(entry.id)) definitions.set(entry.id, entry); return entry.id; };
  const record = (value: any, numeric: readonly string[], booleans: readonly string[], extras: readonly string[], overrides?: Record<string, unknown>): RecordRow => {
   const at = numbers.length;
   for (const key of numeric) { check(typeof value[key] === 'number', 'non-numeric ' + key); numbers.push(value[key]); }
   for (const key of booleans) { check(typeof value[key] === 'boolean', 'non-boolean ' + key); numbers.push(value[key] ? 1 : 0); }
   return { at, extra: packMetadata(Object.fromEntries(extras.map(key => [key, overrides && Object.hasOwn(overrides, key) ? overrides[key] : value[key]]))) };
  };
  const vector = (v: Vector2): number => { check(v && typeof v.x === 'number' && typeof v.y === 'number', 'vector'); const at = numbers.length; numbers.push(v.x, v.y); return at; };
  const rows = ships.map(source => {
   // Sample the audited read set directly; do not construct the old projected
   // object graph merely to serialize it into another representation.
   const ship = source;
   const row = record(ship, layout.SHIP_NUMBERS, layout.SHIP_BOOLEANS, SHIP_EXTRA, { presentationPose: shipPresentationPose(ship) }) as ShipRow;
   row.life = this.identity(source); row.definition = define(ship.spec); row.carrier = source.sourceCarrier ? this.identity(source.sourceCarrier) : 0;
   row.vectors = vector(ship.pos); vector(ship.prevPos); vector(ship.vel);
   row.shield = record(ship.shield, layout.SHIELD_NUMBERS, layout.SHIELD_BOOLEANS, SHIELD_EXTRA, { hitSegmentLevels: ship.shield.presentationHitSegmentLevels() });
   row.flux = record(ship.flux, layout.FLUX_NUMBERS, layout.FLUX_BOOLEANS, FLUX_EXTRA);
   row.armor = ship.armor.cellWidth; row.accelerating = ship.engineController.flameAccelerating;
   const systems = [...ship.allSystems]; if (!systems.includes(ship.system)) systems.push(ship.system);
   check(systems.length <= 64 && ship.weapons.length <= 512 && ship.engineStatuses.length <= 256, 'ship component budget');
   row.system = systems.indexOf(ship.system);
   row.systems = systems.map(system => {
    let definition = this.systemDefinitions.get(system.definition);
    if (!definition) { definition = { visuals: system.definition.visuals }; this.systemDefinitions.set(system.definition, definition); }
    else definition.visuals = system.definition.visuals;
    return { ...record(system, layout.SYSTEM_NUMBERS, layout.SYSTEM_BOOLEANS, SYSTEM_EXTRA, { pulseOffset: pulsePusherOffset(system) }), life: this.identity(system), definition: define(definition) };
   });
   row.engines = ship.engineStatuses.map(status => record(status, layout.ENGINE_NUMBERS, [], []).at);
   row.weapons = ship.weapons.map(mount => ({ ...record(mount, layout.WEAPON_NUMBERS, layout.WEAPON_BOOLEANS, WEAPON_EXTRA, { presentationRelativeAngle: weaponPresentationAngle(mount, 0) }), life: this.identity(mount), definition: define(this.weapons.project(mount.spec)), position: vector(mount.relativePos), range: packMetadata(combatWeaponRange(ship, mount.spec)) }));
   return row;
  });
  this.weapons.finish();
  const metadata = encode({ definitions: [...definitions.values()].map(d => [d.id, d.value]), ships: rows } satisfies Payload);
  const start = (HEADER + metadata.length + 7) & ~7, size = start + numbers.length * 8;
  check(size <= MAX_BYTES, 'packet budget');
  const buffer = new ArrayBuffer(size), view = new DataView(buffer);
  view.setUint32(0, MAGIC, true); view.setUint32(4, 3, true); view.setUint32(8, this.epoch, true); view.setUint32(12, metadata.length, true);
  view.setUint32(16, numbers.length, true); view.setUint32(20, rows.length, true); view.setFloat64(24, tick, true); view.setUint32(32, reset ? 1 : 0, true);
  new Uint8Array(buffer, HEADER, metadata.length).set(metadata);
  if (littleEndian) new Float64Array(buffer, start).set(numbers); else for (let i = 0; i < numbers.length; i++) view.setFloat64(start + i * 8, numbers[i], true);
  if (reset) { this.known.clear(); this.sent.clear(); }
  this.sent.set(tick, [...used]); while (this.sent.size > 64) this.sent.delete(this.sent.keys().next().value!);
  this.lastTick = tick;
  return buffer;
 }
}

type Bound = { target: any; buffer: DisplayBufferRecord; extra: any; row: RecordRow };
function makeBound(target: any, numeric: readonly string[], booleans: readonly string[], extras: readonly string[]): Bound {
 const buffer = new DisplayBufferRecord(numeric, booleans), bound: Bound = { target, buffer, extra: {}, row: { at: 0, extra: {} } };
 buffer.attach(target);
 for (const key of extras) Object.defineProperty(target, key, { enumerable: true, get: () => bound.extra[key] });
 return bound;
}
interface Replica { ship: Bound; shield: Bound; flux: Bound; pos: Bound[]; systems: Map<number, Bound>; weapons: Map<number, { state: Bound; position: Bound }>; engines: Bound[] }
function vectorBound(): Bound { return makeBound(new Vector2(), ['x', 'y'], [], []); }
function newReplica(): Replica {
 const ship = makeBound(new ProjectedRenderShip(), layout.SHIP_NUMBERS, layout.SHIP_BOOLEANS, SHIP_EXTRA);
 const shield = makeBound({}, layout.SHIELD_NUMBERS, layout.SHIELD_BOOLEANS, SHIELD_EXTRA);
 const flux = makeBound({}, layout.FLUX_NUMBERS, layout.FLUX_BOOLEANS, FLUX_EXTRA);
 const pos = [vectorBound(), vectorBound(), vectorBound()];
 Object.assign(ship.target, { shield: shield.target, flux: flux.target, pos: pos[0].target, prevPos: pos[1].target, vel: pos[2].target, weaponRanges: new Map() });
 return { ship, shield, flux, pos, systems: new Map(), weapons: new Map(), engines: [] };
}

/** decode copies caller-owned bytes exactly once. No view can later be corrupted
 * by mutating the network input. Validate all offsets/identities before swapping
 * any live record. Historical snapshots are not retained by these live facades. */
export class ShipDisplayDecoder {
 private epoch = 0;
 private tick = -1;
 private definitions = new Map<number, { value: any; bytes: Uint8Array }>();
 private replicas = new Map<number, Replica>();
 private readonly validatedSpecs = new WeakSet<object>();
 private readonly validatedSystems = new WeakSet<object>();
 private readonly validatedWeapons = new WeakSet<object>();
 get lastTick(): number { return this.tick; }
 decode(input: ArrayBuffer): ShipDisplayFrame {
  check(input instanceof ArrayBuffer && input.byteLength >= HEADER && input.byteLength <= MAX_BYTES, 'packet length');
  const buffer = input.slice(0), view = new DataView(buffer);
  check(view.getUint32(0, true) === MAGIC && view.getUint32(4, true) === 3, 'protocol');
  const epoch = view.getUint32(8, true), length = view.getUint32(12, true), count = view.getUint32(16, true), shipCount = view.getUint32(20, true), tick = view.getFloat64(24, true), flags = view.getUint32(32, true);
  check(flags <= 1 && view.getUint32(36, true) === 0 && epoch > 0 && finiteInt(tick, Number.MAX_SAFE_INTEGER), 'header');
  check((epoch === this.epoch && tick > this.tick) || (flags === 1 && epoch > this.epoch), 'stale or unknown epoch');
  check(length <= MAX_BYTES - HEADER && shipCount <= MAX_SHIPS, 'section budget');
  const start = (HEADER + length + 7) & ~7;
  check(count <= MAX_BYTES / 8 && start + count * 8 === buffer.byteLength, 'section length');
  const data = littleEndian ? new Float64Array(buffer, start) : Float64Array.from({ length: count }, (_, i) => view.getFloat64(start + i * 8, true));
  const payload = decode(new Uint8Array(buffer, HEADER, length), { maxStrLength: 65536, maxArrayLength: MAX_ITEMS, maxMapLength: 2048, maxBinLength: MAX_BYTES }) as Payload;
  check(payload && Array.isArray(payload.definitions) && payload.definitions.length <= MAX_DEFINITIONS && Array.isArray(payload.ships) && payload.ships.length === shipCount, 'payload');
  const definitions = flags ? new Map<number, { value: any; bytes: Uint8Array }>() : new Map(this.definitions);
  const introduced = new Set<number>();
  for (const entry of payload.definitions) {
   check(Array.isArray(entry) && entry.length === 2 && finiteInt(entry[0], MAX_DEFINITIONS) && entry[0] > 0, 'definition identity');
   check(!introduced.has(entry[0]), 'duplicate definition'); introduced.add(entry[0]);
   const bytes = encode(entry[1]), old = definitions.get(entry[0]);
   check(!old || equalBytes(bytes, old.bytes), 'definition conflict');
   if (!old) { const value = unpackMetadata(entry[1]); check(value && typeof value === 'object' && !Array.isArray(value), 'definition value'); definitions.set(entry[0], { bytes, value: freezeMetadata(value) }); }
  }
  check(definitions.size <= MAX_DEFINITIONS, 'definition budget');
  const required = (id: number): any => { check(finiteInt(id, MAX_DEFINITIONS) && definitions.has(id), 'missing definition'); return definitions.get(id)!.value; };
  const range = (at: number, size: number): void => check(finiteInt(at, count) && at + size <= count, 'record bounds');
  const validateRecord = (row: RecordRow, numeric: readonly string[], booleans: readonly string[], extras: readonly string[]): void => {
   check(row && typeof row === 'object', 'record'); range(row.at, numeric.length + booleans.length);
   for (let i = 0; i < booleans.length; i++) check(data[row.at + numeric.length + i] === 0 || data[row.at + numeric.length + i] === 1, 'boolean');
   row.extra = unpackMetadata(row.extra); check(row.extra && typeof row.extra === 'object' && !Array.isArray(row.extra) && Object.keys(row.extra).length === extras.length && extras.every(k => Object.hasOwn(row.extra, k)), 'extra shape');
  };
  const ids = new Set<number>(), names = new Set<string>(), items = new Set<number>(); let totalItems = 0;
  for (const row of payload.ships) {
   validateRecord(row, layout.SHIP_NUMBERS, layout.SHIP_BOOLEANS, SHIP_EXTRA);
   check(finiteInt(row.life, 0xffffffff) && row.life > 0 && !ids.has(row.life) && typeof row.extra.id === 'string' && row.extra.id.length <= 256 && !names.has(row.extra.id), 'ship identity'); ids.add(row.life); names.add(row.extra.id);
   const spec = required(row.definition); if (!this.validatedSpecs.has(spec)) { validateShipSpec(spec, { allowExistingId: true, requireBundledAssets: true }); this.validatedSpecs.add(spec); } range(row.vectors, 6);
   validateShipExtras(row.extra);
   validateRecord(row.shield, layout.SHIELD_NUMBERS, layout.SHIELD_BOOLEANS, SHIELD_EXTRA); validateRecord(row.flux, layout.FLUX_NUMBERS, layout.FLUX_BOOLEANS, FLUX_EXTRA);
   check(typeof row.shield.extra.type === 'string' && typeof row.shield.extra.phaseState === 'string' && row.shield.extra.hitSegmentLevels instanceof Float32Array && typeof row.flux.extra.hullSize === 'string', 'shield/flux metadata');
   check(typeof row.armor === 'number' && typeof row.accelerating === 'boolean', 'ship visuals');
   check(Array.isArray(row.systems) && row.systems.length > 0 && row.systems.length <= 64 && finiteInt(row.system, row.systems.length - 1) && Array.isArray(row.weapons) && row.weapons.length <= 512 && Array.isArray(row.engines) && row.engines.length <= 256, 'component roster');
   totalItems += row.systems.length + row.weapons.length + row.engines.length; check(totalItems <= MAX_ITEMS, 'component budget');
   for (const system of row.systems) { validateRecord(system, layout.SYSTEM_NUMBERS, layout.SYSTEM_BOOLEANS, SYSTEM_EXTRA); check(finiteInt(system.life, 0xffffffff) && system.life > 0 && !items.has(system.life), 'system identity'); items.add(system.life); const definition = required(system.definition); if (!this.validatedSystems.has(definition)) { check(Object.keys(definition).length === 1 && Object.hasOwn(definition, 'visuals'), 'system definition'); validateSystemVisuals(definition.visuals); this.validatedSystems.add(definition); } validateSystemExtras(system.extra); }
   for (const weapon of row.weapons) { weapon.range = unpackMetadata(weapon.range); validateRecord(weapon, layout.WEAPON_NUMBERS, layout.WEAPON_BOOLEANS, WEAPON_EXTRA); check(finiteInt(weapon.life, 0xffffffff) && weapon.life > 0 && !items.has(weapon.life) && typeof weapon.range === 'number', 'weapon identity'); items.add(weapon.life); const spec = required(weapon.definition); validateWeapon(spec, weapon.extra, !this.validatedWeapons.has(spec)); this.validatedWeapons.add(spec); range(weapon.position, 2); }
   for (const at of row.engines) range(at, layout.ENGINE_NUMBERS.length);
  }
  for (const row of payload.ships) check(row.carrier === 0 || ids.has(row.carrier), 'carrier reference');
  // Everything above is inert. Publication below only binds previously validated
  // data to our own facade objects; untrusted setters and Ship methods are absent.
  const next = new Map<number, Replica>(), ships: ProjectedRenderShip[] = [];
  const bind = (target: Bound, row: RecordRow): void => { target.buffer.bind(data, row.at); target.row = row; target.extra = row.extra; };
  for (const row of payload.ships) {
   const replica = (!flags && this.replicas.get(row.life)) || newReplica(); next.set(row.life, replica); ships.push(replica.ship.target);
   bind(replica.ship, row); bind(replica.shield, row.shield); bind(replica.flux, row.flux);
   for (let i = 0; i < 3; i++) replica.pos[i].buffer.bind(data, row.vectors + i * 2);
   const target = replica.ship.target;
   Object.assign(target, { spec: required(row.definition), armor: { cellWidth: row.armor }, engineController: { flameAccelerating: row.accelerating } });
   const systems = new Map<number, Bound>();
   target.allSystems = row.systems.map(system => { const state = replica.systems.get(system.life) ?? makeBound(new ProjectedRenderSystem(), layout.SYSTEM_NUMBERS, layout.SYSTEM_BOOLEANS, SYSTEM_EXTRA); bind(state, system); state.target.definition = required(system.definition); systems.set(system.life, state); return state.target; });
   target.system = target.allSystems[row.system]; replica.systems = systems;
   target.engineStatuses = row.engines.map((at, i) => { const state = replica.engines[i] ?? makeBound({}, layout.ENGINE_NUMBERS, [], []); state.buffer.bind(data, at); replica.engines[i] = state; return state.target; }); replica.engines.length = row.engines.length;
   const weapons = new Map<number, { state: Bound; position: Bound }>(); target.weaponRanges.clear();
   target.weapons = row.weapons.map(weapon => { const item = replica.weapons.get(weapon.life) ?? { state: makeBound(new ProjectedRenderWeapon(), layout.WEAPON_NUMBERS, layout.WEAPON_BOOLEANS, WEAPON_EXTRA), position: vectorBound() }; bind(item.state, weapon); item.position.buffer.bind(data, weapon.position); Object.assign(item.state.target, { spec: required(weapon.definition), relativePos: item.position.target }); target.weaponRanges.set(item.state.target, weapon.range); weapons.set(weapon.life, item); return item.state.target; }); replica.weapons = weapons;
  }
  for (const row of payload.ships) next.get(row.life)!.ship.target.sourceCarrier = row.carrier ? next.get(row.carrier)!.ship.target : undefined;
  this.definitions = definitions; this.replicas = next; this.tick = tick; this.epoch = epoch;
  return { epoch, tick, ships, bytes: buffer.byteLength };
 }
}

/** Renderer-only adapter. World/HUD/control migration is deliberately NOT hidden
 * behind this helper. IDs absent from the packet are rejected rather than showing
 * stale authority objects beside direct-buffer replicas. */
export function displayShipLookup(frame: ShipDisplayFrame): ReadonlyMap<string, ShipRenderState> {
 return new Map(frame.ships.map(ship => [ship.id, ship]));
}

/** Use the decoded ship lane with the existing renderer, while world effects
 * keep their existing source. This is explicitly a mixed transport adapter,
 * not a checkpoint or a claim that HUD/input/world have migrated. */
export function shipDisplayRenderView(world: CombatRenderView, frame: ShipDisplayFrame): CombatRenderView {
 const lookup = displayShipLookup(frame);
 const find = (ship: ShipRenderState): ShipRenderState => {
  const value = lookup.get(ship.id); check(value, 'renderer ship missing from packet'); return value!;
 };
 return {
  ...world,
  kind: 'borrowed-combat-render-view',
  ships: world.ships.map(find),
  allCapitalShips: world.allCapitalShips.map(find),
  playerShip: find(world.playerShip),
  enemyShip: find(world.enemyShip),
  hulkFragments: world.hulkFragments.map(hulk => ({ ...hulk, sourceShip: find(hulk.sourceShip) })),
 };
}
