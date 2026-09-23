/** Compression reference ONLY: both ends XOR against these guessed bytes, then
 * CRC/decode the exact authoritative component. Never applied to a game world.
 * Two bounded admitted components, no simulation, RNG or trigonometry. */
import {decodeCombatState, encodeCombatState} from '../src/network/CriticalCombatState.mjs';
const fields = [0, 1, 3, 4, 5, 7, 10, 13, 14];
export function combatByteReference(base, previous, tick) {
  if (!base || !previous || !Number.isSafeInteger(tick) || tick <= base.tick || tick - base.tick > 120 || base.tick <= previous.tick || base.tick - previous.tick > 120) return null;
  const frame = decodeCombatState(base.bytes), old = decodeCombatState(previous.bytes);
  if (!frame.weapons || !old.weapons || frame.weapons.length !== old.weapons.length) return null;
  const ratio = (tick - base.tick) / (base.tick - previous.tick);
  for (let s = 0; s < frame.weapons.length; s++) {
    const [id, rows] = frame.weapons[s], [priorId, priorRows] = old.weapons[s];
    if (id !== priorId || rows.length !== priorRows.length) return null;
    for (let w = 0; w < rows.length; w++) {
      const row = rows[w], prior = priorRows[w]; if (row[0] !== prior[0] || row[1] !== prior[1]) return null;
      for (const field of fields) {
        const index = 5 + field, value = row[index], before = prior[index];
        if (!Number.isFinite(value) || !Number.isFinite(before) || Object.is(value, before)) continue;
        const delta = value - before;
        // Do not extrapolate across an angular wrap; it is just a poor reference.
        if (field === 0 && Math.abs(delta) > Math.PI) continue;
        let next = value + delta * ratio;
        if (!Number.isFinite(next) || Math.abs(next) > 1e12) continue;
        if (field !== 0) next = Math.max(0, next);
        if (field === 4 || field === 5) next = Math.min(1, next);
        row[index] = next;
      }
    }
  }
  // Header/HP remain exact residuals too; no predicted damage or authoritative
  // timer is published until the original bytes pass CRC and schema validation.
  frame.tick = tick;
  const time = frame.time + (frame.time - old.time) * ratio;
  if (Number.isFinite(time) && time >= 0 && time <= 1e12) frame.time = time;
  const bytes = Buffer.from(encodeCombatState(frame));
  return bytes.length === base.bytes.length ? bytes : null;
}

/** Bounded same-ship angle corrections for lossless residual compression.
 * These bytes have no world/apply path: only the reconstructed authoritative
 * component may pass CRC/schema and reach a replica. */
export const COMBAT_SPATIAL_MAX_BYTES = 1 + 128 * 9;
const angleLimit = 1e12;
function correctedAngle(angle, correction) {
  const next = angle + correction;
  return Number.isFinite(next) && Math.abs(next) <= angleLimit ? next : angle;
}
export function applyCombatSpatialReference(reference, anchors) {
  if (!(anchors instanceof Uint8Array) || anchors.length < 10 || anchors.length > COMBAT_SPATIAL_MAX_BYTES) throw Error('Invalid combat angle reference');
  const count = anchors[0];
  if (!count || count > 128 || anchors.length !== 1 + count * 9) throw Error('Invalid combat angle reference length');
  const frame = decodeCombatState(reference);
  if (!frame.weapons) throw Error('Missing combat weapon reference');
  const view = new DataView(anchors.buffer, anchors.byteOffset, anchors.byteLength);
  let prior = -1;
  for (let i = 0; i < count; i++) {
    const ship = anchors[1 + i * 9], correction = view.getFloat64(2 + i * 9);
    if (ship <= prior || ship >= frame.weapons.length || !Number.isFinite(correction) || Math.abs(correction) > angleLimit || !frame.weapons[ship][1].length) throw Error('Invalid combat angle reference entry');
    prior = ship;
    for (const row of frame.weapons[ship][1]) row[5] = correctedAngle(row[5], correction);
  }
  return Buffer.from(encodeCombatState(frame));
}
export function prepareCombatSpatialReference(reference, target) {
  const frame = decodeCombatState(reference), next = decodeCombatState(target);
  if (!frame.weapons || !next.weapons || frame.weapons.length !== next.weapons.length) return null;
  const anchors = Buffer.alloc(COMBAT_SPATIAL_MAX_BYTES);
  let count = 0;
  for (let s = 0; s < frame.weapons.length; s++) {
    const [id, rows] = frame.weapons[s], [nextId, targets] = next.weapons[s];
    if (id !== nextId || rows.length !== targets.length) return null;
    const differences = [];
    for (let w = 0; w < rows.length; w++) {
      if (rows[w][0] !== targets[w][0] || rows[w][1] !== targets[w][1]) return null;
      differences.push(targets[w][5] - rows[w][5]);
    }
    if (!differences.length) continue;
    differences.sort((a, b) => a - b);
    const correction = differences[Math.floor(differences.length / 2)];
    if (!Number.isFinite(correction) || correction === 0 || Math.abs(correction) > angleLimit) continue;
    anchors[1 + count * 9] = s; anchors.writeDoubleBE(correction, 2 + count * 9); count++;
    for (const row of rows) row[5] = correctedAngle(row[5], correction);
  }
  if (!count) return null;
  anchors[0] = count;
  return { anchors: anchors.subarray(0, 1 + count * 9), bytes: Buffer.from(encodeCombatState(frame)) };
}
