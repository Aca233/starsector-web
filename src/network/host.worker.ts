import { FlowCounters } from './SnapshotFlow.mjs';
import { yieldHostTask } from './HostTaskYield';
import { HostAiBudget } from './HostAiBudget';
import { LanCombatMulticore } from '../engine/ai/multicore/LanCombatMulticore';
import type { AIPhaseBatch } from '../engine/ai/multicore/Types';
import type { HostMuzzleEvents } from './HostMuzzleEvents';
import { HostRecoveryBudget, LAN_SNAPSHOT_HZ } from "./SnapshotPolicy";
import type { HostPerformance } from "./SnapshotPolicy";
import config from "./protocol.json";
import { captureBattleReport } from "./CaptureBattleReport";
import { createLanWorld } from "./LanWorld";
import type { Ship } from "../engine/simulation/Ship";
import { CombatEngine } from "../engine/simulation/CombatEngine";
import { Vector2 } from "../engine/math/Vector2";
import { applyPlayerControls } from "../engine/runtime/PlayerControls";
import { DEFAULT_MOUSE_STEERING } from "../engine/runtime/CombatControlSettings";
import { dispatchShipCommand } from "../engine/runtime/CombatCommands";
import { sound } from "../engine/audio/SoundManager";
import type { CombatSound } from "./CombatSnapshot";
import { captureHostCombat, configureHostCosmetics } from "./HostSnapshot";
import { encodeProjectedBinaryFrame } from "./BinarySnapshot.mjs";
import { blankInput, KEY_CODES } from "./protocol";
import type { Match, PlayerInput, Seat, Action } from "./protocol";

// One authority step at a time, even while AI owners are running off-thread.
// Experimental AI owners are opt-in: default builds never construct a pool,
// sample parallel work or retry it later. The authority Worker itself stays on.
const multicore = import.meta.env.VITE_LAN_AI_WORKERS === 'true' ? new LanCombatMulticore() : null;
const aiBudget = new HostAiBudget();
let lifecycle = 0;
let steppingLifecycle: number | null = null;
let controlled = new Map<Seat, Ship>();
interface Controls {
  input: PlayerInput;
  received: number;
  acknowledged: number;
  lastAction: number;
  queued: Action[];
  connected: boolean;
  online: boolean; // Fresh-frame handshake completed; controls may be accepted.
}
const controls = new Map<Seat, Controls>();
const deploymentReplies = new Map<string, Record<string, unknown>>();
let captureMs = 0, encodeMs = 0;
let snapshotInFlight: number | null = null;
let muzzleEvents: HostMuzzleEvents | null = null;
const snapshotEncoder = new TextEncoder();
const recoveryBudget = new HostRecoveryBudget();
let engine: CombatEngine | null = null,
  tick = 0,
  running = false,
  last = 0,
  lastCallbackFinishedAt = 0,
  accumulator = 0;
let timer: ReturnType<typeof setInterval> | undefined;
let background = false, foregroundPending = false, backgroundThrottled = false, binarySnapshots = false;
let elapsedCost = 0,
  samples = 0,
  soundId = 0;
const sounds: CombatSound[] = [];
const queueSound = (
  key: string,
  volume: number,
  rate: number,
  pos?: [number, number],
) => {
  if (sounds.length < 64)
    sounds.push({ id: ++soundId, key, volume, rate, pos });
};
// Worker emits data-only one-shot events; each client plays them at its own listener position.
sound.play = (key, volume = 0.8, rate = 1) => {
  queueSound(key, volume, rate);
};
sound.playAtPos = (key, pos, _listener, volume = 0.8, rate = 1) => {
  queueSound(key, volume, rate, [pos.x, pos.y]);
};
const send = (message: unknown, transfer: Transferable[] = []) =>
  (self as unknown as { postMessage(message: unknown, transfer: Transferable[]): void }).postMessage(message, transfer);
