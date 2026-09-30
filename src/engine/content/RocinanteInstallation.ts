import type {WeaponMountSlotConfig} from './ShipSpec';
import type {WeaponArtCalibration} from './WeaponInstallation';
import art from './rocinante-installation.json';

/** Authored installation only. Importing this module does not register playable content.
 * The complete pack consumes these frozen six-PDC anchors unchanged. */
export const rocinanteInstallation = art;
export const rocinanteHullArt = art.hull;
export const rocinantePdcArt: WeaponArtCalibration & {
  turretSpriteUrl: string; hardpointSpriteUrl: string; turretOffsets: number[];
} = art.pdc;

/** All six built-in S slots, including the physically overlapping dorsal/ventral pair.
 * Combat-plane arcs are explicit Web adaptation, not an original 3D traverse claim. */
export function rocinantePdcSlots(pdcWeaponId: string): WeaponMountSlotConfig[] {
  if (!pdcWeaponId.trim()) throw new Error('Rocinante PDC requires a real weapon binding');
  return art.mounts.map(m => ({
    slotId: m.slotId, mountType: 'TURRET', slotSize: 'SMALL', weaponType: 'BALLISTIC',
    x: m.x, y: m.y, baseAngleDeg: m.baseAngleDeg, arcDeg: m.arcDeg,
    renderLayer: m.renderLayer as WeaponMountSlotConfig['renderLayer'],
    controlRole: 'POINT_DEFENSE', builtIn: true, defaultWeaponId: pdcWeaponId,
    // Bearing is hull-fixed. Cancel rest yaw instead of inheriting turret aim.
    installation: {...art.installation, version: 1 as const, angleDeg: -m.baseAngleDeg},
  }));
}
