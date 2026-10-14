import type { Ship } from '../Ship';
type VisibleContact = Pick<Ship,'id'|'teamId'|'isDead'|'isRetreated'|'isDocked'|'isSystemDrone'|'spec'|'flightDeckWingId'|'pos'|'sightRadius'>;
const teamNumber = (side: number | boolean) => typeof side === 'boolean' ? (side ? 0 : 1) : side;
/** Observer grouping remains available to existing HUD/map readers, not a range limit. */
export function combatObservers<T extends VisibleContact>(ships: readonly T[], side: number | boolean): T[] {
  const team = teamNumber(side), wings = new Set<string>();
  return ships.filter(ship => {
    if (ship.teamId !== team || ship.isDead || ship.isRetreated || ship.isDocked || ship.isSystemDrone) return false;
    if (ship.spec.hullSize !== 'FIGHTER' || !ship.flightDeckWingId) return true;
    if (wings.has(ship.flightDeckWingId)) return false;
    wings.add(ship.flightDeckWingId); return true;
  });
}
/** Web combat is public at every distance (user request, 2026-09-30).
 * Keep the legacy arguments for snapshot/map callers; none enables sensor gating. */
export function contactVisible(ship: VisibleContact, _observers: readonly VisibleContact[], _side: number | boolean, _revealAll = true): boolean {
  return !ship.isDead && !ship.isRetreated && !ship.isDocked;
}
export function updateCombatVisibility(ships: readonly Ship[], _revealAll = true): void {
  for (const ship of ships) {
    const visible = contactVisible(ship, [], 0);
    ship.visibilityMask = visible ? 0x7fffffff : 0;
    // Include high-numbered teams and spectators without an active observer ship.
    ship.visibilityOverflow = visible ? '*' : '||';
    ship.visibleToPlayer = ship.visibleToEnemy = visible;
    ship.combatShips = ships;
  }
  for (const ship of ships) if (ship.currentTargetShip && !ship.currentTargetShip.isVisibleTo(ship.teamId)) ship.currentTargetShip = null;
}
