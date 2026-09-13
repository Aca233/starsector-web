import { beginRenderFrame, endRenderFrame, visualRandom, visualNowMs } from '../RenderDeterminism';
import type { RenderFrameContext } from '../RenderFrameContext';
import { CombatEngine } from '../../simulation/CombatEngine';
import { Vector2 } from '../../math/Vector2';
import { SpriteBatcher } from './SpriteBatcher';
import { RibbonBatcher } from './RibbonBatcher';
import { WebGLTextureManager } from './WebGLTextureManager';
import { WebGLShieldShader } from './WebGLShieldShader';
import { WebGLPassContext, ViewportBounds } from './WebGLPassContext';
import { WebGLEnvironmentPass } from './passes/WebGLEnvironmentPass';
import { WebGLShipPass } from './passes/WebGLShipPass';
import { WebGLProjectilePass } from './passes/WebGLProjectilePass';
import { WebGLFXPass } from './passes/WebGLFXPass';
import { WebGLTacticalOverlayPass } from './passes/WebGLTacticalOverlayPass';
import { ESSENTIAL_TEXTURE_URLS } from '../TextureCache';

/**
 * 远行星号 WebGL2 硬件级 GPU 实例化渲染中枢 (WebGLCombatRenderer)
 * 采用分通道架构 (Pass-based Architecture)，协调环境、光束缎带、战舰挂点、弹丸粒子、护盾特效与战术 HUD
 * 将 2000+ 次 CPU 立即模式绘制合并为 < 10 次 GPU Instanced Draw Calls
 */
export class WebGLCombatRenderer {
  public readonly canvas: HTMLCanvasElement;
  public gl: WebGL2RenderingContext;
  public textures: WebGLTextureManager;
  public batcher: SpriteBatcher;
  public ribbonBatcher: RibbonBatcher;
  public shieldShader: WebGLShieldShader;

  // 独立渲染通道实例
  public readonly environmentPass: WebGLEnvironmentPass;
  public readonly shipPass: WebGLShipPass;
  public readonly projectilePass: WebGLProjectilePass;
  public readonly fxPass: WebGLFXPass;
  public readonly tacticalOverlayPass: WebGLTacticalOverlayPass;

  // 官方原版战术武器射界状态机 (1:1 _super.java: 选定编组展开并常驻显示，切换编组平滑淡出淡入，绝不自动超时消隐)
  private arcActiveGroupIndex = 0;
  private arcTargetGroupIndex = 0;
  private arcFadeState: 'FADING_IN' | 'FADING_OUT' | 'VISIBLE' | 'HIDDEN' = 'FADING_IN';
  private arcAnimProgress = 1.0;
  private contextLost = false;
  private resourceRecreations = 0;
  private gpuTimerExt: any = null;
  private pendingGpuQueries: WebGLQuery[] = [];
  private lastGpuTimeMs: number | null = null;

  private readonly onContextLost = (event: Event) => {
    event.preventDefault();
    this.contextLost = true;
    this.textures.invalidateGPU();
  };

  private readonly onContextRestored = () => {
    const gl = this.canvas.getContext('webgl2');
    if (!gl) return;
    this.gl = gl;
    this.textures = new WebGLTextureManager(gl);
    this.batcher = new SpriteBatcher(gl);
    this.ribbonBatcher = new RibbonBatcher(gl);
    this.shieldShader = new WebGLShieldShader(gl);
    this.gpuTimerExt = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.pendingGpuQueries = [];
    this.lastGpuTimeMs = null;
    this.contextLost = false;
    this.resourceRecreations++;
  };

  constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
    this.canvas = canvas;
    this.gl = gl;
    this.textures = new WebGLTextureManager(gl);
    this.batcher = new SpriteBatcher(gl);
    this.ribbonBatcher = new RibbonBatcher(gl);
    this.shieldShader = new WebGLShieldShader(gl);
    this.gpuTimerExt = gl.getExtension('EXT_disjoint_timer_query_webgl2');

    // 实例化各子渲染通道
    this.environmentPass = new WebGLEnvironmentPass();
    this.shipPass = new WebGLShipPass();
    this.projectilePass = new WebGLProjectilePass();
    this.fxPass = new WebGLFXPass();
    this.tacticalOverlayPass = new WebGLTacticalOverlayPass();
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  public prepareAssets(): Promise<void> {
    return this.textures.preload(ESSENTIAL_TEXTURE_URLS);
  }

