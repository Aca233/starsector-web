import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, Menu, dialog, screen, session, shell } from 'electron';
import { DesktopBackend } from './backend.mjs';
import { DesktopSteamOverlay, loadDesktopSteam, steamRestartArgs } from './steam-overlay.mjs';
import { desktopUpdater } from './updates.mjs';
import { contentSecurityPolicy, desktopOptions, isGameUrl, isProjectLink, requestedMode } from './policy.mjs';

const options = desktopOptions(process.argv);
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
app.setName('Starsector Web');
app.setAppUserModelId('com.aca233.starsectorweb');
app.enableSandbox();
if (options.profile) {
  if (!path.isAbsolute(options.profile)) throw Error('--profile 必须是绝对目录');
  fs.mkdirSync(options.profile, { recursive: true });
  app.setPath('userData', options.profile);
} else app.setPath('userData', path.join(app.getPath('appData'), app.isPackaged ? 'Starsector Web' : 'Starsector Web Development'));
const origin = `http://127.0.0.1:${options.port}`;
const settingsFile = path.join(app.getPath('userData'), 'desktop-settings.json');
let settings = {};
try { settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8')); } catch { /* First run or invalid local preferences. */ }
let mode = options.mode ?? (['local', 'lan', 'steam'].includes(settings.mode) ? settings.mode : 'local');
let win, backend, updater, switching = false, quitting = false, quitPrompt = false, allowQuit = false, unloadCancelled = false;
const backendRoot = app.isPackaged ? path.join(process.resourcesPath, 'backend') : project;
let pendingSteamInvite = null, steamEntry = null;
const steamOverlay = new DesktopSteamOverlay({ appId: options.appId, load: () => loadDesktopSteam(backendRoot),
  getWindow: () => win, log, onInvite: lobby => { if (backend) backend.receiveSteamInvite(lobby); else pendingSteamInvite = lobby; } });
const modeNames = { local: '单机', lan: '局域网', steam: 'Steam' };
function log(message) {
  const text = typeof message === 'string' ? message : String(message);
  console.log(text);
  try {
    const file = path.join(app.getPath('userData'), 'desktop.log');
    if (fs.existsSync(file) && fs.statSync(file).size > 2 * 1024 ** 2) fs.renameSync(file, file + '.previous');
    fs.appendFileSync(file, `${new Date().toISOString()} ${text}\n`);
  } catch { /* A log write failure must not break an offline game. */ }
}
function saveSettings() {
  if (!win || win.isDestroyed()) return;
  try {
    fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
    const temporary = settingsFile + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify({ mode, bounds: win.getNormalBounds(), maximized: win.isMaximized(), steamEntry }));
    fs.renameSync(temporary, settingsFile);
  } catch (error) { log('无法保存窗口设置：' + error.message); }
}
async function confirm(message, detail, action = '继续') {
  const result = await dialog.showMessageBox(win, { type: 'question', title: 'Starsector Web', message, detail,
    buttons: ['取消', action], defaultId: 0, cancelId: 0, noLink: true });
  return result.response === 1;
}
async function stopAll() {
  saveSettings();
  await session.defaultSession.flushStorageData();
  await backend?.stop();
}
async function requestQuit({ install } = {}) {
  if (quitting || quitPrompt || switching) return;
  quitPrompt = true;
  const accepted = await confirm(install ? '重启并安装更新？' : '退出游戏？',
    '当前对局和未保存的临时操作将结束；浏览器本地方案库会保留。房主退出会断开所有玩家。', install ? '安装并重启' : '退出');
  quitPrompt = false;
  if (!accepted) return;
  quitting = true;
  try {
    await stopAll(); allowQuit = true;
    if (install) install(); else app.quit();
  } catch (error) { log(error.message); allowQuit = true; app.quit(); }
}
async function openProject(url) { if (isProjectLink(url)) await shell.openExternal(url); }
function updateMenu() {
  if (!win || win.isDestroyed()) return;
  win.setTitle(`Starsector Web ${app.getVersion()} · ${modeNames[mode]}${switching ? ' · 正在准备后台服务' : ''}`);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: '游戏', submenu: [
      { label: '返回主菜单', enabled: !switching, click: () => void navigateHome() },
      { type: 'separator' },
      ...Object.keys(modeNames).map(value => ({ id: `mode-${value}`, label: value === 'local' ? '单机游戏' : `${modeNames[value]} 联机`,
        enabled: !switching, click: () => void switchMode(value) })),
      { type: 'separator' },
      { label: '连接地址', click: () => void dialog.showMessageBox(win, { title: '连接地址', message: origin,
        detail: mode === 'lan' ? `同一可信局域网的朋友可访问：\n${backend?.info?.addresses.join('\n') || '未检测到网络地址'}\n不自动修改防火墙；异地需自行配置虚拟局域网。` : '此模式只监听本机。Steam 玩家各自运行应用并使用 Steam 房间号加入。' }) },
      { label: '退出', accelerator: 'Alt+F4', click: () => void requestQuit() },
    ] },
    { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: '视图', submenu: [
      { label: '全屏', accelerator: 'F11', click: () => win.setFullScreen(!win.isFullScreen()) },
      { label: '重新加载', accelerator: 'Ctrl+R', click: async () => { if (await confirm('重新加载游戏？', '当前对局和临时编辑可能丢失。')) win.webContents.reload(); } },
      ...(!app.isPackaged ? [{ role: 'toggleDevTools', label: '开发者工具' }] : []),
    ] },
    { label: '更新', submenu: [
      { label: updater?.label() ?? '正在初始化', enabled: false },
      { label: '检查更新', click: () => void updater?.check(true) },
      { label: '重启并安装已下载的更新', enabled: updater?.ready() ?? false, click: () => updater?.install() },
    ] },
    { label: '帮助', submenu: [
      { label: 'GitHub / 使用说明', click: () => void openProject('https://github.com/Aca233/starsector-web') },
      { label: '关于', click: () => void dialog.showMessageBox(win, { title: '关于 Starsector Web', message: `Starsector Web ${app.getVersion()}`,
        detail: `非官方舰船设计与战斗沙盒\nElectron ${process.versions.electron} · Chromium ${process.versions.chrome}\nSteam AppID ${options.appId}${options.appId === 480 ? '（仅开发测试）' : ''}\n素材权利属于原权利人，非官方发行。` }) },
    ] },
  ]));
}
async function navigateHome() {
  await switchMode(mode, origin + '/');
}
async function switchMode(next, target = origin + (next === 'local' ? '/' : `/?view=${next}`)) {
  if (switching || quitting || !win || win.isDestroyed()) return;
  // A game entry prepares its own service. There is no separate user-facing mode switch.
  // Lock before any await so a repeated click cannot start competing backend restarts.
  switching = true; unloadCancelled = false; updateMenu();
  const previous = mode, previousUrl = win.webContents.getURL();
  let restarting = false;
  try {
    if (next !== mode) {
      // Honor the renderer's unsaved-work guard before touching the running service.
      // Unload old requests/timers before closing HTTP; otherwise they can hit a closing server.
      await win.loadURL('about:blank');
      await session.defaultSession.flushStorageData();
      if (next === 'steam' && !steamOverlay.prepared) {
        // Overlay injection must precede graphics initialization; never disable renderer security.
        restarting = true; mode = 'steam'; steamEntry = target;
        await stopAll();
        app.relaunch({ args: steamRestartArgs(process.argv.slice(1)) });
        quitting = true; allowQuit = true; app.quit();
        return;
      }
      restarting = true;
      await backend.stop();
      await backend.start(next); mode = next;
    }
    // Navigate even when the service is already ready (e.g. re-enter LAN from the home page).
    await win.loadURL(target); saveSettings();
  } catch (error) {
    if (unloadCancelled && !restarting) return;
    log(error.message);
    if (restarting) {
      try {
        steamEntry = null; await backend.stop(); await backend.start(previous); mode = previous;
        await win.loadURL(isGameUrl(previousUrl, origin) ? previousUrl : origin + '/');
      } catch (restoreError) { log(restoreError.message); }
    }
    if (!options.hidden) await dialog.showMessageBox(win, { type: 'error', title: '后台启动失败', message: error.message,
      detail: '请重试联机入口。端口被占用或 Steam 未就绪时，不会结束其他程序。' });
  } finally { switching = false; updateMenu(); }
}
async function backendFailed(message) {
  log(message);
  if (quitting || switching || !win || win.isDestroyed()) return;
  if (options.hidden) { await backend?.stop(); allowQuit = true; app.exit(1); return; }
  const result = await dialog.showMessageBox(win, { type: 'error', title: '后台停止', message,
    detail: '当前对局已断开。可以重新启动本模式，或退出后选择单机模式。', buttons: ['退出', '重新启动'], defaultId: 0 });
  if (result.response === 1) {
    try { await backend.stop(); await backend.start(mode); await win.loadURL(origin + '/'); }
    catch (error) { log(error.message); app.quit(); }
  } else { app.quit(); }
}
function installSecurity() {
  const gameSession = session.defaultSession;
  const userAgent = gameSession.getUserAgent() + ` StarsectorDesktop/${app.getVersion()}`;
  gameSession.setUserAgent(userAgent);
  // The first WebContents already exists; session defaults only affect new contents.
  win.webContents.setUserAgent(userAgent);
  const allowedPermissions = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock']);
  gameSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(contents === win?.webContents && isGameUrl(contents.getURL(), origin)
      && (!details.requestingUrl || isGameUrl(details.requestingUrl, origin)) && allowedPermissions.has(permission));
  });
  gameSession.setPermissionCheckHandler((contents, permission, requestingOrigin) => contents === win?.webContents
    && isGameUrl(contents.getURL(), origin) && requestingOrigin === origin && allowedPermissions.has(permission));
  gameSession.setDevicePermissionHandler(() => false);
  gameSession.webRequest.onHeadersReceived({ urls: [origin + '/*'] }, (details, callback) => {
    callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [contentSecurityPolicy(origin)] } });
  });
}
function windowBounds() {
  const work = screen.getPrimaryDisplay().workArea;
  const bounds = settings.bounds;
  if (bounds && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(bounds[key])) && bounds.width >= 800 && bounds.height >= 600) {
    const display = screen.getDisplayMatching(bounds).workArea;
    const width = Math.min(bounds.width, display.width), height = Math.min(bounds.height, display.height);
    return { x: Math.max(display.x, Math.min(bounds.x, display.x + display.width - width)),
      y: Math.max(display.y, Math.min(bounds.y, display.y + display.height - height)), width, height };
  }
  return { width: Math.min(1440, work.width), height: Math.min(900, work.height) };
}
async function ready() {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  backend = new DesktopBackend({ root: backendRoot, overlay: steamOverlay,
    port: options.port, appId: options.appId, log, failed: message => void backendFailed(message), quitRequested: () => void requestQuit() });
  if (pendingSteamInvite) { backend.receiveSteamInvite(pendingSteamInvite); pendingSteamInvite = null; }
  win = new BrowserWindow({ ...windowBounds(), minWidth: 800, minHeight: 600, show: false,
    backgroundColor: '#090e16', title: 'Starsector Web',
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, nodeIntegrationInWorker: false,
      webviewTag: false, webSecurity: true, backgroundThrottling: false, devTools: !app.isPackaged } });
  installSecurity();
  const guardNavigation = (event, url) => {
    if (!isGameUrl(url, origin)) { event.preventDefault(); log('已阻止游戏窗口跳转到外部页面'); return; }
    const next = requestedMode(url, mode);
    if (next !== mode) { event.preventDefault(); void switchMode(next, url); }
  };
  win.webContents.on('will-navigate', guardNavigation);
  win.webContents.on('will-redirect', guardNavigation);
  win.webContents.on('will-attach-webview', event => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('page-title-updated', event => event.preventDefault());
  win.webContents.on('render-process-gone', (_, details) => { if (!quitting) void backendFailed('游戏画面进程退出：' + details.reason); });
  win.webContents.on('will-prevent-unload', event => {
    if (quitting) event.preventDefault();
    else if (!options.hidden && dialog.showMessageBoxSync(win, { type: 'question', title: '离开当前页面？',
      message: '当前对局或未保存的编辑可能丢失。', buttons: ['取消', '离开'], defaultId: 0, cancelId: 0 }) === 1) event.preventDefault();
    else unloadCancelled = true;
    // Keep the renderer's unsaved-work guard unless the local user explicitly confirms.
  });
  win.on('close', event => { if (!allowQuit) { event.preventDefault(); void requestQuit(); } });
  updater = desktopUpdater({ changed: updateMenu, log, enabled: !options.noUpdate, install: install => requestQuit({ install }) });
  updateMenu();
  await backend.start(mode);
  const entry = mode === 'steam' && isGameUrl(settings.steamEntry, origin) && requestedMode(settings.steamEntry, 'local') === 'steam'
    ? settings.steamEntry : origin + (mode === 'local' ? '/' : `/?view=${mode}`);
  await win.loadURL(entry); saveSettings();
  if (settings.maximized) win.maximize();
  if (!options.hidden) win.show();
  updater.start();
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  if (mode === 'steam') steamOverlay.prepare();
  app.on('will-quit', () => steamOverlay.close());
  app.on('second-instance', () => { if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
  app.on('before-quit', event => {
    if (allowQuit) return;
    event.preventDefault();
    if (quitting) return;
    quitting = true;
    void stopAll().finally(() => { allowQuit = true; app.quit(); });
  });
  app.on('window-all-closed', () => { if (allowQuit) app.quit(); });
  void app.whenReady().then(ready).catch(async error => {
    log(error.stack || error.message);
    if (!options.hidden) dialog.showErrorBox('Starsector Web 启动失败', error.message);
    quitting = true; await backend?.stop(); allowQuit = true; app.exit(1);
  });
}
