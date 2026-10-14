import type { LanPresentationUiSnapshot } from '../../../network/LanPresentationViews';
import { ProjectedRenderShip } from '../../render/ProjectedRenderState';
import { Vector2 } from '../../math/Vector2';
import { immutableCopy } from '../../extensions/Immutable';
import { PackedVisualDecoder, packedVisualFields } from './PackedVisualState';
import { classes, behaviorKeys, typed, Kind, Tag, LIMIT, VALUE_LIMIT, integer, forbidden, simulationTypes, metadataUnits, type NumericArray, type CombatPresentationMode, type CombatPresentationGraphPacket, type CombatPresentationPacket, type DetachedCombatPresentation } from './CombatPresentationWire';
interface Links { kind: Kind; type: number; units: number; keys: readonly string[]; refs: number[]; metadata: number[] }
type WireValue = number | string;
interface Entry extends Links { value: object; row?: WireValue[] }
interface Plan extends Links { id: number; offset: number; length: number; prior?: Entry; entry?: Entry; row?: WireValue[]; patchedFields?: number[]; patchCount?: number }
const ID_TABLE_LIMIT = 262_144;
const EMPTY_NUMBERS: number[] = [];
const EMPTY_STRINGS: readonly string[] = [];
const arrayIterator = Array.prototype[Symbol.iterator];
type FieldWriter = (rec: Record<string, unknown>, idx: number, val: unknown) => void;
const fieldWriters = new WeakMap<readonly string[], FieldWriter | null>();

function getFieldWriter(keys: readonly string[]): FieldWriter | null {
  let writer = fieldWriters.get(keys);
  if (writer !== undefined) return writer;
  try {
    let body = 'switch(idx){';
    for (let i = 0; i < keys.length; i++) {
      body += `case ${i}:rec[${JSON.stringify(keys[i])}]=val;return;`;
    }
    body += '}';
    writer = new Function('rec', 'idx', 'val', body) as FieldWriter;
  } catch {
    writer = null;
  }
  fieldWriters.set(keys, writer);
  return writer;
}

/** Stable display-owned records, NOT immutable/history/checkpoint state. Deltas are
 * strictly sequential; validate the complete candidate graph before mutating a record. */
