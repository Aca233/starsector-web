import { aiHullId } from "./ai-loadouts.mjs";
import roster from '../engine/data/generated/simulation-roster.json' with {type:'json'};
import { battleTeamCount, battleTeamLimit, BATTLE_SIZE_STEP, MAX_BATTLE_SIZE } from '../shared/battle-size.mjs';
import { teamName } from './room-fleet.mjs';
/** Lobby and server use the same native hull costs, before loading the combat world. */
export function roomDeploymentBlockReason(members, options) {
  const count = battleTeamCount(members, options.aiHulls);
  const limit = battleTeamLimit(options.battleSize, count);
  const teams = new Map();
  const cost = hull => roster.costs[hull];
  const get = team => { if (!teams.has(team)) teams.set(team, {humans:0, max:0, first:0}); return teams.get(team); };
  for (const member of members) {
    const dp = cost(member.design?.hullId ?? member.hull);
    if (!Number.isFinite(dp) || dp <= 0) return member.name + '的舰船缺少有效部署点，请重新选船';
    const row = get(member.team); row.humans += dp; row.max = Math.max(row.max, dp);
  }
  for (const [team, hulls] of options.aiHulls.entries()) for (const hull of hulls) {
    const dp = cost(aiHullId(options,hull));
    if (!Number.isFinite(dp) || dp <= 0) return teamName(team) + '的 AI 舰船缺少有效部署点，请更换';
    const row = get(team); row.max = Math.max(row.max, dp); if (!row.first) row.first = dp;
  }
  for (const [team, row] of teams) {
    const required = Math.max(row.humans || row.first, row.max);
    if (required > limit) {
      const needed = Math.ceil(required * count / BATTLE_SIZE_STEP) * BATTLE_SIZE_STEP;
      return teamName(team) + '需要至少 ' + required + ' DP / 队，当前只有 ' + limit + '。' + (needed > MAX_BATTLE_SIZE
        ? '此编成需要 ' + needed + ' DP，超过扩展规模上限 ' + MAX_BATTLE_SIZE + '；请减少参战阵营或改用低 DP 舰船'
        : '请房主提高战斗规模至至少 ' + needed + ' DP，或调整分队 / 舰船');
    }
  }
  return '';
}
