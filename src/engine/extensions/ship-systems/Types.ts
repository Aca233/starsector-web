import type { Projectile, LauncherSmokeSpec, WeaponMount } from '../../simulation/Weapon';
import type { ExtensionResources } from '../Dependencies';
import type { Ship } from '../../simulation/Ship';
import type { ShipSystem } from '../../simulation/ShipSystem';
import type { Vector2 } from '../../math/Vector2';
import type { SimulationRandom } from '../../simulation/SimulationRandom';

export interface SystemWorld {
  /** Stable identity for a battle; changes on restart, never sent as snapshot data. */
  combatScope?: object;
  spawnNativeMine?: (position: Vector2, source: Ship, weapon: import('../NativeMines').NativeMineWeapon, target: Ship) => void;
  ships: Ship[];
  spawnShip?: (spec: import('../../content/ShipSpec').ShipSpec, source: Ship, pos: Vector2, facing: number) => Ship;
  /** Runs independently of the originating ship/system. Return true when expired. */
  addCombatEffect?: (advance: (dt: number) => boolean) => void;
  /** Teleports fail closed until the caller supplies the actual obstacle list (empty is valid). */
  asteroids?: readonly { pos: Vector2; radius: number; hp?: number }[];
  combatRandom: SimulationRandom;
  projectiles?: Projectile[];
  spawnSystemArc?: (from: Vector2, to: Vector2, color?: [number, number, number]) => void;
  spawnSystemSmoke?: (spec: LauncherSmokeSpec, pos: Vector2, facing: number, velocity: Vector2) => void;
  deployReserveWing?: (carrier: Ship) => void;
  recoverWingCraft?: (carrier: Ship, craft: Ship) => void;
  detachWingCraft?: (carrier: Ship, craft: Ship) => boolean;
  retireCombatCraft?: (craft: Ship) => void;
  advanceDroneLauncher?: (carrier: Ship, system: ShipSystem, dt: number) => void;
  deployMine: (position: Vector2, source: Ship, range?: number) => void;
}
export interface SystemAIContext {
  ship: Ship; system?: ShipSystem; target: Ship; distance: number; angleDiff: number;
  tactical?: { desiredRange:number; withdrawing:boolean; waypoint:boolean; avoidingCollision:boolean; forwardClear:boolean; quietFor:number; threat:import('../../ai/ThreatAssessment').ThreatAssessment };
}
export type SystemWeaponType = 'BALLISTIC' | 'ENERGY' | 'MISSILE';
export interface SystemWeaponModifiers {
  damageMultiplier?: number; rateOfFireMultiplier?: number; fluxCostMultiplier?: number;
  rangePercent?: number; projectileSpeedPercent?: number; ammoRegenMultiplier?: number;
}
export interface SystemModifiers {
  disableWeapons?: number; disableDefense?: number; disableMotion?: number; disableVenting?: number; disableSystems?: number;
  collisionDisabled?: number; visualAlphaMultiplier?: number;
  sightRadiusFlat?: number; sightRadiusPercent?: number;
  shieldDamageMultiplier?: number; shieldUpkeepMultiplier?: number;
  hullDamageMultiplier?: number; armorDamageMultiplier?: number; empDamageMultiplier?: number;
  repairTimeMultiplier?: number; timeMultiplier?: number;
  beamDamageMultiplier?: number; recoilMultiplier?: number;
  fighterDamageMultiplier?: number;
  hardFluxPerSecond?: number; softFluxPerSecond?: number;
  speedFlat?: number; speedPercent?: number; accelerationFlat?: number; decelerationFlat?: number;
  dissipationMultiplier?: number;
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
  /** Starting stock may differ from capacity (e.g. overseer-activated systems). */
  initialCharges?: number;
  onEnergyLash?: (system: ShipSystem, owner: Ship, overseer: Ship) => void;
  tacticalMode?: 'ASSAULT' | 'EXTRACT';
  /** Drone launchers spend stock on launch, never on an order change. */
  usesChargesForActivation?: boolean;
  statusText?: (system: ShipSystem) => string;
  fluxPerUseFraction?: number; fluxPerUseFlat?: number; fluxPerUseDissipationFraction?: number; hardFlux?: boolean;
  controls?: { blockWeapons?: boolean; blockShields?: boolean; lockTurning?: boolean; forceForward?: boolean; cancelOnFlameout?: boolean; suppressZeroFlux?: boolean; blockFluxDissipation?: boolean; blockVenting?: boolean; blockAcceleration?: boolean; blockStrafing?: boolean; forceAutofire?: boolean; releaseOnOut?: boolean };
  phase?: { vulnerableChargeUp?: boolean; vulnerableChargeDown?: boolean };
  visuals?: { engineBoost?: boolean; fortressShield?: boolean };
  audio?: { activate?: string; loop?: string; loopVolume?: number; deactivate?: string };
  passiveModifiers?: (system: ShipSystem, owner?: Ship) => SystemModifiers;
  weaponEnabled?: (system: ShipSystem, mount: WeaponMount) => boolean;
  modifiers?: (system: ShipSystem, baseCapacity: number, owner?: Ship) => SystemModifiers;
  /** Actual asynchronous execution, separate from CSV charge/cooldown timing (native weapon systems). */
  isExecuting?: (system: ShipSystem) => boolean;
  canActivate?: (ship: Ship) => boolean;
  canVent?: (system: ShipSystem) => boolean;
  /** Tactical AI policy only; never removes the player's vent command. */
  preventAIVenting?: (system: ShipSystem) => boolean;
  /** Impulse/braking plugins can outlive the charge tracker and overlap later activations. */
  motionControl?: (system: ShipSystem) => { blockAcceleration?: boolean; forceBrake?: boolean };
  /** Captured atomically when input is accepted, before a later frame can retarget. */
  selectTarget?: (ship: Ship) => Ship | undefined;
  initialize?: (system: ShipSystem, ship: Ship) => void;
  onReset?: (system: ShipSystem, owner?: Ship) => void;
  onActivate?: (ship: Ship, world: SystemWorld, system: ShipSystem) => void;
  onActive?: (ship: Ship, world: SystemWorld, system: ShipSystem) => void;
  onAdvance?: (ship: Ship, dt: number, world: SystemWorld, system: ShipSystem) => void;
  /** Web AI policy lives with the behavior, not in hull-ID branches. */
  advanceAI?: (context: SystemAIContext) => void;
}
