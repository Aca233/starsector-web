import fs from 'node:fs';
import path from 'node:path';
import { app, dialog, shell } from 'electron';
import electronUpdater from 'electron-updater';

const RELEASES = 'https://github.com/Aca233/starsector-web/releases/latest';
/** The NSIS installation uses latest.yml/SHA-512; a ZIP or dev checkout never runs the installer updater. */
export function desktopUpdater({ changed, install, log, enabled = true }) {
  const supported = app.isPackaged && process.platform === 'win32'
    && fs.existsSync(path.join(process.resourcesPath, 'app-update.yml'))
    && fs.existsSync(path.join(path.dirname(process.execPath), 'Uninstall Starsector Web.exe'));
  let status = supported ? '尚未检查更新' : 'ZIP / 开发版：手动更新', downloaded = false, checking = null;
  const updater = electronUpdater.autoUpdater;
  const notify = text => { status = text; log(text); changed(); };
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = false;
  updater.allowPrerelease = false;
  updater.allowDowngrade = false;
  updater.logger = { info: log, warn: log, error: log, debug: () => {} };
  updater.on('checking-for-update', () => notify('正在检查更新…'));
  updater.on('update-available', info => notify(`正在下载 ${info.version}…`));
  updater.on('update-not-available', () => notify('已是最新版本'));
  updater.on('download-progress', progress => { status = `下载更新 ${Math.floor(progress.percent)}%`; changed(); });
  updater.on('update-downloaded', info => { downloaded = true; notify(`${info.version} 已下载，可重启安装`); });
  updater.on('error', error => notify('更新暂不可用：' + error.message));
  async function check(manual = false) {
    if (!supported) {
      if (manual) {
        const result = await dialog.showMessageBox({ type: 'info', title: '桌面版更新', message: '此包不支持安装器自动更新',
          detail: '免安装 ZIP 请手动下载新版；安装版可自动下载更新。浏览器版更新器不会修改 Electron 安装目录。', buttons: ['取消', '打开 Releases'], defaultId: 0, cancelId: 0 });
        if (result.response === 1) await shell.openExternal(RELEASES);
      }
      return;
    }
    if (checking) return checking;
    checking = updater.checkForUpdates().then(async () => {
      if (manual) await dialog.showMessageBox({ type: 'info', title: '桌面版更新', message: status,
        detail: '下载完成后可在“更新”菜单重启安装；不会在对局中自动替换文件。' });
    }).catch(async error => {
      if (manual) await dialog.showMessageBox({ type: 'warning', title: '检查更新失败', message: error.message, detail: '现有版本仍可继续使用。' });
    }).finally(() => { checking = null; });
    return checking;
  }
  return {
    label: () => status,
    check,
    ready: () => downloaded,
    start: () => { if (enabled && supported) void check(); },
    install: () => { if (downloaded) void install(() => updater.quitAndInstall(false, true)); },
  };
}
