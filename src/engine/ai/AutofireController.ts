import { isImmutableMetadata } from '../extensions/Immutable';
import type { InFlightFireBudget } from './InFlightFireBudget';
import { fireTargetUtility } from './FireTargetUtility';
import { shipPolicyAction } from './learning/CombatPolicy';
import { sameTeam, combatTeam } from "../simulation/CombatTeams";
import { nativeAutofireAim } from './NativeAim';
import { Vector2 } from '../math/Vector2';
import { signedAngle } from '../math/Angles';
import { segmentCircleEntry } from '../math/Geometry';
import { SimulationRandom } from '../simulation/SimulationRandom';
import { combatWeaponRange, combatProjectileSpeed } from '../simulation/WeaponRange';
import type { Ship } from '../simulation/Ship';
import { shieldCenterOffset } from '../simulation/collision/ShieldCollisionGeometry';
import type { Projectile, WeaponMount, WeaponSpec } from '../simulation/Weapon';
import type { Asteroid } from '../simulation/CombatTypes';
import { interceptTimeComponents, shipSegmentEntry, weaponMuzzle } from './FireControlGeometry';

/** One world view per combat step; no renderer/UI or single-opponent dependency. */
export interface FireControlWorld {
  fireBudget?: InFlightFireBudget;
  ships: readonly Ship[];
  missiles: readonly Projectile[];
  asteroids: readonly Asteroid[];
}
export type FireControlTarget = { kind: 'SHIP'; entity: Ship } | { kind: 'MISSILE'; entity: Projectile };
export interface AimSolution {
  target: FireControlTarget;
  point: Vector2;
  delay: number;
  speed: number;
  range: number;
}
interface Tracker {
  target?: FireControlTarget;
  scanIn: number;
  firingTime: number;
  idleFireTime: number;
  ammoAllowed: boolean;
  spec: WeaponSpec;
  random: SimulationRandom;
}
interface Contact { time: number; distance: number }
export type FireDecision = 'FIRE' | 'NO_TARGET' | 'ALIGNING' | 'FRIENDLY_BLOCKED' | 'OBSTACLE_BLOCKED' | 'CONSERVING_AMMO' | 'FLUX_BUDGET' | 'UNAVAILABLE' | 'DEFENSIVE_HOLD';

const hint = (mount: WeaponMount, name: string) => mount.spec.aiHints?.includes(name) ?? false;
export const isPointDefense = (mount: WeaponMount) => !!mount.spec.isPointDefense || hint(mount, 'PD') || hint(mount, 'PD_ONLY');
const guided = (mount: WeaponMount) => !!mount.spec.isGuided;
const fighter = (ship: Ship) => ship.spec.hullSize === 'FIGHTER';
const sameTarget = (a: FireControlTarget | undefined, b: FireControlTarget | undefined) => a?.kind === b?.kind && a?.entity.id === b?.entity.id;

function targetRadius(target: FireControlTarget): number {
  if (target.kind === 'MISSILE') return target.entity.radius;
  const ship = target.entity;
  const shieldExtent = ship.shield.isActive && ship.shield.type !== 'NONE' && ship.shield.type !== 'PHASE'
    ? ship.shield.radius + shieldCenterOffset(ship) : 0;
  return Math.max(ship.spec.collisionRadius, shieldExtent);
}

