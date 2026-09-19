import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLanServer } from './lan-server.mjs';
import { SteamGateway } from './steam/gateway.mjs';
import { DesktopLanBridge } from './desktop-lan-bridge.mjs';
import { DesktopOverlayBridge } from './steam/desktop-overlay-bridge.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const send = message => process.parentPort ? process.parentPort.postMessage(message) : process.send?.(message);
let started = false, stopping = false, app, gateway, overlayBridge, lanBridge;

async function shutdown() {
  if (stopping) return;
  stopping = true;
  overlayBridge?.close();
  lanBridge?.close();
  const timeout = setTimeout(() => process.exit(1), 4000);
  timeout.unref();
  try {
    if (gateway) await gateway.close();
    if (app) { app.server.closeIdleConnections(); await app.close(); }
    send({ type: 'stopped' });
    process.exit(0);
  } catch (error) { send({ type: 'error', message: error.message }); process.exit(1); }
}
async function start({ mode, port, appId = 480, overlay, pendingInvite }) {
  if (started || stopping) return;
  started = true;
  if (!['local', 'lan', 'steam'].includes(mode) || !Number.isInteger(port) || port < 1 || port > 65535
    || !Number.isInteger(appId) || appId < 1 || appId > 4294967295) throw Error('无效的桌面服务启动参数');
  const { build } = JSON.parse(await fs.readFile(path.join(root, 'dist', 'lan-build.json'), 'utf8'));
  if (mode === 'steam') {
    overlayBridge = new DesktopOverlayBridge(send, overlay);
    gateway = new SteamGateway({ appId, build, overlay: overlayBridge, log: message => console.info(message) });
    if (/^[0-9]{16,20}$/.test(pendingInvite ?? '')) gateway.pendingInvite = pendingInvite;
  }
  if (mode === 'lan') lanBridge = new DesktopLanBridge(port);
  app = await createLanServer({ host: mode === 'lan' ? '0.0.0.0' : '127.0.0.1', port,
    dist: path.join(root, 'dist'), isolated: true, extension: gateway?.extension ?? lanBridge?.extension,
    portable: { id: `desktop-${build}`, mode } });
  if (gateway) {
    gateway.relay = app;
    // Navigation is handled by the Electron main process; don't start an orphan server on another origin.
    gateway.startLan = async () => ({ url: `http://127.0.0.1:${port}/?view=lan` });
    gateway.canShutdown = () => app.rooms.size === 0;
    gateway.shutdown = () => send({ type: 'quit-request' });
    // A native SDK crash or hang stays in this utility process, not in the desktop UI/main process.
    gateway.initialize();
  }
  send({ type: 'ready', mode, port, build, addresses: app.addresses, steam: gateway?.status() ?? null });
}
function receive(message) {
  if (message?.type === 'start') void start(message).catch(error => {
    send({ type: 'error', message: error.code === 'EADDRINUSE'
      ? `端口 ${message.port} 已被占用。请关闭使用此端口的旧程序；为保留方案库，不会自动更换端口。` : error.message });
    void shutdown();
  });
  else if (message?.type === 'stop') void shutdown();
  else if (message?.type === 'steam-pending-invite' && gateway && /^[0-9]{16,20}$/.test(message.lobby ?? '')) gateway.pendingInvite = message.lobby;
  else overlayBridge?.receive(message);
}
if (process.parentPort) process.parentPort.on('message', event => receive(event.data));
else if (process.send) process.on('message', receive);
else throw Error('桌面后台只能由 Electron 或受控的 IPC 子进程启动');
process.on('disconnect', () => void shutdown());
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
const parentPid = process.ppid;
setInterval(() => { try { process.kill(parentPid, 0); } catch { void shutdown(); } }, 2000).unref();
