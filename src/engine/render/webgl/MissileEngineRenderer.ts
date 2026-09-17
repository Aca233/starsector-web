import type { Projectile } from '../../simulation/Weapon';
import { Vector2 } from '../../math/Vector2';
import { missileEngineVisual } from '../../visual/MissileEngineVisuals';
import { visualObjectRandom } from '../RenderDeterminism';
import type { WebGLPassContext } from './WebGLPassContext';

export interface MissileEngineRenderItem { projectile: Projectile; pos: Vector2 }

/** G.java's six dim colored strips, one faint outline, and colored/white nozzle star.
 * Batch all missile plumes together; don't flush a new mesh pass for every rocket. */
export function renderMissileEngines(items: readonly MissileEngineRenderItem[], ctx: WebGLPassContext): void {
  const samples = items.flatMap(({ projectile, pos }) => {
    const shape = missileEngineVisual(projectile);
    if (!shape) return [];
    const facing = projectile.facingRad ?? projectile.vel.heading();
    return [{ projectile, shape, facing, nozzle: pos.clone().addScaled(Vector2.fromAngle(facing), shape.nozzleOffset) }];
  });
  if (!samples.length) return;
  const { batcher, ribbonBatcher: ribbon, textures, hitGlowTex } = ctx;
  const plume = textures.getTexture('/game-assets/graphics/fx/engineglow32.png', true);
  const outline = textures.getTexture('/game-assets/graphics/fx/engineflame32.png');
  batcher.flush();
  ribbon.begin(batcher.currentViewProj);
  for (const { projectile: p, shape, facing, nozzle } of samples) {
    const color = [shape.color[0] / 255, shape.color[1] / 255, shape.color[2] / 255] as const;
    const phase = visualObjectRandom('missile-engine:' + p.id) - p.elapsedTime;
    for (let i = 0; i < 6; i++) {
      const angle = facing + Math.PI - (5 - i) / 6 * (p.turnVelocityRad ?? 0) * 0.15;
      const shift = (5 - i) * shape.throat / 12;
      const sx = 0.5 + 0.5 * (i + 1) / 6;
      ribbon.drawEnginePlume(plume, nozzle.x + Math.cos(angle) * shift, nozzle.y + Math.sin(angle) * shift,
        angle, shape.length * sx, shape.width * (6 - i) / 6, shape.throat * sx, phase + i / 6, 1,
        color, Math.floor(i * 5 * shape.color[3] / 255) / 255, shape.throatAlpha);
    }
  }
  ribbon.end();
  batcher.resumeProgram();
  batcher.setBlendMode('ADDITIVE');
  for (const { projectile: p, shape, facing, nozzle } of samples) {
    batcher.drawSprite(outline, nozzle.x, nozzle.y, shape.length * 0.9, shape.width,
      facing + Math.PI + Math.sin(p.elapsedTime * 4) * Math.PI / 360, -0.5, 0,
      shape.color[0] / 255, shape.color[1] / 255, shape.color[2] / 255, shape.outlineAlpha,
      0.01, 0.01, 0.99, 0.99);
    batcher.drawSprite(hitGlowTex, nozzle.x, nozzle.y, shape.glowDiameter, shape.glowDiameter, 0, 0, 0,
      shape.glowColor[0] / 255, shape.glowColor[1] / 255, shape.glowColor[2] / 255, shape.glowAlpha);
    batcher.drawSprite(hitGlowTex, nozzle.x, nozzle.y, shape.coreDiameter, shape.coreDiameter, 0, 0, 0,
      1, 1, 1, shape.coreAlpha);
  }
}
