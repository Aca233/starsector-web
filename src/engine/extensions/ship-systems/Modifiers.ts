import type { SystemModifiers, SystemWeaponModifiers } from './Types';
/** Shared composition for the ordinary and defense slots; percentages/flats add and multipliers multiply. */
export function combineSystemModifiers(a: SystemModifiers, b: SystemModifiers): SystemModifiers {
  const result = { ...a };
  for (const key of Object.keys(b) as (keyof SystemModifiers)[]) {
    if (key === 'weapons') continue;
    const value = b[key];
    if (value !== undefined) result[key] = key.endsWith('Multiplier') ? (a[key] ?? 1) * value : (a[key] ?? 0) + value;
  }
  result.weapons = { ...a.weapons };
  for (const type of ['BALLISTIC', 'ENERGY', 'MISSILE'] as const) {
    const weapon = { ...a.weapons?.[type] };
    for (const key of Object.keys(b.weapons?.[type] ?? {}) as (keyof SystemWeaponModifiers)[]) {
      const value = b.weapons![type]![key]!;
      weapon[key] = key.endsWith('Multiplier') ? (weapon[key] ?? 1) * value : (weapon[key] ?? 0) + value;
    }
    result.weapons[type] = weapon;
  }
  return result;
}
