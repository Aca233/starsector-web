import type { ShipSystemDefinition } from './Types';
import { advanceJetsAI } from './SystemAI';

/** data/shipsystems/scripts/ManeuveringJetsStats.java and ship_systems.csv. */
export const maneuveringJets: ShipSystemDefinition = {
  id: 'MANEUVERING_JETS', sourceIds: ['maneuveringjets'], name: '机动推进器',
  description: '最高航速 +50；加速与减速最高 +200%，转向能力大幅提高，持续 5 秒。',
  implementationDetails: '原版数值与 1/5/1/5 秒阶段时序；OUT 移除航速/转速加成，保留加减速与转向加速度至停机。使用 Web 机动 AI 与原版引擎倍率；未模拟停机瞬间角速度钳制。',
  chargeUp: 1, active: 5, chargeDown: 1, cooldown: 5,
  visuals: { engineBoost: true },
  statusText: system => system.isActive ? `机动增强 · 加减速 +${Math.round(system.retainedEffectLevel * 200)}%` : undefined,
  modifiers: system => {
    const level = system.retainedEffectLevel;
    const poweringDown = system.state === 'OUT';
    return {
      // Source speed and maximum turn modifiers are immediate, not effectLevel-scaled.
      speedFlat: poweringDown ? 0 : 50,
      accelerationPercent: 200 * level, decelerationPercent: 200 * level,
      turnRateFlat: poweringDown ? 0 : 15, turnRatePercent: poweringDown ? 0 : 100,
      turnAccelerationFlat: 30 * level, turnAccelerationPercent: 200 * level
    };
  },
  advanceAI: advanceJetsAI
};
