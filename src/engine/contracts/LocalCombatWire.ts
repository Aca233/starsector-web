import type { LocalCombatAIStatus, LocalCombatTelemetry } from './CombatTelemetry';

/** Same-build local transport envelope. Domain payloads are supplied by the
 * public protocol adapter; this definition never imports an engine owner. */
export const LOCAL_COMBAT_PROTOCOL = 17;
export type CombatBackendIdentity = { kind: 'typescript' } | { kind: 'rust-wasm'; sha256: string };
/** One cold init decision; the selected authority remains fixed for this epoch. */
export interface CombatStartupFallback {
  requested: 'rust-wasm'; selected: 'typescript'; reason: string;
}
export type CombatAudioEvent = import('../audio/CombatAudioEvents').CombatAudioEvent |
  { kind?: undefined; key: string; volume: number; rate: number; position?: [number, number]; listener?: readonly [number, number]; maxDistance?: number };
export type LocalCombatRequestWire<Config, Checkpoint, Sample, Command> = (
  | { protocol: number; epoch: number; sequence: number; kind: 'init'; config: Config }
  | { protocol: number; epoch: number; sequence: number; kind: 'restore'; checkpoint: Checkpoint }
  | { protocol: number; epoch: number; sequence: number; kind: 'step'; sample: Sample }
  | { protocol: number; epoch: number; sequence: number; kind: 'commands'; commands: Command[] }
) & { recycle?: ArrayBuffer; recycleVisuals?: ArrayBuffer };
/** Flat one-way projection frame (authority → renderer), carried beside the
 * presenter packet when `projectedPresentation` is enabled. Buffers are plain
 * copies of the Wasm linear-memory views so they survive postMessage transfer;
 * the presenter packet stays authoritative for everything else. */
export interface ProjectedFrameWire {
  tick: number;
  sprite: Float32Array;
  spriteCount: number;
  slices: Float32Array;
  sliceCount: number;
  hud: Float32Array;
  hudShipCount: number;
  witness: Float64Array;
}
export interface LocalCombatAckWire<Frame, Result, Outcome> {
  protocol: number; epoch: number; sequence: number; kind: 'ack';
  witness: number[];
  authority: CombatBackendIdentity;
  startupFallback?: CombatStartupFallback;
  frame: Frame; results: Result[]; audio: CombatAudioEvent[];
  telemetry: LocalCombatTelemetry;
  outcome: Outcome | null; ai: LocalCombatAIStatus; simulationMs: number; encodeMs: number;
  projected?: ProjectedFrameWire;
}
export interface LocalCombatFailure {
  protocol: number; epoch: number; sequence: number; kind: 'failed'; message: string;
}
export interface LocalCombatReplayProgress {
  protocol: number; epoch: number; sequence: number; kind: 'replay-progress'; completed: number; total: number;
}
