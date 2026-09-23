import { CombatReplayJournal, copyReplayCheckpoint, type CombatReplayCheckpoint } from './CombatReplayCheckpoint';
import { copyTacticalMapSnapshot, type TacticalMapSource, type TacticalMapSnapshot } from '../TacticalMapView';
import { copyDeploymentView, type DeploymentView, type DeploymentViewSource } from '../DeploymentView';
import type { DeploymentCommand } from '../DeploymentControl';
import { registerShipDisplayStrings } from '../../content/ShipDisplayStrings';
import type { ShipSpec } from '../../content/ShipSpec';
import { localCombatContentSignature } from './LocalCombatContent';
import { copyControlSample, type CombatControlSample } from '../CombatControl';
import { CombatPresentationDecoder } from './CombatPresentationDecoder';
import type { DetachedCombatPresentation } from './CombatPresentationWire';
import type { LocalCombatConfig, LocalCombatCommand } from './LocalCombatKernel';
import { LOCAL_COMBAT_PROTOCOL, type LocalCombatAck, type LocalCombatRequest, type LocalCombatResponse } from './LocalCombatProtocol';

export interface LocalCombatFrame extends Omit<LocalCombatAck, 'frame'> {
  tick: number; revision: number; packetBytes: number; presentation: DetachedCombatPresentation; decodeMs: number;
}
type Operation = { kind: 'step'; sample: CombatControlSample } | { kind: 'commands'; commands: LocalCombatCommand[] } | { kind: 'init'; config: LocalCombatConfig } | {kind: 'restore'; checkpoint: CombatReplayCheckpoint};
type Pending = { operation: Operation; sequence: number; resolve: (frame: LocalCombatFrame) => void; reject: (error: Error) => void };
let nextEpoch = 1;

/** One authoritative writer; at most one posted transaction and 128 queued edges.
 * A step cannot queue behind another step. No speculative input writes or silent
 * inline failover after a worker tick: a RenderFrame cannot restore authority. */