function canTarget(ship: Ship, mount: WeaponMount, target: FireControlTarget, world: FireControlWorld, knownPresent = false): boolean {
  if (target.kind === 'MISSILE') {
    const p = target.entity;
    if (p.collisionDisabled) return false;
    // Current guidance can lock ships only; ordinary missiles do not collide with missiles.
    // Do not invent a working anti-missile capability merely because a mod declares PD.
    if (p.isFighterDecoy) {
      if (hint(mount, 'PD_ONLY') && !hint(mount, 'ANTI_FTR')) return false;
      if (mount.spec.passThroughFighters && !mount.spec.passThroughFightersOnlyWhenDestroyed) return false;
      if (!isPointDefense(mount) && !hint(mount, 'ANTI_FTR') &&
          (hint(mount, 'STRIKE') || (mount.spec.weaponType === 'MISSILE' && Number.isFinite(mount.ammo) && !hint(mount, 'DO_NOT_AIM')))) return false;
    } else if (guided(mount) || (!mount.spec.isBeam && (mount.spec.isRocket || mount.spec.spawnType === 'MISSILE') && !mount.spec.proximityFuse)) return false;
    const side = combatTeam(p) ?? world.ships.find(s => s.id === p.sourceShipId)?.teamId;
    return (p.isFighterDecoy || isPointDefense(mount)) && side !== undefined && side !== ship.teamId
      && (knownPresent || world.missiles.includes(p)) && (p.hitpoints ?? 0) > 0
      && (p.flightTimeRemaining === undefined || p.flightTimeRemaining > 0)
      && !(p.isFlare && (hint(mount, 'IGNORES_FLARES') || ship.hullStats.pdIgnoresFlares > 0));
  }
  const other = target.entity;
  if ((!knownPresent && !world.ships.includes(other)) || other.hasVastBulk || other.isDead || !other.isVisibleTo(ship.teamId) || other.isCollisionless || sameTeam(other, ship)) return false;
  // Native private.java: PD_ONLY permits fighters only when ANTI_FTR is present.
  if (hint(mount, 'PD_ONLY') && !(hint(mount, 'ANTI_FTR') && fighter(other))) return false;
  if (fighter(other)) {
    if (mount.spec.passThroughFighters && !mount.spec.passThroughFightersOnlyWhenDestroyed) return false;
    if (!isPointDefense(mount) && !hint(mount, 'ANTI_FTR') &&
        (hint(mount, 'STRIKE') || (mount.spec.weaponType === 'MISSILE' && Number.isFinite(mount.ammo) && !hint(mount, 'DO_NOT_AIM')))) return false;
  }
  if (other.spec.hullSize === 'FRIGATE' && hint(mount, 'STRIKE') && !hint(mount, 'USE_VS_FRIGATES')) return false;
  return true;
}

interface AimQuery { origin: Vector2; delay: number; speed: number; range: number }
/** One native acquisition scan is a read-only query batch, not a cross-frame cache. */
function prepareAimQuery(ship: Ship, mount: WeaponMount): AimQuery {
  return { origin: weaponMuzzle(ship, mount),
    delay: mount.firingState === 'CHARGING' ? Math.max(0, mount.firingStateTimer)
      : mount.firingState === 'IDLE' && mount.burstRemaining <= 0 ? (mount.spec.isBeam ? mount.spec.beamSourceChargeupTime ?? 0 : mount.spec.chargeTime ?? 0) : 0,
    speed: guided(mount) ? mount.spec.maxSpeed ?? mount.spec.projSpeed : combatProjectileSpeed(ship, mount.spec),
    range: combatWeaponRange(ship, mount.spec) };
}
/** Conservative acquisition bound: a valid constant-speed intercept cannot travel
 * longer than (range + target extent) / speed. Native queries only; uncertain inputs fail open. */
function outsideAcquisition(ship: Ship, mount: WeaponMount, target: FireControlTarget, query: AimQuery): boolean {
  const e = target.entity;
  const radius = targetRadius(target);
  const limit = query.range + radius;
  const horizon = query.delay + (mount.spec.isBeam ? 0 : limit / query.speed);
  const speedBound = Math.abs(e.vel.x - ship.vel.x) + Math.abs(e.vel.y - ship.vel.y);
  const reach = limit + speedBound * horizon;
  const distance = Math.max(Math.abs(e.pos.x - query.origin.x), Math.abs(e.pos.y - query.origin.y));
  const pad = 1e-6 * Math.max(1, Math.abs(e.pos.x), Math.abs(e.pos.y), Math.abs(query.origin.x), Math.abs(query.origin.y), Math.abs(reach));
  return query.speed > 0 && query.delay >= 0 && limit >= 0 && horizon >= 0 && Number.isFinite(reach) && distance > reach + pad;
}

/** Shared prediction for turret fire control and AI hull facing. This is not a firing
 * permission: acquisition still enforces range/arcs, and decide traces the actual bore. */
