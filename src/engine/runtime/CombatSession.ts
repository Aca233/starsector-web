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
  public engine: CombatEngine;
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
  private pendingTick: { promise: Promise<void | false>; finish: (batch?: AIPhaseBatch) => void; discard: () => void } | null = null;
  private completedSimulationSteps = 0;
  private totalSimulationMs = 0;
  private lastSimulationMs = 0;
  public getMulticoreStatus() {
    return { ...this.multicore.status, completedSteps: this.completedSimulationSteps,
      lastStepMs: this.lastSimulationMs,
      meanStepMs: this.completedSimulationSteps ? this.totalSimulationMs / this.completedSimulationSteps : 0 };
  }
  public setMulticoreEnabled(enabled: boolean): void {
    this.finishPendingTick(); this.multicore.enabled = enabled;
    if (!enabled) this.multicore.reset();
  }
  /** Resolve a previously sampled input once before a pause or direct roster edit. */
  private finishPendingTick(): void {
    const pending = this.pendingTick;
    if (pending) { this.multicore.reset(); pending.finish(); }
  }
  private discardPendingTick(): void {
    this.multicore.reset(); this.pendingTick?.discard();
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
    this.discardPendingTick();
    this.setSeed(seed);
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
    this.sessionId = `combat-${nextSessionId++}`;
    this.visualRandom = new VisualRandom(seed);
    this.engine = new CombatEngine(playerShipId, enemyShipId, seed);
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
      await renderer.prepareAssets(this.engine);
    } catch (error) {
      if (!this.isCurrentPresentationPreparation(renderer, generation, preparationRevision)) return;
      this.failPresentation(generation, failureCode, error);
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
    if (this.state === 'disposed') return;
    this.visualClock.setPaused(false);
    this.state = 'running';
  }

  public prepareVisualAssets(): Promise<void> {
    return this.assetPreparation;
  }

  public refreshPresentationAssets(): void {
    if (!this.renderer || this.state === 'disposed' || ['context-lost', 'restoring'].includes(this.presentationState.status)) return;
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
  }

  private advanceSimulation(dt: number, aiBatch?: AIPhaseBatch): void {
    const damageEnabled = this.visualOptions.damage;
    const protectedShips = damageEnabled
      ? null
      : this.engine.ships.map((ship) => ({
          ship,
          hullHp: ship.hullHp,
          hullDamageSuppressed: ship.hullDamageSuppressed,
          isDead: ship.isDead,
          armor: ship.armor.cells.slice(),
          softFlux: ship.flux.softFlux,
          hardFlux: ship.flux.hardFlux,
          overloaded: ship.flux.isOverloaded,
          overloadTimer: ship.flux.overloadTimer
        }));
    const protectedStats = damageEnabled ? null : {
      player: { ...this.engine.statsTracker.playerStats },
      enemy: { ...this.engine.statsTracker.enemyStats },
      battleResult: this.engine.battleResult
    };

    // Suppress damage callbacks while the lab temporarily applies/restores armor.
    // Existing heat still advances; ignored hits create neither decals nor visual RNG draws.
    if (protectedShips) for (const { ship } of protectedShips) { ship.damageDecals.suppressed = true; ship.hullDamageSuppressed = true; }
    try {
      this.engine.fixedUpdate(dt, { suppressDestructionSideEffects: !damageEnabled, aiBatch });
    } finally {
      if (protectedShips) for (const { ship, hullDamageSuppressed } of protectedShips) { ship.damageDecals.suppressed = false; ship.hullDamageSuppressed = hullDamageSuppressed; }
    }

    if (protectedShips) {
      for (const snapshot of protectedShips) {
        snapshot.ship.hullHp = snapshot.hullHp;
        snapshot.ship.isDead = snapshot.isDead;
        snapshot.ship.armor.cells.set(snapshot.armor);
        snapshot.ship.armor.dirtyVersion++;
        snapshot.ship.flux.softFlux = snapshot.softFlux;
        snapshot.ship.flux.hardFlux = snapshot.hardFlux;
        snapshot.ship.flux.isOverloaded = snapshot.overloaded;
        snapshot.ship.flux.overloadTimer = snapshot.overloadTimer;
      }
    }
    if (protectedStats) {
      this.engine.statsTracker.playerStats = protectedStats.player;
      this.engine.statsTracker.enemyStats = protectedStats.enemy;
      this.engine.battleResult = protectedStats.battleResult;
    }
    // Emit once at the authoritative tick boundary, not from a React polling interval.
    const report = this.engine.battleResult;
    if (report && this.engine.isBattleResultReady && report !== this.completedBattle) {
      this.completedBattle = report;
      for (const listener of this.battleListeners) listener();
    }
  }

  public step(dt = this.scheduler.fixedDeltaTime): void {
    if (this.state === 'disposed') return;
    this.finishPendingTick();
    this.advanceSimulation(dt);
    this.visualClock.seek(this.visualClock.time + dt);
    this.updateVisualOnly(dt);
  }

  /** Same full tick as fixedUpdate, with an optional pre-tick ownership prediction. */
  public fixedUpdateScheduled(dt: number, beforeTick: () => void = () => {}): void | false | Promise<void | false> {
    if (this.state !== 'running') return false;
    if (this.pendingTick) return this.pendingTick.promise;
    const start = performance.now(), engine = this.engine;
    beforeTick();
    const prediction = this.visualOptions.damage ? this.multicore.prepare(this.engine, this.playerAI, dt) : null;
    const complete = (batch?: AIPhaseBatch) => {
      try { this.advanceSimulation(dt, batch); }
      finally { batch?.finish(); }
      // Includes player controls/AI, eligibility, packing, wait, validation, merge and fallback.
      this.lastSimulationMs = performance.now() - start;
      this.totalSimulationMs += this.lastSimulationMs; this.completedSimulationSteps++;
      this.performance.recordTiming('simulationMs', this.lastSimulationMs);
      this.visualClock.advance(dt); this.updateVisualOnly(dt);
    };
    if (!prediction) { complete(); return; }
    let resolve!: (result: void | false) => void, reject!: (error: unknown) => void;
    const promise = new Promise<void | false>((ok, fail) => { resolve = ok; reject = fail; });
    let done = false;
    const finish = (batch?: AIPhaseBatch) => {
      if (done) { batch?.finish(); return; }
      done = true; this.pendingTick = null;
      if (this.engine !== engine) { batch?.finish(); resolve(false); return; }
      try { complete(batch); resolve(); }
      catch (error) { this.pause(); reject(error); }
    };
    this.pendingTick = { promise, finish, discard: () => {
      if (!done) { done = true; this.pendingTick = null; resolve(false); }
    } };
    void prediction.then(finish, () => finish());
    return promise;
  }

  public fixedUpdate(dt: number): void {
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
    this.hudVisuals.update(this.engine.playerShip, Math.max(0, dt));
    this.renderer?.updateVisual(this.engine, Math.max(0, dt), {
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
    this.renderer.render(this.engine, alpha, cameraPos, zoom, {
      ...frame
    });
    this.performance.recordTiming('drawSubmitMs', performance.now() - submitStart);
    const resourceStats = this.renderer.getResourceStats();
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

  public restart(shipId = this.engine.playerShip.spec.id): void {
    if (this.state === 'disposed') return;
    this.discardPendingTick();
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
    this.discardPendingTick();
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
    this.visualRandom.reseed(seed);
    this.engine.setSeed(seed);
  }

  public setCameraLocked(enabled: boolean): void {
    this.visualOptions.cameraLocked = enabled;
    if (enabled) this.cameraController.reset();
  }

  public setDamageEnabled(enabled: boolean): void {
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
    this.discardPendingTick();
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
