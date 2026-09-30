import { aircraftArt, aircraftSocket } from './AdunArkAircraftArt';
import type { ShipSpec } from './ShipSpec';
import { originalCraft } from './OriginalDefaults';
import { ADUN_ARK_ART } from './AdunArkIds';
import { ARK_WEAPONS as W } from './AdunArkArmory';
export const arkWings={
 web_ark_interceptor_wing:{specId:'web_ark_interceptor',role:'FIGHTER',category:'INTERCEPTOR',count:4,rebuildSeconds:14,op:14,range:3800,name:'折光无人截击联队',displayName:'折光',sourceRole:'INTERCEPTOR',formation:'V',roleDescription:'护航 / 近防',description:'4架双束无人机，900结构/180装甲、小型护盾；拦截战机导弹。对应侧翼被毁后失去补机。Web改编，不是原著固定编制。'},
 web_ark_striker_wing:{specId:'web_ark_striker',role:'BOMBER',category:'BOMBER',count:3,rebuildSeconds:22,op:24,range:4200,name:'折光等离子突击联队',displayName:'突击',sourceRole:'BOMBER',formation:'V',roleDescription:'破甲 / 返航重装',description:'3架独立重型双体突击机，1400结构/240装甲，每架四发1400高爆等离子电容；弹尽返航重装，Z召回可配合重构光束整备。Web改编。'},
} as const;
function craft(bomber:boolean):ShipSpec {
 const id=bomber?'web_ark_striker':'web_ark_interceptor',name=bomber?'折光 · 等离子突击型':'折光 · 截击型';
 const art=bomber?aircraftArt.striker:aircraftArt.interceptor;
 const slots=art.emitters.map((pixel,i)=>({slotId:'EMITTER_'+i,mountType:bomber?'HARDPOINT' as const:'HIDDEN' as const,slotSize:'SMALL' as const,weaponType:'ENERGY' as const,...aircraftSocket(art,pixel),baseAngleDeg:0,arcDeg:bomber?30:70,defaultWeaponId:bomber?W.bomb:W.air,builtIn:true}));
 return {...originalCraft(),id,sourceHullId:id,nameKey:'ship.'+id+'.name',descKey:'ship.'+id+'.desc',designationKey:'ship.'+id+'.designation',designation:'星灵无人机 · Web改编',spriteUrl:ADUN_ARK_ART+art.file,spriteWidth:art.worldWidth,spriteHeight:art.worldHeight,pivotX:art.pivot[0]*art.worldWidth/art.width,pivotY:art.pivot[1]*art.worldHeight/art.height,collisionRadius:bomber?51:44,mass:65,
 hitpoints:bomber?1400:900,armorRating:bomber?240:180,maxSpeed:bomber?260:340,acceleration:420,deceleration:420,maxTurnRateDeg:170,turnAccelerationDeg:360,maxFlux:650,fluxDissipation:100,shieldType:'OMNI',shieldRadius:bomber?57:48,shieldArcDeg:360,shieldEfficiency:.8,shieldUpkeep:.2,
 visualProfile:{hullTint:[.8,.82,.85],phaseColor:[.34,.62,1],overloadColor:[.35,.8,1],shieldProfile:'arkFighter',vent:{fringeColor:[125,0,155],coreColor:[255,255,255]},explosion:{flash:1,fireball:1,shockwave:1,smoke:1,debris:1}},
 bounds:bomber?[[48,-14],[48,-8],[6,-9],[6,9],[48,8],[48,14],[23,25],[-24,52],[-29,34],[-41,22],[-42,11],[-37,0],[-42,-11],[-41,-22],[-29,-34],[-24,-52],[23,-25]]:[[48,0],[40,-20],[20,-37],[-32,-44],[-24,-18],[-22,0],[-24,18],[-32,44],[20,37],[40,20]],weaponSlots:slots,engineSlots:art.engines.map(pixel=>({...aircraftSocket(art,pixel),width:pixel[2],length:pixel[3],angleDeg:180,style:'HIGH_TECH' as const})),fighterBays:0,fighterWings:[],builtInHullMods:[],defaultWeaponGroups:[{index:0,weaponSlotIds:slots.map(s=>s.slotId),mode:'LINKED',isAutofire:false}],
 i18n:{zh_CN:{['ship.'+id+'.name']:name,['ship.'+id+'.desc']:bomber?arkWings.web_ark_striker_wing.description:arkWings.web_ark_interceptor_wing.description,['ship.'+id+'.designation']:'星灵无人机'},en_US:{['ship.'+id+'.name']:bomber?'Refraction Striker':'Refraction Interceptor'}}};
}
export const arkAircraft=[craft(false),craft(true)];
