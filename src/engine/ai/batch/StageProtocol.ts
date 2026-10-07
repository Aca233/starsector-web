import type { Ship } from '../../simulation/Ship';
import type { Projectile, Beam, WeaponMount } from '../../simulation/Weapon';
import type { Asteroid, HulkFragment } from '../../simulation/CombatTypes';
import type { AIStageData } from './AIInputs';

/** ABI v1. Rows are semantic roster order, not handles. Handles never recycle
 * within an owner; generation is explicit so consumers cannot retain a row as
 * an identity across captures. All scalar columns (including enums) are f64. */
export type StageKind = 'AI_PLAN' | 'AI_EFFECT_READ' | 'FIRE_QUERY' | 'PROJECTILE_CONTACT';
export const BodyFlag = Object.freeze({
  DEAD: 1, COLLISIONLESS: 2, RETREATED: 4, DOCKED: 8, FIGHTER: 16,
  PHASED: 32, OVERLOADED: 64, VENTING: 128, WEAPONS_BLOCKED: 256,
  ATTACHED: 512, HOLD_FIRE: 1024, MANUAL: 2048
});
export const WeaponFlag = Object.freeze({
  DISABLED: 1, PD: 2, PD_ONLY: 4, BEAM: 8, GUIDED: 16, MISSILE: 32,
  HARDPOINT: 64, ALWAYS_FIRE: 128, AUTOFIRE: 256, SYSTEM_ONLY: 512
});
export const ProjectileFlag = Object.freeze({
  ROCKET: 1, GUIDED: 2, FLARE: 4, MINE: 8, NO_COLLISION: 16,
  FILTER_TEAM: 32, DISARMED: 64, INERTIAL: 128
});
export const DamageCode = Object.freeze({ KINETIC: 0, HIGH_EXPLOSIVE: 1, ENERGY: 2, FRAGMENTATION: 3 });
export const bodyKeys = [
  'handle', 'generation', 'x', 'y', 'vx', 'vy', 'facing', 'angularVelocity', 'radius',
  'team', 'flags', 'assemblyRootRow', 'geometryRow', 'hullReach',
  'shieldX', 'shieldY', 'shieldRadius', 'shieldArc', 'shieldHalfArcCos', 'shieldFacing', 'shieldActive',
  'shieldType', 'shieldEfficiency', 'shieldDamageMultiplier', 'shieldEnergyMultiplier',
  'shieldSystemMultiplier', 'shieldVoid', 'shieldMaxArc', 'shieldUnfoldDuration',
  'phaseUpDuration', 'phaseDownDuration', 'phaseCooldownDuration', 'phaseEffectLevel',
  'hp', 'maxHp', 'softFlux', 'hardFlux', 'maxFlux', 'fluxPercent', 'dissipation',
  'overloadTimer', 'ventTime', 'crDamageMultiplier', 'maxSpeed', 'acceleration',
  'deceleration', 'maxTurnRate', 'turnAcceleration', 'turnDeceleration',
  'weaponFirst', 'weaponCount', 'visibilityMask', 'size', 'systemRecovery',
  'armorRating', 'mass', 'shieldPiercedMultiplier'
] as const;
export const weaponKeys = [
  'handle', 'generation', 'ownerRow', 'muzzleX', 'muzzleY', 'muzzleExtent',
  'angle', 'baseAngle', 'halfArc', 'arc', 'effectiveRange', 'speed', 'maxSpeed',
  'readiness', 'chargeDelay', 'turnRate', 'damage', 'dps', 'damageType', 'emp',
  'ammo', 'maxAmmo', 'disabled', 'flags', 'cooldown', 'burstRemaining', 'burstTimer',
  'burstSize', 'burstDelay', 'refireDelay', 'beamDuration', 'fluxCost', 'spread',
  'firingState', 'health', 'projectileRadius', 'relativeX', 'relativeY',
  'groupRow', 'hintMask', 'fluxPerSecond'
] as const;
export const projectileKeys = [
  'handle', 'generation', 'id', 'x', 'y', 'prevX', 'prevY', 'vx', 'vy', 'radius',
  'team', 'sourceRow', 'flags', 'damage', 'emp', 'damageType', 'remainingLife',
  'rangeRemaining', 'elapsed', 'hp', 'facing', 'targetRow', 'targetProjectileRow'
] as const;
export const beamKeys = [
  'handle', 'generation', 'id', 'startX', 'startY', 'endX', 'endY', 'duration',
  'maxDuration', 'dps', 'emp', 'damageType', 'sourceRow', 'mountRow', 'team',
  'width', 'damageActive', 'elapsed'
] as const;
/** CONTACT publishes ONLY these columns. Other columns have zero capacity,
 * not stale AI/fire observations or fictitious numeric defaults. Projectiles
 * are captured lazily AFTER each ordered movement, immediately before query. */