export function predictWeaponIntercept(ship: Ship, mount: WeaponMount, target: FireControlTarget,
  query: AimQuery = prepareAimQuery(ship, mount)): AimSolution | null {
  const { origin, delay, speed, range } = query;
  const vx = target.entity.vel.x - ship.vel.x, vy = target.entity.vel.y - ship.vel.y;
  const px = target.entity.pos.x - origin.x + vx * delay, py = target.entity.pos.y - origin.y + vy * delay;
  const time = mount.spec.isBeam ? 0 : interceptTimeComponents(px, py, vx, vy, speed);
  if (time === null) return null;
  // Preserve the acquisition arithmetic order for native batched queries.
  const point = new Vector2(origin.x + px + vx * time, origin.y + py + vy * time);
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  return { target, point, delay, speed, range };
}

/** Constant-velocity interception in the shooter's frame, including pending charge time.
 * Guided missiles use rated speed for acquisition, not a fictitious instantaneous launch speed. */
export function solveWeaponAim(ship: Ship, mount: WeaponMount, target: FireControlTarget, prepared?: AimQuery): AimSolution | null {
  if (prepared && outsideAcquisition(ship, mount, target, prepared)) return null;
  const query = prepared ?? prepareAimQuery(ship, mount);
  const solution = predictWeaponIntercept(ship, mount, target, query);
  if (!solution) return null;
  const { origin } = query;
  const { point, delay, range } = solution;
  const directionX = point.x - origin.x, directionY = point.y - origin.y;
  const distance = Math.hypot(directionX, directionY);
  if (distance > range + targetRadius(target)) return null;
  const base = ship.facingRad + mount.baseAngleDeg * Math.PI / 180;
  const targetHalfAngle = Math.asin(Math.min(1, targetRadius(target) / Math.max(1, distance)));
  const alwaysAim = guided(mount) && (mount.spec.alwaysFire || hint(mount, 'DO_NOT_AIM') || hint(mount, 'GUIDED_POOR'));
  if (!alwaysAim && mount.arcDeg < 360 && Math.abs(signedAngle(Math.atan2(directionY, directionX) - base)) > mount.arcDeg * Math.PI / 360 + targetHalfAngle) return null;
  if (!guided(mount)) {
    const contact = traceTarget(ship, mount, solution, origin, Math.atan2(directionY, directionX));
    if (!contact) return null;
    if (target.kind === 'MISSILE' && target.entity.flightTimeRemaining !== undefined && delay + contact.time > target.entity.flightTimeRemaining) return null;
  }
  return solution;
}

/** Sweep the actual bore relative to the moving target, not a fixed angular tolerance. */
function traceTarget(ship: Ship, mount: WeaponMount, solution: AimSolution, origin: Vector2, angle: number): Contact | null {
  const { target, delay, speed, range } = solution;
  const relativeVelocity = ship.vel.clone().sub(target.entity.vel);
  const start = origin.clone().addScaled(relativeVelocity, delay);
  const horizon = mount.spec.isBeam ? 0 : range / Math.max(1e-6, speed);
  const end = start.clone().add(Vector2.fromAngle(angle, range)).addScaled(relativeVelocity, horizon);
  const t = target.kind === 'SHIP' ? shipSegmentEntry(target.entity, start, end)
    : segmentCircleEntry(start, end, target.entity.pos, target.entity.radius + mount.spec.projRadius + (mount.spec.proximityFuse?.range ?? 0));
  return t === null ? null : { time: horizon * t, distance: range * t };
}

/** Straight launch/beam corridor plus relative linear motion of blockers.
 * Guided turning, future rotation, scatter and splash are deliberately not claimed exact. */
