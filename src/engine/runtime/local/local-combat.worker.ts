import { copyReplayCheckpoint, sameReplayWitness } from './CombatReplayCheckpoint';
import { captureCombatAudio } from '../../audio/CombatAudioEvents';
import { LocalCombatKernel } from './LocalCombatKernel';
import { CombatPresentationEncoder } from './CombatPresentationEncoder';
import { LOCAL_COMBAT_PROTOCOL, type CombatAudioEvent, type LocalCombatRequest, type LocalCombatAck, type LocalCombatFailure } from './LocalCombatProtocol';

let kernel: LocalCombatKernel | undefined, encoder: CombatPresentationEncoder | undefined;
let epoch = 0, sequence = 0, failed = false, processing = false;
const audio: CombatAudioEvent[] = [];
let replaying = false;
const pushAudio = (event: CombatAudioEvent) => {
  if (replaying) return;
  if (audio.length >= 8192) throw new Error('Combat audio event budget exceeded');
  audio.push(event);
};
captureCombatAudio(event => {
  if (event.kind === 'play') pushAudio({key:event.key,volume:event.volume,rate:event.rate,
    ...(event.position ? {position:[...event.position] as [number,number]} : {})});
});
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
    if (request.kind === 'restore') {
      if (kernel || sequence) throw new Error('Restore requires a fresh combat worker');
      const checkpoint = copyReplayCheckpoint(request.checkpoint, LOCAL_COMBAT_PROTOCOL);
      epoch = request.epoch; replaying = true;
      kernel = new LocalCombatKernel(checkpoint.config);
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
            if (++completed % 32 === 0) { progress(); await new Promise(resolve => setTimeout(resolve, 0)); }
          }
        } else {
          for (let i = 0; i < entry.commands.length; i++) {
            const command = entry.commands[i];
            const result = command.kind === 'deployment' ? await kernel.dispatchDeployment(command.command) : kernel.command(command);
            if (result.accepted !== entry.results[i].accepted || result.reason !== entry.results[i].reason)
              throw new Error('Combat replay command receipt differs; refusing recovery');
          }
          if (++completed % 32 === 0) { progress(); await new Promise(resolve => setTimeout(resolve, 0)); }
        }
      }
      if (!sameReplayWitness(kernel.replayWitness(), checkpoint.witness))
        throw new Error('Combat replay witness differs; refusing recovery');
      replaying = false; audio.length = 0;
    } else if (request.kind === 'init') {
      if (kernel || sequence) throw new Error('Local combat worker already initialized');
      epoch = request.epoch; kernel = new LocalCombatKernel(request.config); encoder = new CombatPresentationEncoder(epoch, request.config.presentation ?? 'render-strict');
    } else {
      if (!kernel || !encoder || request.epoch !== epoch) throw new Error('Stale local combat epoch');
      if (request.kind === 'step') { await kernel.stepScheduled(request.sample); if (failed) return; }
      else if (request.kind === 'commands') {
        if (!Array.isArray(request.commands) || request.commands.length > 128) throw new Error('Combat command budget exceeded');
        for (const command of request.commands) results.push(command.kind === 'deployment' ? await kernel.dispatchDeployment(command.command) : kernel.command(command));
      } else throw new Error('Unknown combat transaction');
    }
    sequence = request.sequence;
    const simulationMs = performance.now() - start, packStart = performance.now();
    const frame = encoder!.capture(kernel!.engine, kernel!.tick, request.recycle, request.recycleVisuals);
    const response: LocalCombatAck = { protocol: LOCAL_COMBAT_PROTOCOL, epoch, sequence, kind: 'ack', frame, witness: kernel!.replayWitness(),
      results, audio: audio.splice(0), telemetry: {collision:kernel!.engine.weaponSystem.collisionHandler.runtimeCollisionKernel.consumeTelemetry(), trails:kernel!.engine.contrailEngine.getStats()}, outcome: kernel!.outcome(), ai: kernel!.aiStatus, simulationMs, encodeMs: performance.now() - packStart };
    self.postMessage(response, { transfer: [frame.buffer, frame.visuals.buffer] });
  } catch (error) {
    // A failed tick is not retryable: it may have partially changed authority state.
    failed = true; kernel?.dispose();
    self.postMessage({ protocol: LOCAL_COMBAT_PROTOCOL, epoch: epoch || request?.epoch, sequence: request?.sequence,
      kind: 'failed', message: error instanceof Error ? error.message : String(error) } satisfies LocalCombatFailure);
  } finally { processing = false; }
};
