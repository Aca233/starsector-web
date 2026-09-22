import { CombatHudProjector, HudContactRecord, type CombatHudView } from '../CombatHudView';
import { TacticalMapViewProjector, type TacticalMapSnapshot } from '../TacticalMapView';
import { DeploymentViewProjector, type DeploymentView } from '../DeploymentView';
import { PackedVisualEncoder, PackedVisualDecoder, omitPackedVisuals, packedVisualFields, type PackedVisualPacket } from './PackedVisualState';
// Initialize the existing composition root before looking up component prototypes.
import '../../simulation/CombatEngine';
import { RenderShipProjection, ProjectedRenderShip, ProjectedRenderSystem, ProjectedRenderWeapon } from './RenderShipProjection';
import { immutableCopy, isImmutableMetadata } from '../../extensions/Immutable';
import { pulsePusherOffset } from '../../extensions/ship-systems/PulseDrive';
import { setPresentationPulseOffset } from '../../render/ShipSystemPresentation';
import { ShipWeaponControlSystem } from '../../simulation/systems/ShipWeaponControlSystem';
import { Vector2 } from '../../math/Vector2';
import { Ship } from '../../simulation/Ship';
import { ArmorGrid } from '../../simulation/ArmorGrid';
import { FluxTracker } from '../../simulation/FluxTracker';
import { Shield } from '../../simulation/Shield';
import { ShipSystem } from '../../simulation/ShipSystem';
import { ShipDamageState } from '../../simulation/ShipDamageState';
import { EngineController } from '../../simulation/systems/EngineController';
import { RuntimeCombatModifiers } from '../../extensions/RuntimeCombatModifiers';
import { shipSystemDefinitions } from '../../extensions/ship-systems/Registry';
import type { CombatEngine } from '../../simulation/CombatEngine';
import { combatRenderView, type CombatRenderView } from '../../render/CombatRenderView';

// Local same-build projection, NOT a savegame/checkpoint. Executable code is never decoded.
const classes = [null, Ship, ArmorGrid, FluxTracker, Shield, ShipSystem, ShipDamageState, EngineController, RuntimeCombatModifiers, ShipWeaponControlSystem, Vector2, ProjectedRenderShip, ProjectedRenderSystem, ProjectedRenderWeapon, HudContactRecord] as const;
const prototypes = new Map<object, number>(classes.flatMap((ctor, i) => ctor ? [[ctor.prototype, i] as [object, number]] : []));
const behaviorKeys = classes.map(ctor => new Set(ctor ? Object.getOwnPropertyNames(ctor.prototype) : []));
const typed = [Float64Array, Float32Array, Int32Array, Uint32Array, Int16Array, Uint16Array, Int8Array, Uint8Array, Uint8ClampedArray] as const;
type NumericArray = InstanceType<typeof typed[number]>;
const enum Kind { Object, Array, Map, Set, Typed, Vector }
const enum Tag { Undefined, Null, False, True, Number, String, Ref, Metadata, System }
const LIMIT = 250_000, VALUE_LIMIT = 8_000_000;
const integer = (n: number) => Number.isSafeInteger(n) && n >= 0;
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const omit = new Set(['random', 'visualRandom', 'autofire', 'combatShips', 'fireControlWorld', 'tacticalAI',
  'hullDamageInterceptors', 'externalPhaseEffects', 'statusEffects', 'damageTakenModifiers', 'lowCRDamageSequence']);
