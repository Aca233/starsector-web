import art from './ark-lance-motion-art.json';
import { ADUN_ARK_ART } from '../content/AdunArkIds';
import type { RenderWeapon } from '../render/ShipRenderState';
export const arkLanceArt = art;
export const arkLanceTextures = art.frames.map(frame => ADUN_ARK_ART + frame.file);
const clamp = (n: number) => Math.min(1, Math.max(0, n));
const smooth = (n: number) => { const q = clamp(n); return q*q*(3-2*q); };
/** Both values already travel with the real weapon. Recoil is set only when
 * a real shot is emitted, then recovers in refireDelay*.8 seconds. No local clock,
 * firing prediction, periodic preview or private animation state can launch it.
 */
export function arkLancePose(mount?: RenderWeapon, inhibited = false): number {
 if (!mount || mount.spec.id !== 'web_ark_solar_lance' || mount.isDisabled || inhibited) return 0;
 const shotAge = (1-clamp(mount.recoil))*Math.max(.12,mount.spec.refireDelay*.8);
 if (mount.recoil>0 && shotAge<art.recoverySeconds) {
  const pose = shotAge<.18 ? 30+3*smooth(shotAge/.18) : 33+12*smooth((shotAge-.18)/(art.recoverySeconds-.18));
  return Math.round(pose);
 }
 return Math.round(clamp(mount.glowAlpha)*art.chargeEndFrame);
}
