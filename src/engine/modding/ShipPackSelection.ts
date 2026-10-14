import type { ShipPackProfile, ShipPack } from './ShipPack';
// Populated before importing App. Workers receive the selected descriptors with their content snapshot.
let profile: ShipPackProfile = {revision: 0, disabled: [], installed: []};
export function setShipPackProfile(value: ShipPackProfile): void { profile = value; }
export function shipPackProfile(): ShipPackProfile { return profile; }
/** LAN/Steam package metadata negotiation is outside ABI 1; do not silently mix catalogs. */
export function hasCustomShipPackSelection(): boolean { return profile.disabled.length > 0 || profile.installed.length > 0; }
export function selectShipPacks(bundled: readonly ShipPack[]): ShipPack[] {
  const replacements = new Set(profile.installed.map(file => file.pack.id));
  return [...bundled.filter(pack => !profile.disabled.includes(pack.id) && !replacements.has(pack.id)),
    ...profile.installed.filter(file => !profile.disabled.includes(file.pack.id)).map(file => file.pack)];
}
