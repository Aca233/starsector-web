import { captureCombatAudio, type CombatAudioEvent } from '../engine/audio/CombatAudioEvents';
import type { CommandResult } from '../engine/runtime/CombatCommands';
import type { TacticalCommand } from '../engine/runtime/TacticalControl';
import type { LanPresentationLocalViews, LanPresentationViews } from './LanPresentationViews';
import { LanPresentationUiReceiver, type LanPresentationUiPublisher, type LanUiPacket, type LanUiReceipt, type LanUiSession } from './LanPresentationUiTransport';

const CAPACITY = 16;
const denied = '联机地图仅提供观察、增援和撤退；战术指令尚未接入主机。';
const unavailable = '呈现会话已更新或关闭，旧操作不再有效。';
const unknownOutcome = '尚未收到完整呈现确认，操作状态未知；请重新同步，不要自动重试。';
const reject = (reason: string): CommandResult => ({ accepted: false, reason });
const sameSession = (a: LanUiSession, b: LanUiSession) => a.owner === b.owner && a.epoch === b.epoch;
export type LanViewOperation = { kind: 'map'; open: boolean } | { kind: 'select'; unitId: string | null };
export interface LanViewRequest extends LanUiSession { id: number; operation: LanViewOperation }
export type LanViewSound = Readonly<{ kind: 'play'; key: 'map_open' | 'map_close' | 'command_deselect'; volume: number; rate: number }>;
export interface LanViewReply extends LanUiSession {
  readonly id: number; readonly result: CommandResult; readonly afterRevision: number; readonly sounds: readonly LanViewSound[];
}
function operation(value: unknown): LanViewOperation | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>, keys = Object.keys(v);
  if (keys.length !== 2 || !keys.includes('kind')) return null;
  if (v.kind === 'map' && keys.includes('open') && typeof v.open === 'boolean') return { kind: 'map', open: v.open };
  if (v.kind === 'select' && keys.includes('unitId')) {
    if (v.unitId === null) return { kind: 'select', unitId: null };
    if (typeof v.unitId === 'string' && v.unitId.length > 0 && v.unitId.length <= 256) return { kind: 'select', unitId: v.unitId };
  }
  return null;
}
function uiSound(value: CombatAudioEvent): LanViewSound {
  if (value.kind !== 'play' || !['map_open', 'map_close', 'command_deselect'].includes(value.key)
    || !Number.isFinite(value.volume) || value.volume < 0 || value.volume > 1 || value.rate !== 1
    || value.position !== undefined || value.listener !== undefined || value.maxDistance !== undefined) throw Error('Unexpected presentation command audio');
  return Object.freeze({ kind: 'play', key: value.key, volume: value.volume, rate: value.rate }) as LanViewSound;
}

/** Synchronous owner-side execution. The only retained queue is <=16 small reply
 * records for idempotence; never schedules gameplay work or copies a render world. */
