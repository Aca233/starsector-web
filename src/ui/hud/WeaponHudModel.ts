import type { Ship } from '../../engine/simulation/Ship';
import type { WeaponGroup, WeaponMount } from '../../engine/simulation/Weapon';

// User-selected system font needs 15px rows; source used the font's line height.
export const WEAPON_HUD_LINE_HEIGHT = 15;
export interface WeaponHudEntry {
  specId: string;
  mounts: WeaponMount[];
}
export interface WeaponHudGroup {
  group: WeaponGroup;
  arrayIndex: number;
  entries: WeaponHudEntry[];
  height: number;
  shift: number;
}

/** F + weapon-group widget: omit empty groups, stack each distinct weapon type. */
export function buildWeaponHudGroups(ship: Ship): WeaponHudGroup[] {
  const mountsBySlot = new Map(ship.weapons.map(mount => [mount.slotId, mount]));
  const groups: WeaponHudGroup[] = [];
  let shift = 0;
  for (const [arrayIndex, group] of ship.weaponGroups.entries()) {
    const bySpec = new Map<string, WeaponHudEntry>();
    for (const slotId of new Set(group.weaponSlotIds)) {
      const mount = mountsBySlot.get(slotId);
      if (!mount) continue;
      let entry = bySpec.get(mount.spec.id);
      if (!entry) { entry = { specId: mount.spec.id, mounts: [] }; bySpec.set(mount.spec.id, entry); }
      entry.mounts.push(mount);
    }
    if (bySpec.size === 0) continue;
    const height = bySpec.size * WEAPON_HUD_LINE_HEIGHT * 2;
    groups.push({ group, arrayIndex, entries: [...bySpec.values()], height, shift });
    shift += height * 0.5;
  }
  return groups;
}

export function weaponHudHeight(groups: WeaponHudGroup[]): number {
  return WEAPON_HUD_LINE_HEIGHT + 3 + groups.reduce((sum, group) => sum + group.height, 0);
}
