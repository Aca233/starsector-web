/** Optional authority notifications, NOT a second damage simulator or state codec.
 *
 * Existing CriticalCombatReplica/ComponentReplication remain responsible for HP,
 * flux, armor, definitions and full restores; HostMuzzleEvents owns fire cosmetics,
 * and MotionReplica owns poses. This module reads ONLY captured ships/crafts roots.
 * It intentionally cannot access an engine, ACK, RNG, muzzle stream or motion.
 *
 * Host: once per already captured component-mode frame, capture(frame). Publish the
 * returned retained window optionally; do not remove anything from the full frame.
 * Receiver: for attached windows, after a successful full restore use observeSnapshot.
 * For a separate channel call anchorSnapshot(epoch, frame) on cold/recovery, then
 * receive(window) to obtain deduplicated notifications. They may drive UI, never
 * applyDamage/fixedUpdate or construct/delete Ships. A spawn is a roster notice,
 * despawn means absent (not necessarily killed). Full snapshots own entity creation.
 *
 * Damage notices contain absolute hullHp, including repairs; armor-only/shield-only
 * hits and entities born AND removed between captures are deliberately not inferred.
 * Epoch must change with the authority/capture-generation allocator (match reset).
 */
export const COMBAT_COMPONENT_EVENT_LIMITS = Object.freeze({
  retainedTicks: 120, maxEvents: 2048, maxEntities: 4096,
  maxIdLength: 256, maxEpochLength: 128,
});

export interface CombatComponentFrame {
  readonly tick: number;
  readonly componentMode?: number;
  readonly ships: readonly { readonly id: string; readonly generation?: number; readonly state: unknown }[];
  readonly crafts: readonly { readonly id: string; readonly generation?: number; readonly state: unknown }[];
}
export interface CombatComponentValues {
  readonly hullHp: number;
  readonly isDead: boolean;
  readonly isRetreated: boolean;
}
export interface CombatComponentIdentity { readonly id: string; readonly generation: number }
export interface CombatComponentEntity extends CombatComponentIdentity, CombatComponentValues {}
type EventIdentity = CombatComponentIdentity & { readonly tick: number };
export type CombatComponentEvent =
  | (EventIdentity & { readonly kind: 'damage'; readonly hullHp: number })
  | (EventIdentity & { readonly kind: 'spawn'; readonly state: CombatComponentValues })
  | (EventIdentity & { readonly kind: 'despawn' })
  | (EventIdentity & { readonly kind: 'lifecycle'; readonly isDead: boolean; readonly isRetreated: boolean });
export interface CombatComponentEventBatch {
  readonly version: 1;
  readonly epoch: string;
  /** All capture observations through this tick are covered. Not a transport ACK. */
  readonly throughTick: number;
  /** Events at/before this tick are no longer promised; require a snapshot >= it. */
  readonly coveredAfterTick: number;
  readonly events: readonly CombatComponentEvent[];
}
export interface CombatComponentEventOptions {
  /** Limits can be lowered, never raised above the hard defaults. Ticks, not Hz. */
  retainedTicks?: number;
  maxEvents?: number;
  maxEntities?: number;
}
type Limits = Required<CombatComponentEventOptions>;
/** Supply the EXISTING reconciliation map, annotated with real frame generations.
 * Only native own-data hullHp is writable; accessors/setters are deliberately skipped.
 * fullTick is the latest successful full restore, not a transport ACK or motion tick. */
export interface CombatComponentDamageSink {
  readonly epoch: string;
  readonly fullTick: number;
  readonly entities: ReadonlyMap<string, { readonly generation: number; readonly target: { hullHp: number } }>;
}
export interface CombatComponentReceiveResult {
  readonly appliedHp?: number;
  readonly status: 'applied' | 'stale' | 'needs-snapshot' | 'epoch-mismatch' | 'invalid';
  readonly events: readonly CombatComponentEvent[];
}