interface Shape { type: number; keys: string[] }
export interface CombatPresentationPacket {
  epoch: number; revision: number; tick: number; visuals: PackedVisualPacket;
  buffer: ArrayBuffer; length: number; nodeCount: number; liveNodeCount: number; removed: number[]; strings: string[]; shapes: Shape[];
  metadata: { id: number; value: unknown }[];
}
export interface DetachedCombatPresentation {
  view: CombatRenderView & { readonly kind: 'detached-combat-render-view' };
  hud: {
    read: CombatHudView;
    deployment: DeploymentView;
    map: TacticalMapSnapshot;
    tactical: { readonly commandPoints: number; readonly selectedUnitId: string | null; readonly isTacticalMap: boolean; readonly orders: ReadonlyMap<string, Readonly<import('../../simulation/CombatTypes').TacticalOrder>> };
    battleResult: CombatEngine['battleResult']; isBattleResultReady: boolean;
    floatingTexts: CombatEngine['floatingTexts']; shipLossNotifications: CombatEngine['shipLossNotifications']; notificationTime: number;
  };
}
/** Validate immutable dictionary entries before copying/freezing; no executable values. */
function metadataUnits(value: unknown): number {
  const pending: [unknown, number][] = [[value, 0]], seen = new Set<object>();
  let units = 0;
  while (pending.length) {
    const [item, depth] = pending.pop()!;
    units += typeof item === 'string' ? item.length + 1 : 1;
    if (units > VALUE_LIMIT || depth > 128) throw new Error('Presentation metadata budget exceeded');
    if (item === null || item === undefined || ['boolean', 'number', 'string'].includes(typeof item)) continue;
    if (typeof item !== 'object' || seen.has(item)) throw new Error('Invalid presentation metadata');
    const prototype = Object.getPrototypeOf(item);
    if (!Array.isArray(item) && prototype !== Object.prototype && prototype !== null) throw new Error('Invalid metadata prototype');
    seen.add(item);
    for (const [key, child] of Object.entries(item)) {
      if (forbidden.has(key)) throw new Error('Invalid metadata key');
      units += key.length; pending.push([child, depth + 1]);
    }
  }
  return units;
}


type WireValue = number | string;
interface Snapshot { kind: Kind; type: number; keys: string[]; values: WireValue[] }
const sameKeys = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((key, i) => key === b[i]);
/** Lossless deltas within the selected read contract. Compatibility checks every
 * mutable graph field; render mode checks the explicit display projection, including
 * mutable weapon artwork. IDs never alias another object in an epoch. Neither mode
 * is a replay checkpoint. */
