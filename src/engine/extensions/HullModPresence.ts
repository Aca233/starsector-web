import { isImmutableMetadata } from './Immutable';

const nativeIncludes = Array.prototype.includes;
const verifiedIncludes = typeof nativeIncludes === 'function' && Function.prototype.toString.call(nativeIncludes) === 'function includes() { [native code] }';
const apply = Reflect.apply;
const vastBulkLists = new WeakMap<readonly string[], boolean>();

/** Membership only, never ship state. Observe the live method even on cache hits.
 * Registered dense metadata owns every index; holes could observe mutable prototype
 * entries, and caller-frozen arrays/accessors are not trusted metadata. */
export function containsVastBulk(mods: readonly string[] | null | undefined): boolean {
  if (mods == null) return false;
  const includes = mods.includes;
  if (verifiedIncludes && includes === nativeIncludes) {
    const cached = vastBulkLists.get(mods);
    if (cached !== undefined) return cached;
    const result = apply(includes, mods, ['vastbulk']);
    if (isImmutableMetadata(mods) && Object.getPrototypeOf(mods) === Array.prototype) {
      let dense = true;
      for (let i = 0; i < mods.length; i++) {
        const descriptor = Object.getOwnPropertyDescriptor(mods, String(i));
        if (!descriptor || !('value' in descriptor)) { dense = false; break; }
      }
      if (dense) vastBulkLists.set(mods, result);
    }
    return result;
  }
  return apply(includes, mods, ['vastbulk']);
}
