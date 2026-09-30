/** Three native sizes plus the opt-in Web extra-large extension. Stable serialized IDs. */
export const WEAPON_SIZES = ['SMALL', 'MEDIUM', 'LARGE', 'EXTRA_LARGE'] as const;
export type WeaponSize = typeof WEAPON_SIZES[number];
export type NativeWeaponSize = Exclude<WeaponSize, 'EXTRA_LARGE'>;
export const WEAPON_SIZE_RANK: Readonly<Record<WeaponSize, number>> = { SMALL: 1, MEDIUM: 2, LARGE: 3, EXTRA_LARGE: 4 };
export const WEAPON_SIZE_LABELS: Readonly<Record<WeaponSize, string>> = { SMALL: '小型', MEDIUM: '中型', LARGE: '大型', EXTRA_LARGE: '超大型' };
export const WEAPON_SIZE_MARKERS: Readonly<Record<WeaponSize, string>> = { SMALL: 'I', MEDIUM: 'II', LARGE: 'III', EXTRA_LARGE: 'IV' };
/** Fallback only; actual authored sprite dimensions/pivots are never auto-scaled by tier. */
export const WEAPON_SIZE_FALLBACK_PIXELS: Readonly<Record<WeaponSize, number>> = { SMALL: 24, MEDIUM: 42, LARGE: 68, EXTRA_LARGE: 96 };
export function isWeaponSize(value: unknown): value is WeaponSize {
  return typeof value === 'string' && Object.hasOwn(WEAPON_SIZE_RANK, value);
}
/** Web refit rule: exact tier only; size ranking is for display/stats, not down-fitting. */
export function weaponFitsSlotSize(slotSize: unknown, weaponSize: unknown): boolean {
  return isWeaponSize(slotSize) && isWeaponSize(weaponSize) && weaponSize === slotSize;
}
/** Explicit conservative baseline for component HP/repair/audio, not a downgrade of slot identity.
 * XL damage, range, OP and flux are authored per weapon, never inferred from this adapter. */
export function weaponSizeBaseline(size: WeaponSize): NativeWeaponSize {
  return size === 'EXTRA_LARGE' ? 'LARGE' : size;
}
