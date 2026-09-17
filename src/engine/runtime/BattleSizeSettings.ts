import { DEFAULT_BATTLE_SIZE, normalizeBattleSize } from '../../shared/battle-size.mjs';
export const BATTLE_SIZE_SETTING_KEY = 'starsector-web:battle-size:v1';
let sessionValue: number | undefined;
let sessionOnly = false;
export function readBattleSize(storage?: Pick<Storage, 'getItem'>): number {
  if (!storage && sessionOnly && sessionValue !== undefined) return sessionValue;
  try {
    const raw = (storage ?? window.localStorage).getItem(BATTLE_SIZE_SETTING_KEY);
    return raw === null ? (storage ? DEFAULT_BATTLE_SIZE : sessionValue ?? DEFAULT_BATTLE_SIZE) : normalizeBattleSize(Number(raw));
  } catch { return sessionValue ?? DEFAULT_BATTLE_SIZE; }
}
/** False means this-session only (e.g. blocked browser storage). */
export function saveBattleSize(value: number, storage?: Pick<Storage, 'setItem'>): boolean {
  value = normalizeBattleSize(value);
  if (!storage) sessionValue = value;
  try {
    (storage ?? window.localStorage).setItem(BATTLE_SIZE_SETTING_KEY, String(value));
    if (!storage) sessionOnly = false;
    return true;
  } catch { if (!storage) sessionOnly = true; return false; }
}
