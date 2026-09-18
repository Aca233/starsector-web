import { offensiveManeuverAllowed } from './SystemAI';
import type { ShipSystemDefinition } from './Types';
export const burnDrive: ShipSystemDefinition = {
  id: 'BURN_DRIVE', sourceIds: ['burndrive'], name: '冲刺推进',
  chargeUp: 2, active: 5, chargeDown: 1, cooldown: 10, toggle: true,
  controls: { blockShields: true, lockTurning: true, forceForward: true, cancelOnFlameout: true, suppressZeroFlux: true },
  visuals: { engineBoost: true },
  audio: { activate: 'burn_drive_activate', loop: 'burn_drive_loop', loopVolume: .65, deactivate: 'burn_drive_deactivate' },
  // BurnDriveStats.java / ship_systems.csv. OUT removes speed but retains acceleration.
  modifiers: system => ({ softFluxPerSecond: 1,
    speedFlat: system.state === 'OUT' ? 0 : 200 * system.effectLevel,
    accelerationFlat: system.state === 'OUT' ? 200 : 200 * system.effectLevel }),
  advanceAI: ({ship, target, distance, tactical}) => {
    if (!tactical) return;
    const stats=ship.getMotionStats(),boostedSpeed=ship.spec.maxSpeed+200;
    const stopping=boostedSpeed*boostedSpeed/(2*stats.deceleration)+boostedSpeed*ship.system.chargeDownDuration;
    const heading=Math.atan2(target.pos.y-ship.pos.y,target.pos.x-ship.pos.x)-ship.facingRad;
    const aligned=Math.abs(Math.atan2(Math.sin(heading),Math.cos(heading)))<.1;
    const safe=offensiveManeuverAllowed(tactical)
      &&tactical.threat.imminentDamage===0&&distance-tactical.desiredRange>stopping;
    if(ship.system.isActive){
      if(!safe&&ship.system.state!=='OUT')ship.system.deactivate();
    }else if(safe&&aligned&&!ship.system.isCoolingDown)ship.system.activate();
  }
};
