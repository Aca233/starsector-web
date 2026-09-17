import type { Ship } from '../Ship';
import type { Projectile } from '../Weapon';
import type { SimulationRandom } from '../SimulationRandom';
/** DamagingExplosionSpec.explosionSpecForShip; independent of cosmetic blast size. */
export function shipExplosionPayload(ship: Ship, random: SimulationRandom): Projectile | undefined {
  if (ship.spec.hullSize === 'FIGHTER') return undefined;
  const core = ship.spec.collisionRadius;
  const damage = ship.flux.maxFlux * (.5 + .5 * random.next()) * ship.hullStats.explosionDamageMultiplier;
  if (!(damage > 0)) return undefined;
  return { id: random.next(), specId: 'ship_explosion', sourceShipId: ship.id, isPlayer: ship.isPlayer, teamId: ship.teamId, isHullExplosion: true,
    pos: ship.pos.clone(), prevPos: ship.pos.clone(), vel: ship.vel.clone(), damage, baseDamage: damage,
    damageType: 'HIGH_EXPLOSIVE', radius: 0, elapsedTime: 0, rangeRemaining: 0, totalRange: 0, color: [255,255,255],
    projectileExplosionSpec: { duration: .1, radius: core + Math.min(200,core) * ship.hullStats.explosionRadiusMultiplier,
      coreRadius: core, minDamageFraction: 0, collisionClass: 'HITS_SHIPS_AND_ASTEROIDS',
      particleSizeMin: 10, particleSizeRange: 10,
      particleDuration: 1, particleCount: 0, particleColor: [255,255,255,255], explosionColor: [255,255,255,255] } };
}
