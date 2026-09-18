import { validateMuzzleEvents } from '../src/network/muzzle-events.mjs';
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
  const ships = frame.ships.map(row => {
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
    const rows = frame.deployment.rows.map(row => {
      if (!object(row) || !capitalTeams.has(row.id) || deployed.has(row.id) || row.teamId !== capitalTeams.get(row.id)) invalid();
      deployed.add(row.id);
      return { id: row.id, teamId: row.teamId };
    });
    summary.deployment = { rows };
  }
  return summary;
}

/** Call only after host, match, sequence and frame validation has succeeded. */
export function reusableStateText(message, text) {
  // Preserve the exact parsed four-field envelope, including unknown fields *in*
  // frame for codec compatibility, but never forward extra envelope properties.
  // Steam's lossy-state delivery / compression cache requires this exact prefix.
  if (Object.keys(message).length !== 4 ||
      !Object.hasOwn(message, "matchId") || !Object.hasOwn(message, "seq") || !Object.hasOwn(message, "frame")) return undefined;
  const prefix = '{"type":"state","matchId":' + JSON.stringify(message.matchId) + ',"seq":' + message.seq + ',"frame":';
  return text.startsWith(prefix) ? text : undefined;
}
