import { LabSimulation, LabClock } from './LabSimulation';
import type { LabConfig, LabInput, LabAction } from './LabSimulation';
import { PresentationEncoder } from './PresentationPacket';
import type { PresentationPacket } from './PresentationPacket';
import { captureLabAudio } from './LabAudio';
import type { LabSound } from './LabAudio';

export interface LabFrame {
  type: 'frame'; packet: PresentationPacket; simulationMs: number; packMs: number;
  inputSequence: number; sounds: LabSound[]; droppedSounds: number; droppedWallMs: number;
}
export type LabRequest =
  | { type: 'init'; config: LabConfig }
  | { type: 'running'; value: boolean }
  | { type: 'input'; input: LabInput }
  | { type: 'action'; action: LabAction }
  | { type: 'recycle'; buffer: ArrayBuffer }
  | { type: 'advance'; ticks: number; requestId: number }
  | { type: 'inspect'; requestId: number };

let simulation: LabSimulation | undefined, clock: LabClock | undefined;
let inFlight = false, recycled: ArrayBuffer | undefined;
let publishedTick = -1;
const encoder = new PresentationEncoder(), audio = captureLabAudio();
const send = (message: unknown, transfer: Transferable[] = []) => self.postMessage(message, { transfer });
const fail = (error: unknown) => {
  clock?.pause(); send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
};
function publish() {
  if (!simulation || inFlight || publishedTick === simulation.tick) return;
  const start = performance.now();
  const packet = encoder.capture(simulation.engine, simulation.tick, recycled);
  recycled = undefined; inFlight = true; publishedTick = simulation.tick;
  send({ type: 'frame', packet, simulationMs: simulation.simulationMs, packMs: performance.now() - start,
    inputSequence: simulation.appliedInput, sounds: audio.drain(), droppedSounds: audio.dropped(),
    droppedWallMs: clock?.droppedWallMs ?? 0 } satisfies LabFrame, [packet.buffer]);
}
self.onmessage = async (event: MessageEvent<LabRequest>) => {
  try {
    const message = event.data;
    if (message.type === 'init') {
      if (simulation) throw new Error('Worker already initialized');
      simulation = new LabSimulation(message.config);
      clock = new LabClock(() => { simulation!.step(); publish(); }, fail);
      publish(); send({ type: 'ready' }); return;
    }
    if (!simulation || !clock) throw new Error('Worker not initialized');
    if (message.type === 'running') {
      if (message.value) clock.start(); else { clock.pause(); publish(); }
      send({ type: 'running', value: message.value, tick: simulation.tick });
    } else if (message.type === 'input') {
      simulation.input = message.input;
      send({ type: 'input-received', sequence: message.input.sequence });
    } else if (message.type === 'action') simulation.action(message.action);
    else if (message.type === 'recycle') {
      recycled = message.buffer; inFlight = false;
      // Flush the latest state after pause or a slow renderer, not a backlog of obsolete frames.
      publish();
    } else if (message.type === 'advance') {
      clock.pause();
      if (!Number.isInteger(message.ticks) || message.ticks < 0 || message.ticks > 600)
        throw new Error('Invalid diagnostic step count');
      // Diagnostic only; chunk work so termination and input still have task boundaries.
      for (let i = 0; i < message.ticks; i++) {
        simulation.step();
        if (i % 4 === 3) await new Promise(resolve => setTimeout(resolve, 0));
      }
      publish(); send({ type: 'advanced', requestId: message.requestId, tick: simulation.tick });
    } else if (message.type === 'inspect') {
      clock.pause();
      const packet = encoder.capture(simulation.engine, simulation.tick);
      send({ type: 'inspection', requestId: message.requestId, packet,
        random: { ...simulation.engine.random }, visualRandom: { ...simulation.engine.visualRandom } }, [packet.buffer]);
    }
  } catch (error) { fail(error); }
};

