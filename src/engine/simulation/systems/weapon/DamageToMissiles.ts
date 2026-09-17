import type { WeaponSimContext } from './WeaponSimContext';
import type { Ship } from '../../Ship';
/** Target-specific bonus: do not inflate the projectile's damage against ships or asteroids. */
export function damageToMissiles(damage: number, sourceShipId: string, ctx: WeaponSimContext, emitter?: Ship): number {
  const source = emitter ?? (ctx.ships ?? [ctx.playerShip, ctx.enemyShip, ...ctx.fighters]).find(s => s.id === sourceShipId);
  return damage * (1 + (source?.hullStats.damageToMissilesPercent ?? 0) / 100);
}
