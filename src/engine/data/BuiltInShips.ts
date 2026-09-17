import { normalizeSourceCapabilities } from './SourceCapabilities';
import presentation from './PresentationPolicy';
import sourceShips from './generated/ships.json';
import loadouts from './generated/loadouts.json';
import type { ShipSpec } from '../content/ShipSpec';
export interface SandboxLoadout {
  weapons: Record<string,string>;
  groups?: ShipSpec['defaultWeaponGroups'];
  hullMods?: string[];
  armorCols?: number; armorRows?: number;
}
/** A hull does not require a hand-maintained preset; built-in equipment remains intact. */
export function assembleShip(source: ShipSpec, loadout?: SandboxLoadout): ShipSpec {
  for (const slotId of Object.keys(loadout?.weapons ?? {})) {
    if (!source.weaponSlots.some(s => s.slotId === slotId)) throw new Error(`${source.id}: loadout references missing slot ${slotId}`);
  }
  return normalizeSourceCapabilities({ ...structuredClone(source),
    armorCols: loadout?.armorCols ?? source.armorCols,
    armorRows: loadout?.armorRows ?? source.armorRows,
    hullMods: structuredClone(loadout?.hullMods ?? source.hullMods ?? []),
    weaponSlots: source.weaponSlots.map(slot => ({...slot,builtIn:slot.builtIn ?? !!slot.defaultWeaponId,defaultWeaponId:slot.defaultWeaponId ?? loadout?.weapons[slot.slotId]})),
    defaultWeaponGroups: structuredClone(loadout?.groups ?? source.defaultWeaponGroups)
  });
}
export function builtInShips(): ShipSpec[] {
  return Object.values(sourceShips).map(raw=>assembleShip({...raw, ...(presentation.ships as unknown as Record<string, Partial<ShipSpec>>)[raw.id]} as ShipSpec, (loadouts as Record<string,SandboxLoadout>)[raw.id]));
}
