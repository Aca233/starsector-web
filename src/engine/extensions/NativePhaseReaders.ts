/** Tags only audited, side-effect-free built-in phase-alpha callbacks. This is not
 * an extension registration API or a security boundary; unknown readers fail open
 * to the compatibility renderer at epoch creation. The callback is not wrapped. */
type PhaseReader = () => number | undefined;
const nativeReaders = new WeakSet<PhaseReader>();
export function nativePhaseReader<T extends PhaseReader>(reader: T): T {
  nativeReaders.add(reader);
  return reader;
}
export function hasOnlyNativePhaseReaders(readers: ReadonlyMap<object, PhaseReader>): boolean {
  for (const reader of readers.values()) if (!nativeReaders.has(reader)) return false;
  return true;
}
