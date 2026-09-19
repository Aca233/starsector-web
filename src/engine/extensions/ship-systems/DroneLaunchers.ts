import { needsLaunchers } from './Requirements';
import data from './native-drone-launchers.json';
import { nativeSystem } from './NativeSystemFactory';
import type { Ship } from '../../simulation/Ship';
import type { ShipSystem } from '../../simulation/ShipSystem';

export type DroneOrder = 'RECALL' | 'DEPLOY' | 'ATTACK';
export type DroneLauncherData = (typeof data)[keyof typeof data];
export interface DroneDeployment {
  order: DroneOrder;
  drones: Ship[];
  elapsed: number;
  regen: number;
  slot: number;
  ringAngles: number[];
  effectCount: number;
}
const states = new WeakMap<ShipSystem, DroneDeployment>();
export function droneLauncherData(system: ShipSystem): DroneLauncherData | undefined {
  return data[system.definition.sourceIds[0] as keyof typeof data];
}
export function droneDeployment(system: ShipSystem): DroneDeployment {
  let state = states.get(system);
  if (!state) {
    const native = droneLauncherData(system);
    state = { order: 'RECALL', drones: [], elapsed: 0, regen: 0, slot: 0, effectCount: 0,
      ringAngles: native?.spec.droneBehavior.map(b => b.initialOrbitAngle * Math.PI / 180) ?? [] };
    states.set(system, state);
  }
  return state;
}
export const droneLaunchers = (Object.keys(data) as (keyof typeof data)[]).map(id => nativeSystem(id, {
  installReason: needsLaunchers,
  resources: { ships: [data[id].variant.hullId], weapons: data[id].variant.weaponGroups.flatMap(g=>Object.values<string>(g.weapons)) },
  description: '按技能键在护航、自由（允许时）、回收之间切换。逐架释放，回收归还库存；战损不返还库存。',
  implementationDetails: '原版DRONE_LAUNCHER库存/部署上限/释放间隔、SYSTEM挂点、指定变体、环绕半径/方向和目标优先级。运动控制使用Web转向与火控，未逐帧移植原生DroneAI或弹射/着舰动画。',
  onReset:(system,owner)=>{owner?.runtimeModifiers.delete('sensor_drones');const state=states.get(system);for(const craft of state?.drones ?? []){craft.isDocked=true;craft.clearInput();}states.delete(system);},
  usesChargesForActivation: false,
  chargeRegen: 0, // Inventory regeneration depends on deployed count, not the order button.
  canActivate: ship => !!ship.spec.systemWeaponSlots?.length,
  statusText: system => {
    const state = droneDeployment(system);
    return ({ RECALL: '回收', DEPLOY: '护航', ATTACK: '自由' })[state.order] + ' · 已部署 ' + state.drones.filter(c => !c.isDead && !c.isDocked).length;
  },
  onActivate: (_ship, _world, system) => {
    const state = droneDeployment(system);
    state.order = state.order === 'RECALL' ? 'DEPLOY' : state.order === 'DEPLOY' && data[id].spec.allowFreeRoam ? 'ATTACK' : 'RECALL';
  },
  onAdvance: (ship, dt, world, system) => {
    world.advanceDroneLauncher?.(ship, system, dt);
    if (id !== 'drone_sensor') return;
    // Native oO0O: smooth toward deployed COUNT at 2/second, not count divided by max.
    const state = droneDeployment(system);
    const count = state.drones.filter(c => !c.isDead && !c.isDocked && c.hullHp > 0).length;
    state.effectCount += Math.sign(count-state.effectCount) * Math.min(Math.abs(count-state.effectCount),2*dt);
    if (state.effectCount > 0) ship.runtimeModifiers.set('sensor_drones', { sightRadiusPercent:25*state.effectCount,
      weapons:{BALLISTIC:{rangePercent:15*state.effectCount},ENERGY:{rangePercent:15*state.effectCount}} });
    else ship.runtimeModifiers.delete('sensor_drones');
  },
  advanceAI: ({ ship, system = ship.system, distance, tactical }) => {
    if (ship.isDead || ship.flux.isOverloaded || ship.flux.isVenting) return;
    const state = droneDeployment(system);
    if (tactical?.withdrawing && distance > 2500) state.order = 'RECALL';
    else if (distance < 2500) state.order = tactical?.withdrawing || !data[id].spec.allowFreeRoam ? 'DEPLOY' : 'ATTACK';
  },
}));
