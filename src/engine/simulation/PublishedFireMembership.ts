import type { Ship } from './Ship';
// Only native data-command Worker producers publish construction-owned arrays.
// No public callback gets to authorize a caller-built array; this is provenance,
// not a global "same elements" cache or a promise about live target eligibility.
const published = new WeakSet<readonly Ship[]>();
export function publishNativeFireMembership(ships: readonly Ship[]): void { published.add(ships); }
export function hasPublishedFireMembership(ships: readonly Ship[]): boolean { return published.has(ships); }
export const fireMembershipWork = { nativeSources: 0, uniqueSources: 0, reusedSources: 0, visitedRows: 0, skippedRows: 0 };
