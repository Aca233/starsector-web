import { visualRandom } from '../RenderDeterminism';
import { Vector2 } from '../../math/Vector2';
import { CombatEngine } from '../../simulation/CombatEngine';
import { textureCache } from '../TextureCache';

export class EnvironmentRenderer {
  // 按 [视差层 (0~2)][亮度桶 (0~3)] 预分桶存储，避免每帧 400 次 globalAlpha 频繁状态切换
  private starBuckets: { x: number; y: number; size: number }[][][] = [];
  private static readonly PARALLAX_FACTORS = [0.02, 0.05, 0.08];
  private static readonly STAR_COLORS = [
    'rgba(255, 255, 255, 0.25)',
    'rgba(255, 255, 255, 0.48)',
    'rgba(255, 255, 255, 0.72)',
    'rgba(255, 255, 255, 0.95)'
  ];

  constructor() {
    this.initStarfield();
  }

  private initStarfield() {
    this.starBuckets = [
      [[], [], [], []],
      [[], [], [], []],
      [[], [], [], []]
    ];

    for (let i = 0; i < 400; i++) {
      const layer = i % 3;
      const alpha = 0.2 + visualRandom('renderers/EnvironmentRenderer.ts#1') * 0.8;
      const b = Math.min(3, Math.max(0, Math.floor((alpha - 0.2) / 0.2)));
      this.starBuckets[layer][b].push({
        x: (visualRandom('renderers/EnvironmentRenderer.ts#2') - 0.5) * 4400,
        y: (visualRandom('renderers/EnvironmentRenderer.ts#3') - 0.5) * 4400,
        size: 1 + visualRandom('renderers/EnvironmentRenderer.ts#4') * 2.2
      });
    }
  }

  public drawStarfield(ctx: CanvasRenderingContext2D, cameraPos: Vector2) {
    // 1. 绘制官方正统深空星云 (background1.jpg) 视差滚动
    const bgImg = textureCache.getImage('/game-assets/graphics/backgrounds/background1.jpg');
    if (bgImg.complete && bgImg.naturalWidth > 0) {
      ctx.save();
      const parallaxFactor = 0.05;
      const bgW = 4800;
      const bgH = 3600;
      const bgX = cameraPos.x * (1 - parallaxFactor) - bgW / 2;
      const bgY = cameraPos.y * (1 - parallaxFactor) - bgH / 2;
      ctx.drawImage(bgImg, bgX, bgY, bgW, bgH);
      ctx.restore();
    }

    // 2. 官方三层视差星空 (批处理绘制，零 globalAlpha 切换)
    for (let layer = 0; layer < 3; layer++) {
      const pFactor = EnvironmentRenderer.PARALLAX_FACTORS[layer];
      const offsetX = cameraPos.x * pFactor;
      const offsetY = cameraPos.y * pFactor;

      for (let b = 0; b < 4; b++) {
        const stars = this.starBuckets[layer][b];
        if (stars.length === 0) continue;
        ctx.fillStyle = EnvironmentRenderer.STAR_COLORS[b];
        for (let i = 0; i < stars.length; i++) {
          const star = stars[i];
          ctx.fillRect(star.x - offsetX, star.y - offsetY, star.size, star.size);
        }
      }
    }

    // 战场作战边界参考网格
    ctx.strokeStyle = 'rgba(40, 70, 110, 0.22)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-2000, -1500, 4000, 3000);
  }

  public drawNebulae(ctx: CanvasRenderingContext2D, engine: CombatEngine) {
    if (!engine.nebulae || engine.nebulae.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    for (const neb of engine.nebulae) {
      const img = textureCache.getImage(neb.spriteUrl);
      if (img.complete && img.naturalWidth > 0) {
        ctx.save();
        ctx.translate(neb.pos.x, neb.pos.y);
        ctx.rotate(neb.rotation);
        ctx.globalAlpha = neb.type === 'AMBER' ? 0.38 : 0.45;
        const d = neb.radius * 2 * neb.scale;
        ctx.drawImage(img, -d / 2, -d / 2, d, d);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  public drawAsteroids(ctx: CanvasRenderingContext2D, engine: CombatEngine) {
    for (const ast of engine.asteroids) {
      if (ast.hp <= 0) continue;
      const img = textureCache.getImage(ast.spriteUrl);

      ctx.save();
      ctx.translate(ast.pos.x, ast.pos.y);
      ctx.rotate(ast.facingRad);

      const size = ast.radius * 2;
      if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, -ast.radius, -ast.radius, size, size);
      } else {
        ctx.fillStyle = '#6b5c4c';
        ctx.beginPath();
        ctx.arc(0, 0, ast.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#4a3f35';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.restore();
    }
  }
}
