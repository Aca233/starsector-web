import type { Projectile } from '../simulation/Weapon';

/** Display-only ordinary-shot poses. Separate from unconfirmed local fire and
 * from the experimental stream (which replaces the authoritative draw list). */
export type ProjectileFlightLayer = ReadonlyMap<Projectile, Projectile>;
const layers = new WeakMap<object, ProjectileFlightLayer>();
export const projectileFlightLayer = (engine: object): ProjectileFlightLayer | undefined => layers.get(engine);
export function setProjectileFlightLayer(engine: object, layer?: ProjectileFlightLayer): void {
  if (layer) layers.set(engine, layer); else layers.delete(engine);
}

/** A first-shot handoff is an offset from authority, not a second projectile.
 * Apply that offset to the flight pose without discarding either correction. */
export function projectileDisplayPose(original: Projectile, flight?: ProjectileFlightLayer,
  corrections?: ReadonlyMap<number, Projectile>): Projectile {
  const pose = flight?.get(original), correction = corrections?.get(original.id);
  if (!pose) return correction ?? original;
  if (!correction) return pose;
  const dx = correction.pos.x - original.pos.x, dy = correction.pos.y - original.pos.y;
  const pos = pose.pos.clone(); pos.x += dx; pos.y += dy;
  const tail = pose.ballisticTail?.clone(); if (tail) { tail.x += dx; tail.y += dy; }
  return { ...pose, pos, prevPos: pos, ballisticTail: tail, prevBallisticTail: tail };
}