  public updateVisual(engine: CombatEngine, dt: number, frame: RenderFrameContext): void {
    if (this.contextLost) return;
    this.shipPass.updateVisual(engine, dt, frame.random);
    this.updateTacticalArc(engine, dt);
  }

  private updateTacticalArc(engine: CombatEngine, dt: number): void {
    const pShip = engine.playerShip;
    const targetGroup = pShip?.weaponGroups?.[pShip.selectedGroupIndex] ?? null;
    const targetHasWeapons = !!(targetGroup?.weaponSlotIds?.length);

    if (pShip && pShip.selectedGroupIndex !== this.arcTargetGroupIndex) {
      this.arcTargetGroupIndex = pShip.selectedGroupIndex;
      if (this.arcFadeState === 'VISIBLE' || this.arcFadeState === 'FADING_IN') {
        this.arcFadeState = 'FADING_OUT';
      } else {
        this.arcActiveGroupIndex = this.arcTargetGroupIndex;
        this.arcFadeState = targetHasWeapons ? 'FADING_IN' : 'HIDDEN';
      }
    }

    if (this.arcFadeState === 'FADING_OUT') {
      this.arcAnimProgress -= dt / 0.2;
      if (this.arcAnimProgress <= 0) {
        this.arcAnimProgress = 0;
        this.arcActiveGroupIndex = this.arcTargetGroupIndex;
        const newGroup = pShip?.weaponGroups?.[this.arcActiveGroupIndex] ?? null;
        this.arcFadeState = newGroup?.weaponSlotIds?.length && !pShip.isDead ? 'FADING_IN' : 'HIDDEN';
      }
    } else if (this.arcFadeState === 'FADING_IN') {
      this.arcAnimProgress += dt / 0.25;
      if (this.arcAnimProgress >= 1) {
        this.arcAnimProgress = 1;
        this.arcFadeState = 'VISIBLE';
      }
    } else if (this.arcFadeState === 'VISIBLE') {
      this.arcAnimProgress = 1;
      if (!pShip || pShip.isDead || !targetHasWeapons) this.arcFadeState = 'FADING_OUT';
    } else {
      this.arcAnimProgress = 0;
    }
  }

  public resetVisualState(): void {
    this.shipPass.resetVisualState();
    this.arcActiveGroupIndex = 0;
    this.arcTargetGroupIndex = 0;
    this.arcFadeState = 'FADING_IN';
    this.arcAnimProgress = 1.0;
  }

