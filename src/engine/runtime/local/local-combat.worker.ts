import { enableLocalCombatReadDomain } from './LocalCombatReadDomain';
import { copyReplayCheckpoint, sameReplayWitness, sameBackendIdentity } from './CombatReplayCheckpoint';
import { captureCombatAudio } from '../../audio/CombatAudioEvents';
import { LocalCombatKernel } from './LocalCombatKernel';
import { RustCombatKernel } from '../rust/RustCombatKernel';
import type { LocalCombatConfig } from './LocalCombatContracts';
import type { CombatBackendIdentity, CombatStartupFallback } from '../../contracts/LocalCombatWire';
import { CombatPresentationEncoder } from './CombatPresentationEncoder';
import { LOCAL_COMBAT_PROTOCOL, type CombatAudioEvent, type LocalCombatRequest, type LocalCombatAck, type LocalCombatFailure } from './LocalCombatProtocol';
import type { ProjectedFrameWire } from '../../contracts/LocalCombatWire';

let kernel: LocalCombatKernel | RustCombatKernel | undefined, encoder: CombatPresentationEncoder | undefined;
/** Flat projection frames ride beside the presenter packet only when the epoch
 * config asks for them; the default presenter path is byte-identical. */
let projectedPresentation = false, projectedTransfer: ArrayBuffer[] = [];
const createKernel = async (config: LocalCombatConfig) => {
  if (config.backend === 'rust-wasm') return RustCombatKernel.create(config, epoch);
  if (config.backend !== undefined && config.backend !== 'typescript') throw Error('Unknown combat authority backend');
  const created = new LocalCombatKernel(config); enableLocalCombatReadDomain(created.engine); return created;
};
const backendIdentity = (): CombatBackendIdentity => kernel instanceof RustCombatKernel
  ? {kind:'rust-wasm', sha256:kernel.wasmSha256} : {kind:'typescript'};
