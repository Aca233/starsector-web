import { Vector2 } from '../../math/Vector2';
import { signedAngle } from '../../math/Angles';
import type { WeaponMountSlotConfig } from '../../content/ShipSpec';
import type { Projectile } from '../../simulation/Weapon';
import type { Ship } from '../../simulation/Ship';
import type { ShipSystem } from '../../simulation/ShipSystem';
import { shipMotionStats } from '../../simulation/systems/ShipMotion';
import { nativeSystem } from './NativeSystemFactory';
import { spawnSystemProjectile } from './SystemProjectile';
import type { SystemModifiers } from './Types';

interface Impact { bomb: Projectile; slot: WeaponMountSlotConfig; elapsed: number; forceAngle?: number; impactTime: number; brakingTime?: number }
interface PlateImpulse { time: number }
interface State { impacts: Impact[]; compression: number; velocity: number; plate: PlateImpulse[]; mods: SystemModifiers; braking: boolean }
const states = new WeakMap<ShipSystem, State>();
function stateFor(s: ShipSystem): State {
  let state = states.get(s);
  if (!state) { state = { impacts: [], compression: 0, velocity: 0, plate: [], mods: {}, braking: false }; states.set(s,state); }
  return state;
}
const slotPoint = (ship: Ship, slot: WeaponMountSlotConfig) => new Vector2(slot.x,slot.y).rotate(ship.facingRad).add(ship.pos);
export function pulsePusherOffset(system: ShipSystem): number { return (states.get(system)?.compression ?? 0)*14; }
export const pulseDrives = (['orion_device','nova_burst'] as const).map(id => {
  const nova = id === 'nova_burst', fade = nova ? 1 : .15, live = nova ? 0 : .25;
  const mods = (system: ShipSystem) => stateFor(system).mods;
  return nativeSystem(id, {
    resources: { weapons: [nova ? 'nb_bomblauncher' : 'od_bomblauncher'] },
    description: nova ? '发射新星脉冲炸弹，1秒显形后引爆；依照推力板位置施加线性与角冲量，然后制动。可连续使用，不是瞬时加速数值加成。'
      : '从推力板发射核脉冲弹，0.15秒显形、0.25秒飞行后引爆；产生方向相关的线性与角冲量，然后有限速率制动。',
    implementationDetails: 'OrionDeviceStats/NovaBurstStats的逐挂点实体炸弹、原生伤害爆炸、惯性冲量、重叠冲击与末段制动。使用原生音效；推力板弹簧接渲染，定向星云/新星光晕仍使用Web粒子呈现。',
    audio: { activate: nova ? 'system_nova_burst_fire' : 'system_orion_device_fire' },
    canActivate: ship => !ship.engineController.isFlamedOut && ship.engineController.state !== 'FLAMING_OUT' && !!ship.spec.systemWeaponSlots?.length,
    modifiers: mods, passiveModifiers: mods, onReset:s=>{states.delete(s);},
    motionControl: s => ({blockAcceleration: stateFor(s).braking, forceBrake: stateFor(s).braking}),
    onActive: (ship, world, system) => {
      const state = stateFor(system);
      for (const slot of ship.spec.systemWeaponSlots ?? []) {
        const pos = slotPoint(ship,slot).add(Vector2.fromAngle(ship.facingRad,14*state.compression));
        const angle = ship.facingRad+slot.baseAngleDeg*Math.PI/180;
        const bomb = spawnSystemProjectile(ship, nova ? 'nb_bomblauncher' : 'od_bomblauncher', pos, angle, world, {
          vel: ship.vel.clone().scale(.5).add(Vector2.fromAngle(angle,nova ? 0 : 50)),
          inertialFlight: true, isGuided: false, collisionDisabled: true, empResistance: 1000, eccmChance: 1,
          flightTimeRemaining: undefined, maxFlightTime: live, rangeRemaining: Infinity, totalRange: Infinity,
          systemFuseSeconds: fade+live, systemFadeInSeconds: fade,
          systemExplosionSound: nova ? 'system_nova_burst_explosion' : 'system_orion_device_explosion',
        });
        state.impacts.push({bomb,slot,elapsed:0,impactTime:0});
      }
    },
    onAdvance: (ship,dt,_world,system) => {
      const state = stateFor(system), motion = shipMotionStats(ship,state.mods.speedFlat ?? 0), baseSpeed = motion.maxSpeed;
      let speed = 0, deceleration = 0;
      state.braking = false;
      for (const impact of state.impacts) {
        impact.elapsed += dt;
        if (impact.forceAngle === undefined && impact.bomb.systemFuseTriggered) {
          const toCenter = ship.pos.clone().sub(impact.bomb.pos).heading();
          let toSlot = slotPoint(ship,impact.slot).sub(impact.bomb.pos).heading();
          if (Math.abs(signedAngle(toSlot-toCenter)) > Math.PI/2) toSlot += Math.PI;
          impact.forceAngle = toCenter+signedAngle(toSlot-toCenter)*.2;
          state.plate.push({time:.2});
        }
      }
      const multiple = state.impacts.filter(i=>i.forceAngle !== undefined).length > 1;
      state.impacts = state.impacts.filter(impact => {
        if (impact.forceAngle === undefined) return impact.elapsed <= 1+1e-9;
        if (impact.brakingTime === undefined) {
          impact.impactTime += dt*(nova ? 1 : 4);
          const mag = Math.abs(1-impact.impactTime);
          const forcePoint = slotPoint(ship,impact.slot);
          const angleDiff = signedAngle(ship.pos.clone().sub(forcePoint).heading()-impact.forceAngle);
          const portion = Math.min(1,Math.abs(angleDiff)/(Math.PI/2));
          ship.vel.add(Vector2.fromAngle(impact.forceAngle,(nova ? 10000 : 5000)*(1-portion*.2)*mag*dt));
          ship.angularVelRad += portion*motion.maxTurnRate*.25*mag*Math.sign(angleDiff)*dt;
          speed = Math.max(speed,1000*Math.max(0,(1-portion)*.5));
          deceleration = Math.max(deceleration,Math.max(baseSpeed,ship.vel.length()-baseSpeed));
          state.braking = true;
          if (impact.impactTime >= 1) { impact.brakingTime = 0; speed = 0; }
        }
        if (impact.brakingTime !== undefined) {
          if (!multiple) {
            state.braking = true;
            deceleration = Math.max(deceleration,2*Math.max(baseSpeed,ship.vel.length()-baseSpeed));
          }
          impact.brakingTime += dt;
          if (impact.brakingTime >= (multiple ? .1 : 3) || ship.vel.length() <= baseSpeed) return false;
        }
        return true;
      });
      if (!state.impacts.some(i=>i.forceAngle !== undefined)) { speed = deceleration = 0; state.braking = false; }
      state.mods = {speedFlat:speed,decelerationFlat:deceleration};
      const force = state.plate.length*10;
      state.plate = state.plate.filter(i=>(i.time-=dt)>0);
      state.velocity += (force-state.compression)*dt;
      state.compression += state.velocity*dt;
      if (state.compression > 1) { state.compression = 1; state.velocity = 0; }
      if (state.compression < 0) { state.compression = 0; state.velocity = 0; }
    },
    advanceAI: ({ship,distance,angleDiff,tactical}) => {
      if (tactical?.forwardClear !== false && Math.abs(angleDiff)<.35 && distance>(tactical?.desiredRange ?? 800)+(nova ? 850 : 400)) ship.system.activate();
    },
  });
});
