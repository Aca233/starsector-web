import type { Ship } from '../simulation/Ship';
import type { Vector2 } from '../math/Vector2';
import { isPointInPolygon } from '../math/Geometry';
import { signedAngle } from '../math/Angles';
import { containsVastBulk } from '../extensions/HullModPresence';
import { sameTeam } from '../simulation/CombatTeams';

type Contact = Pick<Ship, 'id' | 'teamId' | 'playerTargetId' | 'isDead' | 'hullHp' | 'isRetreated' | 'isDocked' | 'isVisibleTo'>;

/** Sensor/contact eligibility shared by the R command and its presentation. */
export function isInspectableShip(ship: Contact, observer: Contact): boolean {
  return !ship.isDead && ship.hullHp > 0 && !ship.isRetreated && !ship.isDocked && ship.isVisibleTo(observer.teamId);
}

/** Native non-damageable station skeletons are not attack targets. */
export function isTargetableCombatShip(ship: Contact & Pick<Ship, 'spec'>, observer: Contact): boolean {
  return isInspectableShip(ship, observer) && !containsVastBulk(ship.spec.builtInHullMods) && !containsVastBulk(ship.spec.hullMods);
}

/** Prefer actual hull interiors over every padded edge, then the nearest edge.
 * A core's broad collision circle must not swallow its attached modules. */
export function pickCombatContact<T extends Contact & Pick<Ship, 'pos'|'prevPos'|'spec'|'facingRad'|'prevFacingRad'>>(ships: readonly T[], observer: Contact, point: Vector2,
  padding = 50, hostileOnly = false, alpha = 1): T | null {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(padding) || !Number.isFinite(alpha)) return null;
  const tolerance = Math.max(0, padding), interpolation = Math.max(0, Math.min(1, alpha));
  let best: T | null = null, bestEdge = Infinity, bestCenter = Infinity;
  for (const ship of ships) {
    if (!isTargetableCombatShip(ship, observer) || (hostileOnly && (ship === observer || sameTeam(ship, observer)))) continue;
    const x = ship.prevPos.x + (ship.pos.x - ship.prevPos.x) * interpolation;
    const y = ship.prevPos.y + (ship.pos.y - ship.prevPos.y) * interpolation;
    const dx = point.x - x, dy = point.y - y, center = Math.hypot(dx, dy);
    const bounds = ship.spec.bounds;
    let edge = Math.max(0, center - ship.spec.collisionRadius);
    if (bounds.length >= 3) {
      const facing = ship.prevFacingRad + signedAngle(ship.facingRad - ship.prevFacingRad) * interpolation;
      const c = Math.cos(facing), s = Math.sin(facing);
      const local = {x: dx*c + dy*s, y: -dx*s + dy*c};
      edge = 0;
      if (!isPointInPolygon(local, bounds)) {
        let squared = Infinity;
        for (let i = 0, j = bounds.length - 1; i < bounds.length; j = i++) {
          const [ax, ay] = bounds[j], [bx, by] = bounds[i];
          const ex = bx - ax, ey = by - ay, length = ex*ex + ey*ey;
          const t = length > 0 ? Math.max(0, Math.min(1, ((local.x-ax)*ex + (local.y-ay)*ey) / length)) : 0;
          squared = Math.min(squared, (local.x-ax-t*ex)**2 + (local.y-ay-t*ey)**2);
        }
        edge = Math.sqrt(squared);
      }
    }
    if (edge <= tolerance && (edge < bestEdge || edge === bestEdge && center < bestCenter)) {
      best = ship; bestEdge = edge; bestCenter = center;
    }
  }
  return best;
}

export function lockedCombatTarget<T extends Contact & Pick<Ship, 'spec'>>(ships: readonly T[], observer: Contact): T | null {
  return ships.find(ship => ship.id === observer.playerTargetId && !sameTeam(ship, observer)
    && isTargetableCombatShip(ship, observer)) ?? null;
}
