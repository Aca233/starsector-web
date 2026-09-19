import { CombatSession } from '../engine/runtime/CombatSession';
import { Vector2 } from '../engine/math/Vector2';
import { clientToCombatWorld } from '../engine/runtime/PlayerControls';
import { sound } from '../engine/audio/SoundManager';
import { WeaponLoopAudio } from '../engine/audio/WeaponLoopAudio';
import { syncSystemAudio } from '../engine/audio/SystemAudio';
import { LabSimulation, LabClock, neutralInput } from './LabSimulation';
import type { LabConfig, LabAction } from './LabSimulation';
import { SimulationBridge } from './SimulationBridge';
import { PresentationEncoder } from './PresentationPacket';
import { captureLabAudio } from './LabAudio';
import type { LabSound } from './LabAudio';

export interface LabSample {
  intervalMs: number; drawMs: number; applyMs: number; packMs: number; simulationMs: number;
  tick: number; wallMs: number; packetBytes: number; inputToPresentationMs: number | null;
}
export class WorkerLabController {
  readonly simulation: LabSimulation;
  readonly session: CombatSession;
  readonly bridge: SimulationBridge | null;
  readonly ready: Promise<void>;
  readonly camera = new Vector2();
  zoom = .18;
  running = false;
  error = '';
  rows: LabSample[] = [];
  input = neutralInput();
  audioEnabled = false;
  private readonly clock: LabClock;
  private readonly audio = captureLabAudio();
  private readonly loops = new WeaponLoopAudio();
  private frameId = 0;
  private disposed = false;
  private lastFrame = 0;
  private lastTickAt = 0;
  private lastVisibleTime = 0;
  private sentInputs = new Map<number, number>();
  private inputLatency: number | null = null;
  private sequence = 0;
  private receivedInput = 0;
  private cleanupInput: () => void;
  constructor(readonly canvas: HTMLCanvasElement, readonly config: LabConfig, readonly backend: 'main' | 'worker', private changed: () => void) {
    this.simulation = new LabSimulation(config);
    this.session = new CombatSession('onslaught', 'onslaught', config.seed);
    this.session.engine = this.simulation.engine;
    this.session.playerAI = this.simulation.playerAI;
    this.session.visualOptions.cameraLocked = true;
    const pairs = config.ships / 2, columns = Math.min(5, pairs), rows = Math.ceil(pairs / 5);
    this.camera.set(((columns - 1) * 1000 + 500) / 2, (rows - 1) * 650 / 2);
    this.zoom = Math.min(canvas.clientWidth / (columns * 1000 + 200), canvas.clientHeight / (rows * 650 + 700));
    this.clock = new LabClock(() => { this.simulation.step(); this.lastTickAt = performance.now(); }, error => this.fail(String(error)));
    try { this.bridge = backend === 'worker' ? new SimulationBridge(config, message => this.fail(message)) : null; }
    catch (error) { this.audio.restore(); this.session.dispose(); throw error; }
    this.cleanupInput = this.bindInput();
    this.ready = this.initialize();
  }
  private async initialize(): Promise<void> {
    try {
      await this.bridge?.ready;
      if (this.disposed) return;
      this.bridge?.consume(this.session.engine);
      await this.session.prepare(this.canvas);
      if (this.disposed) return;
      this.session.start(); this.session.pause();
      this.frameId = requestAnimationFrame(this.frame);
      this.changed();
    } catch (error) { if (!this.disposed) this.fail(String(error)); throw error; }
  }
  private fail(message: string): void {
    if (this.disposed || this.error) return;
    this.error = message; this.running = false; this.clock.pause(); this.bridge?.dispose();
    cancelAnimationFrame(this.frameId); this.session.pause();
    this.loops.sync([], false, sound); syncSystemAudio(this.session.engine.playerShip.system, false); sound.stopLoop('flux_flush_loop');
    this.changed();
  }
  setRunning(value: boolean): void {
    if (this.disposed || this.error || (value && !this.session.isPresentationReady())) return;
    this.running = value;
    this.lastFrame = 0;
    if (value) { this.session.start(); this.resetMetrics(); }
    else { this.session.pause(); this.clearInput(); }
    if (this.bridge) this.bridge.running(value);
    else if (value) this.clock.start(); else this.clock.pause();
    this.changed();
  }
  toggleAutopilot(): void { this.input.autopilot = !this.input.autopilot; this.changed(); }
  toggleAudio(): void { this.audioEnabled = !this.audioEnabled; if (this.audioEnabled) void sound.preloadSounds(); this.changed(); }
  resetMetrics(): void { this.rows = []; this.lastFrame = 0; this.sentInputs.clear(); this.inputLatency = null; }
  action(action: LabAction): void {
    if (!this.running || this.error) return;
    if (this.bridge) this.bridge.action(action); else this.simulation.action(action);
  }
  private submitInput(): void {
    const input = { ...this.input, keys: { ...this.input.keys }, sequence: ++this.sequence };
    if (!this.bridge || this.bridge.input(input)) {
      if (!this.bridge) this.simulation.input = input;
      this.sentInputs.set(input.sequence, performance.now());
      if (this.sentInputs.size > 256) this.sentInputs.delete(this.sentInputs.keys().next().value!);
    }
  }
  private playEvents(events: LabSound[]): void {
    if (!this.audioEnabled || !this.running) return;
    for (const event of events) {
      if (event.pos) this.audio.playAtPos(event.key, new Vector2(...event.pos), this.camera, event.volume, event.rate);
      else this.audio.play(event.key, event.volume, event.rate);
    }
  }
  private frame = (now: number): void => {
    if (this.disposed || this.error) return;
    try {
      const engine = this.session.engine;
      if (!this.session.isPresentationReady()) {
        this.setRunning(false);
        if (this.session.getPresentationState().status === 'failed') throw new Error('WebGL 恢复失败；请重新开局');
        this.frameId = requestAnimationFrame(this.frame); return;
      }
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
      const height = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
      if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; }
      const update = this.bridge?.consume(engine);
      if (this.error) return;
      const latest = this.bridge?.latest;
      this.playEvents(update?.sounds ?? (this.bridge ? [] : this.audio.drain()));
      const inputMeasuredAt = performance.now();
      const inputSequence = latest?.inputSequence ?? this.simulation.appliedInput;
      if (inputSequence > this.receivedInput) {
        const sent = this.sentInputs.get(inputSequence);
        this.inputLatency = sent === undefined ? null : performance.now() - sent;
        this.receivedInput = inputSequence;
        for (const sequence of this.sentInputs.keys()) if (sequence <= inputSequence) this.sentInputs.delete(sequence);
      } else this.inputLatency = null;
      if (this.running) this.submitInput();
      const simulationMs = latest?.simulationMs ?? this.simulation.simulationMs;
      const stamp = this.bridge ? this.bridge.appliedAt : this.lastTickAt;
      // Interpolate only the last authoritative tick; never extrapolate unknown combat outcomes.
      const alpha = this.running ? Math.min(1, Math.max(0, (performance.now() - stamp) / Math.max(1000 / 60, simulationMs))) : 1;
      const visualTime = Math.max(0, engine.combatTime - (this.running ? (1 - alpha) / 60 : 0));
      this.session.visualClock.seek(visualTime);
      this.session.updateVisualOnly(Math.max(0, visualTime - this.lastVisibleTime));
      this.lastVisibleTime = visualTime;
      const start = performance.now();
      this.session.render(alpha, this.camera, this.zoom * dpr);
      const drawMs = performance.now() - start;
      if (this.inputLatency !== null) this.inputLatency += performance.now() - inputMeasuredAt;
      this.loops.sync(engine.ships, this.audioEnabled && this.running, sound);
      syncSystemAudio(engine.playerShip.system, this.audioEnabled && this.running);
      if (this.audioEnabled && this.running && engine.playerShip.flux.isVenting) sound.startLoop('flux_flush_loop', .65);
      else sound.stopLoop('flux_flush_loop');
      if (this.running && this.lastFrame) {
        this.rows.push({ intervalMs: now - this.lastFrame, drawMs, applyMs: update ? this.bridge!.applyMs : 0,
          packMs: update?.packMs ?? 0, simulationMs, tick: latest?.packet.tick ?? this.simulation.tick,
          wallMs: now, packetBytes: update ? update.packet.length * 8 : 0, inputToPresentationMs: this.inputLatency });
        if (this.rows.length > 3600) this.rows.shift();
      }
      this.lastFrame = now;
      this.frameId = requestAnimationFrame(this.frame);
    } catch (error) { this.fail(String(error)); }
  };
  report() {
    const rows = this.rows, elapsed = rows.reduce((sum, row) => sum + row.intervalMs, 0);
    const intervals = rows.map(row => row.intervalMs).sort((a, b) => a - b);
    const input = rows.flatMap(row => row.inputToPresentationMs === null ? [] : [row.inputToPresentationMs]).sort((a, b) => a - b);
    const progressElapsed = rows.length > 1 ? rows.at(-1)!.wallMs - rows[0].wallMs : 0;
    return { backend: this.backend, config: this.config, running: this.running, error: this.error,
      samples: rows.length, callbackHz: elapsed ? rows.length * 1000 / elapsed : 0,
      presentedTPS: progressElapsed ? (rows.at(-1)!.tick - rows[0].tick) * 1000 / progressElapsed : 0,
      intervalP95Ms: intervals[Math.floor(intervals.length * .95)] ?? 0,
      inputToPresentationP95Ms: input[Math.floor(input.length * .95)] ?? null,
      tick: this.bridge?.latest?.packet.tick ?? this.simulation.tick,
      applyMs: this.bridge?.applyMs ?? 0, packMs: this.bridge?.latest?.packMs ?? 0,
      droppedWallMs: this.bridge?.latest?.droppedWallMs ?? this.clock.droppedWallMs,
      droppedSounds: this.bridge?.latest?.droppedSounds ?? this.audio.dropped(),
      resolution: [this.canvas.width, this.canvas.height], dpr: devicePixelRatio, rows: [...rows] };
  }
  /** Paused diagnostic APIs: no renderer involvement in worker authority. */
  async advance(ticks: number): Promise<void> {
    if (!Number.isInteger(ticks) || ticks < 0 || ticks > 600) throw new Error('Invalid diagnostic step count');
    this.setRunning(false);
    if (this.bridge) await this.bridge.request('advance', ticks);
    else for (let i = 0; i < ticks; i++) { this.simulation.step(); if (i % 4 === 3) await new Promise(resolve => setTimeout(resolve, 0)); }
  }
  async inspect() {
    this.setRunning(false);
    if (this.bridge) return this.bridge.request('inspect');
    return { packet: new PresentationEncoder().capture(this.simulation.engine, this.simulation.tick),
      random: { ...this.simulation.engine.random }, visualRandom: { ...this.simulation.engine.visualRandom } };
  }
  private clearInput(): void { this.input.keys = {}; this.input.firing = false; this.input.pointerActive = false; this.submitInput(); }
  private bindInput(): () => void {
    const keys = (event: KeyboardEvent, pressed: boolean) => {
      if (event.target !== this.canvas) return;
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
      if (event.code === 'Tab' && pressed && !event.repeat) { this.input.autopilot = !this.input.autopilot; this.changed(); }
      if (!event.repeat && pressed) {
        const action = ({ KeyF: 'system', KeyV: 'vent', Digit1: 'group1', Digit2: 'group2', Digit3: 'group3' } as const)[event.code as 'KeyF'];
        if (action) this.action(action);
      }
      this.input.keys[event.code] = pressed;
    };
    const down = (event: KeyboardEvent) => keys(event, true), up = (event: KeyboardEvent) => keys(event, false);
    const move = (event: MouseEvent) => {
      const aim = clientToCombatWorld({ x: event.clientX, y: event.clientY }, this.canvas, this.camera, this.zoom * devicePixelRatio);
      this.input.aim = [aim.x, aim.y];
      this.input.pointerActive = true;
    };
    const mouseDown = (event: MouseEvent) => { this.canvas.focus(); move(event); if (event.button === 0) this.input.firing = true; if (event.button === 2) this.action(event.shiftKey ? 'hullShield' : 'shield'); };
    const mouseUp = () => { this.input.firing = false; };
    const leave = () => { this.input.pointerActive = false; this.input.firing = false; this.submitInput(); };
    const context = (event: Event) => event.preventDefault();
    const blur = () => this.clearInput();
    const visibility = () => { if (document.hidden) this.setRunning(false); };
    const wheel = (event: WheelEvent) => { event.preventDefault(); this.zoom = Math.max(.03, Math.min(2, this.zoom * (event.deltaY < 0 ? 1.1 : .9))); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('mouseup', mouseUp);
    window.addEventListener('blur', blur); document.addEventListener('visibilitychange', visibility);
    this.canvas.addEventListener('blur', blur); this.canvas.addEventListener('mousemove', move); this.canvas.addEventListener('mousedown', mouseDown);
    this.canvas.addEventListener('mouseleave', leave);
    this.canvas.addEventListener('contextmenu', context); this.canvas.addEventListener('wheel', wheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('mouseup', mouseUp);
      window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility);
      this.canvas.removeEventListener('blur', blur); this.canvas.removeEventListener('mousemove', move); this.canvas.removeEventListener('mousedown', mouseDown);
      this.canvas.removeEventListener('mouseleave', leave);
      this.canvas.removeEventListener('contextmenu', context); this.canvas.removeEventListener('wheel', wheel);
    };
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.clock.pause(); this.bridge?.dispose(); cancelAnimationFrame(this.frameId);
    this.cleanupInput(); this.loops.sync([], false, sound); syncSystemAudio(this.session.engine.playerShip.system, false);
    sound.stopLoop('flux_flush_loop'); this.audio.restore(); this.session.dispose();
  }
}



