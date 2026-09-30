import { needsShield } from './Requirements';
import type { ShipSystemDefinition } from './Types';
export const fortressShield: ShipSystemDefinition = {
  installReason: needsShield,
  id: 'FORTRESS_SHIELD', sourceIds: ['fortressshield'], name: '堡垒护盾',
  description: '将武器系统的能量转给护盾，完全展开后护盾承伤降低90%，并免除普通护盾维持耗能。期间禁止开火，每秒产生相当于载荷容量2.5%的硬载荷，即使未受到攻击也会积累。',
  chargeUp: 1.5, active: Infinity, chargeDown: 1.5, cooldown: 0, toggle: true, hardFlux: true,
  controls: { blockWeapons: true }, visuals: { fortressShield: true },
  audio: { loop: 'fortress_shield_loop', loopVolume: .7 },
  modifiers: (system, cap) => ({ shieldDamageMultiplier: 1 - .9 * system.effectLevel, shieldUpkeepMultiplier: 0, hardFluxPerSecond: cap * .025 }),
  advanceAI: ({ship, tactical, system = ship.system}) => {
    if(!tactical)return;
    const room=ship.flux.maxFlux-ship.flux.totalFlux;
    const incoming=tactical.threat.imminentShieldFlux;
    // Web policy: spend fortress upkeep only when a forecast threat justifies giving up weapons.
    const upkeep=ship.flux.maxFlux*.025*(system.chargeUpDuration+system.chargeDownDuration);
    const useful=ship.canUseShields()&&incoming*.9>upkeep&&incoming>room*.5;
    if(useful&&!system.isActive&&!system.isCoolingDown)system.activate();
    else if(system.isActive&&system.state!=='OUT'&&(!ship.canUseShields()||tactical.quietFor>=.5||room<=upkeep))system.deactivate();
  }
};
