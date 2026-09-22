import type { CombatSnapshot } from './CombatSnapshot';
export function encodeBinaryFrame(frame: CombatSnapshot): Uint8Array<ArrayBuffer> | null;
/** Fresh captureCombat projection -> owned SWF2/SWF3 frame; fastNumbers selects byte-identical numeric/array writers, preserving JSON fallback. */
export function encodeProjectedBinaryFrame(frame: CombatSnapshot, fastNumbers?: boolean, projectionCache?: ProjectionEncodingCache | null): Uint8Array<ArrayBuffer> | null;
export function decodeBinaryFrame(buffer: ArrayBuffer | ArrayBufferView): CombatSnapshot;
export function encodeBinaryState(matchId: string, seq: number, frame: ArrayBuffer | ArrayBufferView): Uint8Array<ArrayBuffer>;
export function decodeBinaryState(buffer: ArrayBuffer | ArrayBufferView): { type: 'state'; matchId: string; seq: number; frame: CombatSnapshot };

/** Relay-only incomplete validation projection, never a renderable CombatSnapshot. */
export function decodeBinaryStateForRelay(buffer: ArrayBuffer | ArrayBufferView): { type: 'state'; matchId: string; seq: number; frame: unknown };

/** Same immutable capture only; bounded owned fragments, never a wire baseline. */
export class ProjectionEncodingCache { constructor(frame: CombatSnapshot); readonly bytes:number; readonly hits:number; }

/** Private same-machine transcoding; the bulk world graph is never rebuilt. */
export interface TranscodedSnapshotTape {bytes:Uint8Array<ArrayBuffer>;sounds:CombatSnapshot['sounds'];soundStart:number;soundEnd:number}
export function encodeProjectedSnapshotTape(tape:import('./SnapshotTape.mjs').SnapshotTape):TranscodedSnapshotTape|null;
export function replaceProjectedTapeSounds(frame:TranscodedSnapshotTape,sounds:CombatSnapshot['sounds']):Uint8Array<ArrayBuffer>|null;
