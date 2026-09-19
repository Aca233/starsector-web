import type { Ship } from '../../simulation/Ship';
import type { SystemWeaponType } from './Types';
import type { ShipSpec } from '../../content/ShipSpec';
import { effectiveHullStats } from '../HullMods';
export const needsLaunchers = (spec: ShipSpec): string | undefined => spec.systemWeaponSlots?.length ? undefined : '需要专用 SYSTEM 发射挂点';
export const needsWings = (spec: ShipSpec): string | undefined => effectiveHullStats(spec).fighterBays > 0 && spec.fighterWings?.length ? undefined : '需要已装配的舰载机联队';
export const needsShield = (spec: ShipSpec): string | undefined => ['FRONT', 'OMNI'].includes(effectiveHullStats(spec).shieldType) ? undefined : '需要常规护盾（不能使用相位潜航替代）';

/** Runtime loadout, not hull defaults: refitting and disabled/empty weapons matter. */
export function usableWeaponReason(ship: Ship, type: SystemWeaponType, missing: string): string | undefined {
  const weapons = ship.weapons.filter(w => w.spec.weaponType === type);
  if (!weapons.length) return missing;
  return weapons.some(w => !w.isDisabled && w.ammo !== 0) ? undefined : '对应武器已失效或弹药耗尽';
}
