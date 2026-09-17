import type { Ship } from '../simulation/Ship';
import type { FleetAssignment } from './FleetTactics';
import { Vector2 } from '../math/Vector2';
import { signedAngle } from '../math/Angles';
import { rangeVelocity, velocityToPosition } from './TacticalNavigation';

export function fleetEngagementRange(ship: Ship, target: Ship, gunRange: number, assignment?: FleetAssignment): number {
  const clearance = ship.spec.collisionRadius + target.spec.collisionRadius + 8;
  if (assignment?.role === 'CARRIER') return Math.max(clearance, assignment.carrierRange);
  // The gun profile already stands at 90% of effective range; these stay inside that envelope.
  return Math.max(clearance, gunRange * (assignment?.role === 'BRAWLER' ? .94 : 1));
}

/** Gentle tangential lane correction, not a direct chord through the enemy's hull. */
export function fleetApproachVelocity(ship: Ship, target: Ship, range: number, withdrawing: boolean,
  assignment?: FleetAssignment): Vector2 {
  const desired = rangeVelocity(ship, target, range, withdrawing);
  if (withdrawing || assignment?.approachBearing == null) return desired;
  const radial = ship.pos.clone().sub(target.pos), distance = radial.length();
  if (distance < 1 || distance > range * 2.5) return desired;
  const error = signedAngle(assignment.approachBearing - radial.heading());
  const stats = ship.getMotionStats();
  const laneSpeed = Math.min(stats.maxSpeed * (assignment.role === 'SKIRMISHER' ? .5 : .3),
    Math.sqrt(2 * stats.acceleration * stats.strafeMultiplier * Math.max(0, Math.abs(error) * distance - 20)));
  desired.addScaled(new Vector2(-radial.y / distance, radial.x / distance), Math.sign(error) * laneSpeed);
  if (desired.length() > stats.maxSpeed) desired.scale(stats.maxSpeed / desired.length());
  return desired;
}

export function regroupVelocity(ship: Ship, anchor: Ship, target?: Ship): Vector2 {
  const away = target ? anchor.pos.clone().sub(target.pos) : Vector2.fromAngle(anchor.facingRad + Math.PI);
  if (away.length() < 1) away.copy(Vector2.fromAngle(anchor.facingRad + Math.PI));
  const clearance = ship.spec.collisionRadius + anchor.spec.collisionRadius + 180;
  const station = anchor.pos.clone().addScaled(away, clearance / away.length());
  return velocityToPosition(ship, station, anchor.vel, 60);
}
