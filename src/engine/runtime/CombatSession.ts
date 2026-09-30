import { JumpTargeting } from './JumpTargeting';
import { copyReplayCheckpoint, type CombatReplayCheckpoint } from './local/CombatReplayCheckpoint';
import { LOCAL_COMBAT_PROTOCOL } from './local/LocalCombatProtocol';
import { localCombatContentSignature } from './local/LocalCombatContent';
import { combatHudView, liveCombatHudView, type CombatHudView } from './CombatHudView';
import { LocalWorkerHost, type LocalCombatFrame } from './local/LocalWorkerHost';
import type { LocalCombatConfig } from './local/LocalCombatKernel';
import type { CombatRequest, CombatOutcome } from '../game/GameState';
import { CombatHandoff } from '../game/CombatHandoff';
import { sound } from '../audio/SoundManager';
import { TacticalMapViewProjector, type TacticalMapSource } from './TacticalMapView';
import { DeploymentViewProjector, type DeploymentViewSource } from './DeploymentView';
import { copyDeploymentCommand, prepareDeployment, applyPreparedDeployment, type DeploymentCommand } from './DeploymentControl';
import { contentRegistry } from '../content/ContentRegistry';
import { applyCombatControlCommand, applyCombatControlSample, copyControlSample, type CombatControlCommand, type CombatControlSample } from './CombatControl';
import { combatRenderView } from '../render/CombatRenderView';
import { CombatAuthority } from './CombatAuthority';
import { CombatTickHost } from './CombatTickHost';
import { CombatStepProfiler, type CombatStepSpan, type StepProfileOptions } from '../diagnostics/CombatStepProfiler';
import { CombatMulticore } from '../ai/multicore/CombatMulticore';
import type { AIPhaseBatch } from '../ai/multicore/Types';
import { DEFAULT_PLAYER_HULL, DEFAULT_ENEMY_HULL } from '../data/SandboxDefaults';
import { CapitalShipAI } from '../ai/CapitalShipAI';
import type { ICombatRenderer } from '../render/ICombatRenderer';
import { WebGLCombatRenderer, type WebGLRendererLifecycle } from '../render/webgl/WebGLCombatRenderer';
import type { ShipSpec } from '../content/ShipSpec';
import { CombatEngine } from '../simulation/CombatEngine';
import type { BattleResult } from '../simulation/CombatStatistics';
import { FixedTimestepScheduler } from '../simulation/FixedTimestepScheduler';
import { Vector2 } from '../math/Vector2';
import { CombatHudVisuals } from '../visual/CombatHudVisuals';
import { VisualClock } from './VisualClock';
import { VisualRandom } from './VisualRandom';
import { PerformanceMetrics, type PerformanceReport } from './PerformanceMetrics';
import { CameraController } from './CameraController';
import { assetManager } from '../assets/AssetResolver';
import { contentManifestManager } from '../content/ContentManifest';

export type CombatSessionState = 'created' | 'prepared' | 'running' | 'paused' | 'disposed';

export type CombatPresentationStatus = 'idle' | 'loading' | 'ready' | 'context-lost' | 'restoring' | 'failed' | 'disposed';
export type CombatPresentationErrorCode =
  | 'authority-failed'
  | 'webgl2-unsupported'
  | 'renderer-init-failed'
  | 'resource-prepare-failed'
  | 'context-restore-failed';

export interface CombatPresentationState {
  status: CombatPresentationStatus;
  errorCode: CombatPresentationErrorCode | null;
  errorMessage: string | null;
}

export type CombatRendererFactory = (
  canvas: HTMLCanvasElement,
  gl: WebGL2RenderingContext,
  lifecycle: WebGLRendererLifecycle
) => ICombatRenderer;

let nextSessionId = 1;

