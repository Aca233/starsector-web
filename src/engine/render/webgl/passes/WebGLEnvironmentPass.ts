import { CombatEngine } from '../../../simulation/CombatEngine';
import { WebGLPassContext } from '../WebGLPassContext';
import { Vector2 } from '../../../math/Vector2';

interface StarParticle {
  x: number;
  y: number;
  size: number;
  alpha: number;
  layer: number;
}

/**
 * 环境与深空星象渲染通道 (WebGLEnvironmentPass)
 * 职责:
 * 1. 视差背景图 (graphics/backgrounds/background1.jpg)
 * 2. 多图层视差星空 (Starfield)
 * 3. 星云流体尘埃 (Nebulae)
 * 4. 漂移小行星带 (Asteroids)
 */
export class WebGLEnvironmentPass {
  private starfield: StarParticle[] = [];

  constructor() {
    this.initStarfield();
  }

  private initStarfield() {
    this.starfield = [];
    for (let i = 0; i < 450; i++) {
      this.starfield.push({
        x: (Math.random() - 0.5) * 4400,
        y: (Math.random() - 0.5) * 4400,
        size: 1.2 + Math.random() * 2.2,
        alpha: 0.25 + Math.random() * 0.75,
        layer: i % 3
      });
    }
  }

  public render(engine: CombatEngine, ctx: WebGLPassContext, actualCam: Vector2) {
    const { batcher, textures, whiteTex } = ctx;

    // 1. 绘制官方深空星云视差背景 (background1.jpg)
    const bgTex = textures.getTexture('/api/asset?path=graphics/backgrounds/background1.jpg');
    const pFactor = 0.05;
    const bgX = actualCam.x * (1 - pFactor);
    const bgY = actualCam.y * (1 - pFactor);
    batcher.setBlendMode('NORMAL');
    batcher.drawSprite(bgTex, bgX, bgY, 4800, 3600, 0, 0, 0, 0.95, 0.95, 0.95, 1.0);

    // 2. 绘制视差星空 (单次 GPU 实例化合批)
    const pFactors = [0.02, 0.05, 0.08];
    for (let i = 0; i < this.starfield.length; i++) {
      const s = this.starfield[i];
      const sx = s.x - actualCam.x * pFactors[s.layer];
      const sy = s.y - actualCam.y * pFactors[s.layer];
      batcher.drawSprite(whiteTex, sx, sy, s.size, s.size, 0, 0, 0, 1.0, 1.0, 1.0, s.alpha);
    }

    // 3. 绘制真实深空星云尘埃 (Nebulae)
    if (engine.nebulae && engine.nebulae.length > 0) {
      batcher.setBlendMode('ADDITIVE');
      for (const neb of engine.nebulae) {
        const nebTex = textures.getTexture(neb.spriteUrl);
        const d = neb.radius * 2 * neb.scale;
        const [nr, ng, nb] = neb.type === 'AMBER' ? [1.0, 0.65, 0.2] : [0.2, 0.55, 1.0];
        const nAlpha = neb.type === 'AMBER' ? 0.38 : 0.45;
        batcher.drawSprite(nebTex, neb.pos.x, neb.pos.y, d, d, neb.rotation, 0, 0, nr, ng, nb, nAlpha);
      }
    }

    // 4. 绘制漂移小行星带 (Asteroids)
    batcher.setBlendMode('NORMAL');
    for (const ast of engine.asteroids) {
      if (ast.hp <= 0) continue;
      const astTex = textures.getTexture(ast.spriteUrl);
      const size = ast.radius * 2;
      batcher.drawSprite(astTex, ast.pos.x, ast.pos.y, size, size, ast.facingRad, 0, 0);
    }
  }
}
