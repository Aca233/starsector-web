import type { ShipSpec } from './ShipSpec';
import { validateShipSpec, validateWeaponSpec } from '../modding/ContentValidation';
import { immutableCopy } from '../extensions/Immutable';
import type { WeaponSpec } from '../simulation/Weapon';
import { assetManager } from '../assets/AssetResolver';
import { WEAPON_REGISTRY } from '../data/WeaponRegistry';

/** One authoritative runtime registry for built-in and imported content. */
export class ContentRegistry {
  private currentRevision = 0;
  public get revision(): number { return this.currentRevision; }
  private ships = new Map<string, ShipSpec>();
  private weapons = new Map<string, WeaponSpec>();

  constructor() {
    for (const spec of Object.values(WEAPON_REGISTRY)) this.registerWeapon(spec, false);
  }

  registerShip(spec: ShipSpec, allowExistingId = false, requireBundledAssets = assetManager.isLoaded): void {
    validateShipSpec(spec, {registry:this, allowExistingId, requireBundledAssets});
    for (const wing of spec.fighterWings ?? []) if (this.ships.get(wing.specId)?.hullSize !== 'FIGHTER') throw new Error('Invalid wing craft: ' + wing.specId);
    if (spec.hullSize !== 'FIGHTER' && this.getAllShips().some(s=>s.fighterWings?.some(w=>w.specId === spec.id))) throw new Error('Cannot replace referenced fighter with a non-fighter: ' + spec.id);
    this.ships.set(spec.id, immutableCopy(structuredClone({ ...spec, sourceHullId: spec.sourceHullId ?? spec.id }))); this.currentRevision++;
  }
  registerWeapon(spec: WeaponSpec, requireBundledAssets = assetManager.isLoaded): void {
    if (this.weapons.has(spec.id)) throw new Error(`Duplicate weapon: ${spec.id}`);
    validateWeaponSpec(spec, requireBundledAssets);
    this.weapons.set(spec.id, immutableCopy(structuredClone(spec))); this.currentRevision++;
  }
  /** Validate the complete staged graph, then publish once. No callbacks or partial writes. */
  registerPack(ships: ShipSpec[], weapons: WeaponSpec[], requireBundledAssets = true): void {
    const stagedShips = new Map(this.ships), stagedWeapons = new Map(this.weapons);
    const copies = {ships: structuredClone(ships), weapons: structuredClone(weapons)};
    for (const spec of copies.weapons) {
      if (stagedWeapons.has(spec.id)) throw new Error('Duplicate weapon: ' + spec.id);
      validateWeaponSpec(spec, requireBundledAssets);
      stagedWeapons.set(spec.id, immutableCopy(spec));
    }
    for (const spec of copies.ships) {
      spec.sourceHullId ??= spec.id;
      if (stagedShips.has(spec.id)) throw new Error('Duplicate ship: ' + spec.id);
      stagedShips.set(spec.id, immutableCopy(spec));
    }
    const registry = {getShip:(id:string)=>stagedShips.get(id), getWeapon:(id:string)=>stagedWeapons.get(id)};
    for (const spec of copies.ships) {
      validateShipSpec(spec, {registry, allowExistingId:true, requireBundledAssets});
      for (const wing of spec.fighterWings ?? []) if (stagedShips.get(wing.specId)?.hullSize !== 'FIGHTER') throw new Error('Invalid wing craft: ' + wing.specId);
    }
    this.ships = stagedShips; this.weapons = stagedWeapons; this.currentRevision++;
  }
  getShip(id: string): ShipSpec | undefined { return this.ships.get(id); }
  getWeapon(id: string): WeaponSpec | undefined { return this.weapons.get(id); }
  getAllShips(): ShipSpec[] { return [...this.ships.values()]; }
  getAllWeapons(): WeaponSpec[] { return [...this.weapons.values()]; }

}

export const contentRegistry = new ContentRegistry();
