import { CapitalShipAI } from '../ai/CapitalShipAI';
import { CombatRenderer } from '../render/CombatRenderer';
import type { ICombatRenderer } from '../render/ICombatRenderer';
import { WebGLCombatRenderer } from '../render/webgl/WebGLCombatRenderer';
import { CombatEngine } from '../simulation/CombatEngine';
import { FixedTimestepScheduler } from '../simulation/FixedTimestepScheduler';
import { Vector2 } from '../math/Vector2';
import { VisualClock } from './VisualClock';
import { VisualRandom } from './VisualRandom';
import { PerformanceMetrics } from './PerformanceMetrics';

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
  public readonly sessionId: string;
  public state: CombatSessionState = 'created';
  public readonly visualOptions = {
    layers: new Set(['background', 'nebula', 'trail', 'hull', 'weapon', 'beam', 'shield', 'explosion']),
    damage: true,
    motion: true,
    cameraLocked: false
  };

  private canvas: HTMLCanvasElement | null = null;

  constructor(playerShipId = 'onslaught', enemyShipId = 'paragon', seed = 0x51f15e) {
    this.sessionId = `combat-${nextSessionId++}`;
    this.visualRandom = new VisualRandom(seed);
    this.engine = new CombatEngine(playerShipId, enemyShipId);
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
    this.scheduler.reset();
    this.state = 'prepared';
  }

  public start(): void {
    if (this.state === 'disposed') return;
    this.visualClock.setPaused(false);
    this.state = 'running';
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
    const visualStart = performance.now();
    this.visualClock.advance(dt);
    this.performance.recordTiming('visualUpdateMs', performance.now() - visualStart);
  }

  public render(alpha: number, cameraPos: Vector2, zoom: number): void {
    if (!this.renderer || this.state === 'disposed') return;
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
    this.performance.snapshot.projectileCount = this.engine.projectiles.length;
    this.performance.snapshot.particleCount = this.engine.particles.length + this.engine.contrails.length + this.engine.debris.length;
    const resourceStats = (this.renderer as any).getResourceStats?.();
    if (resourceStats) {
      this.performance.snapshot.textureCount = resourceStats.residentTextures ?? 0;
      this.performance.snapshot.resourceRecreations = resourceStats.resourceRecreations ?? 0;
      this.performance.snapshot.drawCalls = resourceStats.drawCalls ?? 0;
      this.performance.snapshot.gpuTimerAvailable = resourceStats.gpuTimerAvailable ?? false;
      this.performance.snapshot.gpuTimeMs = resourceStats.gpuTimeMs ?? null;
    }
    const memory = (performance as any).memory;
    this.performance.snapshot.memoryBytes = typeof memory?.usedJSHeapSize === 'number' ? memory.usedJSHeapSize : null;
  }

  public restart(shipId = this.engine.playerShip.spec.id): void {
    this.engine.resetBattle(shipId);
    this.playerAI = new CapitalShipAI(this.engine.playerShip, this.engine.enemyShip);
    this.scheduler.reset();
    this.visualClock.reset();
    if (this.state !== 'disposed') this.state = 'running';
  }

  public switchPlayerShip(shipId: string): void {
    this.engine.resetBattle(shipId);
    this.playerAI = new CapitalShipAI(this.engine.playerShip, this.engine.enemyShip);
    this.scheduler.reset();
    this.visualClock.reset();
    if (this.state !== 'disposed') this.state = 'running';
  }

  public setSeed(seed: number): void { this.visualRandom.reseed(seed); }

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
    this.renderer?.dispose();
    this.renderer = null;
    this.canvas = null;
    this.state = 'disposed';
  }
}
