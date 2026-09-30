import type { ShipSpec } from './ShipSpec';
import art from './zhefeng-art.json';
import { ZHEFENG_ID, ZHEFENG_MODS as M, ZHEFENG_SYSTEM, ZHEFENG_WEAPONS as W } from './ZhefengIds';
const description='原创突击驱逐舰：双中型主炮、双小型压盾炮、双近防，六槽均可同档换装。先开前盾，F以1.5秒承压换取3秒无盾反击，1秒恢复后进入12秒冷却；恢复时右键重新开盾。内置分流电容舱，选装突击/稳态两种互斥火控。14DP为初始设计成本，非最终平衡。无模块、无舰载机，不依赖其它扩展舰。';
export const zhefengHull:ShipSpec={
  id:ZHEFENG_ID,sourceHullId:ZHEFENG_ID,nameKey:'折锋级',designationKey:'突击驱逐舰',descKey:'ship.web_zhefeng.desc',designation:'折锋级 · 突击驱逐舰（Web原创）',
  spriteUrl:'/game-assets/graphics/ships/web_zhefeng/hull-cylinders-v03.png',spriteWidth:art.spriteWidth,spriteHeight:art.spriteHeight,pivotX:art.pivotX,pivotY:art.pivotY,
  bounds:art.bounds as [number,number][],collisionRadius:Math.max(...art.bounds.map(([x,y])=>Math.hypot(x,y))),mass:850,hullSize:'DESTROYER',
  deploymentPoints:14,deploymentCRCost:.14,hitpoints:5200,armorRating:650,armorCols:10,armorRows:20,maxFlux:5000,fluxDissipation:400,
  maxSpeed:100,acceleration:65,deceleration:60,maxTurnRateDeg:35,turnAccelerationDeg:60,peakCRSec:360,crLossPerSec:.25,
  shieldType:'FRONT',shieldArcDeg:180,shieldRadius:175,shieldCenterX:5,shieldCenterY:0,shieldEfficiency:.9,shieldUpkeep:.3,
  systemType:ZHEFENG_SYSTEM,builtInHullMods:[M.capacitor],fighterBays:0,
  weaponSlots:art.mounts.map(m=>({slotId:m.id,x:m.local[0],y:m.local[1],slotSize:m.id.startsWith('M')?'MEDIUM':'SMALL',weaponType:'BALLISTIC',mountType:'TURRET',baseAngleDeg:m.id.startsWith('PD')?(m.id.endsWith('1')?-110:110):0,arcDeg:m.id.startsWith('PD')?280:240})),
  engineSlots:art.nozzles.map((n,i)=>({x:n.local[0],y:n.local[1],angleDeg:180,width:n.width,length:i<2?70:25,style:'MIDLINE',exhaust:{mode:'NATIVE' as const,envelopeWidth:i<2?48:12}})),
  defaultWeaponGroups:[{index:0,weaponSlotIds:['M01','M02'],mode:'LINKED',isAutofire:false},{index:1,weaponSlotIds:['S01','S02'],mode:'ALTERNATING',isAutofire:true},{index:2,weaponSlotIds:['PD01','PD02'],mode:'ALTERNATING',isAutofire:true}],
  i18n:{zh_CN:{'ship.web_zhefeng.desc':description}},breakProbability:.45,minPieces:2,maxPieces:3,
};
export const zhefengHulls:Record<string,ShipSpec>={[ZHEFENG_ID]:zhefengHull};
export function zhefengShips():ShipSpec[]{const ship=structuredClone(zhefengHull);ship.weaponSlots=ship.weaponSlots.map(s=>({...s,defaultWeaponId:s.slotId.startsWith('M')?W.breaker:s.slotId.startsWith('PD')?W.guard:W.needle}));return [ship];}
export const zhefengRefit={ships:{[ZHEFENG_ID]:{op:110,name:'折锋级',manufacturer:'折锋工坊 · Web原创',designation:zhefengHull.designation!}},shipStatus:{[ZHEFENG_ID]:{level:'supported',reasons:['原创14DP三阶段突击驱逐舰；初始平衡。']}}};
