import art from './gravity-art.json';
import type { WeaponSpec } from '../simulation/Weapon';

export const GRAVITY_WEAPONS = {tractor:'web_gravity_tractor',calibrator:'web_gravity_calibrator',deflector:'web_gravity_deflector',pdc:'web_gravity_pdc'} as const;
const common = {isBeam:false,burstSize:1,burstDelay:0,minSpread:0,maxSpread:0,spreadPerShot:0,spreadDecay:0,
  color:[130,218,235] as [number,number,number],type:'KINETIC' as const,weaponType:'ENERGY' as const,
  spawnType:'BALLISTIC' as const,refireDelay:1,damagePerShot:0,damagePerSecond:0,fluxPerShot:0,projSpeed:1000,projRadius:1};
export function gravityWeapons(): WeaponSpec[] {
  const media = (kind:keyof typeof GRAVITY_WEAPONS) => ({...art[kind],displayIconUrl:art[kind].turretSpriteUrl});
  return [
    {...common,id:GRAVITY_WEAPONS.tractor,nameKey:'潮汐引力投射器',mountSize:'EXTRA_LARGE',range:1450,turnRateDegPerSec:180,ordnancePointCost:60,
      // Real continuous entity interaction; this mount never emits a fake projectile.
      type:'ENERGY',displayIconUrl:'/game-assets/graphics/gravity/field-core-v8.png',hardpointUsesHullSprite:true,
      spriteWidth:124.26,spriteHeight:124.26,spritePivotX:.5,spritePivotY:.5,
      turretOffsets:[0,0],hardpointOffsets:[0,0],
      gravityTractor:{captureTime:.22,projectileCaptureTime:.08,holdTime:5,recovery:1,anchorSpeed:650,strength:650,damping:1.6,fluxPerSecond:350,tidalDamagePerSecond:1200,tidalFluxPerSecond:600}},
    {...common,...media('calibrator'),id:GRAVITY_WEAPONS.calibrator,nameKey:'质量校准炮',mountSize:'MEDIUM',range:1150,turnRateDegPerSec:100,ordnancePointCost:12,
      damagePerShot:180,damagePerSecond:120,fluxPerShot:175,refireDelay:1.5,projSpeed:700,projRadius:1.3,gravityCoupling:'MASS_DRIVER',
      projSpriteUrl:'/game-assets/graphics/missiles/shell_gauss_cannon.png',projLength:23,projWidth:2,fadeTime:.15,soundKey:'railgun_fire',
      fringeColor:[83,185,220,255],coreColor:[211,247,255,255],hitGlowRadius:18},
    {...common,...media('deflector'),id:GRAVITY_WEAPONS.deflector,nameKey:'有限偏转阵列',mountSize:'SMALL',range:460,turnRateDegPerSec:210,ordnancePointCost:8,
      isPointDefense:true,aiHints:['PD'],turretOffsets:[7.96,0],hardpointOffsets:[7.96,0],
      gravityDeflector:{impulse:300,budgetPerSecond:220,fluxPerUse:35,interval:.3}},
    {...common,...media('pdc'),id:GRAVITY_WEAPONS.pdc,nameKey:'实验舰双联近防炮',mountSize:'SMALL',weaponType:'BALLISTIC',type:'FRAGMENTATION',
      range:520,turnRateDegPerSec:240,ordnancePointCost:5,isPointDefense:true,aiHints:['PD'],damagePerShot:12,damagePerSecond:144,fluxPerShot:4,
      refireDelay:1/12,projSpeed:1500,projRadius:.7,projLength:12,projWidth:1.1,fadeTime:.12,maxAmmo:72,ammoRegenPerSec:8,
      turretOffsets:[10.71,-1.44,10.71,1.35],hardpointOffsets:[10.71,-1.44,10.71,1.35],soundKey:'vulcan_cannon_fire',
      projSpriteUrl:'/game-assets/graphics/missiles/shell_gauss_cannon.png'},
  ];
}
const descriptions = {
  tractor:'内置XL潮汐场投射器。第1组左键抓实体：对敌舰持续1200能量伤害/秒，盾弧/装甲正常结算；友舰、弹体和障碍仅受牵引。射程1450、最长5秒、恢复1秒。固定结构反牵本舰，右键可反投。无假弹体，不默认穿盾。',
  calibrator:'M质量校准炮：180动能、175软幅能，1.5秒/发，射程1150。自己发射的弹体能受F校准，最多0.65秒/45°；右键或G能推动弹体，伤害不增加。普通友军火力不受场影响。',
  deflector:'S自动偏转。有限冲量改变逼近本舰的实弹/导弹路径，不接管阵营。0.3秒间隔、每次35软幅能，重弹更难偏转；激光、已失效弹体和地雷不受影响。不能代替装甲或全向护盾。',
  pdc:'S双联近防：12破片×12发/秒，射程520；72发弹匣，每秒补8发。先拦截弹体，与偏转阵列互补。',
};
export const gravityArmoryRefit = {
  weapons:Object.fromEntries(gravityWeapons().map(w=>[w.id,{name:w.nameKey,op:w.ordnancePointCost,manufacturer:'引力实验计划',
    builtInOnly:!!w.gravityTractor,role:w.gravityTractor?'潮汐攻击 / 牵引':w.isPointDefense?'近防':'质量校准',
    description:descriptions[(Object.keys(GRAVITY_WEAPONS) as (keyof typeof GRAVITY_WEAPONS)[]).find(k=>GRAVITY_WEAPONS[k]===w.id)!]}])),
  weaponStatus:Object.fromEntries(Object.values(GRAVITY_WEAPONS).map(id=>[id,{level:'supported',reasons:['原创实验军械；专属规则与独立素材。']}]))
};