/** Owns the mutable lifetime of one combat run. React only keeps this object. */
export class CombatSession {
  private readonly authority: CombatAuthority;
  private workerEnabled = false;
  private workerHost?: LocalWorkerHost;
  private workerStep?: Promise<void | false>;
  private stagedRestore?: LocalWorkerHost;
  private restorePending = false;
  private encounter?: CombatRequest;
  private simulationPointLimit?: number;
  private loadingEncounter = false;
  private workerConfigSeed = 0x51f15e;
  private controlGeneration = 0;
  private acceptedWorkerSequence = 0;
  private telemetrySequence = 0;
  private pilotIntent?: boolean;
  private pilotRequest = 0;
  private inputSerial = 0;
  private readonly pendingReleases = new Map<string, {serial:number; promise:Promise<import('./CombatCommands').CommandResult>}>();
  /** Stable presentation facade, never the authoritative engine. */
  public readonly read: CombatHudView = liveCombatHudView(() => this.workerHost?.latest?.presentation.hud.read ?? combatHudView(this.authority.engine));
  private get renderView() { return this.workerHost?.latest?.presentation.view ?? combatRenderView(this.authority.engine); }
  public get controlEpoch(): number { return this.controlGeneration; }
  public readonly jumpTargeting = new JumpTargeting();
  public updateJumpTargeting(point?: Vector2): void {
    const view = this.renderView;
    this.jumpTargeting.update(this.read,this.controlEpoch,point,{
      ships:view.ships.filter(ship=>ship.isVisibleTo(view.playerShip.teamId)),asteroids:view.asteroids
    });
  }
  public enableWorker(): void {
    if (this.authority.tick !== 0) throw new Error('Worker migration requires a new encounter, not a display checkpoint');
    this.workerEnabled = true;
  }
  private closeWorker(): void { this.jumpTargeting.cancel(); this.stagedRestore?.dispose(); this.stagedRestore = undefined; this.restorePending = false; this.controlGeneration++; this.pilotIntent = undefined; this.pilotRequest++; this.inputSerial++; this.pendingReleases.clear(); this.acceptedWorkerSequence = 0; this.telemetrySequence = 0; this.workerHost?.dispose(); this.workerHost = undefined; this.workerStep = undefined; }
  public loadEncounter(request: CombatRequest, handoff = new CombatHandoff(request)): void {
    this.encounter = structuredClone(handoff.request); this.simulationPointLimit = undefined;
    this.loadingEncounter = true;
    try { handoff.deploy(this); } finally { this.loadingEncounter = false; }
    this.refreshPresentationAssets();
  }
  public beginSimulationDeployment(points: number, limit: number): void {
    this.closeWorker(); this.encounter = undefined; this.simulationPointLimit = limit;
    this.authority.engine.beginSimulationDeployment(points, limit);
  }
  public collectOutcome(handoff: CombatHandoff): CombatOutcome {
    if (!this.workerEnabled) return handoff.collect(this);
    const outcome = this.workerHost?.latest?.outcome;
    if (!outcome || outcome.encounterId !== handoff.request.id) throw new Error('权威战果尚未就绪，不能从显示帧结算。');
    return structuredClone(outcome);
  }
  private async ensureWorker(): Promise<void> {
    if (!this.workerEnabled) return;
    if (!this.workerHost) {
      const engine = this.authority.engine;
      const config: LocalCombatConfig = {playerHull: engine.playerShip.spec.id, enemyHull: engine.enemyShip.spec.id,
        seed: this.workerConfigSeed, encounter: this.encounter, simulationPointLimit: this.simulationPointLimit,
        presentation:'render', content:{ships:contentRegistry.getAllShips(), weapons:contentRegistry.getAllWeapons()}};
      const created = new LocalWorkerHost(config);
      this.workerHost = created;
      created.subscribeFailure(error => this.failAuthority(created, error));
    }
    const host = this.workerHost;
    const frame = await host.ready;
    if (this.workerHost === host && this.state !== 'disposed') this.acceptWorkerFrame(host, frame);
  }
  private acceptWorkerFrame(host: LocalWorkerHost, frame: LocalCombatFrame): void {
    if (this.workerHost !== host || this.state === 'disposed' || frame.sequence <= this.acceptedWorkerSequence) return;
    this.acceptedWorkerSequence = frame.sequence;
    for (const event of frame.audio) {
      if (event.position) sound.playAtPos(event.key, new Vector2(...event.position), this.read.playerShip.pos, event.volume, event.rate);
      else sound.play(event.key, event.volume, event.rate);
    }
    const report = frame.presentation.hud.battleResult;
    if (report && frame.presentation.hud.isBattleResultReady && report !== this.completedBattle) {
      this.completedBattle = report;
      for (const listener of this.battleListeners) listener();
    }
  }
  private failAuthority(host: LocalWorkerHost, error: unknown): void {
    if (this.workerHost !== host || this.state === 'disposed') return;
    this.state = 'paused'; this.visualClock.setPaused(true); this.scheduler.resync();
    this.failPresentation(this.presentationGeneration, 'authority-failed', error);
  }
  /** Manual, acknowledged-boundary recovery only; never replay an uncertain last tick. */
  public get canRecoverAuthority(): boolean {
    return this.state !== 'disposed' && this.presentationState.errorCode === 'authority-failed'
      && this.workerHost?.status === 'failed' && !this.workerHost.recoveryUnavailableReason && !!this.canvas;
  }
  public get supportsCheckpoints(): boolean { return this.workerEnabled && !!this.encounter && !this.restorePending; }
  public async captureCheckpoint(): Promise<CombatReplayCheckpoint> {
    const host = this.workerHost, epoch = this.controlGeneration;
    if (!this.supportsCheckpoints || !host || host.status !== 'ready') throw new Error('当前战斗不能保存中场点。');
    this.pause(); await this.barrier();
    if (this.workerHost !== host || this.controlGeneration !== epoch || this.restorePending || host.latest?.outcome)
      throw new Error('战斗已更换、结束或正在恢复，未保存中场点。');
    return host.checkpoint();
  }
  public async recoverAuthority(): Promise<import('./CombatCommands').CommandResult> {
    if (!this.canRecoverAuthority) return {accepted:false, reason:'当前战斗没有可恢复的已确认日志。'};
    try { return await this.restoreCheckpoint(this.workerHost!.checkpoint()); }
    catch (error) { return {accepted:false, reason:String(error)}; }
  }
  /** Used by same-page recovery and a validated, same-encounter durable checkpoint.
   * A candidate replays off to the side; it cannot replace the live host before validation. */
  public async restoreCheckpoint(source: CombatReplayCheckpoint, canAdopt: () => boolean = () => true): Promise<import('./CombatCommands').CommandResult> {
    if (!this.workerEnabled || this.restorePending || !this.canvas || this.state === 'disposed')
      return {accepted:false, reason:'战斗尚未就绪或已在恢复。'};
    let checkpoint: CombatReplayCheckpoint;
    try {
      checkpoint = copyReplayCheckpoint(source, LOCAL_COMBAT_PROTOCOL);
      if (checkpoint.config.expectedContent !== localCombatContentSignature()
        || checkpoint.config.seed !== this.workerConfigSeed || checkpoint.config.simulationPointLimit !== this.simulationPointLimit
        || JSON.stringify(checkpoint.config.encounter) !== JSON.stringify(this.encounter))
        throw new Error('中场点的内容或遭遇与当前战斗不符。');
    } catch (error) { return {accepted:false, reason:String(error)}; }
    const previous = this.workerHost, canvas = this.canvas, generation = this.controlGeneration;
    const previousPresentation = this.presentationState;
    const alreadyCompleted = !!this.completedBattle;
    this.restorePending = true;
    this.state = 'paused'; this.visualClock.setPaused(true); this.scheduler.resync();
    let candidate: LocalWorkerHost | undefined;
    try {
      if (previous?.status === 'ready') await this.barrier();
      if (generation !== this.controlGeneration) throw new Error('恢复期间战斗已更换。');
      candidate = new LocalWorkerHost(checkpoint.config, 90_000, checkpoint);
      this.stagedRestore = candidate;
      this.setPresentationState({status:'restoring', errorCode:'authority-failed', errorMessage:null});
      const frame = await candidate.ready;
      if (generation !== this.controlGeneration || this.stagedRestore !== candidate) throw new Error('恢复期间战斗已更换。');
      if (!canAdopt()) throw new Error('存档已变化，拒绝提交恢复结果。');
      this.stagedRestore = undefined;
      this.closeWorker();
      const adoptedGeneration = this.controlGeneration, host = candidate;
      this.workerHost = host;
      host.subscribeFailure(error => this.failAuthority(host, error));
      if (alreadyCompleted) this.completedBattle = frame.presentation.hud.battleResult;
      this.acceptWorkerFrame(host, frame);
      this.acceptWorkerFrame(host, await host.commands([{kind:'clear-input'}, {kind:'stop-firing'}]));
      if (this.workerHost !== host || this.controlGeneration !== adoptedGeneration) throw new Error('恢复期间战斗已更换。');
      await this.prepare(canvas);
      if (this.workerHost !== host || this.controlGeneration !== adoptedGeneration) throw new Error('恢复期间战斗已更换。');
      this.pause();
      return {accepted:true};
    } catch (error) {
      if (candidate && this.workerHost !== candidate) candidate.dispose();
      if (generation === this.controlGeneration) {
        this.stagedRestore = undefined; this.restorePending = false;
        // The rejected candidate never became authority; retain the original paused world.
        this.setPresentationState(previous?.status === 'failed'
          ? {status:'failed',errorCode:'authority-failed',errorMessage:String(error)} : previousPresentation);
      }
      return {accepted:false, reason:String(error)};
    }
  }