const EMPTY: readonly CombatComponentEvent[] = Object.freeze([]);
const safeTick = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0;
function fail(message: string): never { throw new Error(`Combat component events: ${message}`); }
function limits(options: CombatComponentEventOptions): Limits {
  const result = { retainedTicks: options.retainedTicks ?? COMBAT_COMPONENT_EVENT_LIMITS.retainedTicks,
    maxEvents: options.maxEvents ?? COMBAT_COMPONENT_EVENT_LIMITS.maxEvents,
    maxEntities: options.maxEntities ?? COMBAT_COMPONENT_EVENT_LIMITS.maxEntities };
  for (const key of ['retainedTicks', 'maxEvents', 'maxEntities'] as const)
    if (!safeTick(result[key]) || result[key] < 1 || result[key] > COMBAT_COMPONENT_EVENT_LIMITS[key]) fail(`invalid ${key}`);
  return result;
}
function epochValid(epoch: unknown): epoch is string {
  return typeof epoch === 'string' && epoch.length > 0 && epoch.length <= COMBAT_COMPONENT_EVENT_LIMITS.maxEpochLength;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('expected object');
  return value as Record<string, unknown>;
}
function identity(value: Record<string, unknown>): CombatComponentIdentity {
  if (typeof value.id !== 'string' || !value.id.length || value.id.length > COMBAT_COMPONENT_EVENT_LIMITS.maxIdLength
    || !safeTick(value.generation) || value.generation === 0) fail('missing real entity generation/identity');
  return { id: value.id, generation: value.generation };
}
function hp(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail('invalid hullHp');
  return value;
}
function flag(value: unknown): boolean {
  if (typeof value !== 'boolean') fail('invalid lifecycle flag');
  return value;
}
function values(value: unknown): CombatComponentValues {
  const state = object(value);
  return Object.freeze({ hullHp: hp(state.hullHp), isDead: flag(state.isDead), isRetreated: flag(state.isRetreated) });
}
function roster(frame: CombatComponentFrame, maxEntities: number): Map<string, CombatComponentEntity> {
  if (!frame || !safeTick(frame.tick) || frame.componentMode !== 1 || !Array.isArray(frame.ships)
    || !Array.isArray(frame.crafts) || frame.ships.length + frame.crafts.length > maxEntities) fail('unsupported full frame');
  const result = new Map<string, CombatComponentEntity>();
  for (const rows of [frame.ships, frame.crafts]) for (const row of rows) {
    const key = identity(object(row));
    if (result.has(key.id)) fail('duplicate entity id');
    result.set(key.id, Object.freeze({ ...key, ...values(row.state) }));
  }
  return result;
}

/** Bounded, immutable sampled-state journal. No additional world traversal and no
 * send/admission state: unsent windows can be recovered from a later retained one. */
export class HostCombatComponentEvents {
  private previous = new Map<string, CombatComponentEntity>();
  private retained: readonly CombatComponentEvent[] = EMPTY;
  private currentTick = -1;
  private floorTick = -1;
  private readonly bounds: Limits;
  constructor(private epoch: string, options: CombatComponentEventOptions = {}) {
    if (!epochValid(epoch)) fail('invalid epoch');
    this.bounds = limits(options);
  }
  reset(epoch: string): void {
    if (!epochValid(epoch)) fail('invalid epoch');
    this.epoch = epoch; this.previous = new Map(); this.retained = EMPTY; this.currentTick = this.floorTick = -1;
  }
  /** First capture establishes a baseline, not a synthetic mass-spawn. Throws on
   * unsupported frames (notably absent generation); caller must still send full state. */
  capture(frame: CombatComponentFrame): CombatComponentEventBatch {
    const next = roster(frame, this.bounds.maxEntities);
    if (frame.tick <= this.currentTick) fail('capture tick must increase');
    const events: CombatComponentEvent[] = [...this.retained];
    if (this.currentTick >= 0) {
      for (const old of this.previous.values()) {
        const entity = next.get(old.id);
        if (!entity || entity.generation !== old.generation)
          events.push(Object.freeze({ kind: 'despawn', tick: frame.tick, id: old.id, generation: old.generation }));
      }
      for (const entity of next.values()) {
        const old = this.previous.get(entity.id);
        const key = { tick: frame.tick, id: entity.id, generation: entity.generation };
        if (!old || old.generation !== entity.generation) {
          events.push(Object.freeze({ ...key, kind: 'spawn', state: values(entity) }));
        } else {
          if (!Object.is(old.hullHp, entity.hullHp)) events.push(Object.freeze({ ...key, kind: 'damage', hullHp: entity.hullHp }));
          if (old.isDead !== entity.isDead || old.isRetreated !== entity.isRetreated)
            events.push(Object.freeze({ ...key, kind: 'lifecycle', isDead: entity.isDead, isRetreated: entity.isRetreated }));
        }
      }
    }
    let floor = this.currentTick < 0 ? frame.tick : Math.max(this.floorTick, frame.tick - this.bounds.retainedTicks);
    // Drop whole ticks, never a partial death+damage or replacement transaction.
    if (events.length > this.bounds.maxEvents) floor = Math.max(floor, events[events.length - this.bounds.maxEvents - 1]!.tick);
    const retained = Object.freeze(events.filter(event => event.tick > floor));
    this.previous = next; this.retained = retained; this.currentTick = frame.tick; this.floorTick = floor;
    return Object.freeze({ version: 1, epoch: this.epoch, throughTick: frame.tick, coveredAfterTick: floor, events: retained });
  }
}

