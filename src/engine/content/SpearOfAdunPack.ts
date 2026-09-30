/** Retired 2026-09-28 by user request. Historical authoring reference only; never register in runtime. */
import type { ShipSpec, WeaponMountSlotConfig } from './ShipSpec';
import { ADUN_HULL_ID, ADUN_SYSTEM_ID, ADUN_ART } from './SpearOfAdunIds';
import { ADUN_WEAPONS, adunWeapons, adunArmoryStrings } from './SpearOfAdunArmory';
import art from './spear-of-adun-art.json';
import xlArt from './spear-of-adun-xl-art.json';
export { ADUN_HULL_ID } from './SpearOfAdunIds';
const scale=art.hull.scale;
/** Atlas pixel -> ship local (+x forward, +y right). Same calibration drives art and nozzles. */
export const adunPoint=(x:number,y:number):[number,number]=>[(art.hull.sourcePivot[1]-y)*scale,(x-art.hull.sourcePivot[0])*scale];
const seatNames={EXTRA_LARGE:['seatXL','seat-xl'],LARGE:['seatL','seat-l'],MEDIUM:['seatM','seat-m'],SMALL:['seatS','seat-s']} as const;
function mount(slotId:string,x:number,y:number,slotSize:WeaponMountSlotConfig['slotSize'],baseAngleDeg=0,arcDeg=240):WeaponMountSlotConfig {
  const [key,file]=seatNames[slotSize],a=slotSize==='EXTRA_LARGE'?xlArt.seat:art[key],[forward,right]=adunPoint(x,y);
  const sprite=ADUN_ART+(slotSize==='EXTRA_LARGE'?xlArt.seat.file:file+'.png');
  const front=xlArt.foreground;
  return {slotId,x:forward,y:right,slotSize,mountType:'TURRET',weaponType:'ENERGY',baseAngleDeg,arcDeg,
    installation:{version:1,spriteUrl:sprite,width:a.width,height:a.height,pivotX:a.pivotX,pivotY:a.pivotY,angleDeg:-baseAngleDeg,
      ...(slotSize==='EXTRA_LARGE'?{foreground:{spriteUrl:ADUN_ART+front.file,width:front.width,height:front.height,pivotX:front.pivotX,pivotY:front.pivotY}}:{})}};
}
const slots:WeaponMountSlotConfig[]=[
  mount('XL01',332,420,'EXTRA_LARGE',0,100),mount('XL02',598,420,'EXTRA_LARGE',0,100),
  mount('L01',330,635,'LARGE',-25,220),mount('L02',600,635,'LARGE',25,220),
  mount('L03',354,794,'LARGE',-90,260),mount('L04',577,794,'LARGE',90,260),
  mount('M01',395,234,'MEDIUM',-15,200),mount('M02',534,234,'MEDIUM',15,200),
  mount('M03',342,534,'MEDIUM',-70,260),mount('M04',585,534,'MEDIUM',70,260),
  mount('M05',247,778,'MEDIUM',-90,280),mount('M06',687,778,'MEDIUM',90,280),
  mount('M07',348,873,'MEDIUM',-150,260),mount('M08',586,873,'MEDIUM',150,260),
  mount('S01',374,290,'SMALL',-40,300),mount('S02',554,290,'SMALL',40,300),
  mount('S03',333,492,'SMALL',-90,300),mount('S04',597,492,'SMALL',90,300),
  mount('S05',271,601,'SMALL',-90,300),mount('S06',659,601,'SMALL',90,300),
  mount('S07',217,735,'SMALL',-110,300),mount('S08',713,735,'SMALL',110,300),
  mount('S09',312,845,'SMALL',-150,300),mount('S10',619,845,'SMALL',150,300),
  mount('S11',392,917,'SMALL',180,300),mount('S12',536,917,'SMALL',180,300),
];
// Outer silhouette only. The decorative central opening is not a traversable collision hole in v1.
const outline=[[465,16],[505,110],[545,179],[555,69],[586,242],[578,310],[645,455],[609,468],[622,533],[656,545],[685,650],[709,678],[737,771],[710,820],[737,918],[701,871],[676,975],[638,935],[619,987],[570,955],[503,952],[465,1005],[430,953],[360,955],[310,987],[291,935],[255,975],[239,871],[207,916],[216,823],[193,771],[213,679],[245,650],[275,543],[300,533],[321,468],[283,455],[350,310],[343,243],[374,72],[386,181],[423,110]];
export const adunHull:ShipSpec={
  id:ADUN_HULL_ID,sourceHullId:ADUN_HULL_ID,nameKey:'ship.web_spear_of_adun.name',descKey:'ship.web_spear_of_adun.desc',designationKey:'ship.web_spear_of_adun.designation',
  designation:'星灵方舟 · 安装架构验证舰',spriteUrl:'/game-assets/graphics/ships/web_spear_of_adun/hull.png',
  spriteWidth:art.hull.width,spriteHeight:art.hull.height,pivotX:art.hull.width*art.hull.pivotX,pivotY:art.hull.height*art.hull.pivotY,
  collisionRadius:525,mass:14000,hullSize:'CAPITAL_SHIP',hitpoints:42000,armorRating:1600,armorCols:25,armorRows:43,
  maxFlux:50000,fluxDissipation:2400,maxSpeed:38,acceleration:16,deceleration:18,maxTurnRateDeg:7,turnAccelerationDeg:5,
  shieldType:'OMNI',shieldArcDeg:360,shieldRadius:480,shieldCenterX:65,shieldCenterY:0,shieldEfficiency:.7,shieldUpkeep:.5,
  deploymentPoints:100,deploymentCRCost:.2,peakCRSec:600,crLossPerSec:.25,
  systemType:ADUN_SYSTEM_ID,systemTypes:[ADUN_SYSTEM_ID],fighterBays:0,builtInHullMods:[],weaponSlots:slots,
  engineSlots:[[398,954,26,240],[527,954,26,240]].map(([x,y,width,length])=>{const [forward,right]=adunPoint(x,y);return {x:forward,y:right,width,length,angleDeg:180,style:'HIGH_TECH'};}),
  bounds:outline.map(([x,y])=>adunPoint(x,y)),overloadColor:[75,180,255],explosionColor:[70,165,255],explosionFlashColor:[210,245,255],breakProbability:.3,minPieces:2,maxPieces:4,
  i18n:{zh_CN:{'ship.web_spear_of_adun.name':'亚顿之矛','ship.web_spear_of_adun.designation':'星灵方舟（Web改编）','ship.web_spear_of_adun.desc':'星际争霸亚顿之矛主题验证舰：2超大/4大/8中/12小型能量挂点，固定承座与独立炮头。长矛有限电容，离子压盾后裂解破甲；F太阳锻炉提高输出，但降低散热与机动。非原作方舟实际尺寸/战役能力；舰载机与轨道支援未实现。'},en_US:{'ship.web_spear_of_adun.name':'Spear of Adun','ship.web_spear_of_adun.designation':'Protoss Ark (Web adaptation)','ship.web_spear_of_adun.desc':'26 calibrated mounts. Solar Forge trades mobility and heat dissipation for energy firepower. Prototype, not campaign-scale parity.'}},
};
export const adunHulls:Record<string,ShipSpec>={[ADUN_HULL_ID]:adunHull};
export function adunShips():ShipSpec[] {
  const ship=structuredClone(adunHull);
  const defaults={EXTRA_LARGE:ADUN_WEAPONS.lance,LARGE:ADUN_WEAPONS.disruptor,MEDIUM:ADUN_WEAPONS.ion,SMALL:ADUN_WEAPONS.prism};
  // Intrinsic hull bindings win over the suggested fit, as in assembleShip().
  // Weapon identity locking is independent of HARDPOINT/TURRET motion.
  ship.weaponSlots=ship.weaponSlots.map(s=>({...s,
    defaultWeaponId:s.defaultWeaponId ?? defaults[s.slotSize],
    builtIn:s.builtIn ?? !!s.defaultWeaponId,
  }));
  ship.defaultWeaponGroups=['EXTRA_LARGE','LARGE','MEDIUM','SMALL'].map((size,index)=>({index,weaponSlotIds:ship.weaponSlots.filter(s=>s.slotSize===size).map(s=>s.slotId),mode:index===0||index===3?'LINKED':'ALTERNATING',isAutofire:index!==0}));
  return [ship];
}
export const adunRefit={ships:{[ADUN_HULL_ID]:{op:430,name:'亚顿之矛',manufacturer:'星际争霸主题 · Web扩展',designation:adunHull.designation!}},
  shipStatus:{[ADUN_HULL_ID]:{level:'supported',reasons:['安装架构 v1 试玩舰；非原作完整方舟能力，尚无舰载机和轨道支援。']}}};
/** Bundled single-ship content unit; no dependency on other authored ship packs. Host still provides systems/renderer. */
export const spearOfAdunPack={id:'web-spear-of-adun',name:'亚顿之矛',version:'0.1.0',author:'Web舰船工坊',
  description:'安装架构v1验证舰。包含舰体、26承座、四档武器与默认配装；仍为内置内容包，不是独立ZIP安装器。',
  ships:adunShips(),weapons:adunWeapons,i18n:adunArmoryStrings};
