/** Pure URL policy shared by all navigation and permission checks. Never allow remote content in the app window. */
export function isGameUrl(value, origin) {
  try {
    const url = new URL(value);
    return url.origin === origin && !url.username && !url.password && ['/', '/index.html'].includes(url.pathname);
  } catch { return false; }
}
export function requestedMode(value, current) {
  const view = new URL(value).searchParams.get('view');
  if (view === 'steam') return 'steam';
  if (view === 'lan') return 'lan';
  return current;
}
export function isProjectLink(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && url.hostname === 'github.com' && (url.pathname === '/Aca233/starsector-web' || url.pathname.startsWith('/Aca233/starsector-web/'));
  } catch { return false; }
}
export function desktopOptions(args) {
  const options = { port: 32110, mode: null, appId: 480, noUpdate: false, hidden: false, profile: null };
  for (const arg of args) {
    if (arg.startsWith('--mode=')) options.mode = arg.slice(7);
    else if (arg.startsWith('--port=')) options.port = Number(arg.slice(7));
    else if (arg.startsWith('--steam-app-id=')) options.appId = Number(arg.slice(15));
    else if (arg.startsWith('--profile=')) options.profile = arg.slice(10);
    else if (arg === '--no-update') options.noUpdate = true;
    else if (arg === '--hidden') options.hidden = true;
  }
  if (options.mode !== null && !['local', 'lan', 'steam'].includes(options.mode)) throw Error('启动模式应为 local、lan 或 steam');
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) throw Error('端口必须为 1–65535');
  if (!Number.isInteger(options.appId) || options.appId < 1 || options.appId > 4294967295) throw Error('无效的 Steam AppID');
  return options;
}
export function contentSecurityPolicy(origin) {
  const websocket = origin.replace('http:', 'ws:');
  return `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob:; connect-src 'self' ${websocket}; worker-src 'self' blob:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'`;
}
