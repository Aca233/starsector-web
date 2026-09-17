/** Whole-battle DP, not a hull count. 200–400 is native; higher values are a Web extension. */
export const DEFAULT_BATTLE_SIZE = 400;
export const MIN_BATTLE_SIZE = 200;
export const MAX_BATTLE_SIZE = 3200;
export const BATTLE_SIZE_STEP = 20;
export const BATTLE_SIZE_PRESETS = [200, 300, 400, 600, 800, 1200, 1600, 2400, 3200];
export const validBattleSize = value => Number.isInteger(value) && value >= MIN_BATTLE_SIZE && value <= MAX_BATTLE_SIZE && value % BATTLE_SIZE_STEP === 0;
export const normalizeBattleSize = value => validBattleSize(value) ? value : DEFAULT_BATTLE_SIZE;
/** Empty teams do not consume DP; a lobby previews at least two opposing teams. */
export function battleTeamCount(members, aiHulls) {
  return Math.max(2, new Set([...members.map(member => member.team), ...aiHulls.flatMap((hulls, team) => hulls.length ? [team] : [])]).size);
}
export const battleTeamLimit = (battleSize, teamCount = 2) => Math.floor(normalizeBattleSize(battleSize) / Math.max(2, teamCount));
