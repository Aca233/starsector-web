import type { ShipSpec } from '../engine/content/ShipSpec';
import type { WeaponSpec } from '../engine/simulation/Weapon';
import type { WeaponSize } from '../engine/content/WeaponSizes';
import { weaponFitsSlotType } from '../engine/content/WeaponCompatibility';

/** Historical migration data, not a second current weapon catalogue. */
const previousWeaponTier: Readonly<Record<string, WeaponSize>> = {
  web_gloriana_macro: 'LARGE', web_gloriana_lance: 'LARGE',
  web_gloriana_siege: 'MEDIUM', web_gloriana_torpedo: 'MEDIUM',
  web_gloriana_bolter: 'SMALL', web_gloriana_interceptor: 'SMALL',
};
const promoted: Partial<Record<WeaponSize, WeaponSize>> = { SMALL: 'MEDIUM', MEDIUM: 'LARGE', LARGE: 'EXTRA_LARGE' };
const oldSlotTier: Readonly<Record<string, WeaponSize>> = { S: 'SMALL', M: 'MEDIUM', L: 'LARGE' };
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Read-only repair of ONLY fits made invalid by the 2026-09-29 tier promotion.
 * Never replaces equipment, rewrites IDs, relaxes compatibility or persists a save.
 * The library caller must back up its exact original bytes before enabling autosave.
 * Other corrupt data stays corrupt and is rejected by the normal decoder. */
export function migrateGlorianaWeaponTiers(value: unknown,
  getHull: (id: string) => ShipSpec | undefined,
  getWeapon: (id: string) => WeaponSpec | undefined,
): { value: unknown; removed: number } {
  let visited = 0;
  function visit(input: unknown, depth: number): { value: unknown; removed: number } {
    if (depth > 8 || ++visited > 128) throw new Error('模块编组超过限制。');
    if (!record(input) || typeof input.hullId !== 'string') return { value: input, removed: 0 };
    const hull = getHull(input.hullId);
    let result = input, removed = 0;
    if (hull && record(input.weapons)) {
      const weapons = { ...input.weapons }, emptied = new Set<string>();
      const queenHull = /^web_gloriana(?:_[ps][123]|_e[ps])?$/.test(input.hullId);
      for (const slot of hull.weaponSlots) {
        const id = weapons[slot.slotId];
        const weapon = typeof id === 'string' ? getWeapon(id) : undefined;
        if (!weapon || weapon.mountSize === slot.slotSize
          || !weaponFitsSlotType(slot.weaponType, weapon)) continue;
        const oldWeapon = Object.hasOwn(previousWeaponTier, weapon.id) ? previousWeaponTier[weapon.id] : undefined;
        const oldSlot = queenHull ? oldSlotTier[slot.slotId[0]] : undefined;
        const weaponPromoted = oldWeapon !== undefined && promoted[oldWeapon] === weapon.mountSize;
        const slotPromoted = oldSlot !== undefined && promoted[oldSlot] === slot.slotSize;
        // Check the PREVIOUS pair, not the new slot against the old weapon. Otherwise
        // an already-illegal L gun in a former M queen slot could be silently repaired.
        const previousWeaponSize = weaponPromoted ? oldWeapon : weapon.mountSize;
        const previousSlotSize = slotPromoted ? oldSlot : slot.slotSize;
        if ((!weaponPromoted && !slotPromoted) || previousWeaponSize !== previousSlotSize) continue;
        weapons[slot.slotId] = null;
        emptied.add(slot.slotId);
      }
      if (emptied.size) {
        removed += emptied.size;
        result = { ...result, weapons };
        if (Array.isArray(input.groups)) result.groups = input.groups.map(group =>
          record(group) && Array.isArray(group.weaponSlotIds)
            ? { ...group, weaponSlotIds: group.weaponSlotIds.filter(id => !emptied.has(id as string)) } : group);
      }
    }
    if (record(input.modules)) {
      const children = Object.entries(input.modules).map(([id, child]) => {
        const changed = visit(child, depth + 1); removed += changed.removed;
        return [id, changed.value] as const;
      });
      if (children.some(([id, child]) => child !== (input.modules as Record<string, unknown>)[id]))
        result = { ...result, modules: Object.fromEntries(children) };
    }
    return { value: result, removed };
  }
  return visit(value, 0);
}
