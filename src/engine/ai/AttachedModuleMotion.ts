import { isNativeEnginePlanningWorld } from '../simulation/CombatEngine';
import { ShipSystem } from '../simulation/ShipSystem';
import { EngineController } from '../simulation/systems/EngineController';
import { RuntimeCombatModifiers } from '../extensions/RuntimeCombatModifiers';
import type { CombatEngine } from '../simulation/CombatEngine';
import { Ship, hasNativeMotionBoundary, nativeFireControlPrototypes, nativeGetMotionStats } from '../simulation/Ship';
import { isImmutableMetadata } from '../extensions/Immutable';
import { installedHullMods } from '../extensions/HullMods';
import { shipSystemDefinitions } from '../extensions/ship-systems/Registry';
import type { ShipSpec } from '../content/ShipSpec';
import type { TacticalWorld } from './TacticalWorld';
import { decisionReadsFor } from './DecisionReadPlane';
import { FireControlQueryRoster } from './FireControlQueryBatch';
import type { SteeringCommand } from './SteeringKernel';

export const attachedModuleWork = { spans: 0, attachedPlans: 0, factoryBindings: 0, reusedMembers: 0 };
export const attachedModuleControls: Readonly<SteeringCommand> = Object.freeze({ turnInput: 0, throttle: 0, strafeInput: 0, brakeInput: false });
const none = shipSystemDefinitions.require('NONE');
const noCombatHooks = new WeakMap<ShipSpec, boolean>();
function hasNoCombatHooks(spec: ShipSpec): boolean {
  if (!isImmutableMetadata(spec)) return false;
  let known = noCombatHooks.get(spec);
  if (known === undefined) { known = installedHullMods(spec).every(mod => !mod.advanceCombat); noCombatHooks.set(spec, known); }
  return known;
}
const data = (object: object, key: string): unknown => {
  const d = Object.getOwnPropertyDescriptor(object, key);
  return d && 'value' in d ? d.value : undefined;
};
const nativeShipKeys = Object.getOwnPropertyNames(Ship.prototype).filter(key => key !== 'constructor');
const engineSurface = Object.getOwnPropertyDescriptors(EngineController.prototype);
const engineKeys = Object.keys(engineSurface).filter(key => key !== 'constructor');
const systemKeys = Object.getOwnPropertyNames(ShipSystem.prototype).filter(key => key !== 'constructor');
const modifierKeys = Object.getOwnPropertyNames(RuntimeCombatModifiers.prototype).filter(key => key !== 'constructor');
function nativeEngineSurface(): boolean {
  return engineKeys.every(key => {
    const d = Object.getOwnPropertyDescriptor(EngineController.prototype, key), original = engineSurface[key];
    return d?.value === original.value && d?.get === original.get && d?.set === original.set;
  });
}
function nativeMember(ship: Ship): boolean {
  return Object.getPrototypeOf(ship) === Ship.prototype && nativeShipKeys.every(key => !Object.hasOwn(ship, key))
    && ['spec', 'system', 'systems', 'defenseSystem', 'runtimeModifiers', 'statusEffects', 'shield', 'weaponControl', 'engineController', 'armor', 'flux'].every(key => {
      const d = Object.getOwnPropertyDescriptor(ship, key); return !!d && 'value' in d;
    }) && Object.getPrototypeOf(ship.engineController) === EngineController.prototype
    && engineKeys.every(key => !Object.hasOwn(ship.engineController, key))
    && Object.getPrototypeOf(ship.runtimeModifiers) === RuntimeCombatModifiers.prototype
    && modifierKeys.every(key => !Object.hasOwn(ship.runtimeModifiers, key))
    && ship.allSystems.every(system => Object.getPrototypeOf(system) === ShipSystem.prototype
      && systemKeys.every(key => !Object.hasOwn(system, key)))
    && ship.hasOwnedLocalThreatUpdate && ship.runtimeModifiers.empty && hasNoCombatHooks(ship.spec);
}
const bindings = new WeakMap<TacticalWorld, AttachedModuleMotionSpan>();

/** Capability for skipping UNUSED self-movement work, not skipping module AI.
 * Actual private Worker + synchronous native decision plane only. Unknown hooks,
 * sampled whole-AI profiles and caller-built worlds retain the full solver. */
export class AttachedModuleMotionSpan {
  private open = true;
  private readonly nativeWorlds = new WeakSet<TacticalWorld>();
  private readonly admitted: Set<Ship>;
  private constructor(private readonly owner: CombatEngine, private readonly ships: readonly Ship[]) { this.admitted = new Set(ships); }
  static create(owner: CombatEngine, ships: readonly Ship[]): AttachedModuleMotionSpan | undefined {
    if (import.meta.env?.VITE_COMBAT_ATTACHED_MODULE_AI === 'false' || !FireControlQueryRoster.isWorkerOwned(owner)
      || owner.aiDecisionProfile !== 'standard' || !nativeEngineSurface() || !nativeFireControlPrototypes() || !ships.every(nativeMember)) return;
    attachedModuleWork.spans++;
    return new AttachedModuleMotionSpan(owner, ships);
  }
  bind(world: TacticalWorld, original: TacticalWorld): void {
    if (!this.open || !decisionReadsFor(world)?.scalar || data(world, 'ships') !== this.ships
      || !isNativeEnginePlanningWorld(original,this.owner) && Object.values(Object.getOwnPropertyDescriptors(original)).some(d => !('value' in d))
      || original.asteroids !== this.owner.asteroids || original.hulkFragments !== this.owner.hulkFragments
      || original.projectiles !== this.owner.projectiles || original.beams !== this.owner.beams
      || original.noteNavigationObstacle !== undefined || original.friendlyFireLaneIndex !== undefined) return;
    if(isNativeEnginePlanningWorld(original,this.owner)){this.nativeWorlds.add(world);attachedModuleWork.factoryBindings++;}
    bindings.set(world, this);
  }
  accepts(ship: Ship, world: TacticalWorld): boolean {
    const parent = data(ship, 'parentShip'), mount = data(ship, 'moduleMount');
    if (!parent || !mount) return false;
    if (!this.open || world.ships !== this.ships || !decisionReadsFor(world)?.active
      || this.owner.aiDecisionProfile !== 'standard' || !this.admitted.has(ship)
      || !this.nativeWorlds.has(world) && !nativeMember(ship)) return false;
    if(this.nativeWorlds.has(world))attachedModuleWork.reusedMembers++;
    return !!parent && parent instanceof Ship && this.ships.includes(parent) && !!mount && typeof mount === 'object'
      && isImmutableMetadata(mount) && !ship.isStation && !ship.spec.sourceHullTraits?.includes('INDEPENDENT_ROTATION')
      && ship.getMotionStats === nativeGetMotionStats && hasNativeMotionBoundary(ship)
      && !!decisionReadsFor(world)?.canScoreVectors([ship.pos, ship.vel])
      && ship.allSystems.every(system => data(system, 'definition') === none);
  }
  close(): void { this.open = false; }
}
export function attachedModuleMotion(ship: Ship, world: TacticalWorld): boolean {
  const accepted = bindings.get(world)?.accepts(ship, world) ?? false;
  if (accepted) attachedModuleWork.attachedPlans++;
  return accepted;
}
