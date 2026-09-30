const arrayMap: unknown = Array.prototype.map;
const ownedArrays = new WeakSet<readonly unknown[]>();
function hasNativeMap(source: readonly unknown[]): boolean {
  return Object.getPrototypeOf(source) === Array.prototype && !Object.hasOwn(source, 'map')
    && !Object.hasOwn(source, 'constructor') && source.map === arrayMap
    && source.constructor === Array && Array[Symbol.species] === Array;
}
/** Reuse a projector-owned list, not a source array or a published packet.
 * Stable list identities let the display delta encoder send changed membership
 * only; each element is still freshly projected. Keep native map's captured
 * length and holes, and retain custom mapper/species behavior on the old path. */
export function updateProjectionArray<T, R>(previous: readonly R[] | undefined, source: readonly T[], project: (item: T) => R): R[] {
  if (!hasNativeMap(source)) return source.map(project);
  const target = (previous && ownedArrays.has(previous) ? previous : []) as R[], length = source.length;
  ownedArrays.add(target);
  for (let i = 0; i < length; i++) {
    if (i in source) target[i] = project(source[i]);
    else delete target[i];
  }
  target.length = length;
  return target;
}
