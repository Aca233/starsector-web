// The worker and browser must resolve IDs against the same data, not silently use
// a bundled hull where the browser has installed a replacement with the same ID.
import '../../simulation/CombatEngine';
import { contentRegistry } from '../../content/ContentRegistry';
let revision = -1, signature = '';
export function localCombatContentSignature(): string {
  if (revision === contentRegistry.revision) return signature;
  const data = JSON.stringify([contentRegistry.getAllShips(), contentRegistry.getAllWeapons()], (_key, value) =>
    value === undefined ? ['undefined'] : typeof value === 'number' && (!Number.isFinite(value) || Object.is(value, -0))
      ? ['number', String(value), Object.is(value, -0)] : value);
  // Compatibility fingerprint, NOT a security/authentication primitive.
  let a = 0x811c9dc5, b = 0x9e3779b9;
  for (let i = 0; i < data.length; i++) { const code = data.charCodeAt(i); a = Math.imul(a ^ code, 0x01000193); b = Math.imul(b ^ code, 0x85ebca6b); }
  signature = `${data.length}:${a >>> 0}:${b >>> 0}`; revision = contentRegistry.revision;
  return signature;
}
