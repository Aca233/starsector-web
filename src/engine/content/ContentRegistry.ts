import type { ShipSpec } from '../modding/ModManager';
import type { WeaponSpec } from '../simulation/Weapon';
import { WEAPON_REGISTRY } from '../data/WeaponRegistry';

/** One authoritative runtime registry for built-in and imported content. */
export class ContentRegistry {
  private ships = new Map<string, ShipSpec>();
  private weapons = new Map<string, WeaponSpec>();

  constructor() {
    for (const spec of Object.values(WEAPON_REGISTRY)) this.weapons.set(spec.id, spec);
  }

  registerShip(spec: ShipSpec): void { this.ships.set(spec.id, spec); }
  registerWeapon(spec: WeaponSpec): void { this.weapons.set(spec.id, spec); }
  unregisterWeapon(id: string): void { this.weapons.delete(id); }
  getShip(id: string): ShipSpec | undefined { return this.ships.get(id); }
  getWeapon(id: string): WeaponSpec | undefined { return this.weapons.get(id); }
  getAllShips(): ShipSpec[] { return [...this.ships.values()]; }
  getAllWeapons(): WeaponSpec[] { return [...this.weapons.values()]; }

  clearImportedShips(): void {
    this.ships.clear();
  }
}

export const contentRegistry = new ContentRegistry();