export function shotObstruction(ship: Ship, mount: WeaponMount, solution: AimSolution, world: FireControlWorld,
  origin: Vector2, angle: number, contact: Contact): 'FRIENDLY_BLOCKED' | 'OBSTACLE_BLOCKED' | null {
  const travel = Vector2.fromAngle(angle, contact.distance);
  const start = new Vector2(), end = new Vector2();
  for (const other of world.ships) {
    if (other === ship || other.isDead || other.isPhased || !sameTeam(other, ship)) continue;
    if (other.assemblyRoot === ship.assemblyRoot && !other.spec.sourceHullTraits?.includes('do_not_fire_through')) continue;
    if (fighter(other) && mount.spec.passThroughFighters && !mount.spec.passThroughFightersOnlyWhenDestroyed) continue;
    const vx = ship.vel.x - other.vel.x, vy = ship.vel.y - other.vel.y;
    start.set(origin.x + vx * solution.delay, origin.y + vy * solution.delay);
    end.set(start.x + travel.x + vx * contact.time, start.y + travel.y + vy * contact.time);
    if (shipSegmentEntry(other, start, end) !== null) return 'FRIENDLY_BLOCKED';
  }
  for (const asteroid of world.asteroids) {
    if (asteroid.hp <= 0) continue;
    const vx = ship.vel.x - asteroid.vel.x, vy = ship.vel.y - asteroid.vel.y;
    start.set(origin.x + vx * solution.delay, origin.y + vy * solution.delay);
    end.set(start.x + travel.x + vx * contact.time, start.y + travel.y + vy * contact.time);
    if (segmentCircleEntry(start, end, asteroid.pos, asteroid.radius + mount.spec.projRadius) !== null) return 'OBSTACLE_BLOCKED';
  }
  return null;
}

function coveredByShield(target: Ship, origin: Vector2): boolean {
  if (!target.shield.isActive || target.shield.type === 'NONE' || target.shield.type === 'PHASE' || target.shield.currentArcDeg <= 0) return false;
  const center = target.getShieldCenter();
  const direction = origin.clone().sub(center);
  return target.isShieldPointBlocked(center.addScaled(direction, target.shield.radius / Math.max(.001, direction.length())));
}

/** Native missile selection is randomized. The Web tie-break is deterministic: imminent
 * straight-line impact on this ship first, then least traverse, then stable entity ID. */
function impactTime(ship: Ship, p: Projectile): number {
  const delta = p.pos.clone().sub(ship.pos), velocity = p.vel.clone().sub(ship.vel);
  const radius = Math.max(ship.spec.collisionRadius, ship.shield.isActive ? ship.shield.radius : 0) + p.radius;
  if (delta.length() <= radius) return 0;
  const horizon = p.flightTimeRemaining ?? (velocity.length() > 0 ? delta.length() / velocity.length() * 2 : 0);
  if (!(horizon > 0)) return Infinity;
  const t = segmentCircleEntry(delta, delta.clone().addScaled(velocity, horizon), new Vector2(), radius);
  return t === null ? Infinity : horizon * t;
}

export class AutofireController {
  private trackers = new WeakMap<WeaponMount, Tracker>();

  public reset(): void { this.trackers = new WeakMap(); }

