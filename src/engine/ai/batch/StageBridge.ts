import type { Ship } from '../../simulation/Ship';
import type { Projectile, Beam, WeaponMount } from '../../simulation/Weapon';
import type { Asteroid, HulkFragment } from '../../simulation/CombatTypes';
import type { AIStageData } from './StageAIData';
import type { StageReadView, StageKind, BodyColumns, WeaponColumns, ProjectileColumns, BeamColumns, StageGeometry } from './StageProtocol';

/** Authority bridge for capture, explicit callbacks and ordered commit only.
 * Numeric query modules import StageReadView from StageProtocol instead. */
export interface StageInputs {
  ships: readonly Ship[];
  projectiles?: readonly Projectile[];
  beams?: readonly Beam[];
  asteroids?: readonly Asteroid[];
  hulkFragments?: readonly HulkFragment[];
}
export interface StageView extends StageReadView {
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
