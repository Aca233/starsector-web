import type { Ship } from '../../engine/simulation/Ship';
import { lanCrc32 } from '../LanBinaryDelta.mjs';

/** Experimental P1 field view. Not imported by a production transport.
 * Sampling still reads these fields each tick; dirty registration lives in this
 * view, NOT in simulation setters. No precision reduction, AI, or prediction. */
const root = (name: string, boolean = false) => ({ path: [name], boolean });
const nested = (name: string, field: string, boolean = false) => ({ path: [name, field], boolean });
export const SHIP_VIEW_FIELDS = Object.freeze([
  nested('pos', 'x'), nested('pos', 'y'), nested('vel', 'x'), nested('vel', 'y'),
  root('facingRad'), root('angularVelRad'), root('hullHp'), root('currentCR'),
  root('engineBoostLevel'), root('prevEngineBoostLevel'), root('teleportSequence'),
  root('isDead', true), root('isRetreated', true), root('retreating', true), root('isDocked', true),
  nested('teleportCameraOffset', 'x'), nested('teleportCameraOffset', 'y'),
  nested('flux', 'softFlux'), nested('flux', 'hardFlux'), nested('flux', 'timeSinceFluxIncrease'),
  nested('flux', 'isOverloaded', true), nested('flux', 'overloadTimer'), nested('flux', 'overloadDuration'),
  nested('flux', 'isVenting', true), nested('flux', 'ventProgress'), nested('flux', 'zeroFluxTimer'),
  nested('flux', 'isEngineBoostActive', true),
].map(f => Object.freeze({ ...f, path: Object.freeze(f.path) })));
export const SHIP_VIEW_LIMITS = Object.freeze({ entities: 64, idBytes: 128, packetBytes: 128 * 1024, version: 1 });
export const SHIP_VIEW_ROOT_OMISSIONS: ReadonlySet<string> = new Set(SHIP_VIEW_FIELDS.filter(f => f.path[0] !== 'flux').map(f => f.path[0]));
export const SHIP_VIEW_FLUX_OMISSIONS: ReadonlySet<string> = new Set(SHIP_VIEW_FIELDS.filter(f => f.path[0] === 'flux').map(f => f.path[1]));
const MAGIC = 0x53565731, HEADER = 28, FULL_MASK = 2 ** SHIP_VIEW_FIELDS.length - 1;
const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal: true });
const uint = (n: number) => Number.isInteger(n) && n > 0 && n <= 0xffffffff;
function invariant(ok: unknown, message: string): asserts ok { if (!ok) throw Error('Ship view: ' + message); }
function target(ship: Ship, path: readonly string[]): any { return path.length === 1 ? ship : (ship as any)[path[0]]; }
export function readShipView(ship: Ship): Float64Array {
  const result = new Float64Array(SHIP_VIEW_FIELDS.length);
  SHIP_VIEW_FIELDS.forEach((f, i) => {
    const value = target(ship, f.path)[f.path.at(-1)!];
    invariant(f.boolean ? typeof value === 'boolean' : typeof value === 'number' && Number.isFinite(value), 'invalid field ' + f.path.join('.'));
    result[i] = f.boolean ? Number(value) : value;
  });
  return result;
}
function writeFields(ship: Ship, values: Float64Array, mask: number) {
  SHIP_VIEW_FIELDS.forEach((f, i) => {
    if (mask & (1 << i)) target(ship, f.path)[f.path.at(-1)!] = f.boolean ? values[i] === 1 : values[i];
  });
}
interface State { generation: number; values: Float64Array }
interface Entry extends State { id: string; op: number; mask: number }
export interface ShipViewSource { ship: Ship; generation: number }
export interface PreparedShipView { readonly bytes: Uint8Array; readonly seq: number; readonly tick: number; readonly changedFields: number; readonly full: boolean }
interface SendPlan { base: number; states: Map<string, State>; generations: Map<string, number>; crc: number }

/** One ordered stream. commit only after reliable transport accepts the packet.
 * No per-peer unbounded history; a slow/missing-base peer needs a full anchor.
 * Encoding can be shared only by peers on this exact stream/baseline. */
