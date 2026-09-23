import type { CombatEngine } from '../simulation/CombatEngine';
import type { AIPhaseBatch } from '../ai/multicore/Types';
import type { CombatStepSpan } from '../diagnostics/CombatStepProfiler';

/** Shared single-player / LAN authoritative tick owner. No renderer, wall clock or browser dependencies.
 * This is not a restorable checkpoint; engine access remains a legacy edit adapter.
 * Fixed-step ordering and damage-lab semantics are deliberately unchanged.
 */
export class CombatAuthority {
  private advancing = false;
  private _tick = 0;
  private _epoch = 1;
  constructor(private _engine: CombatEngine) {}
  get engine(): CombatEngine { return this._engine; }
  get tick(): number { return this._tick; }
  get epoch(): number { return this._epoch; }
  /** Call only after the host has discarded its in-flight prediction. */
  beginEpoch(engine = this._engine): void {
    if (this.advancing) throw new Error('Cannot replace a running combat authority');
    this._engine = engine; this._tick = 0; this._epoch++;
  }
  advance(dt: number, damageEnabled = true, aiBatch?: AIPhaseBatch, trace?: CombatStepSpan): void {
    if (this.advancing) throw new Error('Reentrant authoritative combat tick');
    if (!(dt > 0) || !Number.isFinite(dt)) throw new Error('Invalid combat timestep');
    this.advancing = true;
    try {
      this.advanceEngine(dt, damageEnabled, aiBatch, trace);
      this._tick++;
    } finally { this.advancing = false; }
  }
  private advanceEngine(dt: number, damageEnabled: boolean, aiBatch?: AIPhaseBatch, trace?: CombatStepSpan): void {
    const engine = this._engine;
    const protectedShips = damageEnabled
      ? null
      : engine.ships.map((ship) => ({
          ship,
          hullHp: ship.hullHp,
          hullDamageSuppressed: ship.hullDamageSuppressed,
          isDead: ship.isDead,
          armor: ship.armor.copyCells(),
          softFlux: ship.flux.softFlux,
          hardFlux: ship.flux.hardFlux,
          overloaded: ship.flux.isOverloaded,
          overloadTimer: ship.flux.overloadTimer
        }));
    const protectedStats = damageEnabled ? null : {
      player: { ...engine.statsTracker.playerStats },
      enemy: { ...engine.statsTracker.enemyStats },
      battleResult: engine.battleResult
    };

    // Suppress damage callbacks while the lab temporarily applies/restores armor.
    // Existing heat still advances; ignored hits create neither decals nor visual RNG draws.
    if (protectedShips) for (const { ship } of protectedShips) { ship.damageDecals.suppressed = true; ship.hullDamageSuppressed = true; }
    try {
      engine.fixedUpdate(dt, { suppressDestructionSideEffects: !damageEnabled, aiBatch, trace });
    } finally {
      trace?.mark('sessionRestore');
      if (protectedShips) for (const { ship, hullDamageSuppressed } of protectedShips) { ship.damageDecals.suppressed = false; ship.hullDamageSuppressed = hullDamageSuppressed; }
    }

    if (protectedShips) {
      for (const snapshot of protectedShips) {
        snapshot.ship.hullHp = snapshot.hullHp;
        snapshot.ship.isDead = snapshot.isDead;
        snapshot.ship.armor.replaceCells(snapshot.armor);
        snapshot.ship.armor.dirtyVersion++;
        snapshot.ship.flux.softFlux = snapshot.softFlux;
        snapshot.ship.flux.hardFlux = snapshot.hardFlux;
        snapshot.ship.flux.isOverloaded = snapshot.overloaded;
        snapshot.ship.flux.overloadTimer = snapshot.overloadTimer;
      }
    }
    if (protectedStats) {
      engine.statsTracker.playerStats = protectedStats.player;
      engine.statsTracker.enemyStats = protectedStats.enemy;
      engine.battleResult = protectedStats.battleResult;
    }
  }
}
