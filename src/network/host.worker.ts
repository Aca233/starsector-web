import { summarizeNetworkFailure } from '../../desktop/network-diagnostic-record.mjs';
import {capturePlanDiagnostics} from './AuthorityCombatSnapshot';
import {SnapshotEncoderBroker} from './SnapshotEncoderBroker';
import {attachAuthorityCompletion, readAuthorityCompletion} from './AuthorityLocalCompletion.mjs';
import type {AuthorityCompletion} from './AuthorityLocalCompletion.mjs';
import { CombatAuthority } from '../engine/runtime/CombatAuthority';
import { withoutBulkProjectiles } from './ProjectileBulkVariant.mjs';
import { AnchoredProjectilePublisher } from './AnchoredProjectileVisual.mjs';
import { captureProjectileState } from './CaptureProjectiles';
import { summarizeCombatFrame } from './CombatFrameSummary.mjs';
import { FlowCounters } from './SnapshotFlow.mjs';
import { yieldHostTask } from './HostTaskYield';
import { HostAiBudget } from './HostAiBudget';
import { LanCombatMulticore } from '../engine/ai/multicore/LanCombatMulticore';
import type { AIPhaseBatch } from '../engine/ai/multicore/Types';
import type { HostMuzzleEvents } from './HostMuzzleEvents';
import { HostRecoveryBudget, LAN_SNAPSHOT_HZ } from "./SnapshotPolicy";
import type { HostPerformance } from "./SnapshotPolicy";
import config from "./protocol.json";
import { captureCriticalCombat } from "./CriticalCombatReplica";
import { captureMotion } from "./CaptureMotion";
import { captureBattleReport } from "./CaptureBattleReport";
import { createLanWorld } from "./LanWorld";
import type { Ship } from "../engine/simulation/Ship";
import { CombatEngine } from "../engine/simulation/CombatEngine";
import { Vector2 } from "../engine/math/Vector2";
import { applyPlayerControls } from "../engine/runtime/PlayerControls";
import { DEFAULT_MOUSE_STEERING } from "../engine/runtime/CombatControlSettings";
import { dispatchShipCommand } from "../engine/runtime/CombatCommands";
import { captureCombatAudio } from "../engine/audio/CombatAudioEvents";
import type { CombatSound } from "./CombatSnapshot";
import { captureLanDisplayCombat, configureHostCosmetics } from "./HostSnapshot";
import { encodeProjectedBinaryFrame, ProjectionEncodingCache } from "./BinarySnapshot.mjs";
import { blankInput, KEY_CODES } from "./protocol";
import type { Match, PlayerInput, Seat, Action } from "./protocol";

