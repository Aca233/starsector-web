import { isPointDefense, predictWeaponIntercept, solveWeaponAim, type FireControlTarget } from '../../ai/AutofireController';
import { Vector2 } from '../../math/Vector2';
import { cursorTurnCommand } from '../../runtime/PlayerControls';
import { sameTeam } from '../CombatTeams';
import type { Ship } from '../Ship';
import type { Projectile, WeaponMount } from '../Weapon';
import { combatWeaponRange } from '../WeaponRange';

export const flightAlive = (ship: Ship): boolean => !ship.isDead && ship.hullHp > 0 && !ship.isRetreated && !ship.isDocked;
export const flightHostile = (craft: Ship, target?: Ship | null): target is Ship =>
  !!target && flightAlive(target) && !sameTeam(craft, target) && !target.isPhased && target.isVisibleTo(craft.teamId);
export const carrierOperational = (carrier: Ship): boolean => flightAlive(carrier) && flightAlive(carrier.assemblyRoot);

/** Native wing range is measured between collision envelopes, not fixed screen distances. */
export function wingCanReach(carrier: Ship, range: number, point: Vector2, radius = 0): boolean {
  return range > 0 && carrier.pos.distanceTo(point) <= range + carrier.spec.collisionRadius + radius;
}

/** Velocity-aware arrival; brake against relative closing speed rather than orbiting a moving deck. */
export function steerFlight(craft: Ship, point: Vector2, velocity = new Vector2(), stopDistance = 35): void {
  const delta = point.clone().sub(craft.pos), distance = delta.length();
  const angle = Math.atan2(Math.sin(delta.heading() - craft.facingRad), Math.cos(delta.heading() - craft.facingRad));
  craft.turnInput = cursorTurnCommand(craft.facingRad, craft.angularVelRad, delta.heading(), craft.getMotionStats().turnDeceleration);
  const closing = distance > 1 ? craft.vel.clone().sub(velocity).dot(delta) / distance : 0;
  craft.brakeInput = distance < stopDistance || (closing > 30 && distance < stopDistance + closing * .7);
  craft.throttle = craft.brakeInput ? 0 : Math.abs(angle) < .85 ? Math.min(1, distance / 180) : .12;
  craft.strafeInput = 0;
}

export function strikeMounts(craft: Ship): WeaponMount[] {
  // Do not count flares or PD guns as a bomber's payload, even if their magazines are finite.
  const payload = craft.weapons.filter(w => !w.spec.systemOnly && !isPointDefense(w));
  const tagged = payload.filter(w => w.spec.aiHints?.includes('STRIKE'));
  return tagged.length ? tagged : payload.filter(w => w.spec.weaponType === 'MISSILE');
}

export function payloadNeedsRearm(mounts: readonly WeaponMount[]): boolean {
  if (!mounts.length || mounts.some(w => w.burstRemaining > 0 || w.firingState === 'CHARGING')) return false;
  return mounts.every(w => Number.isFinite(w.ammo) && w.spec.maxAmmo !== undefined
    && !(w.spec.ammoRegenPerSec && w.spec.ammoRegenPerSec > 0) && w.ammo <= w.spec.maxAmmo * .2);
}

function usableMounts(craft: Ship, target: FireControlTarget, payloadOnly: boolean): WeaponMount[] {
  return (payloadOnly ? strikeMounts(craft) : craft.weapons).filter(w => !w.isDisabled && !w.isPermanentlyDisabled
    && !w.spec.systemOnly && (w.ammo > 0 || w.burstRemaining > 0) && combatWeaponRange(craft, w.spec) > 0
    && (target.kind !== 'MISSILE' || (!w.spec.isGuided && !w.spec.aiHints?.includes('STRIKE')
      && (isPointDefense(w) || w.spec.weaponType !== 'MISSILE'))));
}

/** Share the engine's physical intercept math; no hard-coded projectile speed or launch distance. */
export function aimFlight(craft: Ship, target: FireControlTarget, payloadOnly = false): number {
  const mounts = usableMounts(craft, target, payloadOnly);
  let range = Infinity, point: Vector2 | undefined;
  craft.isFiringMain = false;
  for (const mount of mounts) {
    range = Math.min(range, combatWeaponRange(craft, mount.spec));
    const solution = solveWeaponAim(craft, mount, target);
    if (solution) { point = solution.point; craft.isFiringMain = true; }
    else if (!point) point = predictWeaponIntercept(craft, mount, target)?.point;
  }
  craft.aimTargetWorld.copy(point ?? target.entity.pos);
  return range === Infinity ? 0 : range;
}

