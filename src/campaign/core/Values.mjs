/** JSON-only state boundary, shared by Node authority and browser clients. */
export class CampaignError extends Error {
  constructor(code, message) { super(message); this.name = 'CampaignError'; this.code = code; }
}
export const requireThat = (condition, code, message) => { if (!condition) throw new CampaignError(code, message); };
export const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
export function identifier(value, label = 'id') {
  requireThat(typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(value)
    && !['__proto__', 'prototype', 'constructor'].includes(value), 'INVALID_ID', `Invalid ${label}`);
  return value;
}
/** Native weapon/module slot IDs include spaces (e.g. "WS 001"); they are not entity IDs. */
export function slotIdentifier(value) {
  requireThat(typeof value === 'string' && value.length > 0 && value.length <= 128 && value.trim() === value
    && Array.from(value).every(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127), 'INVALID_SLOT_ID', 'Invalid native slot ID');
  return value;
}
export function finite(value, label, minimum = -Number.MAX_VALUE, maximum = Number.MAX_VALUE) {
  requireThat(typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum,
    'INVALID_NUMBER', `Invalid ${label}`); return value;
}
export function integer(value, label, minimum = 0) {
  finite(value, label, minimum, Number.MAX_SAFE_INTEGER);
  requireThat(Number.isSafeInteger(value), 'INVALID_INTEGER', `Invalid ${label}`); return value;
}
export function jsonCopy(value) {
  let count = 0; const ancestors = new Set();
  const visit = (v, depth) => {
    requireThat(depth <= 48 && ++count <= 250000, 'STATE_LIMIT', 'JSON state exceeds bounds');
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'number') return finite(v, 'JSON number');
    if (typeof v === 'string') { requireThat(v.length <= 1048576, 'STATE_LIMIT', 'JSON string too long'); return v; }
    requireThat(Array.isArray(v) || isRecord(v), 'INVALID_JSON', 'State must contain only JSON values');
    requireThat(!ancestors.has(v), 'INVALID_JSON', 'Cyclic state'); ancestors.add(v);
    let result;
    if (Array.isArray(v)) result = Array.from(v, child => visit(child, depth + 1));
    else {
      result = {};
      for (const key of Object.keys(v).sort()) {
        requireThat(!['__proto__', 'prototype', 'constructor'].includes(key), 'INVALID_JSON', 'Unsafe state key');
        const descriptor = Object.getOwnPropertyDescriptor(v, key);
        requireThat(descriptor && Object.hasOwn(descriptor, 'value'), 'INVALID_JSON', 'Accessors are not state');
        result[key] = visit(descriptor.value, depth + 1);
      }
    }
    ancestors.delete(v); return result;
  };
  return visit(value, 0);
}
export const canonicalJSON = value => JSON.stringify(jsonCopy(value));
export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
export const immutableJSON = value => deepFreeze(jsonCopy(value));
