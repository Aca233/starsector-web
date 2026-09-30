import { PRODUCT_NAME, APP_ID, PROFILE_FOLDER, DEVELOPMENT_PROFILE_FOLDER, UNINSTALLER_NAMES } from './branding.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, Menu, dialog, screen, session, shell } from 'electron';
import { DesktopNetworkLog, attachDesktopNetworkLog } from './network-log.mjs';
import { networkSessionPath, resumeNetworkSessionPath, attachNetworkSessionDownloads, desktopProcessMetrics } from './network-session.mjs';
import { N2nDiagnostics } from './n2n-diagnostics.mjs';
import { DesktopBackend } from './backend.mjs';
import { DesktopSteamOverlay, loadDesktopSteam, steamRestartArgs } from './steam-overlay.mjs';
import { desktopUpdater } from './updates.mjs';
import { openContentStore } from './content-store.mjs';
import { contentSecurityPolicy, desktopOptions, isGameUrl, isProjectLink, requestedMode } from './policy.mjs';

const options = desktopOptions(process.argv);
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
app.setName(PRODUCT_NAME);
app.setAppUserModelId(APP_ID);
app.enableSandbox();
if (options.profile) {
  if (!path.isAbsolute(options.profile)) throw Error('--profile 必须是绝对目录');
  fs.mkdirSync(options.profile, { recursive: true });
  app.setPath('userData', options.profile);
} else app.setPath('userData', path.join(app.getPath('appData'), app.isPackaged ? PROFILE_FOLDER : DEVELOPMENT_PROFILE_FOLDER));
const origin = `http://127.0.0.1:${options.port}`;
const resumedLogFile = resumeNetworkSessionPath(app.getPath('userData'), process.argv);
const networkLogFile = resumedLogFile ?? networkSessionPath(app.getPath('userData'));
const networkLog = new DesktopNetworkLog(networkLogFile);
let stopNetworkSampler = () => {};
let stopTunnelSampler = () => {};
let exportingNetworkLog = false;
const settingsFile = path.join(app.getPath('userData'), 'desktop-settings.json');
let settings = {};
try { settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8')); } catch { /* First run or invalid local preferences. */ }
// Ordinary launches always start at home; explicit mode arguments also carry the Steam restart handoff.
let mode = options.mode ?? 'local';
let win, backend, updater, switching = false, quitting = false, quitPrompt = false, allowQuit = false, unloadCancelled = false;
const installedBackendRoot = app.isPackaged ? path.join(process.resourcesPath, 'backend') : project;
let backendRoot = installedBackendRoot, contentStore = null, contentHealthTimer = null, contentLoaded = false, contentRecovering = false;
const gameVersion = () => contentStore?.current.manifest.version ?? app.getVersion();
let pendingSteamInvite = null, steamEntry = null;
const steamOverlay = new DesktopSteamOverlay({ appId: options.appId, load: () => loadDesktopSteam(installedBackendRoot),
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
  const result = await dialog.showMessageBox(win, { type: 'question', title: 'Starship Foundry', message, detail,
    buttons: ['取消', action], defaultId: 0, cancelId: 0, noLink: true });
  return result.response === 1;
}
async function closeNetworkLog(reason) {
  stopNetworkSampler();
  stopTunnelSampler();
  let timer;
  try {
    // A failed/stalled disk must not prevent quitting indefinitely.
    const closed = await Promise.race([networkLog.close(reason), new Promise(resolve => { timer = setTimeout(() => {
      log('[desktop] network-log final flush timed out; last records may be missing'); resolve();
    }, 2000); })]);
    if (closed === false) log('[desktop] network-log final record could not be persisted; check disk space and permissions');
  } finally { clearTimeout(timer); }
}
async function stopAll(reason = 'quit') {
  clearTimeout(contentHealthTimer);
  if (contentLoaded && ['quit', 'update'].includes(reason)) {
    try { await contentStore?.healthy(); } catch (error) { log('[content] ' + error.message); }
  }
  saveSettings();
  try { await session.defaultSession.flushStorageData(); await backend?.stop(); }
  finally { await closeNetworkLog(reason); }
}
async function exportNetworkLog() {
  if (exportingNetworkLog || quitting || !win || win.isDestroyed()) return;
  exportingNetworkLog = true;
  try {
    const result = await dialog.showSaveDialog(win, { title: '导出本次启动的完整联机日志',
      defaultPath: path.join(app.getPath('downloads'), path.basename(networkLogFile)),
      filters: [{ name: 'JSON Lines 日志', extensions: ['jsonl'] }] });
    if (result.canceled || !result.filePath) return;
    if (path.resolve(result.filePath).toLowerCase() === path.resolve(networkLogFile).toLowerCase()) {
      await networkLog.flush(); shell.showItemInFolder(networkLogFile); return;
    }
    await networkLog.exportTo(result.filePath);
  } catch (error) {
    if (win && !win.isDestroyed()) await dialog.showMessageBox(win, { type: 'error', title: '日志导出失败', message: String(error.message ?? error) });
  } finally { exportingNetworkLog = false; }
}
function startNetworkSampler() {
  let previousPids = new Set();
  try { previousPids = new Set(app.getAppMetrics().map(metric => metric.pid)); } catch { /* CPU warmup may be unavailable. */ }
  const delay = monitorEventLoopDelay({ resolution: 20 }); delay.enable();
  let previous = performance.now();
  const timer = setInterval(() => {
    const now = performance.now(), count = delay.count;
    try {
      const memory = process.memoryUsage(), metrics = app.getAppMetrics();
      networkLog.event('desktop-sample', { mode, sampleGapMs: now - previous,
        eventLoop: { meanMs: count ? delay.mean / 1e6 : null, p95Ms: count ? delay.percentile(95) / 1e6 : null, maxMs: count ? delay.max / 1e6 : null },
        processes: desktopProcessMetrics(metrics, { cpuSampledPids: previousPids, mainPid: process.pid,
          rendererPid: win && !win.isDestroyed() ? win.webContents.getOSProcessId() : null, backendPid: backend?.child?.pid }),
        mainMemory: { rssBytes: memory.rss, heapUsedBytes: memory.heapUsed, heapTotalBytes: memory.heapTotal, externalBytes: memory.external } });
      previousPids = new Set(metrics.map(metric => metric.pid));
    } catch { /* Diagnostics must not interrupt gameplay or shutdown. */ }
    previous = now; delay.reset();
  }, 5000);
  timer.unref();
  stopNetworkSampler = () => { clearInterval(timer); delay.disable(); };
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
    await stopAll(install ? 'update' : 'quit'); allowQuit = true;
    if (install) await install(); else app.quit();
  } catch (error) { log(error.message); allowQuit = true; app.quit(); }
}
async function openProject(url) { if (isProjectLink(url)) await shell.openExternal(url); }
function updateMenu() {
  if (!win || win.isDestroyed()) return;
  win.setTitle(`Starship Foundry ${gameVersion()} · ${modeNames[mode]}${switching ? ' · 正在准备后台服务' : ''}`);
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
      ...(updater?.detail() ? [{ label: updater.detail(), enabled: false }] : []),
      { label: '检查更新', click: () => void updater?.check(true) },
      { label: '重启并安装已下载的更新', enabled: updater?.ready() ?? false, click: () => updater?.install() },
    ] },
    { label: '帮助', submenu: [
      { label: '导出本次完整联机日志', click: () => void exportNetworkLog() },
      { label: '打开本次联机性能日志', click: async () => { await networkLog.flush(); if (fs.existsSync(networkLogFile)) shell.showItemInFolder(networkLogFile); else await dialog.showMessageBox(win, { title: '联机性能日志', message: '本次日志尚未写入，请检查磁盘空间。', detail: networkLogFile }); } },
      { label: '打开联机日志', click: () => { log('[desktop] diagnostic-log version=' + gameVersion()); shell.showItemInFolder(path.join(app.getPath('userData'), 'desktop.log')); } },
      { label: 'GitHub / 使用说明', click: () => void openProject('https://github.com/Aca233/starsector-web') },
      { label: '关于', click: () => void dialog.showMessageBox(win, { title: '关于 Starship Foundry', message: `Starship Foundry ${gameVersion()}`,
        detail: `非官方舰船设计与战斗沙盒\n桌面运行环境 ${app.getVersion()}\nElectron ${process.versions.electron} · Chromium ${process.versions.chrome}\nSteam AppID ${options.appId}${options.appId === 480 ? '（仅开发测试）' : ''}\n素材权利属于原权利人，非官方发行。` }) },
    ] },
  ]));
}
async function startBackend(next) {
  const info = await backend.start(next);
  networkLog.event('backend-ready', { mode: next, build: info.build });
  return info;
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
  networkLog.event('mode-change', { previousMode: previous, mode: next, stage: 'requested' });
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
        networkLog.event('mode-change', { previousMode: previous, mode: next, stage: 'relaunch' });
        await stopAll('steam-relaunch');
        app.relaunch({ args: [...steamRestartArgs(process.argv.slice(1).filter(arg => !arg.startsWith('--network-log-session='))),
          '--network-log-session=' + path.basename(networkLogFile)] });
        quitting = true; allowQuit = true; app.quit();
        return;
      }
      restarting = true;
      await backend.stop();
      await startBackend(next); mode = next;
    }
    // Navigate even when the service is already ready (e.g. re-enter LAN from the home page).
    await win.loadURL(target); saveSettings();
    networkLog.event('mode-change', { previousMode: previous, mode: next, stage: 'ready' });
  } catch (error) {
    if (unloadCancelled && !restarting) return;
    networkLog.event('mode-change', { previousMode: previous, mode: next, stage: 'failed' });
    log(error.message);
    if (restarting) {
      try {
        steamEntry = null; await backend.stop(); await startBackend(previous); mode = previous;
        await win.loadURL(isGameUrl(previousUrl, origin) ? previousUrl : origin + '/');
      } catch (restoreError) { log(restoreError.message); }
    }
    if (!options.hidden) await dialog.showMessageBox(win, { type: 'error', title: '后台启动失败', message: error.message,
      detail: '请重试联机入口。端口被占用或 Steam 未就绪时，不会结束其他程序。' });
  } finally { switching = false; updateMenu(); }
}
async function recoverContent() {
  if (contentRecovering || !contentStore?.state.trial) return false;
  contentRecovering = true; clearTimeout(contentHealthTimer);
  try {
    try { if (!await contentStore.rollback()) return false; }
    catch (error) { log('[content] 无法保存回退状态：' + error.message); return false; }
    quitting = true; await stopAll('content-rollback'); allowQuit = true;
    app.relaunch(); app.quit(); return true;
  } finally { contentRecovering = false; }
}
async function backendFailed(message) {
  networkLog.event('backend-failed', { mode });
  log(message);
  if (!quitting && !switching && await recoverContent()) return;
  if (quitting || switching || !win || win.isDestroyed()) return;
  if (options.hidden) { await stopAll('backend-failed'); allowQuit = true; app.exit(1); return; }
  const result = await dialog.showMessageBox(win, { type: 'error', title: '后台停止', message,
    detail: '当前对局已断开。可以重新启动本模式，或退出后选择单机模式。', buttons: ['退出', '重新启动'], defaultId: 0 });
  if (result.response === 1) {
    try { await backend.stop(); await startBackend(mode); await win.loadURL(origin + '/'); }
    catch (error) { log(error.message); app.quit(); }
  } else { app.quit(); }
}
function installSecurity() {
  const gameSession = session.defaultSession;
  const userAgent = gameSession.getUserAgent() + ` StarshipFoundryDesktop/${gameVersion()}`;
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
  if (app.isPackaged && process.platform === 'win32' && UNINSTALLER_NAMES.some(name => fs.existsSync(path.join(path.dirname(process.execPath), name)))) {
    try {
      contentStore = await openContentStore({ baseRoot: installedBackendRoot,
        storage: path.join(app.getPath('userData'), 'content-updates'), log });
      backendRoot = contentStore.current.root;
    } catch (error) { log('[content] 轻量更新不可用，使用安装版：' + error.message); }
  }
  log(`[desktop] start version=${gameVersion()} shell=${app.getVersion()} electron=${process.versions.electron} mode=${mode}`);
  backend = new DesktopBackend({ root: backendRoot, overlay: steamOverlay,
    port: options.port, appId: options.appId, log, failed: message => void backendFailed(message), quitRequested: () => void requestQuit() });
  if (pendingSteamInvite) { backend.receiveSteamInvite(pendingSteamInvite); pendingSteamInvite = null; }
  win = new BrowserWindow({ ...windowBounds(), minWidth: 800, minHeight: 600, show: false,
    backgroundColor: '#090e16', title: 'Starship Foundry',
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, nodeIntegrationInWorker: false,
      webviewTag: false, webSecurity: true, backgroundThrottling: false, devTools: !app.isPackaged } });
  installSecurity();
  startNetworkSampler();
  const guardNavigation = (event, url) => {
    if (!isGameUrl(url, origin)) { event.preventDefault(); log('已阻止游戏窗口跳转到外部页面'); return; }
    const next = requestedMode(url, mode);
    if (next !== mode) { event.preventDefault(); void switchMode(next, url); }
  };
  win.webContents.on('will-navigate', guardNavigation);
  win.webContents.on('will-redirect', guardNavigation);
  win.webContents.on('will-attach-webview', event => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // No Node access/preload API is exposed; only bounded allowlisted metrics.
  attachDesktopNetworkLog(win.webContents, origin, networkLog);
  attachNetworkSessionDownloads(win.webContents, session.defaultSession, origin, exportNetworkLog);
  win.webContents.on('did-finish-load', () => networkLog.event('page-loaded', { mode }));
  win.on('unresponsive', () => networkLog.event('renderer-unresponsive', { mode }));
  win.on('responsive', () => networkLog.event('renderer-responsive', { mode }));
  win.webContents.on('page-title-updated', event => event.preventDefault());
  win.webContents.on('render-process-gone', (_, details) => {
    networkLog.event('renderer-gone', { mode, reason: details.reason, exitCode: details.exitCode });
    if (!quitting) void backendFailed('游戏画面进程退出：' + details.reason);
  });
  win.webContents.on('will-prevent-unload', event => {
    if (quitting) event.preventDefault();
    else if (!options.hidden && dialog.showMessageBoxSync(win, { type: 'question', title: '离开当前页面？',
      message: '当前对局或未保存的编辑可能丢失。', buttons: ['取消', '离开'], defaultId: 0, cancelId: 0 }) === 1) event.preventDefault();
    else unloadCancelled = true;
    // Keep the renderer's unsaved-work guard unless the local user explicitly confirms.
  });
  win.on('close', event => { if (!allowQuit) { event.preventDefault(); void requestQuit(); } });
  updater = desktopUpdater({ changed: updateMenu, log, contentStore, enabled: !options.noUpdate, install: install => requestQuit({ install }) });
  updateMenu();
  await startBackend(mode);
  const entry = mode === 'steam' && isGameUrl(settings.steamEntry, origin) && requestedMode(settings.steamEntry, 'local') === 'steam'
    ? settings.steamEntry : origin + (mode === 'local' ? '/' : `/?view=${mode}`);
  await win.loadURL(entry); saveSettings();
  contentLoaded = true;
  if (contentStore?.state.trial) {
    contentHealthTimer = setTimeout(() => {
      if (!quitting && backend.info && !win.isDestroyed()) void contentStore.healthy().catch(error => log('[content] ' + error.message));
    }, 15000);
    contentHealthTimer.unref();
  }
  if (settings.maximized) win.maximize();
  if (!options.hidden) win.show();
  updater.start();
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  networkLog.start({ sessionId: path.basename(networkLogFile, '.jsonl'), appVersion: app.getVersion(), electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome, nodeVersion: process.versions.node, platform: process.platform, arch: process.arch,
    logicalCores: os.cpus().length, totalMemoryBytes: os.totalmem(), mode, resumed: Boolean(resumedLogFile) });
  // Local management reads never share the renderer/network hot path. There is
  // no OS query while playing Steam or offline; LAN discovery is once/minute.
  const tunnel = new N2nDiagnostics();
  const tunnelTimer = setInterval(() => {
    if (mode !== 'lan' || quitting) return;
    const sampledMode = mode;
    void tunnel.sample().then(report => { if (report && !quitting) networkLog.event('n2n-sample', { mode: sampledMode, ...report }); });
  }, 10000);
  tunnelTimer.unref();
  stopTunnelSampler = () => { clearInterval(tunnelTimer); tunnel.close(); };
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
    try { if (await recoverContent()) return; } catch (rollbackError) { log('[content] 无法自动回退：' + rollbackError.message); }
    if (!options.hidden) dialog.showErrorBox('Starship Foundry 启动失败', error.message);
    quitting = true; await stopAll('startup-failed'); allowQuit = true; app.exit(1);
  });
}
