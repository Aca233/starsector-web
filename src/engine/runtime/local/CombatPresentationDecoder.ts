import type { LanPresentationUiSnapshot } from '../../../network/LanPresentationViews';
import { ProjectedRenderShip } from '../../render/ProjectedRenderState';
import { Vector2 } from '../../math/Vector2';
import { immutableCopy } from '../../extensions/Immutable';
import { PackedVisualDecoder, packedVisualFields } from './PackedVisualState';
import { classes, behaviorKeys, typed, Kind, Tag, LIMIT, VALUE_LIMIT, integer, forbidden, simulationTypes, metadataUnits, type NumericArray, type CombatPresentationMode, type CombatPresentationGraphPacket, type CombatPresentationPacket, type DetachedCombatPresentation } from './CombatPresentationWire';
interface Links { kind: Kind; type: number; units: number; keys: readonly string[]; refs: number[]; metadata: number[] }
type WireValue = number | string;
interface Entry extends Links { value: object; row?: WireValue[] }
interface Plan extends Links { id: number; offset: number; length: number; entry?: Entry; row?: WireValue[] }
/** Stable display-owned records, NOT immutable/history/checkpoint state. Deltas are
 * strictly sequential; validate the complete candidate graph before mutating a record. */
export class CombatPresentationDecoder {
  private readonly visuals = new PackedVisualDecoder();
  private readonly objects = new Map<number, Entry>();
  private metadata = new Map<number, { value: unknown; units: number }>();
  private revision = 0;
  private tick = -1;
  constructor(readonly epoch: number, readonly mode: CombatPresentationMode = 'render-strict', private readonly channel: 'render' | 'ui' = 'render') {
    if (mode !== 'render' && mode !== 'render-strict') throw new Error('Invalid presentation decoder mode');
    if ((!integer(epoch) || !epoch)) throw new Error('Invalid presentation epoch');
  }
  apply(packet: CombatPresentationPacket): DetachedCombatPresentation {
    if (this.channel !== 'render') throw Error('UI decoder cannot accept a render packet');
    const result = this.applyGraph(packet) as DetachedCombatPresentation;
    this.visuals.applyValidated(packet.visuals, result.view);
    return result;
  }
  applyUi(packet: CombatPresentationGraphPacket): LanPresentationUiSnapshot {
    if (this.channel !== 'ui') throw Error('Render decoder cannot accept UI');
    return this.applyGraph(packet) as LanPresentationUiSnapshot;
  }
  private applyGraph(packet: CombatPresentationGraphPacket): object {
    if (!packet || packet.epoch !== this.epoch || packet.revision !== this.revision + 1 || !integer(packet.tick) || packet.tick < this.tick
      || !(packet.buffer instanceof ArrayBuffer) || !integer(packet.length) || packet.length < 2 || packet.length > VALUE_LIMIT || packet.length * 8 > packet.buffer.byteLength
      || !integer(packet.nodeCount) || packet.nodeCount > LIMIT || !integer(packet.liveNodeCount) || packet.liveNodeCount > LIMIT
      || !Array.isArray(packet.removed) || packet.removed.length > LIMIT || !Array.isArray(packet.shapes) || packet.shapes.length > LIMIT
      || !Array.isArray(packet.strings) || packet.strings.length > VALUE_LIMIT || !Array.isArray(packet.metadata) || packet.metadata.length > LIMIT)
      throw new Error('Invalid or stale presentation packet');
    if (this.channel === 'render') this.visuals.validate((packet as CombatPresentationPacket).visuals);
    else if (Object.hasOwn(packet, 'visuals') || packet.metadata.length || packet.buffer.byteLength > VALUE_LIMIT * 8)
      throw Error('Non-UI payload or oversized UI buffer');
    let textUnits = 0;
    for (const string of packet.strings) { if (typeof string !== 'string') throw new Error('Invalid presentation string'); textUnits += string.length; }
    if (textUnits > VALUE_LIMIT) throw new Error('Presentation string budget exceeded');
    for (const shape of packet.shapes) {
      if (!shape || !integer(shape.type) || shape.type >= classes.length || !Array.isArray(shape.keys) || shape.keys.length > VALUE_LIMIT) throw new Error('Invalid presentation shape');
      if (simulationTypes.has(shape.type)) throw new Error('Simulation class in strict presentation');
      if (this.channel === 'ui' && shape.type !== 0 && shape.type !== 10 && shape.type !== 14) throw Error('Non-UI presentation prototype');
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
    const removed = new Set<number>();
    let candidateSize = this.objects.size;
    for (const id of packet.removed) {
      if (!integer(id) || !this.objects.has(id) || removed.has(id)) throw new Error('Invalid retired presentation identity');
      removed.add(id); candidateSize--;
    }
    const data = new Float64Array(packet.buffer, 0, packet.length);
    let cursor = 0, expandedUnits = 2;
    const read = () => { if (cursor >= data.length) throw new Error('Truncated presentation buffer'); return data[cursor++]; };
    const index = (limit: number) => { const n = read(); if (!integer(n) || n >= limit) throw new Error('Invalid presentation index'); return n; };
    const plans = new Map<number, Plan>();
    // Read-only overlay: no full index copy and no writes to accepted state.
    // Every reachable node/edge and budget is still validated below.
    const candidate = (id: number): Links | undefined => removed.has(id) ? undefined : plans.get(id) ?? this.objects.get(id);
    const checkValue = (links: Links, row?: WireValue[]) => {
      const tag = index(Tag.System + 1), n = read();
      if (tag === Tag.System) throw new Error('Executable system definition in strict presentation');
      if (tag === Tag.Ref) { if (!integer(n) || !n) throw new Error('Invalid presentation reference'); links.refs.push(n); }
      else if (tag === Tag.Metadata) { if (!metadata.has(n)) throw new Error('Unresolved metadata reference'); links.metadata.push(n); }
      else if (tag === Tag.String || tag === Tag.System) {
        if (!integer(n) || n >= packet.strings.length) throw new Error('Invalid presentation string reference');
       } else if (tag !== Tag.Number && n !== 0) throw new Error('Invalid presentation scalar');
      if (row) row.push(tag, tag === Tag.String ? packet.strings[n] : n);
    };
    if (read() !== Tag.Ref) throw new Error('Invalid presentation root reference');
    const root = read();
    for (let i = 0; i < packet.nodeCount; i++) {
      const id = read(), wireKind = index(Kind.ObjectPatch + 1), kind = wireKind === Kind.ObjectPatch ? Kind.Object : wireKind;
      if (!integer(id) || !id || plans.has(id) || removed.has(id) || metadata.has(id)) throw new Error('Invalid presentation identity');
      const plan: Plan = { id, kind, type: 0, units: 0, keys: [], refs: [], metadata: [], offset: cursor, length: 0, entry: undefined };
      if (wireKind === Kind.ObjectPatch) {
        const previous = this.objects.get(id);
        if (this.channel !== 'render' || !previous || previous.kind !== Kind.Object || !previous.row)
          throw Error('Invalid presentation patch base');
        const count = index(previous.keys.length + 1);
        if (!count || count * 3 >= previous.row.length) throw Error('Non-sparse presentation patch');
        if (expandedUnits + previous.units > VALUE_LIMIT) throw Error('Presentation expanded data budget exceeded');
        plan.type = previous.type; plan.keys = previous.keys;
        // Never reconstruct from the mutable display object, and never mutate
        // accepted history until the entire candidate graph has been validated.
        const row = plan.row = previous.row.slice();
        let priorField = -1;
        for (let j = 0; j < count; j++) {
          const field = index(plan.keys.length), tag = index(Tag.System + 1), n = read();
          if (field <= priorField) throw Error('Invalid presentation patch order');
          priorField = field;
          if (tag === Tag.String && (!integer(n) || n >= packet.strings.length)) throw Error('Invalid presentation string reference');
          row[field * 2] = tag; row[field * 2 + 1] = tag === Tag.String ? packet.strings[n] : n;
        }
        // Validate the complete reconstructed row and rebuild all graph edges,
        // not just the changed fields. Strings in history are actual values.
        for (let j = 0; j < row.length; j += 2) {
          const tag = row[j] as number, n = row[j + 1];
          if (tag === Tag.System) throw Error('Executable system definition in strict presentation');
          if (tag === Tag.Ref) {
            if (typeof n !== 'number' || !integer(n) || !n) throw Error('Invalid presentation reference');
            plan.refs.push(n);
          } else if (tag === Tag.Metadata) {
            if (typeof n !== 'number' || !metadata.has(n)) throw Error('Unresolved metadata reference');
            plan.metadata.push(n);
          } else if (tag === Tag.String) {
            if (typeof n !== 'string') throw Error('Invalid presentation string reference');
          } else if (tag !== Tag.Number && n !== 0) throw Error('Invalid presentation scalar');
        }
      }
      else if (kind === Kind.Vector) { read(); read(); }
      else if (kind === Kind.Typed) { plan.type = index(typed.length); plan.length = index(VALUE_LIMIT + 1); cursor += plan.length; }
      else if (kind === Kind.Object) {
        const shape = packet.shapes[index(packet.shapes.length)]; plan.type = shape.type; plan.keys = shape.keys;
        if (this.channel === 'render') plan.row = [];
        for (let j = 0; j < plan.keys.length; j++) checkValue(plan, plan.row);
      } else {
        plan.length = index(VALUE_LIMIT + 1);
        if (kind === Kind.Map && plan.length % 2) throw new Error('Invalid presentation map size');
        for (let j = 0; j < plan.length; j++) checkValue(plan);
      }
      if (cursor > data.length) throw new Error('Truncated presentation buffer');
      plan.units = wireKind === Kind.ObjectPatch ? 3 + plan.row!.length : cursor - plan.offset + 2;
      expandedUnits += plan.units;
      if (expandedUnits > VALUE_LIMIT) throw Error('Presentation expanded data budget exceeded');
      const previous = this.objects.get(id);
      if (previous && (previous.kind !== kind || previous.type !== plan.type)) throw new Error('Presentation identity changed type');
      plans.set(id, plan); if (!previous) candidateSize++;
    }
    if (cursor !== data.length) throw new Error('Trailing presentation data');
    const rowTag = (plan: Plan, slot: number): number => plan.row ? plan.row[slot * 2] as number : data[plan.offset + 1 + slot * 2];
    const rowPayload = (plan: Plan, slot: number): WireValue => plan.row ? plan.row[slot * 2 + 1] : data[plan.offset + 2 + slot * 2];
    if (candidateSize !== packet.liveNodeCount) throw new Error('Invalid live presentation count');
    // Roots are freshly published envelopes, never authority objects or stale frames.
    if (this.channel === 'ui') {
      const envelope = plans.get(root);
      const keys = ['kind', 'hud', 'map', 'deployment', 'presence'];
      if (!envelope || envelope.kind !== Kind.Object || envelope.type !== 0 || envelope.keys.length !== keys.length
        || keys.some(key => !envelope.keys.includes(key))) throw Error('Invalid UI presentation envelope');
      for (const key of keys) {
        const offset = envelope.offset + 1 + envelope.keys.indexOf(key) * 2;
        if (key === 'kind') {
          if (data[offset] !== Tag.String || packet.strings[data[offset + 1]] !== 'lan-presentation-ui') throw Error('Invalid UI presentation kind');
        } else {
          const node = candidate(data[offset + 1]);
          if (data[offset] !== Tag.Ref || !node || node.type !== 0 || node.kind !== (key === 'presence' ? Kind.Array : Kind.Object))
            throw Error('Invalid UI presentation root');
        }
      }
    } else {
      const rootPlan = plans.get(root), viewSlot = rootPlan?.keys.indexOf('view') ?? -1, hudSlot = rootPlan?.keys.indexOf('hud') ?? -1;
      if (!rootPlan || rootPlan.kind !== Kind.Object || rootPlan.type !== 0 || viewSlot < 0 || hudSlot < 0
        || rowTag(rootPlan, viewSlot) !== Tag.Ref || rowTag(rootPlan, hudSlot) !== Tag.Ref)
        throw new Error('Invalid presentation root reference');
      const viewPlan = plans.get(rowPayload(rootPlan, viewSlot) as number), kindSlot = viewPlan?.keys.indexOf('kind') ?? -1;
      if (!viewPlan || viewPlan.kind !== Kind.Object || viewPlan.type !== 0 || kindSlot < 0
        || rowTag(viewPlan, kindSlot) !== Tag.String
        || rowPayload(viewPlan, kindSlot) !== 'detached-combat-render-view') throw new Error('Invalid presentation view kind');
      for (const key of ['playerShip', 'enemyShip']) {
        const slot = viewPlan.keys.indexOf(key);
        const ship = candidate(rowPayload(viewPlan, slot) as number);
        if (slot < 0 || rowTag(viewPlan, slot) !== Tag.Ref
          || !ship || ship.kind !== Kind.Object || classes[ship.type] !== ProjectedRenderShip)
          throw new Error('Missing strict projected ship root');
      }
      for (let i = 0; i < packedVisualFields.length; i++) {
        const slot = viewPlan.keys.indexOf(packedVisualFields[i]);
        const tag = slot < 0 ? -1 : rowTag(viewPlan, slot);
        if (tag !== ((packet as CombatPresentationPacket).visuals.fields.includes(i) ? Tag.Null : Tag.Ref)) throw new Error('Packed visual projection mismatch');
      }
    }
    // Set iteration visits newly added IDs in first-discovery (BFS) order.
    // It is both the unique worklist and the final reachability set; every
    // reachable node, edge and budget is still checked before any commit.
    const reachable = new Set<number>([root]), usedMetadata = new Set<number>();
    let metadataSize = 0, liveUnits = 2;
    for (const id of reachable) {
      const links = candidate(id); if (!links) throw new Error('Unresolved presentation reference');
      liveUnits += links.units;
      if (liveUnits > VALUE_LIMIT) throw new Error('Presentation live data budget exceeded');
      for (const child of links.refs) reachable.add(child);
      for (const entry of links.metadata) {
        if (usedMetadata.has(entry)) continue;
        const value = metadata.get(entry); if (!value) throw new Error('Unresolved retained metadata reference');
        usedMetadata.add(entry); metadataSize += value.units;
      }
    }
    if (reachable.size !== candidateSize) throw new Error('Unreachable presentation records');
    if (metadataSize > VALUE_LIMIT) throw new Error('Presentation metadata budget exceeded');
    const replacements = new Map<object, object>();
    // Stage only changed entries on their existing plans. Keep old keys/values
    // indexed until all allocations, writes and retained-parent rebindings finish.
    for (const plan of plans.values()) {
      const prior = this.objects.get(plan.id);
      let value = prior?.value;
      if (!value || (plan.kind === Kind.Typed && (value as NumericArray).length !== plan.length)) {
        value = plan.kind === Kind.Vector ? new Vector2() : plan.kind === Kind.Typed ? new typed[plan.type](plan.length)
          : plan.kind === Kind.Array ? [] : plan.kind === Kind.Map ? new Map() : plan.kind === Kind.Set ? new Set() : Object.create(classes[plan.type]?.prototype ?? null);
        if (prior) replacements.set(prior.value, value!);
      }
      plan.entry = { kind: plan.kind, type: plan.type, units: plan.units, keys: plan.keys.slice(), refs: plan.refs, metadata: plan.metadata, value: value!, row: plan.row };
    }
    const decode = (): unknown => {
      const tag = data[cursor++], n = data[cursor++];
      switch (tag) {
        case Tag.Undefined: return undefined; case Tag.Null: return null; case Tag.False: return false; case Tag.True: return true;
        case Tag.Number: return n; case Tag.String: return packet.strings[n]; case Tag.Ref: return (plans.get(n)?.entry ?? this.objects.get(n))!.value;
        case Tag.Metadata: return metadata.get(n)!.value;
      }
    };
    // Allocation happens before writing refs, including length-tracking typed arrays.
    for (const plan of plans.values()) {
      const target = plan.entry!.value;
      cursor = plan.offset;
      if (plan.kind === Kind.Vector) { (target as Vector2).x = read(); (target as Vector2).y = read(); }
      else if (plan.kind === Kind.Typed) { cursor += 2; (target as NumericArray).set(data.subarray(cursor, cursor + plan.length)); }
      else if (plan.kind === Kind.Array) { cursor++; const array = target as unknown[]; array.length = plan.length; for (let j = 0; j < plan.length; j++) array[j] = decode(); }
      else if (plan.kind === Kind.Map) { cursor++; const map = target as Map<unknown, unknown>; map.clear(); for (let j = 0; j < plan.length; j += 2) { const key = decode(); map.set(key, decode()); } }
      else if (plan.kind === Kind.Set) { cursor++; const set = target as Set<unknown>; set.clear(); for (let j = 0; j < plan.length; j++) set.add(decode()); }
      else {
        cursor++;
        let field = 0;
        const oldKeys = this.objects.get(plan.id)?.keys ?? [];
        if (!sameKeys(oldKeys, plan.keys)) {
          const keys = new Set(plan.keys);
          for (const key of oldKeys) if (!keys.has(key)) delete (target as Record<string, unknown>)[key];
        }
        for (const key of plan.keys) {
          let v: unknown;
          if (plan.row) {
            const tag = plan.row[field++] as number, n = plan.row[field++];
            switch (tag) {
              case Tag.Undefined: v = undefined; break; case Tag.Null: v = null; break;
              case Tag.False: v = false; break; case Tag.True: v = true; break;
              case Tag.Number: case Tag.String: v = n; break;
              case Tag.Ref: v = (plans.get(n as number)?.entry ?? this.objects.get(n as number))!.value; break;
              case Tag.Metadata: v = metadata.get(n as number)!.value; break;
            }
          } else v = decode();
          if (Object.hasOwn(target, key)) (target as Record<string, unknown>)[key] = v;
          else Object.defineProperty(target, key, { value: v, writable: true, enumerable: true, configurable: true });
        }
      }
    }
    // Resizing a length-tracking typed array replaces its display storage. Retained
    // parents must rebind even when their logical reference IDs did not change.
    if (replacements.size) {
      const rebind = (v: unknown) => typeof v === 'object' && v !== null ? replacements.get(v) ?? v : v;
      for (const [id, entry] of this.objects) {
        if (removed.has(id) || plans.has(id) || !entry.refs.length) continue;
        const target = entry.value;
        if (entry.kind === Kind.Array) { const array = target as unknown[]; for (let i = 0; i < array.length; i++) array[i] = rebind(array[i]); }
        else if (entry.kind === Kind.Map) { const map = target as Map<unknown, unknown>, pairs = [...map]; map.clear(); for (const [key, v] of pairs) map.set(rebind(key), rebind(v)); }
        else if (entry.kind === Kind.Set) { const set = target as Set<unknown>, values = [...set]; set.clear(); for (const v of values) set.add(rebind(v)); }
        else if (entry.kind === Kind.Object) { const record = target as Record<string, unknown>; for (const key of entry.keys) record[key] = rebind(record[key]); }
      }
    }
    for (const id of removed) this.objects.delete(id);
    for (const plan of plans.values()) this.objects.set(plan.id, plan.entry!);
    this.metadata = new Map([...metadata].filter(([id]) => usedMetadata.has(id)));
    this.revision = packet.revision; this.tick = packet.tick;
    return this.objects.get(root)!.value;
  }
  get retainedObjects(): number { return this.objects.size; }
}

function sameKeys(a: readonly string[], b: readonly string[]): boolean { return a.length === b.length && a.every((key,index) => key === b[index]); }
