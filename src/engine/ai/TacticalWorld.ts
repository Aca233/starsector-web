import type { NavigationObstacleIndex } from './NavigationObstacleIndex';
import type { BeamThreatIndex } from './BeamThreatIndex';
import type { FriendlyFireLaneIndex } from './FriendlyFireLaneIndex';
import type { FleetPlan, FleetRole, FleetTask } from './FleetTactics';
import type { WeaponThreatEnvelope } from './WeaponThreatEnvelope';
import type { ProjectileThreatIndex } from './ProjectileThreatIndex';
import type { Ship } from '../simulation/Ship';
import type { Projectile, Beam } from '../simulation/Weapon';
import type { Asteroid, HulkFragment } from '../simulation/CombatTypes';

export interface TacticalWorld {
  fleetPlan?: FleetPlan;
  /** Owner-only conservative dependency recorder; absent in ordinary serial combat. */
  noteNavigationObstacle?: (ship: Ship, other: Ship, horizon: number) => void;
  /** Only supplied inside an audited, synchronous native AI phase. */
  projectileThreatIndex?: ProjectileThreatIndex;
  beamThreatIndex?: BeamThreatIndex;
  /** Exact authority-derived lifetime, supplied only by an immutable owner frame. */
  projectileLifetime?: (projectile: Projectile) => number;
  weaponThreatEnvelope?: WeaponThreatEnvelope;
  /** Exact-only authored AI reuse; NEVER enables compactForecast cadence. */
  exactWeaponThreatEnvelope?: WeaponThreatEnvelope;
  friendlyFireLaneIndex?: FriendlyFireLaneIndex;
  /** Only supplied by a private Worker during the synchronous native AI phase. */
  navigationObstacleIndex?: NavigationObstacleIndex;
  ships: readonly Ship[];
  projectiles: readonly Projectile[];
  beams: readonly Beam[];
  asteroids: readonly Asteroid[];
  hulkFragments?: readonly HulkFragment[];
}
/** Explicit Web policy, NOT constants claimed to be a complete native BasicShipAI port. */
export const tacticalPolicy = Object.freeze({
  rangeFraction: .9,
  steeringResponse: .5,
  positionTolerance: 8,
  collisionMargin: 8,
  avoidanceLookahead: 3,
  avoidanceSteps: 8,
  calmBeforeLowering: .5,
  ventFluxFraction: .7,
  retreatAt: .9,
  resumeAt: .65,
  imminentWindow: 1,
});
export interface TacticalDiagnostics {
  positioning?: 'BASELINE' | 'FIRE_LANE' | 'COVER';
  positionScoreGain?: number;
  clearFireFraction?: number;
  mode: 'ENGAGE' | 'WITHDRAW' | 'WAYPOINT' | 'IDLE' | 'DEFEND' | 'ESCORT' | 'AVOID';
  fleetRole?: FleetRole;
  fleetTask?: FleetTask;
  targetScore?: number;
  pressureRatio?: number;
  assignedPower?: number;
  desiredRange: number;
  desiredFacing: number;
  availableFirepower: number;
  avoidingCollision: boolean;
  yieldingFireLane: boolean;
  incomingDamage: number;
  incomingShieldFlux: number;
  earliestThreat: number | null;
  ventSafe: boolean;
  defense: 'UP' | 'DOWN' | 'PHASE' | 'VENTING';
}
