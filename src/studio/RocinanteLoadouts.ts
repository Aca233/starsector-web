import { createBundledPresetDesign } from './BundledPresetDesign';
import { ROCINANTE_HULL_ID, ROCINANTE_MODS as M } from '../engine/content/RocinanteIds';
import { ROCINANTE_WEAPONS as W } from '../engine/content/RocinanteArmory';
import { rocinanteHull } from '../engine/content/RocinantePack';
function loadout(heavy: boolean) {
  const d = createBundledPresetDesign(ROCINANTE_HULL_ID);
  d.name = heavy ? '罗西南特 · 鱼雷猎手' : '罗西南特 · 轨炮拉扯';
  d.weapons.TORP_1 = d.weapons.TORP_2 = heavy ? W.torpedo_heavy : W.torpedo_agile;
  d.hullMods = heavy ? [M.magazine, 'heavyarmor', 'fluxdistributor'] : [M.compensator, 'reinforcedhull', 'hardened_subsystems'];
  // Respect the real FRIGATE cap of 10 per flux component.
  d.vents = 10; d.capacitors = heavy ? 8 : 10;
  d.groups = d.groups.map(group => ({...group,weaponSlotIds:[]}));
  for (const group of rocinanteHull.defaultWeaponGroups ?? []) d.groups[group.index] = structuredClone(group);
  return d;
}
export const createRocinanteSkirmish = () => loadout(false);
export const createRocinanteHunter = () => loadout(true);
