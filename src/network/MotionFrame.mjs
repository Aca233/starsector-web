import { decodeBase64Bytes } from './Base64Bytes.mjs';
/** SWM1: complete, standalone capital-ship kinematics. No quantization, world
 * mutation, delta baseline, combat result, or caller-controlled allocation. */
export const MOTION_MAX_SHIPS = 128;
export const MOTION_MAX_BYTES = 11000;
const text = new TextDecoder('utf-8', { fatal: true }), utf8 = new TextEncoder();
const invalid = () => { throw Error('Invalid critical motion state'); };
const safe = n => Number.isSafeInteger(n) && n >= 0;
export function encodeMotionFrame(frame) {
  const { tick, time, acknowledged, ships } = frame;
  if (!safe(tick) || !Number.isFinite(time) || time < 0 || !Array.isArray(ships) || ships.length > MOTION_MAX_SHIPS) invalid();
  const acks = Object.entries(acknowledged ?? {});
  if (acks.length > 10) invalid();
  const out = new Uint8Array(MOTION_MAX_BYTES), v = new DataView(out.buffer), ids = new Set();
  v.setUint32(0, 0x53574d31); v.setFloat64(4, tick); v.setFloat64(12, time); v.setUint16(20, ships.length); out[22] = acks.length;
  let at = 23;
  for (const [seat, seq] of acks) {
    if (!/^(0|[1-9][0-9]?)$/.test(seat) || +seat >= 10 || !safe(seq)) invalid();
    out[at++] = +seat; v.setFloat64(at, seq); at += 8;
  }
  for (const s of ships) {
    if (!Array.isArray(s) || s.length !== 9 || typeof s[0] !== 'string' || !s[0] || ids.has(s[0])) invalid();
    const id = utf8.encode(s[0]);
    if (id.length > 128 || text.decode(id) !== s[0] || at + id.length + 54 > out.length) invalid();
    ids.add(s[0]); out[at++] = id.length; out.set(id, at); at += id.length;
    for (let i = 1; i <= 6; i++) { if (!Number.isFinite(s[i]) || Math.abs(s[i]) > 1e9) invalid(); v.setFloat64(at, s[i]); at += 8; }
    if (!safe(s[7]) || s[7] > 0xffffffff || !Number.isInteger(s[8]) || s[8] < 0 || s[8] > 3) invalid();
    v.setUint32(at, s[7]); at += 4; out[at++] = s[8];
  }
  return out.slice(0, at);
}
export function decodeMotionFrame(value) {
  const b = value instanceof Uint8Array ? value : value instanceof ArrayBuffer ? new Uint8Array(value) : null;
  if (!b || b.length < 23 || b.length > MOTION_MAX_BYTES) invalid();
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (v.getUint32(0) !== 0x53574d31) invalid();
  const tick = v.getFloat64(4), time = v.getFloat64(12), count = v.getUint16(20), ackCount = b[22];
  if (!safe(tick) || !Number.isFinite(time) || time < 0 || count > MOTION_MAX_SHIPS || ackCount > 10) invalid();
  const acknowledged = Object.create(null), ships = [], ids = new Set(); let at = 23;
  for (let i = 0; i < ackCount; i++) {
    if (at + 9 > b.length) invalid(); const seat = b[at++], seq = v.getFloat64(at); at += 8;
    if (seat >= 10 || Object.hasOwn(acknowledged, seat) || !safe(seq)) invalid(); acknowledged[seat] = seq;
  }
  for (let i = 0; i < count; i++) {
    if (at >= b.length) invalid(); const length = b[at++];
    if (!length || length > 128 || at + length + 53 > b.length) invalid();
    const id = text.decode(b.subarray(at, at + length)); at += length;
    if (ids.has(id)) invalid(); ids.add(id); const row = [id];
    for (let j = 0; j < 6; j++) { const n = v.getFloat64(at); at += 8; if (!Number.isFinite(n) || Math.abs(n) > 1e9) invalid(); row.push(n); }
    row.push(v.getUint32(at)); at += 4; const flags = b[at++]; if (flags > 3) invalid(); row.push(flags); ships.push(row);
  }
  if (at !== b.length) invalid(); return { tick, time, acknowledged, ships };
}
export function motionToText(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length > MOTION_MAX_BYTES) invalid();
  // The bound is well below the JS argument limit on supported runtimes.
  return btoa(String.fromCharCode(...bytes));
}
export function motionFromText(value) {
  if (typeof value !== 'string' || value.length > Math.ceil(MOTION_MAX_BYTES / 3) * 4 || value.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) invalid();
  return decodeMotionFrame(decodeBase64Bytes(value));
}
