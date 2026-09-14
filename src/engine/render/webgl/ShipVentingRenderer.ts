import { visualNowMs } from '../RenderDeterminism';
import type { VisualRandom } from '../../runtime/VisualRandom';
import { Vector2 } from '../../math/Vector2';
import { Ship } from '../../simulation/Ship';
import { SpriteBatcher } from './SpriteBatcher';
import { RibbonBatcher } from './RibbonBatcher';
import { WebGLTextureManager } from './WebGLTextureManager';
import { getShipVisualProfile } from '../../visual/VisualProfiles';
import { sampleShipHullSurface } from '../../simulation/collision/HullGeometry';

interface VentParticle {
  pos: Vector2;
  vel: Vector2;
  life: number;
  maxLife: number;
  size: number;
  maxSize: number;
  rotation: number;
  spin: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

interface VentEmitter {
  perimeterT: number;
  interval: number;
  timer: number;
  spawnIndex: number;
}

export interface VentVisualState {
  particleCount: number;
  emitterCount: number;
  faderIn: number;
  startPulse: number;
}

/**
 * 1:1 原版幅能排散渲染引擎 (ShipVentingRenderer)
 * 严格对齐 Starsector 0.98a 官方源码:
 * 1. com/fs/starfarer/renderers/oOoOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO_cfr_46.java (ventingAnimation)
 * 2. com/fs/starfarer/renderers/float.java (_float radial halo)
 * 3. data/config/hull_styles.json:
 *    - fluxVentTextureSheet: graphics/fx/nebula_colorless.png (4x4 粒子图集)
 *    - fluxVentRadialTexture: graphics/fx/radial_fx.png (放射状能量光晕环)
 *    - fluxVentFringeColor: [125, 0, 155, 255] (皇家紫光晕边缘)
 *    - fluxVentCoreColor: [255, 255, 255, 255] (白炽等离子核心)
 */
export class ShipVentingRenderer {
  private particles: VentParticle[] = [];
  private emitters: VentEmitter[] = [];
  private faderIn = 0; // 排散刚启动时的能量爆发淡入系数 (0.0 ~ 1.0)
  private startPulse = 0; // 手动排散按下瞬间的短促能量爆发
  private wasVenting = false;
  private initializedForShipId: string | null = null;

  // 预载原版贴图路径
  public static readonly NEBULA_TEX = '/game-assets/graphics/fx/nebula_colorless.png';
  public static readonly RADIAL_TEX = '/game-assets/graphics/fx/radial_fx.png';

  constructor() {}

  /**
   * 按舰级初始化环绕舰体周边的排散喷口 (严格对齐 oOoOOO..._cfr_46.java: n2)
   */
  private initEmittersIfNeeded(ship: Ship, random: VisualRandom) {
    if (this.initializedForShipId === ship.id && this.emitters.length > 0) return;
    this.initializedForShipId = ship.id;
    this.emitters = [];

    // 主力舰: 18 个喷口 (每 20°); 巡洋舰: 18 个; 驱逐/护卫: 12 个; 战机: 4 个
    let count = 18;
    const size = ship.flux.hullSize;
    if (size === 'CAPITAL_SHIP' || size === 'CRUISER') {
      count = 18;
    } else if (size === 'DESTROYER' || size === 'FRIGATE') {
      count = 12;
    } else if (size === 'FIGHTER') {
      count = 4;
    }

    for (let i = 0; i < count; i++) {
      this.emitters.push({
        perimeterT: i / count,
        interval: 0.08 + random.sample(`${ship.id}:vent-interval`, i) * 0.12,
        timer: random.sample(`${ship.id}:vent-phase`, i) * 0.1,
        spawnIndex: 0
      });
    }
  }

  /**
   * 重置/清空状态
   */
  public reset() {
    this.particles = [];
    this.emitters = [];
    this.initializedForShipId = null;
    this.faderIn = 0;
    this.startPulse = 0;
    this.wasVenting = false;
  }

  public getVisualState(): VentVisualState {
    return {
      particleCount: this.particles.length,
      emitterCount: this.emitters.length,
      faderIn: this.faderIn,
      startPulse: this.startPulse
    };
  }

