/** Callers validate type, encoded length and their wire alphabet BEFORE entry,
 * then still validate decoded size/schema/CRC. No payload cache or buffer pool.
 * Default (loose) tail handling intentionally matches atob's acceptance of
 * non-zero unused padding bits; strict handling would change the protocol. */
export function decodeBase64Bytes(text) {
  if (typeof Uint8Array.fromBase64 === 'function') return Uint8Array.fromBase64(text);
  const raw = atob(text), bytes = new Uint8Array(raw.length);
  // Avoid Uint8Array.from's generic iterable + per-character mapping callback.
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
