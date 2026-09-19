import { needsLaunchers } from './Requirements';
import type { Ship } from '../../simulation/Ship';
import type { ShipSystem } from '../../simulation/ShipSystem';
import type { WeaponMountSlotConfig } from '../../content/ShipSpec';
import type { ShipSystemDefinition, SystemWorld } from './Types';

interface Burst { slot: WeaponMountSlotConfig; left: number; wait: number }
interface LauncherState { serial: number; bursts: Burst[] }
/** Native S weapon-system execution is independent of its charge tracker. */
export function systemWeaponLauncher(shots: number, emit: (ship: Ship, slot: WeaponMountSlotConfig, world: SystemWorld) => number): Pick<ShipSystemDefinition,'installReason'|'isExecuting'|'canActivate'|'onActivate'|'onAdvance'|'advanceAI'|'onReset'> {
  const states = new WeakMap<ShipSystem, LauncherState>();
  const executing = (system: ShipSystem) => {
    const state = states.get(system);
    return state?.serial === system.activationSerial && state.bursts.some(b => b.left > 0 || b.wait > 0);
  };
  return {
    isExecuting: executing, onReset:system=>{states.delete(system);},
  installReason: needsLaunchers,
    canActivate: ship => !!ship.spec.systemWeaponSlots?.length && !ship.isPhased,
    onActivate: (ship, world, system) => {
      if (ship.isDead || ship.hullHp <= 0 || ship.flux.isOverloaded || ship.flux.isVenting || ship.isPhased) return;
      const bursts = (ship.spec.systemWeaponSlots ?? []).map(slot => ({slot, left: shots - 1, wait: 0}));
      states.set(system, {serial: system.activationSerial, bursts});
      for (const burst of bursts) burst.wait = emit(ship, burst.slot, world);
    },
    onAdvance: (ship, dt, world, system) => {
      const state = states.get(system);
      if (!state || state.serial !== system.activationSerial) { states.delete(system); return; }
      if (ship.isDead || ship.hullHp <= 0 || ship.flux.isOverloaded || ship.flux.isVenting || ship.isPhased) { states.delete(system); return; }
      for (const burst of state.bursts) {
        burst.wait -= dt;
        while (burst.left > 0 && burst.wait <= 1e-9) { burst.wait += emit(ship, burst.slot, world); burst.left--; }
      }
      if (!executing(system)) states.delete(system);
    },
    advanceAI: ({ship, system = ship.system, tactical}) => {
      if ((tactical?.threat.imminentDamage ?? 0) <= 0 || system.isActive || system.isCoolingDown) return;
      if (system === ship.defenseSystem) ship.activateDefenseSystem(); else system.activate();
    },
  };
}
