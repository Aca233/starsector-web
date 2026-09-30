import type { LanVisualDelivery, LanVisualResult } from './LanPresentationVisuals';
import { motionFromText } from './MotionFrame.mjs';
import { motionAuthority } from './MotionReplica';
import { combatStateFromText } from './CriticalCombatState.mjs';
import { inspectLanComponent, type LanComponentDelivery, type LanComponentResult } from './LanPresentationComponents';
import { LanBinaryStateIngress, type LanBinaryDelivery, type LanBinaryIngressSession } from './LanBinaryStateIngress';
import { LanPresentationCommandOwner, type LanViewReply } from './LanPresentationCommands';
import { LanPresentationUiPublisher, type LanUiPacket } from './LanPresentationUiTransport';
import { LanPresentationControls } from './LanPresentationControls';
import { createLanPresentationViews, type LanPresentationLocalViews } from './LanPresentationViews';
import type { CombatSnapshot } from './CombatSnapshot';
import type { Match, Seat, PlayerInput } from './protocol';
import { SnapshotPlayback } from './SnapshotPlayback';
import { LanPresentationPipeline, type LanPresentationSample, type LanEffectActivity } from './LanPresentationPipeline';
import { createLanDisplayWorld } from './LanDisplayBootstrap';
import { applyLanDisplaySnapshots } from './LanDisplaySnapshot';
import type { LanDisplayWorld } from './LanDisplayWorld';
import { WebGLCombatRenderer, type WebGLRendererLifecycle } from '../engine/render/webgl/WebGLCombatRenderer';
import type { RenderCanvas } from '../engine/render/RenderSurface';
import { Vector2 } from '../engine/math/Vector2';
import { VisualRandom } from '../engine/runtime/VisualRandom';

export interface LanPresentationDraw {
  dt: number;
  visualTime: number;
  alpha: number;
  camera: Vector2;
  zoom: number;
  layers: ReadonlySet<string>;
  damageEnabled: boolean;
}
/** Actual LanBattle receive/render owner, also usable in an offscreen realm.
 * Network credits, synchronization, accepted-input scheduling and DOM/audio stay
 * with the caller. No restored world is serialized across a thread boundary. */
export class LanPresentationRuntime {
  readonly renderer: WebGLCombatRenderer;
  private worldState: LanDisplayWorld | null = null;
  private viewState: LanPresentationLocalViews | null = null;
  private pipelineState: LanPresentationPipeline;
  private controlled = new Set<string>();
  appliedTick = -1;
  latest: CombatSnapshot | null = null;
  private playback = new SnapshotPlayback();
  private readonly random: VisualRandom;
  private disposed = false;
  private failed = false;
  private uiPublisher: LanPresentationUiPublisher | null = null;
  private uiCommands: LanPresentationCommandOwner | null = null;
  private binaryIngress: LanBinaryStateIngress | null = null;
  private componentSession: LanBinaryIngressSession | null = null;

  constructor(private readonly match: Match, private readonly seat: Seat, initial: CombatSnapshot | undefined,
    canvas: RenderCanvas, gl: WebGL2RenderingContext, lifecycle: WebGLRendererLifecycle = {},
    readonly controls = new LanPresentationControls()) {
    this.pipelineState = new LanPresentationPipeline(match.id, seat);
    this.random = new VisualRandom(match.seed);
    this.renderer = new WebGLCombatRenderer(canvas, gl, lifecycle);
    try { if (initial) this.initialize(initial); }
    catch (error) { this.renderer.dispose(); throw error; }
  }

  get world(): LanDisplayWorld {
    if (!this.worldState) throw Error('LAN presentation world is not initialized');
    return this.worldState;
  }
  get views(): LanPresentationLocalViews {
    if (!this.viewState) throw Error('LAN presentation views are not initialized');
    return this.viewState;
  }
  get pipeline(): LanPresentationPipeline { return this.pipelineState; }
  get controlledIds(): ReadonlySet<string> { return this.controlled; }

  /** Opt-in UI-only transport for an offscreen owner. Default LanBattle keeps its
   * direct views and pays no encoding/transfer cost. One publisher per owner. */
  createUiPublisher(send: (packet: LanUiPacket, transfer: Transferable[]) => void, onError: (error: unknown) => void): LanPresentationUiPublisher {
    this.assertActive();
    if (this.uiPublisher && !this.uiPublisher.stats.closed) throw Error('UI publisher already exists');
    this.uiCommands?.close(); this.uiCommands = null;
    return this.uiPublisher = new LanPresentationUiPublisher(() => {
      this.assertActive(); return this.views.captureForTransfer();
    }, send, error => { this.invalidate(); onError(error); });
  }

