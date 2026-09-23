import { encodeWeaponState, decodeWeaponState } from './WeaponPresentationState.mjs';
/** SCC1 (core) / SCC2 (core + optional complete weapon roster): independent authoritative capital-ship combat presentation component.
 * Exact float64 values, no predicted damage, rule execution or world replacement. */
export const COMBAT_STATE_MAX_SHIPS = 128;
export const COMBAT_STATE_MAX_BYTES = 32768;
export const COMBAT_PHASES = Object.freeze(['IDLE', 'IN', 'ACTIVE', 'OUT', 'COOLDOWN']);
export const COMBAT_NUMBERS = Object.freeze([
  'hullHp', 'currentCR', 'flux.softFlux', 'flux.hardFlux', 'flux.maxFlux',
  'flux.overloadTimer', 'flux.overloadDuration', 'flux.ventProgress',
  'shield.currentArcDeg', 'shield.facingAngleRad', 'shield.targetFacingAngleRad',
  'shield.closeTimeRemaining', 'shield.phaseEffectLevel', 'shield.phaseStageTimer',
]);
export const COMBAT_FLAGS = Object.freeze([
  'isDead', 'isRetreated', 'retreating', 'flux.isOverloaded', 'flux.isVenting',
  'flux.isEngineBoostActive', 'shield.isActive', 'shield.toggleLocked', 'shield.pendingRaise',
]);
const utf8 = new TextEncoder(), text = new TextDecoder('utf-8', { fatal: true });
const invalid = () => { throw Error('Invalid critical combat state'); };
const tickValid = n => Number.isSafeInteger(n) && n >= 0;
const numberValid = n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1e12;
export function encodeCombatState(frame) {
  if (!tickValid(frame?.tick) || !numberValid(frame.time) || frame.time < 0 || !Array.isArray(frame.ships) || frame.ships.length > COMBAT_STATE_MAX_SHIPS) invalid();
  const out = new Uint8Array(COMBAT_STATE_MAX_BYTES), view = new DataView(out.buffer), ids = new Set();
  view.setUint32(0, frame.weapons === undefined ? 0x53434331 : 0x53434332); view.setFloat64(4, frame.tick); view.setFloat64(12, frame.time); view.setUint16(20, frame.ships.length);
  let at = 22;
  for (const row of frame.ships) {
    if (!Array.isArray(row) || row.length !== COMBAT_NUMBERS.length + 3 || typeof row[0] !== 'string' || !row[0] || ids.has(row[0])) invalid();
    const id = utf8.encode(row[0]);
    if (id.length > 128 || text.decode(id) !== row[0] || at + id.length + 4 + COMBAT_NUMBERS.length * 8 > out.length) invalid();
    if (!Number.isInteger(row[1]) || row[1] < 0 || row[1] >= 2 ** COMBAT_FLAGS.length || !Number.isInteger(row[2]) || row[2] < 0 || row[2] >= COMBAT_PHASES.length) invalid();
    ids.add(row[0]); out[at++] = id.length; out.set(id, at); at += id.length;
    view.setUint16(at, row[1]); at += 2; out[at++] = row[2];
    for (const n of row.slice(3)) { if (!numberValid(n)) invalid(); view.setFloat64(at, n); at += 8; }
  }
  if (frame.weapons !== undefined) {
    const data = encodeWeaponState(frame.weapons);
    if (frame.weapons.length !== ids.size || frame.weapons.some(([id]) => !ids.has(id)) || at + 4 + data.length > out.length) invalid();
    view.setUint32(at, data.length); at += 4; out.set(data, at); at += data.length;
  }
  return out.slice(0, at);
}
export function decodeCombatState(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 22 || bytes.length > COMBAT_STATE_MAX_BYTES) invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint32(0); if (magic !== 0x53434331 && magic !== 0x53434332) invalid();
  const tick = view.getFloat64(4), time = view.getFloat64(12), count = view.getUint16(20);
  if (!tickValid(tick) || !numberValid(time) || time < 0 || count > COMBAT_STATE_MAX_SHIPS) invalid();
  const ships = [], ids = new Set(); let at = 22;
  for (let i = 0; i < count; i++) {
    if (at >= bytes.length) invalid(); const size = bytes[at++];
    if (!size || size > 128 || at + size + 3 + COMBAT_NUMBERS.length * 8 > bytes.length) invalid();
    const id = text.decode(bytes.subarray(at, at + size)); at += size;
    if (ids.has(id)) invalid(); ids.add(id);
    const flags = view.getUint16(at); at += 2; const phase = bytes[at++];
    if (flags >= 2 ** COMBAT_FLAGS.length || phase >= COMBAT_PHASES.length) invalid();
    const row = [id, flags, phase];
    for (let j = 0; j < COMBAT_NUMBERS.length; j++) { const n = view.getFloat64(at); at += 8; if (!numberValid(n)) invalid(); row.push(n); }
    ships.push(row);
  }
  let weapons;
  if (magic === 0x53434332) {
    if (at + 4 > bytes.length || view.getUint32(at) !== bytes.length - at - 4) invalid();
    weapons = decodeWeaponState(bytes.subarray(at + 4));
    if (weapons.length !== ids.size || weapons.some(([id]) => !ids.has(id))) invalid();
    at = bytes.length;
  }
  if (at !== bytes.length) invalid(); return { tick, time, ships, ...(weapons === undefined ? {} : { weapons }) };
}
export function combatStateFromText(value) {
  if (typeof value !== 'string' || !value.length || value.length > Math.ceil(COMBAT_STATE_MAX_BYTES / 3) * 4 || value.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) invalid();
  return decodeCombatState(Uint8Array.from(atob(value), c => c.charCodeAt(0)));
}
