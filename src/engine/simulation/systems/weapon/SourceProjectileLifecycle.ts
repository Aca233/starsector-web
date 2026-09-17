import { Vector2 } from '../../../math/Vector2';
import type { Projectile } from '../../Weapon';

/** Native BallisticProjectile/OoOO and MovingRay/L, independent of world-velocity range. */
export function hasSourceProjectileLifecycle(p: Projectile): boolean {
  return !p.isRocket && !p.isFlare && (p.spawnType === 'BALLISTIC' || p.spawnType === 'BALLISTIC_AS_BEAM')
    && (p.fadeTime ?? 0) > 0 && (p.projLength ?? 0) > 0;
}

export function initializeSourceProjectile(p: Projectile, speed: number, inherited = new Vector2()): void {
  if (!hasSourceProjectileLifecycle(p)) return;
  p.sourceMoveSpeed = speed;
  p.sourceVelocity = inherited.clone();
  p.ballisticTail = p.pos.clone();
  p.prevBallisticTail = p.pos.clone();
  p.fadeProgress = p.prevFadeProgress = 0;
  p.unfadedDamage = p.damage;
  p.unfadedEmp = p.empDamage ?? 0;
}

/** True after complete fade; a range-fading shot can still hit at reduced damage/soft flux. */
export function advanceSourceProjectile(p: Projectile, dt: number): boolean {
  const speed = p.sourceMoveSpeed ?? p.movingRayMoveSpeed ?? p.vel.length();
  p.sourceMoveSpeed ??= speed;
  p.unfadedDamage ??= p.damage;
  p.unfadedEmp ??= p.empDamage ?? 0;
  const fade = p.fadeProgress ?? 0;
  p.prevFadeProgress = fade;
  // Native damage multiplier is evaluated before this advance's fade increment.
  const scale = p.didDamage ? 0 : (1 - fade) ** 2;
  p.damage = p.unfadedDamage * scale;
  p.empDamage = p.unfadedEmp * scale;
  p.softFlux = fade > 0;
  const tail = p.ballisticTail ??= p.prevPos.clone();
  (p.prevBallisticTail ??= tail.clone()).copy(tail);
  const dir = Vector2.fromAngle(p.facingRad ?? p.vel.heading());
  if (p.spawnType === 'BALLISTIC_AS_BEAM') {
    const length = p.pos.distanceTo(tail);
    const step = speed * dt;
    const tailStep = fade > 0 ? step : Math.max(0, length + step - (p.projLength ?? 0));
    tail.addScaled(dir, tailStep).addScaled(p.sourceVelocity ?? new Vector2(), dt);
    if (!p.didDamage) p.pos.addScaled(p.vel, dt);
    // L permits the tail to cross the fixed head; render treats that as exhausted geometry.
    if (p.didDamage && p.pos.clone().sub(tail).dot(dir) < 0) tail.copy(p.pos);
  } else {
    if (!p.didDamage) p.pos.addScaled(p.vel, dt);
    let length = p.pos.distanceTo(tail);
    if (fade > 0) length = Math.max(0, length - speed * dt);
    length = Math.min(p.projLength ?? 0, length);
    tail.copy(p.pos).addScaled(dir, -length);
  }
  p.rangeRemaining -= speed * dt;
  if (p.rangeRemaining <= 0 || p.didDamage) p.fadeProgress = Math.min(1, fade + dt / (p.fadeTime ?? .2));
  else p.fadeProgress = fade;
  return p.fadeProgress >= 1;
}

export function markSourceProjectileImpact(p: Projectile, point = p.pos): boolean {
  if (!hasSourceProjectileLifecycle(p)) return false;
  p.pos.copy(point);
  p.didDamage = true;
  p.damage = 0;
  p.empDamage = 0;
  return true;
}
