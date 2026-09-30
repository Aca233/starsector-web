import { HYPERION_HULLMODS } from './HyperionIds';
import { retainedWeaponMedia } from './RetainedWeaponMedia';
import type { ShipSpec, WeaponMountSlotConfig } from './ShipSpec';
import type { WeaponSpec } from '../simulation/Weapon';
import { HYPERION_WEAPONS } from './HyperionArmory';
import { originalWeapon } from './OriginalDefaults';

import { HYPERION_HULL_ID, HYPERION_YAMATO_ID, HYPERION_JUMP_ID, HYPERION_PROJECTILE_ID, HYPERION_HIT_EFFECT } from './HyperionIds';
export { HYPERION_HULL_ID, HYPERION_YAMATO_ID, HYPERION_JUMP_ID, HYPERION_PROJECTILE_ID } from './HyperionIds';
export const HYPERION_SPRITE = '/game-assets/graphics/ships/web_sc2_hyperion/hyperion.png';
/** v02 actual PNG 1122x1402; source pixels -> +x forward / +y starboard. */
export const hyperionGeometry = { width:1122, height:1402, pivot:[561,820], scale:.5 } as const;
export const hyperionPoint = (x:number,y:number):[number,number] => [(820-y)*.5,(x-561)*.5];
const mount = (slotId:string,x:number,y:number,slotSize:WeaponMountSlotConfig['slotSize'],weaponType:WeaponMountSlotConfig['weaponType'],baseAngleDeg=0,arcDeg=240):WeaponMountSlotConfig => {
  const [forward,right]=hyperionPoint(x,y);
  return {slotId,x:forward,y:right,slotSize,weaponType,mountType:'TURRET',baseAngleDeg,arcDeg};
};
// Includes the open neck and shoulder gaps. Not a convex collision envelope.
const outline:[number,number][] = [[550,93],[600,98],[657,150],[710,164],[752,190],[790,200],[824,224],[827,380],[790,409],[668,424],[667,700],[677,754],[742,764],[773,749],[839,754],[923,784],[971,766],[970,676],[988,649],[1026,649],[1033,680],[1046,703],[1045,1076],[1028,1108],[988,1113],[970,1085],[970,993],[932,1052],[832,1070],[813,1130],[766,1139],[760,1250],[724,1280],[724,1325],[400,1325],[399,1280],[359,1250],[351,1140],[303,1134],[290,1070],[208,1057],[190,1000],[149,996],[146,1085],[131,1113],[98,1110],[79,1080],[76,705],[93,682],[96,650],[128,650],[143,680],[146,769],[194,784],[278,754],[347,753],[377,765],[438,755],[447,700],[455,424],[329,422],[293,384],[294,224],[329,202],[370,190],[413,164],[465,153],[500,111]];
export const hyperionHull:ShipSpec = {
  id:HYPERION_HULL_ID,sourceHullId:HYPERION_HULL_ID,
  nameKey:'ship.web_sc2_hyperion.name',descKey:'ship.web_sc2_hyperion.desc',designationKey:'ship.web_sc2_hyperion.designation',
  designation:'休伯利安级战列巡航旗舰（Web 扩展）',spriteUrl:HYPERION_SPRITE,
  spriteWidth:561,spriteHeight:701,pivotX:280.5,pivotY:410,
  collisionRadius:370,mass:6500,hullSize:'CAPITAL_SHIP',hitpoints:24000,armorRating:1300,armorCols:28,armorRows:35,
  maxFlux:28000,fluxDissipation:1500,maxSpeed:55,acceleration:22,deceleration:25,maxTurnRateDeg:10,turnAccelerationDeg:7,
  shieldType:'FRONT',shieldArcDeg:240,shieldRadius:375,shieldCenterX:25,shieldCenterY:0,shieldEfficiency:.9,shieldUpkeep:.4,
  deploymentPoints:65,deploymentCRCost:.18,peakCRSec:540,crLossPerSec:.25,
  systemType:HYPERION_YAMATO_ID,systemTypes:[HYPERION_YAMATO_ID,HYPERION_JUMP_ID],fighterBays:0,builtInHullMods:[HYPERION_HULLMODS.reactor],
  weaponSlots:[
    mount('L01',434,243,'LARGE','ENERGY',0,100),mount('L02',689,243,'LARGE','ENERGY',0,100),
    mount('L03',395,1010,'LARGE','ENERGY',-45,260),mount('L04',727,1010,'LARGE','ENERGY',45,260),
    mount('M01',332,243,'MEDIUM','HYBRID',-20,200),mount('M02',790,243,'MEDIUM','HYBRID',20,200),
    mount('M03',484,408,'MEDIUM','ENERGY',-20,200),mount('M04',637,408,'MEDIUM','ENERGY',20,200),
    mount('M05',484,610,'MEDIUM','ENERGY',-90,220),mount('M06',637,610,'MEDIUM','ENERGY',90,220),
    mount('M07',165,806,'MEDIUM','HYBRID',-90,260),mount('M08',956,806,'MEDIUM','HYBRID',90,260),
    mount('S01',326,353,'SMALL','HYBRID',-30,300),mount('S02',798,353,'SMALL','HYBRID',30,300),
    mount('S03',484,505,'SMALL','HYBRID',-90,240),mount('S04',637,505,'SMALL','HYBRID',90,240),
    mount('S05',482,695,'SMALL','HYBRID',-90,240),mount('S06',640,695,'SMALL','HYBRID',90,240),
    mount('S07',164,947,'SMALL','HYBRID',-90,300),mount('S08',956,947,'SMALL','HYBRID',90,300),
    mount('S09',426,1170,'SMALL','HYBRID',-135,270),mount('S10',696,1170,'SMALL','HYBRID',135,270),
    mount('S11',499,1234,'SMALL','HYBRID',180,240),mount('S12',624,1234,'SMALL','HYBRID',180,240),
  ],
  systemWeaponSlots:[{slotId:'SYS_YAMATO',x:369,y:0,slotSize:'LARGE',weaponType:'BUILT_IN',mountType:'HIDDEN',baseAngleDeg:0,arcDeg:24}],
  engineSlots:[[495,1324,23,170],[561,1324,30,210],[629,1324,23,170]].map(([x,y,width,length])=>{
    const [forward,right]=hyperionPoint(x,y);return {x:forward,y:right,width,length,angleDeg:180,style:'HIGH_TECH',exhaust:{mode:'NATIVE' as const,envelopeWidth:width*1.55}};
  }),
  bounds:outline.map(([x,y])=>hyperionPoint(x,y)),overloadColor:[90,170,255],explosionColor:[255,170,80],explosionFlashColor:[220,240,255],breakProbability:.35,minPieces:2,maxPieces:4,
  i18n:{zh_CN:{'ship.web_sc2_hyperion.name':'休伯利安号','ship.web_sc2_hyperion.designation':'战列巡航旗舰（SC2主题）','ship.web_sc2_hyperion.desc':'雷诺旗舰主题的 Web 改编。24 个可换装挂点配备 ATA、AL 和拦截激光；跃迁收束后六秒以高载荷成本换取火力突击；大和炮与战术跃迁共用反应堆储备，重击后需要等待恢复才能脱离。不是原版海波龙，不具备荣光女王虚空盾；数值和正面护盾为 Web 适配，非 SC2 原始规则。'},en_US:{'ship.web_sc2_hyperion.name':'Hyperion','ship.web_sc2_hyperion.designation':'Battlecruiser flagship (SC2-themed)','ship.web_sc2_hyperion.desc':'A Web adaptation with 24 removable mounts and a shared reactor for Yamato and Tactical Jump. Not the native Hyperion frigate. Experimental Web balance, not canonical SC2 rules.'}},
};
export const hyperionHulls:Record<string,ShipSpec> = {[HYPERION_HULL_ID]:hyperionHull};
export function hyperionShips():ShipSpec[] {
  const ship=structuredClone(hyperionHull);
  ship.weaponSlots=ship.weaponSlots.map(s=>({...s,builtIn:false,defaultWeaponId:s.slotSize==='LARGE'?HYPERION_WEAPONS.battery:s.slotSize==='MEDIUM'?HYPERION_WEAPONS.suppressor:HYPERION_WEAPONS.interceptor}));
  ship.defaultWeaponGroups=[{index:0,weaponSlotIds:['L01','L02'],mode:'LINKED',isAutofire:false},{index:1,weaponSlotIds:['L03','L04'],mode:'ALTERNATING',isAutofire:true},{index:2,weaponSlotIds:ship.weaponSlots.filter(s=>s.slotSize==='MEDIUM').map(s=>s.slotId),mode:'ALTERNATING',isAutofire:true},{index:3,weaponSlotIds:ship.weaponSlots.filter(s=>s.slotSize==='SMALL').map(s=>s.slotId),mode:'LINKED',isAutofire:true}];
  return [ship];
}
/** System-only: not a free removable large weapon and not shown in the refit catalogue. */
export const hyperionYamatoProjectile:WeaponSpec = {
  ...originalWeapon('energy'), ...retainedWeaponMedia(HYPERION_PROJECTILE_ID),mountSize:'LARGE',id:HYPERION_PROJECTILE_ID,nameKey:'weapon.web_sc2_hyperion_yamato.name',systemOnly:true,
  damagePerShot:6500,damagePerSecond:0,empPerShot:0,fluxPerShot:0,range:2400,refireDelay:18,fadeTime:.6,projSpeed:1200,projRadius:25,
  color:[255,185,65],fringeColor:[255,130,35,255],coreColor:[255,245,190,255],glowColor:[255,160,45,200],hitGlowRadius:190,
  projectileExplosionSpec:{duration:0,radius:170,coreRadius:45,collisionClass:'PROJECTILE_NO_FF',particleCount:0,particleSizeMin:0,particleSizeRange:0,particleDuration:0,particleColor:[255,170,75,255]},
  passThroughFighters:false,passThroughMissiles:true,onHitEffect:HYPERION_HIT_EFFECT,
  visualProfile:{muzzleScale:2,glowScale:1.8,trailScale:1.4,impactScale:2,coreScale:1.3,brightness:1.2,fadeSeconds:.5},
};
export const hyperionRefit = {
  ships:{[HYPERION_HULL_ID]:{op:320,name:'休伯利安号',manufacturer:'星际争霸主题 · Web扩展',designation:hyperionHull.designation!}},
  shipStatus:{[HYPERION_HULL_ID]:{level:'supported',reasons:['SC2主题首版；舰体、普通武器和双技能已接入，数值为 Web 改编。']}},
};
