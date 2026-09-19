/** Invitations select a transport endpoint, never remote renderer content. */
export function parseLanAddress(value: string, defaultPort = 32110): { origin: string; code: string } {
  const text = value.trim();
  if (!text) throw Error('请粘贴房主邀请链接或填写 IP:端口。');
  const explicit = text.includes('://');
  const url = new URL(explicit ? text : 'http://' + text);
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password)
    throw Error('房主地址必须是 HTTP/HTTPS 链接或 IP:端口。');
  if (!explicit && !url.port) url.port = String(defaultPort);
  const code = url.searchParams.get('room')?.toUpperCase() ?? '';
  if (code && !/^[0-9A-F]{6}$/.test(code)) throw Error('邀请链接里的房间码无效。');
  return { origin: url.origin, code };
}
export function lanSocketUrl(origin?: string): string {
  const url = new URL(origin ? '/desktop/lan/ws' : '/lan/ws', location.href);
  url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  if (origin) url.searchParams.set('target', parseLanAddress(origin).origin);
  return url.href;
}
export function savedLanEndpoint(value: string | undefined, desktop: boolean): { socket: string; remote: string | null } | null {
  if (!value) return null;
  try {
    const url = new URL(value), local = new URL(lanSocketUrl());
    if (url.origin !== local.origin || url.username || url.password || url.hash) return null;
    if (url.pathname === '/lan/ws' && !url.search) return { socket: url.href, remote: null };
    if (desktop && url.pathname === '/desktop/lan/ws' && url.searchParams.has('target')) {
      const remote = parseLanAddress(url.searchParams.get('target')!).origin;
      return { socket: lanSocketUrl(remote), remote };
    }
  } catch { /* Ignore invalid or foreign stored endpoints. */ }
  return null;
}
