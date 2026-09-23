import { ProjectedRenderShip } from '../../render/ProjectedRenderState';
import { Vector2 } from '../../math/Vector2';
import { immutableCopy } from '../../extensions/Immutable';
import { PackedVisualDecoder, packedVisualFields } from './PackedVisualState';
import { classes, behaviorKeys, typed, Kind, Tag, LIMIT, VALUE_LIMIT, integer, forbidden, simulationTypes, metadataUnits, type NumericArray, type CombatPresentationMode, type CombatPresentationPacket, type DetachedCombatPresentation } from './CombatPresentationWire';
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
  constructor(readonly epoch: number, readonly mode: CombatPresentationMode = 'render-strict') {
    if (mode !== 'render' && mode !== 'render-strict') throw new Error('Invalid presentation decoder mode');
    if ((!integer(epoch) || !epoch)) throw new Error('Invalid presentation epoch');
  }
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
      if (simulationTypes.has(shape.type)) throw new Error('Simulation class in strict presentation');
      const keys = new Set<string>();
      for (const key of shape.keys) {
        if (typeof key !== 'string' || forbidden.has(key) || keys.has(key)) throw new Error('Invalid presentation property');
        if (behaviorKeys[shape.type].has(key)) throw new Error('Presentation property shadows executable behavior');
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
      if (tag === Tag.System) throw new Error('Executable system definition in strict presentation');
      if (tag === Tag.Ref) { if (!integer(n) || !n) throw new Error('Invalid presentation reference'); links.refs.push(n); }
      else if (tag === Tag.Metadata) { if (!metadata.has(n)) throw new Error('Unresolved metadata reference'); links.metadata.push(n); }
      else if (tag === Tag.String || tag === Tag.System) {
        if (!integer(n) || n >= packet.strings.length) throw new Error('Invalid presentation string reference');
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
    for (const key of ['playerShip', 'enemyShip']) {
      const slot = viewPlan.keys.indexOf(key);
      const ship = candidate.get(data[viewPlan.offset + 2 + slot * 2]);
      if (slot < 0 || data[viewPlan.offset + 1 + slot * 2] !== Tag.Ref
        || !ship || ship.kind !== Kind.Object || classes[ship.type] !== ProjectedRenderShip)
        throw new Error('Missing strict projected ship root');
    }
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
        case Tag.Metadata: return metadata.get(n)!.value;
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

function sameKeys(a: readonly string[], b: readonly string[]): boolean { return a.length === b.length && a.every((key,index) => key === b[index]); }
