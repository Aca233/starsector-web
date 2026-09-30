import { ADUN_ARK_ID, ARK_HULLMODS } from '../engine/content/AdunArkIds';
import { createBundledPresetDesign } from './BundledPresetDesign';
import type { Design } from './DesignModel';
export const ADUN_DEFAULT_FIT='方舟 · 太阳战阵';
export function createAdunDesign():Design {
  const d=createBundledPresetDesign(ADUN_ARK_ID);d.name=ADUN_DEFAULT_FIT;d.vents=50;d.capacitors=20;d.hullMods=[ARK_HULLMODS.matrix];

  return d;
}
