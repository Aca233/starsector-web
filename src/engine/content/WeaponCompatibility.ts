import type { WeaponSpec } from '../simulation/Weapon';

const families: Record<string, readonly string[]> = {
  BALLISTIC: ['BALLISTIC'], ENERGY: ['ENERGY'], MISSILE: ['MISSILE'],
  HYBRID: ['BALLISTIC', 'ENERGY'], COMPOSITE: ['BALLISTIC', 'MISSILE'],
  SYNERGY: ['ENERGY', 'MISSILE'], UNIVERSAL: ['BALLISTIC', 'ENERGY', 'MISSILE'],
};

/** Native mounting category is distinct from damage/stat family (e.g. hybrid energy guns). */
export function weaponFitsSlotType(slotType: string | undefined, weapon: Pick<WeaponSpec, 'weaponType' | 'mountTypeOverride'>): boolean {
  if (!slotType || slotType === 'UNIVERSAL' || slotType === 'BUILT_IN') return true;
  const category = weapon.mountTypeOverride ?? weapon.weaponType;
  if (!category) return true; // Legacy custom specs may leave family unspecified; callers validate availability separately.
  return (families[slotType] ?? []).some(type => (families[category] ?? []).includes(type));
}
