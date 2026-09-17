/**
 * 战备值性能修正与故障机制 (Combat Readiness)
 * 严格对齐本地原版 com.fs.starfarer.api.impl.combat.CRPluginImpl:
 * - DEGRADE_START 0.5 / IMPROVE_START 0.7: 低于 50% 战备开始性能衰退，高于 70% 获得加成
 * - MAX_MOVEMENT_CHANGE 10%: 最高航速、加速度、减速度、转向速率与转向加速度
 * - MAX_DAMAGE_CHANGE 10%: 武器输出伤害
 * - MAX_DAMAGE_TAKEN_CHANGE 10%: 承受的装甲/船体/护盾伤害
 * - 武器/引擎概率在各部件健康检查时抽取；严重故障是故障后的条件概率，非独立每秒事件。
 * - 非战机 cr <= 0: 舰船系统与防御 (护盾) 全部失效；战机不应用 CR 部件故障概率。
 *
 * Note: CRPluginImpl.getMissileLoadedFraction() is hard-wired to `return 1f` in the
 * shipped build, so CR does not reduce loaded missile ammo; that behaviour is kept.
 */

export const CR_IMPROVE_START = 0.7;
export const CR_DEGRADE_START = 0.5;
export const CR_MALFUNCTION_START = 0.4;
export const CR_CRITICAL_MALFUNCTION_START = 0.2;
export const CR_SHIELD_MALFUNCTION_START = 0.1;
export const CR_NO_SYSTEM_THRESHOLD = 0.0;

export const CR_MAX_MOVEMENT_CHANGE = 10;
export const CR_MAX_DAMAGE_CHANGE = 10;
export const CR_MAX_DAMAGE_TAKEN_CHANGE = 10;

export const CR_MAX_WEAPON_MALFUNCTION_CHANCE = 10;
export const CR_MAX_ENGINE_MALFUNCTION_CHANCE = 7.5;
export const CR_MAX_CRITICAL_MALFUNCTION_CHANCE = 25;
export const CR_MAX_SHIELD_MALFUNCTION_CHANCE = 5;

const clampCr = (cr: number) => (Number.isFinite(cr) ? Math.max(0, Math.min(1, cr)) : 0);

/** CRPluginImpl.getMovementChangePercent: negative below 50% CR, positive above 70%. */
export function crMovementChangePercent(cr: number): number {
  const value = clampCr(cr);
  if (value < CR_DEGRADE_START) {
    return -((CR_DEGRADE_START - value) / CR_DEGRADE_START) * CR_MAX_MOVEMENT_CHANGE;
  }
  if (value > CR_IMPROVE_START) {
    return ((value - CR_IMPROVE_START) / (1 - CR_IMPROVE_START)) * CR_MAX_MOVEMENT_CHANGE;
  }
  return 0;
}

/** CRPluginImpl.getDamageChangePercent: outgoing weapon damage. */
export function crDamageChangePercent(cr: number): number {
  const value = clampCr(cr);
  if (value < CR_DEGRADE_START) {
    return -((CR_DEGRADE_START - value) / CR_DEGRADE_START) * CR_MAX_DAMAGE_CHANGE;
  }
  if (value > CR_IMPROVE_START) {
    return ((value - CR_IMPROVE_START) / (1 - CR_IMPROVE_START)) * CR_MAX_DAMAGE_CHANGE;
  }
  return 0;
}

/** CRPluginImpl.getDamageTakenChangePercent: incoming armor/hull/shield damage. */
export function crDamageTakenChangePercent(cr: number): number {
  const value = clampCr(cr);
  if (value < CR_DEGRADE_START) {
    return ((CR_DEGRADE_START - value) / CR_DEGRADE_START) * CR_MAX_DAMAGE_TAKEN_CHANGE;
  }
  if (value > CR_IMPROVE_START) {
    return -((value - CR_IMPROVE_START) / (1 - CR_IMPROVE_START)) * CR_MAX_DAMAGE_TAKEN_CHANGE;
  }
  return 0;
}

/** CRPluginImpl stat probabilities; ship/super samples weapon/engine chances per component check. */
export function crWeaponMalfunctionChance(cr: number, rangeMultiplier = 1): number {
  const value = clampCr(cr);
  const threshold = CR_MALFUNCTION_START * rangeMultiplier - .001;
  if (threshold <= 0 || value >= threshold) return 0;
  return (CR_MAX_WEAPON_MALFUNCTION_CHANCE * (threshold - value)) / threshold / 100;
}

export function crEngineMalfunctionChance(cr: number, rangeMultiplier = 1): number {
  const value = clampCr(cr);
  const threshold = CR_MALFUNCTION_START * rangeMultiplier - .001;
  if (threshold <= 0 || value >= threshold) return 0;
  return (CR_MAX_ENGINE_MALFUNCTION_CHANCE * (threshold - value)) / threshold / 100;
}

export function crCriticalMalfunctionChance(cr: number, rangeMultiplier = 1): number {
  const value = clampCr(cr);
  const threshold = CR_CRITICAL_MALFUNCTION_START * rangeMultiplier - .001;
  if (threshold <= 0 || value >= threshold) return 0;
  return (CR_MAX_CRITICAL_MALFUNCTION_CHANCE * (threshold - value)) / threshold / 100;
}

export function crShieldMalfunctionChance(cr: number, rangeMultiplier = 1): number {
  const value = clampCr(cr);
  const threshold = CR_SHIELD_MALFUNCTION_START * rangeMultiplier;
  if (threshold <= 0 || value >= threshold) return 0;
  return (CR_MAX_SHIELD_MALFUNCTION_CHANCE * (threshold - value)) / threshold / 100;
}

export interface CombatReadinessEffects {
  movementChangePercent: number;
  damageChangePercent: number;
  damageTakenChangePercent: number;
  weaponMalfunctionChance: number;
  engineMalfunctionChance: number;
  criticalMalfunctionChance: number;
  shieldMalfunctionChance: number;
  /** CRPluginImpl: cr <= 0 disables non-fighter ship systems and defenses. */
  systemDisabled: boolean;
  defenseDisabled: boolean;
}

export function computeCombatReadinessEffects(cr: number, rangeMultiplier = 1, fighter = false): CombatReadinessEffects {
  const value = clampCr(cr);
  const disabled = !fighter && value <= CR_NO_SYSTEM_THRESHOLD;
  return {
    movementChangePercent: crMovementChangePercent(value),
    damageChangePercent: crDamageChangePercent(value),
    damageTakenChangePercent: crDamageTakenChangePercent(value),
    weaponMalfunctionChance: fighter ? 0 : crWeaponMalfunctionChance(value, rangeMultiplier),
    engineMalfunctionChance: fighter ? 0 : crEngineMalfunctionChance(value, rangeMultiplier),
    criticalMalfunctionChance: fighter ? 0 : crCriticalMalfunctionChance(value, rangeMultiplier),
    shieldMalfunctionChance: fighter ? 0 : crShieldMalfunctionChance(value, rangeMultiplier),
    systemDisabled: disabled,
    defenseDisabled: disabled
  };
}
