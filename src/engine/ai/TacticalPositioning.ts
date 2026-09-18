import type { Ship } from '../simulation/Ship';
import type { WeaponMount } from '../simulation/Weapon';
import { tacticalPolicy, type TacticalWorld } from './TacticalWorld';
import type { CombatProfile } from './ShipCombatProfile';
import { weaponDps, weaponRange } from './ShipCombatProfile';
import { isPointDefense } from './AutofireController';
import { Vector2 } from '../math/Vector2';
import { signedAngle } from '../math/Angles';
import { segmentCircleEntry } from '../math/Geometry';
import { sameTeam } from '../simulation/CombatTeams';

const HORIZON = 3;
interface Gun { mount: WeaponMount; range: number; power: number }
interface Body { ship?: Ship; pos: Vector2; radius: number }
interface PositionScore { total: number; clearFire: number; blocked: number; alliedLane: number; danger: number; escape: number }
export interface CombatPositionChoice {
  velocity: Vector2;
  adjusted: boolean;
  scoreGain: number;
  clearFire: number;
  reason: 'BASELINE' | 'FIRE_LANE' | 'COVER';
}
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Acceleration-limited forecast, not an instantaneous jump to the chosen station. */
export function forecastCombatPosition(ship: Ship, desired: Vector2): Vector2 {
  const stats = ship.getMotionStats(), pos = ship.pos.clone(), vel = ship.vel.clone();
  const c = Math.cos(ship.facingRad), s = Math.sin(ship.facingRad), dt = HORIZON / 6;
  for (let step = 0; step < 6; step++) {
    const dx = desired.x - vel.x, dy = desired.y - vel.y;
    const ax = clamp((dx * c + dy * s) / .5, -stats.deceleration, stats.acceleration);
    const ay = clamp((-dx * s + dy * c) / .5, -stats.acceleration * stats.strafeMultiplier, stats.acceleration * stats.strafeMultiplier);
    vel.x += (ax * c - ay * s) * dt; vel.y += (ax * s + ay * c) * dt;
    pos.addScaled(vel, dt);
  }
  return pos;
}
function battery(ship: Ship, world: TacticalWorld, stationkeeping = false): Gun[] {
  const envelope = world.weaponThreatEnvelope?.get(ship);
  const guns = envelope ? envelope.mounts.map((mount, i) => ({ mount, range: envelope.ranges[i], power: envelope.dps[i] }))
    : ship.weapons.filter(m => !m.isDisabled && m.ammo >= 1).map(mount => ({ mount, range: weaponRange(ship, mount), power: weaponDps(mount) }));
  // A bounded advisory sample; actual firing still checks EVERY mount's exact geometry.
  const offense = guns.filter(g => !isPointDefense(g.mount) && g.power > 0 && Number.isFinite(g.range + g.power));
  // Match navigation's sustained battery. A long-range missile shot must not make
  // a gunship think it is already in a useful firing position. Enemy threat samples
  // still include missiles; missile-only ships retain their actual offense.
  const sustained = stationkeeping ? offense.filter(g => g.mount.spec.weaponType !== 'MISSILE'
    && g.mount.spec.spawnType !== 'MISSILE' && !g.mount.spec.aiHints?.includes('STRIKE')) : [];
  return (sustained.length ? sustained : offense)
    .sort((a, b) => b.power - a.power || a.mount.slotId.localeCompare(b.mount.slotId)).slice(0, 8);
}
function intersects(start: Vector2, end: Vector2, center: Vector2, radius: number): boolean {
  const delta = end.clone().sub(start), length2 = delta.dot(delta);
  if (length2 < 1) return false;
  const t = center.clone().sub(start).dot(delta) / length2;
  return t > 0 && t < 1 && start.clone().addScaled(delta, t).distanceTo(center) < radius;
}

/** Local candidate scorer, upstream of hard collision avoidance. No mutation, RNG,
 * target reassignment or cross-frame cache. Explicit orders never enter this layer. */
