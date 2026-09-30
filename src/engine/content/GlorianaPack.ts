import { glorianaWings } from './GlorianaAviation';
import type { FighterWingSpec, ShipSpec, WeaponMountSlotConfig } from './ShipSpec';
import geometry from './gloriana-geometry.json';
import { GLORIANA_CORE_BUILTINS, GLORIANA_BATTERY_BUILTINS, GLORIANA_ENGINE_BUILTINS } from './GlorianaBuiltins';

/** User-approved Gloriana artwork, fixed modules; not native/lore balance data. */
export const GLORIANA_HULL_ID = 'web_gloriana';
export const GLORIANA_EDICT_ID = 'WEB_GLORIANA_BROADSIDE_EDICT';
export const GLORIANA_EDICT_ICON_URL = '/game-assets/graphics/icons/hullsys/ammo_feeder.png';
const hullId = (part: string) => part === 'C' ? GLORIANA_HULL_ID : `${GLORIANA_HULL_ID}_${part.toLowerCase()}`;
const names: Record<string,string> = { C:'荣光女王 · 不屈誓约',P1:'左前炮廊',S1:'右前炮廊',P2:'左中炮廊',S2:'右中炮廊',P3:'左后炮廊',S3:'右后炮廊',EP:'左动力舱',ES:'右动力舱' };
// wing_data.csv / imported refit catalog: ordinary removable LPC wings, not built-ins.
const defaultWings: FighterWingSpec[] = ['web_gloriana_fury_wing','web_gloriana_fury_wing','web_gloriana_thunderhawk_wing','web_gloriana_thunderhawk_wing','web_gloriana_starhawk_wing','web_gloriana_starhawk_wing'].map(id=>({...glorianaWings[id as keyof typeof glorianaWings]}));
const designation = '荣光女王级模块旗舰（Web 扩展）';
const description = '九段固定模块旗舰：核心、六座炮廊与两座动力舱。炮廊分别承担损伤与载荷，独立自动射击；失去一段就失去该段武器。全舰48个可改装挂点：14超大、14大、20中，核心2超大4大6中（舰艏M12/M13为兼容鱼雷的通用大槽；槽ID保留历史名称）；舰艏双重炮由玩家手动控制。核心另有6个可改装战机甲板，初始不预装联队；预设配装保留狂怒截击、雷鹰压盾、星鹰轰炸各2队；可显式选择“战列齐射 II”，用炮廊常态射速换敕令窗口爆发；或“盾矛协同 II”，卸舰艏鱼雷、少1雷鹰联队多1星鹰联队，安装近域整备线，以25%出击距离换战损补充效率（存活机返航装弹仍12秒）。旧配装不自动替换。四层虚空盾保护整舰及场内友舰、友方战机；友军可自由穿行屏障并向外开火，舰体仍会碰撞。每层24000承载、共96000，不将伤害转为载荷；受击停止回复4秒，全部崩溃锁定8秒后按每秒4000逐层重建。右键开关不刷新屏障，排散/过载暂停防御与重建。动力舱损伤按有效推力影响推进：单舱全失效保留65%航速、60%加速度和70%转向；双舱失效保留30%/20%/40%应急能力，制动不变。专属战列敕令锁定一侧炮廊强化实弹火力，代价为对舷装填、机动与载荷消耗。原著巨舰视觉主题的 Web 适配，首版数值待平衡；不是原版舰体或原著尺寸还原。';
function makeHull(part: typeof geometry.parts[number]): ShipSpec {
  const id=hullId(part.id),root=part.id==='C',engine=part.kind==='engine';
  // Historical L/M/S mount IDs are stable save keys; tiers are now XL/L/M.
  const slots: WeaponMountSlotConfig[]=geometry.mounts.filter(m=>m.owner===part.id).map(m=>({
    slotId:m.id,mountType:root&&m.id[0]==='L'?'HARDPOINT':'TURRET',slotSize:m.id[0]==='L'?'EXTRA_LARGE':m.id[0]==='M'?'LARGE':'MEDIUM',
    weaponType:root?(['M12','M13'].includes(m.id)?'UNIVERSAL':m.id[0]==='L'?'ENERGY':'HYBRID'):'BALLISTIC',x:part.center[1]-m.y,y:m.x-part.center[0],
    baseAngleDeg:root?0:part.center[0]<512?-90:90,arcDeg:root?(m.id[0]==='L'?30:m.id[0]==='M'?240:360):m.id[0]==='L'?200:360,
  }));
  // No baked flames. Nozzle-aligned giant drive plumes; native thrust/idle/flameout shaping is unchanged.
  const nozzles: number[][]=part.id==='EP'?[[344,1463,50,440],[407,1498,52,520],[465,1482,40,400]]:part.id==='ES'?[[680,1463,50,440],[616,1498,52,520],[558,1482,40,400]]:root?[[512,1506,8,45]]:[];
  return {
    id,sourceHullId:id,nameKey:`ship.${id}.name`,descKey:`ship.${id}.desc`,designationKey:`ship.${id}.designation`,designation,
    spriteUrl:`/game-assets/graphics/ships/web_gloriana/${part.file}`,spriteWidth:part.width,spriteHeight:part.height,pivotX:part.pivot[0],pivotY:part.pivot[1],
    bounds:part.bounds as [number,number][],collisionRadius:part.radius,mass:root?22000:engine?4200:3000,hullSize:'CAPITAL_SHIP',
    maxSpeed:28,acceleration:8,deceleration:10,maxTurnRateDeg:4,turnAccelerationDeg:2,
    hitpoints:root?60000:engine?16000:18000,armorRating:root?2400:engine?1600:1800,armorCols:30,armorRows:60,
    maxFlux:root?60000:16000,fluxDissipation:root?2400:900,shieldType:root?'OMNI':'NONE',shieldRadius:root?805:0,shieldArcDeg:root?360:240,shieldEfficiency:1.1,shieldUpkeep:root?0:.5,
    systemType:root?GLORIANA_EDICT_ID:'NONE',weaponSlots:slots,
    ...(root?{voidShield:{layers:4,integrityPerLayer:24000,rechargePerSecond:4000,hitDelay:4,restartDelay:8}}:{}),
    inheritParentEngineCommands:engine,
    engineSlots:nozzles.map(([x,y,width,length])=>({x:part.center[1]-y,y:x-part.center[0],angleDeg:180,width,length,style:'LOW_TECH',exhaust:root?{mode:'HIDDEN' as const}:{mode:'NATIVE' as const,envelopeWidth:width*1.5}})),
    ...(root?{deploymentPoints:180}:{}),deploymentCRCost:.2,peakCRSec:600,crLossPerSec:.2,fighterBays:root?6:0,
    builtInHullMods:[...(root?GLORIANA_CORE_BUILTINS:engine?GLORIANA_ENGINE_BUILTINS:GLORIANA_BATTERY_BUILTINS)],breakProbability:.15,minPieces:1,maxPieces:2,
    ...(root?{}:{isModuleHull:true,moduleCombat:true,moduleAnchor:[0,0] as [number,number]}),
    i18n:{zh_CN:{[`ship.${id}.name`]:names[part.id],[`ship.${id}.desc`]:description,[`ship.${id}.designation`]:designation},en_US:{[`ship.${id}.name`]:root?'Gloriana · Indomitable Oath':`Gloriana ${part.id}`,[`ship.${id}.desc`]:'Fixed nine-part Gloriana-themed Web flagship. Independent module damage and AI fire control; 48 removable weapon mounts, a manually controlled forward battery and six refittable flight decks. Experimental balance, not native content.',[`ship.${id}.designation`]:'Gloriana modular flagship (Web extension)'}},
  };
}
/** Empty source baselines keep every weapon removable in the existing refit system. */
export const glorianaHulls: Record<string,ShipSpec>=Object.fromEntries(geometry.parts.map(part=>[hullId(part.id),makeHull(part)]));
function fit(hull: ShipSpec): ShipSpec {
  const spec=structuredClone(hull);
  const root=spec.id===GLORIANA_HULL_ID;
  spec.weaponSlots=spec.weaponSlots.map(s=>({...s,builtIn:false,defaultWeaponId:root
    ?s.slotSize==='EXTRA_LARGE'?'web_gloriana_lance':s.slotSize==='MEDIUM'?'web_gloriana_interceptor':['M12','M13'].includes(s.slotId)?'web_gloriana_torpedo':'web_gloriana_siege'
    :s.slotSize==='EXTRA_LARGE'?'web_gloriana_macro':s.slotSize==='LARGE'?'web_gloriana_siege':'web_gloriana_bolter'}));
  if(root){
    spec.fighterWings=structuredClone(defaultWings);
    spec.defaultWeaponGroups=[
      {index:0,weaponSlotIds:spec.weaponSlots.filter(s=>s.slotSize==='EXTRA_LARGE').map(s=>s.slotId),mode:'LINKED',isAutofire:false},
      {index:1,weaponSlotIds:spec.weaponSlots.filter(s=>s.slotSize==='LARGE'&&s.weaponType!=='UNIVERSAL').map(s=>s.slotId),mode:'ALTERNATING',isAutofire:true},
      {index:2,weaponSlotIds:['M12','M13'],mode:'LINKED',isAutofire:false},
      {index:3,weaponSlotIds:spec.weaponSlots.filter(s=>s.slotSize==='MEDIUM').map(s=>s.slotId),mode:'LINKED',isAutofire:true},
    ];
    return spec;
  }
  spec.defaultWeaponGroups=[
    {index:0,weaponSlotIds:spec.weaponSlots.filter(s=>s.slotSize!=='MEDIUM').map(s=>s.slotId),mode:'ALTERNATING',isAutofire:true},
    {index:1,weaponSlotIds:spec.weaponSlots.filter(s=>s.slotSize==='MEDIUM').map(s=>s.slotId),mode:'LINKED',isAutofire:true},
  ];
  return spec;
}
export function glorianaShips(): ShipSpec[] {
  const ships=Object.fromEntries(Object.values(glorianaHulls).map(h=>[h.id,fit(h)]));
  const core=ships[GLORIANA_HULL_ID];
  core.modules=geometry.parts.filter(p=>p.id!=='C').map(p=>({slotId:p.id,x:p.offset[0],y:p.offset[1],angleDeg:0,spec:ships[hullId(p.id)]}));
  core.moduleSlots=core.modules.map(({slotId,x,y,angleDeg})=>({slotId,x,y,angleDeg}));
  core.modulePropulsion = { slotIds: ['EP', 'ES'], reserveSpeed: .3, reserveAcceleration: .2, reserveTurn: .4 };
  return Object.values(ships);
}
export const glorianaRefit={
  ships:Object.fromEntries(geometry.parts.map(p=>[hullId(p.id),{op:p.id==='C'?260:p.kind==='engine'?70:200,name:names[p.id],manufacturer:'战锤主题 · Web 扩展',designation}])),
  shipStatus:Object.fromEntries(geometry.parts.map(p=>[hullId(p.id),{level:'supported',reasons:['Web 自定义模块舰首版；非原版内容，数值待平衡。']}])),
};
