import type { CombatSnapshot } from './CombatSnapshot';
export function encodeBinaryFrame(frame: CombatSnapshot): Uint8Array<ArrayBuffer> | null;
export function decodeBinaryFrame(buffer: ArrayBuffer | ArrayBufferView): CombatSnapshot;
export function encodeBinaryState(matchId: string, seq: number, frame: ArrayBuffer | ArrayBufferView): Uint8Array<ArrayBuffer>;
export function decodeBinaryState(buffer: ArrayBuffer | ArrayBufferView): { type: 'state'; matchId: string; seq: number; frame: CombatSnapshot };
