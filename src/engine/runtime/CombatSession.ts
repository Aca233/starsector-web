import { CapitalShipAI } from '../ai/CapitalShipAI';
import { CombatRenderer } from '../render/CombatRenderer';
import type { ICombatRenderer } from '../render/ICombatRenderer';
import { WebGLCombatRenderer } from '../render/webgl/WebGLCombatRenderer';
import { CombatEngine } from '../simulation/CombatEngine';
import { FixedTimestepScheduler } from '../simulation/FixedTimestepScheduler';
import { Vector2 } from '../math/Vector2';
import { VisualClock } from './VisualClock';
import { VisualRandom } from './VisualRandom';
import { PerformanceMetrics, type PerformanceReport } from './PerformanceMetrics';
import { CameraController } from './CameraController';
import { assetManager } from '../assets/AssetResolver';
import { contentManifestManager } from '../content/ContentManifest';

export type CombatSessionState = 'created' | 'prepared' | 'running' | 'paused' | 'disposed';

let nextSessionId = 1;

/** Owns the mutable lifetime of one combat run. React only keeps this object. */
export class CombatSession {
  public engine: CombatEngine;
  public readonly scheduler = new FixedTimestepScheduler(60);
  public renderer: ICombatRenderer | null = null;
  public playerAI: CapitalShipAI;
  public readonly visualClock = new VisualClock();
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

  private canvas: HTMLCanvasElement | null = null;
  private assetPreparation: Promise<void> = Promise.resolve();
  private assetsReady = false;

  constructor(playerShipId = 'onslaught', enemyShipId = 'paragon', seed = 0x51f15e) {
    this.sessionId = `combat-${nextSessionId++}`;
    this.visualRandom = new VisualRandom(seed);
    this.engine = new CombatEngine(playerShipId, enemyShipId, seed);
    this.playerAI = new CapitalShipAI(this.engine.playerShip, this.engine.enemyShip);
  }

  public prepare(canvas: HTMLCanvasElement): void {
    if (this.state === 'disposed') throw new Error('Cannot prepare a disposed CombatSession');
    this.renderer?.dispose();
    this.canvas = canvas;
    try {
      const gl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: true,
        powerPreference: 'high-performance',
        desynchronized: true
      });
      this.renderer = gl ? new WebGLCombatRenderer(canvas, gl) : new CombatRenderer(canvas);
    } catch (error) {
      console.warn('[Starsector] WebGL2 unavailable, using Canvas2D:', error);
      this.renderer = new CombatRenderer(canvas);
    }
    this.assetsReady = false;
    this.assetPreparation = assetManager.ensureManifestLoaded().then(async () => {
      await contentManifestManager.ensureLoaded();
      await this.renderer?.prepareAssets();
      this.assetsReady = true;
    });
    this.scheduler.reset();
    this.state = 'prepared';
  }

  public start(): void {
    if (this.state === 'disposed') return;
    this.visualClock.setPaused(false);
    this.state = 'running';
  }

  public prepareVisualAssets(): Promise<void> {
    return this.assetPreparation;
  }

  public pause(): void {
    if (this.state === 'disposed') return;
    this.visualClock.setPaused(true);
    this.state = 'paused';
  }

  public step(dt = this.scheduler.fixedDeltaTime): void {
    if (this.state === 'disposed') return;
    this.engine.fixedUpdate(dt);
    this.visualClock.seek(this.visualClock.time + dt);
    this.updateVisualOnly(dt);
  }

  public fixedUpdate(dt: number): void {
    if (this.state === 'paused' || this.state === 'disposed') return;
    const protectedShips = this.visualOptions.damage
      ? null
      : [this.engine.playerShip, this.engine.enemyShip, ...this.engine.fighters, ...this.engine.bombers].map((ship) => ({
          ship,
          hullHp: ship.hullHp,
          isDead: ship.isDead,
          armor: ship.armor.cells.slice(),
          softFlux: ship.flux.softFlux,
          hardFlux: ship.flux.hardFlux,
          overloaded: ship.flux.isOverloaded,
          overloadTimer: ship.flux.overloadTimer
        }));
    const simStart = performance.now();
    this.engine.fixedUpdate(dt);
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
    this.performance.recordTiming('simulationMs', performance.now() - simStart);
    this.visualClock.advance(dt);
    this.updateVisualOnly(dt);
  }

  /** Advances renderer-owned visual state without mutating combat simulation. */
  public updateVisualOnly(dt: number): void {
    if (this.state === 'disposed') return;
    const visualStart = performance.now();
    this.renderer?.updateVisual(this.engine, Math.max(0, dt), {
      visualTime: this.visualClock.time,
      random: this.visualRandom,
      layers: this.visualOptions.layers,
      damageEnabled: this.visualOptions.damage
    });
    this.performance.recordTiming('visualUpdateMs', performance.now() - visualStart);
  }

  public render(alpha: number, cameraPos: Vector2, zoom: number): void {
    if (!this.renderer || !this.assetsReady || this.state === 'disposed') return;
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
      + this.engine.empArcs.length
      + this.engine.muzzleFlashes.length
      + this.engine.muzzleParticles.length
      + this.engine.shieldRipples.length
      + this.engine.hulkFragments.length;
    this.performance.finalizeFrame({
      gpuTimeMs: resourceStats.gpuTimeMs,
      gpuTimerAvailable: resourceStats.gpuTimerAvailable,
      projectileCount: this.engine.projectiles.length,
      particleCount,
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
    this.engine.resetBattle(shipId);
    this.playerAI = new CapitalShipAI(this.engine.playerShip, this.engine.enemyShip);
    this.scheduler.reset();
    this.visualClock.reset();
    this.renderer?.resetVisualState();
    if (this.state !== 'disposed') this.state = 'running';
  }

  public switchPlayerShip(shipId: string): void {
    this.engine.resetBattle(shipId);
    this.playerAI = new CapitalShipAI(this.engine.playerShip, this.engine.enemyShip);
    this.scheduler.reset();
    this.visualClock.reset();
    this.renderer?.resetVisualState();
    if (this.state !== 'disposed') this.state = 'running';
  }

  public setSeed(seed: number): void {
    this.visualRandom.reseed(seed);
    this.engine.setSeed(seed);
  }

  public setCameraLocked(enabled: boolean): void {
    this.visualOptions.cameraLocked = enabled;
  }

  public setDamageEnabled(enabled: boolean): void {
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
    this.assetsReady = false;
    this.renderer?.dispose();
    this.renderer = null;
    this.canvas = null;
    this.state = 'disposed';
  }
}