const snapshotFlow = new FlowCounters(['simulated', 'produced', 'blocked']);
let lastSnapshotTick = -1;
let clockAt = 0, clockTick = 0, clockCombat = 0;
let realtimeRatio: number | undefined, combatRate: number | undefined;
let telemetryAt = 0, callbackGapMs = 0, lastStepMs = 0, maxStepMs = 0;
function measureClock(now: number) {
  const elapsed = now - clockAt;
  if (!running || !engine || elapsed < 2000) return;
  realtimeRatio = (tick - clockTick) * 1000 / 60 / elapsed;
  combatRate = (engine.combatTime - clockCombat) * 1000 / elapsed;
  clockAt = now; clockTick = tick; clockCombat = engine.combatTime;
}
function diagnostics(): HostPerformance & { multicore: LanCombatMulticore["status"] & { budget: HostAiBudget["status"] } } {
  const owners: LanCombatMulticore["status"] = multicore?.status ?? {
    mode: 'serial', reason: 'ai-workers-disabled', workers: 0, metrics: null,
  };
  return { flow: snapshotFlow.sample(), tick, callbackGapMs, lastStepMs, maxStepMs, backlogMs: accumulator,
    simulationMs: samples ? elapsedCost / samples : lastStepMs, captureMs, encodeMs, realtimeRatio, combatRate, multicore: { ...owners, reason: owners.workers || owners.reason !== "not-started" ? owners.reason : aiBudget.status.reason, budget: aiBudget.status } };
}
function snapshot(final = false) {
  if (tick !== lastSnapshotTick && !final && snapshotInFlight !== null) snapshotFlow.count('blocked');
  if (tick === lastSnapshotTick || (!final && snapshotInFlight !== null)) return;
  lastSnapshotTick = tick;
  if (engine) {
    const started = performance.now();
    const frame = captureHostCombat(
      engine,
      tick,
      Object.fromEntries(
        [...controls].map(([seat, state]) => [seat, state.acknowledged]),
      ),
      samples ? elapsedCost / samples : 0,
      muzzleEvents,
    );
    captureMs = captureMs * .7 + (performance.now() - started) * .3;
    frame.snapshotHz = LAN_SNAPSHOT_HZ;
    frame.captureMs = captureMs;
    frame.encodeMs = encodeMs;
    measureClock(performance.now());
    frame.realtimeRatio = realtimeRatio;
    frame.combatRate = combatRate;
    frame.sounds = sounds.splice(0);
    // Serialize once off the rendering thread. LAN transfers owned binary bytes;
    // Steam (and rare JSON-compatibility fallbacks) keeps the existing text path.
    const encodingStarted = performance.now();
    const binary = binarySnapshots ? encodeProjectedBinaryFrame(frame) : null;
    const json = binary ? undefined : JSON.stringify(frame);
    const bytes = binary?.byteLength ?? snapshotEncoder.encode(json!).byteLength;
    encodeMs = encodeMs * .7 + (performance.now() - encodingStarted) * .3;
    snapshotInFlight = tick;
    if (binary) send({ type: "snapshot", binary: binary.buffer, bytes, tick, encodeMs }, [binary.buffer]);
    else send({ type: "snapshot", json, bytes, tick, encodeMs });
    snapshotFlow.count("produced");
  }
  elapsedCost = 0;
  samples = 0;
}
function fail(error: unknown) {
  running = false;
  lifecycle++;
  multicore?.reset();
  if (timer) clearInterval(timer);
  send({
    type: "error",
    message: error instanceof Error ? error.message : String(error),
    diagnostics: diagnostics(),
  });
}
// Discard pending edges without letting their IDs replay after a new sync epoch.
function clearControls(state: Controls, ship: Ship) {
  state.lastAction = Math.max(state.lastAction, ...state.queued.map(action => action.id));
  state.input = { ...state.input, keys: 0, firing: false, pointerActive: false, actions: [] };
  state.queued = [];
  state.received = 0;
  ship.clearInput();
  if (state.connected) {
    engine?.externallyControlledShipIds.add(ship.id);
    applyPlayerControls(ship, {}, new Vector2(...state.input.aim), false, DEFAULT_MOUSE_STEERING, false);
  } else engine?.externallyControlledShipIds.delete(ship.id);
}
function recover(now: number, pauseMs: number, backgroundPause = false) {
  if (!recoveryBudget.allow(now, pauseMs, backgroundPause)) throw Error(backgroundPause
    ? "计算主机后台暂停超过 5 分钟，无法自动恢复。请重新开局。"
    : "计算主机持续过载或暂停过久，恢复失败。请降低战斗规模后重试。");
  accumulator = 0;
  sounds.length = 0;
  for (const [seat, state] of controls) {
    state.online = false;
    const ship = controlled.get(seat);
    if (ship) clearControls(state, ship);
  }
  send({ type: "recovered", pauseMs: Math.round(pauseMs), diagnostics: diagnostics() });
}
async function step() {
  if (!running || !engine || steppingLifecycle === lifecycle) return;
  const generation = lifecycle, authority = engine;
  steppingLifecycle = generation;
  const now = performance.now(),
    elapsed = now - last;
  last = now;
  callbackGapMs = elapsed;
  let steps = 0;
  let sliceStartedAt = now;
  try {
    const returningToForeground = foregroundPending;
    const backgroundPause = background || returningToForeground;
    foregroundPending = false;
    // elapsed includes our own previous physics/serialization work. Only the
    // idle interval AFTER that callback may be browser background throttling.
    const idleMs = Math.max(0, now - lastCallbackFinishedAt);
    if (backgroundPause && idleMs > 6 * (1000 / 60)) {
      const priorWorkMs = Math.max(0, elapsed - idleMs);
      const computeBacklog = accumulator + priorWorkMs;
      // Recover once per throttled period, not every 250/500/1000ms callback:
      // repeated recoveries otherwise reset sync forever without advancing tick.
      if (!backgroundThrottled || returningToForeground || idleMs > config.backgroundGraceMs)
        recover(now, idleMs, true);
      // Drop suspended wall time, but retain genuine compute backlog. Offer
      // at most one normal six-step batch so snapshots can complete the gate.
      accumulator = Math.max(computeBacklog, 6 * (1000 / 60));
      backgroundThrottled = background;
    } else {
      backgroundThrottled = false;
      if (elapsed > 1000) recover(now, elapsed);
      else accumulator += elapsed;
    }
    while (accumulator >= 1000 / 60 && steps < 6) {
      const start = performance.now();
      for (const [seat, ship] of controlled) {
        const state = controls.get(seat)!;
        if (!state.connected) continue;
        const fresh = state.online && performance.now() - state.received < 500,
          input = state.input;
        const keys: Record<string, boolean> = {};
        KEY_CODES.forEach((key, bit) => {
          keys[key] = fresh && !!(input.keys & (1 << bit));
        });
        applyPlayerControls(
          ship,
          keys,
          new Vector2(...input.aim),
          fresh && input.firing,
          DEFAULT_MOUSE_STEERING,
          fresh && input.pointerActive,
        );
        const queued = state.queued.splice(0);
        for (const action of queued) {
          if (action.id <= state.lastAction) continue;
          state.lastAction = action.id;
          if (!fresh) continue; // Expired edge commands must not fire after recovery.
          if (action.kind === 'group' || action.kind === 'mode' || action.kind === 'autofire') {
            dispatchShipCommand(ship, { kind: action.kind, value: action.value ?? 0 }, action.aim ? new Vector2(...action.aim) : undefined);
          } else dispatchShipCommand(ship, { kind: action.kind, ...(action.kind === 'system' ? {value: action.value ?? 0} : {}) }, action.aim ? new Vector2(...action.aim) : undefined, engine.ships);
        }
        if (state.online) state.acknowledged = input.seq;
      }
      let aiBatch: AIPhaseBatch | undefined;
      let usedOwners = false;
      try {
        // Only pure AI proposals leave the authority. No fixedUpdate is suspended
        // halfway through: physics, hits, spawning and destruction remain serial.
        const allowOwners = multicore !== null && aiBudget.allow(authority.capitalShips.length, performance.now());
        if (!allowOwners && multicore && multicore.status.workers > 0
          && ['small-fleet-serial', 'low-cost-serial'].includes(aiBudget.status.reason)) multicore?.reset();
        const pending = allowOwners && multicore ? multicore.prepare(authority, 1 / 60) : null;
        if (pending) { usedOwners = true; aiBatch = await pending; }
      } catch {
        // Owner failure/timeout is a serial fallback, not a dropped physics step.
      }
      if (generation !== lifecycle || !running || engine !== authority) {
        aiBatch?.finish();
        return;
      }
      try { authority.fixedUpdate(1 / 60, { aiBatch }); }
      finally { aiBatch?.finish(); }
      tick++;
      snapshotFlow.count('simulated');
      accumulator -= 1000 / 60;
      steps++;
      lastStepMs = performance.now() - start;
      if (multicore && aiBudget.record(lastStepMs, usedOwners, performance.now())) multicore?.reset();
      maxStepMs = Math.max(maxStepMs, lastStepMs);
      elapsedCost += lastStepMs;
      samples++;
      if (engine.isBattleResultReady) {
        snapshot(true);
        send({
          type: "finished",
          winner: engine.winningTeam ?? "draw",
          report: captureBattleReport(engine, controlled, tick),
        });
        running = false;
        multicore?.reset();
        if (timer) clearInterval(timer);
        timer = undefined;
        break;
      }
      // Only yield BETWEEN complete authority steps. Pending input/presence and
      // snapshot credits can then run before another expensive catch-up step.
      // Keep the original tick budget/publication cadence: yielding must not
      // add captures, lower the 60 Hz target, or discard simulation debt.
      if (accumulator >= 1000 / 60 && steps < 6 && performance.now() - sliceStartedAt >= 8) {
        await yieldHostTask();
        if (generation !== lifecycle || !running || engine !== authority) return;
        sliceStartedAt = performance.now();
      }
    }
    // Bounded catch-up: do not accumulate minutes of stale simulation after a slow host.
    if (accumulator > 250) recover(performance.now(), accumulator);
    // Fixed 60 Hz target: offer the newest completed physics tick on every
    // callback. Catch-up may coalesce ticks, and bounded decode/socket credits
    // still apply, but no CPU/fleet/backlog policy intentionally lowers the rate.
    if (running && tick > lastSnapshotTick) snapshot();
    const sampledAt = performance.now();
    measureClock(sampledAt);
    // Tiny independent telemetry remains available even when heavy snapshots are
    // deferred; a stale display tick must not be mistaken for stopped physics.
    if (sampledAt - telemetryAt >= 1000) {
      telemetryAt = sampledAt;
      send({ type: 'performance', ...diagnostics() });
      maxStepMs = 0;
    }
  } catch (error) {
    if (generation === lifecycle) fail(error);
  } finally {
    if (steppingLifecycle === generation) steppingLifecycle = null;
    if (generation === lifecycle) lastCallbackFinishedAt = performance.now();
  }
}
self.onmessage = (event: MessageEvent) => {
  try {
    const m = event.data;
    if (m.type === "init") {
      // Invalidates an outstanding plan before replacing any authoritative world.
      lifecycle++;
      running = false;
      if (timer) clearInterval(timer);
      timer = undefined;
      multicore?.reset();
      aiBudget.reset();
      background = m.hidden === true;
      binarySnapshots = m.binarySnapshots === true;
      foregroundPending = false;
      backgroundThrottled = false;
      const match = m.match as Match;
      const world = createLanWorld(match);
      engine = world.engine;
      muzzleEvents = configureHostCosmetics(engine);
      controlled = world.controlled;
      controls.clear();
      deploymentReplies.clear();
      for (const [seat, ship] of controlled) {
        // Match start requires all peers connected. Keep human ships neutral
        // until the relay grants controls; presence reconciles later departures.
        engine.externallyControlledShipIds.add(ship.id);
        applyPlayerControls(ship, {}, new Vector2(), false, DEFAULT_MOUSE_STEERING, false);
        controls.set(seat, {
          input: blankInput(),
          received: performance.now(),
          acknowledged: 0,
          lastAction: -1,
          queued: [],
          connected: true,
          online: false,
        });
      }
      tick = 0;
      snapshotFlow.reset();
      lastSnapshotTick = -1;
      snapshotInFlight = null;
      captureMs = encodeMs = 0;
      realtimeRatio = combatRate = undefined;
      telemetryAt = callbackGapMs = lastStepMs = maxStepMs = 0;
      snapshot();
      send({ type: "ready" });
    } else if (m.type === "visibility") {
      if (background && !m.hidden) foregroundPending = true;
      background = m.hidden === true;
    } else if (m.type === "deployment" && engine) {
      const key=m.seat+":"+m.requestId, cached=deploymentReplies.get(key);
      if(cached){send(cached);return;}
      const response:Record<string,unknown>={type:"deployment-result",seat:m.seat,requestId:m.requestId,ok:false};
      try{
        const ship=controlled.get(m.seat), control=controls.get(m.seat);
        if(!running||!ship||!control?.online)throw Error("当前玩家不能部署。");
        if(!Array.isArray(m.ids)||m.ids.length>128||m.ids.some((id:unknown)=>typeof id!=="string"))throw Error("无效舰船名单。");
        if(m.operation==='deploy')engine.deployment.deploy(m.ids,ship.teamId);
        else if(m.operation==='retreat'||m.operation==='withdraw'){
          if(m.ids.some((id:string)=>[...controlled].some(([seat,other])=>seat!==m.seat&&other.id===id)))throw Error("不能替其他真人玩家下达撤退。");
          engine.deployment.requestRetreat(m.ids,ship.teamId,m.operation==='withdraw');
        } else throw Error("未知舰队操作。");
        response.ok=true;
      }catch(error){response.message=error instanceof Error?error.message:String(error);}
      deploymentReplies.set(key,response);if(deploymentReplies.size>128)deploymentReplies.delete(deploymentReplies.keys().next().value!);
      send(response);

    } else if (m.type === "snapshot-consumed") {
      if (m.tick === snapshotInFlight) snapshotInFlight = null;
    } else if (m.type === "presence" && engine) {
      const state = controls.get(m.seat),
        ship = controlled.get(m.seat);
      if (!state || !ship) return;
      // Sync requests still need a fresh snapshot, but only real disconnection
      // releases the ship to AI. Connected/syncing peers keep neutral manual input.
      const connected = m.connected === true, online = connected && m.online === true;
      if (state.online === online && state.connected === connected) return;
      state.connected = connected;
      state.online = online;
      clearControls(state, ship);
    } else if (m.type === "input") {
      const state = controls.get(m.seat);
      if (!state || !state.online) return;
      const input = m.input as PlayerInput;
      if (input.seq <= state.input.seq) return;
      if (state.queued.length + input.actions.length > 64)
        throw Error("输入事件积压过多");
      state.input = input;
      state.received = performance.now();
      state.queued.push(...input.actions);
    } else if (m.type === "start" && engine) {
      // Initial launch and host resync both need a newly simulated frame; the
      // preload tick-0 snapshot may never have been sent to the relay.
      if (running) return;
      running = true;
      snapshotFlow.reset();
      last = lastCallbackFinishedAt = performance.now();
      clockAt = last; clockTick = tick; clockCombat = engine.combatTime;
      accumulator = 0;
      timer = setInterval(() => { void step(); }, 4);
    } else if (m.type === "stop") {
      running = false;
      lifecycle++;
      multicore?.reset();
      if (timer) clearInterval(timer);
      timer = undefined;
    }
  } catch (error) {
    fail(error);
  }
};
