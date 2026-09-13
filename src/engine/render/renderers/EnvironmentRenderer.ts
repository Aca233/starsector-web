import { Vector2 } from '../../math/Vector2';
import { CombatEngine } from '../../simulation/CombatEngine';
import type { NebulaCloud } from '../../simulation/CombatTypes';
import { VisualRandom } from '../../runtime/VisualRandom';
import { textureCache } from '../TextureCache';

export class EnvironmentRenderer {
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

  private initStarfield(): void {
    this.starBuckets = [
      [[], [], [], []],
      [[], [], [], []],
      [[], [], [], []]
    ];
    const random = new VisualRandom(0x0e9b71a);

    for (let i = 0; i < 400; i++) {
      const layer = i % 3;
      const alpha = 0.2 + random.sample('canvas-star-alpha', i) * 0.8;
      const brightnessBucket = Math.min(3, Math.max(0, Math.floor((alpha - 0.2) / 0.2)));
      this.starBuckets[layer][brightnessBucket].push({
        x: (random.sample('canvas-star-x', i) - 0.5) * 5200,
        y: (random.sample('canvas-star-y', i) - 0.5) * 4200,
        size: 0.9 + random.sample('canvas-star-size', i) * 2.5
      });
    }
  }

  public drawStarfield(ctx: CanvasRenderingContext2D, cameraPos: Vector2): void {
    const bgImg = textureCache.getImage('/game-assets/graphics/backgrounds/background1.jpg');
    if (bgImg.complete && bgImg.naturalWidth > 0) {
      ctx.save();
      const parallaxFactor = 0.05;
      const bgW = 4800;
      const bgH = 3600;
      const bgX = cameraPos.x * (1 - parallaxFactor) - bgW / 2;
      const bgY = cameraPos.y * (1 - parallaxFactor) - bgH / 2;
      ctx.globalAlpha = 0.96;
      ctx.drawImage(bgImg, bgX, bgY, bgW, bgH);
      ctx.restore();
    }

    for (let layer = 0; layer < 3; layer++) {
      const parallaxFactor = EnvironmentRenderer.PARALLAX_FACTORS[layer];
      const retainedCameraX = cameraPos.x * (1 - parallaxFactor);
      const retainedCameraY = cameraPos.y * (1 - parallaxFactor);

      for (let bucket = 0; bucket < 4; bucket++) {
        const stars = this.starBuckets[layer][bucket];
        if (stars.length === 0) continue;
        ctx.fillStyle = EnvironmentRenderer.STAR_COLORS[bucket];
        for (const star of stars) {
          ctx.fillRect(star.x + retainedCameraX, star.y + retainedCameraY, star.size, star.size);
        }
      }
    }
  }

  public drawNebulae(
    ctx: CanvasRenderingContext2D,
    engine: CombatEngine,
    depths: readonly NebulaCloud['depth'][] = ['BACKGROUND', 'MIDGROUND', 'FOREGROUND']
  ): void {
    if (engine.nebulae.length === 0) return;
    const depthSet = new Set(depths);

    for (const nebula of engine.nebulae) {
      if (!depthSet.has(nebula.depth)) continue;
      const image = textureCache.getImage(nebula.spriteUrl);
      if (!image.complete || image.naturalWidth <= 0) continue;

      const diameter = nebula.radius * 2 * nebula.scale;
      const baseAlpha = nebula.depth === 'FOREGROUND'
        ? (nebula.type === 'AMBER' ? 0.13 : 0.15)
        : nebula.depth === 'MIDGROUND'
          ? (nebula.type === 'AMBER' ? 0.2 : 0.24)
          : (nebula.type === 'AMBER' ? 0.17 : 0.2);

      ctx.save();
      ctx.translate(nebula.pos.x, nebula.pos.y);
      ctx.rotate(nebula.rotation);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = baseAlpha;
      ctx.drawImage(image, -diameter / 2, -diameter / 2, diameter, diameter);
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = nebula.depth === 'FOREGROUND' ? 0.025 : 0.055;
      const glowDiameter = diameter * 1.02;
      ctx.rotate(-nebula.rotation * 1.7);
      ctx.drawImage(image, -glowDiameter / 2, -glowDiameter / 2, glowDiameter, glowDiameter);
      ctx.restore();
    }
  }

  public drawAsteroids(ctx: CanvasRenderingContext2D, engine: CombatEngine): void {
    for (const asteroid of engine.asteroids) {
      if (asteroid.hp <= 0) continue;
      const image = textureCache.getImage(asteroid.spriteUrl);

      ctx.save();
      ctx.translate(asteroid.pos.x, asteroid.pos.y);
      ctx.rotate(asteroid.facingRad);
      const size = asteroid.radius * 2;
      if (image.complete && image.naturalWidth > 0) {
        ctx.drawImage(image, -asteroid.radius, -asteroid.radius, size, size);
      } else {
        ctx.fillStyle = '#6b5c4c';
        ctx.beginPath();
        ctx.arc(0, 0, asteroid.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}
