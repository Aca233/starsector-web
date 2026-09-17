import type { ShipSpec } from '../content/ShipSpec';
import type { WeaponSpec } from '../simulation/Weapon';
import type { Ship } from '../simulation/Ship';
import type { HullModStats, HullModWeaponStats } from './HullMods';

/** Combat presets only. No campaign skill points, unlocks, crew losses or logistics. */
export type CombatSkillLoadout = Record<string, 1 | 2>;
export interface CombatSkillDefinition {
  id: string;
  name: string;
  source: string;
  normal: string;
  elite: string;
  stats?: (spec: ShipSpec, level: number, weaponOP: number) => Partial<HullModStats>;
  weaponStats?: (weapon: WeaponSpec, level: number) => Partial<HullModWeaponStats>;
  rangePercent?: (weapon: WeaponSpec, level: number) => number;
}
const civilian = (s: ShipSpec) => {
  const traits = [...(s.sourceHullTraits ?? []), ...(s.builtInHullMods ?? []), ...(s.hullMods ?? [])];
  return traits.includes('civgrade') ? !traits.includes('militarized_subsystems') : traits.includes('CIVILIAN');
};
const maneuver = (bonus: number) => ({ accelerationPercent: bonus, decelerationPercent: bonus, turnAccelerationPercent: bonus * 2, turnRatePercent: bonus });
const definitions: CombatSkillDefinition[] = [
  { id: 'gunnery_implants', name: '火控植入', source: 'GunneryImplants / ElectronicWarfare',
    normal: '自动开火目标预判精度+100%；实弹/能量射程+15%；最大后坐力、每发后坐力和恢复速度均×0.75。', elite: '驾驶非民用舰时提供1%舰队电子战强度，实际降低敌方武器射程。',
    stats: (s,level) => ({ autofireAimAccuracy: 1, ecmRating: level === 2 && !civilian(s) ? 1 : 0 }),
    weaponStats: () => ({ maxRecoilMultiplier: .75, recoilPerShotMultiplier: .75, recoilDecayMultiplier: .75 }),
    rangePercent: w => w.weaponType === 'BALLISTIC' || w.weaponType === 'ENERGY' ? 15 : 0 },
  { id: 'point_defense', name: '点防专精', source: 'PointDefense',
    normal: '所有武器对战机和导弹伤害 +50%；也作用于本舰所属舰载机。', elite: '点防武器射程 +200；包括光束点防与所属舰载机。',
    stats: () => ({ damageToMissilesPercent: 50 }) },
  { id: 'target_analysis', name: '目标解析', source: 'TargetAnalysis',
    normal: '对巡洋舰伤害 +15%，对主力舰伤害 +20%。', elite: '对护卫舰伤害 +5%，对驱逐舰伤害 +10%；对敌武器和引擎组件伤害 +100%。' },
  { id: 'energy_weapon_mastery', name: '能量武器精通', source: 'EnergyWeaponMastery',
    normal: '能量武器随本舰当前幅能获得最多 +30% 伤害；600 距离内全额，600–1000 线性降低，1000 及以上无加成。', elite: '能量武器幅能消耗 ×0.9。',
    weaponStats: (weapon, level) => weapon.weaponType === 'ENERGY' && level === 2 ? { fluxCostMultiplier: .9 } : {} },
  { id: "systems_expertise", name: "系统专长", source: "SystemsExpertise",
    normal: "有限次数的舰船系统储备 +1，次数恢复速度 +50%，系统作用距离 +50%，系统冷却 ×0.67。不改变独立相位线圈。", elite: "装甲、结构和护盾承伤 ×0.9。",
    stats: (_, level) => ({ systemUsesBonus: 1, systemRegenMultiplier: 1.5, systemRangeMultiplier: 1.5, systemCooldownMultiplier: .67,
      ...(level === 2 ? { armorDamageMultiplier: .9, hullDamageMultiplier: .9, shieldDamageMultiplier: .9 } : {}) }) },
  { id: 'helmsmanship', name: '操舵技术', source: 'Helmsmanship',
    normal: '最高速度 +15%；加减速及转速 +50%，转向加速度 +100%。', elite: '最高速度 +10；不再产生新幅能且不处于过载/排散/控制锁定时，经过加速延迟后，非零幅能也可获得零幅能加速。',
    stats: (_, level) => ({ ...maneuver(50), speedPercent: 15, ...(level === 2 ? { speedBonus: 10, allowZeroFluxAtAnyLevel: 1 } : {}) }) },
  { id: 'combat_endurance', name: '战斗耐力', source: 'CombatEndurance',
    normal: '峰值作战时间 +60 秒；CR 衰减速率 ×0.75；标准出击 CR 上限 +15 个百分点。', elite: '每秒修复最大结构的 0.5%；每场总修复额度为 2000 与最大结构 50% 中的较大值。不复活战沉舰船。',
    stats: () => ({ peakCRBonus: 60, crLossMultiplier: .75, maxCombatReadinessBonus: .15 }) },
  { id: 'impact_mitigation', name: '冲击缓解', source: 'ImpactMitigation',
    normal: '装甲承伤 ×0.75；武器和引擎组件承伤 ×0.5。', elite: '护卫/驱逐舰加减速及转速 +25%，巡洋/主力舰 +50%；转向加速度获得双倍加成。',
    stats: (spec, level) => ({ armorDamageMultiplier: .75, weaponDamageTakenMultiplier: .5, engineDamageTakenMultiplier: .5,
      ...(level === 2 ? maneuver(['FRIGATE', 'DESTROYER'].includes(spec.hullSize ?? 'FRIGATE') ? 25 : 50) : {}) }) },
  { id: 'damage_control', name: '损伤管制', source: 'DamageControl',
    normal: '结构承伤 ×0.75；武器和引擎组件修复速度 +50%。仅执行战斗效果。', elite: '武器和引擎组件可在持续受击时继续修复。',
    stats: (_, level) => ({ hullDamageMultiplier: .75, engineRepairTimeMultiplier: 1 / 1.5, weaponRepairTimeMultiplier: 1 / 1.5,
      canRepairModulesUnderFire: level === 2 ? 1 : 0 }) },
  { id: 'field_modulation', name: '相场调制', source: 'FieldModulation',
    normal: '护盾承伤 ×0.85；相位维持消耗 ×0.75。', elite: '开盾时可利用闲置耗散的 20% 消散硬幅能；相位冷却 ×0.5；过载时间 ×0.75。',
    stats: (_, level) => ({ shieldDamageMultiplier: .85, phaseUpkeepMultiplier: .75,
      ...(level === 2 ? { hardFluxDissipationFraction: .2, phaseCooldownMultiplier: .5, overloadTimeMultiplier: .75 } : {}) }) },
  { id: 'ballistic_mastery', name: '实弹精通', source: 'BallisticMastery',
    normal: '实弹武器伤害 +10%，射程 +10%。不作用于能量/导弹武器。', elite: '实弹伤害额外 +5%，实弹弹速 +33%。',
    weaponStats: (weapon, level) => weapon.weaponType === 'BALLISTIC' ? { damagePercent: level === 2 ? 15 : 10, projectileSpeedPercent: level === 2 ? 33 : 0 } : {},
    rangePercent: weapon => weapon.weaponType === 'BALLISTIC' ? 10 : 0 },
  { id: 'missile_specialization', name: '导弹特化', source: 'MissileSpecialization',
    normal: '导弹弹药 +100%，导弹结构 +25%。', elite: '导弹射速及弹药再生速度 +25%，导弹伤害 +10%。',
    weaponStats: (weapon, level) => weapon.weaponType === 'MISSILE' ? { ammoPercent: 100, missileHealthPercent: 25,
      ...(level === 2 ? { rateOfFirePercent: 25, ammoRegenPercent: 25, damagePercent: 10 } : {}) } : {} },
  { id: 'polarized_armor', name: '极化装甲', source: 'PolarizedArmor',
    normal: '最大装甲减伤提高 5 个百分点；有效装甲最多 +50%，EMP 承伤最多 -50%，随硬幅能变化。无盾且非相位舰按 50% 幅能计算。', elite: '主动排散速度 +25%。',
    stats: (_, level) => ({ maxArmorDamageReductionBonus: .05, ventRatePercent: level === 2 ? 25 : 0 }) },
  { id: 'ordnance_expert', name: '军械专长', source: 'OrdnanceExpertise',
    normal: '每点实际已装武器 OP 增加 1.5 耗散，不计插件、幅能配置和免费内置武器。', elite: '每点实际已装武器 OP 增加 20 幅能容量。',
    stats: (_, level, weaponOP) => ({ dissipationBonus: weaponOP * 1.5, capacityBonus: level === 2 ? weaponOP * 20 : 0 }) },
];
export const combatSkillDefinitions: readonly Readonly<CombatSkillDefinition>[] = Object.freeze(definitions.map(d => Object.freeze(d)));
const byId = new Map(combatSkillDefinitions.map(d => [d.id, d]));
export function combatSkillErrors(input: unknown): string[] {
  if (input === undefined) return [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return ['舰长战斗技能配置必须是对象'];
  return Object.entries(input).flatMap(([id, level]) => !byId.has(id) ? ['尚未接入的战斗技能：' + id]
    : level !== 1 && level !== 2 ? ['技能等级只能为普通或精英：' + id] : []);
}
export function combatSkillLevel(spec: ShipSpec, id: string): number { return spec.captainSkills?.[id] ?? 0; }
export function skillHullModifiers(spec: ShipSpec, weaponOP: number): Partial<HullModStats>[] {
  const errors = combatSkillErrors(spec.captainSkills);
  if (errors.length) throw new Error(errors.join('；'));
  return Object.entries(spec.captainSkills ?? {}).map(([id, level]) => byId.get(id)!.stats?.(spec, level, weaponOP) ?? {});
}
export function skillWeaponModifiers(spec: ShipSpec, weapon: WeaponSpec): Partial<HullModWeaponStats>[] {
  return Object.entries(spec.captainSkills ?? {}).map(([id, level]) => byId.get(id)?.weaponStats?.(weapon, level) ?? {});
}
export function skillRangePercent(spec: ShipSpec, weapon: WeaponSpec): number {
  return Object.entries(spec.captainSkills ?? {}).reduce((sum, [id, level]) => sum + (byId.get(id)?.rangePercent?.(weapon, level) ?? 0), 0);
}
export function polarizedArmorLevel(ship: Ship): number {
  if (!combatSkillLevel(ship.spec, 'polarized_armor')) return 0;
  return ship.shield.type === 'NONE' ? .5 : Math.max(0, Math.min(1, ship.flux.hardFlux / ship.flux.maxFlux));
}
const regenerated = new WeakMap<Ship, number>();
/** Ship-local listeners use subjective combat time. A fresh encounter constructs fresh Ships. */
export function advanceCombatSkills(ship: Ship, dt: number): void {
  if (ship.isDead || !(dt > 0) || combatSkillLevel(ship.spec, 'combat_endurance') !== 2) return;
  const used = regenerated.get(ship) ?? 0;
  const limit = Math.max(2000, ship.maxHullHp * .5);
  const repair = Math.max(0, Math.min(limit - used, ship.maxHullHp * .005 * dt, ship.maxHullHp - ship.hullHp));
  if (repair > 0) { ship.hullHp += repair; regenerated.set(ship, used + repair); }
}
