import { createBundledPresetDesign } from './BundledPresetDesign';
import { GRAVITY_HULL_ID } from '../engine/content/GravityIds';
import { GRAVITY_WEAPONS as W } from '../engine/content/GravityArmory';
import { gravityHull } from '../engine/content/GravityPack';
function fit(control:boolean){
  const d=createBundledPresetDesign(GRAVITY_HULL_ID);
  d.name=control?'万有引力 · 引力控场':'万有引力 · 潮汐攻坚';
  for(let i=1;i<=4;i++)d.weapons['M'+i]=W.calibrator;
  for(let i=1;i<=6;i++)d.weapons['S'+i]=i<=(control?4:2)?W.deflector:W.pdc;
  d.vents=45;d.capacitors=45;d.hullMods=[];
  d.groups=d.groups.map(g=>({...g,weaponSlotIds:[]}));
  for(const g of gravityHull.defaultWeaponGroups??[])d.groups[g.index]=structuredClone(g);
  return d;
}
export const createGravityEscort=()=>fit(false);
export const createGravityControl=()=>fit(true);