export class ShipViewPublisher {
  private seq = 0;
  private tick = 0;
  private states = new Map<string, State>();
  private generations = new Map<string, number>();
  private plans = new WeakMap<PreparedShipView, SendPlan>();
  constructor(private readonly epoch: number) { invariant(uint(epoch), 'epoch'); }
  prepare(rows: readonly ShipViewSource[], tick: number, full = this.seq === 0): PreparedShipView {
    invariant(Number.isInteger(tick) && tick >= this.tick && tick <= 0xffffffff && uint(this.seq + 1), 'tick/sequence');
    invariant(rows.length <= SHIP_VIEW_LIMITS.entities, 'entity budget');
    const next = new Map<string, State>(), generations = new Map(this.generations), entries: Entry[] = [];
    for (const { ship, generation } of rows) {
      invariant(typeof ship.id === 'string' && ship.id.length > 0 && !next.has(ship.id) && uint(generation), 'identity');
      const previous = this.states.get(ship.id), priorGeneration = generations.get(ship.id);
      invariant(priorGeneration === undefined || (previous && generation === previous.generation) || generation > priorGeneration, 'generation regression');
      const values = readShipView(ship), create = !previous || previous.generation !== generation;
      let mask = 0;
      for (let i = 0; i < values.length; i++) if (full || create || !Object.is(previous!.values[i], values[i])) mask |= 1 << i;
      next.set(ship.id, { generation, values }); generations.set(ship.id, generation);
      if (mask) entries.push({ id: ship.id, generation, values, mask, op: full || create ? 1 : 2 });
    }
    invariant(generations.size <= SHIP_VIEW_LIMITS.entities, 'lifetime identity budget; new epoch required');
    if (!full) for (const [id, state] of this.states) if (!next.has(id)) entries.push({ id, ...state, op: 3, mask: 0 });
    const names = entries.map(e => encoder.encode(e.id)); let size = HEADER + 4, changedFields = 0;
    entries.forEach((e, index) => {
      invariant(names[index].length > 0 && names[index].length <= SHIP_VIEW_LIMITS.idBytes && decoder.decode(names[index]) === e.id, 'ID encoding');
      size += 10 + names[index].length;
      SHIP_VIEW_FIELDS.forEach((f, i) => { if (e.mask & (1 << i)) { size += f.boolean ? 1 : 8; changedFields++; } });
    });
    invariant(size <= SHIP_VIEW_LIMITS.packetBytes, 'packet budget');
    const bytes = new Uint8Array(size), d = new DataView(bytes.buffer), seq = this.seq + 1;
    d.setUint32(0, MAGIC); d.setUint16(4, SHIP_VIEW_LIMITS.version); d.setUint16(6, full ? 1 : 0);
    d.setUint32(8, this.epoch); d.setUint32(12, seq); d.setUint32(16, full ? 0 : this.seq);
    d.setUint32(20, tick); d.setUint16(24, entries.length);
    let p = HEADER;
    entries.forEach((e, index) => {
      d.setUint8(p++, e.op); d.setUint32(p, e.generation); p += 4; d.setUint8(p++, names[index].length);
      bytes.set(names[index], p); p += names[index].length; d.setUint32(p, e.mask); p += 4;
      SHIP_VIEW_FIELDS.forEach((f, i) => { if (e.mask & (1 << i)) { if (f.boolean) d.setUint8(p++, e.values[i]); else { d.setFloat64(p, e.values[i]); p += 8; } } });
    });
    d.setUint32(p, lanCrc32(bytes.subarray(0, p)));
    const prepared = Object.freeze({ bytes, seq, tick, changedFields, full });
    this.plans.set(prepared, { base: this.seq, states: next, generations, crc: lanCrc32(bytes) }); return prepared;
  }
  commit(prepared: PreparedShipView) {
    const plan = this.plans.get(prepared);
    invariant(plan && plan.base === this.seq && lanCrc32(prepared.bytes) === plan.crc, 'stale or mutated send plan');
    this.seq = prepared.seq; this.tick = prepared.tick; this.states = plan.states; this.generations = plan.generations; this.plans.delete(prepared);
  }
  stats() { return { seq: this.seq, entities: this.states.size, identities: this.generations.size }; }
}

