import type { WeaponSpec } from '../simulation/Weapon';
import heavy from '../data/generated/mine-spec.json';
import light from '../data/generated/mine-lt-spec.json';
export const nativeMines = { minelayer1: light, minelayer2: heavy } as const;
export type NativeMineWeapon = keyof typeof nativeMines;
export function nativeMineSpec(weapon: NativeMineWeapon = 'minelayer2') { return nativeMines[weapon]; }

/** Internal adapter for retained hullmod projectiles; never registered as a selectable weapon. */
export function nativeMinePayload(weapon: NativeMineWeapon): WeaponSpec {
  const spec = nativeMineSpec(weapon);
  return { id: spec.id, nameKey: 'effect.mine', weaponType: 'MISSILE', mountSize: 'MEDIUM', type: 'HIGH_EXPLOSIVE',
    isBeam: false, spawnType: 'MISSILE', damagePerShot: spec.damage, damagePerSecond: spec.damage / 3, fluxPerShot: 0,
    range: 1000, refireDelay: 3, projSpeed: spec.speed, projRadius: spec.collisionRadius,
    color: spec.glowColor.slice(0, 3) as [number, number, number], launchSpeed: spec.speed, flightTime: 20, missileHp: spec.hitpoints };
}
