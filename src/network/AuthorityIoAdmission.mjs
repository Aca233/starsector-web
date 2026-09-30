/** Optional local backpressure hint, NOT credit or a remote ACK. One atomic
 * cell per private port: 0 revoked/unknown, 1 may try, 2 currently blocked.
 * Only I/O writes; authority never waits. The real send gate always rechecks. */
export function createAuthorityAdmission(enabled = false) {
  if (!enabled || typeof SharedArrayBuffer !== 'function') return null;
  const view = new Int32Array(new SharedArrayBuffer(4));
  Atomics.store(view, 0, 1);
  return view;
}
export function attachAuthorityAdmission(buffer) {
  return typeof SharedArrayBuffer === 'function' && buffer instanceof SharedArrayBuffer
    && buffer.byteLength === 4 ? new Int32Array(buffer) : null;
}
export function writeAuthorityAdmission(view, blocked) {
  if (view && Atomics.load(view, 0) !== 0) Atomics.store(view, 0, blocked ? 2 : 1);
}
export function closeAuthorityAdmission(view) {
  if (view) Atomics.store(view, 0, 0);
}
export function isAuthoritySnapshotBlocked(view) {
  return view !== null && Atomics.load(view, 0) === 2;
}
