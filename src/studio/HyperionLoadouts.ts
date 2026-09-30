import { HYPERION_HULLMODS } from '../engine/content/HyperionIds';
import { HYPERION_HULL_ID, hyperionShips } from '../engine/content/HyperionPack';
import { createBundledPresetDesign } from './BundledPresetDesign';
import type { Design } from './DesignModel';
export const HYPERION_ASSAULT_FIT='雷诺旗舰 · 跃迁突破';
/** Explicit choice only: never migrates saved fits or touches other ships. */
export function createHyperionAssaultDesign():Design {
  const d=createBundledPresetDesign(HYPERION_HULL_ID);d.name=HYPERION_ASSAULT_FIT;d.vents=50;d.capacitors=20;
  for(const group of hyperionShips()[0].defaultWeaponGroups ?? [])d.groups[group.index]=structuredClone(group);
  return d;
}

export const HYPERION_FOCUS_FIT = '雷诺旗舰 · 大和压制';
export const HYPERION_REPAIR_FIT = '雷诺旗舰 · 战地续航';
/** These are opt-in complete fits, never a migration or automatic OP rebalance of the user's design. */
export function createHyperionFocusDesign(): Design {
  const d = createHyperionAssaultDesign();
  d.name = HYPERION_FOCUS_FIT; d.capacitors = 5; d.hullMods = [HYPERION_HULLMODS.focus];
  return d;
}
export function createHyperionRepairDesign(): Design {
  const d = createHyperionAssaultDesign();
  d.name = HYPERION_REPAIR_FIT; d.capacitors = 5; d.hullMods = [HYPERION_HULLMODS.repair];
  return d;
}
