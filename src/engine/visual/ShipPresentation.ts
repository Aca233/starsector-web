import type { Vector2 } from '../math/Vector2';
/** Render-only pose. Weak storage cannot enter a combat snapshot or saved design. */
export interface ShipPresentationPose { pos: Vector2; facing: number }
const poses = new WeakMap<object, ShipPresentationPose>();
export const shipPresentationPose = (ship: object) => poses.get(ship);
export function setShipPresentationPose(ship: object, pose: ShipPresentationPose | null) {
  if (pose) poses.set(ship, pose); else poses.delete(ship);
}
