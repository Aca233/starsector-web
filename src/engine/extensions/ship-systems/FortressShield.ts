import type { ShipSystemDefinition } from './Types';
export const fortressShield: ShipSystemDefinition = {
  id: 'FORTRESS_SHIELD', sourceIds: ['fortressshield'], name: '堡垒护盾',
  chargeUp: 1.5, active: Infinity, chargeDown: 1.5, cooldown: 0, toggle: true, hardFlux: true,
  controls: { blockWeapons: true }, visuals: { fortressShield: true },
  audio: { loop: 'fortress_shield_loop', loopVolume: .7 },
  modifiers: (system, cap) => ({ shieldDamageMultiplier: 1 - .9 * system.effectLevel, shieldUpkeepMultiplier: 0, hardFluxPerSecond: cap * .025 }),
  advanceAI: ({ship, tactical}) => {
    if(!tactical)return;
    const room=ship.flux.maxFlux-ship.flux.totalFlux;
    const incoming=tactical.threat.imminentShieldFlux;
    // Web policy: spend fortress upkeep only when a forecast threat justifies giving up weapons.
    const upkeep=ship.flux.maxFlux*.025*(ship.system.chargeUpDuration+ship.system.chargeDownDuration);
    const useful=ship.canUseShields()&&incoming*.9>upkeep&&incoming>room*.5;
    if(useful&&!ship.system.isActive&&!ship.system.isCoolingDown)ship.system.activate();
    else if(ship.system.isActive&&ship.system.state!=='OUT'&&(!ship.canUseShields()||tactical.quietFor>=.5||room<=upkeep))ship.system.deactivate();
  }
};
