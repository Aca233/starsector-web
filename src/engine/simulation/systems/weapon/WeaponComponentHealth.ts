import type { ComponentMalfunctionPolicy } from '../ComponentHealth';
import type { WeaponMount, WeaponMountType, WeaponSlotSize } from '../../Weapon';
import type { SimulationRandom } from '../../SimulationRandom';

import { advanceComponentHealth, createComponentHealthTracker } from '../ComponentHealth';
export type { ComponentHealthTracker as WeaponHealthTracker } from '../ComponentHealth';
export const createWeaponHealthTracker = createComponentHealthTracker;

/** ship/super: size refers to the installed weapon, not the size of its slot.
 * nullsuper.isHardpoint confirms the second HP doubling and extra five seconds. */
export function weaponHealthProfile(size: WeaponSlotSize, mountType: WeaponMountType, healthMultiplier = 1) {
  const hardpoint = mountType === 'HARDPOINT';
  const health = (size === 'LARGE' ? 800 : size === 'MEDIUM' ? 500 : 250) * (hardpoint ? 2 : 1) * healthMultiplier;
  const repairDuration = (size === 'LARGE' ? 20 : size === 'MEDIUM' ? 15 : 10) + (hardpoint ? 5 : 0);
  return { health, repairDuration };
}

function trackerFor(mount: WeaponMount, random: SimulationRandom): ReturnType<typeof createComponentHealthTracker> {
  // Hand-authored visual-lab/mod mounts can omit tracker state; native mounts
  // create it at installation so their interval runs even while at full health.
  return mount.healthTracker ??= createWeaponHealthTracker(weaponHealthProfile(mount.spec.mountSize, mount.mountType).repairDuration, random);
}

export function damageWeaponComponent(mount: WeaponMount, damage: number, random: SimulationRandom): void {
  if (mount.mountType === 'HIDDEN' || mount.isDisabled || mount.isPermanentlyDisabled || !(damage > 0)) return;
  const tracker = trackerFor(mount, random);
  mount.health = Math.max(0, mount.health - damage);
  tracker.hitAgo = 0;
  // Zero HP does not itself disable the weapon: the interval below owns that.
}

/** Explicit disable/malfunction bypasses the periodic zero-HP check. */
export function disableWeaponComponent(mount: WeaponMount, random: SimulationRandom, permanent = false): boolean {
  const tracker = trackerFor(mount, random);
  const newlyDisabled = !mount.isDisabled;
  mount.isPermanentlyDisabled ||= permanent;
  mount.isDisabled = true;
  mount.health = 0;
  mount.disabledDuration = tracker.repairDuration;
  mount.disabledTimer = mount.isPermanentlyDisabled ? Number.POSITIVE_INFINITY : tracker.repairDuration;
  return newlyDisabled;
}

export function advanceWeaponComponent(mount: WeaponMount, amount: number, random: SimulationRandom,
  canRepair: boolean, repairTimeMultiplier = 1, canRepairUnderFire = false, malfunction?: ComponentMalfunctionPolicy): { disabled: boolean; repaired: boolean } {
  if (mount.isPermanentlyDisabled) return { disabled: false, repaired: false };
  const tracker = trackerFor(mount, random);
  const event = advanceComponentHealth(mount, tracker, amount, random, {
    canRepair, repairTimeMultiplier, canRepairUnderFire, malfunction,
    disable: () => disableWeaponComponent(mount, random)
  });
  mount.disabledDuration = tracker.repairDuration;
  // This base-time getter matches the source health tracker's remaining-time API.
  mount.disabledTimer = mount.isPermanentlyDisabled ? Number.POSITIVE_INFINITY : mount.isDisabled ? (mount.maxHealth - mount.health) / mount.maxHealth * tracker.repairDuration : 0;
  return event;
}
