export const DEFAULT_BATTLE_SIZE: number;
export const MIN_BATTLE_SIZE: number;
export const MAX_BATTLE_SIZE: number;
export const BATTLE_SIZE_STEP: number;
export const BATTLE_SIZE_PRESETS: number[];
export function validBattleSize(value: unknown): value is number;
export function normalizeBattleSize(value: unknown): number;
export function battleTeamCount(members: readonly {team: number}[], aiHulls: readonly (readonly string[])[]): number;
export function battleTeamLimit(battleSize: number, teamCount?: number): number;
