import { beginRenderFrame, endRenderFrame, visualRandom } from './RenderDeterminism';
import type { RenderFrameContext } from './RenderFrameContext';
import { CombatEngine } from '../simulation/CombatEngine';
import { Vector2 } from '../math/Vector2';
import { TextureCache, textureCache } from './TextureCache';
import { EnvironmentRenderer } from './renderers/EnvironmentRenderer';
import { ShipRenderer } from './renderers/ShipRenderer';
import { ShieldRenderer } from './renderers/ShieldRenderer';
import { FXRenderer } from './renderers/FXRenderer';
import { TacticalMapRenderer } from './renderers/TacticalMapRenderer';
import type { RendererResourceStats } from './ICombatRenderer';

export { TextureCache, textureCache };

/**
 * 远行星号主渲染调度中枢 (CombatRenderer)
 * 解耦并调度 EnvironmentRenderer, ShipRenderer, ShieldRenderer, FXRenderer 与 TacticalMapRenderer，
 * 负责视口投影矩阵、亚帧平滑插值与贴图资源管线。
 */
export class CombatRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  public readonly environmentRenderer: EnvironmentRenderer = new EnvironmentRenderer();
  public readonly shipRenderer: ShipRenderer = new ShipRenderer();
  public readonly shieldRenderer: ShieldRenderer = new ShieldRenderer();
  public readonly fxRenderer: FXRenderer = new FXRenderer();
  public readonly tacticalMapRenderer: TacticalMapRenderer = new TacticalMapRenderer();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
      throw new Error('Failed to get 2D context');
    }
    this.ctx = context;
  }

  // 向后兼容辅助方法
  public getImage(url: string): HTMLImageElement {
    return textureCache.getImage(url);
  }

  public getTintedImage(url: string, r: number, g: number, b: number): HTMLCanvasElement | null {
    return textureCache.getTintedImage(url, r, g, b);
  }

  public updateVisual(_engine: CombatEngine, _dt: number, _frame: RenderFrameContext): void {
    // Canvas2D has no renderer-owned evolving visual state.
  }

  public prepareAssets(): Promise<void> {
    return textureCache.preloadEssentialTextures();
  }

  public resetVisualState(): void {
    // Canvas2D renderers are stateless between frames.
  }

  public getResourceStats(): RendererResourceStats {
    return {
      residentTextures: 0,
      pendingUploads: 0,
      uploads: 0,
      invalidations: 0,
      resourceRecreations: 0,
      drawCalls: 0,
      gpuTimerAvailable: false,
      gpuTimeMs: null
    };
  }

  /**
   * 核心渲染帧入口：基于 alpha 系数进行亚帧插值
   * @param engine 战斗逻辑引擎
   * @param alpha 亚帧插值率 [0, 1)
   * @param cameraPos 摄像机世界中心
   * @param zoom 缩放级别
   */
  public render(engine: CombatEngine, alpha: number, cameraPos: Vector2, zoom: number, frame: RenderFrameContext) {
    beginRenderFrame(frame);
    try {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    // 清空背景
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, width, height);

    // 屏幕震颤计算
    const shake = engine.cameraShakeIntensity;
    const shakeX = (visualRandom('CombatRenderer.ts#1') - 0.5) * 2 * shake;
    const shakeY = (visualRandom('CombatRenderer.ts#2') - 0.5) * 2 * shake;

    ctx.save();
    // 摄像机视口变换 (包含震屏偏移)
    ctx.translate(width / 2 + shakeX, height / 2 + shakeY);
    ctx.scale(zoom, zoom);
    ctx.translate(-cameraPos.x, -cameraPos.y);

    // 1. 绘制深空星云背景与视差星空
    if (frame.layers.has('background')) this.environmentRenderer.drawStarfield(ctx, cameraPos);

    // 1.2 远景/中景星云；前景透明层在世界特效之后绘制。
    if (frame.layers.has('nebula')) this.environmentRenderer.drawNebulae(ctx, engine, ['BACKGROUND', 'MIDGROUND']);

    // 1.5 绘制漂移小行星带 (Asteroids)
    if (frame.layers.has('asteroid')) this.environmentRenderer.drawAsteroids(ctx, engine);

    // 2. 绘制导弹烟雾尾迹 (Contrails - 位于舰体下层空间)
    if (frame.layers.has('trail')) this.fxRenderer.drawContrails(ctx, engine);

    // 3. 绘制光束 (Beams)
    if (frame.layers.has('beam')) this.fxRenderer.drawBeams(ctx, engine);

    // 3.8 绘制相位潜航时空残影 (Phase Ghosts)
    if (frame.layers.has('hull')) {
      this.shipRenderer.drawPhaseGhosts(ctx, engine.enemyShip);
      this.shipRenderer.drawPhaseGhosts(ctx, engine.playerShip);
    }

    // 4. 绘制舰船 (Ships: 攻势与典范与厄运)
    const enemyPos = Vector2.lerp(engine.enemyShip.prevPos, engine.enemyShip.pos, alpha);
    let dEnemyAngle = engine.enemyShip.facingRad - engine.enemyShip.prevFacingRad;
    while (dEnemyAngle > Math.PI) dEnemyAngle -= Math.PI * 2;
    while (dEnemyAngle < -Math.PI) dEnemyAngle += Math.PI * 2;
    const enemyFacing = engine.enemyShip.prevFacingRad + dEnemyAngle * alpha;

    const playerPos = Vector2.lerp(engine.playerShip.prevPos, engine.playerShip.pos, alpha);
    let dPlayerAngle = engine.playerShip.facingRad - engine.playerShip.prevFacingRad;
    while (dPlayerAngle > Math.PI) dPlayerAngle -= Math.PI * 2;
    while (dPlayerAngle < -Math.PI) dPlayerAngle += Math.PI * 2;
    const playerFacing = engine.playerShip.prevFacingRad + dPlayerAngle * alpha;

    if (frame.layers.has('hull')) {
      this.shipRenderer.drawShip(ctx, engine.enemyShip, alpha, enemyPos, enemyFacing);
      this.shipRenderer.drawShip(ctx, engine.playerShip, alpha, playerPos, playerFacing);
    }

    // 4.1 绘制能量护盾与战术锁定括号 / 环形幅能仪表
    if (frame.layers.has('shield')) {
      this.shieldRenderer.drawShield(ctx, engine.enemyShip, enemyPos, enemyFacing);
      this.shieldRenderer.drawShield(ctx, engine.playerShip, playerPos, playerFacing);
    }

    // 4.2 绘制战损断裂舰体残骸 (Hulk Fragments)
    this.fxRenderer.drawHulkFragments(ctx, engine, alpha);

    // 4.4 绘制阔剑重型战斗机中队与轰炸机中队
    this.tacticalMapRenderer.drawFighters(ctx, engine, alpha);

    // 4.5 绘制折跃水雷 (Spatial Mines)
    this.fxRenderer.drawMines(ctx, engine);

    // 5. 绘制枪口火光 (Muzzle Flashes)
    if (frame.layers.has('weapon')) this.fxRenderer.drawMuzzleFlashes(ctx, engine);

    // 6. 绘制投射物 (Projectiles)
    if (frame.layers.has('weapon')) this.fxRenderer.drawProjectiles(ctx, engine, alpha);

    // 8. 绘制 EMP 电弧
    this.fxRenderer.drawEmpArcs(ctx, engine);

    // 9. 绘制粒子与飞溅火花
    this.fxRenderer.drawParticles(ctx, engine);

    // 9.5 绘制金属装甲碎片与爆炸残骸 (Debris)
    this.fxRenderer.drawDebris(ctx, engine);

    // 10. 绘制原版官方爆炸翻页书动画与冲击波 (Explosions & Shockwaves)
    if (frame.layers.has('explosion')) this.fxRenderer.drawExplosions(ctx, engine);

    // 10.5 绘制护盾能量冲击空间扩散环 (Shield Ripples)
    this.shieldRenderer.drawShieldRipples(ctx, engine);

    // 10.7 V09 前景透明星云：遮挡世界对象，但战术标记保持在其上方。
    if (frame.layers.has('nebula')) this.environmentRenderer.drawNebulae(ctx, engine, ['FOREGROUND']);

    // 10.8 战术信息层保持可读，不被前景星云遮蔽。
    this.tacticalMapRenderer.drawTacticalTargetBracket(ctx, engine.enemyShip, enemyPos);
    this.shieldRenderer.drawInWorldRadialFluxArc(ctx, engine.playerShip, playerPos);
    this.tacticalMapRenderer.drawAimLeadPip(ctx, engine);

    // 11. 绘制空间悬浮战斗伤害数字与状态提醒
    this.tacticalMapRenderer.drawFloatingTexts(ctx, engine);

    // 12. 绘制星区战术指挥全景视图 (Tactical Map Mode - TAB)
    if (engine.isTacticalMap) {
      this.tacticalMapRenderer.drawTacticalMap(ctx, engine, cameraPos, zoom, width, height);
    }

    ctx.restore();
    } finally {
      endRenderFrame();
    }
  }

  public dispose(): void {
    // Canvas2D owns no explicit GPU resources. Tinted canvases remain reusable.
  }
}