export const contactBodyKeys = [
  'handle', 'generation', 'x', 'y', 'facing', 'radius', 'team', 'flags',
  'assemblyRootRow', 'geometryRow', 'hullReach', 'shieldX', 'shieldY',
  'shieldRadius', 'shieldArc', 'shieldHalfArcCos', 'shieldFacing', 'shieldActive'
] as const;
export const contactProjectileKeys = [
  'handle', 'generation', 'id', 'x', 'y', 'prevX', 'prevY', 'vx', 'vy', 'radius',
  'team', 'sourceRow', 'flags'
] as const;
export type Columns<K extends readonly string[]> = { [P in K[number]]: Float64Array };
export type BodyColumns = Columns<typeof bodyKeys>;
export type WeaponColumns = Columns<typeof weaponKeys>;
export type ProjectileColumns = Columns<typeof projectileKeys>;
export type BeamColumns = Columns<typeof beamKeys>;
export interface StageGeometry {
  /** Local authored outline pairs, indexed by offset/count. No Ship/spec reads. */
  xy: Float64Array;
  offset: Float64Array;
  count: Float64Array;
  minX: Float64Array;
  minY: Float64Array;
  maxX: Float64Array;
  maxY: Float64Array;
}
export interface StageInputs {
  ships: readonly Ship[];
  projectiles?: readonly Projectile[];
  beams?: readonly Beam[];
  asteroids?: readonly Asteroid[];
  hulkFragments?: readonly HulkFragment[];
}
export interface StageView {
  readonly abi: 1;
  active: boolean;
  valid: boolean;
  epoch: number;
  revision: number;
  kind: StageKind;
  /** Cold references: producer, output/commit and explicit callbacks ONLY. */
  readonly ships: Ship[];
  readonly mounts: WeaponMount[];
  readonly projectileRefs: Projectile[];
  readonly beamRefs: Beam[];
  readonly rowOf: Map<Ship, number>;
  readonly rowById: Map<string, number>;
  readonly mountRowOf: Map<WeaponMount, number>;
  readonly projectileRowOf: Map<Projectile, number>;
  readonly projectileRowById: Map<number, number>;
  readonly beamRowOf: Map<Beam, number>;
  bodyCount: number;
  weaponCount: number;
  projectileCount: number;
  beamCount: number;
  bodies: BodyColumns;
  weapons: WeaponColumns;
  projectiles: ProjectileColumns;
  beams: BeamColumns;
  geometry: StageGeometry;
  /** A's extension uses this same capture/refresh lease, never a second world codec. */
  ai?: AIStageData;
  /** Visibility overflow strings and weapon hint/spec identity are cold metadata.
   * Numeric hot consumers use the precompiled per-team visibility and hint bits. */
  teams: number[];
  visibility: Float64Array;
  /** Per-projectile exclusions compiled at the ordered query boundary. */
  readonly damagedRows: Map<number, Set<number>>;
  /** Recapture is synchronous and increments epoch; never reuses old observation. */
  recapture(): void;
  refreshChanged(ships: Iterable<Ship>): void;
  refreshProjectile(projectile: Projectile): number;
  invalidate(): void;
  close(): void;
}
