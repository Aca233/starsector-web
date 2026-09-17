/** Stable combat allegiance. isPlayer remains a legacy presentation/statistics flag. */
export interface CombatAllegiance { teamId?: number; isPlayer?: boolean }
export function combatTeam(entity: CombatAllegiance): number | undefined {
  return entity.teamId ?? (entity.isPlayer === undefined ? undefined : entity.isPlayer ? 0 : 1);
}
export function sameTeam(a: CombatAllegiance, b: CombatAllegiance): boolean {
  const team = combatTeam(a);
  return team !== undefined && team === combatTeam(b);
}

export function combatTeamColor(team: number): string { return COMBAT_TEAM_COLORS[team % COMBAT_TEAM_COLORS.length] ?? COMBAT_TEAM_COLORS[0]; }

export const COMBAT_TEAM_COLORS = ["#70d9ff","#ffc166","#df9aff","#74e79c","#ff869f","#8eabff","#d1e56a","#fc9ae2","#63dfce","#dda381","#cad4e4","#f1845e","#b0c76d","#ba95df"];
