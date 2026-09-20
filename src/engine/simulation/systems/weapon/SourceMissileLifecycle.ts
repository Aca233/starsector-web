import type { Projectile } from '../../Weapon';
import type { SimulationRandom } from '../../SimulationRandom';

export function hasSourceMissileLifecycle(p: Projectile): boolean {
  return !!p.isRocket && !!p.missileLifecycleSpec && !p.isFlare && !p.isMine && !p.mote && p.systemFuseSeconds === undefined;
}

export function initializeSourceMissile(p: Projectile, random: SimulationRandom): void {
  if (!hasSourceMissileLifecycle(p)) return;
  p.armedWhileFizzling = random.next() > p.missileLifecycleSpec!.dudProbabilityOnFlameout;
  p.missileRangeOrigin = p.pos.clone();
}

/** Fuel expiry starts a native coasting phase, not a contact explosion. Movement is owned by the caller. */
export function advanceSourceMissile(p: Projectile, dt: number): boolean {
  const spec = p.missileLifecycleSpec!;
  p.prevFadeProgress = p.fadeProgress ?? 0;
  if (p.missileFizzleTime === undefined) {
    p.missileRangeOrigin ??= p.spawnLocation?.clone() ?? p.prevPos.clone();
    const reachedRange = spec.fizzleOnReachingWeaponRange && p.pos.distanceTo(p.missileRangeOrigin) > p.totalRange;
    if (p.flightTimeRemaining !== undefined) p.flightTimeRemaining -= dt;
    if (!reachedRange && (p.flightTimeRemaining === undefined || p.flightTimeRemaining > 0)) return false;
    // Only the exhausted part of this step belongs to the coasting phase.
    p.missileFizzleTime = reachedRange ? dt : Math.min(dt, Math.max(0, -(p.flightTimeRemaining ?? 0)));
    p.flightTimeRemaining = Math.min(0, p.flightTimeRemaining ?? 0);
    p.isDisarmed ||= p.armedWhileFizzling === false;
    p.isGuided = false;
    p.targetShipId = p.targetProjectileId = undefined;
    p.unfadedDamage = p.damage;
    p.unfadedEmp = p.empDamage ?? 0;
    if (spec.collisionClassAfterFlameout === 'NONE') p.collisionDisabled = true;
  } else {
    p.missileFizzleTime += dt;
  }
  const remaining = spec.flameoutTime - p.missileFizzleTime;
  p.fadeProgress = spec.fadeTime > 0 ? Math.max(0, Math.min(1, 1 - remaining / spec.fadeTime)) : (remaining <= 0 ? 1 : 0);
  if (p.fadeProgress > 0) {
    if (spec.noCollisionWhileFading) p.collisionDisabled = true;
    else if (spec.reduceDamageWhileFading) {
      p.damage = (p.unfadedDamage ?? p.damage) * (1 - p.fadeProgress);
      p.empDamage = (p.unfadedEmp ?? 0) * (1 - p.fadeProgress);
      p.softFlux = true;
    }
  }
  return remaining <= 0;
}

/** Conservative physical lifetime, including still-armed coasting missiles. */
export function remainingProjectileLifetime(p: Projectile): number {
  if (hasSourceMissileLifecycle(p)) {
    const flameout = Math.max(0, p.missileLifecycleSpec!.flameoutTime - (p.missileFizzleTime ?? 0));
    if (p.missileFizzleTime !== undefined) return flameout;
    if (p.flightTimeRemaining !== undefined) return Math.max(0, p.flightTimeRemaining) + flameout;
  }
  if (p.flightTimeRemaining !== undefined) return p.flightTimeRemaining;
  if (p.rangeRemaining === undefined) return Infinity;
  return Math.max(0, p.rangeRemaining) / Math.max(1, p.sourceMoveSpeed ?? p.vel.length())
    + Math.max(0, (p.fadeTime ?? 0) * (1 - (p.fadeProgress ?? 0)));
}