  /**
   * 60Hz 步长更新喷涌粒子逻辑
   */
  public update(dt: number, ship: Ship, random: VisualRandom) {
    this.initEmittersIfNeeded(ship, random);
    const ventVisual = getShipVisualProfile(ship.spec.id).vent;

    const ventingStarted = ship.flux.isVenting && !this.wasVenting;
    if (ship.flux.isVenting) {
      // 原版主动排散按下时立刻有可读的能量喷发；不能等异步贴图或随机 emitter phase 才出现第一帧反馈。
      if (ventingStarted) {
        this.faderIn = Math.max(this.faderIn, 0.5);
        this.startPulse = 1.0;
        for (const emitter of this.emitters) emitter.timer = 0;
      } else {
        this.faderIn = Math.min(1.0, this.faderIn + dt * 3.3);
      }
    } else {
      this.faderIn = Math.max(0.0, this.faderIn - dt * 2.5);
    }

    // 1. 若处于排散中，从真实 authored hull bounds 周边向外喷射等离子气团。
    if (ship.flux.isVenting) {
      const fluxLevel = ship.flux.fluxPercent;
      const emitterJitter = this.emitters.length > 0 ? 0.35 / this.emitters.length : 0;

      for (let emitterIndex = 0; emitterIndex < this.emitters.length; emitterIndex++) {
        const emitter = this.emitters[emitterIndex];
        emitter.timer -= dt;
        if (emitter.timer <= 0) {
          emitter.timer = emitter.interval;
          const sample = (channel: string) => random.sample(`${ship.id}:${channel}`, emitterIndex * 1_000_003 + emitter.spawnIndex);

          const surface = sampleShipHullSurface(
            ship,
            emitter.perimeterT + (sample('vent-edge-jitter') - 0.5) * emitterJitter
          );
          const normalRad = surface.outward.heading();
          // 从舰体外轮廓线外侧 2px 起喷，让白热喷口不会被舰体贴图吞掉。
          const spawnX = surface.point.x + surface.outward.x * 2;
          const spawnY = surface.point.y + surface.outward.y * 2;

          // 喷射初速度: 沿真实 hull edge outward normal 向外爆发。
          const ventSpeed = (80 + sample('vent-speed') * 95) * (0.7 + fluxLevel * 0.45);
          const spreadAngle = normalRad + (sample('vent-spread') - 0.5) * 0.3;
          const velX = Math.cos(spreadAngle) * ventSpeed + ship.vel.x * 0.5;
          const velY = Math.sin(spreadAngle) * ventSpeed + ship.vel.y * 0.5;

          // 随机选取 4x4 nebula_colorless 粒子切片
          const cellX = Math.floor(sample('vent-cell-x') * 4);
          const cellY = Math.floor(sample('vent-cell-y') * 4);
          const u0 = cellX * 0.25;
          const v0 = cellY * 0.25;
          const u1 = (cellX + 1) * 0.25;
          const v1 = (cellY + 1) * 0.25;

          const baseSize = (ship.spec.collisionRadius * 0.2 + 14) * ventVisual.particleScale;
          const initSize = baseSize * (0.65 + sample('vent-size') * 0.35);
          const maxSize = baseSize * (1.7 + sample('vent-max-size') * 0.6);
          const life = 0.7 + sample('vent-life') * 0.4;

          this.particles.push({
            pos: new Vector2(spawnX, spawnY),
            vel: new Vector2(velX, velY),
            life,
            maxLife: life,
            size: initSize,
            maxSize,
            rotation: sample('vent-rotation') * Math.PI * 2,
            spin: (sample('vent-spin') - 0.5) * 1.8,
            u0,
            v0,
            u1,
            v1
          });
          emitter.spawnIndex++;
        }
      }
    }

    this.startPulse = Math.max(0, this.startPulse - dt * 2.4);
    this.wasVenting = ship.flux.isVenting;

    // 2. 更新活跃粒子物理与生命周期
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      // 太空等离子急速减速扩散阻尼
      p.vel.scale(Math.max(0, 1 - dt * 2.8));
      p.rotation += p.spin * dt;
    }
  }