  /** Pause barrier includes already accepted commands/tick but never starts another. */
  public async barrier(): Promise<void> {
    const host = this.workerHost;
    if (!host) { this.finishPendingTick(); return; }
    try { this.acceptWorkerFrame(host, await host.barrier()); }
    catch (error) { this.failAuthority(host, error); throw error; }
  }

  private deploymentPending = false;
  private readonly tacticalMapProjector = new TacticalMapViewProjector();
  public readonly tacticalMapView: TacticalMapSource = { read: () => this.workerHost?.latest ? this.workerHost.tacticalMapView.read() : this.tacticalMapProjector.capture(this.authority.engine, this.authority.epoch, this.state !== 'disposed') };
  private readonly deploymentProjector = new DeploymentViewProjector();
  public readonly deploymentView: DeploymentViewSource = { read: () => this.workerHost?.latest ? this.workerHost.deploymentView.read() : this.deploymentProjector.capture(this.authority.engine, this.authority.epoch, this.state !== 'disposed') };
  private readonly tickHost = new CombatTickHost();
  /** Legacy edit adapter. Presentation never receives this authority object. */
  public get engine(): CombatEngine { if (this.workerHost) throw new Error('Worker authority has no main-thread CombatEngine; use session.read'); return this.authority.engine; }
  public set engine(engine: CombatEngine) {
    if (this.workerEnabled) throw new Error('Worker authority cannot be replaced with a presentation engine');
    this.discardPendingTick(); this.authority.beginEpoch(engine);
  }
  public getAuthorityStatus() {
    if (this.workerEnabled) return {epoch:this.workerHost?.epoch ?? this.controlGeneration, tick:this.workerHost?.latest?.tick ?? 0, pending:!!this.workerStep, backend:'worker-render'};
    return { epoch: this.authority.epoch, tick: this.authority.tick, pending: this.tickHost.hasPendingTick,
      backend: this.multicore.status.mode === 'serial' ? 'inline' : 'inline-with-ai-workers' };
  }
  public readonly scheduler = new FixedTimestepScheduler(60);
  public renderer: ICombatRenderer | null = null;
  public playerAI: CapitalShipAI;
  public readonly visualClock = new VisualClock();
  public readonly hudVisuals = new CombatHudVisuals();
  public readonly visualRandom: VisualRandom;
  public readonly performance = new PerformanceMetrics();
  public readonly cameraController = new CameraController();
  public readonly sessionId: string;
  public state: CombatSessionState = 'created';
  public readonly visualOptions = {
    layers: new Set(['background', 'nebula', 'asteroid', 'trail', 'hull', 'weapon', 'beam', 'shield', 'explosion']),
    damage: true,
    motion: true,
    cameraLocked: false
  };

