import type { AIStageReadData } from './StageAIData';

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
/** No mutators or writable numeric indices are exposed to pure solvers. The
 * producer owns these same arrays; this is a synchronous lease, not a copy. */
export type ReadColumns<K extends readonly string[]> = { readonly [P in K[number]]: Readonly<ArrayLike<number>> };
export type StageReadGeometry = { readonly [K in keyof StageGeometry]: Readonly<ArrayLike<number>> };
export interface StageReadView {
  readonly abi: 1;
  readonly active: boolean;
  readonly valid: boolean;
  readonly epoch: number;
  readonly revision: number;
  readonly kind: StageKind;
  readonly rowById: ReadonlyMap<string, number>;
  readonly projectileRowById: ReadonlyMap<number, number>;
  readonly bodyCount: number;
  readonly weaponCount: number;
  readonly projectileCount: number;
  readonly beamCount: number;
  readonly bodies: ReadColumns<typeof bodyKeys>;
  readonly weapons: ReadColumns<typeof weaponKeys>;
  readonly projectiles: ReadColumns<typeof projectileKeys>;
  readonly beams: ReadColumns<typeof beamKeys>;
  readonly geometry: StageReadGeometry;
  readonly ai?: AIStageReadData;
  readonly teams: readonly number[];
  readonly visibility: Readonly<ArrayLike<number>>;
  readonly damagedRows: ReadonlyMap<number, ReadonlySet<number>>;
}

/** A closed or invalid lease must be reacquired by its bridge. Solvers never
 * recapture from a stale source roster or silently consume another phase. */
export function assertStageReadable(view: StageReadView, kind?: StageKind): void {
  if (!view.active || !view.valid) throw new Error('Numeric query requires a live valid stage');
  if (kind !== undefined && view.kind !== kind)
    throw new Error('Numeric query requires ' + kind + ', received ' + view.kind);
}
