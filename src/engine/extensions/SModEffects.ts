import type { SModEffect } from './HullMods';
import type { ShipSpec } from '../content/ShipSpec';
const bySize = (s: ShipSpec, values: number[]) => values[({FIGHTER: -1, FRIGATE: 0, DESTROYER: 1, CRUISER: 2, CAPITAL_SHIP: 3})[s.hullSize ?? 'FRIGATE']] ?? 0;
/** Additions to the normal effect, never a second application of the whole hullmod.
 * Source: core/data/hullmods/*.java and api/impl/hullmods/*.java. */
export const nativeSModEffects: Record<string, SModEffect> = {
  hiressensors: {description:'护卫/驱逐/巡洋/主力战斗视野+1000/1500/2000/2500。',stats:s=>({sightRadiusFlat:bySize(s,[1000,1500,2000,2500])})},
  escort_package: {description:'驱逐舰额外获得最高10%护盾减伤，护航主力舰时加倍；随实际遥测强度变化。'},
  militarized_subsystems: {description:'取消军事化带来的船员需求增加（战役效果，不假加战斗属性）。'},
  advancedshieldemitter: { description: '护盾转向、展开速度额外+100%。', stats: () => ({shieldTurnRatePercent: 100, shieldUnfoldRatePercent: 100}) },
  turretgyros: { description: '对导弹/战机伤害+25%；对较小舰船每相差一个舰级+5%伤害。', stats: s => ({damageToMissilesPercent:25, damageToFightersPercent:25, damageToFrigatesPercent:bySize(s,[0,5,10,15]), damageToDestroyersPercent:bySize(s,[0,0,5,10]), damageToCruisersPercent:bySize(s,[0,0,0,5])}) },
  armoredweapons: { description: '实弹与能量武器射速×1.1。', weaponStats: (_s,w) => w.weaponType !== 'MISSILE' ? {rateOfFireMultiplier:1.1} : {} },
  autorepair: { description: '武器/引擎修复时间由50%降至25%；过载时间×0.67。', stats: () => ({engineRepairTimeMultiplier:.5, weaponRepairTimeMultiplier:.5, overloadTimeMultiplier:.67}) },
  auxiliarythrusters: { description: '零幅能加速额外+10航速，零幅能转速加成翻倍。', stats: () => ({zeroFluxSpeedBonus:10, zeroFluxTurnMultiplier:2}) },
  dedicated_targeting_core: { description: '巡洋/主力舰射程加成提高至40%/60%。', rangePercent: (s,w) => w.weaponType === 'MISSILE' ? 0 : bySize(s,[0,0,5,10]) },
  eccm: { description: '抗诱骗概率升至100%，不受电子战射程惩罚。', stats: () => ({ecmPenaltyMultiplier:0}), weaponStats: (_s,w) => w.weaponType === 'MISSILE' ? {eccmChanceBonus:.5} : {} },
  magazines: { description: '实弹与能量武器弹药恢复速度+50%。', weaponStats: (_s,w) => w.weaponType !== 'MISSILE' ? {ammoRegenPercent:50} : {} },
  missleracks: { description: '代价：导弹射速×0.8。', weaponStats: (_s,w) => w.weaponType === 'MISSILE' ? {rateOfFireMultiplier:.8} : {} },
  extendedshieldemitter: { description: '护盾弧度再增加60°。', stats: () => ({shieldArcBonus:60}) },
  fluxbreakers: { description: '主动排幅加成由25%提高至35%。', stats: () => ({ventRatePercent:10}) },
  fluxdistributor: { description: '额外耗散+10/20/30/50。', stats: s => ({dissipationBonus:bySize(s,[10,20,30,50])}) },
  fluxcoil: { description: '额外容量+200/400/600/1000。', stats: s => ({capacityBonus:bySize(s,[200,400,600,1000])}) },
  frontemitter: { description: '护盾承伤×0.95。', stats: () => ({shieldDamageMultiplier:.95}) },
  heavyarmor: { description: '代价：加速、减速、转向加速度、最大转速均×0.75。', stats: () => ({accelerationMultiplier:.75, decelerationMultiplier:.75, turnAccelerationMultiplier:.75, turnRateMultiplier:.75}) },
  pointdefenseai: { description: '小型非导弹且无STRIKE提示的武器获得点防御属性。', weaponStats: (_s,w) => w.mountSize === 'SMALL' && w.weaponType !== 'MISSILE' && !w.aiHints?.includes('STRIKE') ? {grantsPointDefense:1} : {} },
  insulatedengine: { description: '引擎耐久额外+100%；战役信号半径不模拟。', stats: () => ({engineHealthPercent:100}) },
  adaptiveshields: { description: '取消护盾弧度×0.7的惩罚。', stats: () => ({shieldArcMultiplier:1/.7}) },
  stabilizedshieldemitter: { description: '护盾受击产生的硬幅能中10%改为软幅能。', stats: () => ({shieldSoftFluxConversion:.1}) },
  high_scatter_amp: { description: '光束伤害加成由10%提高至15%。', weaponStats: (_s,w) => w.isBeam ? {damagePercent:5} : {} },
  missile_autoloader: { description: '代价：每次补弹后的额外冷却由5秒延长至10秒。' },
  defensive_targeting_array: { description: '所属战机实弹和能量武器射程+100。', fighterRangeFlat: (_s,w) => w.weaponType === 'MISSILE' ? 0 : 100 },
  converted_hangar: { description: '巡洋/主力舰补充率恢复速度额外+10%/+25%。', stats: s => ({replacementRateIncreasePercent:bySize(s,[0,0,10,25])}) },
  converted_fighterbay: { description: '原版仅降低补给维护；战役后勤不模拟。' },
  blast_doors: { description: '原版仅进一步降低船员伤亡；当前不模拟人员结算。' },
  solar_shielding: { description: '原版仅免疫战役星冕伤害；战斗能量减伤仍为10%。' },
};
