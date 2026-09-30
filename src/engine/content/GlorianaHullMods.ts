import type { HullModDefinition } from '../extensions/HullMods';
import type { ShipSpec } from './ShipSpec';
import { GLORIANA_HULL_ID } from './GlorianaPack';

export const GLORIANA_HULLMODS = {
  sanctuary: 'web_gloriana_sanctuary', loader: 'web_gloriana_edict_loader', flightline: 'web_gloriana_flightline',
} as const;
const core = (ship: ShipSpec) => (ship.sourceHullId ?? ship.id) === GLORIANA_HULL_ID && !ship.isModuleHull;
const battery = (ship: ShipSpec) => /^web_gloriana_[ps][123]$/.test(ship.sourceHullId ?? ship.id) && ship.isModuleHull;
function metadata(cost: number, tags: string[], icon: string) {
  return {cost:{CAPITAL_SHIP:cost},uiTags:tags,manufacturer:'荣光女王专属 · Web扩展',icon:'graphics/hullmods/'+icon+'.png'};
}
/** Curated built-in extension hooks; install explicitly, never migrate existing fits. */
export const glorianaHullMods: readonly HullModDefinition[] = [
  {
    id:GLORIANA_HULLMODS.sanctuary,name:'荣光 · 圣域重整列阵',status:'implemented',
    refit:metadata(18,['护盾','支援'],'hardened_shields'),conflicts:[GLORIANA_HULLMODS.flightline],
    applicable:ship=>core(ship)&&ship.voidShield?null:'仅限荣光女王指挥核心的虚空盾',
    description:'核心专用，18OP。将峰值防御换成持续护航能力：虚空盾每层承载−25%（24000→18000，总承载96000→72000），恢复速度+30%（4000→5200/秒），全灭重启锁定8→5秒。受击停充4秒、友军庇护、右键开关规则不变。与近域整备线互斥；不加强普通护盾，也不安装到炮廊。Web原创改造，图标暂复用原版。',
    voidShieldSpec:ship=>({integrityPerLayer:ship.voidShield!.integrityPerLayer*.75,rechargePerSecond:ship.voidShield!.rechargePerSecond*1.3,restartDelay:ship.voidShield!.restartDelay*.625}),
  },
  {
    id:GLORIANA_HULLMODS.loader,name:'荣光 · 敕令联锁供弹机',status:'implemented',
    refit:metadata(12,['武器','特殊'],'expanded_missile_racks'),
    applicable:ship=>battery(ship)?null:'仅限荣光女王六座炮廊；请先选择炮廊模块',
    description:'炮廊专用，每座12OP。所有实弹武器常态射速×0.8；战列敕令选中本舷时，额外射速最高×1.5、每发载荷消耗最低×0.8，随敕令阶段渐变。与原敕令合计，满强度射速为无插件常态的2.1倍、抵消敕令的每发载荷消耗加价（军械统合的超大型武器×1.15仍保留）；未选中舷仍承受双方减速。核心排散/过载、敕令结束或炮廊失效立即撤销额外收益。不增加弹药，不增强能量/导弹或友舰。Web原创改造，图标暂复用原版。',
    weaponStats:(_ship,weapon)=>weapon.weaponType==='BALLISTIC'?{rateOfFireMultiplier:.8}:{},
  },
  {
    id:GLORIANA_HULLMODS.flightline,name:'荣光 · 近域整备线',status:'implemented',
    refit:metadata(18,['战机','支援'],'expanded_deck_crew'),conflicts:[GLORIANA_HULLMODS.sanctuary],
    applicable:ship=>core(ship)&&(ship.fighterBays??0)>0?null:'仅限荣光女王指挥核心的标准飞行甲板',
    description:'核心专用，18OP。所属联队战损补充时间×0.7、补充率自然恢复速度+50%；代价是出击范围×0.75（默认4000→3000）。适合围绕本舰虚空盾持续护航与近域轰炸，不增加甲板、飞机数量或弹药，也不缩短存活轰炸机的返舰装弹时间。与圣域重整列阵互斥。Web原创改造，图标暂复用原版。',
    stats:()=>({fighterRefitTimeMultiplier:.7,replacementRateIncreasePercent:50,fighterWingRangeMultiplier:.75}),
  },
];