export function chooseCombatVelocity(ship: Ship, target: Ship, desired: Vector2, profile: CombatProfile,
  world: TacticalWorld): CombatPositionChoice {
  const unchanged = (): CombatPositionChoice => ({ velocity: desired, adjusted: false, scoreGain: 0, clearFire: 0, reason: 'BASELINE' });
  const stats = ship.getMotionStats();
  if (ship.isPhased || ship.flux.isVenting || ship.flux.isOverloaded || ship.system.locksTurning
    || !target.isVisibleTo(ship.teamId) || !(stats.maxSpeed > 0) || !Number.isFinite(profile.range)
    || ship.pos.distanceTo(target.pos) > profile.range * 2.5) return unchanged();
  const guns = battery(ship, world, true), ownPower = guns.reduce((n, g) => n + g.power, 0);
  if (ownPower <= 0) return unchanged();
  const targetPos = target.pos.clone().addScaled(target.vel, HORIZON);
  const nearby = world.ships.filter(other => other !== ship && other !== target && !other.isDead && !other.isPhased
    && other.spec.hullSize !== 'FIGHTER' && other.isVisibleTo(ship.teamId))
    .sort((a, b) => ship.pos.distanceTo(a.pos) - ship.pos.distanceTo(b.pos) || a.id.localeCompare(b.id)).slice(0, 12);
  // The owner-worker recorder must include fire-lane dependencies, which can lie
  // OUTSIDE the short collision corridor. Infinity deliberately records these reads.
  for (const other of [target, ...nearby]) world.noteNavigationObstacle?.(ship, other, Infinity);
  const bodies: Body[] = nearby.map(other => ({ ship: other, pos: other.pos.clone().addScaled(other.vel, HORIZON),
    radius: Math.max(other.spec.collisionRadius, other.shield.isActive ? other.shield.radius : 0) + 8 }));
  for (const a of world.asteroids.filter(a => a.hp > 0).sort((a, b) => ship.pos.distanceTo(a.pos) - ship.pos.distanceTo(b.pos)).slice(0, 8))
    bodies.push({ pos: a.pos.clone().addScaled(a.vel, HORIZON), radius: a.radius + 8 });
  const foes = nearby.filter(s => !sameTeam(ship, s) && !s.flux.isVenting && !s.flux.isOverloaded && !s.system.blocksWeapons)
    .slice(0, 4).map(s => ({ ship: s, pos: s.pos.clone().addScaled(s.vel, HORIZON), guns: battery(s, world) }));
  // Use phase-frozen fleet assignments, not another AI's mutable currentTargetShip.
  const lanes = nearby.filter(s => sameTeam(s, ship)).flatMap(ally => {
    const id = world.fleetPlan?.get(ally.id)?.targetId;
    const enemy = id ? world.ships.find(s => s.id === id && !s.isDead && !sameTeam(s, ship) && s.isVisibleTo(ship.teamId)) : undefined;
    if (!enemy) return [];
    world.noteNavigationObstacle?.(ship, enemy, Infinity);
    return [{ start: ally.pos.clone().addScaled(ally.vel, HORIZON), end: enemy.pos.clone().addScaled(enemy.vel, HORIZON) }];
  });
  const radius = Math.max(ship.spec.collisionRadius, ship.shield.isActive ? ship.shield.radius : 0);
  const clearance = radius + target.spec.collisionRadius + 8;
  const score = (velocity: Vector2): PositionScore => {
    const pos = forecastCombatPosition(ship, velocity), toTarget = targetPos.clone().sub(pos), distance = toTarget.length();
    const wantedFacing = toTarget.heading() - profile.relativeBearing;
    const facing = ship.facingRad + clamp(signedAngle(wantedFacing - ship.facingRad), -stats.maxTurnRate * HORIZON, stats.maxTurnRate * HORIZON);
    let clearPower = 0, blockedPower = 0;
    for (const g of guns) {
      const origin = g.mount.relativePos.clone().rotate(facing).add(pos), direction = targetPos.clone().sub(origin);
      if (direction.length() > g.range + target.spec.collisionRadius) continue;
      const fixed = g.mount.mountType === 'HARDPOINT' || (g.mount.spec.turnRateDegPerSec ?? 1) <= 0;
      const halfArc = (fixed ? 0 : g.mount.arcDeg * Math.PI / 360) + Math.asin(Math.min(1, target.spec.collisionRadius / Math.max(1, direction.length())));
      if (Math.abs(signedAngle(direction.heading() - facing - g.mount.baseAngleDeg * Math.PI / 180)) > halfArc) continue;
      if (!fixed) {
        const turretReach = (g.mount.spec.turnRateDegPerSec ?? 0) * Math.PI / 180 * HORIZON;
        const trackingError = Math.abs(signedAngle(direction.heading() - g.mount.currentAngleRad - (facing - ship.facingRad)));
        if (trackingError > turretReach + Math.asin(Math.min(1, target.spec.collisionRadius / Math.max(1, direction.length())))) continue;
      }
      if (bodies.some(body => intersects(origin, targetPos, body.pos, body.radius))) blockedPower += g.power;
      else clearPower += g.power;
    }
    const clearFire = clearPower / ownPower, blocked = blockedPower / ownPower;
    const alliedLane = Math.min(2, lanes.filter(lane => intersects(lane.start, lane.end, pos, radius + 12)).length);
    let danger = 0;
    for (const foe of foes) for (const g of foe.guns) {
      const origin = g.mount.relativePos.clone().rotate(foe.ship.facingRad).add(foe.pos), delta = pos.clone().sub(origin);
      if (delta.length() > g.range + radius) continue;
      const arc = g.mount.arcDeg * Math.PI / 360 + .15;
      if (Math.abs(signedAngle(delta.heading() - foe.ship.facingRad - g.mount.baseAngleDeg * Math.PI / 180)) <= arc)
        danger += g.power / ownPower;
    }
    danger = Math.min(3, danger);
    const away = pos.clone().sub(targetPos).normalize();
    const exit = pos.clone().addScaled(away, Math.max(radius, stats.maxSpeed * 1.5));
    const escape = Math.min(2, bodies.filter(b => segmentCircleEntry(pos, exit, b.pos, b.radius + radius) !== null).length);
    const overlap = bodies.some(b => pos.distanceTo(b.pos) < b.radius + radius) || distance < clearance;
    const rangeError = Math.min(2, Math.abs(distance - profile.range) / Math.max(100, profile.range));
    const deviation = velocity.distanceTo(desired) / Math.max(1, stats.maxSpeed);
    return { total: 3.2 * clearFire - 1.2 * alliedLane - .8 * danger - .5 * escape - (overlap ? 6 : 0)
      - .65 * rangeError - .18 * deviation, clearFire, blocked, alliedLane, danger, escape };
  };
  const baseline = score(desired);
  const result: CombatPositionChoice = { ...unchanged(), clearFire: baseline.clearFire };
  // Open 1v1 approach/hold is untouched. Search only to solve an observed local problem.
  if (baseline.blocked === 0 && baseline.alliedLane === 0 && baseline.danger < .4 && baseline.escape === 0) return result;
  const radial = targetPos.clone().sub(ship.pos).normalize(), tangent = new Vector2(-radial.y, radial.x);
  const candidates: Vector2[] = [];
  for (const side of [1, -1]) for (const amount of [.55, 1]) {
    const v = desired.clone().addScaled(tangent, side * stats.maxSpeed * amount);
    if (v.length() > stats.maxSpeed) v.scale(stats.maxSpeed / v.length());
    candidates.push(v);
  }
  candidates.push(desired.clone().scale(.5), new Vector2());
  // This advisor may route around crossfire, not cancel an ENGAGE approach forever.
  // Preserve at least the existing half-speed candidate's inward progress outside
  // the requested range. Hard collision avoidance runs afterwards and may still stop;
  // fleet/flux withdrawal and explicit orders never enter this advisor.
  const minimumApproach = ship.pos.distanceTo(target.pos) > profile.range + tacticalPolicy.positionTolerance
    ? Math.max(0, desired.dot(radial)) * .5 : 0;
  let best = baseline;
  for (const v of candidates) {
    if (minimumApproach > 0 && v.dot(radial) < minimumApproach - 1e-8) continue;
    const candidate = score(v);
    if (candidate.total > best.total + .12) {
      best = candidate; result.velocity = v; result.adjusted = true;
      result.reason = baseline.blocked > 0 || baseline.alliedLane > 0 ? 'FIRE_LANE' : 'COVER';
      result.scoreGain = candidate.total - baseline.total; result.clearFire = candidate.clearFire;
    }
  }
  return result;
}