  private tracker(ship: Ship, mount: WeaponMount): Tracker {
    let state = this.trackers.get(mount);
    if (!state || state.spec !== mount.spec) {
      // Per-mount scheduling stream: avoids synchronized fleet-wide scans without changing
      // the combat RNG used by spread/damage. IDs salt timing only, never weapon behavior.
      let seed = 2166136261;
      for (const character of ship.id + '/' + mount.slotId) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619);
      state = { firingTime: 0, idleFireTime: 0, scanIn: 0, ammoAllowed: true, spec: mount.spec, random: new SimulationRandom(seed) };
      this.trackers.set(mount, state);
    }
    return state;
  }

  public clear(mount: WeaponMount): void {
    this.trackers.delete(mount);
    mount.fireControl = undefined;
    mount.fireControlTargetShipId = undefined;
  }

  /** Tracking only: slow turrets should turn while closing, not start a 10-second
   * traverse at the range boundary. Never return this as a firing solution. */
  public preAim(ship: Ship, mount: WeaponMount, world: FireControlWorld): Vector2 | null {
    if (mount.isDisabled || mount.mountType === 'HARDPOINT') return null;
    const query = prepareAimQuery(ship, mount);
    query.range *= 1.5;
    const track = (other: Ship) => {
      const target: FireControlTarget = { kind: 'SHIP', entity: other };
      return canTarget(ship, mount, target, world, true) ? solveWeaponAim(ship, mount, target, query)?.point ?? null : null;
    };
    if (ship.currentTargetShip && world.ships.includes(ship.currentTargetShip)) {
      const point = track(ship.currentTargetShip);
      if (point) return point;
    }
    let nearest: Vector2 | null = null, distance = Infinity;
    for (const other of world.ships) {
      // Allies can never be a tracking target. Reject them before doing the
      // per-mount distance/intercept work; preserve enemy order and tie breaks.
      if (sameTeam(other, ship)) continue;
      const d = query.origin.distanceTo(other.pos);
      if (d >= distance) continue;
      const point = track(other);
      if (point) { nearest = point; distance = d; }
    }
    return nearest;
  }

  public aim(dt: number, ship: Ship, mount: WeaponMount, world: FireControlWorld): AimSolution | null {
    const state = this.tracker(ship, mount);
    const previousTarget = state.target;
    if (mount.firingState !== 'IDLE' || mount.burstRemaining > 0 || mount.cooldownTimer > 0) { state.firingTime += dt; state.idleFireTime = 0; }
    else { state.idleFireTime += dt; if (state.idleFireTime > 3) state.firingTime = 0; }
    state.scanIn -= dt;
    // Unknown callbacks keep their original per-target stat reads.
    let prepared: AimQuery | undefined;
    const nativeBatch = world.ships.length >= 20 && ship.hasNativeThreatPhaseHooks;
    const solve = (target: FireControlTarget) => solveWeaponAim(ship, mount, target,
      nativeBatch ? prepared ??= prepareAimQuery(ship, mount) : undefined);
    let current = state.target && canTarget(ship, mount, state.target, world) ? solve(state.target) : null;
    if (!current && state.target) { state.target = undefined; state.scanIn = 0; }
    if (state.scanIn <= 0) {
      const candidates: AimSolution[] = [];
      const add = (target: FireControlTarget) => {
        if (!canTarget(ship, mount, target, world, true)) return;
        const solution = solve(target);
        if (solution) candidates.push(solution);
      };
      // Only registered, deeply immutable hints may reuse their classification.
      // Refit specs and the live PD flag remain mutable. Read the flag and hints
      // in the original short-circuit order, even if a callback replaces a spec
      // or installs an accessor during this scan; never cache across scans.
      const scanSpec = nativeBatch && world.missiles.length > 1
        ? Object.getOwnPropertyDescriptor(mount, 'spec')?.value as WeaponSpec | undefined : undefined;
      const scanHints = scanSpec
        ? Object.getOwnPropertyDescriptor(scanSpec, 'aiHints')?.value as string[] | undefined : undefined;
      const trustedHints = scanHints && isImmutableMetadata(scanHints) ? scanHints : undefined;
      const hasPD = trustedHints?.includes('PD') ?? false;
      const hasPDOnly = trustedHints?.includes('PD_ONLY') ?? false;
      const scanHint = (name: 'PD' | 'PD_ONLY') => {
        const hints = mount.spec.aiHints;
        return trustedHints && hints === trustedHints ? (name === 'PD' ? hasPD : hasPDOnly) : hints?.includes(name) ?? false;
      };
      for (const p of world.missiles) {
        const pd = trustedHints
          ? !!mount.spec.isPointDefense || scanHint('PD') || scanHint('PD_ONLY') : isPointDefense(mount);
        if (pd || p.isFighterDecoy) add({ kind: 'MISSILE', entity: p });
      }
      // Like preAim, reject allies before allocating/scanning a target. The
      // remaining hostile candidates keep their original order and validation.
      for (const other of world.ships) if (!sameTeam(other, ship)) add({ kind: 'SHIP', entity: other });
      const origin = weaponMuzzle(ship, mount);
      const autonomous = ship.fireControlMode === 'AI';
      const policyAction = shipPolicyAction(ship);
      const priority = (s: AimSolution): number => {
        const pdFirst = isPointDefense(mount) && !hint(mount, 'PD_ALSO') && !hint(mount, 'STRIKE');
        if (s.target.kind === 'MISSILE') return s.target.entity.isFighterDecoy ? 2 : pdFirst ? 0 : 3;
        if (autonomous) return 1; // Reachable hulls compete by weapon/surface utility.
        if (s.target.entity === ship.currentTargetShip) return 1;
        return 2;
      };
      const rank = (s: AimSolution) => {
        const retained = sameTarget(state.target, s.target);
        const traverse = Math.abs(signedAngle(s.point.clone().sub(origin).heading() - mount.currentAngleRad));
        const arrival = s.delay + (mount.spec.isBeam ? 0 : origin.distanceTo(s.point) / Math.max(1, s.speed));
        const committed = autonomous && !isPointDefense(mount) && s.target.kind === 'SHIP'
          ? world.fireBudget?.penalty(ship, s.target.entity, arrival) ?? 0 : 0;
        const utility = autonomous && s.target.kind === 'SHIP'
          ? fireTargetUtility(ship, mount, s.target.entity, coveredByShield(s.target.entity, origin), retained,
            traverse, arrival, policyAction) - committed : 0;
        return { solution: s, priority: priority(s), retained: retained ? 0 : 1, utility,
          threat: s.target.kind === 'MISSILE' ? impactTime(ship, s.target.entity) : Infinity, traverse };
      };
      const ranked = candidates.map(rank);
      // An imminent missile outranks a retained, harmless missile. Hull stickiness is
      // a bounded utility bonus, so it cannot hide an exposed kill/weapon matchup forever.
      ranked.sort((a, b) => a.priority - b.priority
        || (a.threat === b.threat ? 0 : a.threat - b.threat) || b.utility - a.utility
        || a.retained - b.retained || a.traverse - b.traverse
        || String(a.solution.target.entity.id).localeCompare(String(b.solution.target.entity.id)));
      // Expensive safety geometry is lazy: first clear candidate wins; a blocked target
      // remains tracked only when no clear alternative exists. Safety is rechecked each step.
      current = ranked[0]?.solution ?? null;
      for (const candidate of ranked) {
        const solution = candidate.solution;
        const angle = solution.point.clone().sub(origin).heading();
        const contact = guided(mount) ? { time: origin.distanceTo(solution.point) / Math.max(1, solution.speed), distance: origin.distanceTo(solution.point) }
          : traceTarget(ship, mount, solution, origin, angle);
        if (contact && !shotObstruction(ship, mount, solution, world, origin, angle, contact)) { current = solution; break; }
      }
      state.target = current?.target;
      // Native acquisition cadence, with reproducible jitter: empty .05-.1s;
      // S/PD .125-.25s, M .25-.5s, L .5-1s. A lost target is invalidated immediately.
      const sizeScale = isPointDefense(mount) || mount.spec.mountSize === 'SMALL' ? .25 : mount.spec.mountSize === 'MEDIUM' ? .5 : 1;
      state.scanIn = current ? (.5 + state.random.next() * .5) * sizeScale : .05 + state.random.next() * .05;
    }
    if (!sameTarget(previousTarget, current?.target)) { state.firingTime = 0; state.idleFireTime = 0; }
    if (current && !mount.spec.isBeam && !guided(mount)) {
      const point = nativeAutofireAim(ship, mount, current, state.firingTime);
      const origin = weaponMuzzle(ship, mount);
      // Native approximate lead can miss the entire swept hull even at perfect traverse.
      // Our strict bore gate would then wait forever (accuracy only grew AFTER firing).
      // Keep native aim when viable; otherwise track the already-solved intercept.
      if (traceTarget(ship, mount, current, origin, point.clone().sub(origin).heading())) {
        current = { ...current, point };
      }
    }
    mount.fireControlTargetShipId = current?.target.kind === 'SHIP' ? current.target.entity.id : undefined;
    mount.fireControlTargetProjectileId = current?.target.kind === 'MISSILE' ? current.target.entity.id : undefined;
    mount.fireControl = { targetId: current?.target.entity.id, targetKind: current?.target.kind, reason: current ? 'ALIGNING' : 'NO_TARGET' };
    return current;
  }

  public decide(ship: Ship, mount: WeaponMount, solution: AimSolution | null, world: FireControlWorld, dt: number): FireDecision {
    const done = (reason: FireDecision) => { mount.fireControl = { ...mount.fireControl, reason }; return reason; };
    if (!solution) return done('NO_TARGET');
    if (mount.isDisabled || ship.isDead || ship.isPhased || ship.flux.isOverloaded || ship.flux.isVenting || !ship.system.canFireWeapon(mount)) return done('UNAVAILABLE');
    const origin = weaponMuzzle(ship, mount);
    const angle = mount.currentAngleRad;
    let contact: Contact | null;
    if (guided(mount)) {
      const error = Math.abs(signedAngle(solution.point.clone().sub(origin).heading() - angle));
      const freeLaunch = mount.spec.alwaysFire || hint(mount, 'DO_NOT_AIM') || hint(mount, 'GUIDED_POOR');
      const tolerance = Math.asin(Math.min(1, targetRadius(solution.target) / Math.max(1, origin.distanceTo(solution.point))));
      if (!freeLaunch && error > tolerance) return done('ALIGNING');
      const distance = Math.min(solution.range, origin.distanceTo(solution.point));
      contact = { time: distance / Math.max(1, solution.speed), distance };
    } else {
      contact = traceTarget(ship, mount, solution, origin, angle);
    }
    if (!contact) return done('ALIGNING');
    const obstruction = shotObstruction(ship, mount, solution, world, origin, angle, contact);
    if (obstruction) return done(obstruction);

    const state = this.tracker(ship, mount);
    const activeCycle = mount.burstRemaining > 0 || mount.firingState === 'CHARGING' || mount.firingState === 'ACTIVE';
    const committedCycle = mount.burstRemaining > 0 || mount.firingState === 'CHARGING' || (mount.spec.isBeam && mount.spec.beamVisualMode === 'BURST' && mount.firingState === 'ACTIVE');
    if (ship.fireControlMode === 'AI' && ship.aiHoldOffensiveFire && !isPointDefense(mount) && !committedCycle) return done('DEFENSIVE_HOLD');
    if (!activeCycle) {
      if (mount.ammo < 1) return done('CONSERVING_AMMO');
      // Source USE_LESS_VS_SHIELDS 80%/full hysteresis, and rechargeable-ammo 1/34%/5 rule.
      if (hint(mount, 'USE_LESS_VS_SHIELDS') && solution.target.kind === 'SHIP' && !fighter(solution.target.entity)) {
        if (coveredByShield(solution.target.entity, origin)) {
          if (!Number.isFinite(mount.ammo) || !(mount.spec.ammoRegenPerSec! > 0)) state.ammoAllowed = false;
          else {
            if (mount.ammo <= 1 || mount.ammo <= (mount.spec.maxAmmo ?? 0) * .8) state.ammoAllowed = false;
            if (mount.ammo >= (mount.spec.maxAmmo ?? Infinity)) state.ammoAllowed = true;
          }
        } else state.ammoAllowed = true;
      } else if (!isPointDefense(mount) && !hint(mount, 'DO_NOT_CONSERVE') && Number.isFinite(mount.ammo) && mount.spec.ammoRegenPerSec! > 0) {
        if (mount.ammo <= 1) state.ammoAllowed = false;
        if (mount.ammo >= (mount.spec.maxAmmo ?? Infinity) * .34 || mount.ammo >= 5 || (mount.spec.maxAmmo ?? Infinity) < 12) state.ammoAllowed = true;
      } else state.ammoAllowed = true;
      if (!state.ammoAllowed) return done('CONSERVING_AMMO');
    }
    return done(this.hasFluxBudget(ship, mount, dt) ? 'FIRE' : 'FLUX_BUDGET');
  }

  /** Recheck after earlier mounts emit/spend in this step, without retracing geometry. */
  public hasFluxBudget(ship: Ship, mount: WeaponMount, dt: number): boolean {
    const activeCycle = mount.burstRemaining > 0 || mount.firingState === 'CHARGING' || mount.firingState === 'ACTIVE';
    const cost = mount.spec.isBeam
      ? (mount.spec.fluxPerSecond ?? 0) * Math.max(dt, !activeCycle && mount.spec.beamVisualMode === 'BURST'
        ? (mount.spec.beamSourceChargeupTime ?? 0) + (mount.spec.beamDuration ?? 0) : dt)
      : mount.burstFluxReserved || activeCycle ? 0 : mount.spec.fluxPerShot * (mount.spec.interruptibleBurst ? 1 : Math.max(1, mount.spec.burstSize ?? 1));
    // AI manager's 95% discretionary-fire ceiling. Manual pilot keeps control of their budget;
    // PD may spend the reserve. This is not the entire native shipwide flux-priority manager.
    const budget = ship.fireControlMode === 'AI' && !isPointDefense(mount) && !activeCycle ? .95 : 1;
    if (cost > 0 && ship.flux.totalFlux + cost * ship.system.getWeaponFluxCostMultiplier(mount.spec.weaponType) > ship.flux.maxFlux * budget) return false;
    return true;
  }
}
