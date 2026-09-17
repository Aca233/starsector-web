import type { ShipSystemDefinition } from './Types';
import { advanceJetsAI } from './SystemAI';

/** com/fs/starfarer/api/impl/combat/PlasmaJetsStats.java and ship_systems.csv. */
export const plasmaJets: ShipSystemDefinition = {
  id: 'PLASMA_JETS', sourceIds: ['plasmajets'], name: '等离子推进器',
  description: '最高航速 +125；加速与减速最高 +375%，转向能力大幅提高，持续 3 秒。',
  implementationDetails: '原版数值与 1/3/2/5 秒阶段时序；OUT 移除航速/转速加成，保留加减速与转向加速度至停机。使用 Web 机动 AI 与通用引擎视觉；未模拟停机瞬间角速度钳制。',
  chargeUp: 1, active: 3, chargeDown: 2, cooldown: 5,
  visuals: { engineBoost: true },
  modifiers: system => {
    const level = system.retainedEffectLevel;
    const poweringDown = system.state === 'OUT';
    return {
      speedFlat: poweringDown ? 0 : 125,
      accelerationPercent: 375 * level, decelerationPercent: 375 * level,
      turnRateFlat: poweringDown ? 0 : 15, turnRatePercent: poweringDown ? 0 : 100,
      turnAccelerationFlat: 20 * level, turnAccelerationPercent: 100 * level
    };
  },
  advanceAI: advanceJetsAI
};