  createUiCommandOwner(sendUi: (packet: LanUiPacket, transfer: Transferable[]) => void,
    sendResult: (reply: LanViewReply) => void, onError: (error: unknown) => void): LanPresentationCommandOwner {
    this.assertActive();
    const publisher = this.createUiPublisher(sendUi, onError);
    return this.uiCommands = new LanPresentationCommandOwner(publisher, () => { this.assertActive(); return this.views; },
      () => Math.max(0, this.appliedTick), sendResult, error => { this.invalidate(); onError(error); });
  }

  /** Explicit connection control event; never infer an epoch from packet data. */
  resetBinaryIngress(session: LanBinaryIngressSession): void {
    this.assertActive();
    const components = session.components;
    if (components && (typeof components.syncId !== 'string' || components.syncId.length > 128
      || typeof components.motion !== 'boolean' || typeof components.combat !== 'boolean')) throw Error('Invalid component session');
    this.binaryIngress ??= new LanBinaryStateIngress(this.match.id);
    this.binaryIngress.reset(session);
    this.componentSession = { ...session, components: components && { ...components } };
    this.pipeline.motion.clear(); this.pipeline.combat.clear();
    if (this.worldState) this.pipeline.prediction.clear(this.worldState.playerShip);
  }
  /** Decode + restore + retain stay in this realm. No decoded frame is returned
   * to the transport. The in-realm callback must retain ancillary sound/input
   * events before its caller completes the network consumption receipt. */
  receiveBinaryState(packet: LanBinaryDelivery, minTick: number, onRetained: (frame: CombatSnapshot) => void) {
    this.assertActive();
    if (!this.binaryIngress) throw Error('Binary ingress has not been configured');
    if (!(minTick === Infinity || (Number.isSafeInteger(minTick) && minTick >= 0))) throw Error('Invalid ingress minimum tick');
    try {
      const ingress = this.binaryIngress;
      const decoded = ingress.decode(packet);
      if (!decoded) return { retained: false, tick: null, bytes: 0, parseMs: 0 };
      const { frame, bytes, parseMs } = decoded;
      if (frame.tick < minTick) return { retained: false, tick: frame.tick, bytes, parseMs };
      if (!this.receive(frame)) return { retained: false, tick: frame.tick, bytes, parseMs };
      if (!this.worldState) this.initialize(frame);
      const result: unknown = onRetained(frame);
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        void Promise.resolve(result).catch(() => {});
        throw Error('Binary ancillary retention must finish synchronously');
      }
      const stats = ingress.stats;
      const retained = this.binaryIngress === ingress && !this.disposed && !this.failed
        && !stats.closed && stats.epoch === packet.epoch && stats.owner === packet.owner;
      return { retained, tick: frame.tick, bytes, parseMs };
    } catch (error) { this.invalidate(); throw error; }
  }

  /** Exceptional wire-JSON path. The caller fences its explicit session and
   * keeps the receipt pending until this same-realm retention finishes. */
  receiveFallback(frame: CombatSnapshot, minTick: number, onRetained: (frame: CombatSnapshot) => void): boolean {
    this.assertActive();
    try {
      if (!frame || !Number.isSafeInteger(frame.tick) || frame.tick < 0 || !Number.isSafeInteger(minTick) || minTick < 0) throw Error('Invalid JSON presentation state');
      if (frame.tick < minTick || !this.receive(frame)) return false;
      if (!this.worldState) this.initialize(frame);
      const result: unknown = onRetained(frame);
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        void Promise.resolve(result).catch(() => {});
        throw Error('JSON ancillary retention must finish synchronously');
      }
      return !this.disposed && !this.failed;
    } catch (error) { this.invalidate(); throw error; }
  }

  /** Common synchronous path for the default receiver and local host. */
  receiveMotion(data: unknown, now: number, active: boolean, onAdvanced?: (ack: number) => void): LanComponentResult {
    this.assertActive();
    if (!active || !this.worldState) return { status: 'discarded', advanced: false };
    const frame = motionFromText(data), pipeline = this.pipeline;
    const advanced = pipeline.motion.receive(frame, now, this.appliedTick);
    if (!advanced) return { status: 'consumed', advanced: false };
    const acknowledged = frame.acknowledged[this.seat];
    onAdvanced?.(acknowledged);
    const player = this.world.playerShip, row = pipeline.motion.row(player.id, now, this.appliedTick);
    if (row && !row[8]) pipeline.prediction.receive(motionAuthority(player, row), acknowledged, now);
    return { status: 'consumed', advanced, acknowledged };
  }

  receiveCombat(data: unknown, tick: number, now: number, active: boolean, minTick: number): LanComponentResult {
    this.assertActive();
    const frame = combatStateFromText(data);
    if (frame.tick !== tick) throw Error('Critical combat tick mismatch');
    if (!active || frame.tick < minTick) return { status: 'discarded', advanced: false };
    return { status: 'consumed', advanced: this.pipeline.combat.receive(frame, now, this.appliedTick) };
  }

  /** Worker route shares the same codecs/replicas. Only explicit connection
   * control resets can grant a new owner/epoch/sync, never an arriving packet. */
  receiveComponent(packet: LanComponentDelivery, now: number, active: boolean, minTick: number): LanComponentResult {
    this.assertActive();
    const session = this.componentSession, components = session?.components;
    if (!components || packet.owner !== session!.owner || packet.epoch !== session!.epoch
      || packet.matchId !== this.match.id || !components.syncId || packet.syncId !== components.syncId
      || (packet.kind !== 'motion' && packet.kind !== 'combat') || !components[packet.kind])
      return { status: 'discarded', advanced: false };
    try {
      if (!Number.isFinite(now) || !(minTick === Infinity || (Number.isSafeInteger(minTick) && minTick >= 0))) throw Error('Invalid component clock');
      if (inspectLanComponent(packet.kind, packet.data) !== packet.tick) throw Error('Component tick mismatch');
      return packet.kind === 'motion' ? this.receiveMotion(packet.data, now, active)
        : this.receiveCombat(packet.data, packet.tick, now, active, minTick);
    } catch (error) { this.invalidate(); throw error; }
  }

  /** Match the default page's atomic visual discard behavior. A retained base
   * below minTick can decode a later update, but is not displayed sync evidence. */
  receiveVisual(packet: LanVisualDelivery, now: number, active: boolean, minTick: number): LanVisualResult {
    this.assertActive();
    const session = this.componentSession;
    if (!active || !this.worldState || !session?.projectileVisuals || packet.owner !== session.owner
      || packet.epoch !== session.epoch || packet.matchId !== this.match.id || !session.components?.syncId
      || packet.syncId !== session.components.syncId) return { status: 'discarded', advanced: false };
    try {
      if (!Number.isFinite(now) || !(minTick === Infinity || Number.isSafeInteger(minTick) && minTick >= 0)
        || !Number.isSafeInteger(packet.tick) || packet.tick < 0 || !['baseline', 'update'].includes(packet.kind)
        || !(packet.data instanceof ArrayBuffer)) throw Error('Invalid visual delivery');
      const advanced = this.pipeline.projectileVisuals.receive(packet.key, packet.kind, new Uint8Array(packet.data), now, minTick);
      return { status: 'consumed', advanced };
    } catch { return { status: 'discarded', advanced: false }; }
  }

  private assertActive(): void {
    if (this.disposed || this.failed) throw new Error('LAN presentation runtime is not active');
  }
  private invalidate(): void { this.failed = true; this.componentSession = null; this.binaryIngress?.close(); this.uiCommands?.close(); this.uiPublisher?.close(); this.viewState?.dispose(); }

  /** Loading ACK does not require a world. Retain ingress/events from the first
   * packet, then establish the world once the manifest is ready. Single owner:
   * callers cannot replace a live world while asset preparation is pending. */
  initialize(initial: CombatSnapshot): void {
    this.assertActive();
    if (this.worldState) throw Error('LAN presentation world is already initialized');
    try {
      const replica = createLanDisplayWorld(this.match, this.seat, initial);
      this.worldState = replica.world;
      this.controlled = new Set([...replica.controlled.values()].map(ship => ship.id));
      this.controls.camera.copy(this.worldState.playerShip.pos);
      this.viewState = createLanPresentationViews(this.match, this.worldState);
    } catch (error) { this.invalidate(); throw error; }
  }

  async prepareAssets(): Promise<void> {
    this.assertActive();
    await this.renderer.prepareAssets(this.world.renderView());
    // A late texture completion cannot grant readiness to a disposed owner.
    this.assertActive();
  }

  apply(frames: readonly CombatSnapshot[], reset = false, afterApply?: (frame: CombatSnapshot) => void): void {
    this.assertActive();
    try { applyLanDisplaySnapshots(this.world, frames, reset, afterApply); }
    catch (error) { this.invalidate(); throw error; }
  }

  /** May precede initialize(). Retain discrete events at ingress, not just the
   * endpoints ultimately selected by playback. Caller owns syncId/minTick and
   * bounded decoder credits; successful postMessage is NOT a consume receipt. */
  receive(frame: CombatSnapshot): boolean {
    this.assertActive();
    try {
      if (!this.playback.push(frame)) return false;
      this.pipeline.localMuzzles.receive(frame.muzzleEvents);
      return true;
    } catch (error) { this.invalidate(); throw error; }
  }

  applyPlayback(now: number, immediate: boolean, afterApply?: (frame: CombatSnapshot) => void, beforeApply?: () => void): LanPresentationSample {
    this.assertActive();
    try {
      const sample = this.playback.sample(now, immediate);
      if (sample.frames.length && sample.reset) this.controls.controller.reset();
      if (sample.frames.length) beforeApply?.();
      if (sample.frames.length) this.pipeline.applyEndpoints(this.world, sample, now, frame => {
        this.appliedTick = frame.tick; this.latest = frame; afterApply?.(frame);
      });
      return sample;
    } catch (error) { this.invalidate(); throw error; }
  }

  /** Synchronization stays AFTER applyPlayback and BEFORE this call. */
  renderPose(now: number, readInput: () => PlayerInput, active: boolean): void {
    this.assertActive();
    this.pipeline.renderPose(this.world, this.appliedTick, now, readInput, active);
  }

  recordAcceptedInput(input: PlayerInput, now: number, active: boolean): void {
    this.assertActive();
    this.pipeline.recordAcceptedInput(this.world, input, now, active);
  }

  /** Follow/update the camera BEFORE this call; no input or UI is serialized here. */
  drawPlayback(sample: LanPresentationSample, now: number, view: Omit<LanPresentationDraw, 'alpha' | 'visualTime'>, activity: LanEffectActivity): boolean {
    this.assertActive();
    this.pipeline.renderEffects(this.world, sample, now, activity);
    return this.draw({ ...view, alpha: sample.alpha, visualTime: sample.visualTime });
  }

  /** Stop is not reset/dispose: a terminal decoder flush may have retained its
   * last endpoints/events without reaching RAF. Keep them for that final frame.
   * Failure/disposal explicitly opts out of confirmed effect preservation. */
  stop(preserveTerminalEffects = true): void {
    if (this.disposed) return;
    this.binaryIngress?.close(); this.binaryIngress = null; this.componentSession = null;
    this.viewState?.invalidateCommands();
    if (this.uiCommands) this.uiCommands.reset(); else this.uiPublisher?.reset();
    const world = this.worldState, pipeline = this.pipeline;
    if (!world) { this.pipelineState = new LanPresentationPipeline(this.match.id, this.seat); return; }
    pipeline.motion.clear(); pipeline.combat.clear(); pipeline.projectileVisuals.clear();
    pipeline.prediction.clear(world.playerShip); pipeline.firePrediction.reset(world); pipeline.turretPrediction.reset();
    pipeline.projectileFlight.reset(); pipeline.localContrails.reset(world);
    if (!preserveTerminalEffects) { pipeline.localMuzzles.reset(world); pipeline.localParticles.reset(world); }
  }

  resetPlayback(): void {
    this.assertActive();
    this.playback = new SnapshotPlayback(); this.appliedTick = -1; this.latest = null;
    this.stop(false);
  }

  draw(view: LanPresentationDraw): boolean {
    this.assertActive();
    const frame = { visualTime: view.visualTime, random: this.random, layers: view.layers, damageEnabled: view.damageEnabled };
    const world = this.world.renderView();
    this.renderer.updateVisual(world, view.dt, frame);
    return this.renderer.render(world, view.alpha, view.camera, view.zoom, frame);
  }

  dispose(): void {
    if (this.disposed) return;
    this.uiCommands?.close(); this.uiPublisher?.close();
    this.viewState?.dispose();
    this.playback = new SnapshotPlayback(); this.latest = null;
    try { this.stop(false); }
    finally { this.disposed = true; this.renderer.dispose(); }
  }
}
