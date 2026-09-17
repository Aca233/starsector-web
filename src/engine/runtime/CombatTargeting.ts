import type { Ship } from '../simulation/Ship';
import type { Vector2 } from '../math/Vector2';
import { sameTeam } from '../simulation/CombatTeams';

/** Sensor/contact eligibility shared by the R command and its presentation. */
export function isInspectableShip(ship: Ship, observer: Ship): boolean {
  return !ship.isDead && ship.hullHp > 0 && !ship.isRetreated && !ship.isDocked && ship.isVisibleTo(observer.teamId);
}

/** Pick one contact, not every overlapping label. Callers supply the current live roster. */
export function pickCombatContact(ships: readonly Ship[], observer: Ship, point: Vector2,
  padding = 50, hostileOnly = false, alpha = 1): Ship | null {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  let best: Ship | null = null, distance = Infinity;
  for (const ship of ships) {
    if (!isInspectableShip(ship, observer) || (hostileOnly && (ship === observer || sameTeam(ship, observer)))) continue;
    const x = ship.prevPos.x + (ship.pos.x - ship.prevPos.x) * alpha;
    const y = ship.prevPos.y + (ship.pos.y - ship.prevPos.y) * alpha;
    const d = Math.hypot(point.x - x, point.y - y);
    if (d <= ship.spec.collisionRadius + padding && d < distance) { best = ship; distance = d; }
  }
  return best;
}

export function lockedCombatTarget(ships: readonly Ship[], observer: Ship): Ship | null {
  return ships.find(ship => ship.id === observer.playerTargetId && !sameTeam(ship, observer)
    && isInspectableShip(ship, observer)) ?? null;
}