export class CombatPresentationDecoder {
  private readonly visuals = new PackedVisualDecoder();
  private readonly objects = new Map<number, Entry>();
  private readonly entryById: (Entry | undefined)[] = [];
  private readonly planById: (Plan | undefined)[] = [];
  private readonly planList: Plan[] = [];
  private readonly planPool: Plan[] = [];
  private readonly canonicalShapes = new Map<string, (readonly string[])[]>();
  private readonly stateStamp = new Int32Array(ID_TABLE_LIMIT);
  private readonly visitStamp = new Int32Array(ID_TABLE_LIMIT);
  private worklist = new Int32Array(16384);
  private stampCounter = 0;
  private metadata = new Map<number, { value: unknown; units: number }>();
  private usedMetadataCount = 0;
  private rootId = 0;
  private liveUnits = 2;
  private metadataSize = 0;
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
    for (let i = 0; i < packet.strings.length; i++) {
      const string = packet.strings[i];
      if (typeof string !== 'string') throw new Error('Invalid presentation string');
      textUnits += string.length;
    }
    if (textUnits > VALUE_LIMIT) throw new Error('Presentation string budget exceeded');
    // One decoder-owned copy per validated shape. Entries may share it, while
    // later caller mutations of packet.shapes can never change accepted history.
    const shapes = new Array<{ type: number; keys: readonly string[] }>(packet.shapes.length);
    for (let i = 0; i < packet.shapes.length; i++) {
      const shape = packet.shapes[i];
      if (!shape || !integer(shape.type) || shape.type >= classes.length || !Array.isArray(shape.keys) || shape.keys.length > VALUE_LIMIT) throw new Error('Invalid presentation shape');
      if (simulationTypes.has(shape.type)) throw new Error('Simulation class in strict presentation');
      if (this.channel === 'ui' && shape.type !== 0 && shape.type !== 10 && shape.type !== 14) throw Error('Non-UI presentation prototype');
      const keys = new Set<string>();
      for (let j = 0; j < shape.keys.length; j++) {
        const key = shape.keys[j];
        if (typeof key !== 'string' || forbidden.has(key) || keys.has(key)) throw new Error('Invalid presentation property');
        if (behaviorKeys[shape.type].has(key)) throw new Error('Presentation property shadows executable behavior');
        keys.add(key); textUnits += key.length;
      }
      const bucket = shape.type + ':' + shape.keys.length + ':' + (shape.keys[0] ?? '');
      const candidates = this.canonicalShapes.get(bucket);
      let canonicalKeys: readonly string[] | undefined;
      if (candidates) {
        for (let c = 0; c < candidates.length; c++) {
          if (sameKeys(candidates[c], shape.keys)) { canonicalKeys = candidates[c]; break; }
        }
      }
      if (!canonicalKeys) {
        canonicalKeys = shape.keys.slice();
        if (candidates) candidates.push(canonicalKeys);
        else this.canonicalShapes.set(bucket, [canonicalKeys]);
      }
      shapes[i] = { type: shape.type, keys: canonicalKeys };
    }
    if (textUnits > VALUE_LIMIT) throw new Error('Presentation shape budget exceeded');
    const metadata = packet.metadata.length ? new Map(this.metadata) : this.metadata;
    const entryById = this.entryById;
    const planById = this.planById;
    const planList = this.planList;
    const planPool = this.planPool;
    const stateStamp = this.stateStamp;
    const visitStamp = this.visitStamp;
    for (let i = 0; i < packet.metadata.length; i++) {
      const entry = packet.metadata[i];
      if (!entry || !integer(entry.id) || !entry.id || metadata.has(entry.id) || (entry.id < ID_TABLE_LIMIT ? entryById[entry.id] !== undefined : this.objects.has(entry.id)))
        throw new Error('Invalid metadata identity');
      const units = metadataUnits(entry.value); metadata.set(entry.id, { value: immutableCopy(entry.value), units });
    }
    this.stampCounter = (this.stampCounter + 8) | 0;
    if (this.stampCounter <= 0 || this.stampCounter > 0x7ffffff0) {
      stateStamp.fill(0);
      visitStamp.fill(0);
      this.stampCounter = 8;
    }
    const removedTag = this.stampCounter;
    const planTag = this.stampCounter + 1;
    const visitTag = this.stampCounter + 2;
    const metaUsedTag = this.stampCounter + 3;
    let overflowRemoved: Set<number> | undefined;
    let overflowPlans: Map<number, Plan> | undefined;
    let candidateSize = this.objects.size;
    const packetRemoved = packet.removed;
    for (let i = 0; i < packetRemoved.length; i++) {
      const id = packetRemoved[i];
      if (!integer(id)) throw new Error('Invalid retired presentation identity');
      if (id < ID_TABLE_LIMIT) {
        if (entryById[id] === undefined || stateStamp[id] === removedTag) throw new Error('Invalid retired presentation identity');
        stateStamp[id] = removedTag;
      } else {
        if (!this.objects.has(id) || overflowRemoved?.has(id)) throw new Error('Invalid retired presentation identity');
        (overflowRemoved ??= new Set()).add(id);
      }
      candidateSize--;
    }
    const data = new Float64Array(packet.buffer, 0, packet.length);
    const dataLen = data.length;
    let cursor = 0, expandedUnits = 2;
    const read = () => { if (cursor >= dataLen) throw new Error('Truncated presentation buffer'); return data[cursor++]; };
    const index = (limit: number) => {
      if (cursor >= dataLen) throw new Error('Truncated presentation buffer');
      const n = data[cursor++];
      if ((n | 0) !== n || n < 0 || n >= limit) throw new Error('Invalid presentation index');
      return n;
    };
    const getPlan = (id: number): Plan | undefined => id < ID_TABLE_LIMIT ? (stateStamp[id] === planTag ? planById[id] : undefined) : overflowPlans?.get(id);
    const getPrior = (id: number): Entry | undefined => id < ID_TABLE_LIMIT ? entryById[id] : this.objects.get(id);
    const isRemoved = (id: number): boolean => id < ID_TABLE_LIMIT ? stateStamp[id] === removedTag : !!overflowRemoved?.has(id);
    // Read-only overlay: no full index copy and no writes to accepted state.
    // Every reachable node/edge and budget is still validated below.
    const candidate = (id: number): Links | undefined => {
      if (id < ID_TABLE_LIMIT) {
        const st = stateStamp[id];
        if (st === removedTag) return undefined;
        return st === planTag ? planById[id] : entryById[id];
      }
      return overflowRemoved?.has(id) ? undefined : overflowPlans?.get(id) ?? this.objects.get(id);
    };
    const checkValue = (links: Links, row?: WireValue[]) => {
      const tag = index(Tag.System + 1), n = read();
      if (tag === Tag.System) throw new Error('Executable system definition in strict presentation');
      if (tag === Tag.Ref) { if (!integer(n) || !n) throw new Error('Invalid presentation reference'); links.refs.push(n); }
      else if (tag === Tag.Metadata) { if (!metadata.has(n)) throw new Error('Unresolved metadata reference'); links.metadata.push(n); }
      else if (tag === Tag.String || tag === Tag.System) {
        if ((n | 0) !== n || n < 0 || n >= packet.strings.length) throw new Error('Invalid presentation string reference');
      } else if (tag !== Tag.Number && n !== 0) throw new Error('Invalid presentation scalar');
      if (row) row.push(tag, tag === Tag.String ? packet.strings[n] : n);
    };
    planList.length = 0;
    try {
      if (read() !== Tag.Ref) throw new Error('Invalid presentation root reference');
      const root = read();
      let graphEdgesChanged = root !== this.rootId || packetRemoved.length > 0 || packet.metadata.length > 0;
      let unitsDelta = 0;
      for (let i = 0; i < packet.nodeCount; i++) {
        const id = read(), wireKind = index(Kind.ObjectPatch + 1), kind = wireKind === Kind.ObjectPatch ? Kind.Object : wireKind;
        if (!integer(id) || !id || metadata.has(id)) throw new Error('Invalid presentation identity');
        let previous: Entry | undefined;
        if (id < ID_TABLE_LIMIT) {
          const st = stateStamp[id];
          if (st === planTag || st === removedTag) throw new Error('Invalid presentation identity');
          previous = entryById[id];
        } else {
          if (overflowPlans?.has(id) || overflowRemoved?.has(id)) throw new Error('Invalid presentation identity');
          previous = this.objects.get(id);
        }
        let plan = planPool[i];
        if (!plan) {
          plan = planPool[i] = {
            id, kind, type: 0, units: 0, keys: EMPTY_STRINGS,
            refs: EMPTY_NUMBERS, metadata: EMPTY_NUMBERS, offset: cursor, length: 0, prior: previous, entry: undefined,
            row: undefined, patchedFields: undefined, patchCount: 0,
          };
        } else {
          plan.id = id; plan.kind = kind; plan.type = 0; plan.units = 0; plan.keys = EMPTY_STRINGS;
          plan.refs = EMPTY_NUMBERS; plan.metadata = EMPTY_NUMBERS; plan.offset = cursor; plan.length = 0;
          plan.prior = previous; plan.entry = undefined; plan.row = undefined; plan.patchedFields = undefined; plan.patchCount = 0;
        }
        if (wireKind === Kind.ObjectPatch) {
          if (this.channel !== 'render' || !previous || previous.kind !== Kind.Object || !previous.row)
            throw Error('Invalid presentation patch base');
          const count = index(previous.keys.length + 1);
          if (!count || count * 3 >= previous.row.length) throw Error('Non-sparse presentation patch');
          if (expandedUnits + previous.units > VALUE_LIMIT) throw Error('Presentation expanded data budget exceeded');
          plan.type = previous.type; plan.keys = previous.keys;
          const prevRow = previous.row;
          const patchStart = cursor;
          let linksChanged = false;
          let priorField = -1;
          const kLen = plan.keys.length;
          const sLen = packet.strings.length;
          for (let j = 0; j < count; j++) {
            const field = index(kLen), tag = index(Tag.System + 1), n = read();
            if (field <= priorField) throw Error('Invalid presentation patch order');
            priorField = field;
            if (tag === Tag.System) throw Error('Executable system definition in strict presentation');
            if (tag === Tag.Ref) {
              if (!integer(n) || !n) throw Error('Invalid presentation reference');
              linksChanged = true;
            } else if (tag === Tag.Metadata) {
              if (!metadata.has(n)) throw Error('Unresolved metadata reference');
              linksChanged = true;
            } else if (tag === Tag.String) {
              if ((n | 0) !== n || n < 0 || n >= sLen) throw Error('Invalid presentation string reference');
            } else if (tag !== Tag.Number && n !== 0) throw Error('Invalid presentation scalar');
            const oldTag = prevRow[field * 2];
            if (oldTag === Tag.Ref || oldTag === Tag.Metadata) linksChanged = true;
          }
          if (!linksChanged) {
            plan.row = prevRow;
            plan.refs = previous.refs;
            plan.metadata = previous.metadata;
            plan.patchCount = count;
          } else {
            graphEdgesChanged = true;
            // Never reconstruct from the mutable display object, and never mutate
            // accepted history until the entire candidate graph has been validated.
            const row = plan.row = prevRow.slice();
            const patchedFields = plan.patchedFields = [];
            plan.refs = [];
            plan.metadata = [];
            let pCursor = patchStart;
            for (let j = 0; j < count; j++) {
              const field = data[pCursor++], tag = data[pCursor++], n = data[pCursor++];
              patchedFields.push(field);
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
        }
        else if (kind === Kind.Vector) {
          read(); read();
          if (previous) { plan.refs = previous.refs; plan.metadata = previous.metadata; }
        }
        else if (kind === Kind.Typed) {
          plan.type = index(typed.length); plan.length = index(VALUE_LIMIT + 1); cursor += plan.length;
          if (previous) { plan.refs = previous.refs; plan.metadata = previous.metadata; }
        }
        else if (kind === Kind.Object) {
          const shape = shapes[index(shapes.length)]; plan.type = shape.type; plan.keys = shape.keys;
          plan.refs = []; plan.metadata = [];
          if (this.channel === 'render') plan.row = [];
          for (let j = 0; j < plan.keys.length; j++) checkValue(plan, plan.row);
          if (previous && (!sameNumbers(plan.refs, previous.refs) || !sameNumbers(plan.metadata, previous.metadata))) graphEdgesChanged = true;
        } else {
          plan.length = index(VALUE_LIMIT + 1);
          plan.refs = []; plan.metadata = [];
          if (kind === Kind.Map && plan.length % 2) throw new Error('Invalid presentation map size');
          for (let j = 0; j < plan.length; j++) checkValue(plan);
          if (previous && (!sameNumbers(plan.refs, previous.refs) || !sameNumbers(plan.metadata, previous.metadata))) graphEdgesChanged = true;
        }
        if (cursor > dataLen) throw new Error('Truncated presentation buffer');
        plan.units = wireKind === Kind.ObjectPatch ? 3 + plan.row!.length : cursor - plan.offset + 2;
        expandedUnits += plan.units;
        if (expandedUnits > VALUE_LIMIT) throw Error('Presentation expanded data budget exceeded');
        if (previous && (previous.kind !== kind || previous.type !== plan.type)) throw new Error('Presentation identity changed type');
        if (id < ID_TABLE_LIMIT) {
          stateStamp[id] = planTag;
          planById[id] = plan;
        } else {
          (overflowPlans ??= new Map()).set(id, plan);
        }
        planList.push(plan);
        if (!previous) { candidateSize++; graphEdgesChanged = true; }
        else unitsDelta += plan.units - previous.units;
      }
      if (cursor !== dataLen) throw new Error('Trailing presentation data');
      const rowTag = (plan: Plan, slot: number): number => {
        if (plan.patchCount) {
          let p = plan.offset + 1;
          for (let j = 0; j < plan.patchCount; j++, p += 3) if (data[p] === slot) return data[p + 1];
        }
        return plan.row ? plan.row[slot * 2] as number : data[plan.offset + 1 + slot * 2];
      };
      const rowPayload = (plan: Plan, slot: number): WireValue => {
        if (plan.patchCount) {
          let p = plan.offset + 1;
          for (let j = 0; j < plan.patchCount; j++, p += 3) if (data[p] === slot) {
            const tag = data[p + 1], raw = data[p + 2];
            return tag === Tag.String ? packet.strings[raw] : raw;
          }
        }
        return plan.row ? plan.row[slot * 2 + 1] : data[plan.offset + 2 + slot * 2];
      };
      if (candidateSize !== packet.liveNodeCount) throw new Error('Invalid live presentation count');
      // Roots are freshly published envelopes, never authority objects or stale frames.
      if (this.channel === 'ui') {
        const envelope = getPlan(root);
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
        const rootPlan = getPlan(root), viewSlot = rootPlan?.keys.indexOf('view') ?? -1, hudSlot = rootPlan?.keys.indexOf('hud') ?? -1;
        if (!rootPlan || rootPlan.kind !== Kind.Object || rootPlan.type !== 0 || viewSlot < 0 || hudSlot < 0
          || rowTag(rootPlan, viewSlot) !== Tag.Ref || rowTag(rootPlan, hudSlot) !== Tag.Ref)
          throw new Error('Invalid presentation root reference');
        const viewPlan = getPlan(rowPayload(rootPlan, viewSlot) as number), kindSlot = viewPlan?.keys.indexOf('kind') ?? -1;
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
      let usedMetadataCount = this.usedMetadataCount;
      let overflowUsedMetadata: Set<number> | undefined;
      if (graphEdgesChanged) {
        if (candidateSize + 16 > this.worklist.length) {
          let cap = this.worklist.length;
          while (cap < candidateSize + 16) cap *= 2;
          this.worklist = new Int32Array(cap);
        }
        let worklist = this.worklist;
        let overflowReachable: Set<number> | undefined;
        let wHead = 0, wTail = 0;
        if (root < ID_TABLE_LIMIT) {
          visitStamp[root] = visitTag;
          worklist[wTail++] = root;
        } else {
          (overflowReachable = new Set()).add(root);
          worklist[wTail++] = root;
        }
        usedMetadataCount = 0;
        let metadataSize = 0, liveUnits = 2;
        const customArrayIterator = Array.prototype[Symbol.iterator] !== arrayIterator;
        while (wHead < wTail) {
          const id = worklist[wHead++];
          let links: Plan | Entry | undefined;
          if (id < ID_TABLE_LIMIT) {
            const st = stateStamp[id];
            links = st === planTag ? planById[id] : st === removedTag ? undefined : entryById[id];
          } else {
            links = overflowRemoved?.has(id) ? undefined : overflowPlans?.get(id) ?? this.objects.get(id);
          }
          if (!links) throw new Error('Unresolved presentation reference');
          liveUnits += links.units;
          if (liveUnits > VALUE_LIMIT) throw new Error('Presentation live data budget exceeded');
          const refs = links.refs;
          const rLen = refs.length;
          if (rLen > 0) {
            if (customArrayIterator && refs[Symbol.iterator] !== arrayIterator) {
              for (const child of refs) {
                if (child < ID_TABLE_LIMIT) {
                  if (visitStamp[child] !== visitTag) {
                    visitStamp[child] = visitTag;
                    if (wTail === worklist.length) {
                      const grown = new Int32Array(worklist.length * 2);
                      grown.set(worklist);
                      this.worklist = worklist = grown;
                    }
                    worklist[wTail++] = child;
                  }
                } else if (!overflowReachable?.has(child)) {
                  (overflowReachable ??= new Set()).add(child);
                  if (wTail === worklist.length) {
                    const grown = new Int32Array(worklist.length * 2);
                    grown.set(worklist);
                    this.worklist = worklist = grown;
                  }
                  worklist[wTail++] = child;
                }
              }
            } else {
              for (let r = 0; r < rLen; r++) {
                const child = refs[r];
                if (child < ID_TABLE_LIMIT) {
                  if (visitStamp[child] !== visitTag) {
                    visitStamp[child] = visitTag;
                    if (wTail === worklist.length) {
                      const grown = new Int32Array(worklist.length * 2);
                      grown.set(worklist);
                      this.worklist = worklist = grown;
                    }
                    worklist[wTail++] = child;
                  }
                } else if (!overflowReachable?.has(child)) {
                  (overflowReachable ??= new Set()).add(child);
                  if (wTail === worklist.length) {
                    const grown = new Int32Array(worklist.length * 2);
                    grown.set(worklist);
                    this.worklist = worklist = grown;
                  }
                  worklist[wTail++] = child;
                }
              }
            }
          }
          const metaLinks = links.metadata;
          const mLen = metaLinks.length;
          for (let m = 0; m < mLen; m++) {
            const entry = metaLinks[m];
            if (entry < ID_TABLE_LIMIT) {
              if (visitStamp[entry] === metaUsedTag) continue;
              const value = metadata.get(entry); if (!value) throw new Error('Unresolved retained metadata reference');
              visitStamp[entry] = metaUsedTag; usedMetadataCount++; metadataSize += value.units;
            } else {
              if (overflowUsedMetadata?.has(entry)) continue;
              const value = metadata.get(entry); if (!value) throw new Error('Unresolved retained metadata reference');
              (overflowUsedMetadata ??= new Set()).add(entry); usedMetadataCount++; metadataSize += value.units;
            }
          }
        }
        if (wTail !== candidateSize) throw new Error('Unreachable presentation records');
        if (metadataSize > VALUE_LIMIT) throw new Error('Presentation metadata budget exceeded');
        this.liveUnits = liveUnits;
        this.usedMetadataCount = usedMetadataCount;
        this.metadataSize = metadataSize;
        this.rootId = root;
      } else {
        const liveUnits = this.liveUnits + unitsDelta;
        if (liveUnits > VALUE_LIMIT) throw new Error('Presentation live data budget exceeded');
        this.liveUnits = liveUnits;
      }
      const replacements = new Map<object, object>();
      const planCount = planList.length;
      // Stage only changed entries on their existing plans. Keep old keys/values
      // indexed until all allocations, writes and retained-parent rebindings finish.
      for (let i = 0; i < planCount; i++) {
        const plan = planList[i];
        const prior = plan.prior;
        let value = prior?.value;
        if (!value || (plan.kind === Kind.Typed && (value as NumericArray).length !== plan.length)) {
          value = plan.kind === Kind.Vector ? new Vector2() : plan.kind === Kind.Typed ? new typed[plan.type](plan.length)
            : plan.kind === Kind.Array ? [] : plan.kind === Kind.Map ? new Map() : plan.kind === Kind.Set ? new Set() : Object.create(classes[plan.type]?.prototype ?? null);
          if (prior) replacements.set(prior.value, value!);
        }
        if (prior && value === prior.value && sameKeys(prior.keys, plan.keys)) {
          prior.units = plan.units; prior.keys = plan.keys; prior.refs = plan.refs; prior.metadata = plan.metadata; prior.row = plan.row;
          plan.entry = prior;
        } else {
          plan.entry = { kind: plan.kind, type: plan.type, units: plan.units, keys: plan.keys, refs: plan.refs, metadata: plan.metadata, value: value!, row: plan.row };
        }
      }
      const resolveRef = (n: number): object => {
        if (n < ID_TABLE_LIMIT) {
          return (stateStamp[n] === planTag ? planById[n]!.entry! : entryById[n]!).value;
        }
        return (overflowPlans?.get(n)?.entry ?? this.objects.get(n))!.value;
      };
      const decode = (): unknown => {
        const tag = data[cursor++], n = data[cursor++];
        switch (tag) {
          case Tag.Undefined: return undefined; case Tag.Null: return null; case Tag.False: return false; case Tag.True: return true;
          case Tag.Number: return n; case Tag.String: return packet.strings[n]; case Tag.Ref: return resolveRef(n);
          case Tag.Metadata: return metadata.get(n)!.value;
        }
      };
      // Allocation happens before writing refs, including length-tracking typed arrays.
      for (let i = 0; i < planCount; i++) {
        const plan = planList[i];
        const target = plan.entry!.value;
        cursor = plan.offset;
        if (plan.kind === Kind.Vector) { (target as Vector2).x = data[cursor++]; (target as Vector2).y = data[cursor++]; }
        else if (plan.kind === Kind.Typed) { cursor += 2; (target as NumericArray).set(data.subarray(cursor, cursor + plan.length)); }
        else if (plan.kind === Kind.Array) { cursor++; const array = target as unknown[]; array.length = plan.length; for (let j = 0; j < plan.length; j++) array[j] = decode(); }
        else if (plan.kind === Kind.Map) { cursor++; const map = target as Map<unknown, unknown>; map.clear(); for (let j = 0; j < plan.length; j += 2) { const key = decode(); map.set(key, decode()); } }
        else if (plan.kind === Kind.Set) { cursor++; const set = target as Set<unknown>; set.clear(); for (let j = 0; j < plan.length; j++) set.add(decode()); }
        else if (plan.patchCount && (!replacements.size || !plan.refs.length)) {
          const record = target as Record<string, unknown>, row = plan.row!, keys = plan.keys, count = plan.patchCount;
          const writer = getFieldWriter(keys);
          let pCursor = plan.offset + 1;
          for (let j = 0; j < count; j++) {
            const fieldIndex = data[pCursor++], tag = data[pCursor++], raw = data[pCursor++];
            const n: WireValue = tag === Tag.String ? packet.strings[raw] : raw;
            row[fieldIndex * 2] = tag; row[fieldIndex * 2 + 1] = n;
            let v: unknown;
            switch (tag) {
              case Tag.Undefined: v = undefined; break; case Tag.Null: v = null; break;
              case Tag.False: v = false; break; case Tag.True: v = true; break;
              case Tag.Number: case Tag.String: v = n; break;
              case Tag.Ref: v = resolveRef(n as number); break;
              case Tag.Metadata: v = metadata.get(n as number)!.value; break;
            }
            if (writer) writer(record, fieldIndex, v);
            else record[keys[fieldIndex]] = v;
          }
        } else if (plan.patchedFields && !replacements.size) {
          const record = target as Record<string, unknown>, row = plan.row!, keys = plan.keys, patched = plan.patchedFields;
          const writer = getFieldWriter(keys);
          for (let j = 0; j < patched.length; j++) {
            const fieldIndex = patched[j], tag = row[fieldIndex * 2] as number, n = row[fieldIndex * 2 + 1];
            let v: unknown;
            switch (tag) {
              case Tag.Undefined: v = undefined; break; case Tag.Null: v = null; break;
              case Tag.False: v = false; break; case Tag.True: v = true; break;
              case Tag.Number: case Tag.String: v = n; break;
              case Tag.Ref: v = resolveRef(n as number); break;
              case Tag.Metadata: v = metadata.get(n as number)!.value; break;
            }
            if (writer) writer(record, fieldIndex, v);
            else record[keys[fieldIndex]] = v;
          }
        } else {
          if (plan.patchCount) {
            const row = plan.row!, count = plan.patchCount;
            let pCursor = plan.offset + 1;
            for (let j = 0; j < count; j++) {
              const fieldIndex = data[pCursor++], tag = data[pCursor++], raw = data[pCursor++];
              row[fieldIndex * 2] = tag; row[fieldIndex * 2 + 1] = tag === Tag.String ? packet.strings[raw] : raw;
            }
          }
          cursor++;
          let field = 0;
          const oldKeys = plan.prior?.keys ?? [];
          if (!sameKeys(oldKeys, plan.keys)) {
            const keys = new Set(plan.keys);
            for (const key of oldKeys) if (!keys.has(key)) delete (target as Record<string, unknown>)[key];
          }
          const record = target as Record<string, unknown>, keys = plan.keys;
          const writer = getFieldWriter(keys);
          for (let k = 0; k < keys.length; k++) {
            let v: unknown;
            if (plan.row) {
              const tag = plan.row[field++] as number, n = plan.row[field++];
              switch (tag) {
                case Tag.Undefined: v = undefined; break; case Tag.Null: v = null; break;
                case Tag.False: v = false; break; case Tag.True: v = true; break;
                case Tag.Number: case Tag.String: v = n; break;
                case Tag.Ref: v = resolveRef(n as number); break;
                case Tag.Metadata: v = metadata.get(n as number)!.value; break;
              }
            } else v = decode();
            if (writer) writer(record, k, v);
            else record[keys[k]] = v;
          }
        }
      }
      // Resizing a length-tracking typed array replaces its display storage. Retained
      // parents must rebind even when their logical reference IDs did not change.
      if (replacements.size) {
        const rebind = (v: unknown) => typeof v === 'object' && v !== null ? replacements.get(v) ?? v : v;
        for (const [id, entry] of this.objects) {
          if (isRemoved(id) || getPlan(id) !== undefined || !entry.refs.length) continue;
          const target = entry.value;
          if (entry.kind === Kind.Array) { const array = target as unknown[]; for (let i = 0; i < array.length; i++) array[i] = rebind(array[i]); }
          else if (entry.kind === Kind.Map) { const map = target as Map<unknown, unknown>, pairs = [...map]; map.clear(); for (const [key, v] of pairs) map.set(rebind(key), rebind(v)); }
          else if (entry.kind === Kind.Set) { const set = target as Set<unknown>, values = [...set]; set.clear(); for (const v of values) set.add(rebind(v)); }
          else if (entry.kind === Kind.Object) { const record = target as Record<string, unknown>; for (const key of entry.keys) record[key] = rebind(record[key]); }
        }
      }
      for (let i = 0; i < packetRemoved.length; i++) {
        const id = packetRemoved[i];
        this.objects.delete(id);
        if (id < ID_TABLE_LIMIT) entryById[id] = undefined;
      }
      for (let i = 0; i < planCount; i++) {
        const plan = planList[i];
        if (plan.entry !== plan.prior) {
          this.objects.set(plan.id, plan.entry!);
          if (plan.id < ID_TABLE_LIMIT) entryById[plan.id] = plan.entry!;
        }
      }
      if (graphEdgesChanged && (packet.metadata.length || usedMetadataCount !== metadata.size)) {
        this.metadata = new Map([...metadata].filter(([id]) => id < ID_TABLE_LIMIT ? visitStamp[id] === metaUsedTag : !!overflowUsedMetadata?.has(id)));
      }
      this.revision = packet.revision; this.tick = packet.tick;
      return getPrior(root)!.value;
    } finally {
      for (let i = 0; i < planList.length; i++) {
        const id = planList[i].id;
        if (id < ID_TABLE_LIMIT) planById[id] = undefined;
      }
      planList.length = 0;
    }
  }
  get retainedObjects(): number { return this.objects.size; }
}

function sameKeys(a: readonly string[], b: readonly string[]): boolean { return a === b || (a.length === b.length && a.every((key,index) => key === b[index])); }
function sameNumbers(a: readonly number[], b: readonly number[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