  private readonly multicore = new CombatMulticore();
  private stepProfiler?: CombatStepProfiler;
  /** Opt-in diagnostics only. Toggling never flushes or changes a pending game tick. */
  public setStepProfiling(options: StepProfileOptions | null): void {
    const next = options ? new CombatStepProfiler(options) : undefined;
    this.stepProfiler?.reset();
    this.stepProfiler = next;
  }
  public getStepProfile() { return this.stepProfiler?.getReport() ?? null; }
  public resetStepProfile(): void { this.stepProfiler?.reset(); }
  private completedSimulationSteps = 0;
  private totalSimulationMs = 0;
  private lastSimulationMs = 0;
  public getMulticoreStatus() {
    if (this.workerHost?.latest) return {...this.workerHost.latest.ai, completedSteps:this.completedSimulationSteps, lastStepMs:this.lastSimulationMs, meanStepMs:this.completedSimulationSteps ? this.totalSimulationMs / this.completedSimulationSteps : 0};
    return { ...this.multicore.status, completedSteps: this.completedSimulationSteps,
      lastStepMs: this.lastSimulationMs,
      meanStepMs: this.completedSimulationSteps ? this.totalSimulationMs / this.completedSimulationSteps : 0 };
  }
  public setMulticoreEnabled(enabled: boolean): void {
    if (this.workerHost) throw new Error('AI configuration requires a new worker encounter');
    this.finishPendingTick(); this.multicore.enabled = enabled;
    if (!enabled) this.multicore.reset();
  }
  /** Resolve a previously sampled input once before a pause or direct roster edit. */
  private finishPendingTick(): void {
    if (this.tickHost.hasPendingTick) { this.multicore.reset(); this.tickHost.flush(); }
  }
  private discardPendingTick(): void {
    this.multicore.reset(); this.tickHost.discard();
  }

  private canvas: HTMLCanvasElement | null = null;
  private assetPreparation: Promise<void> = Promise.resolve();
  private assetsReady = false;
  private presentationState: CombatPresentationState = { status: 'idle', errorCode: null, errorMessage: null };
  private readonly presentationListeners = new Set<(state: CombatPresentationState) => void>();
  private presentationGeneration = 0;
  private preparationRevision = 0;
  private completedBattle: BattleResult | null = null;
  private readonly battleListeners = new Set<() => void>();

  public subscribeBattleCompleted(listener: () => void): () => void {
    this.battleListeners.add(listener);
    return () => this.battleListeners.delete(listener);
  }

  /** Install a new authoritative encounter; caller applies its roster before asset preparation. */
  public beginEncounter(playerShipId: string | ShipSpec, enemyShipId: string | ShipSpec, seed: number): void {
    if (this.state === 'disposed') throw new Error('Cannot reuse a disposed CombatSession');
    this.closeWorker();
    this.discardPendingTick();
    this.setSeed(seed);
    this.authority.beginEpoch();
    this.engine.switchPlayerShip(playerShipId, enemyShipId);
    this.playerAI = new CapitalShipAI(this.engine.playerShip, this.engine.enemyShip);
    this.completedBattle = null;
    this.scheduler.reset();
    this.visualClock.reset();
    this.hudVisuals.reset();
    this.cameraController.reset();
    this.renderer?.resetVisualState();
    this.state = 'running';
  }

  constructor(
    playerShipId = DEFAULT_PLAYER_HULL,
    enemyShipId = DEFAULT_ENEMY_HULL,
    seed = 0x51f15e,
    private readonly rendererFactory: CombatRendererFactory = (canvas, gl, lifecycle) => new WebGLCombatRenderer(canvas, gl, lifecycle)
  ) {
    this.workerConfigSeed = seed;
    this.sessionId = `combat-${nextSessionId++}`;
    this.visualRandom = new VisualRandom(seed);
    this.authority = new CombatAuthority(new CombatEngine(playerShipId, enemyShipId, seed));
    this.playerAI = new CapitalShipAI(this.engine.playerShip, this.engine.enemyShip);
  }

  public getPresentationState(): CombatPresentationState {
    return this.presentationState;
  }

  public isPresentationReady(): boolean {
    return this.presentationState.status === 'ready';
  }

  public subscribePresentation(listener: (state: CombatPresentationState) => void): () => void {
    this.presentationListeners.add(listener);
    return () => this.presentationListeners.delete(listener);
  }

  public prepare(canvas: HTMLCanvasElement): Promise<void> {
    if (this.state === 'disposed') return Promise.reject(new Error('Cannot prepare a disposed CombatSession'));

    const generation = ++this.presentationGeneration;
    const preparationRevision = ++this.preparationRevision;
    this.renderer?.dispose();
    this.renderer = null;
    this.canvas = canvas;
    this.assetsReady = false;
    this.scheduler.resync();
    this.setPresentationState({ status: 'loading', errorCode: null, errorMessage: null });
    if (this.state === 'created') this.state = 'prepared';

    this.assetPreparation = this.initializePresentation(canvas, generation, preparationRevision);
    return this.assetPreparation;
  }

