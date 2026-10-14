import type { ShipSpec } from '../content/ShipSpec';
import type { WeaponSpec } from '../simulation/Weapon';
import type { AssetManifestEntry } from '../assets/AssetResolver';

export interface PackFit {
  hullId: string; weapons: Record<string, string | null>; hullMods: string[]; sMods: string[];
  sourceVariantId?: string; systemTypes?: string[]; rightClickSystemType?: string;
  wings: (string | null)[]; capacitors: number; vents: number;
  groups: {index: number; weaponSlotIds: string[]; mode: 'LINKED' | 'ALTERNATING'; isAutofire: boolean}[];
  modules?: Record<string, PackFit>;
}
export interface PackVariant {
  id: string; name: string; fit: PackFit; preserveWings?: boolean; warnings?: string[];
}
export interface ShipPackCapabilityRequirement {
  id: string; minVersion: number; scope: 'combat' | 'campaign';
}
export interface ShipPackDependency { id: string; minVersion: string }
export interface PackWing {
  specId: string; role: 'FIGHTER' | 'BOMBER'; count: number; rebuildSeconds: number; op: number; name: string;
  tags?: string[]; description?: string; range?: number | null;
}
export interface PackRefit {
  ships: Record<string, {op: number; name: string; manufacturer: string; designation: string}>;
  weapons: Record<string, {op: number; name: string; builtInOnly?: boolean}>;
  wings?: Record<string, PackWing>;
  shipStatus: Record<string, {level: 'supported' | 'approximate' | 'unsupported'; reasons: string[]}>;
  weaponStatus?: Record<string, {level: 'supported' | 'approximate' | 'unsupported'; reasons: string[]}>;
}
/** Data only. Required behavior ABI is implemented by the trusted host build. */
export interface ShipPack {
  schema: 1; id: string; name: string; version: string; author: string; description: string;
  mainHull: string; hostABI: 'ship-pack-host-1'; behavior: string;
  /** Optional in ABI 1. Actual data references are always checked as well. */
  capabilities?: ShipPackCapabilityRequirement[];
  dependencies?: ShipPackDependency[];
  ships: ShipSpec[]; weapons: WeaponSpec[];
  baselines: Record<string, ShipSpec>; refit: PackRefit; variants?: PackVariant[];
  i18n?: ShipSpec['i18n'];
  assetRoots: string[]; extraTextures?: string[];
  sources: string[];
}
export interface ShipPackAsset { entry: AssetManifestEntry; sha256: string; base64: string; mime: string }
export interface ShipPackFile {
  format: 'starship-foundry-ship-pack'; version: 1; pack: ShipPack;
  assets: ShipPackAsset[]; hostAssets: string[];
}
export interface ShipPackProfile { revision: number; disabled: string[]; installed: ShipPackFile[] }

/** Strip removable equipment only when publishing a hull baseline. Never touch saves. */
export function emptyPackHull(input: ShipSpec): ShipSpec {
  const ship = structuredClone(input);
  if (ship.hullSize === 'FIGHTER') return ship;
  ship.weaponSlots = ship.weaponSlots.map(slot => slot.builtIn ? slot : {...slot, defaultWeaponId: undefined});
  const equipped = new Set(ship.weaponSlots.filter(slot => slot.defaultWeaponId).map(slot => slot.slotId));
  ship.defaultWeaponGroups = ship.defaultWeaponGroups?.map(group => ({...group, weaponSlotIds: group.weaponSlotIds.filter(id => equipped.has(id))}));
  ship.hullMods = []; ship.sMods = []; ship.fighterWings = [];
  ship.modules = ship.modules?.map(module => ({...module, spec: emptyPackHull(module.spec)}));
  return ship;
}
