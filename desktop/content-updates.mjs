import { CONTENT_LATEST, fetchContentBytes } from './content-network.mjs';
import { MAX_MANIFEST_BYTES, compareVersions, parseManifest } from './content-manifest.mjs';
import { stageContentUpdate } from './content-stage.mjs';
import { formatBytes } from './update-status.mjs';

/** Return false only when the existing NSIS path must handle a shell/native upgrade or a missing/failed content channel. */
export async function checkContentUpdate({ store, fetchImpl, notify, log, signal }) {
  const bytes = await fetchContentBytes(CONTENT_LATEST, { fetchImpl, limit: MAX_MANIFEST_BYTES, timeout: 15000, signal });
  if (bytes === null) return false;
  const manifest = parseManifest(bytes);
  if (compareVersions(manifest.version, store.current.manifest.version) <= 0) {
    notify('已是最新版本', `游戏 ${store.current.manifest.version}`); return { current: true };
  }
  if (manifest.version === store.state.skipped) {
    notify('已跳过启动失败的更新', `保留游戏 ${store.current.manifest.version}；等待更高版本`); return { current: true };
  }
  if (manifest.runtime !== store.base.manifest.runtime) {
    log('[content] 桌面运行环境已变化，使用完整安装器升级'); return false;
  }
  let lastNotice = 0;
  const started = Date.now();
  let downloadStarted = 0;
  const staged = await stageContentUpdate({ storage: store.storage, manifestBytes: bytes, source: store.current, fetchImpl, signal,
    progress: p => {
      if (p.phase === 'download' && !downloadStarted) downloadStarted = Date.now();
      if (Date.now() - lastNotice < 1000 && !(p.phase === 'download' && p.transferred === p.total)) return;
      lastNotice = Date.now();
      if (p.phase === 'reuse') notify(`正在复用本地文件 ${p.checked}/${p.files}…`, '只下载变化的游戏文件，不重新安装 Electron');
      else notify(`游戏增量（4路）${p.total ? Math.floor(p.transferred / p.total * 100) : 100}% · ${formatBytes(p.transferred / Math.max(1, (Date.now() - downloadStarted) / 1000))}/s`,
        `${manifest.version} · ${formatBytes(p.transferred)} / ${formatBytes(p.total)} · 复用 ${p.reusedFiles} 个文件（${formatBytes(p.reusedBytes)}）· 更新 ${p.changedFiles} 个文件`);
    } });
  log(`[content] staged version=${manifest.version} downloaded=${staged.transferred} reusedFiles=${staged.reusedFiles} reusedBytes=${staged.reusedBytes} elapsedMs=${Date.now() - started}`);
  notify(`${manifest.version} 已就绪，可重启切换`, '所有文件已校验；无需运行安装器，旧版保留以便启动失败时回退');
  return staged;
}
