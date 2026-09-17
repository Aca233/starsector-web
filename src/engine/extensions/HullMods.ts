import { isImmutableMetadata } from './Immutable';
import { skillHullModifiers, skillWeaponModifiers, skillRangePercent, combatSkillLevel } from './CombatSkills';
import { contentRegistry } from '../content/ContentRegistry';
import { validateResources, validateHooks } from './Dependencies';
import type { ExtensionResources } from './Dependencies';
import type { ShipSpec } from '../content/ShipSpec';
import type { WeaponSpec } from '../simulation/Weapon';
import type { Ship } from '../simulation/Ship';
import { DefinitionRegistry } from './DefinitionRegistry';
import nativeMetadata from './native-hullmod-metadata.json';
import type { SimulationRandom } from '../simulation/SimulationRandom';
import { missileReloadCapacity, advanceMissileAutoloader, advancePeriodicMissileReload } from './MissileReload';

export interface HullModRefitMetadata {
  cost: Record<string, number>;
  uiTags: string[];
  manufacturer: string;
  icon?: string;
  source?: string;
  builtInOnly?: boolean;
}
/** Effect coverage is separate from the legacy runtime-hook status and installation rules. */
export interface HullModSupport {
  scope: 'combat' | 'campaign-only' | 'mixed';
  combat: 'implemented' | 'unimplemented' | 'not-applicable';
  campaign: 'not-applicable' | 'not-simulated';
  summary: string;
}
export interface HullModDefinition {
  resources?: ExtensionResources;
  id: string;
  name: string;
  /** Legacy combat-hook status; use support to distinguish campaign-only effects. */
  status: 'implemented' | 'metadata-only';
  support?: HullModSupport;
  description?: string;
  refit?: HullModRefitMetadata;
  conflicts?: readonly string[];
  applicable?: (ship: ShipSpec) => string | null;
  rangeGroup?: string;
  priority?: number;
  stats?: (ship: ShipSpec) => Partial<HullModStats>;
  weaponStats?: (ship: ShipSpec, weapon: WeaponSpec) => Partial<HullModWeaponStats>;
  /** Changes the defense base before additive/multiplicative modifiers, without mutating the hull spec. */
  shieldSpec?: (ship: ShipSpec) => Partial<Pick<ShipSpec, 'shieldType' | 'shieldArcDeg' | 'shieldEfficiency' | 'shieldUpkeep'>>;
  rangePercent?: (ship: ShipSpec, weapon: WeaponSpec) => number;
  rangeFlat?: (ship: ShipSpec, weapon: WeaponSpec) => number;
  /** WeaponBaseRangeModifier: added before percent/mult bonuses, unlike rangeFlat. */
  rangeBaseFlat?: (ship: ShipSpec, weapon: WeaponSpec) => number;
  rangeMultiplier?: (ship: ShipSpec, weapon: WeaponSpec) => number;
  weaponOPFlat?: (ship: ShipSpec, weapon: WeaponSpec) => number;
  apply?: (ship: Ship) => void;
  advance?: (ship: Ship, dt: number, random: SimulationRandom) => void;
}
export const hullModDefinitions = new DefinitionRegistry<HullModDefinition>('hullmod', d => {
  if (!d.name?.trim() || !['implemented', 'metadata-only'].includes(d.status)) throw new Error(d.id + ': invalid hullmod definition');
  if (d.support) {
    const s = d.support;
    const combatOnly = s.scope === 'combat' && s.campaign === 'not-applicable'
      && s.combat === (d.status === 'implemented' ? 'implemented' : 'unimplemented');
    const campaignOnly = s.scope === 'campaign-only' && s.combat === 'not-applicable'
      && s.campaign === 'not-simulated' && d.status === 'metadata-only';
    const mixed = s.scope === 'mixed' && s.combat === 'implemented' && s.campaign === 'not-simulated' && d.status === 'implemented';
    if ((!combatOnly && !campaignOnly && !mixed) || !s.summary?.trim()) throw new Error(d.id + ': invalid hullmod support scope');
  }
  validateResources(d.resources);
  validateHooks(d, ['rangePercent', 'rangeFlat', 'rangeBaseFlat', 'rangeMultiplier', 'weaponOPFlat', 'stats', 'weaponStats', 'shieldSpec', 'applicable', 'apply', 'advance']);
  if (d.priority !== undefined && !Number.isFinite(d.priority)) throw new Error(d.id + ': invalid priority');
  if (d.conflicts && (!Array.isArray(d.conflicts) || d.conflicts.some(id => typeof id !== 'string' || !id || id === d.id))) throw new Error(d.id + ': invalid conflicts');
  if (d.refit) {
    if (!Array.isArray(d.refit.uiTags) || d.refit.uiTags.some(t => typeof t !== 'string') || !d.refit.manufacturer?.trim()) throw new Error(d.id + ': invalid refit metadata');
    for (const cost of Object.values(d.refit.cost)) if (!Number.isFinite(cost) || cost < 0) throw new Error(d.id + ': invalid OP cost');
    if (!d.refit.builtInOnly && (d.status !== 'implemented' || !d.description?.trim())) throw new Error(d.id + ': installable hullmod needs implementation and description');
  }
  if (d.status === 'metadata-only' && (d.apply || d.advance || d.rangePercent || d.rangeFlat || d.rangeBaseFlat || d.rangeMultiplier || d.weaponOPFlat || d.stats || d.weaponStats || d.shieldSpec)) throw new Error(d.id + ': metadata-only hullmod cannot have runtime hooks');
});

