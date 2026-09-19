import { usableWeaponReason } from './Requirements';
import type { ShipSystemDefinition } from './Types';
import { advanceWeaponBoostAI } from './SystemAI';

/** data/shipsystems/scripts/HighEnergyFocusStats.java and ship_systems.csv. */
export const highEnergyFocus: ShipSystemDefinition = {
  id: 'HIGH_ENERGY_FOCUS', sourceIds: ['highenergyfocus'], name: '高能聚焦系统',
  description: '能量武器伤害最高 +50%，持续 3 秒；储存 3 次使用次数，每 20 秒恢复 1 次。',
  implementationDetails: '能量弹丸与实时光束伤害随阶段强度增加；不修改实弹/导弹、EMP、射程或承受伤害。0.25/3/0.25 秒阶段，每秒产生 1 软幅能；采用 Web 开火窗口 AI，已接入原版武器辉光颜色与武器类型过滤，尚无专用音效。',
  chargeUp: .25, active: 3, chargeDown: .25, cooldown: 0,
  charges: 3, chargeRegen: .05,
  activationReason: ship => usableWeaponReason(ship, 'ENERGY', '需要可用的能量武器'),
  statusText: system => system.isActive ? `能量伤害 +${Math.round(system.effectLevel * 50)}%` : undefined,
  modifiers: system => ({ softFluxPerSecond: 1, weapons: { ENERGY: { damageMultiplier: 1 + .5 * system.effectLevel } } }),
  advanceAI: context => advanceWeaponBoostAI(context, 'ENERGY')
};
