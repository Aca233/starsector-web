import type { ShipSpec } from '../content/ShipSpec';

/** renderers/ventingAnimation.cfr_renamed_4(Ship): shared halo/plume extent. */
export function getVentExtent(spec: ShipSpec): number {
  return Math.max(spec.spriteWidth, spec.spriteHeight) * 0.75 * 0.35 * 1.5 + 125
    - (spec.hullSize === 'FIGHTER' ? 75 : 0);
}

/**
 * combat/ai/OO0O.cfr_renamed_4(from, ship, false). The source uses an offset
 * sprite/collision ellipse + 10, NOT an intersection with authored hull bounds.
 * angle is ship-local; pivotY is converted back from the Web texture convention.
 */
export function getVentTargetingRadius(spec: ShipSpec, angle: number): number {
  const turn = Math.PI * 2;
  const theta = ((angle % turn) + turn) % turn;
  const base = Math.min(spec.spriteHeight / 2, spec.collisionRadius);
  const foreOffset = spec.pivotY - spec.spriteHeight / 2;
  const sideOffset = spec.spriteWidth / 2 - spec.pivotX;
  const a = Math.max(0.001, base + (Math.cos(theta) < 0 ? -foreOffset : foreOffset));
  const b = Math.max(0.001, base * spec.spriteWidth / Math.max(1, spec.spriteHeight)
    + (theta > 0 && theta <= Math.PI ? -sideOffset : sideOffset));
  return a * b / Math.hypot(a * Math.sin(theta), b * Math.cos(theta)) + 10;
}
