import type { WeaponThreatEnvelope } from './WeaponThreatEnvelope';
import type { ProjectileThreatIndex } from './ProjectileThreatIndex';
import type { Ship } from '../simulation/Ship';
import type { Projectile, Beam } from '../simulation/Weapon';
import type { Asteroid } from '../simulation/CombatTypes';

export interface TacticalWorld {
  /** Only supplied inside an audited, synchronous native AI phase. */
  projectileThreatIndex?: ProjectileThreatIndex;
  weaponThreatEnvelope?: WeaponThreatEnvelope;
  ships: readonly Ship[];
  projectiles: readonly Projectile[];
  beams: readonly Beam[];
  asteroids: readonly Asteroid[];
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
  retreatAt: .85,
  resumeAt: .55,
  imminentWindow: 1,
});
export interface TacticalDiagnostics {
  mode: 'ENGAGE' | 'WITHDRAW' | 'WAYPOINT' | 'IDLE' | 'DEFEND' | 'ESCORT' | 'AVOID';
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
