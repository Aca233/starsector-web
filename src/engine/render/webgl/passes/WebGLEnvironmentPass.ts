import type { CombatRenderView } from '../../CombatRenderView';
import { nebulaAppearance } from '../../NebulaAppearance';
import { Vector2 } from '../../../math/Vector2';
import { VisualRandom } from '../../../runtime/VisualRandom';
import { WebGLPassContext } from '../WebGLPassContext';

interface StarParticle {
  x: number;
  y: number;
  size: number;
  alpha: number;
  layer: number;
}

/**
 * Screen-space combat background and independently authored, below-ship clouds.
 * Extra stars are still an optional sandbox overlay, disabled by default.
 */
export class WebGLEnvironmentPass {
  private readonly starfield: StarParticle[] = [];
  private readonly backgroundCrop: readonly [number, number];
  private static readonly PARALLAX_FACTORS = [0.02, 0.05, 0.08];

  constructor() {
    const random = new VisualRandom(0x0e9b71a);
    this.backgroundCrop = [random.sample('background-crop-x'), random.sample('background-crop-y')];
    for (let i = 0; i < 450; i++) {
      this.starfield.push({
        x: (random.sample('environment-star-x', i) - 0.5) * 5200,
        y: (random.sample('environment-star-y', i) - 0.5) * 4200,
        size: 0.9 + random.sample('environment-star-size', i) * 2.5,
        alpha: 0.2 + random.sample('environment-star-alpha', i) * 0.8,
        layer: i % 3
      });
    }
  }

  public renderBackground(ctx: WebGLPassContext, actualCam: Vector2, environment: CombatRenderView['environment']): void {
    const { batcher, textures, whiteTex, viewport, canvas, zoom } = ctx;

    batcher.setBlendMode('NORMAL');
    if (environment.backgroundUrl) {
      const info = textures.getTextureInfo(environment.backgroundUrl);
      // CombatRenderView.replaceBackground only enlarges images to cover the screen;
      // CombatState.renderBG uses a separate, unzoomed projection. Convert those
      // pixel dimensions into world coordinates here so camera/zoom cancel out.
      const cover = Math.max(1, canvas.width / Math.max(1, info.width), canvas.height / Math.max(1, info.height));
      const pixelWidth = info.width * cover;
      const pixelHeight = info.height * cover;
      const width = pixelWidth / zoom;
      const height = pixelHeight / zoom;
      const x = actualCam.x + (pixelWidth - canvas.width) * (0.5 - this.backgroundCrop[0]) / zoom;
      const y = actualCam.y + (pixelHeight - canvas.height) * (0.5 - this.backgroundCrop[1]) / zoom;
      batcher.drawSprite(info.texture, x, y, width, height);
    }

    for (const star of this.starfield.slice(0, environment.starCount)) {
      const starParallax = WebGLEnvironmentPass.PARALLAX_FACTORS[star.layer];
      // SpriteBatcher later subtracts the camera. Adding (1-p)*camera here leaves
      // exactly p*camera movement on screen instead of double-subtracting it.
      const sx = star.x + actualCam.x * (1 - starParallax);
      const sy = star.y + actualCam.y * (1 - starParallax);
      if (sx < viewport.left - 8 || sx > viewport.right + 8 || sy < viewport.bottom - 8 || sy > viewport.top + 8) continue;
      batcher.drawSprite(whiteTex, sx, sy, star.size, star.size, 0, 0, 0, 1, 1, 1, star.alpha);
    }
  }

  public renderNebulae(engine: CombatRenderView, ctx: WebGLPassContext): void {
    const { batcher, textures } = ctx;
    // Standalone cloud art is submitted once with its complete image UVs.
    batcher.setBlendMode('NORMAL');
    for (const neb of engine.nebulae) {
      const appearance = nebulaAppearance(neb);
      if (!this.circleVisible(ctx, neb.pos, appearance.renderRadius)) continue;
      const opacity = Math.floor(255 * Math.max(0, Math.min(1, neb.thickness))) / 255;
      batcher.drawSprite(textures.getTexture(neb.spriteUrl), neb.pos.x, neb.pos.y,
        appearance.width, appearance.height, appearance.rotationRad, 0, 0, 1, 1, 1, opacity * appearance.opacityMult,
        appearance.u, appearance.v, appearance.u2, appearance.v2);
    }
  }

  public renderAsteroids(engine: CombatRenderView, ctx: WebGLPassContext): void {
    const { batcher, textures } = ctx;
    batcher.setBlendMode('NORMAL');
    for (const asteroid of engine.asteroids) {
      if (asteroid.hp <= 0 || !this.circleVisible(ctx, asteroid.pos, asteroid.radius + 8)) continue;
      const texture = textures.getTexture(asteroid.spriteUrl);
      const size = asteroid.radius * 2;
      batcher.drawSprite(texture, asteroid.pos.x, asteroid.pos.y, size, size, asteroid.facingRad, 0, 0);
    }
  }

  private circleVisible(ctx: WebGLPassContext, pos: Vector2, radius: number): boolean {
    const { viewport } = ctx;
    return pos.x + radius >= viewport.left
      && pos.x - radius <= viewport.right
      && pos.y + radius >= viewport.bottom
      && pos.y - radius <= viewport.top;
  }
}