let epoch = 0, sequence = 0, failed = false, processing = false;
const audio: CombatAudioEvent[] = [];
let replaying = false;
const pushAudio = (event: CombatAudioEvent) => {
  if (replaying) return;
  if (audio.length >= 8192) throw new Error('Combat audio event budget exceeded');
  audio.push(event);
};
captureCombatAudio(event => pushAudio(structuredClone(event)));
const captureAcknowledgement = (request: LocalCombatRequest, started: number,
  results: LocalCombatAck['results'], startupFallback?: CombatStartupFallback): LocalCombatAck => {
  if (!kernel || !encoder) throw Error('Local combat authority is not initialized');
  const simulationMs = performance.now() - started, packStart = performance.now();
  const rustFrame = kernel instanceof RustCombatKernel ? kernel.capturePresentation() : undefined;
  const frame = kernel instanceof RustCombatKernel
    ? encoder.captureDetached(rustFrame!.presentation, kernel.tick, request.recycle, request.recycleVisuals)
    : encoder.capture(kernel.engine, kernel.tick, request.recycle, request.recycleVisuals);
  projectedTransfer = [];
  let projected: ProjectedFrameWire | undefined;
  if (projectedPresentation && kernel instanceof RustCombatKernel) {
    // Wasm linear memory cannot be transferred; copy the flat views once. The
    // presenter packet is still produced so both paths stay comparable.
    const views = kernel.captureProjected(), witness = kernel.projectedWitnessView();
    projected = { tick: kernel.tick, sprite: views.spriteInstances.slice(), spriteCount: views.spriteCount,
      slices: views.batchSlices.slice(), sliceCount: views.batchSliceCount,
      hud: views.hudTelemetry.slice(), hudShipCount: views.hudShipCount, witness: witness.slice() };
    projectedTransfer = [projected.sprite.buffer, projected.slices.buffer, projected.hud.buffer, projected.witness.buffer];
  }
  const telemetry = kernel instanceof RustCombatKernel ? kernel.telemetry
    : {collision:kernel.engine.weaponSystem.collisionHandler.runtimeCollisionKernel.consumeTelemetry(), trails:kernel.engine.contrailEngine.getStats()};
  return { protocol: LOCAL_COMBAT_PROTOCOL, epoch, sequence: request.sequence, kind: 'ack', authority: backendIdentity(),
    ...(startupFallback ? { startupFallback } : {}),
    ...(projected ? { projected } : {}), frame, witness: kernel.replayWitness(), results,
    audio: rustFrame ? [...rustFrame.audio] : audio.splice(0), telemetry, outcome: kernel.outcome(), ai: kernel.aiStatus,
    simulationMs, encodeMs: performance.now() - packStart };
};
const initialize = async (request: Extract<LocalCombatRequest, {kind:'init'}>, started: number): Promise<LocalCombatAck> => {
  try {
    projectedPresentation = request.config.projectedPresentation === true;
    kernel = await createKernel(request.config);
    encoder = new CombatPresentationEncoder(epoch, request.config.presentation ?? 'render-strict');
    return captureAcknowledgement(request, started, []);
  } catch (error) {
    if (request.config.backend !== 'rust-wasm') throw error;
    // No command or tick has run. Discard the private Rust candidate and select
    // one complete TS authority; restoration and live transactions never enter here.
    kernel?.dispose(); kernel = undefined; encoder = undefined; audio.length = 0;
    const reason = (error instanceof Error ? error.message : String(error)).slice(0, 4096) || 'Rust cold initialization failed';
    kernel = await createKernel({ ...request.config, backend:'typescript' });
    encoder = new CombatPresentationEncoder(epoch, request.config.presentation ?? 'render-strict');
    return captureAcknowledgement(request, started, [], { requested:'rust-wasm', selected:'typescript', reason });
  }
};
self.onmessage = async (event: MessageEvent<LocalCombatRequest>) => {
  if (failed) return;
  const request = event.data;
  try {
    if (processing) throw new Error('Concurrent combat transaction');
    processing = true;
    if (!request || request.protocol !== LOCAL_COMBAT_PROTOCOL || !Number.isSafeInteger(request.epoch) || request.epoch <= 0
      || !Number.isSafeInteger(request.sequence) || request.sequence !== sequence + 1)
      throw new Error('Invalid local combat protocol sequence');
    const start = performance.now();
    const results = [];
    let initialAcknowledgement: LocalCombatAck | undefined;
    if (request.kind === 'restore') {
      if (kernel || sequence) throw new Error('Restore requires a fresh combat worker');
      const checkpoint = copyReplayCheckpoint(request.checkpoint, LOCAL_COMBAT_PROTOCOL);
      epoch = request.epoch; replaying = true;
      projectedPresentation = checkpoint.config.projectedPresentation === true;
      kernel = await createKernel(checkpoint.config);
      if (!sameBackendIdentity(backendIdentity(), checkpoint.authority)) throw Error('Combat Wasm build or backend changed; recovery refused');
      if (kernel instanceof RustCombatKernel) kernel.discardReplayOutputs();
      encoder = new CombatPresentationEncoder(epoch, checkpoint.config.presentation ?? 'render-strict');
      let completed = 0;
      const total = checkpoint.entries.reduce((sum, entry) => sum + (entry.kind === 'step' ? entry.count : 1), 0);
      const progress = () => self.postMessage({ protocol: LOCAL_COMBAT_PROTOCOL, epoch,
        sequence: request.sequence, kind: 'replay-progress', completed, total });
      progress();
      for (const entry of checkpoint.entries) {
        if (entry.kind === 'step') {
          for (let i = 0; i < entry.count; i++) {
            if (await kernel.stepScheduled(entry.sample) === false) throw new Error('Replay tick was discarded');
            if (kernel instanceof RustCombatKernel) kernel.discardReplayOutputs();
            if (++completed % 32 === 0) { progress(); await new Promise(resolve => setTimeout(resolve, 0)); }
          }
        } else {
          for (let i = 0; i < entry.commands.length; i++) {
            const command = entry.commands[i];
            const result = command.kind === 'deployment' ? await kernel.dispatchDeployment(command.command) : kernel.command(command);
            if (result.accepted !== entry.results[i].accepted || result.reason !== entry.results[i].reason)
              throw new Error('Combat replay command receipt differs; refusing recovery');
            if (kernel instanceof RustCombatKernel) kernel.discardReplayOutputs();
          }
          if (++completed % 32 === 0) { progress(); await new Promise(resolve => setTimeout(resolve, 0)); }
        }
      }
      if (!sameReplayWitness(kernel.replayWitness(), checkpoint.witness))
        throw new Error('Combat replay witness differs; refusing recovery');
      replaying = false; audio.length = 0;
    } else if (request.kind === 'init') {
      if (kernel || sequence) throw new Error('Local combat worker already initialized');
      epoch = request.epoch; initialAcknowledgement = await initialize(request, start);
    } else {
      if (!kernel || !encoder || request.epoch !== epoch) throw new Error('Stale local combat epoch');
      if (request.kind === 'step') { await kernel.stepScheduled(request.sample); if (failed) return; }
      else if (request.kind === 'commands') {
        if (!Array.isArray(request.commands) || request.commands.length > 128) throw new Error('Combat command budget exceeded');
        for (const command of request.commands) results.push(command.kind === 'deployment' ? await kernel.dispatchDeployment(command.command) : kernel.command(command));
      } else throw new Error('Unknown combat transaction');
    }
    const response = initialAcknowledgement ?? captureAcknowledgement(request, start, results), frame = response.frame;
    sequence = request.sequence;
    self.postMessage(response, { transfer: [frame.buffer, frame.visuals.buffer, ...projectedTransfer] });
    if (kernel instanceof RustCombatKernel) kernel.acknowledgePublication();
  } catch (error) {
    // A failed tick is not retryable: it may have partially changed authority state.
    failed = true; kernel?.dispose();
    self.postMessage({ protocol: LOCAL_COMBAT_PROTOCOL, epoch: epoch || request?.epoch, sequence: request?.sequence,
      kind: 'failed', message: error instanceof Error ? error.message : String(error) } satisfies LocalCombatFailure);
  } finally { processing = false; }
};