/** Approach outside the target hull; once close, fly tangentially instead of ramming its center. */
export function attackFlight(craft: Ship, target: Ship, index: number, bomber = false, preferredRangeFraction?: number): void {
  const payloadOnly = bomber && strikeMounts(craft).length > 0;
  let range = aimFlight(craft, { kind: 'SHIP', entity: target }, payloadOnly);
  // Role-specific holding stations must not collapse onto a hull when weapons are temporarily disabled.
  if (preferredRangeFraction !== undefined && range === 0) {
    const ranges = (payloadOnly ? strikeMounts(craft) : craft.weapons)
      .filter(w => !w.spec.systemOnly).map(w => combatWeaponRange(craft, w.spec)).filter(r => r > 0);
    range = ranges.length ? Math.min(...ranges) : 0;
  }
  const radius = target.spec.collisionRadius + craft.spec.collisionRadius + 45;
  const offset = craft.pos.clone().sub(target.pos), distance = offset.length();
  if (distance < 1) offset.copy(Vector2.fromAngle(craft.facingRad + Math.PI));
  else offset.scale(1 / distance);
  const standOff = preferredRangeFraction === undefined ? radius + Math.max(40, range * (bomber ? .65 : .5))
    : target.spec.collisionRadius + Math.max(craft.spec.collisionRadius + 45, range * preferredRangeFraction);
  const station = target.pos.clone().addScaled(offset, standOff).addScaled(target.vel, .25);
  if (distance < radius + Math.max(25, range * .18)) {
    // Pick a deterministic break side, using no extra RNG or unsynchronized state.
    station.add(offset.clone().rotate(index % 2 ? -Math.PI / 2 : Math.PI / 2).scale(160));
    steerFlight(craft, station, target.vel, 20);
  } else if (distance > standOff + 60 || (preferredRangeFraction !== undefined && distance < standOff - 60)) steerFlight(craft, station, target.vel, 35);
  else {
    const facing = craft.aimTargetWorld.clone().sub(craft.pos).heading();
    craft.turnInput = cursorTurnCommand(craft.facingRad, craft.angularVelRad, facing, craft.getMotionStats().turnDeceleration);
    craft.throttle = 0; craft.brakeInput = true;
  }
}

/** Score incoming trajectories, not array order. Receding shots and decoys cannot drag wings away. */
export function incomingFlightThreat(craft: Ship, carrier: Ship, range: number, projectiles: readonly Projectile[]): Projectile | undefined {
  let best: Projectile | undefined, bestScore = Infinity;
  for (const p of projectiles) {
    if (!p.isRocket || p.isDisarmed || p.isFlare || p.isFighterDecoy || p.collisionDisabled || p.didDamage
      || p.rangeRemaining <= 0 || (p.hitpoints !== undefined && p.hitpoints <= 0)
      || (p.missileFizzleTime !== undefined && !p.armedWhileFizzling) || sameTeam(p, craft)) continue;
    const distance = p.pos.distanceTo(craft.pos);
    if (distance > 900 || (carrierOperational(carrier) && !wingCanReach(carrier, range, p.pos, p.radius))) continue;
    for (const protectedShip of carrierOperational(carrier) ? [carrier, craft] : [craft]) {
      const delta = p.pos.clone().sub(protectedShip.pos), relative = p.vel.clone().sub(protectedShip.vel);
      const speed2 = relative.dot(relative), time = speed2 > 1 ? -delta.dot(relative) / speed2 : 0;
      if (time < 0 || time > 4) continue;
      const clearance = delta.addScaled(relative, time).length() - protectedShip.spec.collisionRadius - p.radius;
      if (clearance > 140) continue;
      const score = time * 180 + distance + Math.max(0, clearance) * 2;
      if (score < bestScore) { best = p; bestScore = score; }
    }
  }
  return best;
}

export function dogfightTarget(craft: Ship, carrier: Ship, range: number, crafts: readonly Ship[], previous?: string): Ship | undefined {
  let best: Ship | undefined, bestScore = Infinity;
  for (const opponent of crafts) {
    if (!flightHostile(craft, opponent) || (carrierOperational(carrier) && !wingCanReach(carrier, range, opponent.pos, opponent.spec.collisionRadius))) continue;
    const distance = craft.pos.distanceTo(opponent.pos);
    if (distance > 1100) continue;
    // Hysteresis avoids alternating targets when two contacts cross the same distance.
    const score = distance * (opponent.id === previous ? .7 : 1);
    if (score < bestScore) { best = opponent; bestScore = score; }
  }
  return best;
}