  /**
   * 绘制舰体周边 1:1 原版放射状能量脉动光晕环 (严格对齐 float.java: o00000)
   * 位于舰体底层，展现核心高压热量外溢
   */
  public renderRadialHalo(
    batcher: SpriteBatcher,
    ribbonBatcher: RibbonBatcher,
    textures: WebGLTextureManager,
    ship: Ship,
    shipPos: Vector2,
    shipFacing: number
  ) {
    if (!ship.flux.isVenting && this.faderIn <= 0.01) return;

    const radialTex = textures.getTexture(ShipVentingRenderer.RADIAL_TEX);
    if (!radialTex || this.faderIn <= 0.02) return;

    const fluxLevel = ship.flux.fluxPercent;
    const nowSec = visualNowMs() * 0.001;
    const ventVisual = getShipVisualProfile(ship.spec.id).vent;

    batcher.flush();
    ribbonBatcher.begin(batcher.currentViewProj);
    // 外层皇家紫高能晕光 (fluxVentFringeColor: [125, 0, 155])
    const haloAlpha = Math.min(0.95,
      this.faderIn * (0.42 + 0.2 * Math.sin(nowSec * 14.0)) * (0.58 + fluxLevel * 0.42)
      + this.startPulse * 0.38
    );
    ribbonBatcher.drawRadialHalo(
      radialTex,
      shipPos,
      shipFacing,
      ship.spec.collisionRadius * ventVisual.haloScale * (1.0 + Math.sin(nowSec * 9.0) * 0.05),
      ventVisual.fringeColor,
      haloAlpha,
      nowSec * 0.8
    );
    // 内层炽白等离子核心环 (fluxVentCoreColor: [255, 255, 255])
    const coreAlpha = Math.min(0.72,
      this.faderIn * 0.3 * (0.62 + fluxLevel * 0.38) + this.startPulse * 0.28
    );
    ribbonBatcher.drawRadialHalo(
      radialTex,
      shipPos,
      shipFacing,
      ship.spec.collisionRadius * 0.85 * ventVisual.haloScale,
      ventVisual.coreColor,
      coreAlpha,
      -nowSec * 0.6
    );
    ribbonBatcher.end();
    batcher.resumeProgram();
  }

  /**
   * 绘制高速向外喷涌的等离子气团 (1:1 oOoOOO..._cfr_46.java 双层加色渲染)
   * 位于舰体与挂点上层，展现排散喷口向太空喷吐的白色炽热离子与紫色电浆气团
   */
  public renderVentPlumes(
    batcher: SpriteBatcher,
    textures: WebGLTextureManager,
    ship: Ship
  ) {
    if (this.particles.length === 0) return;

    const nebulaTex = textures.getTexture(ShipVentingRenderer.NEBULA_TEX);
    if (!nebulaTex) return;

    const fluxLevel = ship.flux.fluxPercent;
    batcher.setBlendMode('ADDITIVE');
    const ventVisual = getShipVisualProfile(ship.spec.id).vent;

    for (const p of this.particles) {
      const progress = Math.max(0, Math.min(1.0, 1.0 - p.life / p.maxLife));
      const curSize = (p.size + (p.maxSize - p.size) * Math.sin(progress * Math.PI * 0.5))
        * ventVisual.plumeScale * (1 + this.startPulse * 0.16);

      // 迅速淡入 (前 15%)，随后平滑散逸消逝 (后 85%)
      const fade = progress < 0.15 ? (progress / 0.15) : Math.max(0, (1.0 - progress) / 0.85);
      const alphaMult = Math.min(1, fade * (0.5 + fluxLevel * 0.5) * (1 + this.startPulse * 0.24));
      if (alphaMult <= 0.01) continue;

      // 通道 1: 外层皇家紫/洋红高能离子光晕 (fluxVentFringeColor: [125, 0, 155])
      batcher.drawSprite(
        nebulaTex,
        p.pos.x,
        p.pos.y,
        curSize,
        curSize,
        p.rotation,
        0,
        0,
        ventVisual.fringeColor[0] / 255,
        ventVisual.fringeColor[1] / 255,
        ventVisual.fringeColor[2] / 255,
        alphaMult * 0.72,
        p.u0,
        p.v0,
        p.u1,
        p.v1
      );

      // 通道 2: 白炽核心等离子团 (fluxVentCoreColor: [255, 255, 255])
      const coreSize = curSize * 0.55;
      batcher.drawSprite(
        nebulaTex,
        p.pos.x,
        p.pos.y,
        coreSize,
        coreSize,
        p.rotation,
        0,
        0,
        ventVisual.coreColor[0] / 255,
        ventVisual.coreColor[1] / 255,
        ventVisual.coreColor[2] / 255,
        alphaMult * 0.88,
        p.u0,
        p.v0,
        p.u1,
        p.v1
      );
    }
  }

  public render(
    batcher: SpriteBatcher,
    ribbonBatcher: RibbonBatcher,
    textures: WebGLTextureManager,
    ship: Ship,
    shipPos: Vector2,
    shipFacing: number
  ) {
    this.renderRadialHalo(batcher, ribbonBatcher, textures, ship, shipPos, shipFacing);
    this.renderVentPlumes(batcher, textures, ship);
  }
}
