import type { Ship } from '../../Ship';
import type { WeaponSpec, Projectile } from '../../Weapon';
import type { Vector2 } from '../../../math/Vector2';
import type { WeaponSimContext } from './WeaponSimContext';

// Retain the emitter while its projectile lives, even after a dead fighter leaves the roster.
// Weak keys avoid leaks and do not put cyclic Ship graphs into network snapshots.
const emitters = new WeakMap<Projectile, Ship>();
export function bindProjectileSource<T extends Projectile>(p: T, source: Ship | undefined): T {
  if (source) emitters.set(p, source);
  return p;
}
export function projectileSource(p: Projectile, ctx: WeaponSimContext): Ship | undefined {
  const source = emitters.get(p) ?? (ctx.ships ?? [ctx.playerShip, ctx.enemyShip, ...ctx.fighters]).find(s => s.id === p.sourceShipId);
  if (source) emitters.set(p, source);
  return source;
}
/** Hit-time native damage listeners, separate from launch-time weapon/CR/system stats.
 * Damage type is deliberately NOT used: kinetic damage from an energy weapon still qualifies.
 * No EMP scaling, and no mutation of a projectile that can subsequently hit a different target. */
export function outgoingDamageMultiplier(source: Ship | undefined, target: Ship | undefined,
  weaponType: WeaponSpec['weaponType'], from: Vector2 | undefined, point: Vector2): number {
  if (!source) return 1;
  const skills = source.spec.captainSkills;
  const size = target?.spec.hullSize;
  let mult = size === 'FIGHTER' && skills?.point_defense ? 1.5 : 1;
  const analysis = skills?.target_analysis;
  if (analysis) mult *= size === 'CAPITAL_SHIP' ? 1.2 : size === 'CRUISER' ? 1.15
    : analysis === 2 && size === 'DESTROYER' ? 1.1 : analysis === 2 && size === 'FRIGATE' ? 1.05 : 1;
  if (skills?.energy_weapon_mastery && weaponType === 'ENERGY' && from) {
    const distanceFactor = Math.max(0, Math.min(1, (1000 - from.distanceTo(point)) / 400));
    mult *= 1 + .3 * Math.max(0, Math.min(1, source.flux.totalFlux / source.flux.maxFlux)) * distanceFactor;
  }
  return mult;
}
export function projectileOutgoingMultiplier(p: Projectile, target: Ship | undefined, point: Vector2, ctx: WeaponSimContext): number {
  const source = projectileSource(p, ctx);
  const weaponType = p.sourceWeaponType ?? source?.weapons.find(w => w.slotId === p.slotId)?.spec.weaponType;
  return outgoingDamageMultiplier(source, target, weaponType, p.spawnLocation, point);
}
