/** Local I/O completion, never a remote ACK. One fixed-size journal per private
 * port/epoch. The I/O worker is the sole writer; authority reads exact ticks.
 * Receipts still wake authority normally. No payload or unbounded history lives
 * here, and no Atomics.wait/spinning can block physics or the socket worker. */
const STRIDE = 8, CELLS = 1 + 2 * STRIDE, BASE = 0x100000000;
const lane = kind => kind === 'snapshot' ? 1 : kind === 'motion' ? 1 + STRIDE : 0;
const safe = n => Number.isSafeInteger(n) && n >= 0;
export function createAuthorityCompletion(enabled = globalThis.crossOriginIsolated === true) {
  if (!enabled || typeof SharedArrayBuffer !== 'function') return null;
  const view = new Int32Array(new SharedArrayBuffer(CELLS * 4));
  Atomics.store(view, 0, 1);
  return view;
}
export function attachAuthorityCompletion(buffer) {
  return typeof SharedArrayBuffer === 'function' && buffer instanceof SharedArrayBuffer
    && buffer.byteLength === CELLS * 4 ? new Int32Array(buffer) : null;
}
export function closeAuthorityCompletion(view) {
  if (view) Atomics.store(view, 0, 0);
}
export function writeAuthorityCompletion(view, kind, {tick, nextSequence, delivery, attempt = 0}) {
  if (!view || Atomics.load(view, 0) !== 1) return;
  const at = lane(kind);
  if (!at || !safe(tick) || !safe(nextSequence) || !safe(attempt) || !['sent', 'skipped'].includes(delivery)) throw Error('Invalid local I/O completion');
  // Seqlock: the next record may be a forced terminal publication. A reader
  // interrupted across that write must not mix its tick, result and sequence.
  Atomics.add(view, at, 1);
  Atomics.store(view, at + 1, tick >>> 0);
  Atomics.store(view, at + 2, Math.floor(tick / BASE));
  Atomics.store(view, at + 3, nextSequence >>> 0);
  Atomics.store(view, at + 4, Math.floor(nextSequence / BASE));
  Atomics.store(view, at + 5, delivery === 'sent' ? 1 : 2);
  Atomics.store(view, at + 6, attempt >>> 0);
  Atomics.store(view, at + 7, Math.floor(attempt / BASE));
  Atomics.add(view, at, 1);
}
export function readAuthorityCompletion(view, kind, expectedTick, expectedAttempt) {
  if (!view || expectedTick === null || Atomics.load(view, 0) !== 1) return null;
  const at = lane(kind);
  if (!at || !safe(expectedTick) || (expectedAttempt !== undefined && !safe(expectedAttempt))) return null;
  const version = Atomics.load(view, at);
  if (version & 1) return null; // A later timer/MessagePort event retries.
  const tick = (Atomics.load(view, at + 1) >>> 0) + Atomics.load(view, at + 2) * BASE;
  const nextSequence = (Atomics.load(view, at + 3) >>> 0) + Atomics.load(view, at + 4) * BASE;
  const status = Atomics.load(view, at + 5);
  const attempt = (Atomics.load(view, at + 6) >>> 0) + Atomics.load(view, at + 7) * BASE;
  if (Atomics.load(view, at) !== version || Atomics.load(view, 0) !== 1
      || tick !== expectedTick || !safe(attempt) || (expectedAttempt !== undefined && attempt !== expectedAttempt) || !safe(nextSequence) || (status !== 1 && status !== 2)) return null;
  return {tick, nextSequence, delivery: status === 1 ? 'sent' : 'skipped', ...(attempt ? {attempt} : {})};
}
