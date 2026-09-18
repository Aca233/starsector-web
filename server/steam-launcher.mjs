import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createLanServer } from './lan-server.mjs';
import { SteamGateway, lobbyId } from './steam/gateway.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function launchSteam({ appId = 480, port, openBrowser = true, invitation = '', client = null } = {}) {
  if (!Number.isInteger(appId) || appId < 1 || appId > 4294967295) throw Error('无效 Steam AppID');
  if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) throw Error('无效本机端口');
  const { build } = JSON.parse(await fs.readFile(path.join(root, 'dist', 'lan-build.json'), 'utf8'));
  const show = url => {
    if (!openBrowser) return;
    if (process.platform !== 'win32') { console.log('请在浏览器中打开：' + url); return; }
    const child = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], { windowsHide: true, stdio: 'ignore' });
    child.on('error', () => console.error('请手动打开：' + url)); child.unref();
  };
  const first = port ?? 32102;
  for (let candidate = first; candidate <= (port === undefined ? first + 9 : first); candidate++) {
    const url = 'http://127.0.0.1:' + candidate + '/?view=steam';
    try {
      const response = await fetch('http://127.0.0.1:' + candidate + '/steam/status', { signal: AbortSignal.timeout(500), redirect: 'error' });
      if (response.ok) {
        const status = await response.json();
        if (status.service === 'starsector-web-steam' && status.build === build && status.appId === appId) {
          console.log('Steam 启动器已经运行，未启动第二份：' + url);
          if (!status.occupied) show(url);
          return { reused: true, url, close: async () => {} };
        }
      }
    } catch { /* A free port or an unrelated service. Never kill another process. */ }
    const gateway = new SteamGateway({ appId, build, client });
    let app;
    try { app = await createLanServer({ host: '127.0.0.1', port: candidate, dist: path.join(root, 'dist'), isolated: true, extension: gateway.extension }); }
    catch (error) { await gateway.close(); if (error.code === 'EADDRINUSE') continue; throw error; }
    gateway.relay = app;
    if (invitation) gateway.pendingInvite = lobbyId(invitation, appId);
    const status = gateway.initialize();
    let closed = false, lanApp = null, lanStarting = null;
    gateway.startLan = async () => {
      if (closed) throw Error('启动器正在退出');
      if (!lanApp && !lanStarting) lanStarting = (async () => {
        for (let lanPort = 32101; lanPort <= 32121; lanPort++) {
          try { lanApp = await createLanServer({ host: '0.0.0.0', port: lanPort, dist: path.join(root, 'dist'), isolated: true }); break; }
          catch (error) { if (error.code !== 'EADDRINUSE') throw error; }
        }
        if (!lanApp) throw Error('没有可用的局域网端口');
      })().finally(() => { lanStarting = null; });
      if (lanStarting) await lanStarting;
      return { url: 'http://127.0.0.1:' + lanApp.server.address().port + '/?view=lan' };
    };
    gateway.canShutdown = () => !lanStarting && !lanApp?.rooms.size;
    const close = async () => { if (closed) return; closed = true; await gateway.close(); if (lanStarting) await lanStarting.catch(() => {}); if (lanApp) await lanApp.close(); await app.close(); };
    gateway.shutdown = async () => { await close(); process.exit(0); };
    console.log('浏览器 Steam 联机启动器：' + url);
    console.log(status.available ? 'Steam 接口已连接。游戏仍在浏览器里，房主负责战斗模拟。' : status.error);
    if (appId === 480) console.log('当前使用 Spacewar AppID 480，仅用于开发联调；不代表正式发行授权。');
    console.log('每个 Steam 玩家都需要运行自己的启动器；不要给朋友发送本机 127.0.0.1 地址，应分享 Steam 房间号。');
    console.log('关闭浏览器后启动器仍运行。退出房间后可在网页点击“退出启动器”，或关闭诊断控制台。');
    show(url);
    return { reused: false, url, app, gateway, close };
  }
  throw Error('没有可用的本机 Steam 启动器端口；未关闭任何现有程序。');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = { appId: Number(process.env.STARSECTOR_STEAM_APP_ID ?? 480) };
  try {
    for (let i = 2; i < process.argv.length; i++) {
      const arg = process.argv[i];
      if (arg === '--no-browser') options.openBrowser = false;
      else if (arg === '--port') options.port = Number(process.argv[++i]);
      else if (arg === '--app-id') options.appId = Number(process.argv[++i]);
      else if (arg === '--lobby' || arg === '+connect_lobby') options.invitation = process.argv[++i];
      else throw Error('未知参数：' + arg);
    }
    const launched = await launchSteam(options);
    if (launched.reused) process.exit(0);
    const stop = () => void launched.close().then(() => process.exit(0));
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
  } catch (error) { console.error('Steam 启动失败：' + String(error.message ?? error)); process.exitCode = 1; }
}
