import type { Ship } from '../Ship';
import type { WeaponMount } from '../Weapon';

/** Web tracker representation of the native non-idle firing lifecycle. */
export function weaponIsInFiringCycle(mount: WeaponMount): boolean {
  return !mount.isDisabled && mount.mountType !== 'HIDDEN' &&
    (mount.firingState !== 'IDLE' || mount.burstRemaining > 0 || mount.cooldownTimer > 0);
}

/** CRPluginImpl.isOkToPermanentlyDisableStatic, for supported Web weapon slots.
 * Non-ammo weapons represent the native unbounded ammo counts with Infinity. */
export function canPermanentlyDisableWeapon(ship: Ship, mount: WeaponMount): boolean {
  if (mount.mountType === 'HIDDEN') return false;
  if (ship.currentCR <= 0) return true;
  return ship.weapons.some(other => other !== mount && !other.isPermanentlyDisabled && other.mountType !== 'HIDDEN' &&
    other.ammo > 0 && ((other.spec.maxAmmo ?? Number.POSITIVE_INFINITY) > 20 || (other.spec.ammoRegenPerSec ?? 0) > 0));
}

export type ComponentMalfunctionTarget = { kind: 'weapon'; mount: WeaponMount } | { kind: 'engine'; index: number };

/** Ship.applyCriticalMalfunction's permanent weapon side effects, shared by both schedulers. */
export function finalizePermanentWeaponMalfunction(ship: Ship, mount: WeaponMount): void {
  if (Number.isFinite(mount.ammo)) mount.ammo = 0;
  for (const group of ship.weaponGroups) group.weaponSlotIds = group.weaponSlotIds.filter(id => id !== mount.slotId);
}
