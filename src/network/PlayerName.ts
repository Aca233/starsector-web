/** Personal preference only: never persist resume tokens, room state, or captain profiles here. */
export const playerNameKey = 'starsector.multiplayer.player-name.v1';
type NameStorage = Pick<Storage, 'getItem' | 'setItem'>;
export function validPlayerName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  return name && name.length <= 24 && ![...name].some(char => char.charCodeAt(0) < 32) ? name : null;
}
export function readPlayerName(storage?: NameStorage): string | null {
  try {
    const record = JSON.parse((storage ?? globalThis.localStorage).getItem(playerNameKey) ?? 'null');
    return record?.version === 1 ? validPlayerName(record.name) : null;
  } catch { return null; }
}
/** Migrate only the nickname even if an older build's reconnect token is no longer valid. */
export function readLegacyPlayerName(transport: 'lan' | 'steam', storage?: Pick<Storage, 'getItem'>): string | null {
  try {
    const key = 'starsector.lan.session.v5' + (transport === 'steam' ? '.steam' : '');
    const record = JSON.parse((storage ?? globalThis.sessionStorage).getItem(key) ?? 'null');
    return validPlayerName(record?.name);
  } catch { return null; }
}
/** Empty/partial input leaves the last valid nickname intact; a write failure is visible to the user. */
export function rememberPlayerName(value: string, storage?: NameStorage): string {
  const name = validPlayerName(value);
  if (!name) return '';
  try {
    (storage ?? globalThis.localStorage).setItem(playerNameKey, JSON.stringify({version: 1, name}));
    return '';
  } catch { return '玩家名称未能保存到浏览器；本次仍可使用，关闭页面后可能需要重新填写。请检查本地存储权限或空间。'; }
}
export function resolvePlayerName(explicit: unknown, saved: unknown, session: unknown): {name: string; custom: boolean} {
  for (const value of [explicit, saved, session]) {
    const name = validPlayerName(value);
    if (name) return {name, custom: true};
  }
  return {name: '玩家', custom: false};
}
