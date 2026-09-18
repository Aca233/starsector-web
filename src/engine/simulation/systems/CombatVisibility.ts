import type { Ship } from '../Ship';
// Ring formations land exactly on sensor range; trig roundoff must not hide one flank.
const SIGHT_BOUNDARY_EPSILON = 1e-6;
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
export function contactVisible(ship: Ship, observers: readonly Ship[], side: number | boolean, revealAll = false): boolean {
  return !ship.isDead && !ship.isRetreated && !ship.isDocked && (revealAll || ship.teamId === teamNumber(side) || observers.some(observer => observer.pos.distanceTo(ship.pos) <= observer.sightRadius + SIGHT_BOUNDARY_EPSILON));
}
export function updateCombatVisibility(ships: readonly Ship[], revealAll = false): void {
  const observers = revealAll ? [] : [...new Set(ships.map(ship => ship.teamId))].map(team => ({team, ships:combatObservers(ships,team)}));
  for (const ship of ships) {
    // Public arenas include spectators whose last ship has already left the active roster.
    if (revealAll) {
      const visible = contactVisible(ship, [], 0, true);
      ship.visibilityMask = visible ? 0x7fffffff : 0;
      ship.visibilityOverflow = visible ? '*' : '||';
      ship.visibleToPlayer = ship.visibleToEnemy = visible;
      ship.combatShips = ships;
      continue;
    }
    ship.visibilityMask = 0;
    const overflow: number[] = [];
    for (const view of observers) if (contactVisible(ship,view.ships,view.team,revealAll)) {
      if (view.team < 31) ship.visibilityMask |= 1 << view.team;
      else overflow.push(view.team);
    }
    ship.visibilityOverflow = "|" + overflow.join("|") + "|";
    ship.visibleToPlayer = !!(ship.visibilityMask & 1); ship.visibleToEnemy = !!(ship.visibilityMask & 2);
    ship.combatShips = ships;
  }
  for (const ship of ships) if (ship.currentTargetShip && !ship.currentTargetShip.isVisibleTo(ship.teamId)) ship.currentTargetShip = null;
}
