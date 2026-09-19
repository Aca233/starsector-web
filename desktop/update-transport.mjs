import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { CancellationError } from 'builder-util-runtime';
import { parseUpdateInfo } from 'electron-updater/out/providers/Provider.js';
import { downloadRanges, fileSha512 } from './update-download.mjs';

const RELEASES = 'https://github.com/Aca233/starsector-web/releases/download/';
const validMap = (data, size) => {
  const map = JSON.parse(gunzipSync(data).toString());
  if (map.version !== '2' || map.files?.length !== 1 || map.files[0].offset !== 0
    || !Array.isArray(map.files[0].sizes) || !Array.isArray(map.files[0].checksums)
    || map.files[0].sizes.length !== map.files[0].checksums.length
    || !map.files[0].sizes.every(n => Number.isSafeInteger(n) && n > 0)
    || map.files[0].sizes.reduce((a, b) => a + b, 0) !== size) throw Error('增量索引与安装包大小不匹配');
  return data;
};

/** Pinned electron-updater 6.8.9 adapter. Never edits node_modules or skips its final signature check. */
export function reliableUpdaterClass(BaseUpdater, fetch) {
  return class ReliableUpdater extends BaseUpdater {
    constructor(...args) {
      super(...args);
      const ordinaryDownload = this.httpExecutor.download.bind(this.httpExecutor);
      this.httpExecutor.download = async (url, destination, options) => {
        const info = this.fullDownloadInfo;
        if (!info || String(url) !== info.url.href || !Number.isSafeInteger(info.info.size) || info.info.size < 8 * 1024 ** 2 || !options.sha512) {
          return ordinaryDownload(url, destination, options);
        }
        this.emit('download-phase', { mode: 'full', reason: this.fullDownloadReason, connections: 4 });
        try {
          return await downloadRanges(url, destination, options, { fetch, size: info.info.size });
        } catch (error) {
          if (options.cancellationToken.cancelled) throw new CancellationError();
          if (error.code !== 'ERR_UPDATE_RANGE_UNSUPPORTED') throw error;
          this.emit('download-phase', { mode: 'full', reason: '服务器不支持分段，使用普通下载', connections: 1 });
          return ordinaryDownload(url, destination, options);
        }
      };
    }
    async executeDownload(taskOptions) {
      this.fullDownloadInfo = taskOptions.fileInfo;
      this.fullDownloadReason = '';
      try {
        const result = await super.executeDownload(taskOptions);
        // Also repair stale/missing maps after full downloads and cached-download reuse.
        // Failure here must not discard an already verified installer.
        try {
          const { fileInfo, downloadUpdateOptions: opts } = taskOptions;
          const provider = opts.updateInfoAndProvider.provider;
          const urls = await provider.getBlockMapFiles(fileInfo.url, this.app.version, opts.updateInfoAndProvider.info.version, this.previousBlockmapBaseUrlOverride);
          const data = validMap(await this.httpExecutor.downloadToBuffer(urls[1], {
            headers: opts.requestHeaders, cancellationToken: opts.cancellationToken,
          }), fileInfo.info.size);
          for (const directory of [this.downloadedUpdateHelper.cacheDir, this.downloadedUpdateHelper.cacheDirForPendingUpdate]) {
            const target = path.join(directory, 'current.blockmap');
            await fs.writeFile(target + '.tmp', data); await fs.rename(target + '.tmp', target);
          }
        } catch { this._logger.warn('[update] 更新已校验完成；索引缓存未保存，下次将重新校验'); }
        return result;
      } finally { this.fullDownloadInfo = null; }
    }
    async differentialDownloadInstaller(fileInfo, options, destination, provider, oldName) {
      this.emit('download-phase', { mode: 'checking', reason: '正在核对本地增量基线' });
      try {
        if (!/^\d+\.\d+\.\d+$/.test(this.app.version)) throw Object.assign(Error('本地版本没有正式增量基线'), { code: 'ERR_UPDATE_BASELINE_MISMATCH' });
        const base = `${RELEASES}v${this.app.version}/`;
        const request = { headers: options.requestHeaders, cancellationToken: options.cancellationToken };
        const metadata = parseUpdateInfo((await this.httpExecutor.downloadToBuffer(new URL(base + 'latest.yml'), request)).toString(), 'latest.yml', base);
        const old = metadata.files?.find(file => file.url === `Starsector-Web-Desktop-Setup-${this.app.version}-x64.exe`);
        const installer = path.join(this.downloadedUpdateHelper.cacheDir, oldName);
        if (metadata.version !== this.app.version || !old?.sha512 || (await fs.stat(installer)).size !== old.size
          || await fileSha512(installer) !== old.sha512) throw Object.assign(Error('本地安装包不是该版本的 GitHub 原始包'), { code: 'ERR_UPDATE_BASELINE_MISMATCH' });
        // Never trust a map merely because its version string matches a locally rebuilt installer.
        const urls = await provider.getBlockMapFiles(fileInfo.url, this.app.version, options.updateInfoAndProvider.info.version, this.previousBlockmapBaseUrlOverride);
        const data = validMap(await this.httpExecutor.downloadToBuffer(urls[0], request), old.size);
        await fs.writeFile(path.join(this.downloadedUpdateHelper.cacheDir, 'current.blockmap'), data);
      } catch (error) {
        if (options.cancellationToken.cancelled) throw new CancellationError();
        this.fullDownloadReason = error.code === 'ERR_UPDATE_BASELINE_MISMATCH' ? '本地重构建版本与发行包不同，改为整包下载'
          : error.code === 'ENOENT' ? '没有本地旧安装包，改为整包下载' : '无法核对增量基线，改为整包下载';
        this._logger.warn('[update] ' + this.fullDownloadReason);
        await fs.unlink(path.join(this.downloadedUpdateHelper.cacheDirForPendingUpdate, 'current.blockmap')).catch(() => {});
        return true;
      }
      this.emit('download-phase', { mode: 'delta', reason: '' });
      const fallback = await super.differentialDownloadInstaller(fileInfo, options, destination, provider, oldName);
      if (fallback) this.fullDownloadReason = '增量下载或校验失败，改为整包下载';
      return fallback;
    }
  };
}
