import { ProjectedRenderShip } from './ProjectedRenderState';
import type { ShipRenderState, RenderWeapon, RenderSystem } from './ShipRenderState';
import { weaponPresentationAngle } from '../visual/WeaponPresentation';
import { pulsePusherOffset } from '../extensions/ship-systems/PulseDriveState';

/** Pure query boundary, also usable by inline authority read adapters. No
 * renderer imports simulation classes or reconstructs simulation prototypes. */
export function renderWeaponRange(ship:ShipRenderState,mount:RenderWeapon):number {
 if(ship instanceof ProjectedRenderShip) {
  const range=ship.weaponRanges.get(mount);
  if(range===undefined)throw Error('Missing projected weapon range');
  return range;
 }
 if(ship.getRenderWeaponRange)return ship.getRenderWeaponRange(mount);
 throw Error('Unknown ship presentation');
}
export function renderPulseOffset(system:RenderSystem):number {
 return 'pulseOffset' in system ? Number(system.pulseOffset) : pulsePusherOffset(system);
}
export function renderWeaponAngle(mount:RenderWeapon,facing:number):number|undefined {
 const local=weaponPresentationAngle(mount,facing);
 if(local!==undefined)return local;
 return 'presentationRelativeAngle' in mount && typeof mount.presentationRelativeAngle==='number' ? facing+mount.presentationRelativeAngle : undefined;
}
