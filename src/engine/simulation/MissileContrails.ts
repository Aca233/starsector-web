import { Vector2 } from '../math/Vector2';
import type { Projectile } from './Weapon';
import type { ContrailEngine } from './ContrailEngine';

/** Visual-only: reads missile state; never advances flight, guidance, RNG or damage. */
export function appendMissileContrail(contrails: ContrailEngine, p: Projectile, pos = p.pos, stripId: number | string = p.id): void {
  if (!contrails.isEnabled || !p.isRocket || p.isFlare) return;
  const heading = p.facingRad !== undefined ? p.facingRad : p.vel.heading();
  const nozzleOffset = p.missileEngineVisualSpec?.nozzleOffset ?? -(p.projLength || 25) * 0.5;
  const trail = p.missileTrailSpec;
  const nozzlePos = pos.clone().addScaled(Vector2.fromAngle(heading, 1), nozzleOffset + (trail?.spawnOffset ?? 0));
  contrails.addPoint(stripId, nozzlePos, trail?.duration ?? 1.6, trail?.baseWidth ?? 11,
    trail?.widenMult ?? 2.4, trail?.minSeg ?? 5.0, trail?.color ?? [200, 200, 205, 215], trail?.blendMode ?? 'NORMAL');
}
