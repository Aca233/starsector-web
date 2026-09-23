import type { CombatDisplayShip as Ship } from '../engine/runtime/CombatDisplayReads';
import type { WeaponMount } from '../engine/simulation/Weapon';
import { WEAPON_FLAGS, WEAPON_NUMBERS, WEAPON_PHASES } from './WeaponPresentationState.mjs';
import type { WeaponStateRow, WeaponStateShips } from './WeaponPresentationState.mjs';
const fields = [...WEAPON_FLAGS, ...WEAPON_NUMBERS, 'firingState'];
function own(object: unknown, key: string): unknown {
  if (!object || typeof object !== 'object') throw Error('Non-data weapon object');
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor || !('value' in descriptor)) throw Error('Non-data weapon field');
  return descriptor.value;
}
export function captureWeaponPresentation(ships: readonly Ship[]): WeaponStateShips {
  return ships.map(ship => [ship.id, ship.weapons.map(weapon => {
    let flags = 0;
    for (let i = 0; i < WEAPON_FLAGS.length; i++) {
      const value = own(weapon, WEAPON_FLAGS[i]!); if (typeof value !== 'boolean') throw Error('Invalid weapon flag');
      if (value) flags |= 1 << i;
    }
    const permanent = Object.getOwnPropertyDescriptor(weapon, 'isPermanentlyDisabled');
    if (permanent && (!('value' in permanent) || permanent.value !== undefined && typeof permanent.value !== 'boolean')) throw Error('Invalid permanent disable');
    return [own(weapon, 'slotId'), own(own(weapon, 'spec'), 'id'), flags, WEAPON_PHASES.indexOf(own(weapon, 'firingState') as WeaponMount['firingState']),
      permanent ? (permanent.value === undefined ? 3 : permanent.value ? 2 : 1) : 0, ...WEAPON_NUMBERS.map(field => own(weapon, field))] as WeaponStateRow;
  })]);
}
/** No spawn, fire, damage, repair, ammo tracker update or RNG consumption. */
export function applyWeaponPresentation(known: ReadonlyMap<string, Ship>, ships: WeaponStateShips) {
  for (const [id, rows] of ships) {
    const ship = known.get(id); if (!ship) continue;
    const weapons = new Map<string, WeaponMount | null>();
    for (const weapon of ship.weapons) {
      const slot = Object.getOwnPropertyDescriptor(weapon, 'slotId');
      if (!slot || !('value' in slot) || typeof slot.value !== 'string') continue;
      weapons.set(slot.value, weapons.has(slot.value) ? null : weapon);
    }
    for (const row of rows) {
      const weapon = weapons.get(row[0]); if (!weapon) continue;
      const spec = Object.getOwnPropertyDescriptor(weapon, 'spec');
      if (!spec || !('value' in spec) || !spec.value || typeof spec.value !== 'object') continue;
      const specId = Object.getOwnPropertyDescriptor(spec.value, 'id');
      if (!specId || !('value' in specId) || specId.value !== row[1]) continue;
      // A customized accessor/readonly object is not a native replica target.
      // Check the entire row BEFORE writing any of it; never invoke setters.
      if (fields.some(field => { const d = Object.getOwnPropertyDescriptor(weapon, field); return !d || !('value' in d) || !d.writable; })) continue;
      const permanent = Object.getOwnPropertyDescriptor(weapon, 'isPermanentlyDisabled');
      if (permanent && (!('value' in permanent) || (row[4] === 0 ? !permanent.configurable : !permanent.writable))) continue;
      if (!permanent && row[4] !== 0 && !Object.isExtensible(weapon)) continue;
      const target = weapon as unknown as Record<string, unknown>;
      for (let i = 0; i < WEAPON_FLAGS.length; i++) target[WEAPON_FLAGS[i]!] = !!(row[2] & (1 << i));
      for (let i = 0; i < WEAPON_NUMBERS.length; i++) target[WEAPON_NUMBERS[i]!] = row[5 + i];
      weapon.firingState = WEAPON_PHASES[row[3]]!;
      if (row[4] === 0) delete weapon.isPermanentlyDisabled;
      else if (permanent) weapon.isPermanentlyDisabled = row[4] === 3 ? undefined : row[4] === 2;
      else Object.defineProperty(weapon, 'isPermanentlyDisabled', {value: row[4] === 3 ? undefined : row[4] === 2, writable: true, configurable: true, enumerable: true});
    }
  }
}
