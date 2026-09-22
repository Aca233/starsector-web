import type { WeaponMount } from '../simulation/Weapon';
/** Display-only hull-relative angle. Never serialized or used by combat aiming. */
const angles = new WeakMap<object, number>();
export const weaponPresentationAngle = (mount: object, hullFacing: number): number | undefined => {
  const relative = angles.get(mount);
  return relative === undefined ? undefined : hullFacing + relative;
};
export function setWeaponPresentationAngle(mount: WeaponMount, relative: number | null): void {
  if (relative === null) angles.delete(mount); else angles.set(mount, relative);
}
