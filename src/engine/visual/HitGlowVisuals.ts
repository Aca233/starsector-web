import { Vector2 } from '../math/Vector2';
import type { DamageType } from '../simulation/ArmorGrid';
import type { HitGlowAnimation } from '../simulation/CombatTypes';
import type { Projectile } from '../simulation/Weapon';
import type { SimulationRandom } from '../simulation/SimulationRandom';
import { hitParticleDuration } from './ExplosionVisuals';

/** Resolved damage, not the incoming shot's nominal damage. */
export interface HitGlowDamageResult {
  shieldDamage?: number;
  armorDamage?: number;
  hullDamage?: number;
  empDamage?: number;
}

/** Ship.applyDamageInner's shield result including its over-cap conversion.
 * This is visual bookkeeping only; it must not change flux or overload mechanics.
 */
export function shieldHitGlowDamage(fluxGain: number, fluxRoom: number, efficiency: number): number {
  const overMax = Math.max(0, fluxGain - Math.max(0, fluxRoom));
  return efficiency > 0 ? fluxGain - overMax / efficiency + overMax : fluxGain;
}

/** Misc.getHitGlowSize, including the type-specific normalization and EMP ceiling. */
export function hitGlowSize(baseSize: number, baseDamage: number, type: DamageType, result?: HitGlowDamageResult): number {
  if (!result || baseDamage <= 0 || baseSize <= 0) return baseSize;
  let sd = result.shieldDamage ?? 0;
  let ad = result.armorDamage ?? 0;
  let hd = result.hullDamage ?? 0;
  let minBonus = 0;
  if (type === 'KINETIC') sd *= 0.5;
  else if (type === 'HIGH_EXPLOSIVE') {
    ad *= 0.5;
    if (ad > 0) minBonus = 0.1;
  } else if (type === 'FRAGMENTATION') {
    if (hd > 0) minBonus = 0.2 * hd / (hd + ad);
    sd *= 2; ad *= 2; hd *= 2;
  }
  let total = sd + ad + hd;
  if (total <= 0) return baseSize;
  if (total < baseDamage) total = Math.min(baseDamage, total + (result.empDamage ?? 0));
  const minMult = Math.min(1, Math.max(15 / baseSize, 0.67 + minBonus));
  return baseSize * Math.min(1.5, Math.max(minMult, total / baseDamage));
}

/** BallisticProjectile/MovingRay/Missile -> ship/A/class -> addHitParticle.
 * Each returned entry is ONE constant-diameter, linear-fading hit_glow sprite.
 * Source color alpha is replaced by brightness, not multiplied by it.
 */
export function createProjectileHitGlows(projectile: Projectile, pos: Vector2, targetVelocity: Vector2,
  result: HitGlowDamageResult, random: SimulationRandom): HitGlowAnimation[] {
  const missile = projectile.isRocket || projectile.spawnType === 'MISSILE';
  const missileSpec = projectile.missileExplosionVisualSpec;
  if (missile && (!missileSpec || missileSpec.useHitGlowWhenDealingDamage === false)) return [];
  let base = missile ? missileSpec!.radius : (projectile.hitGlowRadius ?? 0);
  if (!missile && base === 0) {
    base = (projectile.projLength ?? 0) * (projectile.spawnType === 'BALLISTIC_AS_BEAM' ? 0.5 : 2);
  }
  if (!(base > 0)) return [];
  if (!missile) base *= 1 + random.next() * 0.5;
  const size = hitGlowSize(base, projectile.baseDamage ?? projectile.damage, projectile.damageType, result);
  const fringe = missile ? missileSpec!.color : (projectile.fringeColor ?? projectile.color);
  const color: [number, number, number] = [fringe[0], fringe[1], fringe[2]];
  // The Web currently consumes direct-hit projectiles at full strength; native fade/pass-through
  // damage multipliers remain separate work. CR/stat modifiers are NOT particle brightness.
  const make = (diameter: number, brightness: number, rgb: [number, number, number]): HitGlowAnimation => {
    const life = hitParticleDuration(diameter);
    return { id: random.next(), pos: pos.clone(), vel: targetVelocity.clone(), diameter,
      life, maxLife: life, peakAlpha: Math.trunc(255 * brightness) / 255, color: rgb };
  };
  return [make(size * (missile ? 2 : 3), missile ? 1 : 0.4, color), make(size * 0.5, 1, [255, 255, 255])];
}