export class LanPresentationCommandOwner {
  private sessionState: LanUiSession;
  private lastId = 0;
  private dirty = false;
  private history = new Map<number, { signature: string; reply: LanViewReply }>();
  private closed = false;
  constructor(private readonly publisher: LanPresentationUiPublisher,
    private views: (() => LanPresentationLocalViews) | null, private tick: (() => number) | null,
    private send: ((reply: LanViewReply) => void) | null, private readonly onError: (error: unknown) => void) {
    this.sessionState = publisher.session;
  }
  get session(): LanUiSession { return this.publisher.session; }
  get stats() { return { ...this.session, closed: this.closed || this.publisher.stats.closed, pendingUi: this.publisher.stats.pending,
    dirty: this.dirty, lastId: this.lastId, retainedReplies: this.history.size }; }
  private synchronize(): void {
    if (!sameSession(this.sessionState, this.session)) {
      this.sessionState = this.session; this.lastId = 0; this.history.clear(); this.dirty = false;
    }
  }
  publish(): boolean {
    this.synchronize();
    if (this.stats.closed) throw Error('Presentation command owner is closed');
    const dirty = this.dirty; this.dirty = false;
    const sent = this.publisher.publish(this.tick!());
    if (!sent) this.dirty ||= dirty;
    return sent;
  }
  completeUi(receipt: LanUiReceipt): boolean {
    this.synchronize();
    if (!this.publisher.complete(receipt)) return false;
    if (this.dirty) this.publish();
    return true;
  }
  receive(request: LanViewRequest): boolean {
    this.synchronize();
    if (this.stats.closed || !request || !sameSession(this.session, request)) return false;
    try {
      if (!Number.isSafeInteger(request.id) || request.id <= 0) throw Error('Invalid presentation command id');
      const op = operation(request.operation), signature = JSON.stringify(op);
      const previous = this.history.get(request.id);
      if (previous) {
        if (previous.signature !== signature) throw Error('Conflicting presentation command id');
        this.send!(previous.reply); return true; // No repeated UI mutation or audio collection.
      }
      if (request.id <= this.lastId) return false; // Evicted duplicate, never execute it again.
      if (request.id !== this.lastId + 1) throw Error('Out-of-order presentation command');
      const sounds: LanViewSound[] = [];
      let result: CommandResult;
      const release = captureCombatAudio(event => {
        if (sounds.length >= 2) throw Error('Presentation command audio budget exceeded');
        sounds.push(uiSound(event));
      });
      try {
        const views = this.views!();
        result = !op ? reject(denied) : op.kind === 'map' ? views.setMapOpen(op.open) : views.tactical({ action: 'select', unitId: op.unitId });
      } finally { release(); }
      if (!result || typeof result.accepted !== 'boolean' || (result.reason !== undefined && (typeof result.reason !== 'string' || result.reason.length > 512))) throw Error('Invalid owner command result');
      if (!result.accepted && sounds.length) throw Error('Rejected command emitted audio');
      // Capture must happen AFTER execution; an older in-flight UI packet cannot
      // satisfy this result, even if its ACK arrives after the command reply.
      const reply: LanViewReply = Object.freeze({ ...this.session, id: request.id, result: Object.freeze({ ...result }),
        afterRevision: result.accepted ? this.publisher.nextRevision : 0, sounds: Object.freeze(sounds) });
      this.lastId = request.id; this.history.set(request.id, { signature, reply });
      if (this.history.size > CAPACITY) this.history.delete(this.history.keys().next().value!);
      if (result.accepted) this.dirty = true;
      this.send!(reply);
      if (this.dirty && !this.stats.closed && sameSession(reply, this.session)) this.publish();
      return true;
    } catch (error) { this.close(); this.onError(error); throw error; }
  }
  reset(): void {
    if (this.closed) return;
    this.publisher.reset(); this.synchronize();
  }
  close(): void {
    this.closed = true; this.history.clear(); this.dirty = false;
    this.views = null; this.tick = null; this.send = null; this.publisher.close();
  }
}
interface Pending {
  sent: boolean; deadline: number; reply?: LanViewReply;
  resolve: (result: CommandResult) => void; reject: (error: Error) => void;
}
/** Main-thread async view capability. Success requires both execution result AND
 * a post-command UI revision. Read facade never executes or guesses authority. */