/** Validate/copy only bounded scalar data. No component definitions or world data
 * can be smuggled into the returned notices; malformed windows commit nothing. */
function readBatch(input: unknown, bounds: Limits): CombatComponentEventBatch {
  const batch = object(input);
  if (batch.version !== 1 || !epochValid(batch.epoch) || !safeTick(batch.throughTick)
    || !safeTick(batch.coveredAfterTick) || batch.coveredAfterTick > batch.throughTick
    || batch.throughTick - batch.coveredAfterTick > bounds.retainedTicks
    || !Array.isArray(batch.events) || batch.events.length > bounds.maxEvents) fail('invalid retained window');
  const events: CombatComponentEvent[] = [], seen = new Set<string>();
  let lastTick = batch.coveredAfterTick;
  for (const raw of batch.events) {
    const row = object(raw), id = identity(row);
    if (!safeTick(row.tick) || row.tick <= batch.coveredAfterTick || row.tick < lastTick || row.tick > batch.throughTick) fail('invalid event tick');
    const key = { ...id, tick: row.tick };
    if (!['spawn', 'despawn', 'damage', 'lifecycle'].includes(row.kind as string)) fail('unknown event kind');
    const token = JSON.stringify([key.tick, key.id, key.generation, row.kind]);
    if (seen.has(token)) fail('duplicate event identity');
    seen.add(token); lastTick = key.tick;
    switch (row.kind) {
      case 'spawn': events.push(Object.freeze({ ...key, kind: 'spawn', state: values(row.state) })); break;
      case 'despawn': events.push(Object.freeze({ ...key, kind: 'despawn' })); break;
      case 'damage': events.push(Object.freeze({ ...key, kind: 'damage', hullHp: hp(row.hullHp) })); break;
      case 'lifecycle': events.push(Object.freeze({ ...key, kind: 'lifecycle', isDead: flag(row.isDead), isRetreated: flag(row.isRetreated) })); break;
      default: fail('unknown event kind');
    }
  }
  return Object.freeze({ version: 1, epoch: batch.epoch, throughTick: batch.throughTick,
    coveredAfterTick: batch.coveredAfterTick, events: Object.freeze(events) });
}

/** Independent notification mirror with an optional generation-guarded HP sink.
 * One bounded roster + tick watermark replaces an unbounded "seen event IDs" set.
 * Anchor first; expired windows require another full snapshot. Lost intermediate
 * windows inside retention replay safely; reordered/duplicate ones do not. */
