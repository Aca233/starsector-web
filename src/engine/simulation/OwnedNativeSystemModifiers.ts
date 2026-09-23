import { hasNativeSystemStats } from '../extensions/ship-systems/Registry';
import type { ShipSystemDefinition, SystemModifiers } from '../extensions/ship-systems/Types';
import type { ShipSystem, ShipSystemState } from './ShipSystem';

// This list is an audited dependency contract, NOT a claim that every native
// callback depends only on lifecycle state. PulseDrive/weapon plugins do not.
const scalarPrograms = new Set(['NONE', 'BURN_DRIVE', 'AMMO_FEED', 'HIGH_ENERGY_FOCUS', 'MANEUVERING_JETS', 'FORTRESS_SHIELD']);
const empty: SystemModifiers = Object.freeze({});

/** Per-system derived data, enabled only inside a closed, data-command runtime.
 * Keeps the original callback and arithmetic. No copied authoritative state,
 * tick cache, cross-world storage, or reflection in the query hot path. */
export class OwnedNativeSystemModifiers {
  private state?: ShipSystemState;
  private level = NaN;
  private retained = NaN;
  private capacity = NaN;
  private value: SystemModifiers = empty;

  static create(definition: ShipSystemDefinition): OwnedNativeSystemModifiers | undefined {
    if (!hasNativeSystemStats(definition) || !scalarPrograms.has(definition.id)) return undefined;
    return new OwnedNativeSystemModifiers(definition);
  }
  private constructor(private readonly definition: ShipSystemDefinition) {}

  read(system: ShipSystem, capacity: number): SystemModifiers {
    // The admitted definitions have no passive callback. Idle/NONE queries have
    // no dependencies: do not spend five comparisons validating an empty result.
    if (!this.definition.modifiers || !system.isActive) return empty;
    const state = system.state;
    const level = system.effectLevel, retained = system.retainedEffectLevel;
    if (this.state === state && Object.is(this.level, level)
      && Object.is(this.retained, retained) && Object.is(this.capacity, capacity)) return this.value;
    // Store only after evaluation succeeds; a failed evaluation cannot validate
    // stale data. OUT entry strength is independent of current effectLevel.
    const value = this.definition.modifiers(system, capacity, system.owner);
    this.state = state; this.level = level;
    this.retained = retained; this.capacity = capacity; this.value = value;
    return value;
  }
}
