import {decodeBinaryState, encodeBinaryState} from '../src/network/BinarySnapshot.mjs';
import {summarizeCombatFrame, validateAuthoritySummary} from './lan-state.mjs';

/** Trusted dedicated Worker IPC only. Client state messages must NEVER call this.
 * WebSocket forwarding needs bytes plus small report/deployment metadata, not
 * a second materialized presentation graph. Adapters requesting state.frame and
 * old workers without summaries retain the full decode/validation path. */
export function prepareAuthoritySnapshot(message, matchId, seq, expectedShips, lastTick, requireFrame = false) {
  const bytes = message.binary ? encodeBinaryState(matchId, seq, new Uint8Array(message.binary)) : null;
  const visualBytes = bytes && message.visualBinary ? encodeBinaryState(matchId, seq, new Uint8Array(message.visualBinary)) : null;
  if (bytes && message.summary !== undefined && !requireFrame) {
    const summary = validateAuthoritySummary(message.summary, expectedShips, lastTick, message.tick);
    return {bytes, summary, visualBytes};
  }
  const frame = bytes ? decodeBinaryState(bytes).frame : JSON.parse(message.json);
  const summary = summarizeCombatFrame(frame, expectedShips, lastTick);
  if (summary.tick !== message.tick) throw Error('服务器快照时序不一致');
  return {bytes, frame, summary, visualBytes};
}
