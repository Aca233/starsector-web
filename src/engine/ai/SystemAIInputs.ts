import type { Ship } from '../simulation/Ship';
import { nativeFireControlPrototypes, nativeGetMotionStats } from '../simulation/Ship';
import type { ShipSystem } from '../simulation/ShipSystem';
import { nativeSystemAIInputDependencies } from '../extensions/ship-systems/Registry';
import type { TacticalWorld } from './TacticalWorld';
import type { CombatEngine } from '../simulation/CombatEngine';
import { FireControlQueryRoster } from './FireControlQueryBatch';

export const systemAIInputWork = { spans: 0, deferredCorridors: 0, eagerCorridors: 0, queriedCorridors: 0 };
const inputWorlds = new WeakMap<TacticalWorld, { span: SystemAIInputSpan; ships: readonly Ship[];
  asteroids: TacticalWorld['asteroids']; hulks: TacticalWorld['hulkFragments'] }>();
// An accessor is NOT the same as an absent optional field. Do not invoke it.
const unknownDescriptor = Symbol('unknown system AI input descriptor');
const dataValue = (object: object, key: PropertyKey) => {
  const d = Object.getOwnPropertyDescriptor(object, key);
  return !d ? undefined : 'value' in d ? d.value : unknownDescriptor;
};

const hasOnlyDataProperties = (object: object): boolean => {
  for (const key of Object.keys(object)) {
    const d = Object.getOwnPropertyDescriptor(object, key);
    if (d && !('value' in d)) return false;
  }
  return true;
};

/** Separate effects permission, NEVER a geometry/phase/stat snapshot. Only the
 * actual private Worker native decision phase can bind worlds. Native callbacks
 * may change phase/resources freely: an actual query always reads the LIVE world.
 * Unknown receipts revoke permission before executing. Not a sandbox for arbitrary
 * same-realm interception of a registered private Worker. */
export class SystemAIInputSpan {
  private stage: 'planning' | 'effects' | 'closed' = 'planning';
  private readonly identities: readonly Ship[];
  private constructor(private readonly ships: readonly Ship[]) { this.identities = ships.slice(); }
  static create(owner: CombatEngine, ships: readonly Ship[]): SystemAIInputSpan | undefined {
    if (import.meta.env?.VITE_COMBAT_SYSTEM_INPUTS === 'false' || !FireControlQueryRoster.isWorkerOwned(owner)) return;
    return new SystemAIInputSpan(ships);
  }
  bind(world: TacticalWorld, original: TacticalWorld): void {
    if (this.stage !== 'planning' || dataValue(world, 'ships') !== this.ships
      || !hasOnlyDataProperties(original)
      || dataValue(original, 'noteNavigationObstacle') !== undefined) return;
    inputWorlds.set(world, { span: this, ships: this.ships,
      asteroids: dataValue(world, 'asteroids'), hulks: dataValue(world, 'hulkFragments') });
  }
  beginEffects(): void {
    if (this.stage === 'closed') return;
    if (this.stage !== 'planning') throw new Error('System AI input span already executed');
    // The native phase admits authored system/defense callbacks, not arbitrary
    // updates. No dynamic permission carries into another phase/tick.
    if (!nativeFireControlPrototypes() || this.ships.length !== this.identities.length
      || !this.ships.every((s, i) => s === this.identities[i] && s.hasExactThreatPhaseHooks
        && s.runtimeModifiers.empty && s.getMotionStats === nativeGetMotionStats)) {
      this.close(); return;
    }
    this.stage = 'effects'; systemAIInputWork.spans++;
  }
  get active(): boolean { return this.stage === 'effects'; }
  close(): void { this.stage = 'closed'; }
}

/** Unknown consumers keep the old eager evaluation at its original position in
 * the context literal. Audited consumers receive a REAL lazy field, never a fake
 * safety value. A demanded query is memoized only within this one callback input. */
export function withSystemForwardInput<T extends object>(before: T, system: ShipSystem, world: TacticalWorld, query: () => boolean): T & { readonly forwardClear: boolean } {
  const bound = inputWorlds.get(world);
  const deferred = !!bound?.span.active && nativeSystemAIInputDependencies(system.definition)?.forwardClear === false
    && dataValue(world, 'ships') === bound.ships && dataValue(world, 'asteroids') === bound.asteroids
    && dataValue(world, 'hulkFragments') === bound.hulks && dataValue(world, 'noteNavigationObstacle') === undefined;
  if (!deferred) {
    systemAIInputWork.eagerCorridors++; systemAIInputWork.queriedCorridors++;
    return Object.defineProperty(before, 'forwardClear', { enumerable: true, configurable: true, writable: true, value: query() }) as T & { readonly forwardClear: boolean };
  }
  systemAIInputWork.deferredCorridors++;
  let value: boolean | undefined;
  return Object.defineProperty(before, 'forwardClear', { enumerable: true, configurable: true, get() {
    if (!bound.span.active) throw new Error('Closed system AI input span');
    if (value === undefined) { systemAIInputWork.queriedCorridors++; value = query(); }
    return value;
  } }) as T & { readonly forwardClear: boolean };
}
