import type { FighterWingSpec } from '../engine/modding/ModManager';

/** Synthetic integration content, never a default loadout for a combat hull. */
export const VISUAL_LAB_WINGS: { player: FighterWingSpec[]; enemy: FighterWingSpec[] } = {
  player: [
    { specId: 'broadsword', role: 'FIGHTER', count: 3, rebuildSeconds: 12 },
    { specId: 'dagger', role: 'BOMBER', count: 2, rebuildSeconds: 16 }
  ],
  enemy: [{ specId: 'broadsword', role: 'FIGHTER', count: 3, rebuildSeconds: 12 }]
};
