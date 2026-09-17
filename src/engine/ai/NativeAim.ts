import { Vector2 } from '../math/Vector2';
import type { Ship } from '../simulation/Ship';
import type { WeaponMount } from '../simulation/Weapon';
import type { AimSolution } from './AutofireController';

/** Native OO0O leading: range/closing-speed estimate, radius allowance and firing-time convergence.
 * This is an aim point, not a collision oracle; the independent safety trace remains authoritative.
 * No random angular error or invented reaction delay. Manual aiming never calls this function. */
export function nativeAutofireAim(ship: Ship, mount: WeaponMount, solution: AimSolution, firingTime: number): Vector2 {
  if (mount.spec.isBeam || mount.spec.isGuided) return solution.point;
  const target = solution.target.entity;
  const targetRadius = solution.target.kind === 'SHIP' ? solution.target.entity.spec.collisionRadius : solution.target.entity.radius;
  const delta = target.pos.clone().sub(ship.pos);
  const distance = delta.length();
  const relative = target.vel.clone().sub(ship.vel);
  const closing = distance > 0 ? -(relative.x * delta.x + relative.y * delta.y) / distance : 0;
  const accuracy = Math.max(1, 2 - Math.max(0, Math.min(1, ship.hullStats.autofireAimAccuracy)) - firingTime / 15 - (mount.spec.autofireAccuracyBonus ?? 0));
  const range = Math.max(0, distance - (ship.spec.collisionRadius + targetRadius) * .75);
  const adjustedClosing = closing * accuracy;
  let speed = (closing + solution.speed) * accuracy;
  if (speed <= 10) speed = 20;
  let time = range / speed;
  time = Math.max(0, Math.min(10, (range - adjustedClosing * time) / speed));
  return target.pos.clone().addScaled(relative, time + solution.delay);
}