export class CombatComponentEventReceiver {
  private epoch: string | null = null;
  private watermark = -1;
  private entities = new Map<string, CombatComponentEntity>();
  private readonly bounds: Limits;
  constructor(options: CombatComponentEventOptions = {}) { this.bounds = limits(options); }
  get tick(): number { return this.watermark; }
  get size(): number { return this.entities.size; }
  /** Frozen informational state, not a Ship or a substitute for a full snapshot. */
  entity(id: string): CombatComponentEntity | undefined { return this.entities.get(id); }
  clear(): void { this.epoch = null; this.watermark = -1; this.entities.clear(); }
  /** Call only for a successfully restored full frame in the trusted current epoch.
   * A delayed full frame cannot rewind an already delivered notification watermark.
   * Equal/newer full frames repair the mirror without replaying historical effects. */
  anchorSnapshot(epoch: string, frame: CombatComponentFrame): boolean {
    if (!epochValid(epoch)) fail('invalid epoch');
    const next = roster(frame, this.bounds.maxEntities);
    if (epoch === this.epoch && frame.tick < this.watermark) return false;
    this.epoch = epoch; this.watermark = frame.tick; this.entities = next;
    return true;
  }
  /** Attached-window integration: call AFTER the existing full restore succeeds.
   * Consume against the prior notification baseline, then anchor to the full frame.
   * Anchoring first would suppress every same-frame notice. Cold/missing/invalid/
   * expired/ahead-of-frame windows produce no notices but never veto full recovery.
   * Does not mutate frame, store it, or return any command for the engine to execute. */
  observeSnapshot(epoch: string, frame: CombatComponentFrame, window?: unknown): readonly CombatComponentEvent[] {
    if (!epochValid(epoch)) fail('invalid epoch');
    const next = roster(frame, this.bounds.maxEntities);
    if (epoch === this.epoch && frame.tick < this.watermark) return EMPTY;
    let delivered = EMPTY;
    if (epoch === this.epoch && window !== undefined) {
      try {
        const batch = readBatch(window, this.bounds);
        if (batch.throughTick <= frame.tick) delivered = this.consume(batch).events;
      } catch { /* Invalid optional notices cannot block the already restored full frame. */ }
    }
    this.epoch = epoch; this.watermark = frame.tick; this.entities = next;
    return delivered;
  }
  /** Separate event delivery can update known replica HP without rerunning damage.
   * Full state wins ties. New/removed entities still belong solely to full roster
   * reconciliation. No sink is needed for same-frame observeSnapshot: full restore
   * has already written the exact HP, and historical notifications must not undo it. */
  receive(input: unknown, sink?: CombatComponentDamageSink): CombatComponentReceiveResult {
    let batch: CombatComponentEventBatch;
    try { batch = readBatch(input, this.bounds); }
    catch { return { status: 'invalid', events: EMPTY }; }
    if (sink && (!epochValid(sink.epoch) || !safeTick(sink.fullTick))) return { status: 'invalid', events: EMPTY };
    return this.consume(batch, sink);
  }
  private consume(batch: CombatComponentEventBatch, sink?: CombatComponentDamageSink): CombatComponentReceiveResult {
    if (this.epoch === null) return { status: 'needs-snapshot', events: EMPTY };
    if (batch.epoch !== this.epoch) return { status: 'epoch-mismatch', events: EMPTY };
    if (batch.throughTick <= this.watermark) return { status: 'stale', events: EMPTY };
    if (batch.coveredAfterTick > this.watermark) return { status: 'needs-snapshot', events: EMPTY };
    const next = new Map(this.entities), delivered: CombatComponentEvent[] = [];
    for (const event of batch.events) {
      if (event.tick <= this.watermark) continue;
      const old = next.get(event.id);
      if (event.kind === 'spawn') {
        // A different live lifetime must be explicitly removed, never overwritten.
        if (old) return { status: 'needs-snapshot', events: EMPTY };
        next.set(event.id, Object.freeze({ id: event.id, generation: event.generation, ...event.state }));
      } else {
        // Missing/foreign lifetimes cannot affect a reused ID or leak stale notices.
        if (!old || old.generation !== event.generation) return { status: 'needs-snapshot', events: EMPTY };
        if (event.kind === 'despawn') next.delete(event.id);
        else if (event.kind === 'damage') next.set(event.id, Object.freeze({ ...old, hullHp: event.hullHp }));
        else next.set(event.id, Object.freeze({ ...old, isDead: event.isDead, isRetreated: event.isRetreated }));
      }
      if (next.size > this.bounds.maxEntities) return { status: 'needs-snapshot', events: EMPTY };
      delivered.push(event);
    }
    let appliedHp = 0;
    if (sink?.epoch === this.epoch) {
      // Coalesce retained HP changes to the final live lifetime, never transiently
      // write an old incarnation or replay a hit followed by a repair/death.
      const damaged = new Set<string>();
      for (const event of delivered) if (event.kind === 'damage' && event.tick > sink.fullTick
        && next.get(event.id)?.generation === event.generation) damaged.add(event.id);
      for (const id of damaged) {
        const entity = next.get(id), binding = sink.entities.get(id);
        if (!entity || !binding || binding.generation !== entity.generation) continue;
        const slot = Object.getOwnPropertyDescriptor(binding.target, 'hullHp');
        if (!slot || !Object.hasOwn(slot, 'value') || !slot.writable || typeof slot.value !== 'number'
          || Object.is(slot.value, entity.hullHp)) continue;
        binding.target.hullHp = entity.hullHp; appliedHp++;
      }
    }
    this.entities = next; this.watermark = batch.throughTick;
    return { status: 'applied', events: Object.freeze(delivered), appliedHp };
  }
}



