import fs from 'node:fs';
import path from 'node:path';
import { app, dialog, shell } from 'electron';
import electronUpdater from 'electron-updater';
import { getNetSession } from 'electron-updater/out/electronHttpExecutor.js';
import { reliableUpdaterClass } from './update-transport.mjs';
import { formatBytes, progressText } from './update-status.mjs';

const RELEASES = 'https://github.com/Aca233/starsector-web/releases/latest';
/** NSIS only. ZIP/dev installs never modify themselves or the user's running game. */
export function desktopUpdater({ changed, install, log, enabled = true }) {
  const supported = app.isPackaged && process.platform === 'win32'
    && fs.existsSync(path.join(process.resourcesPath, 'app-update.yml'))
    && fs.existsSync(path.join(path.dirname(process.execPath), 'Uninstall Starsector Web.exe'));
  let status = supported ? '尚未检查更新' : 'ZIP / 开发版：手动更新';
  let downloaded = false, checking = null, downloading = null, available = null, phase = '准备下载';
  let reason = '', detail = '', lastProgressLog = 0;
  const Updater = reliableUpdaterClass(electronUpdater.NsisUpdater, (url, options) => getNetSession().fetch(String(url), options));
  const updater = process.platform === 'win32' ? new Updater() : electronUpdater.autoUpdater;
  const notify = text => { status = text; log('[update] ' + text); changed(); };
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.allowPrerelease = false;
  updater.allowDowngrade = false;
  updater.disableWebInstaller = true;
  updater.logger = { info: log, warn: log, error: log, debug: () => {} };
  updater.on('checking-for-update', () => notify('正在检查更新…'));
  updater.on('update-available', info => { available = info; reason = ''; detail = ''; notify(`准备下载 ${info.version}…`); });
  updater.on('update-not-available', () => { available = null; detail = ''; notify('已是最新版本'); });
  updater.on('download-phase', info => {
    phase = info.mode === 'delta' ? '增量下载' : info.mode === 'full' ? `整包下载（${info.connections}路）` : '核对增量基线';
    reason = info.reason || ''; detail = reason; notify(`${phase} ${available?.version ?? ''}…`);
  });
  updater.on('download-progress', progress => {
    status = `${phase} ${progressText(progress)}`;
    detail = `${available?.version ?? ''} · ${formatBytes(progress.transferred)} / ${formatBytes(progress.total)}${reason ? ' · ' + reason : ''}`;
    changed();
    if (Date.now() - lastProgressLog >= 10_000) { lastProgressLog = Date.now(); log('[update] ' + status + ' · ' + detail); }
  });
  updater.on('update-downloaded', info => { downloaded = true; detail = '校验通过；保存游戏后再重启安装'; notify(`${info.version} 已下载，可重启安装`); });
  updater.on('error', error => { detail = '现有版本仍可使用；点击检查更新可重试'; notify('更新暂不可用：' + error.message); });
  const showStatus = () => dialog.showMessageBox({ type: 'info', title: '桌面版更新', message: status,
    detail: `${detail}${detail ? '\n' : ''}下载进度见“更新”菜单，完成后可重启安装。不会在对局中自动替换文件。` });
  async function check(manual = false) {
    if (!supported) {
      if (manual) {
        const result = await dialog.showMessageBox({ type: 'info', title: '桌面版更新', message: '此包不支持安装器自动更新',
          detail: '免安装 ZIP 请手动下载新版；安装版可自动下载更新。', buttons: ['取消', '打开 Releases'], defaultId: 0, cancelId: 0 });
        if (result.response === 1) await shell.openExternal(RELEASES);
      }
      return;
    }
    // Repeated clicks show progress, never reset the download label or start another check.
    if (downloading || downloaded || checking) { if (manual) await showStatus(); return; }
    checking = updater.checkForUpdates().then(async () => {
      if (available && !downloaded) {
        downloading = updater.downloadUpdate().catch(error => {
          detail = '下载未完成，点击检查更新可重试；不会安装未校验文件';
          notify('更新下载失败：' + error.message);
        }).finally(() => { downloading = null; });
      }
      if (manual) await showStatus();
    }).catch(async error => {
      if (manual) await dialog.showMessageBox({ type: 'warning', title: '检查更新失败', message: error.message, detail: '现有版本仍可继续使用。' });
    }).finally(() => { checking = null; });
    return checking;
  }
  return {
    label: () => status,
    detail: () => detail,
    check,
    ready: () => downloaded,
    start: () => { if (enabled && supported) void check(); },
    install: () => { if (downloaded) void install(() => updater.quitAndInstall(false, true)); },
  };
}
