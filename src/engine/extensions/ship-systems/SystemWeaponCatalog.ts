import data from './native-system-projectiles.json';
import type { WeaponSpec } from '../../simulation/Weapon';
/** Source SYSTEM weapons live outside the installable weapon registry. No ballistic/energy/missile refit bonuses. */
export function systemWeaponSpec(id: string): WeaponSpec | undefined { return (data as unknown as Record<string,WeaponSpec>)[id]; }
