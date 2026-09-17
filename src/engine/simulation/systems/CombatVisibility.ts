import type { Ship } from '../Ship';
const teamNumber = (side: number | boolean) => typeof side === 'boolean' ? (side ? 0 : 1) : side;
/** Shared vision belongs only to the observer's actual team, never all non-host ships. */
export function combatObservers(ships: readonly Ship[], side: number | boolean): Ship[] {
  const team = teamNumber(side), wings = new Set<string>();
  return ships.filter(ship => {
    if (ship.teamId !== team || ship.isDead || ship.isRetreated || ship.isDocked || ship.isSystemDrone) return false;
    if (ship.spec.hullSize !== 'FIGHTER' || !ship.flightDeckWingId) return true;
    if (wings.has(ship.flightDeckWingId)) return false;
    wings.add(ship.flightDeckWingId); return true;
  });
}
export function contactVisible(ship: Ship, observers: readonly Ship[], side: number | boolean): boolean {
  return !ship.isDead && !ship.isRetreated && !ship.isDocked && (ship.teamId === teamNumber(side) || observers.some(observer => observer.pos.distanceTo(ship.pos) <= observer.sightRadius));
}
export function updateCombatVisibility(ships: readonly Ship[]): void {
  const observers = [...new Set(ships.map(ship => ship.teamId))].map(team => ({team, ships:combatObservers(ships,team)}));
  for (const ship of ships) {
    ship.visibilityMask = 0;
    const overflow: number[] = [];
    for (const view of observers) if (contactVisible(ship,view.ships,view.team)) {
      if (view.team < 31) ship.visibilityMask |= 1 << view.team;
      else overflow.push(view.team);
    }
    ship.visibilityOverflow = "|" + overflow.join("|") + "|";
    ship.visibleToPlayer = !!(ship.visibilityMask & 1); ship.visibleToEnemy = !!(ship.visibilityMask & 2);
    ship.combatShips = ships;
  }
  for (const ship of ships) if (ship.currentTargetShip && !ship.currentTargetShip.isVisibleTo(ship.teamId)) ship.currentTargetShip = null;
}