export class LocalWorkerHost {
  readonly epoch = nextEpoch++;
  readonly ready: Promise<LocalCombatFrame>;
  private readonly worker: Worker;
  private readonly journal: CombatReplayJournal;
  private replayStarted = 0;
  private replayCompleted = -1;
  private replayTotal = 0;
  get recoveryUnavailableReason(): string | undefined { return this.journal.unavailableReason; }
  /** Last ACK only: pending and failed transactions are deliberately excluded. */
  checkpoint(): CombatReplayCheckpoint { return this.journal.checkpoint(); }
  private readonly contentSignature: string;
  private readonly decoder: CombatPresentationDecoder;
  private readonly queue: Pending[] = [];
  private readonly presentationStrings = new WeakSet<ShipSpec>();
  private inFlight?: Pending;
  private sequence = 0;
  private terminal?: Error;
  private readonly failureListeners = new Set<(error: Error) => void>();
  subscribeFailure(listener: (error: Error) => void): () => void {
    this.failureListeners.add(listener);
    if (this.terminal && !this.disposed) listener(this.terminal);
    return () => this.failureListeners.delete(listener);
  }
  private disposed = false;
  private recycled?: ArrayBuffer;
  private recycledVisuals?: ArrayBuffer;
  private timer?: ReturnType<typeof setTimeout>;
  private stepPending = false;
  private _latest: LocalCombatFrame | null = null;
  private mapSnapshot?: TacticalMapSnapshot;
  private deploymentSnapshot?: DeploymentView;
  get latest(): LocalCombatFrame | null { return this._latest; }
  get pendingTransactions(): number { return this.queue.length + Number(!!this.inFlight); }
  get status(): 'starting' | 'ready' | 'failed' | 'disposed' { return this.disposed ? 'disposed' : this.terminal ? 'failed' : this._latest ? 'ready' : 'starting'; }
  get error(): Error | undefined { return this.terminal; }
  constructor(config: LocalCombatConfig, private readonly timeoutMs = 90_000, checkpoint?: CombatReplayCheckpoint) {
    if (!(timeoutMs > 0) || !Number.isFinite(timeoutMs)) throw new Error('Invalid combat transaction timeout');
    const recovery = checkpoint ? copyReplayCheckpoint(checkpoint, LOCAL_COMBAT_PROTOCOL) : undefined;
    const cloned = structuredClone(recovery?.config ?? config);
    this.decoder = new CombatPresentationDecoder(this.epoch, 'render-strict');
    this.contentSignature = localCombatContentSignature();
    if (recovery && recovery.config.expectedContent !== this.contentSignature)
      throw new Error('Content changed since the combat checkpoint; recovery refused');
    const accepted = { ...cloned, expectedContent: this.contentSignature };
    this.journal = new CombatReplayJournal(accepted, LOCAL_COMBAT_PROTOCOL);
    this.worker = new Worker(new URL('./local-combat.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onerror = event => this.fail(new Error(event.message || 'Local combat worker failed'));
    this.worker.onmessageerror = () => this.fail(new Error('Local combat worker message could not be decoded'));
    this.worker.onmessage = (event: MessageEvent<LocalCombatResponse>) => this.receive(event.data);
    this.ready = this.enqueue(recovery ? {kind:'restore', checkpoint:recovery} : { kind: 'init', config: accepted });
  }
  step(sample: CombatControlSample): Promise<LocalCombatFrame> {
    if (this.stepPending) return Promise.reject(new Error('A combat tick is already pending'));
    let accepted: CombatControlSample;
    try { accepted = copyControlSample(sample); } catch (error) { return Promise.reject(error); }
    this.stepPending = true;
    return this.enqueue({ kind: 'step', sample: accepted }).finally(() => { this.stepPending = false; });
  }
  commands(commands: readonly LocalCombatCommand[]): Promise<LocalCombatFrame> {
    if (commands.length > 128) return Promise.reject(new Error('Combat command budget exceeded'));
    try { return this.enqueue({ kind: 'commands', commands: structuredClone([...commands]) }); }
    catch (error) { return Promise.reject(error); }
  }
  readonly tacticalMapView: TacticalMapSource = { read: () => {
    if (!this.mapSnapshot) throw new Error('Local combat map view is not ready');
    return this.mapSnapshot;
  } };
  readonly deploymentView: DeploymentViewSource = { read: () => {
    if (!this.deploymentSnapshot) throw new Error('Local combat deployment view is not ready');
    return this.deploymentSnapshot;
  } };
  async dispatchDeployment(command: DeploymentCommand): Promise<import('../CombatCommands').CommandResult> {
    const frame = await this.commands([{ kind: 'deployment', command }]);
    return frame.results[0];
  }
  /** Pause/settlement barrier: waits behind the accepted tick, never advances another. */
  barrier(): Promise<LocalCombatFrame> { return this.commands([]); }
  private enqueue(operation: Operation): Promise<LocalCombatFrame> {
    if (!this.terminal && localCombatContentSignature() !== this.contentSignature) this.fail(new Error('Content changed during hosted combat; a new worker epoch is required'));
    if (this.terminal) return Promise.reject(this.terminal);
    const cost = (op: Operation) => op.kind === 'commands' ? Math.max(1, op.commands.length) : 1;
    const queuedCost = this.queue.reduce((sum, pending) => sum + cost(pending.operation), this.inFlight ? cost(this.inFlight.operation) : 0);
    if (this.pendingTransactions >= 128 || queuedCost + cost(operation) > 128) return Promise.reject(new Error('Local combat transaction queue full'));
    return new Promise((resolve, reject) => {
      this.queue.push({ operation, sequence: ++this.sequence, resolve, reject }); this.pump();
    });
  }
  private pump(): void {
    if (this.terminal || this.inFlight || !this.queue.length) return;
    const pending = this.inFlight = this.queue.shift()!;
    if (pending.operation.kind === 'restore') {
      this.replayStarted = performance.now();
      this.replayTotal = pending.operation.checkpoint.entries.reduce((sum, entry) => sum + (entry.kind === 'step' ? entry.count : 1), 0);
    }
    this.timer = setTimeout(() => this.fail(new Error('Local combat transaction timed out; authority cannot be safely recovered from presentation')), this.timeoutMs);
    try {
      const recycle = this.recycled, recycleVisuals = this.recycledVisuals; this.recycled = undefined; this.recycledVisuals = undefined;
      this.worker.postMessage({ protocol: LOCAL_COMBAT_PROTOCOL, epoch: this.epoch, sequence: pending.sequence, ...pending.operation, recycle, recycleVisuals } satisfies LocalCombatRequest, [recycle, recycleVisuals].filter((buffer): buffer is ArrayBuffer => !!buffer));
    }
    catch (error) { this.fail(error instanceof Error ? error : new Error(String(error))); }
  }
  private receive(message: LocalCombatResponse): void {
    if (this.terminal) return;
    const pending = this.inFlight;
    if (!message || !pending || message.protocol !== LOCAL_COMBAT_PROTOCOL || message.epoch !== this.epoch || message.sequence !== pending.sequence) {
      this.fail(new Error('Unexpected local combat acknowledgement')); return;
    }
    if (message.kind === 'replay-progress') {
      const operation = pending.operation;
      const total = this.replayTotal;
      if (operation.kind !== 'restore' || !Number.isSafeInteger(message.completed) || message.total !== total
        || message.completed <= this.replayCompleted || message.completed > total || performance.now() - this.replayStarted > 600_000) {
        this.fail(new Error('Invalid or expired combat replay progress')); return;
      }
      this.replayCompleted = message.completed;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.fail(new Error('Combat replay stalled')), this.timeoutMs);
      return;
    }
    if (message.kind === 'failed') { this.fail(new Error(message.message)); return; }
    if (message.kind !== 'ack' || message.frame?.tick !== (pending.operation.kind === 'restore' ? pending.operation.checkpoint.tick : (this._latest?.tick ?? 0) + Number(pending.operation.kind === 'step'))) {
      this.fail(new Error('Invalid local combat tick acknowledgement')); return;
    }
    try {
      if (!Array.isArray(message.witness) || message.witness.length !== 22 || message.witness[0] !== message.frame.tick || !message.witness.every(Number.isFinite))
        throw new Error('Invalid authority replay witness');
      const operation = pending.operation;
      const start = performance.now();
      const presentation = this.decoder.apply(message.frame);
      this.mapSnapshot = copyTacticalMapSnapshot(presentation.hud.map, this.mapSnapshot);
      this.deploymentSnapshot = copyDeploymentView(presentation.hud.deployment, this.deploymentSnapshot);
      for (const ship of presentation.view.allCapitalShips) registerShipDisplayStrings(ship.spec, this.presentationStrings);
      const { frame, ...metadata } = message;
      this.recycled = frame.buffer; this.recycledVisuals = frame.visuals.buffer;
      const accepted = this._latest = { ...metadata, presentation, tick: frame.tick, revision: frame.revision, packetBytes: (frame.length + frame.visuals.length) * 8, decodeMs: performance.now() - start };
      if (operation.kind === 'init') this.journal.initialize(message.witness);
      else if (operation.kind === 'restore') this.journal.seed(operation.checkpoint);
      else this.journal.record(operation, message.results, message.witness);
      clearTimeout(this.timer); this.inFlight = undefined;
      pending.resolve(accepted); this.pump();
    } catch (error) { this.fail(error instanceof Error ? error : new Error(String(error))); }
  }
  private fail(error: Error): void {
    if (this.terminal) return;
    if (this.mapSnapshot) this.mapSnapshot = Object.freeze({ ...this.mapSnapshot, available: false, map: null });
    if (this.deploymentSnapshot) this.deploymentSnapshot = Object.freeze({ ...this.deploymentSnapshot, available: false });
    this.terminal = error; this.recycled = undefined; this.recycledVisuals = undefined; clearTimeout(this.timer); this.worker.terminate();
    this.inFlight?.reject(error); this.inFlight = undefined;
    for (const pending of this.queue.splice(0)) pending.reject(error);
    // A paused host may have NO pending request: still surface its crash immediately.
    if (!this.disposed) for (const listener of this.failureListeners) listener(error);
  }
  dispose(): void { this.disposed = true; this.fail(new Error('Local combat host disposed')); this.failureListeners.clear(); this._latest = null; }
}
