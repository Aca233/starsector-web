import type { ShipSpec } from './ShipSpec';
import { ROCINANTE_HULL_ID, ROCINANTE_MODS } from './RocinanteIds';
import { ROCINANTE_WEAPONS as W } from './RocinanteArmory';
import { rocinanteHullArt, rocinantePdcSlots } from './RocinanteInstallation';

/** Frozen against the owned sprite; refit gun/tube placements are Web adaptations,
 * not coordinates measured from an official late-season production model. */
export const rocinanteHull: ShipSpec = {
  id: ROCINANTE_HULL_ID, sourceHullId: ROCINANTE_HULL_ID,
  nameKey: '罗西南特号', designationKey: '机动鱼雷护卫舰', descKey: 'ship.web_expanse_rocinante.desc',
  designation: '罗西南特 · 改装机动护卫舰（Web）', ...rocinanteHullArt, bounds: rocinanteHullArt.bounds as [number, number][],
  mass: 220, hullSize: 'FRIGATE', deploymentPoints: 8, deploymentCRCost: .12,
  hitpoints: 2600, armorRating: 350, armorCols: 6, armorRows: 16,
  maxSpeed: 160, acceleration: 210, deceleration: 90, maxTurnRateDeg: 80, turnAccelerationDeg: 160,
  maxFlux: 3000, fluxDissipation: 220, peakCRSec: 300, crLossPerSec: .25,
  shieldType: 'NONE', shieldArcDeg: 0, shieldRadius: 0, shieldEfficiency: 1, shieldUpkeep: 0,
  builtInHullMods: [ROCINANTE_MODS.matrix],
  systemType: 'WEB_ROCINANTE_ATTITUDE', systemTypes: ['WEB_ROCINANTE_ATTITUDE'],
  rightClickSystemType: 'WEB_ROCINANTE_FIRE_CONTROL', fighterBays: 0,
  weaponSlots: [
    ...rocinantePdcSlots(W.pdc),
    {slotId:'RAIL_01',mountType:'HARDPOINT',slotSize:'MEDIUM',weaponType:'BALLISTIC',x:60,y:0,baseAngleDeg:0,arcDeg:6,
      builtIn:true,defaultWeaponId:W.railgun,renderLayer:'BELOW_HULL',controlRole:'AXIAL'},
    ...([-1,1] as const).map((side, index) => ({slotId:`TORP_${index+1}`,mountType:'HARDPOINT' as const,slotSize:'MEDIUM' as const,
      weaponType:'MISSILE' as const,x:38,y:side*23,baseAngleDeg:side*8,arcDeg:90})),
  ],
  defaultWeaponGroups: [
    {index:0,weaponSlotIds:['RAIL_01'],mode:'LINKED',isAutofire:false},
    {index:1,weaponSlotIds:['TORP_1','TORP_2'],mode:'ALTERNATING',isAutofire:false},
    {index:2,weaponSlotIds:['PDC_01','PDC_02','PDC_03','PDC_04','PDC_05','PDC_06'],mode:'LINKED',isAutofire:true},
  ],
  // Source nozzle lip: [474,1562]; single main Epstein-style drive. Small reaction
  // nozzles use host flame textures, authority-measured motion, and no idle flame.
  engineSlots: [
    {x:-119.5,y:0,angleDeg:180,width:31,length:118,style:'HIGH_TECH',exhaust:{mode:'NATIVE',envelopeWidth:46.5}},
    ...([-1,1] as const).flatMap(side => [
      {x:74,y:side*20,angleDeg:side*90,width:2.1,length:17,style:'HIGH_TECH' as const,maneuver:[0,-side,-side] as [number,number,number]},
      {x:-92,y:side*23,angleDeg:side*90,width:2.1,length:17,style:'HIGH_TECH' as const,maneuver:[0,-side,side] as [number,number,number]},
      {x:83,y:side*15,angleDeg:0,width:2,length:15,style:'HIGH_TECH' as const,maneuver:[-1,0,0] as [number,number,number]},
      {x:-91,y:side*22,angleDeg:180,width:2,length:15,style:'HIGH_TECH' as const,maneuver:[1,0,0] as [number,number,number]},
    ]),
  ],
  i18n:{zh_CN:{'ship.web_expanse_rocinante.desc':'《苍穹浩瀚》罗西南特号的Web改编：无盾、高机动、六门内置近防、一门固定轴炮与两座可换装中型鱼雷。F姿态急转保留惯性，内置六联拦截矩阵扩大近防覆盖；右键切换护航/压制：压制提升PDC与轴炮射速、弹速，代价是每发载荷提高、耗散减半。用轴炮压盾、有限鱼雷破甲；近防不能代替护盾。轨炮、鱼雷安装形态与数值为本项目设计，不冒充官方模型或原著等比。'}}
};
export const rocinanteHulls: Record<string,ShipSpec> = {[ROCINANTE_HULL_ID]:rocinanteHull};
export function rocinanteShips(): ShipSpec[] {
  const ship = structuredClone(rocinanteHull);
  for (const slot of ship.weaponSlots) if (slot.slotId.startsWith('TORP_')) slot.defaultWeaponId = W.torpedo_agile;
  return [ship];
}
export const rocinanteRefit = {
  ships:{[ROCINANTE_HULL_ID]:{op:60,name:'罗西南特号',manufacturer:'苍穹浩瀚主题 · Web改编',designation:rocinanteHull.designation!}},
  shipStatus:{[ROCINANTE_HULL_ID]:{level:'supported',reasons:['无盾机动舰；7内置＋2可换中型鱼雷；Web改编初始平衡。']}},
};