// One authority step at a time, even while AI owners are running off-thread.
// Experimental AI owners are opt-in: default builds never construct a pool,
// sample parallel work or retry it later. The authority Worker itself stays on.
// Same-build LAN and Steam share this capture format. Emergency rollback keeps
// ordinary snapshots; no gameplay density or receiver ACK policy changes.
const compactParticles = import.meta.env.VITE_LAN_PARTICLE_RECIPES !== 'false';
const localParticles = compactParticles && import.meta.env.VITE_LAN_LOCAL_PARTICLES !== 'false';
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
// At most one completed tick, retained only for the other display/network lane.
// Not a payload queue or a baseline: every recipient still gets a full frame.
let capturedFrame: { engine: CombatEngine; tick: number; frame: ReturnType<typeof captureLanDisplayCombat>; encoding: ProjectionEncodingCache | null } | null = null;
let captures = 0, captureReuses = 0, encodedFragmentReuses = 0;
let snapshotInFlight: number | null = null;
let snapshotEncoderWorker: SnapshotEncoderBroker | null = null;
let pendingEncoding: {id:number;tick:number;lifecycle:number;engine:CombatEngine;port:MessagePort|null;display:boolean;network:boolean;displaySound:number;networkSound:number} | null = null;
let serializerStartupFailed = false;
function serializerDiagnostics() {
  if (snapshotEncoderWorker) return snapshotEncoderWorker.stats;
  const reason = import.meta.env.VITE_LAN_SERIALIZER_WORKER !== 'true' ? 'opt-in' : !binarySnapshots ? 'legacy-codec'
    : typeof Worker === 'undefined' ? 'no-worker' : globalThis.crossOriginIsolated !== true ? 'no-shared-memory'
    : serializerStartupFailed ? 'startup-error' : 'inactive';
  return {enabled:false,reason,ready:false,busy:false,submitted:0,completed:0,cancelled:0,fallbacks:Number(serializerStartupFailed),prepareMs:0,workerMs:0,tapeBytes:0,transferBytes:0,ageMs:0};
}
function consumeSnapshotSounds(queue: CombatSound[], through: number) {
  let count = 0;
  while (count < queue.length && queue[count].id <= through) count++;
  if (count) queue.splice(0, count);
}
function cancelSnapshotEncoding(close = false) {
  pendingEncoding = null;
  if (close) { snapshotEncoderWorker?.close(); snapshotEncoderWorker = null; }
  else snapshotEncoderWorker?.cancel();
}
// Experimental: paired rendering tests found no overall win and a host-display
// regression. Keep the proven synchronous path unless explicitly opted in.
function ensureSnapshotEncoder() {
  if (snapshotEncoderWorker || !binarySnapshots || typeof Worker === 'undefined' || globalThis.crossOriginIsolated !== true
      || import.meta.env.VITE_LAN_SERIALIZER_WORKER !== 'true') return;
  try {
    snapshotEncoderWorker = new SnapshotEncoderBroker(() => {
      try { flushSnapshotEncoding(); if (running && steppingLifecycle === null) snapshot(); }
      catch (error) { fail(error); }
    });
  } catch { serializerStartupFailed = true; /* Keep the original synchronous codec. */ }
}
function flushSnapshotEncoding() {
  const result = snapshotEncoderWorker?.poll();
  if (!result) return;
  const job = pendingEncoding; pendingEncoding = null;
  if (!job || result.id !== job.id || result.fallback || job.lifecycle !== lifecycle || job.engine !== engine || job.port !== directIo) return;
  encodeMs = encodeMs * .7 + result.workerMs * .3;
  // Publishing an immutable completed tick is safe during a yielded physics
  // batch. Capture/physics are never invoked here, and sounds retire only now.
  pollIoCompletion();
  let published = false;
  if (job.network && result.network && directIo && directInFlight === null && job.tick > directLastTick && performance.now() >= directRetryAt) {
    directInFlight = directLastTick = job.tick; published = true;
    if (!Number.isSafeInteger(++directAttempt)) throw Error("Authority attempt limit exceeded");
    directIo.postMessage({type:'snapshot',tick:job.tick,attempt:directAttempt,binary:result.network.buffer,bytes:result.network.byteLength},[result.network.buffer]);
    consumeSnapshotSounds(networkSounds, job.networkSound);
  }
  if (job.display && result.display && snapshotInFlight === null && job.tick > lastSnapshotTick) {
    snapshotInFlight = lastSnapshotTick = job.tick; if (!directIo) published = true;
    send({type:'snapshot',direct:!!directIo,nextSequence:directSequence,binary:result.display.buffer,bytes:result.display.byteLength,tick:job.tick,encodeMs},[result.display.buffer]);
    consumeSnapshotSounds(sounds, job.displaySound);
  }
  if (published) snapshotFlow.count('produced');
}
// Only the dedicated Node adapter opts in; browser LAN/Steam defaults are unchanged.
let authoritySummaryShips: number | null = null;
let muzzleEvents: HostMuzzleEvents | null = null;
const snapshotEncoder = new TextEncoder();
const recoveryBudget = new HostRecoveryBudget();
let authorityRuntime: CombatAuthority | null = null;
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
const networkSounds: CombatSound[] = [];
let directIo: MessagePort | null = null, directReady = false, directLaunched = false;
let directInFlight: number | null = null, directLastTick = -1;
// Attempt identity is private to this port epoch; tick alone cannot identify a retry.
let directAttempt = 0, directRetryAt = 0;
let directSequence = 0;
let directCompletion: Int32Array | null = null;
let directFinish: Record<string, unknown> | null = null;
const ioStats = { sent: 0, skipped: 0, inputs: 0, sharedCompletions: 0 };
const queueSound = (
  key: string,
  volume: number,
  rate: number,
  pos?: [number, number],
) => {
  const event = { id: ++soundId, key, volume, rate, pos };
  if (sounds.length < 64) sounds.push(event);
  if (directIo && networkSounds.length < 64) networkSounds.push(event);
};
// Worker owns a bounded event collector, never a patched playback singleton.
captureCombatAudio(event => {
  if (event.kind === 'play') queueSound(event.key,event.volume,event.rate,event.position ? [...event.position] : undefined);
});
const send = (message: unknown, transfer: Transferable[] = []) =>
  (self as unknown as { postMessage(message: unknown, transfer: Transferable[]): void }).postMessage(message, transfer);