export class LanPresentationCommandClient {
  private receiver: LanPresentationUiReceiver;
  private session: LanUiSession;
  private pending = new Map<number, Pending>();
  private nextId = 0;
  private revision = 0;
  private epoch = 0;
  private closed = false;
  private flushing = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  readonly views: LanPresentationViews;
  constructor(session: LanUiSession, private send: ((request: LanViewRequest) => void) | null,
    private readonly play: (sound: LanViewSound) => void, private readonly onError: (error: unknown) => void, private readonly timeoutMs = 6000) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw Error('Invalid command timeout');
    this.session = { ...session }; this.receiver = new LanPresentationUiReceiver(session);
    const commandEpoch = () => this.epoch;
    this.views = { ...this.receiver.views,
      get commandEpoch() { return commandEpoch(); },
      setMapOpen: open => this.issue({ kind: 'map', open }),
      tactical: command => this.tactical(command),
      dispose: () => this.close(),
    };
  }
  get stats() { return { closed: this.closed, pending: this.pending.size, revision: this.revision, epoch: this.epoch }; }
  private tactical(command: TacticalCommand): Promise<CommandResult> {
    if (command?.action === 'close') return this.issue({ kind: 'map', open: false });
    if (command?.action === 'select') return this.issue({ kind: 'select', unitId: command.unitId });
    return Promise.resolve(reject(denied));
  }
  private issue(value: LanViewOperation): Promise<CommandResult> {
    if (this.closed) return Promise.reject(Error(unavailable));
    const op = operation(value);
    if (!op) return Promise.resolve(reject(denied));
    if (this.pending.size >= CAPACITY) return Promise.resolve(reject('呈现操作等待确认中，请稍后再试。'));
    try { void this.receiver.views.hud.playerShip; } catch { return Promise.reject(Error('呈现尚未同步，暂不能操作地图。')); }
    if (!Number.isSafeInteger(this.nextId + 1)) return Promise.reject(Error('Presentation command sequence exhausted'));
    const id = ++this.nextId;
    return new Promise((resolve, rejectPending) => {
      const entry: Pending = { sent: false, deadline: performance.now() + this.timeoutMs, resolve, reject: rejectPending };
      this.pending.set(id, entry); this.schedule();
      try {
        this.send!({ ...this.session, id, operation: op });
        // A synchronous transport callback followed by a send exception must not
        // resolve success before send itself returned without error.
        if (this.pending.get(id) === entry) { entry.sent = true; this.flush(); }
      } catch (error) { this.fail(error); }
    });
  }
  receiveUi(packet: LanUiPacket): LanUiReceipt | null {
    if (this.closed) return null;
    try {
      const receipt = this.receiver.receive(packet);
      if (receipt) { this.revision = packet.graph.revision; this.flush(); }
      return receipt;
    } catch (error) { this.fail(error); throw error; }
  }
  receiveResult(reply: LanViewReply): boolean {
    if (this.closed || !reply || !sameSession(this.session, reply)) return false;
    const entry = this.pending.get(reply.id);
    if (!entry || entry.reply) return false;
    try {
      const result = reply.result;
      if (!result || typeof result.accepted !== 'boolean' || (result.reason !== undefined && (typeof result.reason !== 'string' || result.reason.length > 512))
        || !Number.isSafeInteger(reply.afterRevision) || (result.accepted ? reply.afterRevision < 1 : reply.afterRevision !== 0)
        || !Array.isArray(reply.sounds) || reply.sounds.length > 2 || (!result.accepted && reply.sounds.length)) throw Error('Invalid presentation command reply');
      // Retain only normalized small fields, not the incoming message object.
      entry.reply = { ...this.session, id: reply.id, result: { accepted: result.accepted, ...(result.reason === undefined ? {} : { reason: result.reason }) }, afterRevision: reply.afterRevision,
        sounds: reply.sounds.map(value => uiSound(value)) };
      this.flush(); return true;
    } catch (error) { this.fail(error); throw error; }
  }
  private flush(): void {
    if (this.flushing) return;
    this.flushing = true;
    try {
    const epoch = this.epoch;
    for (const [id, entry] of this.pending) {
      if (!entry.sent || !entry.reply || entry.reply.afterRevision > this.revision) break;
      const reply = entry.reply;
      try { for (const sound of reply.sounds) { this.play(sound); if (this.closed || epoch !== this.epoch) return; } }
      catch (error) { this.fail(error); return; }
      if (this.closed || epoch !== this.epoch) return;
      this.pending.delete(id); entry.resolve(reply.result);
    }
    } finally { this.flushing = false; this.schedule(); }
  }
  private schedule(): void {
    clearTimeout(this.timer); this.timer = undefined;
    const first = this.pending.values().next().value as Pending | undefined;
    if (first) this.timer = setTimeout(() => this.fail(Error(unknownOutcome)), Math.max(0, first.deadline - performance.now()));
  }
  private revoke(reason: string): void {
    this.epoch++;
    clearTimeout(this.timer); this.timer = undefined;
    const pending = [...this.pending.values()]; this.pending.clear();
    for (const entry of pending) entry.reject(Error(reason));
  }
  reset(session: LanUiSession): boolean {
    if (this.closed) return false;
    if (!this.receiver.reset(session)) return false;
    this.revoke(unavailable); this.session = { ...session }; this.nextId = 0; this.revision = 0;
    return true;
  }
  close(): void {
    if (this.closed) return;
    this.closed = true; this.revoke(unavailable); this.receiver.close(); this.send = null;
  }
  private fail(error: unknown): void {
    if (this.closed) return;
    this.closed = true; this.revoke(error instanceof Error ? error.message : unknownOutcome); this.receiver.close(); this.send = null;
    this.onError(error);
  }
}

/** Preserve inline completion on the default same-thread path. A completed
 * Promise from a revoked view must not reopen menus or re-enable stale controls. */
export function guardLanViewCommand(view: LanPresentationViews, command: () => CommandResult | Promise<CommandResult>, current: () => boolean = () => true): CommandResult | Promise<CommandResult> {
  const epoch = view.commandEpoch;
  const finish = (result: CommandResult) => epoch === view.commandEpoch && current() ? result : reject(unavailable);
  const result = command();
  return result instanceof Promise ? result.then(finish) : finish(result);
}
