import type { Ship } from '../simulation/Ship';
import { sameTeam } from '../simulation/CombatTeams';

/** Shared read-only target selection; no engine, AI scheduling or mutations. */
type HostileRead = Pick<Ship,'id'|'hasVastBulk'|'isDead'|'isVisibleTo'|'teamId'|'spec'|'pos'>;
export function findCombatHostile<T extends HostileRead & {currentTargetShip:T|null}>(ship: T, targetId: string | undefined, roster: readonly T[]): T | undefined {
    const hostiles = roster.filter(candidate => !candidate.hasVastBulk && !candidate.isDead && candidate.isVisibleTo(ship.teamId) && !sameTeam(candidate, ship));
    const ordered = targetId && hostiles.find(candidate => candidate.id === targetId);
    if (ordered) return ordered;
    if (ship.currentTargetShip && hostiles.includes(ship.currentTargetShip)) return ship.currentTargetShip;
    const mainShips = hostiles.filter(candidate => candidate.spec.hullSize !== 'FIGHTER');
    return (mainShips.length ? mainShips : hostiles)
      .reduce<T | undefined>((closest, candidate) => !closest || ship.pos.distanceTo(candidate.pos) < ship.pos.distanceTo(closest.pos) ? candidate : closest, undefined);
}