export interface ShipViewTransaction { readonly seq: number; readonly tick: number; readonly changedFields: number; readonly entities: number }
interface ReceivePlan { base: number; states: Map<string, State>; generations: Map<string, number>; writes: Entry[] }
export class ShipViewReceiver {
  private seq = 0;
  private tick = 0;
  private states = new Map<string, State>();
  private generations = new Map<string, number>();
  private plans = new WeakMap<ShipViewTransaction, ReceivePlan>();
  private readonly registry: ReadonlyMap<string, Ship>;
  constructor(private readonly epoch: number, registry: ReadonlyMap<string, Ship>) {
    invariant(uint(epoch) && registry.size <= SHIP_VIEW_LIMITS.entities, 'registry/epoch');
    this.registry = new Map(registry);
    for (const [id, ship] of registry) invariant(id === ship.id, 'registry identity');
  }
  /** Fully validate before any native writes. Caller validates the matching P1
   * remainder first, then commits both within the same display transaction. */
  prepare(bytes: Uint8Array): ShipViewTransaction {
    invariant(bytes instanceof Uint8Array && bytes.byteLength >= HEADER + 4 && bytes.byteLength <= SHIP_VIEW_LIMITS.packetBytes, 'packet size');
    const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), end = bytes.length - 4;
    invariant(d.getUint32(0) === MAGIC && d.getUint16(4) === SHIP_VIEW_LIMITS.version && d.getUint16(26) === 0, 'version/header');
    invariant(d.getUint32(end) === lanCrc32(bytes.subarray(0, end)), 'CRC');
    const flags = d.getUint16(6), seq = d.getUint32(12), base = d.getUint32(16), tick = d.getUint32(20), count = d.getUint16(24);
    invariant(flags <= 1 && d.getUint32(8) === this.epoch && seq > this.seq && tick >= this.tick, 'epoch/order');
    invariant(flags ? base === 0 : this.seq > 0 && base === this.seq, 'missing baseline');
    invariant(count <= SHIP_VIEW_LIMITS.entities * 2, 'record budget');
    const next = flags ? new Map<string, State>() : new Map(this.states), generations = new Map(this.generations), seen = new Set<string>(), writes: Entry[] = [];
    let p = HEADER, changedFields = 0;
    for (let row = 0; row < count; row++) {
      invariant(p + 6 <= end, 'truncated record'); const op = d.getUint8(p++), generation = d.getUint32(p); p += 4; const length = d.getUint8(p++);
      invariant(length > 0 && length <= SHIP_VIEW_LIMITS.idBytes && p + length + 4 <= end, 'ID length');
      const id = decoder.decode(bytes.subarray(p, p + length)); p += length; const mask = d.getUint32(p); p += 4;
      invariant(this.registry.has(id) && !seen.has(id) && uint(generation), 'unknown/duplicate identity'); seen.add(id);
      const old = this.states.get(id), priorGeneration = generations.get(id);
      invariant((mask & ~FULL_MASK) === 0 && [1, 2, 3].includes(op), 'mask/op');
      if (flags) invariant(op === 1, 'anchor must create complete rows');
      if (op === 3) { invariant(mask === 0 && old?.generation === generation, 'invalid delete'); next.delete(id); continue; }
      if (op === 1) {
        invariant(mask === FULL_MASK && (priorGeneration === undefined || (flags && old?.generation === generation) || generation > priorGeneration), 'invalid create/generation');
      } else invariant(mask !== 0 && old?.generation === generation, 'unknown update/generation');
      const values = op === 1 ? new Float64Array(SHIP_VIEW_FIELDS.length) : old!.values.slice();
      SHIP_VIEW_FIELDS.forEach((f, i) => {
        if (!(mask & (1 << i))) return;
        invariant(p + (f.boolean ? 1 : 8) <= end, 'truncated value');
        const value = f.boolean ? d.getUint8(p++) : d.getFloat64(p); if (!f.boolean) p += 8;
        invariant(Number.isFinite(value) && (!f.boolean || value === 0 || value === 1), 'invalid value'); values[i] = value; changedFields++;
      });
      next.set(id, { generation, values }); generations.set(id, generation); writes.push({ id, generation, values, op, mask });
    }
    invariant(p === end && next.size <= SHIP_VIEW_LIMITS.entities, 'trailing data/entity budget');
    const tx = Object.freeze({ seq, tick, changedFields, entities: next.size });
    this.plans.set(tx, { base: this.seq, states: next, generations, writes }); return tx;
  }
  commit(tx: ShipViewTransaction) {
    const plan = this.plans.get(tx); invariant(plan && plan.base === this.seq, 'stale receive plan');
    // Only a trusted preconstructed native registry may be used here. No setters,
    // user-defined hooks, or object allocation are accepted from wire field names.
    for (const e of plan.writes) writeFields(this.registry.get(e.id)!, e.values, e.mask);
    this.states = plan.states; this.generations = plan.generations; this.seq = tx.seq; this.tick = tx.tick; this.plans.delete(tx);
  }
  stats() { return { seq: this.seq, tick: this.tick, entities: this.states.size, identities: this.generations.size }; }
}
