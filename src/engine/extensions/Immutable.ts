// Only metadata created here is known to be recursively copied/frozen, without accessors.
const immutableMetadata = new WeakSet<object>();
export function isImmutableMetadata(value: object): boolean { return immutableMetadata.has(value); }

/** Copy plain metadata without freezing caller-owned objects; behavior functions stay callable. */
export function immutableCopy<T>(value: T): T {
  if (Array.isArray(value)) {
    const copy = Object.freeze(value.map(immutableCopy));
    immutableMetadata.add(copy);
    return copy as T;
  }
  if (value && typeof value === 'object') {
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new Error('Definition metadata must contain plain objects/arrays');
    const copy = Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, immutableCopy(child)])));
    immutableMetadata.add(copy);
    return copy as T;
  }
  return value;
}
