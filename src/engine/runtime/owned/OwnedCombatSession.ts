import { contentRegistry } from '../../content/ContentRegistry';
import { LocalCombatKernel, type LocalCombatConfig, type LocalCombatCommand } from '../local/LocalCombatKernel';
import { CombatPresentationEncoder } from '../local/CombatPresentationEncoder';
import type { CombatControlSample } from '../CombatControl';
import type { ShipSystem } from '../../simulation/ShipSystem';

export interface OwnedCombatConfig extends Pick<LocalCombatConfig, 'playerHull' | 'enemyHull' | 'seed' | 'additionalShips'> {
  /** Default reference path. Native cache remains experimental until repeatable wins. */
  derivedStats?: 'reference' | 'native-cache';
}
export type OwnedCombatCommand = Exclude<LocalCombatCommand, { kind: 'deployment' }>;

/** Stage-one owned entry point over the REAL combat kernel. No mutable engine,
 * Ship, authority, config or callback capability crosses this API. It is opt-in;
 * the legacy game/Worker entry and its extension contract are unchanged.
 *
 * This is not a same-realm security sandbox. Content is loaded before creation;
 * installing a new global content snapshot while a session runs is unsupported.
 * Encounter/deployment/replay/Worker migration belong to subsequent stages. */
export class OwnedCombatSession {
  readonly #kernel: LocalCombatKernel;
  readonly #encoder = new CombatPresentationEncoder(1, 'render-strict');
  readonly #seen = new WeakSet<ShipSystem>();
  readonly #mode: 'reference' | 'native-cache';
  readonly #contentRevision: number;
  #nativeSystems = 0;
  #legacySystems = 0;
  #disposed = false;

  constructor(config: OwnedCombatConfig) {
    // Clone before any initialization; reject behavior functions and never install
    // caller-owned global content through this new boundary.
    const copy = structuredClone(config);
    if (!copy || Object.keys(copy).some(key => !['playerHull', 'enemyHull', 'seed', 'additionalShips', 'derivedStats'].includes(key))
      || (copy.derivedStats !== undefined && copy.derivedStats !== 'reference' && copy.derivedStats !== 'native-cache'))
      throw new Error('Unsupported owned combat configuration');
    this.#mode = copy.derivedStats ?? 'reference';
    this.#kernel = new LocalCombatKernel({ playerHull: copy.playerHull, enemyHull: copy.enemyHull,
      seed: copy.seed, additionalShips: copy.additionalShips, multicore: false });
    this.#contentRevision = contentRegistry.revision;
    this.admitSystems();
  }

  command(command: OwnedCombatCommand) {
    this.requireOpen();
    const copy = structuredClone(command);
    // Runtime guard as well as a TS exclusion: do not silently accept features
    // whose transaction/lifetime ownership has not been migrated yet.
    if (!copy || !['add-ship', 'tactical', 'clear-input', 'stop-firing', 'toggle-map', 'pilot', 'ship'].includes(copy.kind))
      throw new Error('Unsupported owned combat command');
    const result = this.#kernel.command(copy);
    this.admitSystems();
    return { ...result };
  }

  /** Exactly one existing 1/60 simulation step. Input is copied by the kernel.
   * Admission is timed as part of this call, not hidden in a benchmark fixture. */
  step(sample: CombatControlSample): void {
    this.requireOpen();
    this.admitSystems();
    this.#kernel.step(sample);
  }

  /** Explicit publication, separate from advancing time. Returned buffers/DTOs
   * belong to the consumer; mutation or transfer cannot modify combat state. */
  capturePresentation() {
    this.requireOpen();
    return structuredClone(this.#encoder.capture(this.#kernel.engine, this.#kernel.tick));
  }

  status() {
    this.requireOpen();
    return { tick: this.#kernel.tick, derivedStats: this.#mode,
      admittedNativeSystems: this.#nativeSystems, legacySystems: this.#legacySystems };
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#kernel.dispose();
  }

  private requireOpen(): void {
    if (this.#disposed) throw new Error('Owned combat session is closed');
    if (contentRegistry.revision !== this.#contentRevision) throw new Error('Content changed during owned combat; create a new session');
  }
  private admitSystems(): void {
    if (this.#mode === 'reference') return;
    // Newly launched craft can use the uncached real path during their first
    // tick. Admission changes only derived reads, never gameplay or ownership.
    for (const ship of this.#kernel.engine.ships) for (const system of ship.allSystems) {
      if (this.#seen.has(system)) continue;
      this.#seen.add(system);
      if (system.enableOwnedNativeModifiers()) this.#nativeSystems++;
      else this.#legacySystems++;
    }
  }
}
