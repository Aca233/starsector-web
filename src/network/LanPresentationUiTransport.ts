import { CombatPresentationEncoder } from '../engine/runtime/local/CombatPresentationEncoder';
import { CombatPresentationDecoder } from '../engine/runtime/local/CombatPresentationDecoder';
import type { CombatPresentationGraphPacket } from '../engine/runtime/local/CombatPresentationWire';
import { liveCombatHudView } from '../engine/runtime/CombatHudView';
import type { DeploymentView } from '../engine/runtime/DeploymentView';
import type { TacticalMapSnapshot } from '../engine/runtime/TacticalMapView';
import type { LanPresentationReadViews, LanPresentationUiSnapshot } from './LanPresentationViews';

export interface LanUiSession { readonly owner: string; readonly epoch: number }
export interface LanUiPacket extends LanUiSession { readonly graph: CombatPresentationGraphPacket }
export interface LanUiReceipt extends LanUiSession { readonly revision: number; readonly buffer: ArrayBuffer }
const validSession = (value: LanUiSession) => value && typeof value.owner === 'string' && /^[a-f0-9]{32}$/.test(value.owner)
  && Number.isSafeInteger(value.epoch) && value.epoch > 0;
const sameSession = (a: LanUiSession, b: LanUiSession) => a.owner === b.owner && a.epoch === b.epoch;

/** One UI packet in flight, no queued snapshots. Never couples UI acknowledgement
 * to simulation/network consumption credits. A busy main thread cannot accumulate
 * obsolete UI graphs; the next publish samples current owner state, not old data. */
export class LanPresentationUiPublisher {
  private readonly owner = Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
  private epoch = 1;
  private encoder: CombatPresentationEncoder | null = new CombatPresentationEncoder(1, 'render-strict', 'ui');
  private pending: { revision: number; capacity: number } | null = null;
  private recycled: ArrayBuffer | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private published = 0;
  private revision = 0;
  private skipped = 0;
  constructor(private capture: (() => LanPresentationUiSnapshot) | null,
    private send: ((packet: LanUiPacket, transfer: Transferable[]) => void) | null,
    private readonly onError: (error: unknown) => void, private readonly timeoutMs = 5000) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw Error('Invalid UI receipt timeout');
  }
  get nextRevision(): number { return this.revision + 1; }
  get session(): LanUiSession { return { owner: this.owner, epoch: this.epoch }; }
  get stats() { return { ...this.session, closed: !this.encoder, pending: !!this.pending, published: this.published, skipped: this.skipped }; }
  publish(tick: number): boolean {
    if (!this.encoder) throw Error('UI publisher is closed');
    if (this.pending) { this.skipped++; return false; }
    try {
      const graph = this.encoder.captureUi(this.capture!(), tick, this.recycled);
      this.recycled = undefined; this.revision = graph.revision;
      this.pending = { revision: graph.revision, capacity: graph.buffer.byteLength };
      // Install ownership BEFORE send: transports may synchronously complete or reset.
      this.timer = setTimeout(() => { this.close(); this.onError(Error('UI presentation receipt timed out')); }, this.timeoutMs);
      this.published++;
      this.send!({ ...this.session, graph }, [graph.buffer]);
      return true;
    } catch (error) { this.close(); this.onError(error); throw error; }
  }
  complete(receipt: LanUiReceipt): boolean {
    if (!this.encoder || !receipt || !sameSession(this.session, receipt) || !this.pending || receipt.revision !== this.pending.revision) return false;
    if (!(receipt.buffer instanceof ArrayBuffer) || receipt.buffer.byteLength !== this.pending.capacity) {
      const error = Error('Invalid recycled UI buffer'); this.close(); this.onError(error); throw error;
    }
    this.recycled = receipt.buffer; this.pending = null;
    clearTimeout(this.timer); this.timer = undefined;
    return true;
  }
  /** Caller must explicitly announce session to the receiving owner before its
   * next packet. Arbitrary packets never implicitly install a new UI epoch. */
  reset(): void {
    if (!this.encoder) return;
    if (!Number.isSafeInteger(this.epoch + 1)) { this.close(); throw Error('UI epoch exhausted'); }
    clearTimeout(this.timer); this.timer = undefined; this.pending = null; this.recycled = undefined;
    this.revision = 0;
    this.encoder = new CombatPresentationEncoder(++this.epoch, 'render-strict', 'ui');
  }
  close(): void {
    clearTimeout(this.timer); this.timer = undefined;
    this.pending = null; this.recycled = undefined; this.encoder = null; this.capture = null; this.send = null;
  }
}

