import type { WeaponSpec } from '../simulation/Weapon';
import type { ShipSpec } from '../content/ShipSpec';
import { i18n } from '../i18n/LocalizationManager';
import { contentRegistry } from '../content/ContentRegistry';
import { validateShipSpec, validateWeaponSpec } from './ContentValidation';
import { validateStrings } from './ContentValidation';
import { immutableCopy } from '../extensions/Immutable';
import { builtInShips } from '../data/BuiltInShips';
import runtimeImportReport from '../data/generated/runtime-import-report.json';
import { registerUnavailableSourceSystem } from '../extensions/ship-systems/Registry';

export type { ShipSpec, WeaponMountSlotConfig, EngineSlotConfig, FighterWingSpec } from '../content/ShipSpec';

export interface ModPackage {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  ships?: ShipSpec[];
  weapons?: WeaponSpec[];
  i18n?: ShipSpec['i18n'];
}

/** Registration and validation only; source content and sandbox loadouts live in data/. */
export class ModManager {
  private static instance: ModManager;
  private loadedMods = new Map<string, ModPackage>();

  private constructor() {
    for (const [id, row] of Object.entries(runtimeImportReport.systems)) registerUnavailableSourceSystem(id, row);
    const ships = builtInShips();
    for (const ship of ships) validateStrings(ship.i18n);
    contentRegistry.registerPack(ships, [], false);
    for (const ship of ships) this.registerStrings(ship.i18n, true);
  }

  public static getInstance(): ModManager {
    return ModManager.instance ??= new ModManager();
  }

  public registerShip(spec: ShipSpec, options: { allowExistingId?: boolean; requireBundledAssets?: boolean } = {}) {
    validateStrings(spec.i18n);
    validateShipSpec(spec, options);
    for (const wing of spec.fighterWings ?? []) {
      if (contentRegistry.getShip(wing.specId)?.hullSize !== 'FIGHTER') throw new Error(`Invalid wing craft: ${wing.specId}`);
    }
    contentRegistry.registerShip(spec, options.allowExistingId);
    this.registerStrings(spec.i18n);
  }

  public requireShip(id: string): ShipSpec { const spec = contentRegistry.getShip(id); if (!spec) throw new Error(`Unknown ship: ${id}`); return spec; }
  public getShip(id: string): ShipSpec | undefined { return contentRegistry.getShip(id); }
  public getAllShips(): ShipSpec[] { return contentRegistry.getAllShips(); }
  public getWeapon(id: string): WeaponSpec | undefined { return contentRegistry.getWeapon(id); }

  public registerWeapon(spec: WeaponSpec) {
    validateWeaponSpec(spec);
    if (contentRegistry.getWeapon(spec.id)) throw new Error(`Weapon ID already registered: ${spec.id}`);
    contentRegistry.registerWeapon(spec);
  }

  private registerStrings(strings?: ShipSpec['i18n'], fallbackOnly = false): void {
    const originalLocale = i18n.getLocale();
    try {
      for (const locale of ['en_US','zh_CN'] as const) {
        if (!strings?.[locale]) continue;
        i18n.setLocale(locale);
        const entries = Object.entries(strings[locale]).filter(([key]) => !fallbackOnly || i18n.t(key) === key);
        i18n.registerStrings(locale, Object.fromEntries(entries));
      }
    } finally { i18n.setLocale(originalLocale); }
  }

  public loadMod(mod: ModPackage) {
    if (!mod || typeof mod !== 'object' || !mod.id?.trim() || !mod.version?.trim()) throw new Error('Mod requires id/version');
    if (this.loadedMods.has(mod.id)) throw new Error(`Mod ID already loaded: ${mod.id}`);
    const copy = immutableCopy(structuredClone(mod));
    validateStrings(copy.i18n);
    for (const ship of copy.ships ?? []) validateStrings(ship.i18n);
    contentRegistry.registerPack(copy.ships ?? [], copy.weapons ?? []);
    this.registerStrings(copy.i18n);
    for (const ship of copy.ships ?? []) this.registerStrings(ship.i18n);
    this.loadedMods.set(copy.id, copy);
  }
}

export const modManager = ModManager.getInstance();
