import { positionScorer } from './TacticalPositioningKernel';
import { stageKernelWork,decisionReadsFor } from './DecisionReadPlane';
import { queryMotionStats, querySourceModifiers, type CombatQueryReads } from './CombatQueryReads';
import type { Ship } from '../simulation/Ship';
import type { WeaponMount } from '../simulation/Weapon';
import { tacticalPolicy, type TacticalWorld } from './TacticalWorld';
import type { CombatProfile } from './ShipCombatProfile';
import { combatParts, weaponDps, weaponRange } from './ShipCombatProfile';
import { isPointDefense } from './AutofireController';
import { Vector2 } from '../math/Vector2';
import { signedAngle } from '../math/Angles';
import { segmentCircleEntry } from '../math/Geometry';
import { sameTeam } from '../simulation/CombatTeams';

const HORIZON = 3;
interface Gun { mount: WeaponMount; range: number; power: number; position: Vector2; facingOffset: number }
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
export function forecastCombatPosition(ship: Ship, desired: Vector2, reads?: CombatQueryReads): Vector2 {
  const stats = queryMotionStats(ship, reads), pos = ship.pos.clone(), vel = ship.vel.clone();
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
let workerOwnedPositionReads = false;
export function enableWorkerOwnedPositionReads(): void { workerOwnedPositionReads = true; }
const sharedShipDistances = new Map<Ship, number>();
const sharedAsteroidDistances = new Map<import('../simulation/CombatTypes').Asteroid, number>();

const vectorMethods = (['clone','sub','add','addScaled','rotate','distanceTo','length','heading','dot','normalize'] as const)
  .map(key => [key, Vector2.prototype[key]] as const);
const mathMethods = (['cos','sin','atan2','asin','sqrt','abs','min','max','hypot'] as const).map(key => [key, Math[key]] as const);
const isNativeVector = (v: Vector2) => Object.getPrototypeOf(v) === Vector2.prototype
  && vectorMethods.every(([key]) => !Object.hasOwn(v, key))
  && ['x','y'].every(key => { const d = Object.getOwnPropertyDescriptor(v, key); return !!d && 'value' in d && typeof d.value === 'number'; });
const canScoreStandalone = (asteroids: readonly import('../simulation/CombatTypes').Asteroid[], vectors: readonly Vector2[]) =>
  vectorMethods.every(([key, fn]) => Vector2.prototype[key] === fn)
  && mathMethods.every(([key, fn]) => Math[key] === fn)
  && asteroids.every(a => {
    const p = Object.getOwnPropertyDescriptor(a, 'pos'), v = Object.getOwnPropertyDescriptor(a, 'vel');
    return !!p && !!v && 'value' in p && 'value' in v && isNativeVector(p.value) && isNativeVector(v.value);
  })
  && vectors.every(isNativeVector);

function readBattery(ship: Ship, world: TacticalWorld, stationkeeping = false): Gun[] {
  const parts = combatParts(ship);
  const allNative = parts.every(owner => owner.system.hasNativeStats);
  if (!allNative) {
    const guns = parts.flatMap(owner => {
      const envelope = world.weaponThreatEnvelope?.get(owner);
      const mounts = envelope ? envelope.mounts.map((mount, i) => ({ mount, range: envelope.ranges[i], power: envelope.dps[i] }))
        : owner.weapons.filter(m => !m.isDisabled && m.ammo >= 1).map(mount => ({ mount, range: weaponRange(owner, mount, querySourceModifiers(owner, world.queryReads)), power: weaponDps(mount) }));
      return mounts.map(g => ({ ...g, facingOffset: owner.facingRad - ship.facingRad,
        position: owner === ship ? g.mount.relativePos : g.mount.relativePos.clone().rotate(owner.facingRad).add(owner.pos).sub(ship.pos).rotate(-ship.facingRad) }));
    });
    const offense = guns.filter(g => !isPointDefense(g.mount) && g.power > 0 && Number.isFinite(g.range + g.power));
    const sustained = stationkeeping ? offense.filter(g => g.mount.spec.weaponType !== 'MISSILE'
      && g.mount.spec.spawnType !== 'MISSILE' && !g.mount.spec.aiHints?.includes('STRIKE')) : [];
    return (sustained.length ? sustained : offense)
      .sort((a, b) => b.power - a.power || a.mount.slotId.localeCompare(b.mount.slotId)).slice(0, 8);
  }
  const offense: { owner: Ship; mount: WeaponMount; range: number; power: number; steady: boolean }[] = [];
  let hasSustained = false;
  for (let p = 0; p < parts.length; p++) {
    const owner = parts[p];
    const envelope = world.weaponThreatEnvelope?.get(owner);
    if (envelope) {
      const mounts = envelope.mounts;
      for (let i = 0; i < mounts.length; i++) {
        const mount = mounts[i];
        if (isPointDefense(mount)) continue;
        const power = envelope.dps[i], range = envelope.ranges[i];
        if (!(power > 0) || !Number.isFinite(range + power)) continue;
        const steady = stationkeeping && mount.spec.weaponType !== 'MISSILE' && mount.spec.spawnType !== 'MISSILE' && !mount.spec.aiHints?.includes('STRIKE');
        if (steady) hasSustained = true;
        offense.push({ owner, mount, range, power, steady });
      }
    } else {
      const modifiers = querySourceModifiers(owner, world.queryReads);
      const weapons = owner.weapons;
      for (let i = 0; i < weapons.length; i++) {
        const mount = weapons[i];
        if (mount.isDisabled || !(mount.ammo >= 1) || isPointDefense(mount)) continue;
        const power = weaponDps(mount);
        if (!(power > 0)) continue;
        const range = weaponRange(owner, mount, modifiers);
        if (!Number.isFinite(range + power)) continue;
        const steady = stationkeeping && mount.spec.weaponType !== 'MISSILE' && mount.spec.spawnType !== 'MISSILE' && !mount.spec.aiHints?.includes('STRIKE');
        if (steady) hasSustained = true;
        offense.push({ owner, mount, range, power, steady });
      }
    }
  }
  const selected = hasSustained ? offense.filter(g => g.steady) : offense;
  selected.sort((a, b) => b.power - a.power || a.mount.slotId.localeCompare(b.mount.slotId));
  const limit = Math.min(selected.length, 8);
  const result: Gun[] = new Array(limit);
  for (let i = 0; i < limit; i++) {
    const g = selected[i], owner = g.owner;
    result[i] = {
      mount: g.mount, range: g.range, power: g.power,
      facingOffset: owner.facingRad - ship.facingRad,
      position: owner === ship ? g.mount.relativePos : g.mount.relativePos.clone().rotate(owner.facingRad).add(owner.pos).sub(ship.pos).rotate(-ship.facingRad)
    };
  }
  return result;
}
function battery(ship: Ship, world: TacticalWorld, stationkeeping = false): Gun[] {
  const plane=decisionReadsFor(world);
  return plane?.active ? plane.battery(ship,world.weaponThreatEnvelope,stationkeeping,()=>readBattery(ship,world,stationkeeping))
    : readBattery(ship,world,stationkeeping);
}
function intersects(start: Vector2, end: Vector2, center: Vector2, radius: number): boolean {
  const delta = end.clone().sub(start), length2 = delta.dot(delta);
  return intersectsPrepared(start, delta, length2, center, radius);
}
function intersectsPrepared(start: Vector2, delta: Vector2, length2: number, center: Vector2, radius: number): boolean {
  if (length2 < 1) return false;
  const t = center.clone().sub(start).dot(delta) / length2;
  return t > 0 && t < 1 && start.clone().addScaled(delta, t).distanceTo(center) < radius;
}

/** Local candidate scorer, upstream of hard collision avoidance. No mutation, RNG,
 * target reassignment or cross-frame cache. Explicit orders never enter this layer. */
export function chooseCombatVelocity(ship: Ship, target: Ship, desired: Vector2, profile: CombatProfile,
  world: TacticalWorld): CombatPositionChoice {
  const unchanged = (): CombatPositionChoice => ({ velocity: desired, adjusted: false, scoreGain: 0, clearFire: 0, reason: 'BASELINE' });
  const stats = queryMotionStats(ship, world.queryReads);
  if (ship.isPhased || ship.flux.isVenting || ship.flux.isOverloaded || ship.system.locksTurning
    || !target.isVisibleTo(ship.teamId) || !(stats.maxSpeed > 0) || !Number.isFinite(profile.range)
    || ship.pos.distanceTo(target.pos) > profile.range * 2.5) return unchanged();
  const guns = battery(ship, world, true), ownPower = guns.reduce((n, g) => n + g.power, 0);
  if (ownPower <= 0) return unchanged();
  const plane=decisionReadsFor(world);
  const predict=(s:Ship)=>plane?plane.predictedPosition(s):s.pos.clone().addScaled(s.vel,HORIZON);
  const targetPos = predict(target);
  const candidateShips = (plane?plane.positionBodies(world.ships,ship.teamId):world.ships).filter(other => other.assemblyRoot !== ship.assemblyRoot && other.assemblyRoot !== target.assemblyRoot && (plane || !other.isDead && !other.isPhased
    && other.spec.hullSize !== 'FIGHTER' && other.isVisibleTo(ship.teamId)));
  const shipDistances = sharedShipDistances;
  shipDistances.clear();
  for (let i = 0; i < candidateShips.length; i++) {
    const other = candidateShips[i];
    shipDistances.set(other, ship.pos.distanceTo(other.pos));
  }
  const nearby = candidateShips
    .sort((a, b) => shipDistances.get(a)! - shipDistances.get(b)! || a.id.localeCompare(b.id)).slice(0, 12);
  shipDistances.clear();
  // The owner-worker recorder must include fire-lane dependencies, which can lie
  // OUTSIDE the short collision corridor. Infinity deliberately records these reads.
  for (const other of [target, ...nearby]) world.noteNavigationObstacle?.(ship, other, Infinity);
  const bodies: Body[] = nearby.map(other => ({ ship: other, pos: predict(other),
    radius: Math.max(other.spec.collisionRadius, other.shield.isActive && !(other.shield.voidShield && sameTeam(ship,other)) ? other.shield.radius : 0) + 8 }));
  const liveAsteroids = world.asteroids.filter(a => a.hp > 0);
  const asteroidDistances = sharedAsteroidDistances;
  asteroidDistances.clear();
  for (let i = 0; i < liveAsteroids.length; i++) {
    const a = liveAsteroids[i];
    asteroidDistances.set(a, ship.pos.distanceTo(a.pos));
  }
  for (const a of liveAsteroids.sort((a, b) => asteroidDistances.get(a)! - asteroidDistances.get(b)!).slice(0, 8))
    bodies.push({ pos: a.pos.clone().addScaled(a.vel, HORIZON), radius: a.radius + 8 });
  asteroidDistances.clear();
  const foes = nearby.filter(s => !s.isAttachedModule && !sameTeam(ship, s) && !s.flux.isVenting && !s.flux.isOverloaded && !s.system.blocksWeapons)
    .slice(0, 4).map(s => ({ ship: s, pos: predict(s), guns: battery(s, world) }));
  // Use phase-frozen fleet assignments, not another AI's mutable currentTargetShip.
  const lanes = nearby.filter(s => !s.isAttachedModule && sameTeam(s, ship)).flatMap(ally => {
    const id = world.fleetPlan?.get(ally.id)?.targetId;
    const enemy = id ? world.ships.find(s => s.id === id && !s.isDead && !sameTeam(s, ship) && s.isVisibleTo(ship.teamId)) : undefined;
    if (!enemy) return [];
    world.noteNavigationObstacle?.(ship, enemy, Infinity);
    return [{ start: predict(ally), end: predict(enemy) }];
  });
  const radius = Math.max(ship.spec.collisionRadius, ship.shield.isActive ? ship.shield.radius : 0);
  const clearance = radius + target.spec.collisionRadius + 8;
  const objectScore = (velocity: Vector2): PositionScore => {
    const pos = forecastCombatPosition(ship, velocity, world.queryReads), toTarget = targetPos.clone().sub(pos), distance = toTarget.length();
    const wantedFacing = toTarget.heading() - profile.relativeBearing;
    const facing = ship.facingRad + clamp(signedAngle(wantedFacing - ship.facingRad), -stats.maxTurnRate * HORIZON, stats.maxTurnRate * HORIZON);
    let clearPower = 0, blockedPower = 0;
    for (const g of guns) {
      const origin = g.position.clone().rotate(facing).add(pos), direction = targetPos.clone().sub(origin);
      if (direction.length() > g.range + target.spec.collisionRadius) continue;
      const fixed = g.mount.mountType === 'HARDPOINT' || (g.mount.spec.turnRateDegPerSec ?? 1) <= 0;
      const halfArc = (fixed ? 0 : g.mount.arcDeg * Math.PI / 360) + Math.asin(Math.min(1, target.spec.collisionRadius / Math.max(1, direction.length())));
      if (Math.abs(signedAngle(direction.heading() - facing - g.facingOffset - g.mount.baseAngleDeg * Math.PI / 180)) > halfArc) continue;
      if (!fixed) {
        const turretReach = (g.mount.spec.turnRateDegPerSec ?? 0) * Math.PI / 180 * HORIZON;
        const trackingError = Math.abs(signedAngle(direction.heading() - g.mount.currentAngleRad - (facing - ship.facingRad)));
        if (trackingError > turretReach + Math.asin(Math.min(1, target.spec.collisionRadius / Math.max(1, direction.length())))) continue;
      }
      // One immutable segment for this gun/candidate, not a new vector and dot
      // product for every blocker. Preserve narrow-phase math and early exit.
      const length2 = direction.dot(direction);
      if (bodies.some(body => intersectsPrepared(origin, direction, length2, body.pos, body.radius))) blockedPower += g.power;
      else clearPower += g.power;
    }
    const clearFire = clearPower / ownPower, blocked = blockedPower / ownPower;
    const alliedLane = Math.min(2, lanes.filter(lane => intersects(lane.start, lane.end, pos, radius + 12)).length);
    let danger = 0;
    for (const foe of foes) for (const g of foe.guns) {
      const origin = g.position.clone().rotate(foe.ship.facingRad).add(foe.pos), delta = pos.clone().sub(origin);
      if (delta.length() > g.range + radius) continue;
      const arc = g.mount.arcDeg * Math.PI / 360 + .15;
      if (Math.abs(signedAngle(delta.heading() - foe.ship.facingRad - g.facingOffset - g.mount.baseAngleDeg * Math.PI / 180)) <= arc)
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
  const scalar = workerOwnedPositionReads && !!world.compactThreatForecastEligible && !world.noteNavigationObstacle ? true : (() => {
    const scoreVectors = [ship.pos,ship.vel,desired,targetPos,
      ...guns.map(g=>g.position),...bodies.map(b=>b.pos),...lanes.flatMap(l=>[l.start,l.end]),
      ...foes.flatMap(f=>[f.pos,...f.guns.map(g=>g.position)])];
    return plane ? (plane.canScore(world.asteroids) && plane.canScoreVectors(scoreVectors))
      : (!world.noteNavigationObstacle && canScoreStandalone(world.asteroids, scoreVectors));
  })();
  const numericScore=scalar ? positionScorer({x:ship.pos.x,y:ship.pos.y,vx:ship.vel.x,vy:ship.vel.y,facing:ship.facingRad,
    target:targetPos,targetRadius:target.spec.collisionRadius,radius,range:profile.range,relativeBearing:profile.relativeBearing,
    ownPower,desired,...stats,
    guns:guns.map(g=>({x:g.position.x,y:g.position.y,range:g.range,power:g.power,
      fixed:g.mount.mountType==='HARDPOINT'||(g.mount.spec.turnRateDegPerSec??1)<=0,
      halfArc:(g.mount.mountType==='HARDPOINT'||(g.mount.spec.turnRateDegPerSec??1)<=0)?0:g.mount.arcDeg*Math.PI/360,
      turretReach:(g.mount.spec.turnRateDegPerSec??0)*Math.PI/180*HORIZON,angle:g.mount.currentAngleRad,base:g.facingOffset+g.mount.baseAngleDeg*Math.PI/180})),
    bodies:bodies.map(b=>({x:b.pos.x,y:b.pos.y,radius:b.radius})),lanes,
    foes:foes.flatMap(f=>f.guns.map(g=>{const c=Math.cos(f.ship.facingRad),s=Math.sin(f.ship.facingRad);
      return {x:g.position.x*c-g.position.y*s+f.pos.x,y:g.position.x*s+g.position.y*c+f.pos.y,
        range:g.range,power:g.power,facing:f.ship.facingRad,base:g.facingOffset+g.mount.baseAngleDeg*Math.PI/180,arc:g.mount.arcDeg*Math.PI/360+.15};}))}) : undefined;
  const score=(v:Vector2)=>{
    if(numericScore){if(plane){if(ship.isAttachedModule)stageKernelWork.moduleScores++;else stageKernelWork.rootScores++;}return numericScore(v);}
    return objectScore(v);
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

