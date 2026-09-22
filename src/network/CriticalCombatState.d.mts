import type { WeaponStateShips } from './WeaponPresentationState.mjs';
export type CombatStateRow = [id: string, flags: number, phase: number, ...values: number[]];
export interface CriticalCombatFrame { tick: number; time: number; ships: CombatStateRow[]; weapons?: WeaponStateShips; }
export const COMBAT_STATE_MAX_SHIPS: number;
export const COMBAT_STATE_MAX_BYTES: number;
export const COMBAT_NUMBERS: readonly string[];
export const COMBAT_FLAGS: readonly string[];
export const COMBAT_PHASES: readonly ('IDLE' | 'IN' | 'ACTIVE' | 'OUT' | 'COOLDOWN')[];
export function encodeCombatState(frame: CriticalCombatFrame): Uint8Array;
export function decodeCombatState(bytes: Uint8Array): CriticalCombatFrame;
export function combatStateFromText(value: unknown): CriticalCombatFrame;
