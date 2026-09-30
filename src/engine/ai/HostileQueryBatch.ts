import { hasOwnedFireControlReadHooks, type Ship } from '../simulation/Ship';
import { sameTeam } from '../simulation/CombatTeams';

/** Phase-local membership only. Positions and current/ordered targets stay live.
 * Internal to a closed Worker with native readers; not a caller-object purity audit. */
export class HostileQueryBatch {
  private ships?: readonly Ship[];
  private readonly length: number;
  private readonly members: Set<Ship>;
  private readonly teams = new Map<number, { hostiles: Ship[]; main?: Ship[] }>();
  private constructor(ships: readonly Ship[]) {
    this.ships = ships; this.length = ships.length; this.members = new Set(ships);
  }
  public static create(ships: readonly Ship[], workerOwned: boolean): HostileQueryBatch | undefined {
    if (!workerOwned || ships.length < 64
      || !ships.every(ship => Number.isInteger(ship.teamId) && hasOwnedFireControlReadHooks(ship))) return;
    return new HostileQueryBatch(ships);
  }
  public forShip(ship: Ship, ships: readonly Ship[]): HostileQueryBatch | undefined {
    return this.ships === ships && ships.length === this.length && this.members.has(ship) ? this : undefined;
  }
  public find(ship: Ship, targetId?: string): Ship | undefined {
    const ships = this.ships;
    if (!ships || ships.length !== this.length || !this.members.has(ship)) return;
    let team = this.teams.get(ship.teamId);
    if (!team) {
      const hostiles = ships.filter(candidate => !candidate.hasVastBulk && !candidate.isDead
        && candidate.isVisibleTo(ship.teamId) && !sameTeam(candidate, ship));
      team = { hostiles }; this.teams.set(ship.teamId, team);
    }
    const ordered = targetId && team.hostiles.find(candidate => candidate.id === targetId);
    if (ordered) return ordered;
    if (ship.currentTargetShip && team.hostiles.includes(ship.currentTargetShip)) return ship.currentTargetShip;
    team.main ??= team.hostiles.filter(candidate => candidate.spec.hullSize !== 'FIGHTER');
    // Deliberately the original reduce, including NaN/Infinity and strict tie order.
    // Native system AI can move ships during this phase, so never cache distances.
    return (team.main.length ? team.main : team.hostiles)
      .reduce<Ship | undefined>((closest, candidate) => !closest || ship.pos.distanceTo(candidate.pos) < ship.pos.distanceTo(closest.pos) ? candidate : closest, undefined);
  }
  public close(): void { this.ships = undefined; this.members.clear(); this.teams.clear(); }
}
