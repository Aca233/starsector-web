import { shipSystemDefinitions } from '../extensions/ship-systems/Registry';
import type { ShipSystemDefinition } from '../extensions/ship-systems/Types';
import type { RustEcsBridge } from '../runtime/rust/RustEcsBridge';
import type {
  BlueprintAtomicActionSpec,
  SelfRegisteringCapabilityBlueprint,
  ShipBlueprint,
} from './ShipBlueprint';

const registeredCustomCapabilities = new Map<string, SelfRegisteringCapabilityBlueprint>();

/**
 * Self-Registering Capability Plugin Host.
 * Eliminates scattered edits across 4+ global files (`Registry.ts`, `Loadout.ts`,
 * `RustContentCompiler.ts`, `HullInspection.tsx`) when adding a new ship system or mechanic.
 */
export function registerSelfContainedCapability(
  capability: SelfRegisteringCapabilityBlueprint
): ShipSystemDefinition | null {
  if (!capability.id || !capability.name) {
    throw new Error('Self-registering capability requires a non-empty id and name.');
  }
  registeredCustomCapabilities.set(capability.id, capability);

  if (capability.kind === 'SHIP_SYSTEM') {
    const existing = shipSystemDefinitions.get(capability.id);
    if (existing) {
      return existing;
    }

    const definition: ShipSystemDefinition = {
      id: capability.id,
      sourceIds: [capability.id.toLowerCase()],
      name: capability.name,
      description: capability.description,
      chargeUp: capability.chargeUp ?? 0.2,
      active: capability.active ?? 2.5,
      chargeDown: capability.chargeDown ?? 0.3,
      cooldown: capability.cooldown ?? 8.0,
      charges: capability.charges,
      chargeRegen: capability.chargeRegen,
      fluxPerUseFlat: capability.fluxPerUseFlat ?? 0,
      fluxPerUseFraction: capability.fluxPerUseFraction ?? 0,
      hardFlux: capability.hardFlux ?? false,
      toggle: capability.toggle ?? false,
    };

    shipSystemDefinitions.register(definition);
    return definition;
  }

  return null;
}

/**
 * Automatically discovers and registers all inline capabilities declared inside a ShipBlueprint.
 */
export function registerBlueprintCapabilities(blueprint: ShipBlueprint): string[] {
  const registeredIds: string[] = [];
  if (!blueprint.capabilities) return registeredIds;

  for (const cap of blueprint.capabilities) {
    registerSelfContainedCapability(cap);
    registeredIds.push(cap.id);
  }
  return registeredIds;
}

/**
 * Dispatches a capability's atomic physics actions directly to the Rust ECS Command Queue
 * (16-byte fixed binary commands) without requiring custom Rust closures.
 */
export function dispatchCapabilityAtomicActions(
  bridge: RustEcsBridge,
  shipEcsIndex: number,
  shipX: number,
  shipY: number,
  shipRotRad: number,
  shipTeam: number,
  actions: readonly BlueprintAtomicActionSpec[]
): number {
  let dispatched = 0;
  for (const action of actions) {
    switch (action.kind) {
      case 'APPLY_FORCE': {
        const mag = action.magnitude ?? 1200;
        const angle = shipRotRad + ((action.angleOffsetDeg ?? 0) * Math.PI) / 180;
        bridge.applyForce(shipEcsIndex, Math.cos(angle) * mag, Math.sin(angle) * mag, 0);
        dispatched += 1;
        break;
      }
      case 'RADIAL_FORCE': {
        bridge.emitRadialForce(shipX, shipY, action.magnitude ?? 2500);
        dispatched += 1;
        break;
      }
      case 'SET_TIME_SCALE': {
        bridge.setTimeScale(shipEcsIndex, action.magnitude ?? 2.0);
        dispatched += 1;
        break;
      }
      case 'SET_COLLISION_MASK': {
        bridge.setCollisionMask(shipEcsIndex, action.magnitude ?? 0);
        dispatched += 1;
        break;
      }
      case 'SPAWN_PROJECTILE': {
        const speed = 850;
        const angle = shipRotRad + ((action.angleOffsetDeg ?? 0) * Math.PI) / 180;
        bridge.spawnProjectile(
          shipX + Math.cos(angle) * 40,
          shipY + Math.sin(angle) * 40,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          6,
          action.magnitude ?? 300,
          2.5,
          shipTeam
        );
        dispatched += 1;
        break;
      }
      default:
        break;
    }
  }
  return dispatched;
}

export function getRegisteredCustomCapability(
  id: string
): SelfRegisteringCapabilityBlueprint | undefined {
  return registeredCustomCapabilities.get(id);
}
