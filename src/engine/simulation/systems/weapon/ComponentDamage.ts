import { Vector2 } from '../../../math/Vector2';
import type { Ship } from '../../Ship';
import type { DamageResult } from '../../ArmorGrid';

/** Ship.applyDamageInner / ship/new.buildComponentMap: the nine inner cells get
 * half of actual armor+hull+EMP, the twelve outer cross cells get one quarter.
 * HIDDEN weapons are not damageable in native weapon classes; decorative slots
 * are already excluded by the Web importer. Engine immunity is enforced by the target engine controller. */
export function applyComponentDamage(ship: Ship, local: Vector2, result: Pick<DamageResult, 'armorDamage' | 'hullDamage'>,
  emp: number, source?: Ship): void {
  const damage = result.armorDamage + result.hullDamage + emp * ship.effectiveEmpDamageTakenMultiplier;
  if (!(damage > 0)) return;
  const impact = ship.armor.localToGrid(local);
  const weight = (point: Vector2) => {
    const cell = ship.armor.localToGrid(point), dx = Math.abs(cell.c - impact.c), dy = Math.abs(cell.r - impact.r);
    return dx > 2 || dy > 2 || (dx === 2 && dy === 2) ? 0 : dx <= 1 && dy <= 1 ? .5 : .25;
  };
  const weaponDamage = damage * ship.weaponDamageTakenMultiplier * (source?.damageToTargetWeaponsMultiplier ?? 1);
  const engineDamage = damage * ship.engineDamageTakenMultiplier * (source?.damageToTargetEnginesMultiplier ?? 1);
  for (const mount of ship.weapons) {
    if (mount.mountType !== 'HIDDEN') ship.weaponControl.damageComponent(mount, weaponDamage * weight(mount.relativePos));
  }
  ship.spec.engineSlots?.forEach((slot, index) => ship.damageEngineComponent(index, engineDamage * weight(new Vector2(slot.x, slot.y))));
}
