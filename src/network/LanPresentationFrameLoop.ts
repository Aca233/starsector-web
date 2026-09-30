import type { CombatViewport } from '../engine/runtime/CombatViewport';
import type { RenderCanvas } from '../engine/render/RenderSurface';
import type { PlayerInput } from './protocol';
import type { LanPresentationRuntime } from './LanPresentationRuntime';

export interface LanFrameLayout { viewport: CombatViewport; immediate: boolean }
export interface LanFrameActivity {
  launched: boolean; running: boolean; active: boolean;
  projectilesActive: boolean; fireActive: boolean;
  layers: ReadonlySet<string>; damageEnabled: boolean;
}
/** Small completion notification, never a serialized display world. */
export interface LanFrameCompletion {
  applyMs: number; renderMs: number; gapMs: number; playbackDelay: number;
  tick: number; appliedFrames: number; reset: boolean; drawn: boolean; dt: number; hudZoom: number;
}
export interface LanFrameClock {
  request(callback: (now: number) => void): number;
  cancel(id: number): void;
}
export interface LanFrameHooks {
  /** All hooks run synchronously in the render owner's realm, not over RPC. */
  readLayout(): LanFrameLayout | null;
  synchronize?(now: number, tick: number): void;
  readActivity(now: number): LanFrameActivity;
  readInput(viewport: CombatViewport): PlayerInput;
  onFrame?(frame: LanFrameCompletion): void;
  onError(error: unknown): void;
}
function synchronous(value: unknown): void {
  if (value && typeof (value as Promise<unknown>).then === 'function') {
    void Promise.resolve(value).catch(() => {});
    throw Error('LAN frame hooks must be synchronous');
  }
}
function checkedLayout(layout: LanFrameLayout): void {
  const view = layout?.viewport, rect = view?.rect;
  if (!view || !rect || typeof layout.immediate !== 'boolean'
    || !Number.isSafeInteger(view.width) || !Number.isSafeInteger(view.height) || view.width < 1 || view.height < 1
    || ![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0)
    throw Error('Invalid LAN frame viewport');
}
function checkedActivity(activity: LanFrameActivity): void {
  if (!activity || [activity.launched, activity.running, activity.active, activity.projectilesActive,
    activity.fireActive, activity.damageEnabled].some(value => typeof value !== 'boolean') || !activity.layers)
    throw Error('Invalid LAN frame activity');
}

/** Autonomous RAF beside the actual receive/restore/render owner. Does not
 * generate/send inputs, grant network credits, own audio, or transfer worlds.
 * The caller keeps those policies and supplies current same-realm controls.
 * No setTimeout substitute: unsupported Worker RAF must select a safe canvas
 * fallback BEFORE transferring the canvas, not silently create another clock. */
export class LanPresentationFrameLoop {
  private readonly clock: LanFrameClock;
  private generation = 0;
  private ticket: { id: number; generation: number } | null = null;
  private preparing: Promise<boolean> | null = null;
  private wanted = false;
  private visible = true;
  private contextAvailable = true;
  private lastNow: number | undefined;
  private terminal: 'failed' | 'disposed' | null = null;
  private prepared = false;
  private frames = 0;

  constructor(private readonly runtime: LanPresentationRuntime, private readonly canvas: RenderCanvas,
    private readonly hooks: LanFrameHooks, clock?: LanFrameClock) {
    if (!clock && (typeof globalThis.requestAnimationFrame !== 'function' || typeof globalThis.cancelAnimationFrame !== 'function'))
      throw Error('Native presentation RAF is unavailable');
    this.clock = clock ?? {
      request: callback => globalThis.requestAnimationFrame(callback),
      cancel: id => globalThis.cancelAnimationFrame(id),
    };
  }
  get stats() {
    return { phase: this.terminal ?? (!this.wanted ? 'stopped' : !this.visible || !this.contextAvailable ? 'suspended'
      : this.preparing ? 'preparing' : 'running'), generation: this.generation,
      pendingFrames: this.ticket ? 1 : 0, frames: this.frames, visible: this.visible, contextAvailable: this.contextAvailable };
  }
  private assertActive(): void { if (this.terminal) throw Error('LAN frame loop is ' + this.terminal); }
  private current(generation: number): boolean {
    return !this.terminal && this.wanted && this.visible && this.contextAvailable && generation === this.generation;
  }
  private cancel(): void {
    ++this.generation;
    const ticket = this.ticket; this.ticket = null;
    this.preparing = null; this.prepared = false; this.lastNow = undefined;
    if (ticket) this.clock.cancel(ticket.id);
  }
  /** Call after the first frame has established the runtime world. Multiple
   * starts share readiness and cannot create parallel RAF chains. */
  start(): Promise<boolean> {
    this.assertActive(); this.wanted = true;
    return this.wake();
  }
  private wake(): Promise<boolean> {
    if (!this.wanted || !this.visible || !this.contextAvailable) return Promise.resolve(false);
    if (this.preparing) return this.preparing;
    if (this.prepared) { this.schedule(this.generation); return Promise.resolve(true); }
    const generation = this.generation;
    const pending = (async () => {
      try {
        await this.runtime.prepareAssets();
        if (!this.current(generation)) return false;
        this.prepared = true;
        this.schedule(generation);
        return !this.terminal;
      } catch (error) {
        // An old rejection must not destroy a newer reconnect/context owner.
        if (this.current(generation)) this.fail(error);
        return false;
      }
    })();
    this.preparing = pending;
    void pending.then(() => { if (this.preparing === pending) this.preparing = null; });
    return pending;
  }
  setVisible(visible: boolean): void {
    this.assertActive();
    if (typeof visible !== 'boolean') throw Error('Invalid presentation visibility');
    if (visible === this.visible) return;
    this.visible = visible; this.cancel();
    if (visible) void this.wake();
  }
  /** Wire these transitions to the renderer's real context lifecycle callbacks. */
  setContextAvailable(available: boolean): void {
    this.assertActive();
    if (typeof available !== 'boolean') throw Error('Invalid presentation context state');
    if (available === this.contextAvailable) return;
    this.contextAvailable = available; this.cancel();
    if (available) void this.wake();
  }
  private schedule(generation: number): void {
    if (!this.current(generation) || this.ticket) return;
    const ticket = { id: 0, generation }; this.ticket = ticket;
    try {
      ticket.id = this.clock.request(now => {
        // Cancellation also fences a callback already removed from the browser
        // queue. Never clear the ticket belonging to a newer generation.
        if (this.ticket !== ticket || !this.current(generation)) return;
        this.ticket = null;
        this.frame(now, generation);
      });
    } catch (error) { if (this.ticket === ticket) this.ticket = null; this.fail(error); }
  }
  private frame(now: number, generation: number): void {
    try {
      if (!Number.isFinite(now)) throw Error('Invalid presentation frame clock');
      const layout = this.hooks.readLayout(); synchronous(layout);
      if (!this.current(generation)) return;
      if (!layout) { this.lastNow = undefined; return; }
      checkedLayout(layout);
      const viewport = layout.viewport;
      if (this.canvas.width !== viewport.width) this.canvas.width = viewport.width;
      if (this.canvas.height !== viewport.height) this.canvas.height = viewport.height;
      const gapMs = this.lastNow === undefined ? 0 : Math.max(0, now - this.lastNow);
      const dt = Math.min(.05, gapMs / 1000);
      this.lastNow = now;
      let applyStarted = 0;
      const sample = this.runtime.applyPlayback(now, layout.immediate, undefined, () => { applyStarted = performance.now(); });
      const applyMs = sample.frames.length ? performance.now() - applyStarted : 0;
      synchronous(this.hooks.synchronize?.(now, this.runtime.appliedTick));
      if (!this.current(generation)) return;
      // Synchronization may revoke activity. Never sample it before endpoints.
      const activity = this.hooks.readActivity(now); synchronous(activity); checkedActivity(activity);
      if (!this.current(generation)) return;
      this.runtime.renderPose(now, () => {
        const input = this.hooks.readInput(viewport); synchronous(input);
        if (!this.current(generation)) throw Error('Presentation frame was revoked during input');
        return input;
      }, activity.active);
      if (!this.current(generation)) return;
      const controls = this.runtime.controls;
      controls.follow(this.runtime.world, sample.alpha, viewport, dt, activity.active);
      const renderStarted = performance.now();
      const drawn = this.runtime.drawPlayback(sample, now, {
        dt: activity.launched ? dt : 0, camera: controls.camera, zoom: controls.zoom,
        layers: activity.layers, damageEnabled: activity.damageEnabled,
      }, activity);
      const renderMs = performance.now() - renderStarted;
      this.frames++;
      synchronous(this.hooks.onFrame?.({ tick: this.runtime.appliedTick, appliedFrames: sample.frames.length,
        applyMs, renderMs, gapMs, playbackDelay: sample.delayMs,
        reset: sample.reset, drawn, dt: activity.launched ? dt : 0, hudZoom: controls.hudZoom(viewport) }));
    } catch (error) { if (this.current(generation)) this.fail(error); }
    finally { if (this.current(generation)) this.schedule(generation); }
  }
  /** Stops the clock and ingress capabilities, but keeps terminal endpoints and
   * confirmed effects, just like runtime.stop(). Explicit start may draw them. */
  stop(): void {
    this.assertActive(); this.wanted = false; this.cancel();
    try { this.runtime.stop(); } catch (error) { this.fail(error); }
  }
  /** Reconnect has no inherited sync evidence; the caller must retain a fresh
   * frame/session before starting again. No implicit network ACK is generated. */
  reset(): void {
    this.assertActive(); this.wanted = false; this.cancel();
    try { this.runtime.resetPlayback(); } catch (error) { this.fail(error); }
  }
  private fail(error: unknown): void {
    if (this.terminal) return;
    this.terminal = 'failed'; this.wanted = false; this.cancel();
    try { this.runtime.dispose(); } catch { /* retain the original failure */ } finally {
      // Error reporting is terminal; a reporting exception must not resurrect
      // the RAF chain or become an unhandled readiness-promise rejection.
      try { this.hooks.onError(error); } catch { /* owner already closed */ }
    }
  }
  dispose(): void {
    if (this.terminal === 'disposed') return;
    this.terminal = 'disposed'; this.wanted = false; this.cancel();
    this.runtime.dispose();
  }
}
