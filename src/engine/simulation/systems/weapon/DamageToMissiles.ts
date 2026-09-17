import type { WeaponSimContext } from './WeaponSimContext';
import type { Ship } from '../../Ship';
import type { Projectile } from '../../Weapon';
/** Target-specific bonus: do not inflate the projectile's damage against ships or asteroids. */
export function damageToMissiles(damage: number, sourceShipId: string, ctx: WeaponSimContext, emitter?: Ship, target?: Projectile): number {
  const source = emitter ?? (ctx.ships ?? [ctx.playerShip, ctx.enemyShip, ...ctx.fighters]).find(s => s.id === sourceShipId);
  if (target?.isFighterDecoy) return damage * (1 + ((source?.hullStats.damageToFightersPercent ?? 0) + (source?.spec.captainSkills?.point_defense ? 50 : 0)) / 100) * (source?.hullStats.damageToFightersMultiplier ?? 1);
  return damage * (1 + (source?.hullStats.damageToMissilesPercent ?? 0) / 100) * (source?.hullStats.damageToMissilesMultiplier ?? 1);
}
