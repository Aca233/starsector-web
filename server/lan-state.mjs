export { summarizeCombatFrame, validateAuthoritySummary } from '../src/network/CombatFrameSummary.mjs';

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
