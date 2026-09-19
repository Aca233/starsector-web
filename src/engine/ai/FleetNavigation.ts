import { POLICY_TUNING, shipPolicyAction } from './learning/CombatPolicy';
import type { Ship } from '../simulation/Ship';
import { hasAttackOpportunity, type FleetAssignment } from './FleetTactics';
import { Vector2 } from '../math/Vector2';
import { signedAngle } from '../math/Angles';
import { rangeVelocity, velocityToPosition } from './TacticalNavigation';

export function fleetEngagementRange(ship: Ship, target: Ship, gunRange: number, assignment?: FleetAssignment): number {
  const clearance = ship.spec.collisionRadius + target.spec.collisionRadius + 8;
  if (assignment?.role === 'CARRIER') return Math.max(clearance, assignment.carrierRange);
  // Spend weapon reach, not hull clearance: healthy line ships push enough of their
  // battery into range rather than park at the longest guns' boundary. Artillery
  // keeps its stand-off role; carriers never inherit the close-assault policy.
  const role = assignment?.role;
  const pressure = role === 'BRAWLER' ? .70 : role === 'SKIRMISHER' ? .80 : role === 'ARTILLERY' ? .92 : .84;
  const caution = Math.max(0, Math.min(1, (ship.flux.fluxPercent - .65) / .25));
  const opportunity = hasAttackOpportunity(ship, target, assignment?.pressureRatio);
  const hull = ship.hullHp / Math.max(1, ship.maxHullHp);
  const damaged = Math.max(0, Math.min(1, (.4 - hull) / .25));
  // Healthy gunships close to useful battery range even against stronger opposition.
  // Actual flux/hull reserves, not paper DPS, determine the stand-off margin.
  const reserve = Math.max(caution, damaged);
  const fraction = (pressure + (1 - pressure) * reserve) * (opportunity ? .72 : 1);
  let residual = POLICY_TUNING[shipPolicyAction(ship, target)].range;
  // Learning cannot spend emergency reserves, turn artillery into brawlers or move carriers.
  if (reserve > .4 || role === 'ARTILLERY') residual = Math.max(1, residual);
  return clearance + Math.max(0, gunRange - clearance) * Math.min(1.12, fraction * residual);
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
