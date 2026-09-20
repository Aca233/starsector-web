import { validateMuzzleEvents } from './muzzle-events.mjs';
/** Relay validation metadata. Never retain the large presentation-state graph. */
export function summarizeCombatFrame(frame, expectedShips, lastTick) {
  const invalid = () => { throw Error("无效战斗状态"); };
  const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const team = value => Number.isSafeInteger(value) && value >= 0;
  if (!object(frame) || !Number.isSafeInteger(frame.tick) || frame.tick <= lastTick ||
      !Array.isArray(frame.ships) || frame.ships.length !== expectedShips ||
      !Array.isArray(frame.crafts) || !Array.isArray(frame.craftSpecs) || !object(frame.world)) invalid();
  if (frame.muzzleEvents !== undefined) validateMuzzleEvents(frame.muzzleEvents);
  const ids = new Set();
  const addId = row => {
    if (!object(row) || typeof row.id !== "string" || !row.id.length || row.id.length > 256 || ids.has(row.id)) invalid();
    ids.add(row.id);
  };
  // Array.from visits sparse slots too: encoded holes become null and must not
  // be accepted only because the producer is now validating before encoding.
  const ships = Array.from(frame.ships, row => {
    addId(row);
    if (!object(row.state) || !team(row.state.teamId)) invalid();
    return { id: row.id, state: { teamId: row.state.teamId } };
  });
  // A craft may not reuse a capital-ship ID or another craft's ID.
  for (const row of frame.crafts) addId(row);
  const summary = { tick: frame.tick, ships };
  if (frame.deployment != null) {
    if (!object(frame.deployment) || !Array.isArray(frame.deployment.rows)) invalid();
    const capitalTeams = new Map(ships.map(row => [row.id, row.state.teamId]));
    const deployed = new Set();
    const rows = Array.from(frame.deployment.rows, row => {
      if (!object(row) || !capitalTeams.has(row.id) || deployed.has(row.id) || row.teamId !== capitalTeams.get(row.id)) invalid();
      deployed.add(row.id);
      return { id: row.id, teamId: row.teamId };
    });
    summary.deployment = { rows };
  }
  return summary;
}

/** Dedicated Node Worker IPC only, NEVER a network-client validation shortcut.
 * Craft/world/muzzle checks already ran on the captured frame in that worker.
 * Reconstruct only whitelisted metadata, avoiding retention of extra IPC fields. */
export function validateAuthoritySummary(summary, expectedShips, lastTick, creditTick) {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary) || summary.tick !== creditTick)
    throw Error('无效服务器状态摘要');
  return summarizeCombatFrame({tick:summary.tick, ships:summary.ships, deployment:summary.deployment,
    crafts:[], craftSpecs:[], world:{}}, expectedShips, lastTick);
}
