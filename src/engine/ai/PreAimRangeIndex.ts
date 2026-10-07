import type { Ship } from '../simulation/Ship';
import { shieldCenterOffset } from '../simulation/collision/ShieldCollisionGeometry';
import { AcquisitionRangeIndex } from './AcquisitionRangeIndex';

/** Includes active shields even while their arcs unfold; contact-geometry extents
 * alone would be too small for acquisition. Same envelope for aim and preAim. */
export class PreAimRangeIndex extends AcquisitionRangeIndex<Ship> {
  constructor(ships: readonly Ship[]) {
    super(ships, ship => Math.max(ship.spec.collisionRadius,
      ship.shield.isActive && ship.shield.type !== 'NONE' && ship.shield.type !== 'PHASE'
        ? ship.shield.radius + shieldCenterOffset(ship) : 0));
  }
}
