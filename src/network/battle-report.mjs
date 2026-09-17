export const MAX_BATTLE_REPORT_BYTES = 16 * 1024 * 1024 - 4096;
const statuses = new Set(['reserve', 'deployed', 'retreating', 'retreated', 'destroyed']);
const finite = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
/** The host owns simulation. Validate and copy its terminal report; never infer kills or damage from HP. */
export function validateBattleReport(input, match, frame = null) {
  if (!input || !Number.isSafeInteger(input.tick) || input.tick < 0 || !finite(input.seconds, 0, 1e9) || !Array.isArray(input.ships)) throw Error('无效战斗报告');
  const counts = new Map();
  const seats = new Map(match.players.map(p => [p.seat, p.team]));
  for (const player of match.players) counts.set(player.team, (counts.get(player.team) ?? 0) + 1);
  match.options.aiHulls.forEach((hulls, team) => { if (hulls.length) counts.set(team, (counts.get(team) ?? 0) + hulls.length); });
  if (input.ships.length !== [...counts.values()].reduce((a,b) => a+b, 0)) throw Error('战斗报告舰队名单不完整');
  if (frame && input.tick < frame.tick) throw Error('战斗报告早于最后同步状态');
  const known = frame ? new Map(frame.ships.map(s => [s.id, s.state.teamId])) : null;
  const ids = new Set(), controlled = new Set();
  const ships = input.ships.map(row => {
    if (!row || typeof row.id !== 'string' || !row.id.length || row.id.length > 256 || ids.has(row.id) ||
      !counts.has(row.team) || !Number.isInteger(row.team) || !statuses.has(row.status) ||
      typeof row.name !== 'string' || !row.name.trim() || row.name.length > 120 ||
      !finite(row.hullMax, 1, 1e12) || !finite(row.hull, 0, row.hullMax) || !finite(row.cr, 0, 1) || !finite(row.cost, 0.001, 20000) ||
      (row.status === 'destroyed' ? row.hull !== 0 : row.hull <= 0) ||
      (known && known.get(row.id) !== row.team)) throw Error('无效舰船结算记录');
    if (row.seat !== null) {
      if (!Number.isInteger(row.seat) || seats.get(row.seat) !== row.team || controlled.has(row.seat) || row.status === 'reserve') throw Error('无效玩家结算席位');
      controlled.add(row.seat);
    }
    counts.set(row.team, counts.get(row.team) - 1); ids.add(row.id);
    return {id:row.id, team:row.team, seat:row.seat, name:row.name, cost:row.cost, status:row.status, hull:row.hull, hullMax:row.hullMax, cr:row.cr};
  });
  if ([...counts.values()].some(n => n !== 0) || controlled.size !== seats.size) throw Error('战斗报告阵营或席位不完整');
  return {tick:input.tick, seconds:input.seconds, ships};
}