export class CombatPresentationEncoder {
  private readonly visuals = new PackedVisualEncoder();
  private readonly hud = new CombatHudProjector();
  private readonly map = new TacticalMapViewProjector();
  private readonly deployment = new DeploymentViewProjector();
  private readonly renderShips = new RenderShipProjection();
  private renderMode?: boolean;
  private readonly identities = new WeakMap<object, number>();
  private readonly metadataSizes = new WeakMap<object, number>();
  private priorMetadata = new Set<number>();
  private snapshots = new Map<number, Snapshot>();
  private nextIdentity = 1;
  private revision = 0;
  private failed = false;
  constructor(readonly epoch: number, readonly mode: 'compatibility' | 'render' = 'compatibility') { if (!integer(epoch) || !epoch) throw new Error('Invalid presentation epoch'); if (mode !== 'compatibility' && mode !== 'render') throw new Error('Invalid presentation mode'); }
  capture(engine: CombatEngine, tick: number, recycled?: ArrayBuffer, recycledVisuals?: ArrayBuffer): CombatPresentationPacket {
    if (this.failed) throw new Error('Presentation encoder failed; a new epoch is required');
    try { return this.captureDelta(engine, tick, recycled, recycledVisuals); }
    catch (error) { this.failed = true; throw error; }
  }
  private captureDelta(engine: CombatEngine, tick: number, recycled?: ArrayBuffer, recycledVisuals?: ArrayBuffer): CombatPresentationPacket {
    if (!integer(tick)) throw new Error('Invalid presentation tick');
    let data = new Float64Array(recycled && recycled.byteLength >= 8192 && recycled.byteLength % 8 === 0 && recycled.byteLength <= VALUE_LIMIT * 8 ? recycled : new ArrayBuffer(8192));
    let cursor = 0, metadataSize = 0, fullUnits = 2, nodeCount = 0;
    const strings: string[] = [], stringIds = new Map<string, number>();
    const shapes: Shape[] = [], shapeIds = new Map<string, number>();
    const metadata: CombatPresentationPacket['metadata'] = [], usedMetadata = new Set<number>();
    const pending: object[] = [], ids: number[] = [], seen = new Set<object>(), next = new Map<number, Snapshot>();
    let scratch: WireValue[] = [];
    let at = 0, changed = false, previous: Snapshot | undefined;
    const write = (n: number) => {
      if (cursor >= VALUE_LIMIT) throw new Error('Presentation buffer budget exceeded');
      if (cursor === data.length) { const larger = new Float64Array(Math.min(VALUE_LIMIT, data.length * 2)); larger.set(data); data = larger; }
      data[cursor++] = n;
    };
    const text = (s: string) => {
      let id = stringIds.get(s);
      if (id === undefined) { id = strings.length; stringIds.set(s, id); strings.push(s); }
      return id;
    };
    const scalar = (v: WireValue) => { if (!previous || !Object.is(scratch[at], v)) changed = true; scratch[at++] = v; };
    this.renderShips.begin();
    const supported = this.mode === 'render' && this.renderShips.supports([engine.playerShip, engine.enemyShip,
      ...engine.ships, ...engine.allCapitalShips, ...engine.hulkFragments.map(hulk => hulk.sourceShip)]);
    if (this.renderMode === true && !supported) throw new Error('Presentation read contract changed; a new compatibility epoch is required');
    this.renderMode ??= supported;
    const renderShips = this.renderMode;
    const value = (v: unknown): void => {
      if (renderShips && v instanceof Ship) v = this.renderShips.project(v);
      if (v === undefined) { scalar(Tag.Undefined); scalar(0); return; }
      if (v === null) { scalar(Tag.Null); scalar(0); return; }
      if (typeof v === 'boolean') { scalar(v ? Tag.True : Tag.False); scalar(0); return; }
      if (typeof v === 'number') { scalar(Tag.Number); scalar(v); return; }
      if (typeof v === 'string') { scalar(Tag.String); scalar(v); return; }
      if (typeof v !== 'object') throw new Error('Unsupported presentation value');
      let id = this.identities.get(v);
      if (!id) { id = this.nextIdentity++; this.identities.set(v, id); }
      if (isImmutableMetadata(v)) {
        if (!usedMetadata.has(id)) {
          let units = this.metadataSizes.get(v);
          if (units === undefined) { units = metadataUnits(v); this.metadataSizes.set(v, units); }
          metadataSize += units;
          if (metadataSize > VALUE_LIMIT || usedMetadata.size >= LIMIT) throw new Error('Presentation metadata budget exceeded');
          if (!this.priorMetadata.has(id)) metadata.push({ id, value: v });
          usedMetadata.add(id);
        }
        scalar(Tag.Metadata); scalar(id); return;
      }
      if (!seen.has(v)) {
        if (pending.length >= LIMIT) throw new Error('Presentation node budget exceeded');
        seen.add(v); pending.push(v); ids.push(id);
      }
      scalar(Tag.Ref); scalar(id);
    };
    const borrowed = combatRenderView(engine);
    const visuals = this.visuals.capture(borrowed, recycledVisuals);
    const view = { ...borrowed, kind: 'detached-combat-render-view', movingRayFades: borrowed.movingRayFades,
      trailStrips: Array.from(borrowed.trailStrips), projectileVisuals: borrowed.projectileVisuals,
      projectilePrediction: borrowed.projectilePrediction, localMuzzles: borrowed.localMuzzles, localParticles: borrowed.localParticles };
    if (renderShips) {
      view.playerWings = borrowed.playerWings.map(wing => ({ specId: wing.specId }));
      view.enemyWings = borrowed.enemyWings.map(wing => ({ specId: wing.specId }));
    }
    omitPackedVisuals(view, visuals);
    value({ view,
      hud: { read: this.hud.capture(engine), map: this.map.capture(engine, this.epoch), deployment: this.deployment.capture(engine, this.epoch), tactical: { commandPoints: engine.commandPoints, selectedUnitId: engine.selectedUnitId, isTacticalMap: engine.isTacticalMap, orders: engine.orders },
        battleResult: engine.battleResult, isBattleResultReady: engine.isBattleResultReady,
        floatingTexts: engine.floatingTexts, shipLossNotifications: engine.shipLossNotifications, notificationTime: engine.notificationTime } });
    write(Tag.Ref); write(ids[0]);
    for (let index = 0; index < pending.length; index++) {
      const object = pending[index], id = ids[index];
      previous = this.snapshots.get(id); scratch = previous?.values ?? [];
      const priorLength = scratch.length; at = 0; changed = !previous;
      let kind: Kind, type = 0, keys: string[] = [];
      if (object instanceof Vector2 && Object.keys(object).length === 2) {
        kind = Kind.Vector; scalar(object.x); scalar(object.y);
      } else if (Array.isArray(object)) {
        kind = Kind.Array; for (const item of object) value(item);
      } else if (object instanceof Map) {
        kind = Kind.Map; for (const [key, item] of object) { value(key); value(item); }
      } else if (object instanceof Set) {
        kind = Kind.Set; for (const item of object) value(item);
      } else if (ArrayBuffer.isView(object)) {
        kind = Kind.Typed; type = typed.findIndex(ctor => object instanceof ctor);
        if (type < 0) throw new Error('Unsupported presentation typed array');
        for (const item of object as NumericArray) scalar(item);
      } else {
        kind = Kind.Object;
        const prototype = Object.getPrototypeOf(object); type = prototypes.get(prototype) ?? 0;
        if (!type && prototype !== Object.prototype && prototype !== null) throw new Error('Unaudited presentation class: ' + prototype?.constructor?.name);
        const system = object instanceof ShipSystem, ship = object instanceof Ship;
        keys = Object.keys(object).filter(key => !forbidden.has(key) && !omit.has(key)
          && typeof (object as Record<string, unknown>)[key] !== 'function'
          && !(system && (key === 'isActive' || key === 'statusText')) && !(ship && (key === 'isPhased' || key === 'phaseVisualAlpha')));
        if (ship) keys.push('isPhased', 'phaseVisualAlpha');
        if (system) { keys.push('isActive', 'statusText'); scalar(pulsePusherOffset(object)); }
        for (const key of keys) {
          if (system && key === 'definition') { scalar(Tag.System); scalar(object.type); }
          else value((object as Record<string, unknown>)[key]);
        }
      }
      fullUnits += 4 + at;
      if (fullUnits > VALUE_LIMIT) throw new Error('Presentation live data budget exceeded');
      if (previous && (previous.kind !== kind || previous.type !== type)) throw new Error('Presentation identity changed type');
      changed ||= !previous || priorLength !== at || !sameKeys(previous.keys, keys);
      scratch.length = at;
      if (!changed) { next.set(id, previous!); continue; }
      const snapshot = previous ?? { kind, type, keys, values: scratch };
      snapshot.keys = keys; next.set(id, snapshot);
      nodeCount++; write(id); write(kind);
      let start = 0;
      if (kind === Kind.Vector || kind === Kind.Typed) {
        if (kind === Kind.Typed) { write(type); write(at); }
        for (let j = 0; j < at; j++) write(scratch[j] as number);
        continue;
      }
      if (kind === Kind.Object) {
        const signature = type + ':' + JSON.stringify(keys);
        let shape = shapeIds.get(signature);
        if (shape === undefined) { shape = shapes.length; shapeIds.set(signature, shape); shapes.push({ type, keys }); }
        write(shape);
        if (classes[type] === ShipSystem) { write(scratch[0] as number); start = 1; }
      } else write(at / 2);
      for (let j = start; j < at; j += 2) {
        const tag = scratch[j] as number, payload = scratch[j + 1];
        write(tag); write(tag === Tag.String || tag === Tag.System ? text(payload as string) : payload as number);
      }
    }
    const removed: number[] = [];
    for (const id of this.snapshots.keys()) if (!next.has(id)) removed.push(id);
    this.snapshots = next; this.priorMetadata = usedMetadata;
    this.renderShips.finish();
    return { epoch: this.epoch, revision: ++this.revision, tick, buffer: data.buffer as ArrayBuffer, length: cursor,
      nodeCount, liveNodeCount: pending.length, removed, strings, shapes, metadata, visuals };
  }
}

