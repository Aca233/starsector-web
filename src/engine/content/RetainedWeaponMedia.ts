import media from './retained-weapon-media.json';
import type { WeaponSpec } from '../simulation/Weapon';

/** User-requested retained original effects/audio. Not original weapon definitions or a license grant. */
export const retainedWeaponMediaFields = ["soundKey","soundIntroKey","soundLoopKey","color","fringeColor","coreColor","glowColor","hitGlowRadius","glowRadius","coreWidthMult","textureType","textureScrollSpeed","pixelsPerTexel","beamWidth","beamVisualMode","hitGlowBrightenDuration","useGlowColorForHitGlow","fringeScrollSpeedMult","darkCore","darkFringeIter","darkCoreIter","projSpriteUrl","projLength","projWidth","muzzleFlashSpec","launcherSmokeSpec","muzzleFlashColor","muzzleFlashSize","missileEngineVisualSpec","missileExplosionVisualSpec"] as const satisfies readonly (keyof WeaponSpec)[];
type WeaponMedia = Partial<Pick<WeaponSpec, typeof retainedWeaponMediaFields[number]>>;
const presets = media as unknown as Readonly<Record<string, WeaponMedia>>;
export function retainedWeaponMedia(customWeaponId: string): WeaponMedia {
  const preset = presets[customWeaponId];
  if (!preset) throw new Error('No retained media for custom weapon: ' + customWeaponId);
  return structuredClone(preset);
}
