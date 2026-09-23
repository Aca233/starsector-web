import type { CombatReplayCheckpoint } from './CombatReplayCheckpoint';
import type { CombatPresentationPacket } from './CombatPresentation';
import type { CombatControlSample } from '../CombatControl';
import type { CommandResult } from '../CombatCommands';
import type { CombatOutcome } from '../../game/GameState';
import type { LocalCombatConfig, LocalCombatCommand, LocalCombatKernel } from './LocalCombatKernel';

export const LOCAL_COMBAT_PROTOCOL = 14;
export interface CombatAudioEvent { key: string; volume: number; rate: number; position?: [number, number] }
export type LocalCombatRequest = (
  | { protocol: number; epoch: number; sequence: number; kind: 'init'; config: LocalCombatConfig }
  | { protocol: number; epoch: number; sequence: number; kind: 'restore'; checkpoint: CombatReplayCheckpoint }
  | { protocol: number; epoch: number; sequence: number; kind: 'step'; sample: CombatControlSample }
  | { protocol: number; epoch: number; sequence: number; kind: 'commands'; commands: LocalCombatCommand[] }) & { recycle?: ArrayBuffer; recycleVisuals?: ArrayBuffer };
export interface LocalCombatAck {
  protocol: number; epoch: number; sequence: number; kind: 'ack';
  witness: number[];
  frame: CombatPresentationPacket; results: CommandResult[]; audio: CombatAudioEvent[];
  telemetry: {collision: ReturnType<LocalCombatKernel['engine']['weaponSystem']['collisionHandler']['runtimeCollisionKernel']['consumeTelemetry']>; trails: ReturnType<LocalCombatKernel['engine']['contrailEngine']['getStats']>};
  outcome: CombatOutcome | null; ai: LocalCombatKernel['aiStatus']; simulationMs: number; encodeMs: number;
}
export interface LocalCombatFailure {
  protocol: number; epoch: number; sequence: number; kind: 'failed'; message: string;
}
export interface LocalCombatReplayProgress {
  protocol: number; epoch: number; sequence: number; kind: 'replay-progress'; completed: number; total: number;
}
export type LocalCombatResponse = LocalCombatAck | LocalCombatFailure | LocalCombatReplayProgress;