/** Flat/percent bonuses add; multipliers multiply. Never write derived values into saved ShipSpec. */
export interface HullModStats {
  autofireAimAccuracy: number;
  ecmRating: number;
  ecmPenaltyMultiplier: number;
  systemUsesBonus: number;
  systemRegenMultiplier: number;
  systemRangeMultiplier: number;
  systemCooldownMultiplier: number;
  peakCRBonus: number;
  maxCombatReadinessBonus: number;
  allowZeroFluxAtAnyLevel: number;
  armorDamageMultiplier: number;
  hullDamageMultiplier: number;
  energyDamageMultiplier: number;
  engineDamageTakenMultiplier: number;
  canRepairModulesUnderFire: number;
  phaseUpkeepMultiplier: number;
  phaseCooldownMultiplier: number;
  overloadTimeMultiplier: number;
  maxArmorDamageReductionBonus: number;
  ventRatePercent: number;
  hullPercent: number;
  hullMultiplier: number;
  armorMultiplier: number;
  engineHealthPercent: number;
  shieldDamagePercent: number;
  breakProbabilityMultiplier: number;
  dissipationBonus: number;
  capacityBonus: number;
  dissipationPercent: number;
  capacityPercent: number;
  dissipationMultiplier: number;
  capacityMultiplier: number;
  speedBonus: number;
  speedPercent: number;
  speedMultiplier: number;
  accelerationBonus: number;
  decelerationBonus: number;
  accelerationMultiplier: number;
  decelerationMultiplier: number;
  turnAccelerationMultiplier: number;
  turnRateMultiplier: number;
  peakCRPercent: number;
  peakCRMultiplier: number;
  /** Native getCRLossPerSecondPercent().modifyPercent: additive before multipliers. */
  crLossPercent: number;
  crLossMultiplier: number;
  /** FluxTracker D: only the unused soft-flux dissipation budget reaches hard flux. */
  hardFluxDissipationFraction: number;
  zeroFluxMinimumFluxLevel: number;
  rangeThreshold: number;
  rangePastThresholdMultiplier: number;
  weaponDamageTakenMultiplier: number;
  fighterRefitTimePercent: number;
  armorBonus: number;
  armorPercent: number;
  accelerationPercent: number;
  decelerationPercent: number;
  turnAccelerationPercent: number;
  turnRatePercent: number;
  shieldArcBonus: number;
  shieldArcPercent: number;
  shieldArcMultiplier: number;
  phaseMinSpeedFluxThresholdPercent: number;
  /** Multiplies the phase bonus only: 3x with .5 becomes 2x, never 1.5x. */
  phaseTimeBonusMultiplier: number;
  effectiveArmorMultiplier: number;
  minArmorFractionMultiplier: number;
  damageToMissilesPercent: number;
  pdIgnoresFlares: number;
  shieldTurnRatePercent: number;
  shieldUnfoldRatePercent: number;
  weaponHealthPercent: number;
  shieldDamageMultiplier: number;
  shieldUpkeepMultiplier: number;
  shieldPiercedMultiplier: number;
  ventRateMultiplier: number;
  empDamageMultiplier: number;
  engineRepairTimeMultiplier: number;
  weaponRepairTimeMultiplier: number;
}
export interface HullModWeaponStats {
  eccmChanceBonus: number;
  missileGuidanceBonus: number;
  missileSpeedPercent: number;
  missileAccelerationPercent: number;
  missileTurnPercent: number;
  missileTurnAccelerationPercent: number;
  missileFlightTimeMultiplier: number;
  projectileSpeedPercent: number;
  missileHealthPercent: number;
  rateOfFirePercent: number;
  ammoRegenPercent: number;
  damagePercent: number;
  beamHardFlux: number;
  fluxCostPercent: number;
  fluxCostMultiplier: number;
  turnRatePercent: number;
  turnRateMultiplier: number;
  ammoPercent: number;
  maxRecoilPercent: number;
  recoilPerShotPercent: number;
  maxRecoilMultiplier: number;
  recoilPerShotMultiplier: number;
  recoilDecayMultiplier: number;
}
function combine<T extends object>(result: T, stats: Partial<T> | undefined): void {
  if (!stats) return;
  for (const key of Object.keys(stats) as (keyof T)[]) {
    const value = stats[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || !(key in result)) throw new Error('Invalid hullmod stat: ' + String(key));
    const previous = result[key] as number;
    result[key] = (String(key).endsWith('Multiplier') ? previous * value : previous + value) as T[keyof T];
  }
}
const bySize = (s: ShipSpec, values: number[]) => values[({ FIGHTER: -1, FRIGATE: 0, DESTROYER: 1, CRUISER: 2, CAPITAL_SHIP: 3 })[s.hullSize ?? 'FRIGATE']] ?? 0;
function effectiveShieldBase(spec: ShipSpec) {
  let result = { shieldType: spec.shieldType, shieldArcDeg: spec.shieldArcDeg, shieldEfficiency: spec.shieldEfficiency, shieldUpkeep: spec.shieldUpkeep };
  for (const mod of installedHullMods(spec)) result = { ...result, ...mod.shieldSpec?.(spec) };
  return result;
}
const needsShield = (s: ShipSpec) => ['FRONT','OMNI'].includes(effectiveShieldBase(s).shieldType) ? null : '该舰没有护盾';
const hasHullMod = (s: ShipSpec, id: string) => [...(s.builtInHullMods ?? []), ...(s.hullMods ?? [])].includes(id);
/** Rangefinder uses actual BALLISTIC slots, not hybrid/composite/universal mounts or fitted guns. */
function largestBallisticSlot(ship: ShipSpec): WeaponSpec['mountSize'] | undefined {
  const ranks = { SMALL: 1, MEDIUM: 2, LARGE: 3 };
  let largest: WeaponSpec['mountSize'] | undefined;
  for (const slot of ship.weaponSlots) {
    if (slot.weaponType === 'BALLISTIC' && (!largest || ranks[slot.slotSize] > ranks[largest])) largest = slot.slotSize;
  }
  return largest;
}
const targeting = ['targetingunit', 'dedicated_targeting_core', 'advancedcore', 'distributed_fire_control'];
// Only these audited built-ins may memoize range results. External hooks stay live.
const nativeRangeDefinitions = new WeakSet<HullModDefinition>();
function native(id: keyof typeof nativeMetadata, description: string, hooks: Partial<HullModDefinition> = {}) {
  // JSON support values are checked by the registry alongside the runtime-hook status.
  const { name, support, ...refit } = nativeMetadata[id] as HullModRefitMetadata & { name: string; support?: HullModSupport };
  hullModDefinitions.register({ id, name, status: 'implemented', refit, support, description, ...hooks });
  nativeRangeDefinitions.add(hullModDefinitions.require(id));
}
// Mixed scope is explicit: real combat hooks do not imply a campaign simulation.
native('eccm', '导弹抗诱骗概率+50%，制导加成+1；极速+25%、加速度+150%、转速+50%、转向加速度+150%，飞行时间×0.8。电子战射程惩罚×0.5。S-mod效果尚未接入。', {
  stats: () => ({ ecmPenaltyMultiplier: .5 }),
  rangeMultiplier: (_s,w) => w.weaponType === 'MISSILE' ? .8 * (w.isRocket || w.spawnType === 'MISSILE' ? 1.25 : 1) : 1,
  weaponStats: (_s,w) => w.weaponType === 'MISSILE' ? { eccmChanceBonus: .5, missileGuidanceBonus: 1, missileSpeedPercent: 25, missileAccelerationPercent: 150, missileTurnPercent: 50, missileTurnAccelerationPercent: 150, missileFlightTimeMultiplier: .8 } : {},
});
native('ecm', '部署时依舰体级别为己方舰队提供1/2/3/4%电子战强度。双方电子战会互相抵消部分惩罚；上限10%。', { stats: s => ({ ecmRating: bySize(s, [1,2,3,4]) }) });
native('coherer', '非光束能量武器基础射程+100；全自动舰船+200。在百分比射程修正之前计算。原版有人舰船员伤亡+50%的人员结算未模拟。', {
  rangeBaseFlat: (s,w) => !w.isBeam && w.weaponType === 'ENERGY' ? ((s.sourceHullTraits ?? s.builtInHullMods ?? []).includes('automated') ? 200 : 100) : 0,
});
native('solar_shielding', '受到的能量类型伤害降低10%，作用于护盾、装甲和结构。不减免动能、高爆、破片或EMP；不按发射武器类别判定。战役星冕不在当前实现范围。', { stats: () => ({ energyDamageMultiplier: .9 }) });
native('blast_doors', '结构值 +20%。原版船员伤亡减少60%与S-mod效果尚无伤亡机制承接。', {stats:()=>({hullPercent:20})});
native('comp_armor', '装甲 ×0.8。仅内置损伤；部署补给折扣未模拟。', {stats:()=>({armorMultiplier:.8})});
native('comp_hull', '结构值 ×0.7。仅内置损伤；部署补给折扣未模拟。', {stats:()=>({hullMultiplier:.7})});
native('unstable_coils', '相位时间增益 ×0.5（完全潜航3倍变2倍），峰值时间 ×0.7，CR衰减速率 +30%。仅内置损伤；部署补给折扣未模拟。', {stats:()=>({phaseTimeBonusMultiplier:.5,peakCRMultiplier:.7,crLossPercent:30})});
native('reinforcedhull', '结构值 +40%，战沉不碎裂。原版的必定可回收效果尚无战役回收机制承接。', { stats: () => ({hullPercent:40,breakProbabilityMultiplier:0}) });
native('insulatedengine', '结构值 +10%，引擎耐久 +100%。传感器截面降低50%的战役效果未模拟。', { stats: () => ({hullPercent:10,engineHealthPercent:100}) });
native('degraded_engines', '老化损伤：速度、加减速、转向加速度及转速 ×0.85。仅内置损伤；战役部署补给折扣未模拟。', { stats: () => ({speedMultiplier:.85,accelerationMultiplier:.85,decelerationMultiplier:.85,turnAccelerationMultiplier:.85,turnRateMultiplier:.85}) });
native('degraded_shields', '老化损伤：护盾承受伤害 +10%。仅内置损伤；战役部署补给折扣未模拟。', {stats:()=>({shieldDamagePercent:10})});
native('faulty_grid', '缺损电网：幅能容量与耗散 ×0.85。仅内置损伤；传感器截面和部署补给效果未模拟。', {stats:()=>({capacityMultiplier:.85,dissipationMultiplier:.85})});
native('fragile_subsystems', '峰值时间 ×0.7，峰值耗尽后的CR衰减速率 +30%。仅内置损伤；部署补给折扣未模拟。', {stats:()=>({peakCRMultiplier:.7,crLossPercent:30})});
native('comp_structure', '结构与装甲 ×0.8。仅内置损伤；部署补给折扣未模拟。', {stats:()=>({hullMultiplier:.8,armorMultiplier:.8})});
native('damaged_mounts', '武器转速 ×0.75，最大后坐力与每发后坐力 +30%。仅内置损伤；部署补给折扣未模拟。', {weaponStats:()=>({turnRateMultiplier:.75,maxRecoilPercent:30,recoilPerShotPercent:30})});
native('high_scatter_amp', '光束伤害 +10%，命中护盾产生硬幅能。光束基础射程超过200的部分保留50%，再结算射程加成。与先进光学器件互斥。', {
  conflicts: ['advancedoptics'], rangeBaseFlat: (_s,w) => w.isBeam ? -Math.max(0,w.range-200)*.5 : 0,
  weaponStats: (_s,w) => w.isBeam ? {damagePercent:10,beamHardFlux:1} : {},
});
native('missile_autoloader', '仅为小型导弹槽内不自行恢复弹药的小型导弹补弹；共享容量按舰级与原生槽数计算。每次补充原始弹药量，耗尽时可部分装填；另加5秒装填冷却。', {
  applicable: s => missileReloadCapacity(s) ? null : '需要小型导弹槽', advance: advanceMissileAutoloader,
});
native('missile_reload', '每隔10–15秒补满所有使用弹药的导弹武器。仅舰体内置；不重置射击周期。', { advance: advancePeriodicMissileReload });
native('shield_shunt', '移除护盾，装甲 +15%。不兼容临时护盾发生器。', {
  applicable: s => ['FRONT','OMNI'].includes(s.shieldType) ? null : '原生舰体必须具有护盾', conflicts: ['frontshield'],
  shieldSpec: () => ({ shieldType: 'NONE', shieldArcDeg: 0, shieldUpkeep: 0 }), stats: () => ({ armorPercent: 15 }),
});
native('frontemitter', '全角护盾转为前盾，护盾角度 +100%；使用前盾的展开速度。', {
  applicable: s => s.shieldType === 'OMNI' && !hasHullMod(s, 'shield_shunt') ? null : '需要未被移除的原生全角护盾', conflicts: ['adaptiveshields'],
  shieldSpec: () => ({ shieldType: 'FRONT' }), stats: () => ({ shieldArcPercent: 100 }),
});
native('adaptiveshields', '前盾转为全角护盾，护盾角度 ×0.7。普通安装不豁免弧度惩罚。', {
  applicable: s => s.shieldType === 'FRONT' && !hasHullMod(s, 'shield_shunt') ? null : '需要未被移除的原生前盾', conflicts: ['frontemitter'],
  shieldSpec: () => ({ shieldType: 'OMNI' }), stats: () => ({ shieldArcMultiplier: .7 }),
});
native('frontshield', '为原生无防御舰体安装90°前盾，幅能/伤害1.2，维持费为基础耗散的50%；最高航速 ×0.8。', {
  applicable: s => s.shieldType === 'NONE' && (!s.defenseSystemType || s.defenseSystemType === 'NONE') ? null : '仅原生无护盾且无特殊防御系统的舰体可用',
  conflicts: ['shield_shunt'], shieldSpec: () => ({ shieldType: 'FRONT', shieldArcDeg: 90, shieldEfficiency: 1.2, shieldUpkeep: .5 }), stats: () => ({ speedMultiplier: .8 }),
});
native('adaptive_coils', '相位潜航降至最低航速的硬幅能阈值 +50%（50% → 75%）。不增加相位时间倍率。', {
  applicable: s => s.shieldType === 'PHASE' ? null : '仅相位舰可用', conflicts: ['phase_anchor'], stats: () => ({ phaseMinSpeedFluxThresholdPercent: 50 }),
});
native('ablative_armor', '用于减伤计算的有效装甲和残余最低装甲均 ×0.1；不减少装甲格实际耐久。仅限内置。', {
  stats: () => ({ effectiveArmorMultiplier: .1, minArmorFractionMultiplier: .1 }),
});
native('pointdefenseai', '所有武器对导弹伤害 +50%，点防御自动火控忽略诱饵弹。Web 火控一直使用无战备精度惩罚的拦截解，不伪造额外精度倍率；不赋予普通小武器点防御属性。', {
  stats: () => ({ damageToMissilesPercent: 50, pdIgnoresFlares: 1 }),
});
// Normal (non-S-mod) effects only. Costs/classification and source names come from hull_mods.csv.
native('advancedcore', '非点防御实弹与能量射程 +100%，点防御射程 +60%。', { rangeGroup: 'targeting', priority: 3, conflicts: targeting.filter(id => id !== 'advancedcore'), rangePercent: (_s, w) => w.weaponType === 'MISSILE' ? 0 : w.isPointDefense ? 60 : 100 });
native('targetingunit', '实弹与能量武器射程 +10 / 20 / 40 / 60%（护卫 / 驱逐 / 巡洋 / 主力）。', { rangeGroup: 'targeting', priority: 2, conflicts: targeting.filter(id => id !== 'targetingunit'), rangePercent: (s,w) => w.weaponType === 'MISSILE' ? 0 : bySize(s, [10, 20, 40, 60]) });
native('dedicated_targeting_core', '实弹与能量武器射程：巡洋舰 +35%，主力舰 +50%。', { rangeGroup: 'targeting', priority: 1, conflicts: targeting.filter(id => id !== 'dedicated_targeting_core'), applicable: s => ['CRUISER', 'CAPITAL_SHIP'].includes(s.hullSize ?? '') ? null : '仅巡洋舰 / 主力舰可用', rangePercent: (s,w) => w.weaponType === 'MISSILE' ? 0 : bySize(s, [0, 0, 35, 50]) });
native('stabilizedshieldemitter', '护盾维持幅能 −50%。不影响受击产生的硬幅能。', { applicable: needsShield, stats: () => ({ shieldUpkeepMultiplier: .5 }) });
native('hardenedshieldemitter', '护盾承伤 −20%，EMP 电弧穿盾概率减半。', { applicable: needsShield, stats: () => ({ shieldDamageMultiplier: .8, shieldPiercedMultiplier: .5 }) });
native('fluxbreakers', '主动排幅速度 +25%，武器和引擎所受 EMP 损害 −50%。', { stats: () => ({ ventRateMultiplier: 1.25, empDamageMultiplier: .5 }) });
native('fluxdistributor', '幅能耗散 +30 / 60 / 90 / 150（护卫 / 驱逐 / 巡洋 / 主力）。', { stats: s => ({ dissipationBonus: bySize(s, [30, 60, 90, 150]) }) });
native('advancedshieldemitter', '护盾转向速度 +100%，展开速度 +100%。', { applicable: needsShield, stats: () => ({ shieldTurnRatePercent: 100, shieldUnfoldRatePercent: 100 }) });
native('extendedshieldemitter', '护盾弧度 +60°，最大 360°。', { applicable: needsShield, stats: () => ({ shieldArcBonus: 60 }) });
native('heavyarmor', '装甲 +150 / 300 / 400 / 500（护卫 / 驱逐 / 巡洋 / 主力）。普通安装不降低机动性。', { stats: s => ({ armorBonus: bySize(s, [150, 300, 400, 500]) }) });
native('auxiliarythrusters', '加速度和转向加速度 +100%，减速度和最大转速 +50%。不提高最高航速。', { stats: () => ({ accelerationPercent: 100, decelerationPercent: 50, turnAccelerationPercent: 100, turnRatePercent: 50 }) });
native('turretgyros', '所有炮塔转向速度 +75%。固定挂点仍不可独立转向。', { weaponStats: () => ({ turnRatePercent: 75 }) });
native('advancedoptics', '光束射程 +200，光束炮塔转速 −30%。兼容目标定位系统，但固定射程加成不受其百分比放大。', { conflicts: ['high_scatter_amp'], rangeFlat: (_s, w) => w.isBeam ? 200 : 0, weaponStats: (_s, w) => ({ turnRateMultiplier: w.isBeam ? .7 : 1 }) });
native('armoredweapons', '武器耐久 +100%，船体装甲 +10%。非光束武器转速 −25%；最大后坐力、每发后坐力及恢复速率均 −25%。', { stats: () => ({ armorPercent: 10, weaponHealthPercent: 100 }), weaponStats: (_s, w) => ({ turnRateMultiplier: w.isBeam ? 1 : .75, maxRecoilMultiplier: .75, recoilPerShotMultiplier: .75, recoilDecayMultiplier: .75 }) });
native('autorepair', '战斗中武器和引擎的修复时间 −50%。不恢复结构或装甲，也不改变战役维修速度。', { stats: () => ({ engineRepairTimeMultiplier: .5, weaponRepairTimeMultiplier: .5 }) });
native('magazines', '实弹和能量武器弹药容量 +50%。不改变弹药恢复速度，无限弹药武器不受影响。', { weaponStats: (_s, w) => ({ ammoPercent: w.weaponType === 'BALLISTIC' || w.weaponType === 'ENERGY' ? 50 : 0 }) });
native('missleracks', '导弹武器弹药容量 +100%。普通安装不降低射速。', { weaponStats: (_s, w) => ({ ammoPercent: w.weaponType === 'MISSILE' ? 100 : 0 }) });
native('fluxcoil', '幅能容量 +600 / 1200 / 1800 / 3000（护卫 / 驱逐 / 巡洋 / 主力）。', { stats: s => ({ capacityBonus: bySize(s, [600, 1200, 1800, 3000]) }) });
native('hbi', '大型实弹武器装配点消耗 −10。舰体内置，不可外装。', { weaponOPFlat: (_s, w) => w.weaponType === 'BALLISTIC' && w.mountSize === 'LARGE' ? -10 : 0 });
// Vanilla normal-installation effects (not S-mods), source classes in refit.source.
native('fourteenth', '装甲 +100；幅能容量与耗散 ×1.05；最高航速、加减速度、转向加速度和转速 ×0.92。仅限舰体内置。', {
  stats: () => ({ armorBonus: 100, capacityMultiplier: 1.05, dissipationMultiplier: 1.05,
    speedMultiplier: .92, accelerationMultiplier: .92, decelerationMultiplier: .92,
    turnAccelerationMultiplier: .92, turnRateMultiplier: .92 }),
});
native('distributed_fire_control', '武器所受损害 ×0.5，EMP 所受损害 ×0.5。不提供射程加成；保留原版目标定位插件的不兼容限制。仅限舰体内置。', {
  stats: () => ({ weaponDamageTakenMultiplier: .5, empDamageMultiplier: .5 }),
});
native('no_weapon_flux', '所有实弹、能量和导弹武器的开火幅能消耗为零，包含持续光束。不影响护盾或舰船系统。仅限舰体内置。', {
  weaponStats: () => ({ fluxCostMultiplier: 0 }),
});
native('fluxshunt', '护盾开启时，耗散软幅能后剩余的耗散能力以 50% 效率耗散硬幅能。仅限舰体内置。', {
  conflicts: ['safetyoverrides'], stats: () => ({ hardFluxDissipationFraction: .5 }),
});
native('hardened_subsystems', '峰值作战时间 +50%，峰值耗尽后的战备衰减速度 ×0.75。', {
  applicable: s => (s.peakCRSec ?? 720) < 10000 || (s.crLossPerSec ?? .25) > 0 ? null : '该舰的战备值不会衰减',
  stats: () => ({ peakCRPercent: 50, crLossMultiplier: .75 }),
});
native('safetyoverrides', '最高航速 +50 / 30 / 20（护卫 / 驱逐 / 巡洋）；加减速度增加该数值的两倍。零幅能加速不再受幅能水平限制；耗散 ×2，峰值时间 ×0.33；不能主动排幅。非导弹射程超过 450 的部分只保留 25%。', {
  conflicts: ['fluxshunt'],
  applicable: s => s.hullSize === 'CAPITAL_SHIP' ? '不能安装在主力舰上'
    : hasHullMod(s, 'civgrade') && !hasHullMod(s, 'militarized_subsystems') ? '不能安装在未军用化的民用舰上' : null,
  stats: s => ({ speedBonus: bySize(s, [50, 30, 20, 10]), accelerationBonus: bySize(s, [100, 60, 40, 20]),
    decelerationBonus: bySize(s, [100, 60, 40, 20]), zeroFluxMinimumFluxLevel: 2,
    dissipationMultiplier: 2, peakCRMultiplier: .33, ventRateMultiplier: 0,
    rangeThreshold: 450, rangePastThresholdMultiplier: .25 }),
});
native('unstable_injector', '最高航速 +25 / 20 / 15 / 15（护卫 / 驱逐 / 巡洋 / 主力）；实弹与能量武器射程 ×0.85；舰载机补充时间 +25%。不提高加速度，导弹射程不变。', {
  stats: s => ({ speedBonus: bySize(s, [25, 20, 15, 15]), fighterRefitTimePercent: 25 }),
  rangeMultiplier: (_s, w) => w.weaponType === 'BALLISTIC' || w.weaponType === 'ENERGY' ? .85 : 1,
});
native('ballistic_rangefinder', '仅驱逐舰及以上且具有实弹挂点的舰体可安装。最大实弹挂点为小/中型时，小型实弹武器基础射程 +100，上限 800；有大型实弹挂点时，小型 +200、中型 +100，上限 900。混合型武器加成翻倍且至少 +100，仍受上限限制。点防御武器不受影响。基础加成可被百分比射程修正放大。', {
  // Native lasher.ship includes this on a frigate. Installation restrictions must
  // not invalidate a factory-built rangefinder when source capabilities are restored.
  applicable: s => !largestBallisticSlot(s) ? '该舰没有实弹武器挂点'
    : s.builtInHullMods?.includes('ballistic_rangefinder') || ['DESTROYER', 'CRUISER', 'CAPITAL_SHIP'].includes(s.hullSize ?? '') ? null : '仅驱逐舰及以上舰级可用',
  rangeBaseFlat: (s, w) => {
    // BallisticRangefinder.RangefinderRangeModifier: use the weapon's native
    // mounting category, not the mount it happens to occupy or its damage type.
    const type = w.mountTypeOverride ?? w.weaponType;
    if (type !== 'BALLISTIC' && type !== 'HYBRID') return 0;
    if (w.aiHints ? w.aiHints.includes('PD') : w.isPointDefense) return 0;
    const largest = largestBallisticSlot(s);
    if (!largest) return 0;
    const large = largest === 'LARGE';
    let bonus = w.mountSize === 'SMALL' ? (large ? 200 : 100) : w.mountSize === 'MEDIUM' && large ? 100 : 0;
    if (type === 'HYBRID') bonus = Math.max(100, bonus * 2);
    return Math.max(0, Math.min(bonus, (large ? 900 : 800) - w.range));
  },
});
native('delicate', '峰值作战时间耗尽后，战备值（CR）衰减速率 +50%。不缩短峰值时间，不改变部署战备或维修速度。仅限舰体内置。', {
  applicable: s => (s.peakCRSec ?? 720) < 10000 || (s.crLossPerSec ?? .25) > 0 ? null : '该舰的战备值不会衰减',
  // DelicateMachinery.modifyPercent(id, 50), not modifyMult: percent bonuses add.
  stats: () => ({ crLossPercent: 50 }),
});
native('phasefield', '仅战役：本舰传感器截面降低 50%；关闭应答器时，符合条件的相位舰还会降低舰队被侦测距离，舰队乘数最低为 0.25。当前没有战役传感器模拟；不改变战斗侦测、锁定或相位隐形。', {
  status: 'metadata-only',
});