  private async initializePresentation(canvas: HTMLCanvasElement, generation: number, preparationRevision: number): Promise<void> {
    let gl: WebGL2RenderingContext | null = null;
    try {
      gl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: true,
        powerPreference: 'high-performance',
        desynchronized: true
      });
    } catch (error) {
      this.failPresentation(generation, 'renderer-init-failed', error);
      throw error;
    }

    if (!gl) {
      const error = new Error('WebGL2 is required for combat rendering');
      this.failPresentation(generation, 'webgl2-unsupported', error);
      throw error;
    }

    let renderer: ICombatRenderer;
    try {
      renderer = this.rendererFactory(canvas, gl, this.createRendererLifecycle(generation));
    } catch (error) {
      this.failPresentation(generation, 'renderer-init-failed', error);
      throw error;
    }

    if (!this.isCurrentPresentationGeneration(generation)) {
      renderer.dispose();
      return;
    }
    this.renderer = renderer;

    await this.preparePresentationResources(renderer, generation, preparationRevision, 'resource-prepare-failed');
  }

  private createRendererLifecycle(generation: number): WebGLRendererLifecycle {
    return {
      onContextLost: () => {
        if (!this.isCurrentPresentationGeneration(generation)) return;
        this.preparationRevision++;
        this.assetsReady = false;
        this.setPresentationState({ status: 'context-lost', errorCode: null, errorMessage: null });
      },
      onContextRestoring: () => {
        if (!this.isCurrentPresentationGeneration(generation)) return;
        this.assetsReady = false;
        this.setPresentationState({ status: 'restoring', errorCode: null, errorMessage: null });
      },
      onContextRestored: () => {
        if (!this.isCurrentPresentationGeneration(generation)) return;
        const renderer = this.renderer;
        if (!renderer) return;
        this.assetsReady = false;
        this.setPresentationState({ status: 'restoring', errorCode: null, errorMessage: null });
        const preparationRevision = ++this.preparationRevision;
        const restoration = this.preparePresentationResources(renderer, generation, preparationRevision, 'context-restore-failed');
        this.assetPreparation = restoration;
        void restoration.catch(() => {});
      },
      onContextRestoreFailed: (error) => {
        this.failPresentation(generation, 'context-restore-failed', error);
      }
    };
  }

  private async preparePresentationResources(
    renderer: ICombatRenderer,
    generation: number,
    preparationRevision: number,
    failureCode: Extract<CombatPresentationErrorCode, 'resource-prepare-failed' | 'context-restore-failed'>
  ): Promise<void> {
    try {
      await assetManager.ensureManifestLoaded();
      if (!this.isCurrentPresentationPreparation(renderer, generation, preparationRevision)) return;
      await contentManifestManager.ensureLoaded();
      if (!this.isCurrentPresentationPreparation(renderer, generation, preparationRevision)) return;
      await this.ensureWorker();
      if (!this.isCurrentPresentationPreparation(renderer, generation, preparationRevision)) return;
      await renderer.prepareAssets(this.renderView);
    } catch (error) {
      if (!this.isCurrentPresentationPreparation(renderer, generation, preparationRevision)) return;
      if (this.workerHost?.status === 'failed') this.failAuthority(this.workerHost, error);
      else this.failPresentation(generation, failureCode, error);
      throw error;
    }

    if (!this.isCurrentPresentationPreparation(renderer, generation, preparationRevision)) return;
    this.assetsReady = true;
    this.scheduler.resync();
    this.setPresentationState({ status: 'ready', errorCode: null, errorMessage: null });
  }

  private isCurrentPresentationPreparation(
    renderer: ICombatRenderer,
    generation: number,
    preparationRevision: number
  ): boolean {
    return this.isCurrentPresentationGeneration(generation)
      && preparationRevision === this.preparationRevision
      && this.renderer === renderer;
  }

  private isCurrentPresentationGeneration(generation: number): boolean {
    return this.state !== 'disposed' && generation === this.presentationGeneration;
  }

  private failPresentation(generation: number, errorCode: CombatPresentationErrorCode, error: unknown): void {
    if (!this.isCurrentPresentationGeneration(generation)) return;
    this.preparationRevision++;
    this.assetsReady = false;
    this.renderer?.dispose();
    this.renderer = null;
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.setPresentationState({ status: 'failed', errorCode, errorMessage });
  }

  private setPresentationState(state: CombatPresentationState): void {
    this.presentationState = state;
    for (const listener of this.presentationListeners) listener(state);
  }

  public start(): void {
    if (this.state === 'disposed' || this.restorePending) return;
    this.visualClock.setPaused(false);
    this.state = 'running';
  }

  public prepareVisualAssets(): Promise<void> {
    return this.assetPreparation;
  }

  public refreshPresentationAssets(): void {
    if (this.loadingEncounter || !this.renderer || this.state === 'disposed' || ['context-lost', 'restoring'].includes(this.presentationState.status)) return;
    this.assetsReady = false;
    this.setPresentationState({ status: 'loading', errorCode: null, errorMessage: null });
    const preparation = this.preparePresentationResources(
      this.renderer, this.presentationGeneration, ++this.preparationRevision, 'resource-prepare-failed'
    );
    this.assetPreparation = preparation;
    void preparation.catch(() => {});
  }

  /** Detach a React presentation without destroying the retained simulation. */
  public detachPresentation(): void {
    if (this.state === 'disposed') return;
    this.presentationGeneration++;
    this.preparationRevision++;
    this.assetsReady = false;
    this.renderer?.dispose();
    this.renderer = null;
    this.canvas = null;
    this.pause();
    this.setPresentationState({ status: 'idle', errorCode: null, errorMessage: null });
  }

  public pause(): void {
    if (this.state === 'disposed') return;
    this.finishPendingTick();
    this.visualClock.setPaused(true);
    this.state = 'paused';
    if (this.workerHost) void this.barrier().catch(() => {});
  }

  private advanceSimulation(dt: number, aiBatch?: AIPhaseBatch, trace?: CombatStepSpan): void {
    this.authority.advance(dt, this.visualOptions.damage, aiBatch, trace);
    // Emit once at the authoritative tick boundary, not from a React polling interval.
    const report = this.engine.battleResult;
    if (report && this.engine.isBattleResultReady && report !== this.completedBattle) {
      this.completedBattle = report;
      for (const listener of this.battleListeners) listener();
    }
  }

  public step(dt = this.scheduler.fixedDeltaTime): void {
    if (this.workerEnabled) throw new Error('Inline editor operation is unavailable for worker authority');
    if (this.state === 'disposed') return;
    this.finishPendingTick();
    this.advanceSimulation(dt);
    this.visualClock.seek(this.visualClock.time + dt);
    this.updateVisualOnly(dt);
  }

  /** Compile catalogue data outside the tick, then recheck the world at commit. */
  public async dispatchDeployment(command: DeploymentCommand): Promise<import('./CombatCommands').CommandResult> {
    if (this.restorePending) return {accepted:false,reason:'战斗正在恢复。'};
    if (this.workerHost) {
      const host = this.workerHost;
      try { const frame = await host.commands([{kind:'deployment',command}]);
        if (this.workerHost !== host) return {accepted:false,reason:'战斗已更换。'};
        this.acceptWorkerFrame(host,frame); return frame.results[0];
      } catch (error) { this.failAuthority(host,error); return {accepted:false,reason:String(error)}; }
    }
    if (this.workerEnabled) return {accepted:false,reason:'战斗权威正在启动。'};
    if (this.state === 'disposed' || this.deploymentPending) return { accepted: false, reason: '部署请求正在处理或战斗已关闭。' };
    const epoch = this.authority.epoch, engine = this.engine, revision = contentRegistry.revision;
    this.deploymentPending = true;
    try {
      const prepared = await prepareDeployment(copyDeploymentCommand(command));
      if ((this.state as CombatSessionState) === 'disposed' || this.authority.epoch !== epoch || this.engine !== engine || contentRegistry.revision !== revision)
        return { accepted: false, reason: '准备部署时战斗或内容已改变，请重新选择。' };
      this.finishPendingTick();
      if ((this.state as CombatSessionState) === 'disposed' || this.authority.epoch !== epoch || this.engine !== engine || contentRegistry.revision !== revision)
        return { accepted: false, reason: '战斗或内容已改变，未部署舰船。' };
      // The display refreshes resources after consuming the ACK, so a loading
      // transition cannot unmount its pending deployment dialog before onDeployed.
      return applyPreparedDeployment(engine, prepared);
    } catch (error) { return { accepted: false, reason: error instanceof Error ? error.message : String(error) }; }
    finally { this.deploymentPending = false; }
  }

  /** UI edge writes enter through a serial boundary, never into an outstanding prediction. */
  public dispatchControl(command: CombatControlCommand): import('./CombatCommands').CommandResult | Promise<import('./CombatCommands').CommandResult> {
    if (this.restorePending) return {accepted:false,reason:'战斗正在恢复。'};
    if (this.workerHost) {
      const host = this.workerHost, release = command.kind === 'clear-input' || command.kind === 'stop-firing';
      if (release) {
        const previous = this.pendingReleases.get(command.kind);
        if (previous?.serial === this.inputSerial) return previous.promise;
        if (host.status === 'ready' && host.latest && !host.pendingTransactions) {
          const ship = this.read.playerShip;
          if (!ship.isFiringMain && !this.read.weaponShip.isFiringMain && (command.kind === 'stop-firing' || (ship.throttle === 0 && !ship.brakeInput && ship.strafeInput === 0 && ship.turnInput === 0))) return {accepted:true};
        }
      } else this.inputSerial++;
      const pilot = command.kind === 'pilot', previousPilot = this.pilotIntent, request = pilot ? ++this.pilotRequest : this.pilotRequest;
      if (command.kind === 'pilot') this.pilotIntent = command.autopilot;
      const promise = host.commands([command]).then(frame => {
        if (this.workerHost !== host) return {accepted:false,reason:'战斗已更换。'};
        if (pilot && request === this.pilotRequest && !frame.results[0].accepted) this.pilotIntent = previousPilot;
        this.acceptWorkerFrame(host,frame); return frame.results[0];
      }, error => {
        if (pilot && this.workerHost === host && request === this.pilotRequest) this.pilotIntent = previousPilot;
        this.failAuthority(host,error); return {accepted:false,reason:String(error)};
      }).finally(() => { if (this.pendingReleases.get(command.kind)?.promise === promise) this.pendingReleases.delete(command.kind); });
      if (release) this.pendingReleases.set(command.kind,{serial:this.inputSerial,promise});
      return promise;
    }
    if (this.workerEnabled) return {accepted:false,reason:'战斗权威正在启动。'};
    if (this.state === 'disposed') return { accepted: false, reason: 'Combat session disposed' };
    // Idempotent pointer/focus releases need not cancel an expensive prediction pool.
    const ship = this.engine.playerShip;
    if (command.kind === 'stop-firing' && !ship.isFiringMain) return { accepted: true };
    if (command.kind === 'clear-input' && !ship.isFiringMain && ship.throttle === 0 && !ship.brakeInput && ship.strafeInput === 0 && ship.turnInput === 0) return { accepted: true };
    const epoch = this.authority.epoch;
    this.finishPendingTick();
    if (this.authority.epoch !== epoch || (this.state as CombatSessionState) === 'disposed') return { accepted: false, reason: 'Combat encounter changed or disposed' };
    return applyCombatControlCommand(this.engine, command);
  }

  public fixedUpdateControlled(dt: number, sample: CombatControlSample): void | false | Promise<void | false> {
    if (this.workerEnabled) {
      if (dt !== this.scheduler.fixedDeltaTime) throw new Error('Worker combat requires the fixed 60 Hz timestep');
      if (this.state !== 'running' || !this.isPresentationReady() || !this.workerHost) return false;
      if (this.workerStep) return this.workerStep;
      const host = this.workerHost; this.inputSerial++;
      const operation = host.step(copyControlSample({...sample,autopilot:this.pilotIntent ?? sample.autopilot})).then(frame => {
        if (this.workerHost !== host || this.state === 'disposed') return false as const;
        this.acceptWorkerFrame(host, frame);
        this.lastSimulationMs = frame.simulationMs; this.totalSimulationMs += frame.simulationMs; this.completedSimulationSteps++;
        this.performance.recordTiming('simulationMs', frame.simulationMs);
        this.visualClock.seek(this.visualClock.time + dt); this.updateVisualOnly(dt);
      }, error => { this.failAuthority(host,error); return false as const; }).finally(() => { if (this.workerStep === operation) this.workerStep = undefined; });
      this.workerStep = operation; return operation;
    }
    if (this.tickHost.pendingPromise) return this.tickHost.pendingPromise;
    const accepted = copyControlSample(sample);
    return this.fixedUpdateScheduled(dt, () => applyCombatControlSample(this.engine, this.playerAI, dt, accepted));
  }

  /** Same full tick as fixedUpdate, with an optional pre-tick ownership prediction. */
  public fixedUpdateScheduled(dt: number, beforeTick: () => void = () => {}): void | false | Promise<void | false> {
    if (this.workerEnabled) throw new Error('Inline editor operation is unavailable for worker authority');
    if (this.state !== 'running') return false;
    if (this.tickHost.pendingPromise) return this.tickHost.pendingPromise;
    const start = performance.now();
    const trace = this.stepProfiler?.begin(dt);
    const complete = (batch?: AIPhaseBatch) => {
      trace?.mark('sessionSetup');
      try {
        try { this.advanceSimulation(dt, batch, trace); }
        finally { trace?.mark('finalize'); batch?.finish(); }
      } catch (error) { trace?.finish('error'); throw error; }
      // Includes player controls/AI, eligibility, packing, wait, validation, merge and fallback.
      this.lastSimulationMs = performance.now() - start;
      this.totalSimulationMs += this.lastSimulationMs; this.completedSimulationSteps++;
      this.performance.recordTiming('simulationMs', this.lastSimulationMs);
      if (trace) {
        const status = this.multicore.status;
        trace.finish('completed', {
          reason: !this.visualOptions.damage ? 'damage-disabled' : !this.multicore.enabled ? 'disabled' : status.reason,
          commits: batch ? status.metrics?.commits : 0, fallbacks: batch ? status.metrics?.fallbacks : 0
        });
      }
      this.multicore.record(this.lastSimulationMs, !!batch);
      this.visualClock.advance(dt); this.updateVisualOnly(dt);
    };
    return this.tickHost.run({
      prepare: () => {
        try {
          beforeTick();
          trace?.mark('dispatch');
          const prediction = this.visualOptions.damage ? this.multicore.prepare(this.engine, this.playerAI, dt) : null;
          if (trace && prediction) { trace.predictionRequested = true; trace.mark('wait'); }
          return prediction;
        } catch (error) { trace?.finish('error'); throw error; }
      },
      commit: complete,
      discard: () => trace?.finish('discarded'),
      failed: () => this.pause(),
    });
  }

  public fixedUpdate(dt: number): void {
    if (this.workerEnabled) throw new Error('Inline editor operation is unavailable for worker authority');
    if (this.state === 'paused' || this.state === 'disposed') return;
    this.finishPendingTick();
    const simStart = performance.now();
    this.advanceSimulation(dt);
    this.performance.recordTiming('simulationMs', performance.now() - simStart);
    this.visualClock.advance(dt);
    this.updateVisualOnly(dt);
  }

  /** Advances renderer-owned visual state without mutating combat simulation. */
  public updateVisualOnly(dt: number): void {
    if (this.state === 'disposed') return;
    const visualStart = performance.now();
    this.hudVisuals.update(this.read.playerShip, Math.max(0, dt));
    this.renderer?.updateVisual(this.renderView, Math.max(0, dt), {
      visualTime: this.visualClock.time,
      random: this.visualRandom,
      layers: this.visualOptions.layers,
      damageEnabled: this.visualOptions.damage
    });
    this.performance.recordTiming('visualUpdateMs', performance.now() - visualStart);
  }

  public render(alpha: number, cameraPos: Vector2, zoom: number): void {
    if (!this.renderer || !this.assetsReady || !this.isPresentationReady() || this.state === 'disposed') return;
    const prepStart = performance.now();
    const frame = {
      visualTime: this.visualClock.time,
      random: this.visualRandom,
      layers: this.visualOptions.layers,
      damageEnabled: this.visualOptions.damage
    };
    this.performance.recordTiming('renderPreparationMs', performance.now() - prepStart);
    const submitStart = performance.now();
    const rendered = this.renderer.render(this.renderView, alpha, cameraPos, zoom, { ...frame, jumpTarget: this.jumpTargeting.preview });
    if (!rendered) return;
    this.performance.recordTiming('drawSubmitMs', performance.now() - submitStart);
    const resourceStats = this.renderer.getResourceStats();
    if (this.workerHost?.latest) {
      const latest = this.workerHost.latest, collision = latest.telemetry.collision, fresh = this.telemetrySequence !== latest.sequence;
      this.telemetrySequence = latest.sequence;
      this.performance.finalizeFrame({gpuTimeMs:resourceStats.gpuTimeMs,gpuTimerAvailable:resourceStats.gpuTimerAvailable,
        projectileCount:this.renderView.projectiles.length, particleCount:this.renderView.particles.length, trailStripCount:latest.telemetry.trails.stripCount,
        trailPointCount:latest.telemetry.trails.pointCount,textureCount:resourceStats.residentTextures,pendingTextureUploads:resourceStats.pendingUploads,textureUploads:resourceStats.uploads,
        textureInvalidations:resourceStats.invalidations,resourceRecreations:resourceStats.resourceRecreations,drawCalls:resourceStats.drawCalls,memoryBytes:null,
        collisionKernelMs:fresh ? collision.kernelMs : 0, collisionTypeScriptBatches:fresh ? collision.typescriptBatches : 0,
        collisionWasmBatches:fresh ? collision.wasmBatches : 0,collisionWasmFallbacks:fresh ? collision.wasmFallbacks : 0,
        collisionProjectiles:fresh ? collision.projectileCount : 0,collisionCandidatePairs:fresh ? collision.candidatePairs : 0,
        collisionMaxCandidatesPerProjectile:fresh ? collision.maxCandidatesPerProjectile : 0,collisionBackendState:collision.backendState});
      return;
    }
    const collisionTelemetry = this.engine.weaponSystem.collisionHandler.runtimeCollisionKernel.consumeTelemetry();
    const memory = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory;
    const particleCount = this.engine.particles.length
      + this.engine.contrails.length
      + this.engine.debris.length
      + this.engine.explosions.length
      + this.engine.hitGlows.length
      + this.engine.empArcs.length
      + this.engine.muzzleFlashes.length
      + this.engine.muzzleParticles.length
      + this.engine.shieldRipples.length
      + this.engine.hulkFragments.length;
    const trailStats = this.engine.contrailEngine.getStats();
    this.performance.finalizeFrame({
      gpuTimeMs: resourceStats.gpuTimeMs,
      gpuTimerAvailable: resourceStats.gpuTimerAvailable,
      projectileCount: this.engine.projectiles.length,
      particleCount,
      trailStripCount: trailStats.stripCount,
      trailPointCount: trailStats.pointCount,
      textureCount: resourceStats.residentTextures,
      pendingTextureUploads: resourceStats.pendingUploads,
      textureUploads: resourceStats.uploads,
      textureInvalidations: resourceStats.invalidations,
      resourceRecreations: resourceStats.resourceRecreations,
      drawCalls: resourceStats.drawCalls,
      memoryBytes: typeof memory?.usedJSHeapSize === 'number' ? memory.usedJSHeapSize : null,
      collisionKernelMs: collisionTelemetry.kernelMs,
      collisionTypeScriptBatches: collisionTelemetry.typescriptBatches,
      collisionWasmBatches: collisionTelemetry.wasmBatches,
      collisionWasmFallbacks: collisionTelemetry.wasmFallbacks,
      collisionProjectiles: collisionTelemetry.projectileCount,
      collisionCandidatePairs: collisionTelemetry.candidatePairs,
      collisionMaxCandidatesPerProjectile: collisionTelemetry.maxCandidatesPerProjectile,
      collisionBackendState: collisionTelemetry.backendState
    });
  }

  public resetPerformanceWindow(): void {
    this.performance.resetWindow();
  }

  public getPerformanceReport(): PerformanceReport {
    return this.performance.getReport();
  }

  public restart(shipId = this.read.playerShip.spec.id): void {
    if (this.state === 'disposed') return;
    this.closeWorker(); this.encounter = undefined; this.completedBattle = null;
    this.discardPendingTick();
    this.authority.beginEpoch();
    this.engine.resetBattle(shipId);
    this.playerAI = new CapitalShipAI(this.engine.playerShip, this.engine.enemyShip);
    this.scheduler.reset();
    this.visualClock.reset();
    this.hudVisuals.reset();
    this.cameraController.reset();
    this.renderer?.resetVisualState();
    this.state = 'running';
    this.refreshPresentationAssets();
  }

  public addShip(specId: string, isPlayer: boolean, pos: Vector2, facingRad = 0) {
    this.finishPendingTick();
    const ship = this.engine.addShip(specId, isPlayer, pos, facingRad);
    this.refreshPresentationAssets();
    return ship;
  }

  public switchPlayerShip(shipId: string): void {
    if (this.state === 'disposed') return;
    this.closeWorker(); this.encounter = undefined; this.simulationPointLimit = undefined; this.completedBattle = null;
    this.discardPendingTick();
    this.authority.beginEpoch();
    this.engine.switchPlayerShip(shipId);
    this.playerAI = new CapitalShipAI(this.engine.playerShip, this.engine.enemyShip);
    this.scheduler.reset();
    this.visualClock.reset();
    this.hudVisuals.reset();
    this.cameraController.reset();
    this.renderer?.resetVisualState();
    this.state = 'running';
    this.refreshPresentationAssets();
  }

  public setSeed(seed: number): void {
    this.finishPendingTick();
    this.workerConfigSeed = seed;
    this.visualRandom.reseed(seed);
    this.engine.setSeed(seed);
  }

  public setCameraLocked(enabled: boolean): void {
    this.visualOptions.cameraLocked = enabled;
    if (enabled) this.cameraController.reset();
  }

  public setDamageEnabled(enabled: boolean): void {
    if (this.workerEnabled) throw new Error('Inline editor operation is unavailable for worker authority');
    this.finishPendingTick();
    this.visualOptions.damage = enabled;
  }

  public setMotionEnabled(enabled: boolean): void {
    this.visualOptions.motion = enabled;
    if (enabled) this.start();
    else this.pause();
  }

  public setLayerEnabled(layer: string, enabled: boolean): void {
    if (enabled) this.visualOptions.layers.add(layer);
    else this.visualOptions.layers.delete(layer);
  }

  public dispose(): void {
    if (this.state === 'disposed') return;
    this.closeWorker();
    this.discardPendingTick();
    this.tickHost.dispose();
    this.presentationGeneration++;
    this.preparationRevision++;
    this.assetsReady = false;
    this.renderer?.dispose();
    this.renderer = null;
    this.canvas = null;
    this.state = 'disposed';
    this.setPresentationState({ status: 'disposed', errorCode: null, errorMessage: null });
    this.presentationListeners.clear();
    this.battleListeners.clear();
  }
}