  public render(engine: CombatEngine, alpha: number, cameraPos: Vector2, zoom: number, frame: RenderFrameContext) {
    if (this.contextLost) return;
    beginRenderFrame(frame);
    const gpuQuery = this.beginGpuTimer();
    try {
    const gl = this.gl;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const nowSec = visualNowMs() * 0.001;

    // 1. 视口与背景清屏 (纯黑深空)
    gl.viewport(0, 0, width, height);
    gl.clearColor(0.02, 0.027, 0.05, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // 2. 震屏微扰
    const shake = engine.cameraShakeIntensity;
    const shakeX = (visualRandom('webgl/WebGLCombatRenderer.ts#1') - 0.5) * 2 * shake;
    const shakeY = (visualRandom('webgl/WebGLCombatRenderer.ts#2') - 0.5) * 2 * shake;
    const actualCam = new Vector2(cameraPos.x + shakeX, cameraPos.y + shakeY);

    // 3. 构建当前视口与共享渲染上下文
    const halfW = (width / 2) / zoom;
    const halfH = (height / 2) / zoom;
    const viewport: ViewportBounds = {
      left: actualCam.x - halfW,
      right: actualCam.x + halfW,
      bottom: actualCam.y - halfH,
      top: actualCam.y + halfH,
      width: halfW * 2,
      height: halfH * 2
    };

    const ctx: WebGLPassContext = {
      gl,
      canvas: this.canvas,
      textures: this.textures,
      batcher: this.batcher,
      ribbonBatcher: this.ribbonBatcher,
      shieldShader: this.shieldShader,
      cameraPos: actualCam,
      zoom,
      alpha,
      viewport,
      whiteTex: this.textures.getWhiteTexture(),
      hitGlowTex: this.textures.getTexture('/game-assets/graphics/fx/hit_glow.png'),
      glowTex: this.textures.getTexture('/game-assets/graphics/fx/glow64.png')
    };

    // 4. 开启批处理器
    this.batcher.begin(actualCam, zoom, width, height);

    // 4.1 通道 1: 深空背景、星空与星云小行星
    if (frame.layers.has('background') || frame.layers.has('nebula')) {
      this.environmentPass.render(engine, ctx, actualCam);
    }

    // 4.2 通道 2: 导弹连续尾迹缎带 (严格对齐 Starsector 原版: LAYER_BELOW_SHIPS 位于战舰底层)
    if (frame.layers.has('trail')) this.projectilePass.renderContrails(engine, ctx);

    // 插值计算主战舰坐标与角度
    const enemyPos = engine.enemyShip.interpolatedPos(alpha);
    const enemyFacing = engine.enemyShip.interpolatedFacing(alpha);
    const playerPos = engine.playerShip.interpolatedPos(alpha);
    const playerFacing = engine.playerShip.interpolatedFacing(alpha);

    // 4.3 通道 3: 相位潜航、舰体战损焦痕、推进尾焰与炮塔挂点 (LAYER_SHIPS)
    if (frame.layers.has('hull')) this.shipPass.render(engine, ctx, nowSec);

    // 4.4 通道 4: 枪口火光、等离子弹丸、动能弹实弹、高能光束死光 (严格对齐 Starsector: LAYER_ABOVE_SHIPS_AND_ASTEROIDS 位于战舰上方)
    if (frame.layers.has('weapon')) this.projectilePass.renderProjectilesAndMuzzle(engine, ctx);
    if (frame.layers.has('beam')) this.projectilePass.renderBeams(engine, ctx);

    // 4.5 通道 5: 折跃水雷、极坐标护盾 Shader、护盾涟漪、EMP 闪电与火球爆炸碎片
    if (frame.layers.has('shield') || frame.layers.has('explosion')) {
      this.fxPass.render(engine, ctx, nowSec, enemyPos, enemyFacing, playerPos, playerFacing);
    }

    // 4.6 通道 6: 战术锁定方括号、前置瞄准点、武器射界与测距弧 (1:1 原版 _super.java & E.java)
    this.tacticalOverlayPass.render(engine, ctx, nowSec, enemyPos, playerPos, this.arcActiveGroupIndex, this.arcAnimProgress);
    if (frame.layers.has('markers')) {
      this.tacticalOverlayPass.renderDebugMarkers(engine, ctx, enemyPos, playerPos);
    }

    // 5. 提交所有剩余 GPU 绘制调用
    this.batcher.end();
    } finally {
      this.endGpuTimer(gpuQuery);
      endRenderFrame();
    }
  }

  private resolveGpuQueries(): void {
    if (!this.gpuTimerExt || this.pendingGpuQueries.length === 0 || this.contextLost) return;
    const query = this.pendingGpuQueries[0];
    const available = this.gl.getQueryParameter(query, this.gl.QUERY_RESULT_AVAILABLE) as boolean;
    if (!available) return;
    const disjoint = this.gl.getParameter(this.gpuTimerExt.GPU_DISJOINT_EXT) as boolean;
    if (!disjoint) {
      const elapsedNs = this.gl.getQueryParameter(query, this.gl.QUERY_RESULT) as number;
      this.lastGpuTimeMs = elapsedNs / 1_000_000;
    } else {
      this.lastGpuTimeMs = null;
    }
    this.gl.deleteQuery(query);
    this.pendingGpuQueries.shift();
  }

  private beginGpuTimer(): WebGLQuery | null {
    this.resolveGpuQueries();
    if (!this.gpuTimerExt || this.pendingGpuQueries.length >= 4 || this.contextLost) return null;
    const query = this.gl.createQuery();
    if (!query) return null;
    this.gl.beginQuery(this.gpuTimerExt.TIME_ELAPSED_EXT, query);
    return query;
  }

  private endGpuTimer(query: WebGLQuery | null): void {
    if (!query || !this.gpuTimerExt || this.contextLost) return;
    this.gl.endQuery(this.gpuTimerExt.TIME_ELAPSED_EXT);
    this.pendingGpuQueries.push(query);
  }

  public getResourceStats() {
    return {
      ...this.textures.getStats(),
      resourceRecreations: this.resourceRecreations,
      drawCalls: this.batcher.drawCalls + this.ribbonBatcher.drawCalls,
      gpuTimerAvailable: !!this.gpuTimerExt,
      gpuTimeMs: this.lastGpuTimeMs
    };
  }

  public dispose(): void {
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    if (!this.contextLost) {
      for (const query of this.pendingGpuQueries) this.gl.deleteQuery(query);
      this.pendingGpuQueries = [];
      this.textures.dispose();
      this.batcher.dispose();
      this.ribbonBatcher.dispose();
      this.shieldShader.dispose();
    }
    this.contextLost = true;
  }
}