const resolvedMods = new WeakMap<ShipSpec, readonly HullModDefinition[]>();
function resolvedHullMods(ship: ShipSpec): readonly HullModDefinition[] {
  const cached = resolvedMods.get(ship);
  if (cached) return cached;
  const mods = [...new Set([...(ship.builtInHullMods ?? []), ...(ship.hullMods ?? [])])].map(id => hullModDefinitions.require(id, ship.id));
  // Registry definitions cannot be replaced; successful resolution is stable for immutable specs.
  if (isImmutableMetadata(ship)) resolvedMods.set(ship, mods);
  return mods;
}
export function installedHullMods(ship: ShipSpec): HullModDefinition[] {
  // Preserve the public API's fresh, caller-owned array.
  return [...resolvedHullMods(ship)];
}
/** WeaponRange's input key covers these built-in range hooks, not arbitrary mod callbacks. */
export function hasOnlyNativeRangeModifiers(ship: ShipSpec): boolean {
  return resolvedHullMods(ship).every(mod => nativeRangeDefinitions.has(mod));
}
/** Used by UI, imported content and combat construction; built-ins are not installable a second time. */
export function hullModInstallReason(ship: ShipSpec, id: string, builtIn = false): string | null {
  const mod = hullModDefinitions.get(id);
  if (!mod) return '未知舰体插件：' + id;
  if (!builtIn && ship.builtInHullMods?.includes(id)) return '该插件已内置于舰体';
  if (!builtIn && mod.refit?.builtInOnly) return '该插件仅限舰体内置';
  if (!builtIn && mod.status !== 'implemented') return '当前版本尚未实现该插件';
  if (!builtIn && mod.refit && mod.refit.cost[ship.hullSize ?? 'FRIGATE'] === undefined) return '该舰级没有可安装的装配点费用';
  const reason = mod.applicable?.(ship);
  if (reason) return reason;
  const all = [...(ship.builtInHullMods ?? []), ...(ship.hullMods ?? [])];
  const conflict = all.find(other => other !== id && (mod.conflicts?.includes(other) || hullModDefinitions.get(other)?.conflicts?.includes(id)));
  if (conflict) return '不兼容于 ' + (hullModDefinitions.get(conflict)?.name ?? conflict);
  return null;
}
export function hullModLoadoutErrors(ship: ShipSpec): string[] {
  const all = [...(ship.builtInHullMods ?? []), ...(ship.hullMods ?? [])];
  const errors: string[] = [];
  if (new Set(all).size !== all.length) errors.push('舰体插件重复安装');
  for (const id of new Set(all)) {
    const reason = hullModInstallReason(ship, id, ship.builtInHullMods?.includes(id));
    if (reason) errors.push(id + '：' + reason);
  }
  return errors;
}
export function hullModOPCost(ship: ShipSpec, id: string): number {
  const mod = hullModDefinitions.require(id, ship.id);
  if (ship.builtInHullMods?.includes(id)) return 0;
  const cost = mod.refit?.cost[ship.hullSize ?? 'FRIGATE'];
  if (cost === undefined || mod.refit?.builtInOnly || mod.status !== 'implemented') throw new Error(id + ': no installable OP cost for hull size');
  return cost;
}
export function effectiveWeaponOP(ship: ShipSpec, weapon: WeaponSpec, baseOP: number): number {
  return Math.max(0, baseOP + installedHullMods(ship).reduce((sum, mod) => sum + (mod.weaponOPFlat?.(ship, weapon) ?? 0), 0));
}
export function hullModRangePercent(ship: ShipSpec, weapon: WeaponSpec): number {
  const groups = new Map<string, HullModDefinition>();
  let total = skillRangePercent(ship, weapon);
  for (const mod of resolvedHullMods(ship)) {
    if (!mod.rangePercent) continue;
    if (!mod.rangeGroup) total += mod.rangePercent(ship, weapon);
    else if (!groups.has(mod.rangeGroup) || (mod.priority ?? 0) > (groups.get(mod.rangeGroup)!.priority ?? 0)) groups.set(mod.rangeGroup, mod);
  }
  for (const mod of groups.values()) total += mod.rangePercent!(ship, weapon);
  return total;
}
export function hullModRangeFlat(ship: ShipSpec, weapon: WeaponSpec): number {
  return resolvedHullMods(ship).reduce((sum, mod) => sum + (mod.rangeFlat?.(ship, weapon) ?? 0),
    combatSkillLevel(ship, 'point_defense') === 2 && (weapon.isPointDefense || weapon.aiHints?.includes('PD')) ? 200 : 0);
}
/** Base-range bonuses precede percent/mult modifiers; normal flat bonuses follow them. */
export function hullModRangeBaseFlat(ship: ShipSpec, weapon: WeaponSpec): number {
  return resolvedHullMods(ship).reduce((sum, mod) => sum + (mod.rangeBaseFlat?.(ship, weapon) ?? 0), 0);
}
export function hullModRangeMultiplier(ship: ShipSpec, weapon: WeaponSpec): number {
  return resolvedHullMods(ship).reduce((mult, mod) => mult * (mod.rangeMultiplier?.(ship, weapon) ?? 1), 1);
}
/** Range hot path: derive only the threshold pair, not every hull stat. */
export function hullModRangeThresholdStats(ship: ShipSpec) {
  let rangeThreshold = 0, rangePastThresholdMultiplier = 1;
  for (const mod of resolvedHullMods(ship)) {
    const stats = mod.stats?.(ship);
    rangeThreshold += stats?.rangeThreshold ?? 0;
    rangePastThresholdMultiplier *= stats?.rangePastThresholdMultiplier ?? 1;
  }
  return { rangeThreshold, rangePastThresholdMultiplier };
}
export function effectiveHullStats(spec: ShipSpec) {
  const modifiers: HullModStats = {
    autofireAimAccuracy: 0, ecmRating: 0, ecmPenaltyMultiplier: 1,
    systemUsesBonus: 0, systemRegenMultiplier: 1, systemRangeMultiplier: 1, systemCooldownMultiplier: 1,
    peakCRBonus: 0, maxCombatReadinessBonus: 0, allowZeroFluxAtAnyLevel: 0, armorDamageMultiplier: 1, hullDamageMultiplier: 1, energyDamageMultiplier: 1,
    engineDamageTakenMultiplier: 1, canRepairModulesUnderFire: 0, phaseUpkeepMultiplier: 1, phaseCooldownMultiplier: 1,
    overloadTimeMultiplier: 1, maxArmorDamageReductionBonus: 0, ventRatePercent: 0,
    hullPercent: 0, hullMultiplier: 1, armorMultiplier: 1, engineHealthPercent: 0, shieldDamagePercent: 0, breakProbabilityMultiplier: 1,
    dissipationBonus: 0, capacityBonus: 0, armorBonus: 0, armorPercent: 0,
    dissipationPercent: 0, capacityPercent: 0, dissipationMultiplier: 1, capacityMultiplier: 1,
    speedBonus: 0, speedPercent: 0, speedMultiplier: 1, accelerationBonus: 0, decelerationBonus: 0,
    accelerationMultiplier: 1, decelerationMultiplier: 1, turnAccelerationMultiplier: 1, turnRateMultiplier: 1,
    peakCRPercent: 0, peakCRMultiplier: 1, crLossPercent: 0, crLossMultiplier: 1, hardFluxDissipationFraction: 0,
    zeroFluxMinimumFluxLevel: 0, rangeThreshold: 0, rangePastThresholdMultiplier: 1,
    weaponDamageTakenMultiplier: 1, fighterRefitTimePercent: 0,
    accelerationPercent: 0, decelerationPercent: 0, turnAccelerationPercent: 0, turnRatePercent: 0,
    shieldArcPercent: 0, shieldArcMultiplier: 1, phaseMinSpeedFluxThresholdPercent: 0, phaseTimeBonusMultiplier: 1,
    effectiveArmorMultiplier: 1, minArmorFractionMultiplier: 1, damageToMissilesPercent: 0, pdIgnoresFlares: 0,
    shieldArcBonus: 0, shieldTurnRatePercent: 0, shieldUnfoldRatePercent: 0, weaponHealthPercent: 0,
    shieldDamageMultiplier: 1, shieldUpkeepMultiplier: 1, shieldPiercedMultiplier: 1,
    ventRateMultiplier: 1, empDamageMultiplier: 1, engineRepairTimeMultiplier: 1, weaponRepairTimeMultiplier: 1,
  };
  for (const mod of installedHullMods(spec)) combine(modifiers, mod.stats?.(spec));
  // Resolve base weapon OP only for this skill; free built-ins never count as spent OP.
  const weaponOP = combatSkillLevel(spec, "ordnance_expert") ? spec.weaponSlots.reduce((sum, slot) => {
    if (!slot.defaultWeaponId || slot.builtIn || slot.weaponType === "BUILT_IN") return sum;
    const weapon = contentRegistry.getWeapon(slot.defaultWeaponId);
    return sum + (weapon ? effectiveWeaponOP(spec, weapon, weapon.ordnancePointCost ?? 0) : 0);
  }, 0) : 0;
  for (const stats of skillHullModifiers(spec, weaponOP)) combine(modifiers, stats);
  modifiers.ventRateMultiplier *= 1 + modifiers.ventRatePercent / 100;
  modifiers.shieldDamageMultiplier *= 1 + modifiers.shieldDamagePercent / 100;
  const fluxDissipation = (spec.fluxDissipation + modifiers.dissipationBonus) * (1 + modifiers.dissipationPercent / 100) * modifiers.dissipationMultiplier;
  const shield = effectiveShieldBase(spec);
  return { ...modifiers, fluxDissipation, ...shield,
    hitpoints: spec.hitpoints * (1 + modifiers.hullPercent / 100) * modifiers.hullMultiplier,
    breakProbability: (spec.breakProbability ?? 0) * modifiers.breakProbabilityMultiplier,
    fighterRefitTimeMultiplier: 1 + modifiers.fighterRefitTimePercent / 100,
    maxFlux: (spec.maxFlux + modifiers.capacityBonus) * (1 + modifiers.capacityPercent / 100) * modifiers.capacityMultiplier,
    maxSpeed: (spec.maxSpeed + modifiers.speedBonus) * (1 + modifiers.speedPercent / 100) * modifiers.speedMultiplier,
    peakCRSec: ((spec.peakCRSec ?? 720) + modifiers.peakCRBonus) * (1 + modifiers.peakCRPercent / 100) * modifiers.peakCRMultiplier,
    crLossPerSec: (spec.crLossPerSec ?? .25) * (1 + modifiers.crLossPercent / 100) * modifiers.crLossMultiplier,
    armorRating: (spec.armorRating + modifiers.armorBonus) * (1 + modifiers.armorPercent / 100) * modifiers.armorMultiplier,
    acceleration: (spec.acceleration + modifiers.accelerationBonus) * (1 + modifiers.accelerationPercent / 100) * modifiers.accelerationMultiplier,
    deceleration: (spec.deceleration + modifiers.decelerationBonus) * (1 + modifiers.decelerationPercent / 100) * modifiers.decelerationMultiplier,
    maxTurnRateDeg: spec.maxTurnRateDeg * (1 + modifiers.turnRatePercent / 100) * modifiers.turnRateMultiplier,
    turnAccelerationDeg: spec.turnAccelerationDeg * (1 + modifiers.turnAccelerationPercent / 100) * modifiers.turnAccelerationMultiplier,
    shieldArcDeg: shield.shieldType === 'NONE' ? 0 : Math.min(360, (shield.shieldArcDeg + modifiers.shieldArcBonus) * (1 + modifiers.shieldArcPercent / 100) * modifiers.shieldArcMultiplier),
    shieldUpkeepPerSecond: (shield.shieldUpkeep ?? 0) * (spec.shieldUpkeepBaseDissipation ?? spec.fluxDissipation) * modifiers.shieldUpkeepMultiplier,
    shieldFluxPerDamage: shield.shieldEfficiency * modifiers.shieldDamageMultiplier,
    ventPerSecond: fluxDissipation * 2 * modifiers.ventRateMultiplier,
  };
}
/** Call with the registry's base weapon, never with an already-derived mount spec. Range stays centralized in WeaponRange. */
export function effectiveHullModWeaponSpec(ship: ShipSpec, base: WeaponSpec): WeaponSpec {
  const stats: HullModWeaponStats = { eccmChanceBonus: 0, missileGuidanceBonus: 0, missileSpeedPercent: 0, missileAccelerationPercent: 0, missileTurnPercent: 0, missileTurnAccelerationPercent: 0, missileFlightTimeMultiplier: 1, projectileSpeedPercent: 0, missileHealthPercent: 0, rateOfFirePercent: 0, ammoRegenPercent: 0, damagePercent: 0, beamHardFlux: 0, fluxCostPercent: 0, fluxCostMultiplier: 1, turnRatePercent: 0, turnRateMultiplier: 1, ammoPercent: 0, maxRecoilPercent: 0, recoilPerShotPercent: 0, maxRecoilMultiplier: 1, recoilPerShotMultiplier: 1, recoilDecayMultiplier: 1 };
  for (const mod of installedHullMods(ship)) combine(stats, mod.weaponStats?.(ship, base));
  for (const bonus of skillWeaponModifiers(ship, base)) combine(stats, bonus);
  const fluxCost = (1 + stats.fluxCostPercent / 100) * stats.fluxCostMultiplier;
  const rof = 1 + stats.rateOfFirePercent / 100;
  // Native minRefireDelay=.05: a bonus never slows an already-faster weapon.
  const cycleRof = rof > 1 ? Math.max(1, Math.min(rof, (base.refireDelay + (base.chargeTime ?? 0)) / .05)) : rof;
  const burstRof = rof > 1 ? Math.max(1, Math.min(rof, (base.burstDelay ?? 0) / .05)) : rof;
  return { ...base,
    eccmChanceBonus: (base.eccmChanceBonus ?? 0) + stats.eccmChanceBonus,
    missileGuidanceBonus: (base.missileGuidanceBonus ?? 0) + stats.missileGuidanceBonus,
    maxSpeed: base.maxSpeed === undefined ? undefined : base.maxSpeed * (1 + stats.missileSpeedPercent / 100),
    engineAcceleration: base.engineAcceleration === undefined ? undefined : base.engineAcceleration * (1 + stats.missileAccelerationPercent / 100),
    maxTurnRate: base.maxTurnRate === undefined ? undefined : base.maxTurnRate * (1 + stats.missileTurnPercent / 100),
    maxTurnAcceleration: base.maxTurnAcceleration === undefined ? undefined : base.maxTurnAcceleration * (1 + stats.missileTurnAccelerationPercent / 100),
    flightTime: base.flightTime === undefined ? undefined : base.flightTime * stats.missileFlightTimeMultiplier,
    projectileSpeedBonusPercent: stats.projectileSpeedPercent,
    projSpeed: base.projSpeed * (1 + stats.projectileSpeedPercent / 100),
    missileHp: base.missileHp === undefined ? undefined : base.missileHp * (1 + stats.missileHealthPercent / 100),
    ammoRegenPerSec: base.ammoRegenPerSec === undefined ? undefined : base.ammoRegenPerSec * (1 + stats.ammoRegenPercent / 100),
    refireDelay: base.refireDelay / cycleRof,
    chargeTime: base.chargeTime === undefined ? undefined : base.chargeTime / cycleRof,
    burstDelay: base.burstDelay === undefined ? undefined : base.burstDelay / burstRof,
    mirv: base.mirv ? { ...base.mirv, damage: base.mirv.damage * (1 + stats.damagePercent / 100),
      childHitpoints: base.mirv.childHitpoints * (base.mirv.childProjectile?.spawnType === "MISSILE" ? 1 + stats.missileHealthPercent / 100 : 1) } : undefined,
    damagePerShot: base.damagePerShot * (1 + stats.damagePercent / 100),
    damagePerSecond: base.damagePerSecond * (1 + stats.damagePercent / 100),
    beamDealsHardFlux: base.beamDealsHardFlux || stats.beamHardFlux > 0,
    fluxPerShot: base.fluxPerShot * fluxCost,
    fluxPerSecond: base.fluxPerSecond === undefined ? undefined : base.fluxPerSecond * fluxCost,
    turnRateDegPerSec: (base.turnRateDegPerSec ?? 30) * (1 + stats.turnRatePercent / 100) * stats.turnRateMultiplier,
    maxAmmo: base.maxAmmo === undefined ? undefined : Math.trunc(base.maxAmmo * (1 + stats.ammoPercent / 100)),
    maxSpread: Math.max(base.minSpread ?? 0, (base.maxSpread ?? base.minSpread ?? 0) * (1 + stats.maxRecoilPercent / 100) * stats.maxRecoilMultiplier),
    spreadPerShot: (base.spreadPerShot ?? 0) * (1 + stats.recoilPerShotPercent / 100) * stats.recoilPerShotMultiplier,
    spreadDecay: (base.spreadDecay ?? 5) * stats.recoilDecayMultiplier,
  };
}
