import type { WeaponSpec } from '../simulation/Weapon';
import { ZHEFENG_WEAPONS as W } from './ZhefengIds';
const url = '/game-assets/graphics/weapons/';
/** Independent rules and generated turret/recoil images; other effects and audio remain host dependencies. */
function gun(id: string, name: string, art: string, medium: boolean): WeaponSpec {
  const scale = medium ? .8 : .64, raw = art === 'assault_chaingun' ? 40 : art === 'heavy_autocannon' ? 42 : art === 'light_autocannon' ? 26 : 24;
  return {id,nameKey:name,mountSize:medium?'MEDIUM':'SMALL',weaponType:'BALLISTIC',type:'KINETIC',isBeam:false,spawnType:'BALLISTIC',
    damagePerShot:0,damagePerSecond:0,fluxPerShot:0,range:700,refireDelay:1,projSpeed:1200,projRadius:1.5,
    color:[242,213,164],burstSize:1,burstDelay:0,turnRateDegPerSec:medium?45:120,minSpread:0,maxSpread:1,spreadPerShot:.2,spreadDecay:3,
    turretSpriteUrl:url+art+'_turret_base.png',hardpointSpriteUrl:url+art+'_hardpoint_base.png',
    turretGunSpriteUrl:url+art+'_turret_recoil.png',hardpointGunSpriteUrl:url+art+'_hardpoint_recoil.png',
    displayIconUrl:url+art+'_turret_base.png',spriteWidth:raw*scale,spriteHeight:raw*scale,spritePivotX:.5,spritePivotY:.5,
    turretOffsets:[(medium?16:10)*scale,0],hardpointOffsets:[(medium?26:15)*scale,0],visualRecoil:medium?4:2,
    projSpriteUrl:'/game-assets/graphics/missiles/shell_gauss_cannon.png',projLength:medium?18:9,projWidth:medium?3:1.3,fadeTime:.16,
    soundKey:medium?'heavy_mauler_fire':'light_autocannon_fire',fringeColor:[255,212,142,255],coreColor:[255,249,224,255],hitGlowRadius:medium?24:9,
    muzzleFlashSpec:{length:medium?19:8,spread:4,particleSizeMin:2,particleSizeRange:3,particleDuration:.12,particleCount:4,particleColor:[255,229,173,190]}};
}
export const zhefengWeapons: WeaponSpec[] = [
  {...gun(W.breaker,'折锋 · 断甲炮','assault_chaingun',true),type:'HIGH_EXPLOSIVE',damagePerShot:300,damagePerSecond:300/1.4,fluxPerShot:180,range:800,refireDelay:1.4,projSpeed:1150,ordnancePointCost:18},
  {...gun(W.wedge,'折锋 · 楔刺连射炮','heavy_autocannon',true),damagePerShot:80,damagePerSecond:240,fluxPerShot:55,range:850,refireDelay:1/3,projSpeed:1500,ordnancePointCost:18,soundKey:'autocannon_fire'},
  {...gun(W.needle,'折锋 · 穿针自动炮','light_autocannon',false),damagePerShot:40,damagePerSecond:200,fluxPerShot:24,refireDelay:.2,projSpeed:1450,ordnancePointCost:5},
  {...gun(W.guard,'折锋 · 守门近防炮','vulcan_cannon',false),type:'FRAGMENTATION',damagePerShot:8,damagePerSecond:80,fluxPerShot:2,range:500,refireDelay:.1,projSpeed:1750,ordnancePointCost:3,isPointDefense:true,aiHints:['PD_ONLY'],turnRateDegPerSec:210,maxSpread:3,soundKey:'vulcan_cannon_fire'},
];
const descriptions:Record<string,string> = {
  [W.breaker]:'中型实弹／18OP。300高爆、180载荷/发，1.4秒周期，800炮口射程。双炮用于破甲；对盾效率低。换流反击期间缩短实际射击周期，但不穿盾、不增加弹伤。',
  [W.wedge]:'中型实弹／18OP。80动能、55载荷/发，每秒3发，850炮口射程。适合持续压盾，厚甲是明显弱项。与断甲炮同档可换，不是同炮改名。',
  [W.needle]:'小型实弹／5OP。40动能、24载荷/发，每秒5发，700炮口射程。为高爆主炮创造敌盾压力；不属于近防，不接管拦截职责。',
  [W.guard]:'小型实弹近防／3OP。8破片、2载荷/发，每秒10发，500炮口射程。只自动攻击导弹与战机；承压阶段不会随主炮停火。',
};
export const zhefengArmoryRefit = {
  weapons:Object.fromEntries(zhefengWeapons.map(w=>[w.id,{op:w.ordnancePointCost!,name:w.nameKey,manufacturer:'折锋工坊 · Web原创',role:w.isPointDefense?'近防拦截':w.type==='HIGH_EXPLOSIVE'?'窗口破甲':'动能压盾',accuracy:'良好',turnRate:w.mountSize==='MEDIUM'?'中等':'快',description:descriptions[w.id]+' 独立Web军械规则；炮塔与后坐图使用独立生成素材，枪火与音效仍依赖宿主。'}])),
  weaponStatus:Object.fromEntries(zhefengWeapons.map(w=>[w.id,{level:'supported',reasons:['原创规则；独立生成炮塔/后坐图；非原版武器参数。']}]))
};
