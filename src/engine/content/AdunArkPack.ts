import type { ShipSpec, WeaponMountSlotConfig } from './ShipSpec';
import { ADUN_ARK_ID, ARK_HULLMODS, ADUN_ARK_ART, ADUN_ARK_FORGE, ADUN_ARK_BARRIER, ADUN_ARK_REPAIR, ADUN_ARK_PARTS, arkHullId, type AdunArkOwner } from './AdunArkIds';
import { ARK_WEAPONS as W, arkWeapons, arkArmoryStrings } from './AdunArkArmory';
import { arkAircraft, arkWings } from './AdunArkAviation';
import art from './adun-ark-art.json';
import installationArt from './adun-ark-installations-baked.json';
import layout from './adun-ark-layout.json';
export const ARK_SCALE=art.scale;
const names:Record<AdunArkOwner,string>={CORE:'亚顿之矛 · 方舟',FORE:'舰艏 · 太阳长矛',PORT:'左翼 · 航空裂解阵列',STARBOARD:'右翼 · 航空裂解阵列',AFT:'舰尾 · 工程与供能'};
const description='五段星灵方舟（Web改编）：舰艏内置固定XL太阳长矛，4中型离子阵列压盾、2大型裂解炮破甲、6小型近防。两翼各2航空甲板，截击/突击混编14架；Z召回返航。F太阳锻炉、后续技能护盾超载与重构光束共享100太阳能且互斥：输出、承伤、修复必须取舍。尾段损毁会降低推进与供能；模块独立载荷/结构，被毁不复活。中央环为真实模型纵轴动画，不是武器平台。';
const local=(owner:AdunArkOwner,p:number[]):[number,number]=>[(art.parts[owner].anchor[1]-p[1])*ARK_SCALE,(p[0]-art.parts[owner].anchor[0])*ARK_SCALE];
function mounts(owner:AdunArkOwner):WeaponMountSlotConfig[]{return layout.filter(r=>r.owner===owner).map(r=>{
 const [x,y]=local(owner,r.point),xl=r.size==='EXTRA_LARGE',side=r.id.endsWith('PORT')?-1:1;
 const base=xl?0:r.id.startsWith('STERN')?side*145:r.id.startsWith('BOW')?side*65:r.size==='LARGE'?side*35:r.id.startsWith('AFT_OUTER')?side*105:side*30;
 const arc=xl?8:r.id.startsWith('BOW')?100:r.size==='LARGE'?70:r.size==='MEDIUM'?70:130;
 const fixture=xl?undefined:installationArt[r.id as keyof typeof installationArt];
 if(!xl&&!fixture)throw new Error("Missing calibrated ark installation: "+r.id);
 const a=fixture?.seat,lip=fixture?.foreground;
 return {slotId:r.id,x,y,slotSize:r.size as WeaponMountSlotConfig['slotSize'],mountType:xl?'HARDPOINT':'TURRET',weaponType:'ENERGY',baseAngleDeg:base,arcDeg:arc,...(!a||!lip?{builtIn:true,defaultWeaponId:W.lance}:{installation:{version:1,spriteUrl:ADUN_ARK_ART+a.file,width:a.width,height:a.height,pivotX:a.pivotX,pivotY:a.pivotY,angleDeg:-base,foreground:{spriteUrl:ADUN_ARK_ART+lip.file,width:lip.width,height:lip.height,pivotX:lip.pivotX,pivotY:lip.pivotY}}})};
});}
function hull(owner:AdunArkOwner):ShipSpec {
 const root=owner==='CORE',aft=owner==='AFT',wing=owner==='PORT'||owner==='STARBOARD',a=art.parts[owner],id=arkHullId(owner),bounds=a.bounds.map(p=>local(owner,p));
 return {id,sourceHullId:id,nameKey:'ship.'+id+'.name',descKey:'ship.'+id+'.desc',designationKey:'ship.'+id+'.designation',designation:root?'星灵模块方舟 · Web改编':'方舟战斗模块',spriteUrl:ADUN_ARK_ART+a.file,spriteWidth:(a.box[2]-a.box[0])*ARK_SCALE,spriteHeight:(a.box[3]-a.box[1])*ARK_SCALE,pivotX:(a.anchor[0]-a.box[0])*ARK_SCALE,pivotY:(a.anchor[1]-a.box[1])*ARK_SCALE,bounds,collisionRadius:Math.max(...bounds.map(([x,y])=>Math.hypot(x,y))),mass:root?30000:6000,hullSize:'CAPITAL_SHIP',
 hitpoints:root?44000:owner==='FORE'?28000:aft?24000:20000,armorRating:root?1600:1300,armorCols:24,armorRows:36,maxFlux:root?85000:owner==='FORE'?30000:24000,fluxDissipation:root?3000:owner==='FORE'?1700:1200,maxSpeed:26,acceleration:9,deceleration:12,maxTurnRateDeg:4,turnAccelerationDeg:3,
 shieldType:root?'OMNI':'NONE',shieldArcDeg:root?360:0,shieldRadius:root?1020:0,shieldEfficiency:.55,shieldUpkeep:root?.35:0,
 systemType:root?ADUN_ARK_FORGE:'NONE',systemTypes:root?[ADUN_ARK_FORGE,ADUN_ARK_BARRIER,ADUN_ARK_REPAIR]:[],weaponSlots:mounts(owner),
 // Preserve the two authority control channels; these are logical anchors, not visible nozzles.
 engineSlots:aft?[[244,968],[268,968]].map(point=>{const [x,y]=local(owner,point);return {x,y,width:24,length:260,angleDeg:180,style:'HIGH_TECH' as const,exhaust:{mode:'HIDDEN' as const}};}):[],inheritParentEngineCommands:aft,
 fighterBays:wing?2:0,builtInHullMods:root?[ARK_HULLMODS.reactor]:[],...(root?{deploymentPoints:180}:{}),deploymentCRCost:.2,peakCRSec:720,crLossPerSec:.2,breakProbability:.3,minPieces:2,maxPieces:3,overloadColor:[80,180,255],explosionColor:[75,170,255],explosionFlashColor:[210,245,255],
 ...(root?{}:{isModuleHull:true,moduleCombat:true,moduleAnchor:[0,0] as [number,number]}),i18n:{zh_CN:{['ship.'+id+'.name']:names[owner],['ship.'+id+'.desc']:description,['ship.'+id+'.designation']:root?'星灵模块方舟':'方舟战斗模块'},en_US:{['ship.'+id+'.name']:root?'Spear of Adun · Ark':owner+' Ark Module',['ship.'+id+'.desc']:description,['ship.'+id+'.designation']:'Protoss Ark (Web adaptation)'}}};
}
const owners:AdunArkOwner[]=['CORE',...ADUN_ARK_PARTS];
export const arkHulls:Record<string,ShipSpec>=Object.fromEntries(owners.map(o=>[arkHullId(o),hull(o)]));
export function arkShips():ShipSpec[]{
 const ships=Object.fromEntries(owners.map(o=>{const s=structuredClone(arkHulls[arkHullId(o)]);s.weaponSlots=s.weaponSlots.map(slot=>({...slot,defaultWeaponId:slot.defaultWeaponId??(slot.slotSize==='LARGE'?W.disruptor:slot.slotSize==='MEDIUM'?W.ion:W.prism),builtIn:slot.builtIn??false}));
 s.defaultWeaponGroups=['EXTRA_LARGE','MEDIUM','LARGE','SMALL'].map((size,index)=>({index,weaponSlotIds:s.weaponSlots.filter(slot=>slot.slotSize===size).map(slot=>slot.slotId),mode:index===0||index===3?'LINKED' as const:'ALTERNATING' as const,isAutofire:index!==0})).filter(g=>g.weaponSlotIds.length>0);
 if(o==='PORT'||o==='STARBOARD')s.fighterWings=[structuredClone(arkWings.web_ark_interceptor_wing),structuredClone(arkWings.web_ark_striker_wing)];return [s.id,s];}));
 const core=ships[ADUN_ARK_ID];core.modules=ADUN_ARK_PARTS.map(o=>{const [x,y]=local('CORE',art.parts[o].anchor);return {slotId:o,x,y,angleDeg:0,spec:ships[arkHullId(o)]};});core.moduleSlots=core.modules.map(({slotId,x,y,angleDeg})=>({slotId,x,y,angleDeg}));return Object.values(ships);
}
export const arkRefit={ships:Object.fromEntries(owners.map(o=>[arkHullId(o),{op:o==='CORE'?120:o==='FORE'?160:o==='AFT'?130:170,name:names[o],manufacturer:'星际争霸主题 · Web扩展',designation:'星灵模块方舟'}])),shipStatus:Object.fromEntries(owners.map(o=>[arkHullId(o),{level:'supported',reasons:['五段方舟；模型烘焙贴图，独立战损、航空与共享太阳能。Web改编数值。']}]))};
export const adunArkPack={id:'web-adun-ark',version:'0.6.0',ships:[...arkShips(),...arkAircraft],weapons:arkWeapons,i18n:arkArmoryStrings};
