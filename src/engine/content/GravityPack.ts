import type { ShipSpec, WeaponMountSlotConfig } from './ShipSpec';
import { GRAVITY_HULL_ID } from './GravityIds';
import { GRAVITY_WEAPONS as W } from './GravityArmory';
import { gravityBattleControlSpec } from './GravityControls';
import art from './gravity-battle-art.json';

const local=(p:number[]):[number,number]=>[(art.sourcePivot[1]-p[1])*art.scale,(p[0]-art.sourcePivot[0])*art.scale];
function slot(id:keyof typeof art.slots,size:WeaponMountSlotConfig['slotSize']):WeaponMountSlotConfig {
  const [x,y]=local(art.slots[id]);
  return {slotId:id,slotSize:size,mountType:'TURRET',weaponType:size==='SMALL'?'HYBRID':'ENERGY',x,y,baseAngleDeg:0,arcDeg:360};
}
// Stable ship/mount IDs preserve user fits. New measured artwork, not a scaled cruiser.
export const gravityHull:ShipSpec={
  id:GRAVITY_HULL_ID,sourceHullId:GRAVITY_HULL_ID,nameKey:'万有引力号',designationKey:'实验引力战列舰',descKey:'ship.web_gravity.desc',designation:'实验引力战列舰',
  spriteUrl:'/game-assets/graphics/gravity/hull-v8.png',spriteWidth:art.spriteWidth,spriteHeight:art.spriteHeight,pivotX:art.pivotX,pivotY:art.pivotY,
  collisionRadius:art.collisionRadius,bounds:art.bounds as [number,number][],mass:9000,hullSize:'CAPITAL_SHIP',deploymentPoints:60,deploymentCRCost:.15,
  maxSpeed:70,acceleration:45,deceleration:40,maxTurnRateDeg:25,turnAccelerationDeg:45,
  hitpoints:28000,armorRating:1400,armorCols:14,armorRows:32,maxFlux:24000,fluxDissipation:1500,peakCRSec:480,crLossPerSec:.2,
  ...gravityBattleControlSpec(),fighterBays:0,weaponSlots:[
    {...slot('TRACTOR','EXTRA_LARGE'),mountType:'HARDPOINT',builtIn:true,defaultWeaponId:W.tractor},
    ...(['M1','M2','M3','M4'] as const).map(id=>slot(id,'MEDIUM')),
    ...(['S1','S2','S3','S4','S5','S6'] as const).map(id=>slot(id,'SMALL')),
  ],
  engineSlots:art.drives.map(p=>{const [x,y]=local(p);return {x,y,angleDeg:180,width:18,length:35,style:'HIGH_TECH',exhaust:{mode:'HIDDEN'}};}),
  defaultWeaponGroups:[{index:0,weaponSlotIds:['TRACTOR'],mode:'LINKED',isAutofire:false},
    {index:1,weaponSlotIds:['M1','M2','M3','M4'],mode:'ALTERNATING',isAutofire:true},
    {index:2,weaponSlotIds:['S1','S2','S3','S4','S5','S6'],mode:'LINKED',isAutofire:true}],
  i18n:{zh_CN:{'ship.web_gravity.desc':'实验引力战列舰。主攻击为引力本身：左键捕获/牵引真实实体，对敌舰持续施加潮汐应力；点住自己的舰体拖动可牵引本舰，松开保留惯性；按住F移动唯一的区域场，松开最多10秒驻留、总有效20秒，半径1100、布置2400；按住右键时区域排斥、松手恢复吸引；区域自然到期自动潮汐爆，不能手动引爆、沿用原伤害；左键始终按鼠标拖动，不被右键接管或翻转；按住右键定向推送其他未抓住的实体，本舰区域不对抗左键牵引；G独立全向排斥并松抓，不依赖F。主攻击正常经过盾弧/装甲，不穿盾。未抓住的友舰与普通友军火力免受影响。1内置XL场投射器、4可换M能量自卫、6可换S混合近防；无盾无相位无舰载机。闭合场推进无化学尾焰。'}},
};
export const gravityHulls:Record<string,ShipSpec>={[GRAVITY_HULL_ID]:gravityHull};
export function gravityShips():ShipSpec[]{
  const ship=structuredClone(gravityHull);
  for(const s of ship.weaponSlots)if(s.slotId.startsWith('M'))s.defaultWeaponId=W.calibrator;
  else if(s.slotId.startsWith('S'))s.defaultWeaponId=['S1','S2'].includes(s.slotId)?W.deflector:W.pdc;
  return [ship];
}
export const gravityRefit={ships:{[GRAVITY_HULL_ID]:{op:280,name:'万有引力号',manufacturer:'引力实验计划',designation:gravityHull.designation!}},
  shipStatus:{[GRAVITY_HULL_ID]:{level:'supported',reasons:['原创实验引力战列舰；1XL/0L/4M/6S；潮汐主攻击。']}}};
