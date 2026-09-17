import type { ExtensionResources } from '../Dependencies';
import type { Beam, Projectile, WeaponMount } from '../../simulation/Weapon';
import type { Ship } from '../../simulation/Ship';
import type { Vector2 } from '../../math/Vector2';
import type { WeaponSimContext } from '../../simulation/systems/weapon/WeaponSimContext';
export interface WeaponEffectDefinition {
  resources?: ExtensionResources;
  id: string;
  beam?: (beam: Beam, target: Ship | undefined, mount: WeaponMount | undefined, ctx: WeaponSimContext) => void;
  hitProjectile?: (projectile: Projectile, target: Projectile, point: Vector2, source: Ship | undefined, ctx: WeaponSimContext) => void;
  hit?: (projectile: Projectile, target: Ship, point: Vector2, shield: boolean, source: Ship | undefined, ctx: WeaponSimContext) => void;
  advance?: (ship: Ship, mount: WeaponMount, dt: number, ctx: WeaponSimContext) => void;
}
