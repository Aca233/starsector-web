/** Actual authored DroneLauncher data. Empty catalog stays empty. */
import type { Ship } from '../../simulation/Ship';
import { droneLauncherData } from '../../extensions/ship-systems/DroneLaunchers';
import type { DroneLauncherData } from '../../extensions/ship-systems/LegacySystemData';
import type { RustBodyHandle } from './RustCoreProtocol';
export interface RustDroneConfig {
  readonly template: string; readonly maxDrones: number; readonly launchDelay: number; readonly launchSpeed: number;
  readonly allowFreeRoam: boolean; readonly regen: number; readonly regenMultiplier: number; readonly sensor: boolean;
  readonly slots: readonly { readonly position: readonly [number, number]; readonly angle: number }[];
  readonly rings: readonly { readonly indices: readonly number[]; readonly initial: number; readonly radius: number;
    readonly direction: number; readonly speed: number; readonly facing: 'AWAY' | 'DRONE' | 'SHIP';
    readonly faceEnemy: boolean; readonly hold: number; readonly free: number; readonly priorities: readonly ('MISSILE' | 'FIGHTER' | 'SHIP')[] }[];
}
export interface RustDroneAdmission {
  readonly launchers: readonly { readonly carrier: RustBodyHandle; readonly system: number; readonly config: RustDroneConfig }[];
}
export function compileRustDroneConfig(ship: Ship, data: DroneLauncherData, template: string, sensor: boolean): RustDroneConfig {
  const result: RustDroneConfig = { template, maxDrones: data.spec.maxDrones, launchDelay: data.spec.launchDelay,
    launchSpeed: data.spec.launchSpeed, allowFreeRoam: data.spec.allowFreeRoam, regen: Number(data.row.regen || 0),
    regenMultiplier: ship.hullStats.systemRegenMultiplier, sensor,
    slots: (ship.spec.systemWeaponSlots ?? []).map(s => ({ position: [s.x, s.y], angle: s.baseAngleDeg })),
    rings: data.spec.droneBehavior.map(r => ({ indices: [...r.droneIndex], initial: r.initialOrbitAngle, radius: r.orbitRadius,
      direction: r.orbitDir, speed: r.orbitSpeed, facing: r.defaultFacing === 'AWAY_FROM_SHIP' ? 'AWAY'
        : r.defaultFacing === 'MATCH_DRONE_HEADING' ? 'DRONE' : 'SHIP', faceEnemy: r.faceEnemy,
      hold: r.holdRoamRange, free: r.freeRoamRange, priorities: r.targetPriority.map(p => {
        if (p !== 'MISSILE' && p !== 'FIGHTER' && p !== 'SHIP') throw Error('Unsupported authored drone priority'); return p;
      }) })) };
  if (!template || !Number.isInteger(result.maxDrones) || result.maxDrones <= 0 || result.maxDrones > 65_536
    || !result.rings.length || result.slots.length > 65_536 || result.rings.length > 65_536
    || [result.launchDelay, result.launchSpeed, result.regen, result.regenMultiplier].some(n => !Number.isFinite(n) || n < 0)
    || result.rings.some(r => r.indices.some(n => !Number.isInteger(n) || n < 0 || n > 0xffffffff)
      || r.indices.length > 65_536 || r.priorities.length > 65_536
      || [r.initial, r.radius, r.direction, r.speed, r.hold, r.free].some(n => !Number.isFinite(n)))
    || result.slots.some(s => [...s.position, s.angle].some(n => !Number.isFinite(n)))) throw Error('Invalid authored drone certificate');
  return result;
}
/** Resolver must compile droneVariantSpec(data) as a complete real StaticShip. */
export function compileRustDroneAdmission(ships: readonly Ship[], handles: ReadonlyMap<Ship, RustBodyHandle>,
  template: (carrier: Ship, data: DroneLauncherData, system: number) => string): RustDroneAdmission {
  const launchers: RustDroneAdmission['launchers'][number][] = [];
  for (const ship of ships) for (const [index, system] of ship.allSystems.entries()) {
    const data = droneLauncherData(system); if (!data) continue;
    const carrier = handles.get(ship); if (!carrier || !carrier.generation) throw Error('Missing authored drone carrier');
    launchers.push({ carrier, system: index + 1, config: compileRustDroneConfig(ship, data, template(ship, data, index + 1),
      system.definition.sourceIds[0] === 'drone_sensor') });
  }
  return { launchers };
}
