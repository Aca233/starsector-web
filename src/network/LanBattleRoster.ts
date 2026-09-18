import type { CombatEngine } from '../engine/simulation/CombatEngine';
import type { Match } from './protocol';

export interface LanTeamPresence {
  team: number;
  total: number;
  known: number;
  deployed: number;
  visible: number;
  reserve: number;
  destroyed: number;
  retreated: number;
  invalidPosition: number;
  missing: number;
}

/** Count the frozen roster independently of what happens to be on-screen.
 * A budgeted reserve is not a missing texture; camera framing is not sensor visibility. */
export function lanTeamPresence(match: Match, engine: CombatEngine): LanTeamPresence[] {
  const teams = new Map<number, LanTeamPresence>();
  const get = (team: number) => {
    let row = teams.get(team);
    if (!row) {
      row = {team, total:0, known:0, deployed:0, visible:0, reserve:0, destroyed:0, retreated:0, invalidPosition:0, missing:0};
      teams.set(team, row);
    }
    return row;
  };
  for (const player of match.players) get(player.team).total++;
  for (const [team, hulls] of match.options.aiHulls.entries()) if (hulls.length) get(team).total += hulls.length;
  // Count identities once even if an erroneous display reorder duplicates a reference.
  const seen = new Set<string>();
  for (const ship of engine.allCapitalShips) {
    if (seen.has(ship.id)) continue;
    seen.add(ship.id);
    const row = get(ship.teamId); row.known++;
    if (ship.isDead || ship.hullHp <= 0) row.destroyed++;
    else if (ship.isRetreated) row.retreated++;
    else if (engine.deployment.isReserve(ship.id)) row.reserve++;
    else {
      row.deployed++;
      if (!Number.isFinite(ship.pos.x) || !Number.isFinite(ship.pos.y)) row.invalidPosition++;
      else if (!ship.isDocked && ship.isVisibleTo(engine.playerShip.teamId)) row.visible++;
    }
  }
  for (const row of teams.values()) row.missing = Math.max(0, row.total - row.known);
  return [...teams.values()].sort((a,b) => a.team - b.team);
}
