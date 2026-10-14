import { assertStageReadable, BodyFlag, type StageReadView } from './StageProtocol';

/** Supplemental FIRE_QUERY data. Publication and object mapping live in FireInputs. */
export const FireHint = Object.freeze({
  ANTI_FTR: 1, STRIKE: 2, DO_NOT_AIM: 4, GUIDED_POOR: 8, PD_ALSO: 16,
  USE_VS_FRIGATES: 32, IGNORES_FLARES: 64, DO_NOT_CONSERVE: 128,
  USE_LESS_VS_SHIELDS: 256
});
export interface FireWeaponInput {
  hints: number; passFighters: boolean; missileBody: boolean; beamBurst: boolean;
  proximity: number; hasProximity: boolean; weaponMissile: boolean; regen: number; sizeScale: number; accuracyBonus: number;
  idle: number; hasMuzzleOffset: boolean; offsetX: number; offsetY: number; reload: number;
  reserved: boolean; interruptible: boolean; sourceCharge: number;
  cycle: number; cooldownRate: number; baseRange: number; baseSpeed: number;
  baseAngle: number; arc: number; relativeX: number; relativeY: number;
  tractor: boolean; deflector: boolean;
}
export interface FireArmorInput {
  cols: number; rows: number; width: number; height: number; minX: number; minY: number;
  cells: Float32Array; effective: number; dynamicEffective: number; residual: number; reduction: number;
  armorMult: number[]; hullMult: number[]; native: boolean;
}
export interface FireData {
  epoch: number; revision: number; projectileCount: number;
  shieldOn: number[]; targetRadius: number[]; vast: number[]; noFireThrough: number[];
  pdIgnoreFlares: number[]; accuracy: number[]; currentTarget: number[];
  autonomous: number[]; player: number[]; aimX: number[]; aimY: number[];
  mainTrigger: number[]; finish: number[]; pressure: number[];
  nativeThreat: number[]; armor: FireArmorInput[];
  weapons: FireWeaponInput[];
  decoy: number[]; flare: number[]; missileHp: number[];
  flightLife: number[]; flightLifePresent: number[]; eligibleBudget: number[]; arming: number[]; sourceSpeed: number[];
  projectileTeam: number[]; explicitProjectileTeam: number[]; budgetTeam: number[];
  budgetRows: number[][]; budgetScope: Uint8Array; budgetComplete: boolean;
  asteroidX: number[]; asteroidY: number[]; asteroidVx: number[]; asteroidVy: number[];
  asteroidRadius: number[]; asteroidHp: number[];
  /** ID lexicographic ranks compiled at publication, not in a candidate comparator. */
  shipTie: number[]; projectileTie: number[];
}
type ReadFireValue<T> = T extends Float32Array | Float64Array | Uint8Array ? Readonly<ArrayLike<number>>
  : T extends readonly (infer Item)[] ? readonly ReadFireValue<Item>[]
    : T extends object ? { readonly [K in keyof T]: ReadFireValue<T[K]> } : T;
/** Solvers cannot mutate published supplemental inputs or inspect roster caches. */
export type FireReadInputs = ReadFireValue<FireData>;

export function fireAvailable(v: StageReadView, row: number): boolean {
  return !(v.bodies.flags[row] & (BodyFlag.DEAD | BodyFlag.PHASED | BodyFlag.OVERLOADED | BodyFlag.VENTING));
}

/** Fire supplements are valid only for the exact publication they augment. */
export function assertFireInputs(v: StageReadView, f: FireReadInputs): void {
  assertStageReadable(v, 'FIRE_QUERY');
  if (f.epoch !== v.epoch || f.revision !== v.revision || f.projectileCount !== v.projectileCount)
    throw new Error('Fire query supplement expired; republish at the current stage');
}
