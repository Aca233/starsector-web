import type { ShipSpec } from '../modding/ModManager';
import type { WeaponSpec } from '../simulation/Weapon';

export interface ContentManifest {
  version: number;
  ships: string[];
  weapons: string[];
  locales: string[];
  visualProfiles?: string[];
}

export interface ContentPackage {
  id: string;
  name: string;
  version: string;
  author?: string;
  description?: string;
  ships?: ShipSpec[];
  weapons?: WeaponSpec[];
  locales?: Record<string, Record<string, string>>;
}
