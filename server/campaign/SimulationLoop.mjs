import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { finite, identifier, immutableJSON, requireThat } from '../../src/campaign/core/Values.mjs';
import { LOGISTICS_MAX_TICKS } from '../../src/campaign/rules/OriginalLogisticsStep.mjs';

/** Runs beside the repository in its owning Worker. No clocks resume merely by opening a save. */
export class CampaignSimulationLoop {
  #store; #now; #intervalMs; #timer = null; #worlds = new Map(); #closed = false;
  constructor(store, { now = () => performance.now(), intervalMs = 50 } = {}) {
    finite(intervalMs, 'scheduler interval', 1, 60000);
    this.#store = store; this.#now = now; this.#intervalMs = intervalMs;
  }
  #result(id) {
    const state = this.#worlds.get(id);
    return immutableJSON({ worldId: id, status: state.status, tick: state.tick, pendingTicks: state.pendingMs * state.rate / 1000,
      error: state.error, epoch: this.#store.epoch });
  }
  start(worldId) {
    requireThat(!this.#closed, 'STORE_CLOSED', 'Simulation loop is closed'); identifier(worldId);
    const world = this.#store.read(worldId);
    requireThat(world.rules.providers.simulation?.capabilities.includes('world-clock-writer'), 'RULE_CAPABILITY', 'World has no simulation provider');
    if (this.#worlds.get(worldId)?.status === 'running') return this.#result(worldId);
    this.#worlds.set(worldId, { status: 'running', tick: world.clock.tick, rate: world.clock.ticksPerSecond,
      last: finite(this.#now(), 'monotonic time', 0), pendingMs: 0, error: null });
    if (this.#timer === null) { this.#timer = setInterval(() => this.pulse(), this.#intervalMs); this.#timer.unref(); }
    return this.#result(worldId);
  }
  #idleTimer() {
    if (![...this.#worlds.values()].some(s => s.status === 'running') && this.#timer !== null) { clearInterval(this.#timer); this.#timer = null; }
  }
  #pulseWorld(worldId, state) {
    if (state.status !== 'running') return;
    try {
      const now = finite(this.#now(), 'monotonic time', state.last);
      state.pendingMs += now - state.last; state.last = now;
      const ticks = Math.floor(state.pendingMs * state.rate / 1000);
      // Sleep, stalls or unsupported mechanics pause visibly; never silently drop time or drain offline resources.
      requireThat(ticks <= LOGISTICS_MAX_TICKS, 'SIMULATION_LAG', 'Simulation fell behind; explicit resume is required without offline catch-up');
      if (ticks < 1) return;
      const world = this.#store.read(worldId);
      const command = { worldId, epoch: this.#store.epoch, requestId: `simulation:${randomUUID()}`, type: 'world.advance',
        payload: { fromTick: world.clock.tick, ticks }, expected: [] };
      const receipt = this.#store.execute({ kind: 'system', id: 'campaign-scheduler' }, command);
      state.tick = receipt.result.tick; state.pendingMs = Math.max(0, state.pendingMs - ticks * 1000 / state.rate);
    } catch (error) {
      state.status = 'error'; state.error = { code: error.code ?? 'SIMULATION_FAILURE', message: error.message ?? String(error) };
    }
  }
  /** Public for deterministic hosts/tests; only this Worker owns access to the database. */
  pulse() {
    if (this.#closed) return;
    for (const [worldId, state] of this.#worlds) this.#pulseWorld(worldId, state);
    this.#idleTimer();
  }
  status(worldId) {
    identifier(worldId);
    if (!this.#worlds.has(worldId)) {
      const world = this.#store.read(worldId);
      return immutableJSON({ worldId, status: 'stopped', tick: world.clock.tick, pendingTicks: 0, error: null, epoch: this.#store.epoch });
    }
    return this.#result(worldId);
  }
  stop(worldId) {
    requireThat(!this.#closed, 'STORE_CLOSED', 'Simulation loop is closed');
    const state = this.#worlds.get(identifier(worldId));
    if (!state) return this.status(worldId);
    this.#pulseWorld(worldId, state);
    if (state.status === 'running') state.status = 'stopped';
    this.#idleTimer(); return this.#result(worldId);
  }
  close() {
    if (this.#closed) return;
    for (const worldId of this.#worlds.keys()) this.stop(worldId);
    if (this.#timer !== null) clearInterval(this.#timer);
    this.#timer = null; this.#closed = true;
  }
}
