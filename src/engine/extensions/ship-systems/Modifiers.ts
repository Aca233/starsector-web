import type { SystemModifiers, SystemWeaponModifiers } from './Types';
export const emptySystemModifiers: Readonly<SystemModifiers> = Object.freeze({});
const weaponTypes = ['BALLISTIC', 'ENERGY', 'MISSILE'] as const;
/** Shared composition for the ordinary and defense slots; percentages/flats add and multipliers multiply. */
export function combineSystemModifiers(a: SystemModifiers, b: SystemModifiers): SystemModifiers {
  if (a === emptySystemModifiers && b === emptySystemModifiers) return emptySystemModifiers;
  if (b === emptySystemModifiers) return a;
  if (a === emptySystemModifiers) return b;
  const result = { ...a };
  for (const key in b) {
    if (key === 'weapons' || !Object.hasOwn(b, key)) continue;
    const typedKey = key as Exclude<keyof SystemModifiers, 'weapons'>;
    const value = b[typedKey];
    if (value !== undefined) result[typedKey] = key.endsWith('Multiplier') ? (a[typedKey] ?? 1) * value : (a[typedKey] ?? 0) + value;
  }
  if (a.weapons || b.weapons) {
    result.weapons = { ...a.weapons };
    for (let i = 0; i < weaponTypes.length; i++) {
      const type = weaponTypes[i];
      const bw = b.weapons?.[type];
      const aw = a.weapons?.[type];
      if (!aw && !bw) continue;
      const weapon = { ...aw };
      if (bw) {
        for (const key in bw) {
          if (!Object.hasOwn(bw, key)) continue;
          const typedKey = key as keyof SystemWeaponModifiers;
          const value = bw[typedKey]!;
          weapon[typedKey] = key.endsWith('Multiplier') ? (weapon[typedKey] ?? 1) * value : (weapon[typedKey] ?? 0) + value;
        }
      }
      result.weapons[type] = weapon;
    }
  }
  return result;
}
