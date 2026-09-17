import factionData from '../engine/data/generated/refit-factions.json';

/** Original faction availability, not an exclusive manufacturer or ownership label. */
export const factionIndex = factionData as {
  factions: { id: string; name: string }[];
  hullFactions: Record<string, string[]>;
  weaponFactions: Record<string, string[]>;
};

const unassigned = '__unassigned';
export function matchesFaction(filter: string, memberships: readonly string[] = []): boolean {
  return !filter || (filter === unassigned ? memberships.length === 0 : memberships.includes(filter));
}

