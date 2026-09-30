import type { Projectile } from '../../simulation/Weapon';
import type { WeaponSimContext } from '../../simulation/systems/weapon/WeaponSimContext';
import { HYPERION_HIT_EFFECT } from '../../content/HyperionIds';
import { hyperionFXTextures } from '../../visual/HyperionFXAssets';
import { Vector2 } from '../../math/Vector2';
import type { WeaponEffectDefinition } from './Types';

/** Cosmetic only, reached by the real shield/hull collision handler.
 * Fixed textured puffs use the ordinary snapshot/expiry path, without RNG or extra damage. */
export const hyperionYamatoHit: WeaponEffectDefinition = {
  id: HYPERION_HIT_EFFECT,
  resources: { textures: hyperionFXTextures },
  hit: (projectile, target, point, shield, _source, ctx) => paintImpact(projectile, point, target.vel, shield, ctx),
  hitEnvironment: (projectile, point, velocity, ctx) => paintImpact(projectile, point, velocity, false, ctx),

};

function paintImpact(projectile: Projectile, point: Vector2, velocity: Vector2, shield: boolean, ctx: WeaponSimContext): void {
    const angle = projectile.facingRad ?? projectile.vel.heading();
    const size = shield ? 210 : 170, duration = 2.25;
    ctx.fx.explosions.push({
      id: projectile.id, visualKind: 'impact', pos: point.clone(),
      radius: size*.3, maxRadius: size, life: duration, maxLife: duration,
      frame: 0, rotation: angle, color: [255, 170, 75],
      hasShockwaveRing: true, shockwaveRadius: 6, maxShockwaveRadius: size,
      puffDuration: .7,
      puffs: [
        { texture: 1, offset: new Vector2(), velocity: velocity.clone(), startSize: size*.6, endSize: size*1.35, rotation: angle },
        { texture: 2, offset: new Vector2(-18, 12).rotate(angle), velocity: velocity.clone(), startSize: size*.45, endSize: size, rotation: angle+.7 },
        { texture: 0, offset: new Vector2(12, -16).rotate(angle), velocity: velocity.clone(), startSize: size*.4, endSize: size*.8, rotation: angle-1.2 },
        { texture: 3, offset: new Vector2(), velocity: velocity.clone(), startSize: 16, endSize: size*2, rotation: angle },
      ],
      flare: { width: size*1.4, height: size*.55, color: shield ? [190,224,255] : [255,200,110], velocity: velocity.clone() },
    });

}
