import art from './ark-weapon-fx-art.json';
import type { RenderWeapon } from '../render/ShipRenderState';

export const ARK_WEAPON_FX_ROOT = '/game-assets/graphics/fx/web_adun_ark/v17/';
export const ARK_IMPACT_FX = ARK_WEAPON_FX_ROOT + 'impact-0.png';
export const arkWeaponFxArt = art;
export type ArkWeaponFxClip = keyof typeof art.clips;
export const arkWeaponFxTextures = Object.values(art.clips).flatMap(c => c.frames.map(f => ARK_WEAPON_FX_ROOT + f.file));
const clamp = (x: number) => Math.max(0, Math.min(1, x));
/** Dimensions describe authored art, never damage/collision bounds. */
export const arkWeaponFxProfiles = {
  web_ark_solar_lance: { charge: [38, 84], muzzle: [54, 136], packet: [38, 244], muzzleLife: .20 },
  web_ark_phase_battery: { charge: [14, 30], muzzle: [23, 58], packet: [18, 95], muzzleLife: .14 },
  web_ark_ion_battery: { charge: [0, 0], muzzle: [9, 25], packet: [7, 50], muzzleLife: .09 },
} as const;
export function arkWeaponFxProfile(id: string) {
  return arkWeaponFxProfiles[id as keyof typeof arkWeaponFxProfiles];
}
/** Adjacent registered artwork crossfades without doubling energy; phase 1 is
 * the last frame, not a wrap. The only looping material is an in-flight packet. */
export function sampleArkWeaponFx(key: ArkWeaponFxClip, phase: number, loop = false) {
  if (!Number.isFinite(phase) || phase < 0) return [];
  const frames = art.clips[key].frames, n = frames.length;
  const cursor = loop ? (phase % 1) * n : clamp(phase) * (n - 1);
  const i = Math.floor(cursor), mix = cursor - i;
  const current = { frame: frames[i], weight: 1 - mix };
  return mix < 1e-6 ? [current] : [current, { frame: frames[(i + 1) % n], weight: mix }];
}
/** Recoil comes from an emitted shot, not a timer inferred from holding fire. */
export function arkChargeLevel(mount: RenderWeapon, inhibited: boolean): number {
  if (inhibited || mount.isDisabled || !arkWeaponFxProfile(mount.spec.id)) return 0;
  const shotAge = (1 - clamp(mount.recoil)) * Math.max(.12, mount.spec.refireDelay * .8);
  if (mount.recoil > 0 && shotAge < .34) return 0;
  return clamp(mount.glowAlpha);
}
/** Fast compression, readable breakup, then only a late fade. The artwork
 * already dissipates, so do not multiply it by a second full linear lifetime. */
export function arkImpactPhase(age: number, duration: number): number {
  const p = clamp(age / duration);
  if (p < .12) return p / .12 / 3;
  if (p < .5) return (1 + (p - .12) / .38) / 3;
  return (2 + (p - .5) / .5) / 3;
}