const ioFlow = new FlowCounters(['uploaded', 'uploadSkipped']);
const snapshotFlow = new FlowCounters(['simulated', 'produced', 'blocked']);
let lastSnapshotTick = -1;
let combatEnabled = false, combatInFlight: number | null = null, lastCombatTick = -1, nextCombatAt = 0;
function combatSnapshot() {
  const now = performance.now();
  if (!combatEnabled || !engine || combatInFlight !== null || tick <= lastCombatTick || now < nextCombatAt) return;
  nextCombatAt = now + 50 - ((now - nextCombatAt) % 50); lastCombatTick = tick;
  const data = captureCriticalCombat(engine, tick, import.meta.env.VITE_LAN_WEAPON_STATE === 'true');
  if (!data) return;
  const bytes = data.buffer as ArrayBuffer;
  combatInFlight = tick; send({ type: "combat-state", tick, data: bytes }, [bytes]);
}
let motionEnabled = false, lastMotionTick = -1, motionInFlight: number | null = null;
function motionSnapshot() {
  pollIoCompletion();
  if (!motionEnabled || !engine || motionInFlight !== null || tick === lastMotionTick) return;
  lastMotionTick = tick;
  const data = captureMotion(engine, tick, Object.fromEntries([...controls].map(([seat, s]) => [seat, s.acknowledged])));
  if (data === null) return;
  motionInFlight = tick;
  if (directIo && directReady) directIo.postMessage({ type: "motion", tick, data });
  else send({ type: "motion", tick, data });
}
let visualPublisher: AnchoredProjectilePublisher | null = null;
let visualEnabled = false, visualInFlight: number | null = null, lastVisualTick = -1, lastVisualAt = -Infinity, visualRetryAt = 0;
function visualSnapshot() {
  const now = performance.now();
  if (!visualEnabled || !engine || !visualPublisher || visualInFlight !== null || tick <= lastVisualTick || now - lastVisualAt < 50 || now < visualRetryAt) return;
  lastVisualTick = tick; lastVisualAt = now;
  const frame = captureProjectileState(engine, tick);
  if (!frame) { visualRetryAt = now + 1000; send({type:'visual-unavailable',reason:'Unsupported visual capture; retaining complete world'}); return; }
  try {
    const publication = visualPublisher.publish(frame);
    visualInFlight = tick;
    // Structured clone, not transfer: the encoder retains its immutable anchor.
    send({ type: 'projectile-visual', tick, publication });
  } catch (error) { visualRetryAt = now + 1000; send({ type: 'visual-unavailable', reason: String(error).slice(0, 256) }); }
}
let clockAt = 0, clockTick = 0, clockCombat = 0;
let realtimeRatio: number | undefined, combatRate: number | undefined;
let telemetryAt = 0, callbackGapMs = 0, lastStepMs = 0, maxStepMs = 0;
// Both receipt paths release the SAME one-slot mailbox, once and only after
// actual local I/O handling. A delayed event for an older tick cannot release
// the next publication. Sequence and diagnostics advance on either path.
function acceptIoSnapshot(value: AuthorityCompletion) {
  if (value.tick !== directInFlight) return false;
  if (value.attempt !== directAttempt || !Number.isSafeInteger(value.nextSequence) || value.nextSequence < 0
      || (value.delivery !== 'sent' && value.delivery !== 'skipped')) return false;
  // A skipped socket admission must not permanently mark a held tick as sent.
  // Cool down only rejected attempts; never create a FIFO of stale payloads.
  if (value.delivery === 'skipped') { directLastTick = -1; directRetryAt = performance.now() + 1000 / 60; }
  else directRetryAt = 0;
  directSequence = Math.max(directSequence, value.nextSequence); directInFlight = null;
  ioStats[value.delivery === 'sent' ? 'sent' : 'skipped']++;
  ioFlow.count(value.delivery === 'sent' ? 'uploaded' : 'uploadSkipped');
  return true;
}
function pollIoCompletion() {
  const state = readAuthorityCompletion(directCompletion, 'snapshot', directInFlight, directAttempt);
  if (state && acceptIoSnapshot(state)) ioStats.sharedCompletions++;
  const motion = readAuthorityCompletion(directCompletion, 'motion', motionInFlight);
  if (motion) motionInFlight = null;
}
function acknowledgeSnapshot(consumedTick: number, discardSounds = false) {
  if (snapshotInFlight === null || consumedTick !== snapshotInFlight) return;
  // A dedicated room with no viewers may have held this credit for a while.
  // Do not play its bounded but now stale one-shot sounds when a viewer returns.
  if (discardSounds) sounds.length = 0;
  snapshotInFlight = null;
  // A completed tick may have been withheld while main admitted the previous
  // packet. Publish that latest tick now, not after another timer/physics batch.
  // During an async/yielding step only return credit: its normal tail publishes
  // after the authority mutation is complete. No extra physics or payload queue.
  if (running && steppingLifecycle === null) snapshot();
}
function measureClock(now: number) {
  const elapsed = now - clockAt;
  if (!running || !engine || elapsed < 2000) return;
  realtimeRatio = (tick - clockTick) * 1000 / 60 / elapsed;
  combatRate = (engine.combatTime - clockCombat) * 1000 / elapsed;
  clockAt = now; clockTick = tick; clockCombat = engine.combatTime;
}
function diagnostics(): HostPerformance & { io: { enabled: boolean; sharedCredit: boolean; sharedCompletions: number; sent: number; skipped: number; inputs: number; inflight: number; displaySounds: number; flow: import("./SnapshotFlow.mjs").FlowSample }; multicore: LanCombatMulticore["status"] & { budget: HostAiBudget["status"] } } {
  const owners: LanCombatMulticore["status"] = multicore?.status ?? {
    mode: 'serial', tier: 'audited', reason: 'ai-workers-disabled', workers: 0, metrics: null,
  };
  return { capturePlans: capturePlanDiagnostics(), captureReuse: { produced: captures, reused: captureReuses, encodedFragments: encodedFragmentReuses, retained: capturedFrame !== null }, serializer: serializerDiagnostics(), io: { enabled: !!directIo && directReady, sharedCredit: directCompletion !== null, ...ioStats, inflight: Number(directInFlight !== null), displaySounds: sounds.length, flow: ioFlow.sample() }, flow: snapshotFlow.sample(), tick, callbackGapMs, lastStepMs, maxStepMs, backlogMs: accumulator,
    simulationMs: samples ? elapsedCost / samples : lastStepMs, captureMs, encodeMs, realtimeRatio, combatRate, multicore: { ...owners, reason: owners.workers || owners.reason !== "not-started" ? owners.reason : aiBudget.status.reason, budget: aiBudget.status } };
}
function snapshot(final = false) {
  if (final) cancelSnapshotEncoding();
  else flushSnapshotEncoding();
  pollIoCompletion();
  if (snapshotEncoderWorker?.busy) { snapshotFlow.count('blocked'); return; }
  const display = tick !== lastSnapshotTick && (final || snapshotInFlight === null);
  const network = !!directIo && directReady && directLaunched && tick !== directLastTick && (final || directInFlight === null && performance.now() >= directRetryAt);
  if (!display && !network) { if (tick !== lastSnapshotTick) snapshotFlow.count('blocked'); return; }
  if (engine) {
    const cacheable = !!directIo && directReady && directLaunched;
    const simulationMs = samples ? elapsedCost / samples : 0;
    // Consume retention before encoding/sending: a thrown publication cannot
    // leave an old projection pinned. Only successful dispatch may retain it.
    const previous = capturedFrame;
    capturedFrame = null;
    let captured: ReturnType<typeof captureLanDisplayCombat>;
    if (cacheable && previous?.engine === engine && previous.tick === tick) {
      captured = previous.frame;
      captureReuses++;
    } else {
      const started = performance.now();
      captured = captureLanDisplayCombat(engine, tick,
        Object.fromEntries([...controls].map(([seat, state]) => [seat, state.acknowledged])),
        simulationMs, muzzleEvents, compactParticles, binarySnapshots);
      captures++;
      captureMs = captureMs * .7 + (performance.now() - started) * .3;
    }
    // Sound queues and wall-time diagnostics belong to this publication, never
    // to the reusable world projection. Encoding/transfer ownership is unchanged.
    const frame = cacheable ? { ...captured, simulationMs } : captured;
    frame.snapshotHz = LAN_SNAPSHOT_HZ;
    frame.captureMs = captureMs;
    frame.encodeMs = encodeMs;
    measureClock(performance.now());
    frame.realtimeRatio = realtimeRatio;
    frame.combatRate = combatRate;
    const asynchronous = !final && running && binarySnapshots && !visualEnabled && authoritySummaryShips === null && snapshotEncoderWorker?.available;
    // Prepare both lanes of this immutable tick once. While the helper runs a
    // held lane can return credit; flush still requires that REAL exact credit.
    const encodeDisplay = display || !!asynchronous && tick > lastSnapshotTick;
    const encodeNetwork = network || !!asynchronous && cacheable && tick > directLastTick;
    frame.sounds = encodeDisplay ? sounds.slice() : [];
    // Serialize off the rendering thread. Share the capture/encoding when sound
    // batches match; otherwise keep bounded display/network sound history separate.
    // LAN and Steam transfer the same exact codec; legacy peers keep JSON.
    const encodingStarted = performance.now();
    const summary = authoritySummaryShips === null ? undefined : summarizeCombatFrame(frame, authoritySummaryShips, tick - 1);
    let networkFrame = encodeNetwork ? { ...frame, sounds: networkSounds.slice() } : null;
    const sameSounds = networkFrame?.sounds.length === frame.sounds.length && networkFrame.sounds.every((s, i) => s.id === frame.sounds[i].id);
    // Only immutable numeric tape + a small string table crosses the helper
    // boundary. One outstanding job; extraction remains at a completed tick.
    if (asynchronous && snapshotEncoderWorker) {
      const id = snapshotEncoderWorker.submit(frame, encodeDisplay, encodeNetwork, networkFrame?.sounds ?? []);
      if (id !== null) {
        pendingEncoding = {id,tick,lifecycle,engine,port:directIo,display:encodeDisplay,network:encodeNetwork,
          displaySound:frame.sounds.at(-1)?.id ?? -1,networkSound:networkFrame?.sounds.at(-1)?.id ?? -1};
        capturedFrame = cacheable && display !== network ? {engine,tick,frame:captured,encoding:null} : null;
        elapsedCost = 0; samples = 0; return;
      }
    }
    if (!network) networkFrame = null;
    if (display) lastSnapshotTick = tick;
    // Simultaneous identical sound batches already share one encoding. Do not
    // allocate retained fragments when no second encoding can use them.
    const encodingCache = cacheable && binarySnapshots && (!display || !network || !sameSounds)
      && import.meta.env.VITE_LAN_CAPTURE_ENCODING_CACHE !== 'false'
      ? previous?.frame === captured ? previous.encoding : new ProjectionEncodingCache(captured) : null;
    const priorFragmentHits = encodingCache?.hits ?? 0;
    const binary = display && binarySnapshots ? encodeProjectedBinaryFrame(frame, true, encodingCache) : null;
    const networkBinary = networkFrame && binarySnapshots ? sameSounds && binary ? binary.slice() : encodeProjectedBinaryFrame(networkFrame, true, encodingCache) : null;
    // Only the dedicated IPC consumer currently accepts the stripped variant.
    const visualBinary = binary && authoritySummaryShips !== null && visualEnabled && engine.projectiles.length > 0 ? encodeProjectedBinaryFrame(withoutBulkProjectiles(frame), true) : null;
    const json = !display || binary ? undefined : JSON.stringify(frame);
    const bytes = !display ? 0 : binary?.byteLength ?? snapshotEncoder.encode(json!).byteLength;
    encodedFragmentReuses += (encodingCache?.hits ?? 0) - priorFragmentHits;
    encodeMs = encodeMs * .7 + (performance.now() - encodingStarted) * .3;
    if (networkFrame && directIo) {
      consumeSnapshotSounds(networkSounds, networkFrame.sounds.at(-1)?.id ?? -1);
      directInFlight = directLastTick = tick;
      if (!Number.isSafeInteger(++directAttempt)) throw Error("Authority attempt limit exceeded");
      if (networkBinary) directIo.postMessage({ type: "snapshot", tick, attempt: directAttempt, binary: networkBinary.buffer, bytes: networkBinary.byteLength }, [networkBinary.buffer]);
      else { const text = JSON.stringify(networkFrame); directIo.postMessage({ type: "snapshot", tick, attempt: directAttempt, json: text, bytes: snapshotEncoder.encode(text).byteLength }); }
    }
    if (display) {
      consumeSnapshotSounds(sounds, frame.sounds.at(-1)?.id ?? -1);
      snapshotInFlight = tick;
      if (binary) send({ type: "snapshot", direct: !!directIo, nextSequence: directSequence, binary: binary.buffer, bytes, tick, encodeMs, ...(summary ? {summary} : {}), ...(visualBinary ? {visualBinary:visualBinary.buffer} : {}) }, visualBinary ? [binary.buffer,visualBinary.buffer] : [binary.buffer]);
      else send({ type: "snapshot", direct: !!directIo, json, bytes, tick, encodeMs });
    }
    if (network || (!directIo && display)) snapshotFlow.count("produced");
    capturedFrame = cacheable && (lastSnapshotTick !== tick || directLastTick !== tick)
      ? { engine, tick, frame: captured, encoding: encodingCache } : null;
  }
  elapsedCost = 0;
  samples = 0;
}
function fail(error: unknown) {
  cancelSnapshotEncoding(true);
  capturedFrame = null;
  running = false;
  lifecycle++;
  multicore?.reset();
  if (timer) clearInterval(timer);
  send({
    type: "error",
    message: error instanceof Error ? error.message : String(error),
    failure: summarizeNetworkFailure(error),
    diagnostics: diagnostics(),
  });
}
// Discard pending edges without letting their IDs replay after a new sync epoch.
function clearControls(state: Controls, ship: Ship) {
  capturedFrame = null;
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
  cancelSnapshotEncoding();
  capturedFrame = null;
  if (!recoveryBudget.allow(now, pauseMs, backgroundPause)) throw Error(backgroundPause
    ? "计算主机后台暂停超过 5 分钟，无法自动恢复。请重新开局。"
    : "计算主机持续过载或暂停过久，恢复失败。请降低战斗规模后重试。");
  accumulator = 0;
  sounds.length = 0; networkSounds.length = 0;
  for (const [seat, state] of controls) {
    state.online = false;
    const ship = controlled.get(seat);
    if (ship) clearControls(state, ship);
  }
  send({ type: "recovered", pauseMs: Math.round(pauseMs), diagnostics: diagnostics() });
}
async function step() {
  if (!running || !engine || steppingLifecycle === lifecycle) return;
  try { flushSnapshotEncoding(); } catch (error) { fail(error); return; }
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
      capturedFrame = null; // Before controls, commands or physics can mutate the world.
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
      try {
        if (!authorityRuntime || authorityRuntime.engine !== authority) throw new Error('Combat authority epoch mismatch');
        authorityRuntime.advance(1 / 60, true, aiBatch);
      }
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
        const finished = { type: "finished", winner: engine.winningTeam ?? "draw", report: captureBattleReport(engine, controlled, tick) };
        // Same port FIFO: publication is locally handled BEFORE main can send
        // finish/stop. This is an ordering barrier, not a remote delivery ACK.
        if (directIo && directReady) { directFinish = finished; directIo.postMessage({ type: "barrier", id: tick }); }
        else send(finished);
        running = false;
        multicore?.reset();
        if (timer) clearInterval(timer);
        timer = undefined;
        break;
      }
      // Small state leaves at a completed physics boundary, before catch-up or
      // synchronous full-world capture/encode. Held credits still coalesce it;
      // this neither repeats a tick nor sends partially mutated authority state.
      motionSnapshot();
      combatSnapshot();
      // Only yield BETWEEN complete authority steps. Pending input/presence and
      // snapshot credits can then run before another expensive catch-up step.
      // Keep the original tick budget/publication cadence: yielding must not
      // add captures, lower the 60 Hz target, or discard simulation debt.
      if (accumulator >= 1000 / 60 && steps < 6 && performance.now() - sliceStartedAt >= 8) {
        await yieldHostTask();
        if (generation !== lifecycle || !running || engine !== authority) return;
        flushSnapshotEncoding();
        sliceStartedAt = performance.now();
      }
    }
    // Bounded catch-up: do not accumulate minutes of stale simulation after a slow host.
    if (accumulator > 250) recover(performance.now(), accumulator);
    // Fixed 60 Hz target: offer the newest completed physics tick on every
    // callback. Catch-up may coalesce ticks, and bounded decode/socket credits
    // still apply, but no CPU/fleet/backlog policy intentionally lowers the rate.
    // Also service newly returned small-state credits on zero-step callbacks.
    if (running) motionSnapshot();
    if (running) combatSnapshot();
    if (running && (tick > lastSnapshotTick || directIo)) snapshot();
    if (running) visualSnapshot();
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
function handleMessage(m: any) {
  // Inputs only enqueue controls; their world/ACK changes happen in step().
  // Everything else except pure consumption receipts conservatively invalidates,
  // including init, presence, deployment, start/stop and authority reconnects.
  if (m.type !== 'input' && m.type !== 'snapshot-consumed' && m.type !== 'motion-consumed'
      && m.type !== 'combat-consumed' && m.type !== 'visual-consumed') capturedFrame = null;
  try {
    if (m.type === "authority-port") {
      cancelSnapshotEncoding();
      directIo?.close(); directIo = m.port; directReady = false; directLaunched = false;
      directInFlight = null; directCompletion = null; directLastTick = -1; directAttempt = 0; directRetryAt = 0; motionInFlight = null; networkSounds.length = 0;
      const port = directIo!;
      port.onmessage = event => {
        if (directIo !== port) return;
        const value = event.data;
        if (value.type === 'io-ready') { directReady = true; directCompletion = attachAuthorityCompletion(value.completion); }
        else if (value.type === 'io-unavailable') {
          handleMessage({ type: 'authority-fallback' });
          send({ type: 'io-unavailable', nextSequence: value.nextSequence });
          if (directFinish) { directFinish = null; fail(Error('Final authority publication interrupted')); }
        } else if (value.type === 'io-snapshot') {
          if (!acceptIoSnapshot(value)) return;
          if (running && steppingLifecycle === null) snapshot();
        } else if (value.type === 'io-motion') {
          if (value.tick === motionInFlight) motionInFlight = null;
        } else if (value.type === 'io-barrier') {
          if (directFinish && value.id === tick) { const finished = directFinish; directFinish = null; send(finished); }
        } else if (['input', 'presence', 'deployment', 'start', 'stop'].includes(value.type)) {
          if (value.type === 'input') ioStats.inputs++;
          handleMessage(value);
        }
      };
      port.start(); return;
    }
    if (m.type === 'authority-fallback') {
      cancelSnapshotEncoding();
      directIo?.close(); directIo = null; directReady = directLaunched = false; directInFlight = null; directCompletion = null; motionInFlight = null; networkSounds.length = 0; return;
    }
    if (m.type === "init") {
      cancelSnapshotEncoding(true);
      // Invalidates an outstanding plan before replacing any authoritative world.
      lifecycle++;
      running = false;
      if (timer) clearInterval(timer);
      timer = undefined;
      multicore?.reset();
      aiBudget.reset();
      background = m.hidden === true;
      serializerStartupFailed = false;
      binarySnapshots = m.binarySnapshots === true;
      ensureSnapshotEncoder();
      visualPublisher = new AnchoredProjectilePublisher(m.match.id); visualEnabled = m.visualState === true; visualInFlight = null; lastVisualTick = -1; lastVisualAt = -Infinity; visualRetryAt = 0;
      combatEnabled = m.combatState === true; combatInFlight = null; lastCombatTick = -1; nextCombatAt = 0;
      motionEnabled = m.motionState === true; lastMotionTick = -1; motionInFlight = null;
      foregroundPending = false;
      backgroundThrottled = false;
      const match = m.match as Match;
      authoritySummaryShips = binarySnapshots && m.authoritySummaries === true
        ? match.players.length + match.options.aiHulls.reduce((n, rows) => n + rows.length, 0) : null;
      const world = createLanWorld(match);
      engine = world.engine;
      authorityRuntime = new CombatAuthority(engine);
      muzzleEvents = configureHostCosmetics(engine, true, compactParticles, localParticles);
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
      captures = captureReuses = encodedFragmentReuses = 0;
      realtimeRatio = combatRate = undefined;
      telemetryAt = callbackGapMs = lastStepMs = maxStepMs = 0;
      snapshot();
      send({ type: "ready" });
    } else if (m.type === "visibility") {
      if (background && !m.hidden) foregroundPending = true;
      background = m.hidden === true;
    } else if (m.type === "deployment" && engine) {
      const key=m.seat+":"+m.requestId, cached=deploymentReplies.get(key);
      if(cached){if(directIo)directIo.postMessage(cached);else send(cached);return;}
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
      if (directIo) directIo.postMessage(response); else send(response);

    } else if (m.type === "visual-mode") {
      visualEnabled = m.enabled === true;
    } else if (m.type === "visual-consumed") {
      if (m.tick === visualInFlight) visualInFlight = null;
    } else if (m.type === "combat-mode") {
      combatEnabled = m.enabled === true;
    } else if (m.type === "combat-consumed") {
      if (m.tick === combatInFlight) combatInFlight = null;
    } else if (m.type === "motion-mode") {
      motionEnabled = m.enabled === true;
    } else if (m.type === "motion-consumed") {
      if (m.tick === motionInFlight) motionInFlight = null;
    } else if (m.type === "snapshot-consumed") {
      acknowledgeSnapshot(m.tick, m.discardSounds === true);
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
      directLaunched = true;
      // Initial launch and host resync both need a newly simulated frame; the
      // preload tick-0 snapshot may never have been sent to the relay.
      if (running) return;
      running = true;
      ensureSnapshotEncoder();
      snapshotFlow.reset();
      last = lastCallbackFinishedAt = performance.now();
      clockAt = last; clockTick = tick; clockCombat = engine.combatTime;
      accumulator = 0;
      timer = setInterval(() => { void step(); }, 4);
    } else if (m.type === "stop") {
      cancelSnapshotEncoding(true);
      directLaunched = false;
      running = false;
      lifecycle++;
      multicore?.reset();
      if (timer) clearInterval(timer);
      timer = undefined;
    }
  } catch (error) {
    fail(error);
  }
}
self.onmessage = (event: MessageEvent) => handleMessage(event.data);
