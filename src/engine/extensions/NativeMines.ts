import heavy from '../data/generated/mine-spec.json';
import light from '../data/generated/mine-lt-spec.json';
export const nativeMines = { minelayer1: light, minelayer2: heavy } as const;
export type NativeMineWeapon = keyof typeof nativeMines;
export function nativeMineSpec(weapon: NativeMineWeapon = 'minelayer2') { return nativeMines[weapon]; }
