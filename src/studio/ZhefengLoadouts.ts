import { createBundledPresetDesign } from './BundledPresetDesign';
import { ZHEFENG_ID, ZHEFENG_MODS as M, ZHEFENG_WEAPONS as W } from '../engine/content/ZhefengIds';
import { zhefengHull } from '../engine/content/ZhefengPack';
function loadout(pressure:boolean){const d=createBundledPresetDesign(ZHEFENG_ID);d.name=pressure?'折锋 · 压盾支援':'折锋 · 突击破甲';
  d.weapons.M01=d.weapons.M02=pressure?W.wedge:W.breaker;
  d.hullMods=[pressure?M.steady:M.assault,'reinforcedhull'];d.vents=20;d.capacitors=20;
  d.groups=d.groups.map(g=>({...g,weaponSlotIds:[]}));for(const g of zhefengHull.defaultWeaponGroups??[])d.groups[g.index]=structuredClone(g);
  return d;}
export const createZhefengAssault=()=>loadout(false);
export const createZhefengPressure=()=>loadout(true);
