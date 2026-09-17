import { nativeAutofireAim } from './NativeAim';
import { Vector2 } from '../math/Vector2';
import { signedAngle } from '../math/Angles';
import { segmentCircleEntry } from '../math/Geometry';
import { SimulationRandom } from '../simulation/SimulationRandom';
import { combatWeaponRange, combatProjectileSpeed } from '../simulation/WeaponRange';
import type { Ship } from '../simulation/Ship';
import type { Projectile, WeaponMount, WeaponSpec } from '../simulation/Weapon';
import type { Asteroid } from '../simulation/CombatTypes';
import { interceptTimeComponents, shipSegmentEntry, weaponMuzzle } from './FireControlGeometry';

/** One world view per combat step; no renderer/UI or single-opponent dependency. */
export interface FireControlWorld {
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
    ? ship.shield.radius + ship.getShieldCenter().distanceTo(ship.pos) : 0;
  return Math.max(ship.spec.collisionRadius, shieldExtent);
}

function canTarget(ship: Ship, mount: WeaponMount, target: FireControlTarget, world: FireControlWorld, knownPresent = false): boolean {
  if (target.kind === 'MISSILE') {
    const p = target.entity;
    // Current guidance can lock ships only; ordinary missiles do not collide with missiles.
    // Do not invent a working anti-missile capability merely because a mod declares PD.
    if (guided(mount) || (!mount.spec.isBeam && (mount.spec.isRocket || mount.spec.spawnType === 'MISSILE') && !mount.spec.proximityFuse)) return false;
    const side = p.isPlayer ?? world.ships.find(s => s.id === p.sourceShipId)?.isPlayer;
    return isPointDefense(mount) && side !== undefined && side !== ship.isPlayer
      && (knownPresent || world.missiles.includes(p)) && (p.hitpoints ?? 0) > 0
      && (p.flightTimeRemaining === undefined || p.flightTimeRemaining > 0)
      && !(p.isFlare && (hint(mount, 'IGNORES_FLARES') || ship.hullStats.pdIgnoresFlares > 0));
  }
  const other = target.entity;
  if ((!knownPresent && !world.ships.includes(other)) || other.isDead || other.isPhased || other.isPlayer === ship.isPlayer) return false;
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

/** Constant-velocity interception in the shooter's frame, including pending charge time.
 * Guided missiles use rated speed for acquisition, not a fictitious instantaneous launch speed. */
export function solveWeaponAim(ship: Ship, mount: WeaponMount, target: FireControlTarget): AimSolution | null {
  const origin = weaponMuzzle(ship, mount);
  const delay = mount.firingState === 'CHARGING' ? Math.max(0, mount.firingStateTimer)
    : mount.firingState === 'IDLE' && mount.burstRemaining <= 0
      ? (mount.spec.isBeam ? mount.spec.beamSourceChargeupTime ?? 0 : mount.spec.chargeTime ?? 0) : 0;
  const speed = guided(mount) ? mount.spec.maxSpeed ?? mount.spec.projSpeed : combatProjectileSpeed(ship, mount.spec);
  const vx = target.entity.vel.x - ship.vel.x, vy = target.entity.vel.y - ship.vel.y;
  const px = target.entity.pos.x - origin.x + vx * delay, py = target.entity.pos.y - origin.y + vy * delay;
  const time = mount.spec.isBeam ? 0 : interceptTimeComponents(px, py, vx, vy, speed);
  if (time === null) return null;
  // Keep clone/add/addScaled's arithmetic order, not targetPos + v * (delay + time).
  const point = new Vector2(origin.x + px + vx * time, origin.y + py + vy * time);
  const range = combatWeaponRange(ship, mount.spec);
  const directionX = point.x - origin.x, directionY = point.y - origin.y;
  const distance = Math.hypot(directionX, directionY);
  if (distance > range + targetRadius(target) || !Number.isFinite(distance)) return null;
  const base = ship.facingRad + mount.baseAngleDeg * Math.PI / 180;
  const targetHalfAngle = Math.asin(Math.min(1, targetRadius(target) / Math.max(1, distance)));
  const alwaysAim = guided(mount) && (mount.spec.alwaysFire || hint(mount, 'DO_NOT_AIM') || hint(mount, 'GUIDED_POOR'));
  if (!alwaysAim && mount.arcDeg < 360 && Math.abs(signedAngle(Math.atan2(directionY, directionX) - base)) > mount.arcDeg * Math.PI / 360 + targetHalfAngle) return null;
  const solution = { target, point, delay, speed, range };
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
    if (other === ship || other.isDead || other.isPhased || other.isPlayer !== ship.isPlayer) continue;
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

  public aim(dt: number, ship: Ship, mount: WeaponMount, world: FireControlWorld): AimSolution | null {
    const state = this.tracker(ship, mount);
    const previousTarget = state.target;
    if (mount.firingState !== 'IDLE' || mount.burstRemaining > 0 || mount.cooldownTimer > 0) { state.firingTime += dt; state.idleFireTime = 0; }
    else { state.idleFireTime += dt; if (state.idleFireTime > 3) state.firingTime = 0; }
    state.scanIn -= dt;
    let current = state.target && canTarget(ship, mount, state.target, world) ? solveWeaponAim(ship, mount, state.target) : null;
    if (!current && state.target) { state.target = undefined; state.scanIn = 0; }
    if (state.scanIn <= 0) {
      const candidates: AimSolution[] = [];
      const add = (target: FireControlTarget) => {
        if (!canTarget(ship, mount, target, world, true)) return;
        const solution = solveWeaponAim(ship, mount, target);
        if (solution) candidates.push(solution);
      };
      if (isPointDefense(mount)) for (const p of world.missiles) add({ kind: 'MISSILE', entity: p });
      for (const other of world.ships) add({ kind: 'SHIP', entity: other });
      const origin = weaponMuzzle(ship, mount);
      const priority = (s: AimSolution): number => {
        const pdFirst = isPointDefense(mount) && !hint(mount, 'PD_ALSO') && !hint(mount, 'STRIKE');
        if (s.target.kind === 'MISSILE') return pdFirst ? 0 : 3;
        if (s.target.entity === ship.currentTargetShip) return 1;
        return 2;
      };
      const rank = (s: AimSolution) => ({ solution: s, priority: priority(s), retained: sameTarget(state.target, s.target) ? 0 : 1,
        threat: s.target.kind === 'MISSILE' ? impactTime(ship, s.target.entity) : Infinity,
        traverse: Math.abs(signedAngle(s.point.clone().sub(origin).heading() - mount.currentAngleRad)) });
      const ranked = candidates.map(rank);
      ranked.sort((a, b) => a.priority - b.priority || a.retained - b.retained
        || (a.threat === b.threat ? 0 : a.threat - b.threat) || a.traverse - b.traverse
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
    if (current) current = { ...current, point: nativeAutofireAim(ship, mount, current, state.firingTime) };
    mount.fireControlTargetShipId = current?.target.kind === 'SHIP' ? current.target.entity.id : undefined;
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
    const cost = mount.spec.isBeam
      ? (mount.spec.fluxPerSecond ?? 0) * Math.max(dt, !activeCycle && mount.spec.beamVisualMode === 'BURST'
        ? (mount.spec.beamSourceChargeupTime ?? 0) + (mount.spec.beamDuration ?? 0) : dt)
      : mount.burstFluxReserved || activeCycle ? 0 : mount.spec.fluxPerShot * (mount.spec.interruptibleBurst ? 1 : Math.max(1, mount.spec.burstSize ?? 1));
    // AI manager's 95% discretionary-fire ceiling. Manual pilot keeps control of their budget;
    // PD may spend the reserve. This is not the entire native shipwide flux-priority manager.
    const budget = ship.fireControlMode === 'AI' && !isPointDefense(mount) && !activeCycle ? .95 : 1;
    if (cost > 0 && ship.flux.totalFlux + cost > ship.flux.maxFlux * budget) return done('FLUX_BUDGET');
    return done('FIRE');
  }
}