interface Links { kind: Kind; type: number; units: number; keys: readonly string[]; refs: number[]; metadata: number[] }
interface Entry extends Links { value: object }
interface Plan extends Links { id: number; offset: number; length: number }
/** Stable display-owned records, NOT immutable/history/checkpoint state. Deltas are
 * strictly sequential; validate the complete candidate graph before mutating a record. */
export class CombatPresentationDecoder {
  private readonly visuals = new PackedVisualDecoder();
  private objects = new Map<number, Entry>();
  private metadata = new Map<number, { value: unknown; units: number }>();
  private revision = 0;
  private tick = -1;
  constructor(readonly epoch: number) {}
  apply(packet: CombatPresentationPacket): DetachedCombatPresentation {
    if (!packet || packet.epoch !== this.epoch || packet.revision !== this.revision + 1 || !integer(packet.tick) || packet.tick < this.tick
      || !(packet.buffer instanceof ArrayBuffer) || !integer(packet.length) || packet.length < 2 || packet.length > VALUE_LIMIT || packet.length * 8 > packet.buffer.byteLength
      || !integer(packet.nodeCount) || packet.nodeCount > LIMIT || !integer(packet.liveNodeCount) || packet.liveNodeCount > LIMIT
      || !Array.isArray(packet.removed) || packet.removed.length > LIMIT || !Array.isArray(packet.shapes) || packet.shapes.length > LIMIT
      || !Array.isArray(packet.strings) || packet.strings.length > VALUE_LIMIT || !Array.isArray(packet.metadata) || packet.metadata.length > LIMIT)
      throw new Error('Invalid or stale presentation packet');
    this.visuals.validate(packet.visuals);
    let textUnits = 0;
    for (const string of packet.strings) { if (typeof string !== 'string') throw new Error('Invalid presentation string'); textUnits += string.length; }
    if (textUnits > VALUE_LIMIT) throw new Error('Presentation string budget exceeded');
    for (const shape of packet.shapes) {
      if (!shape || !integer(shape.type) || shape.type >= classes.length || !Array.isArray(shape.keys) || shape.keys.length > VALUE_LIMIT) throw new Error('Invalid presentation shape');
      const keys = new Set<string>();
      for (const key of shape.keys) {
        if (typeof key !== 'string' || forbidden.has(key) || omit.has(key) || keys.has(key)) throw new Error('Invalid presentation property');
        const projected = classes[shape.type] === Ship && (key === 'isPhased' || key === 'phaseVisualAlpha')
          || classes[shape.type] === ShipSystem && (key === 'isActive' || key === 'statusText');
        if (behaviorKeys[shape.type].has(key) && !projected) throw new Error('Presentation property shadows executable behavior');
        keys.add(key); textUnits += key.length;
      }
    }
    if (textUnits > VALUE_LIMIT) throw new Error('Presentation shape budget exceeded');
    const metadata = new Map(this.metadata);
    for (const entry of packet.metadata) {
      if (!entry || !integer(entry.id) || !entry.id || metadata.has(entry.id) || this.objects.has(entry.id)) throw new Error('Invalid metadata identity');
      const units = metadataUnits(entry.value); metadata.set(entry.id, { value: immutableCopy(entry.value), units });
    }
    const candidate = new Map<number, Links>(this.objects), removed = new Set<number>();
    for (const id of packet.removed) {
      if (!integer(id) || !candidate.delete(id) || removed.has(id)) throw new Error('Invalid retired presentation identity');
      removed.add(id);
    }
    const data = new Float64Array(packet.buffer, 0, packet.length);
    let cursor = 0;
    const read = () => { if (cursor >= data.length) throw new Error('Truncated presentation buffer'); return data[cursor++]; };
    const index = (limit: number) => { const n = read(); if (!integer(n) || n >= limit) throw new Error('Invalid presentation index'); return n; };
    const plans = new Map<number, Plan>();
    const checkValue = (links: Links) => {
      const tag = index(Tag.System + 1), n = read();
      if (tag === Tag.Ref) { if (!integer(n) || !n) throw new Error('Invalid presentation reference'); links.refs.push(n); }
      else if (tag === Tag.Metadata) { if (!metadata.has(n)) throw new Error('Unresolved metadata reference'); links.metadata.push(n); }
      else if (tag === Tag.String || tag === Tag.System) {
        if (!integer(n) || n >= packet.strings.length) throw new Error('Invalid presentation string reference');
        if (tag === Tag.System) shipSystemDefinitions.require(packet.strings[n]);
      } else if (tag !== Tag.Number && n !== 0) throw new Error('Invalid presentation scalar');
    };
    if (read() !== Tag.Ref) throw new Error('Invalid presentation root reference');
    const root = read();
    for (let i = 0; i < packet.nodeCount; i++) {
      const id = read(), kind = index(Kind.Vector + 1);
      if (!integer(id) || !id || plans.has(id) || removed.has(id) || metadata.has(id)) throw new Error('Invalid presentation identity');
      const plan: Plan = { id, kind, type: 0, units: 0, keys: [], refs: [], metadata: [], offset: cursor, length: 0 };
      if (kind === Kind.Vector) { read(); read(); }
      else if (kind === Kind.Typed) { plan.type = index(typed.length); plan.length = index(VALUE_LIMIT + 1); cursor += plan.length; }
      else if (kind === Kind.Object) {
        const shape = packet.shapes[index(packet.shapes.length)]; plan.type = shape.type; plan.keys = shape.keys;
        if (classes[plan.type] === ShipSystem && !Number.isFinite(read())) throw new Error('Invalid system presentation offset');
        for (let j = 0; j < plan.keys.length; j++) checkValue(plan);
      } else {
        plan.length = index(VALUE_LIMIT + 1);
        if (kind === Kind.Map && plan.length % 2) throw new Error('Invalid presentation map size');
        for (let j = 0; j < plan.length; j++) checkValue(plan);
      }
      if (cursor > data.length) throw new Error('Truncated presentation buffer');
      plan.units = cursor - plan.offset + 2;
      const previous = this.objects.get(id);
      if (previous && (previous.kind !== kind || previous.type !== plan.type)) throw new Error('Presentation identity changed type');
      plans.set(id, plan); candidate.set(id, plan);
    }
    if (cursor !== data.length) throw new Error('Trailing presentation data');
    if (candidate.size !== packet.liveNodeCount) throw new Error('Invalid live presentation count');
    // Roots are freshly published envelopes, never authority objects or stale frames.
    const rootPlan = plans.get(root), viewSlot = rootPlan?.keys.indexOf('view') ?? -1, hudSlot = rootPlan?.keys.indexOf('hud') ?? -1;
    if (!rootPlan || rootPlan.kind !== Kind.Object || rootPlan.type !== 0 || viewSlot < 0 || hudSlot < 0
      || data[rootPlan.offset + 1 + viewSlot * 2] !== Tag.Ref || data[rootPlan.offset + 1 + hudSlot * 2] !== Tag.Ref)
      throw new Error('Invalid presentation root reference');
    const viewPlan = plans.get(data[rootPlan.offset + 2 + viewSlot * 2]), kindSlot = viewPlan?.keys.indexOf('kind') ?? -1;
    if (!viewPlan || viewPlan.kind !== Kind.Object || viewPlan.type !== 0 || kindSlot < 0
      || data[viewPlan.offset + 1 + kindSlot * 2] !== Tag.String
      || packet.strings[data[viewPlan.offset + 2 + kindSlot * 2]] !== 'detached-combat-render-view') throw new Error('Invalid presentation view kind');
    for (let i = 0; i < packedVisualFields.length; i++) {
      const slot = viewPlan.keys.indexOf(packedVisualFields[i]);
      const tag = slot < 0 ? -1 : data[viewPlan.offset + 1 + slot * 2];
      if (tag !== (packet.visuals.fields.includes(i) ? Tag.Null : Tag.Ref)) throw new Error('Packed visual projection mismatch');
    }
    const reachable = new Set<number>(), usedMetadata = new Set<number>(), pending = [root];
    let metadataSize = 0, liveUnits = 2;
    for (let i = 0; i < pending.length; i++) {
      const id = pending[i]; if (reachable.has(id)) continue;
      const links = candidate.get(id); if (!links) throw new Error('Unresolved presentation reference');
      reachable.add(id); liveUnits += links.units;
      if (liveUnits > VALUE_LIMIT) throw new Error('Presentation live data budget exceeded');
      for (const child of links.refs) if (!reachable.has(child)) pending.push(child);
      for (const entry of links.metadata) {
        if (usedMetadata.has(entry)) continue;
        const value = metadata.get(entry); if (!value) throw new Error('Unresolved retained metadata reference');
        usedMetadata.add(entry); metadataSize += value.units;
      }
    }
    if (reachable.size !== candidate.size) throw new Error('Unreachable presentation records');
    if (metadataSize > VALUE_LIMIT) throw new Error('Presentation metadata budget exceeded');
    const next = new Map(this.objects), replacements = new Map<object, object>();
    for (const id of removed) next.delete(id);
    for (const plan of plans.values()) {
      const prior = this.objects.get(plan.id);
      let value = prior?.value;
      if (!value || (plan.kind === Kind.Typed && (value as NumericArray).length !== plan.length)) {
        value = plan.kind === Kind.Vector ? new Vector2() : plan.kind === Kind.Typed ? new typed[plan.type](plan.length)
          : plan.kind === Kind.Array ? [] : plan.kind === Kind.Map ? new Map() : plan.kind === Kind.Set ? new Set() : Object.create(classes[plan.type]?.prototype ?? null);
        if (prior) replacements.set(prior.value, value!);
      }
      next.set(plan.id, { kind: plan.kind, type: plan.type, units: plan.units, keys: plan.keys.slice(), refs: plan.refs, metadata: plan.metadata, value: value! });
    }
    const decode = (): unknown => {
      const tag = data[cursor++], n = data[cursor++];
      switch (tag) {
        case Tag.Undefined: return undefined; case Tag.Null: return null; case Tag.False: return false; case Tag.True: return true;
        case Tag.Number: return n; case Tag.String: return packet.strings[n]; case Tag.Ref: return next.get(n)!.value;
        case Tag.Metadata: return metadata.get(n)!.value; case Tag.System: return shipSystemDefinitions.require(packet.strings[n]);
      }
    };
    // Allocation happens before writing refs, including length-tracking typed arrays.
    for (const plan of plans.values()) {
      const target = next.get(plan.id)!.value;
      cursor = plan.offset;
      if (plan.kind === Kind.Vector) { (target as Vector2).x = read(); (target as Vector2).y = read(); }
      else if (plan.kind === Kind.Typed) { cursor += 2; (target as NumericArray).set(data.subarray(cursor, cursor + plan.length)); }
      else if (plan.kind === Kind.Array) { cursor++; const array = target as unknown[]; array.length = plan.length; for (let j = 0; j < plan.length; j++) array[j] = decode(); }
      else if (plan.kind === Kind.Map) { cursor++; const map = target as Map<unknown, unknown>; map.clear(); for (let j = 0; j < plan.length; j += 2) { const key = decode(); map.set(key, decode()); } }
      else if (plan.kind === Kind.Set) { cursor++; const set = target as Set<unknown>; set.clear(); for (let j = 0; j < plan.length; j++) set.add(decode()); }
      else {
        cursor++;
        if (target instanceof ShipSystem) setPresentationPulseOffset(target, read());
        const oldKeys = this.objects.get(plan.id)?.keys ?? [];
        if (!sameKeys(oldKeys, plan.keys)) {
          const keys = new Set(plan.keys);
          for (const key of oldKeys) if (!keys.has(key)) delete (target as Record<string, unknown>)[key];
        }
        for (const key of plan.keys) {
          const v = decode();
          if (Object.hasOwn(target, key)) (target as Record<string, unknown>)[key] = v;
          else Object.defineProperty(target, key, { value: v, writable: true, enumerable: true, configurable: true });
        }
      }
    }
    // Resizing a length-tracking typed array replaces its display storage. Retained
    // parents must rebind even when their logical reference IDs did not change.
    if (replacements.size) {
      const rebind = (v: unknown) => typeof v === 'object' && v !== null ? replacements.get(v) ?? v : v;
      for (const [id, entry] of next) {
        if (plans.has(id) || !entry.refs.length) continue;
        const target = entry.value;
        if (entry.kind === Kind.Array) { const array = target as unknown[]; for (let i = 0; i < array.length; i++) array[i] = rebind(array[i]); }
        else if (entry.kind === Kind.Map) { const map = target as Map<unknown, unknown>, pairs = [...map]; map.clear(); for (const [key, v] of pairs) map.set(rebind(key), rebind(v)); }
        else if (entry.kind === Kind.Set) { const set = target as Set<unknown>, values = [...set]; set.clear(); for (const v of values) set.add(rebind(v)); }
        else if (entry.kind === Kind.Object) { const record = target as Record<string, unknown>; for (const key of entry.keys) record[key] = rebind(record[key]); }
      }
    }
    this.objects = next; this.metadata = new Map([...metadata].filter(([id]) => usedMetadata.has(id)));
    this.revision = packet.revision; this.tick = packet.tick;
    const result = next.get(root)!.value as DetachedCombatPresentation;
    this.visuals.applyValidated(packet.visuals, result.view);
    return result;
  }
  get retainedObjects(): number { return this.objects.size; }
}
