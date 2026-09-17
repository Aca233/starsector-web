import { Vector2 } from '../../../math/Vector2';
import type { Projectile } from '../../Weapon';
import type { Ship } from '../../Ship';

/** MissileAI.seekTarget + OO0O's acceleration-weighted missile lead.
 * Only the positive guidance bonus opts into this consumer; other source AI adapters remain unchanged. */
export function missileGuidancePoint(p: Projectile, target: Ship): Vector2 {
  const g = Math.max(0, Math.min(1, p.guidanceBonus ?? 0));
  if (g === 0) return target.pos;
  const delta = target.pos.clone().sub(p.pos), distance = delta.length();
  const direction = distance > 0 ? delta.clone().scale(1 / distance) : new Vector2();
  const range = Math.max(0, distance - (p.radius + target.spec.collisionRadius) * .75);
  const maxSpeed = p.maxSpeed ?? p.vel.length();
  const targetRadialSpeed = target.vel.dot(direction);
  const accelerationTime = maxSpeed / Math.max(10, p.engineAcceleration ?? 0) * 2;
  const timeToTarget = Math.max(.1, range / Math.max(100, Math.max(100, maxSpeed) - targetRadialSpeed));
  const inherited = p.vel.clone().scale(accelerationTime / (timeToTarget + accelerationTime));
  const relative = target.vel.clone().sub(inherited);
  const closing = -relative.dot(direction);
  let speed = (closing + maxSpeed * .5 * g) * (1.5 - .5 * g);
  if (speed <= 10) speed = 20;
  return target.pos.clone().addScaled(relative, Math.max(0, Math.min(10, range / speed)));
}
