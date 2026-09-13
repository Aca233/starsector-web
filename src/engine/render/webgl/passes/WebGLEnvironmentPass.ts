import { CombatEngine } from '../../../simulation/CombatEngine';
import type { NebulaCloud } from '../../../simulation/CombatTypes';
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
 * Deep-space environment pass. V09 explicitly separates opaque/far terrain from
 * foreground translucent occlusion so layer toggles are meaningful and tactical
 * overlays can remain readable above world-space haze.
 */
export class WebGLEnvironmentPass {
  private readonly starfield: StarParticle[] = [];
  private static readonly PARALLAX_FACTORS = [0.02, 0.05, 0.08];

  constructor() {
    const random = new VisualRandom(0x0e9b71a);
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

  public renderBackground(ctx: WebGLPassContext, actualCam: Vector2): void {
    const { batcher, textures, whiteTex, viewport } = ctx;
    const bgTex = textures.getTexture('/game-assets/graphics/backgrounds/background1.jpg');
    const pFactor = 0.05;
    const bgX = actualCam.x * (1 - pFactor);
    const bgY = actualCam.y * (1 - pFactor);

    batcher.setBlendMode('NORMAL');
    batcher.drawSprite(bgTex, bgX, bgY, 4800, 3600, 0, 0, 0, 0.92, 0.94, 1.0, 1.0);

    for (const star of this.starfield) {
      const starParallax = WebGLEnvironmentPass.PARALLAX_FACTORS[star.layer];
      // SpriteBatcher later subtracts the camera. Adding (1-p)*camera here leaves
      // exactly p*camera movement on screen instead of double-subtracting it.
      const sx = star.x + actualCam.x * (1 - starParallax);
      const sy = star.y + actualCam.y * (1 - starParallax);
      if (sx < viewport.left - 8 || sx > viewport.right + 8 || sy < viewport.bottom - 8 || sy > viewport.top + 8) continue;
      batcher.drawSprite(whiteTex, sx, sy, star.size, star.size, 0, 0, 0, 1, 1, 1, star.alpha);
    }
  }

  public renderNebulae(engine: CombatEngine, ctx: WebGLPassContext, depths: readonly NebulaCloud['depth'][]): void {
    if (engine.nebulae.length === 0) return;
    const { batcher, textures } = ctx;
    const depthSet = new Set(depths);

    for (const neb of engine.nebulae) {
      if (!depthSet.has(neb.depth)) continue;
      const diameter = neb.radius * 2 * neb.scale;
      if (!this.circleVisible(ctx, neb.pos, diameter * 0.55)) continue;

      const nebTex = textures.getTexture(neb.spriteUrl);
      const tint = neb.type === 'AMBER' ? [1.0, 0.72, 0.42] as const : [0.42, 0.68, 1.0] as const;
      const baseAlpha = neb.depth === 'FOREGROUND'
        ? (neb.type === 'AMBER' ? 0.13 : 0.15)
        : neb.depth === 'MIDGROUND'
          ? (neb.type === 'AMBER' ? 0.2 : 0.24)
          : (neb.type === 'AMBER' ? 0.17 : 0.2);

      // Source-over style pass provides actual translucent occlusion rather than
      // making every cloud a purely additive light source.
      batcher.setBlendMode('NORMAL');
      batcher.drawSprite(nebTex, neb.pos.x, neb.pos.y, diameter, diameter, neb.rotation, 0, 0, tint[0], tint[1], tint[2], baseAlpha);

      // A restrained glow preserves the ionized-cloud highlight without washing
      // out silhouettes. Foreground haze intentionally gets the weakest glow.
      batcher.setBlendMode('ADDITIVE');
      const glowAlpha = neb.depth === 'FOREGROUND' ? 0.025 : 0.055;
      batcher.drawSprite(nebTex, neb.pos.x, neb.pos.y, diameter * 1.02, diameter * 1.02, -neb.rotation * 0.7, 0, 0, tint[0], tint[1], tint[2], glowAlpha);
    }
  }

  public renderAsteroids(engine: CombatEngine, ctx: WebGLPassContext): void {
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
