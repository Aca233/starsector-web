import { immutableCopy } from '../extensions/Immutable';
import { contentRegistry } from './ContentRegistry';
import { validateShipSpec, validateWeaponSpec } from '../modding/ContentValidation';

export interface ContentLoadoutEntry {
  id: string;
  shipId: string;
  source: 'ship-defaults';
}

export interface ContentManifest {
  schemaVersion: number;
  contentVersion: string;
  ships: string[];
  weapons: string[];
  loadouts: ContentLoadoutEntry[];
  visualProfiles: string[];
  locales: string[];
}

const SUPPORTED_SCHEMA_VERSION = 1;

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function uniqueStrings(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const result = value.map((item, index) => nonEmptyString(item, `${label}[${index}]`));
  const unique = new Set(result);
  if (unique.size !== result.length) throw new Error(`${label} contains duplicate IDs`);
  return result;
}

/** Loads and validates the repository-owned content contract before combat assets are accepted. */
export class ContentManifestManager {
  private manifest: ContentManifest | null = null;
  private registryRevision = -1;
  private loadPromise: Promise<void> | null = null;

  public get current(): ContentManifest | null { return this.manifest; }

  public async ensureLoaded(url?: string): Promise<void> {
    if (!url) {
      if (this.registryRevision === contentRegistry.revision) return;
      const ships = contentRegistry.getAllShips(), weapons = contentRegistry.getAllWeapons();
      for (const ship of ships) validateShipSpec(ship, {allowExistingId:true, requireBundledAssets:true});
      for (const weapon of weapons) validateWeaponSpec(weapon, true);
      this.manifest = immutableCopy({schemaVersion:1, contentVersion:'runtime-' + contentRegistry.revision,
        ships:ships.map(s=>s.id), weapons:weapons.map(w=>w.id),
        loadouts:ships.map(s=>({id:s.id+'-default',shipId:s.id,source:'ship-defaults'})), visualProfiles:[],locales:['zh_CN','en_US']});
      this.registryRevision = contentRegistry.revision;
      return;
    }
    // Explicit external manifests remain strict; built-in runtime has no second ID list.
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = this.load(url);
    try {
      await this.loadPromise;
    } finally {
      this.loadPromise = null;
    }
  }

  private async load(url: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load content manifest: ${response.status}`);
    const raw = await response.json() as Record<string, unknown>;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Content manifest must be an object');
    if (raw.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
      throw new Error(`Unsupported content manifest schemaVersion: ${String(raw.schemaVersion)}`);
    }

    const ships = uniqueStrings(raw.ships, 'content.ships');
    const weapons = uniqueStrings(raw.weapons, 'content.weapons');
    const visualProfiles = uniqueStrings(raw.visualProfiles, 'content.visualProfiles');
    const locales = uniqueStrings(raw.locales, 'content.locales');
    const contentVersion = nonEmptyString(raw.contentVersion, 'content.contentVersion');
    if (!Array.isArray(raw.loadouts)) throw new Error('content.loadouts must be an array');

    const loadoutIds = new Set<string>();
    const loadoutShipIds = new Set<string>();
    const loadouts = raw.loadouts.map((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`content.loadouts[${index}] must be an object`);
      const record = entry as Record<string, unknown>;
      const id = nonEmptyString(record.id, `content.loadouts[${index}].id`);
      const shipId = nonEmptyString(record.shipId, `content.loadouts[${index}].shipId`);
      if (record.source !== 'ship-defaults') throw new Error(`content.loadouts[${index}].source is unsupported`);
      if (loadoutIds.has(id)) throw new Error(`Duplicate loadout ID: ${id}`);
      if (loadoutShipIds.has(shipId)) throw new Error(`Multiple default loadouts declared for ship: ${shipId}`);
      loadoutIds.add(id);
      loadoutShipIds.add(shipId);
      return { id, shipId, source: 'ship-defaults' as const };
    });

    const shipSet = new Set(ships);
    const weaponSet = new Set(weapons);
    for (const loadout of loadouts) {
      if (!shipSet.has(loadout.shipId)) throw new Error(`Loadout ${loadout.id} references undeclared ship: ${loadout.shipId}`);
    }

    for (const shipId of ships) {
      const ship = contentRegistry.getShip(shipId);
      if (!ship) throw new Error(`Content manifest references missing ship: ${shipId}`);
      validateShipSpec(ship, { allowExistingId: true, requireBundledAssets: true });
      if (!loadoutShipIds.has(shipId)) throw new Error(`Ship has no declared default loadout: ${shipId}`);
    }
    for (const weaponId of weapons) {
      const weapon = contentRegistry.getWeapon(weaponId);
      if (!weapon) throw new Error(`Content manifest references missing weapon: ${weaponId}`);
      validateWeaponSpec(weapon, true);
    }
    for (const ship of contentRegistry.getAllShips()) {
      if (!shipSet.has(ship.id)) throw new Error(`Registered ship missing from content manifest: ${ship.id}`);
    }
    for (const weapon of contentRegistry.getAllWeapons()) {
      if (!weaponSet.has(weapon.id)) throw new Error(`Registered weapon missing from content manifest: ${weapon.id}`);
    }

    this.registryRevision = -1;
    this.manifest = immutableCopy({
      schemaVersion: SUPPORTED_SCHEMA_VERSION,
      contentVersion,
      ships,
      weapons,
      loadouts,
      visualProfiles,
      locales
    });
  }
}

export const contentManifestManager = new ContentManifestManager();
