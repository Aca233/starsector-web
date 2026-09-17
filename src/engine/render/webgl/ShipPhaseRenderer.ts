import type { Ship } from '../../simulation/Ship';
import type { Vector2 } from '../../math/Vector2';
import type { WebGLPassContext } from './WebGLPassContext';
import { visualRandom } from '../RenderDeterminism';

/** Coil masks and seven-pose trail from combat/systems/P.java. */
export function renderShipPhase(ship: Ship, pos: Vector2, facing: number, ctx: WebGLPassContext): void {
  const { shield, spec } = ship;
  if (shield.type !== 'PHASE' || !spec.phaseHighlightSpriteUrl || !spec.phaseDiffuseSpriteUrl) return;
  if (!shield.isPhaseEngaged && shield.phaseState !== 'COOLDOWN') return;
  const { batcher, textures } = ctx;
  const highlight = textures.getTexture(spec.phaseHighlightSpriteUrl);
  const diffuse = textures.getTexture(spec.phaseDiffuseSpriteUrl);
  const pivotX = spec.pivotX / spec.spriteWidth - 0.5;
  const pivotY = spec.pivotY / spec.spriteHeight - 0.5;
  batcher.setBlendMode('ADDITIVE');
  const draw = (texture: WebGLTexture, x: number, y: number, angle: number, alpha: number, isDiffuse: boolean) => {
    batcher.drawSprite(texture, x, y, spec.spriteWidth, spec.spriteHeight, angle + Math.PI / 2,
      pivotX, pivotY, 1, isDiffuse ? 0 : 175 / 255, 1, alpha * (isDiffuse ? 150 / 255 : 1));
  };
  const cooldown = shield.phaseState === 'COOLDOWN' ? Math.sqrt(shield.phaseCooldownLevel)
    : shield.phaseState === 'OUT' ? 1 - shield.phaseEffectLevel : 0;
  const stress = shield.isPhaseEngaged
    ? Math.min(1, ship.flux.hardFlux / Math.max(1, ship.flux.maxFlux * 0.5)) : 0;
  const jitterAlpha = Math.max(cooldown * 0.33, stress * 0.67);
  const jitterRange = shield.phaseState === 'OUT' ? 0 : 20 * Math.max(stress, 1 - cooldown);
  if (jitterAlpha > 0) {
    for (let i = 0; i < 15; i++) {
      const x = pos.x + (visualRandom(`phase:${ship.id}:${i}:x`) - 0.5) * jitterRange;
      const y = pos.y + (visualRandom(`phase:${ship.id}:${i}:y`) - 0.5) * jitterRange;
      draw(diffuse, x, y, facing, jitterAlpha, true);
      if (i < 5) draw(highlight, x, y, facing, jitterAlpha, false);
    }
  }
  if (!shield.isPhaseEngaged || shield.phaseEffectLevel <= 0) return;
  const level = shield.phaseState === 'OUT' ? Math.min(1, shield.phaseEffectLevel / 0.25) : shield.phaseEffectLevel;
  const poses = ship.phaseGhosts;
  let previousX = pos.x;
  let previousY = pos.y;
  for (let i = 0; i < Math.max(1, poses.length); i++) {
    const pose = poses[i];
    let x = pos.x;
    let y = pos.y;
    if (i > 0) {
      const dx = pose.pos.x - poses[i - 1].pos.x;
      const dy = pose.pos.y - poses[i - 1].pos.y;
      const mult = Math.min(2, 5 / Math.max(0.001, Math.hypot(dx, dy)));
      x = previousX + dx * mult;
      y = previousY + dy * mult;
    }
    const alpha = level * (i === 0 ? 1 : (1 - i / poses.length) * 0.2);
    draw(diffuse, x, y, pose?.facingRad ?? facing, alpha, true);
    draw(highlight, x, y, pose?.facingRad ?? facing, alpha, false);
    previousX = x;
    previousY = y;
  }
}
