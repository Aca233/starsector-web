import type { Projectile, LauncherSmokeSpec, WeaponMount } from '../../simulation/Weapon';
import type { ExtensionResources } from '../Dependencies';
import type { Ship } from '../../simulation/Ship';
import type { ShipSystem } from '../../simulation/ShipSystem';
import type { Vector2 } from '../../math/Vector2';
import type { SimulationRandom } from '../../simulation/SimulationRandom';

export interface SystemWorld {
  ships: Ship[];
  /** Teleports fail closed until the caller supplies the actual obstacle list (empty is valid). */
  asteroids?: readonly { pos: Vector2; radius: number; hp?: number }[];
  combatRandom: SimulationRandom;
  projectiles?: Projectile[];
  spawnSystemSmoke?: (spec: LauncherSmokeSpec, pos: Vector2, facing: number, velocity: Vector2) => void;
  deployReserveWing?: (carrier: Ship) => void;
  deployMine: (position: Vector2, source: Ship, range?: number) => void;
}
export interface SystemAIContext {
  ship: Ship; system?: ShipSystem; target: Ship; distance: number; angleDiff: number;
  tactical?: { desiredRange:number; withdrawing:boolean; waypoint:boolean; avoidingCollision:boolean; forwardClear:boolean; quietFor:number; threat:import('../../ai/ThreatAssessment').ThreatAssessment };
}
export type SystemWeaponType = 'BALLISTIC' | 'ENERGY' | 'MISSILE';
export interface SystemWeaponModifiers {
  damageMultiplier?: number; rateOfFireMultiplier?: number; fluxCostMultiplier?: number;
  rangePercent?: number; projectileSpeedPercent?: number;
}
export interface SystemModifiers {
  shieldDamageMultiplier?: number; shieldUpkeepMultiplier?: number;
  hullDamageMultiplier?: number; armorDamageMultiplier?: number; empDamageMultiplier?: number;
  repairTimeMultiplier?: number; timeMultiplier?: number;
  beamDamageMultiplier?: number; recoilMultiplier?: number;
  fighterDamageMultiplier?: number;
  hardFluxPerSecond?: number; softFluxPerSecond?: number;
  speedFlat?: number; accelerationFlat?: number;
  /** Percent bonuses compose additively with hullmods; flats apply first. Angular flats are in degrees. */
  accelerationPercent?: number; decelerationPercent?: number;
  turnRateFlat?: number; turnRatePercent?: number;
  turnAccelerationFlat?: number; turnAccelerationPercent?: number;
  weapons?: Partial<Record<SystemWeaponType, SystemWeaponModifiers>>;
}
export interface ShipSystemDefinition {
  resources?: ExtensionResources;
  id: string;
  sourceIds: readonly string[];
  name: string;
  /** Catalogued source timing is not a combat implementation and must never activate. */
  unavailable?: boolean;
  description?: string;
  /** Source-backed effects and any deliberate adapter limitations, suitable for readiness UI. */
  implementationDetails?: string;
  chargeUp: number; active: number; chargeDown: number; cooldown: number;
  toggle?: boolean; charges?: number; chargeRegen?: number;
  fluxPerUseFraction?: number; hardFlux?: boolean;
  controls?: { blockWeapons?: boolean; blockShields?: boolean; lockTurning?: boolean; forceForward?: boolean; cancelOnFlameout?: boolean; suppressZeroFlux?: boolean; blockFluxDissipation?: boolean; blockVenting?: boolean };
  phase?: { vulnerableChargeUp?: boolean; vulnerableChargeDown?: boolean };
  visuals?: { engineBoost?: boolean; fortressShield?: boolean };
  audio?: { activate?: string; loop?: string; loopVolume?: number; deactivate?: string };
  passiveModifiers?: (system: ShipSystem, owner?: Ship) => SystemModifiers;
  weaponEnabled?: (system: ShipSystem, mount: WeaponMount) => boolean;
  modifiers?: (system: ShipSystem, baseCapacity: number, owner?: Ship) => SystemModifiers;
  /** Actual asynchronous execution, separate from CSV charge/cooldown timing (native weapon systems). */
  isExecuting?: (system: ShipSystem) => boolean;
  canActivate?: (ship: Ship) => boolean;
  /** Captured atomically when input is accepted, before a later frame can retarget. */
  selectTarget?: (ship: Ship) => Ship | undefined;
  initialize?: (system: ShipSystem, ship: Ship) => void;
  onActivate?: (ship: Ship, world: SystemWorld, system: ShipSystem) => void;
  onActive?: (ship: Ship, world: SystemWorld, system: ShipSystem) => void;
  onAdvance?: (ship: Ship, dt: number, world: SystemWorld, system: ShipSystem) => void;
  /** Web AI policy lives with the behavior, not in hull-ID branches. */
  advanceAI?: (context: SystemAIContext) => void;
}