/** Immutable map/deployment histories, preserving shared definitions. Generic
 * immutableCopy recursively duplicates shared descendants; a per-source cache
 * instead retains one immutable copy per live node and rechecks mutable fields. */
class UiSnapshotCopies {
  private readonly nodes = new WeakMap<object, { keys: string[]; children: unknown[]; length: number | undefined; value: object }>();
  copy<T>(input: T, active = new Set<object>()): T {
    if (!input || typeof input !== 'object') return input;
    if (active.has(input)) throw Error('Cyclic UI history');
    const array = Array.isArray(input), prototype = Object.getPrototypeOf(input);
    if (!array && prototype !== Object.prototype && prototype !== null) throw Error('Non-data UI history');
    active.add(input);
    const keys = Object.keys(input), record = input as Record<string, unknown>;
    const children = keys.map(key => this.copy(record[key], active));
    active.delete(input);
    const previous = this.nodes.get(input), length = array ? input.length : undefined;
    if (previous && previous.length === length && previous.keys.length === keys.length
      && keys.every((key,i) => previous.keys[i] === key && Object.is(previous.children[i], children[i]))) return previous.value as T;
    const entries = Object.fromEntries(keys.map((key,i) => [key,children[i]]));
    const value = Object.freeze(array ? Object.assign(new Array(length), entries) : entries);
    this.nodes.set(input, { keys, children, length, value });
    return value as T;
  }
}

/** Main-thread read port, with only the audited HUD/Vector methods restored.
 * Commands are intentionally NOT fabricated/optimistically accepted here: the
 * eventual input/control channel must return the owner's real command result. */
export class LanPresentationUiReceiver {
  private session: LanUiSession;
  private decoder: CombatPresentationDecoder | null;
  private current: LanPresentationUiSnapshot | null = null;
  private copies = new UiSnapshotCopies();
  private map: TacticalMapSnapshot | undefined;
  private deployment: DeploymentView | undefined;
  readonly views: LanPresentationReadViews;
  constructor(session: LanUiSession) {
    if (!validSession(session)) throw Error('Invalid UI session');
    this.session = { ...session };
    this.decoder = new CombatPresentationDecoder(session.epoch, 'render-strict', 'ui');
    this.views = {
      hud: liveCombatHudView(() => this.read().hud),
      map: { read: () => { this.read(); return this.map!; } },
      deployment: { read: () => { this.read(); return this.deployment!; } },
      presence: () => this.read().presence,
    };
  }
  private read(): LanPresentationUiSnapshot {
    if (!this.decoder || !this.current) throw Error('UI presentation is not available');
    return this.current;
  }
  receive(packet: LanUiPacket): LanUiReceipt | null {
    if (!this.decoder) throw Error('UI receiver is closed');
    if (!packet || !sameSession(this.session, packet)) return null;
    try {
      const value = this.decoder.applyUi(packet.graph);
      // Map/deployment readers retain immutable snapshots, not mutating delta nodes.
      const map = this.copies.copy(value.map);
      const deployment = this.copies.copy(value.deployment);
      const presence = this.copies.copy(value.presence);
      this.current = { ...value, presence }; this.map = map; this.deployment = deployment;
      // Only successful decode AND publication grants the reusable buffer receipt.
      return { ...this.session, revision: packet.graph.revision, buffer: packet.graph.buffer };
    } catch (error) { this.close(); throw error; }
  }
  reset(session: LanUiSession): boolean {
    if (!this.decoder) throw Error('UI receiver is closed');
    if (!validSession(session)) throw Error('Invalid UI session');
    if (session.owner === this.session.owner && session.epoch <= this.session.epoch) return false;
    this.session = { ...session }; this.decoder = new CombatPresentationDecoder(session.epoch, 'render-strict', 'ui');
    this.current = null; this.map = undefined; this.deployment = undefined; this.copies = new UiSnapshotCopies();
    return true;
  }
  close(): void { this.decoder = null; this.current = null; this.map = undefined; this.deployment = undefined; this.copies = new UiSnapshotCopies(); }
  get retainedObjects(): number { return this.decoder?.retainedObjects ?? 0; }
}
