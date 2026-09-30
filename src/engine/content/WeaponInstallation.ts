import type { WeaponMountSlotConfig } from './ShipSpec';
/** Serializable v1 hull-side mount art. Dimensions are world units; pivots normalized. */
export interface WeaponInstallationLayer {
  spriteUrl: string;
  width: number;
  height: number;
  pivotX: number;
  pivotY: number;
}
export interface WeaponInstallation extends WeaponInstallationLayer {
  version: 1;
  /** Authored hull-fixed lip, drawn over the rotating root; shares the mount origin and angle. */
  foreground?: WeaponInstallationLayer;
  /** Relative to the slot's rest orientation, not live turret aim. */
  angleDeg: number;
}
export interface WeaponArtCalibration {
  spriteWidth?: number;
  spriteHeight?: number;
  spritePivotX?: number;
  spritePivotY?: number;
}
/** Old content uses native texture size and centered pivots, exactly as before. */
export function weaponArtLayout(spec: WeaponArtCalibration, textureWidth: number, textureHeight: number) {
  return { width: spec.spriteWidth ?? textureWidth, height: spec.spriteHeight ?? textureHeight,
    pivotX: spec.spritePivotX ?? .5, pivotY: spec.spritePivotY ?? .5 };
}
export function installationPose(slot: WeaponMountSlotConfig, x: number, y: number, facing: number, layer: 'base' | 'foreground' = 'base') {
  const installation = slot.installation;
  const art = layer === 'foreground' ? installation?.foreground : installation;
  if (!art || !installation || slot.mountType === 'HIDDEN') return undefined;
  const c = Math.cos(facing), s = Math.sin(facing);
  return { ...art, x: x + slot.x*c - slot.y*s, y: y + slot.x*s + slot.y*c,
    facing: facing + (slot.baseAngleDeg + installation.angleDeg)*Math.PI/180 };
}
