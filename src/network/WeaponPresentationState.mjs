/** Exact bounded weapon presentation rows. A fixed numeric layout keeps ordered
 * XOR deltas aligned as values enter/leave zero; deflate handles zero runs.
 * Positive Infinity is legal only for ammo and sustained beam stage time. */
export const WEAPON_STATE_MAX_BYTES = 32768;
export const WEAPON_STATE_MAX_SHIPS = 128;
export const WEAPON_STATE_MAX_MOUNTS = 1024;
export const WEAPON_NUMBERS = Object.freeze([
  'currentAngleRad', 'cooldownTimer', 'ammo', 'ammoRechargeProgress',
  'recoil', 'glowAlpha', 'barrelIndex', 'currentSpreadDeg',
  'health', 'maxHealth', 'disabledTimer', 'disabledDuration',
  'burstRemaining', 'burstTimer', 'firingStateTimer', 'firingCycleId',
]);
export const WEAPON_FLAGS = Object.freeze(['isAutofire', 'triggerHeld', 'isDisabled']);
export const WEAPON_PHASES = Object.freeze(['IDLE', 'CHARGING', 'ACTIVE', 'CHARGEDOWN']);
const utf8 = new TextEncoder(), text = new TextDecoder('utf-8', { fatal: true });
const fail = () => { throw Error('Invalid weapon presentation state'); };
const numeric = (n, i) => typeof n === 'number' && (Number.isFinite(n) && Math.abs(n) <= 1e12 || (i === 2 || i === 14) && n === Infinity);
const small = (n, max) => Number.isInteger(n) && n >= 0 && n < max;
export function encodeWeaponState(ships) {
  if (!Array.isArray(ships) || ships.length > WEAPON_STATE_MAX_SHIPS) fail();
  const out = new Uint8Array(WEAPON_STATE_MAX_BYTES), view = new DataView(out.buffer);
  let at = 6, total = 0; const ids = new Set();
  const room = n => { if (at + n > out.length) fail(); };
  const string = s => {
    if (typeof s !== 'string' || !s) fail(); const b = utf8.encode(s);
    if (b.length > 128 || text.decode(b) !== s) fail(); room(b.length + 1);
    out[at++] = b.length; out.set(b, at); at += b.length;
  };
  view.setUint32(0, 0x57504332); view.setUint16(4, ships.length);
  for (const ship of ships) {
    if (!Array.isArray(ship) || ship.length !== 2 || ids.has(ship[0]) || !Array.isArray(ship[1]) || ship[1].length > 128) fail();
    ids.add(ship[0]); string(ship[0]); const mounts = ship[1], slots = new Set();
    total += mounts.length; if (total > WEAPON_STATE_MAX_MOUNTS) fail();
    room(2); view.setUint16(at, mounts.length); at += 2;
    for (const row of mounts) {
      if (!Array.isArray(row) || row.length !== 5 + WEAPON_NUMBERS.length || slots.has(row[0]) || !small(row[2], 8) || !small(row[3], 4) || !small(row[4], 4)) fail();
      slots.add(row[0]); string(row[0]); string(row[1]); room(3 + WEAPON_NUMBERS.length * 8);
      out[at++] = row[2]; out[at++] = row[3]; out[at++] = row[4];
      for (let i = 0; i < WEAPON_NUMBERS.length; i++) {
        const n = row[5 + i]; if (!numeric(n, i)) fail();
        view.setFloat64(at, n); at += 8;
      }
    }
  }
  return out.slice(0, at);
}
export function decodeWeaponState(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 6 || bytes.length > WEAPON_STATE_MAX_BYTES) fail();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0) !== 0x57504332 || view.getUint16(4) > WEAPON_STATE_MAX_SHIPS) fail();
  let at = 6, total = 0; const ships = [], ids = new Set();
  const room = n => { if (at + n > bytes.length) fail(); };
  const string = () => {
    room(1); const n = bytes[at++]; if (!n || n > 128) fail(); room(n);
    const s = text.decode(bytes.subarray(at, at + n)); at += n; return s;
  };
  for (let s = 0; s < view.getUint16(4); s++) {
    const id = string(); if (ids.has(id)) fail(); ids.add(id);
    room(2); const count = view.getUint16(at); at += 2; total += count;
    if (count > 128 || total > WEAPON_STATE_MAX_MOUNTS) fail();
    const mounts = [], slots = new Set();
    for (let w = 0; w < count; w++) {
      const slot = string(), spec = string(); if (slots.has(slot)) fail(); slots.add(slot); room(3 + WEAPON_NUMBERS.length * 8);
      const flags = bytes[at++], phase = bytes[at++], permanent = bytes[at++];
      if (flags > 7 || phase > 3 || permanent > 3) fail(); const row = [slot, spec, flags, phase, permanent];
      for (let i = 0; i < WEAPON_NUMBERS.length; i++) {
        const n = view.getFloat64(at); at += 8;
        if (!numeric(n, i)) fail(); row.push(n);
      }
      mounts.push(row);
    }
    ships.push([id, mounts]);
  }
  if (at !== bytes.length) fail(); return ships;
}
