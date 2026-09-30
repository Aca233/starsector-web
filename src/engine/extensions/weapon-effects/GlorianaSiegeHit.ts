import type { Projectile } from '../../simulation/Weapon';
import type { WeaponSimContext } from '../../simulation/systems/weapon/WeaponSimContext';
import { Vector2 } from '../../math/Vector2';
import type { WeaponEffectDefinition } from './Types';

export const GLORIANA_SIEGE_HIT_EFFECT = 'web_gloriana_siege_impact';
/** Small contact burst, not missile splash. The collision pipeline already owns damage,
 * armor sparks and debris; never duplicate them here or produce hull fire on a shield. */
export const glorianaSiegeHit: WeaponEffectDefinition = {
  id: GLORIANA_SIEGE_HIT_EFFECT,
  resources: { textures: [
    '/game-assets/graphics/fx/explosion1.png',
    '/game-assets/graphics/fx/explosion2.png',
    '/game-assets/graphics/fx/hit_glow.png',
  ] },
  hit: (projectile, target, point, shield, _source, ctx) => paintImpact(projectile, point, target.vel, shield, ctx),
  hitEnvironment: (projectile, point, velocity, ctx) => paintImpact(projectile, point, velocity, false, ctx),

};

function paintImpact(projectile: Projectile, point: Vector2, velocity: Vector2, shield: boolean, ctx: WeaponSimContext): void {
    if (shield) return;
    const angle = projectile.facingRad ?? projectile.vel.heading();
    const outward = Vector2.fromAngle(angle + Math.PI);
    const drift = velocity.clone().addScaled(outward, 22);
    const duration = .38;
    ctx.fx.explosions.push({
      id: projectile.id, visualKind: 'impact', pos: point.clone(),
      radius: 18, maxRadius: 52, life: duration, maxLife: duration,
      frame: 0, rotation: angle, color: [235, 165, 95],
      hasShockwaveRing: false, shockwaveRadius: 0, maxShockwaveRadius: 0,
      puffDuration: duration,
      puffs: [
        {texture: 2, offset: new Vector2(), velocity: velocity.clone(), startSize: 34, endSize: 68, rotation: angle},
        {texture: 1, offset: new Vector2(-8, -6).rotate(angle), velocity: drift, startSize: 22, endSize: 76, rotation: angle+.8},
        {texture: 1, offset: new Vector2(-5, 9).rotate(angle), velocity: velocity.clone().addScaled(outward, 35), startSize: 18, endSize: 57, rotation: angle-1.1},
      ],
      flash: {diameter: 88, coreDiameter: 26, color: [255, 220, 165], duration: .065, velocity: velocity.clone()},
    });

}
