import { ADUN_FX } from '../visual/AdunFXAssets';
import type { WeaponSpec } from '../simulation/Weapon';
import type { ShipSpec } from './ShipSpec';
import { originalWeapon } from './OriginalDefaults';
import { ADUN_ART, ADUN_WEAPONS } from './SpearOfAdunIds';
import art from './spear-of-adun-art.json';
import xlArt from './spear-of-adun-xl-art.json';
export const adunXLArt = xlArt;
// Archived armory: not registered in runtime or refit. IDs remain for save retirement.
export { ADUN_WEAPONS } from './SpearOfAdunIds';
type Kind = keyof typeof ADUN_WEAPONS;
const names: Record<Kind,[string,string]> = {
  lance:['太阳长矛','Solar Lance'], disruptor:['相位裂解炮','Phase Disruptor'],
  ion:['离子连射器','Ion Repeater'], prism:['拦截棱镜','Interception Prism'],
};
const costs: Record<Kind,number> = {lance:64,disruptor:24,ion:10,prism:4};
const descriptions: Record<Kind,string> = {
  lance:'超大型 · 1500射程；0.9秒蓄能后发射2600能量伤害，消耗2200载荷。6发太阳电容，每4秒恢复1发；3秒冷却。慢转向、有限电容，不适合追逐小舰。',
  disruptor:'大型 · 1100射程；双发各450高爆伤害/360载荷，1.8秒冷却。压盾后破甲；不擅长独自击穿护盾。',
  ion:'中型 · 950射程；三连发，每发110动能伤害/80载荷，0.9秒冷却。造成硬载荷，配合长矛与裂解炮形成压盾—破甲循环。',
  prism:'小型 · 600射程；140能量DPS、100载荷/秒，优先拦截导弹和战机。持续束主要用于防御，不代替主炮。',
};
function gun(kind:Kind, beam:boolean, rules:Partial<WeaponSpec>):WeaponSpec {
  const a=kind==='lance'?xlArt.body:art[kind];
  const sprite=ADUN_ART+(kind==='lance'?xlArt.body.file:kind+'.png');
  return {...originalWeapon(beam?'beam':'energy'),id:ADUN_WEAPONS[kind],nameKey:`weapon.${ADUN_WEAPONS[kind]}.name`,
    tags:['web_adun_armory'],ordnancePointCost:costs[kind],...rules,
    turretSpriteUrl:sprite,hardpointSpriteUrl:sprite,
    spriteWidth:a.width,spriteHeight:a.height,spritePivotX:a.pivotX,spritePivotY:a.pivotY,
    ...(beam?{}:{projSpriteUrl:ADUN_FX.lance}),
    turretOffsets:[...a.offsets],hardpointOffsets:[...a.offsets],visualRecoil:0,
    color:[75,180,255],fringeColor:[35,130,255,240],coreColor:[225,250,255,255],glowColor:[90,190,255,190],
  };
}
export const adunWeapons:WeaponSpec[] = [
  gun('lance',false,{mountSize:'EXTRA_LARGE',weaponType:'ENERGY',type:'ENERGY',damagePerShot:2600,damagePerSecond:2600/3.9,
    fluxPerShot:2200,range:1500,chargeTime:.9,refireDelay:3,burstSize:1,turnRateDegPerSec:12,
    maxAmmo:6,ammoRegenPerSec:.25,autoCharge:true,interruptibleBurst:false,
    projSpeed:1350,projRadius:14,projLength:110,projWidth:24,visualSpawnType:'BALLISTIC_AS_BEAM',hitGlowRadius:85}),
  gun('disruptor',false,{mountSize:'LARGE',weaponType:'ENERGY',type:'HIGH_EXPLOSIVE',damagePerShot:450,damagePerSecond:900/2,
    fluxPerShot:360,range:1100,chargeTime:.08,burstSize:2,burstDelay:.12,refireDelay:1.8,turnRateDegPerSec:30,
    projSpeed:850,projRadius:9,projLength:30,projWidth:16,hitGlowRadius:52}),
  gun('ion',false,{mountSize:'MEDIUM',weaponType:'ENERGY',type:'KINETIC',damagePerShot:110,damagePerSecond:330/1.08,
    fluxPerShot:80,range:950,burstSize:3,burstDelay:.09,refireDelay:.9,turnRateDegPerSec:70,
    projSpeed:1450,projRadius:4,projLength:36,projWidth:7,visualSpawnType:'BALLISTIC_AS_BEAM',hitGlowRadius:24}),
  gun('prism',true,{mountSize:'SMALL',weaponType:'ENERGY',type:'ENERGY',isPointDefense:true,aiHints:['PD'],
    range:600,damagePerSecond:140,fluxPerSecond:100,beamWidth:4,beamSpeed:4000,turnRateDegPerSec:210,hitGlowRadius:14}),
];
export const adunArmoryStrings:ShipSpec['i18n']={
  zh_CN:Object.fromEntries(Object.entries(ADUN_WEAPONS).map(([k,id])=>[`weapon.${id}.name`,names[k as Kind][0]])),
  en_US:Object.fromEntries(Object.entries(ADUN_WEAPONS).map(([k,id])=>[`weapon.${id}.name`,names[k as Kind][1]])),
};
export const adunArmoryRefit={
  weapons:Object.fromEntries(Object.entries(ADUN_WEAPONS).map(([k,id])=>[id,{op:costs[k as Kind],name:names[k as Kind][0],manufacturer:'星灵 · 亚顿之矛（Web改编）',description:descriptions[k as Kind]+' 武器美术/枢轴/枪口由同一素材档案标定，仅接受同档换装。'}])),
  weaponStatus:Object.fromEntries(Object.values(ADUN_WEAPONS).map(id=>[id,{level:'supported',reasons:['四档主题武器；Web改编数值，不声称原作战役武器等价。']}]))
};
