import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';

export const UPDATE_REPOSITORY = 'Aca233/starsector-web';
export const BOOTSTRAP_VERSION = 1;
const MAX_ZIP_BYTES = 2 * 1024 ** 3;
const MAX_EXTRACTED_BYTES = 8 * 1024 ** 3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const hosts = new Set(['api.github.com', 'github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com']);

export function versionParts(version) {
  if (typeof version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) throw Error('版本号必须是稳定版本 x.y.z');
  const parts = version.split('.').map(Number);
  if (!parts.every(Number.isSafeInteger)) throw Error('版本号过大');
  return parts;
}
export function compareVersions(left, right) {
  const a = versionParts(left), b = versionParts(right);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  return 0;
}
export function inside(root, ...parts) {
  const base = path.resolve(root), target = path.resolve(base, ...parts);
  const relative = path.relative(base, target);
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw Error('更新路径超出安装目录');
  return target;
}
async function regularDirectory(directory) {
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('更新目录不能是符号链接或重解析点');
}
export async function updateStorage(base) {
  const root = await fs.realpath(base);
  const storage = inside(root, '.updates');
  await fs.mkdir(storage, { recursive: true });
  await regularDirectory(storage);
  const versions = inside(storage, 'versions');
  await fs.mkdir(versions, { recursive: true });
  await regularDirectory(versions);
  return storage;
}

export async function readPackage(root) {
  const manifest = JSON.parse(await fs.readFile(inside(root, 'portable-manifest.json'), 'utf8'));
  const update = manifest.update;
  if (manifest.platform !== 'win32' || manifest.arch !== 'x64' || update?.schema !== 1
    || update.repository !== UPDATE_REPOSITORY || !['multiplayer', 'steam'].includes(update.variant)
    || update.bootstrapVersion !== BOOTSTRAP_VERSION) throw Error('安装包不支持此更新协议');
  versionParts(manifest.version);
  if (typeof manifest.id !== 'string' || !/^[A-Za-z0-9.-]{1,160}$/.test(manifest.id)
    || typeof manifest.build !== 'string') throw Error('无效的安装包标识');
  const { build } = JSON.parse(await fs.readFile(inside(root, 'dist', 'lan-build.json'), 'utf8'));
  if (build !== manifest.build) throw Error('安装包构建号不一致');
  if (!Array.isArray(manifest.serverFiles) || !manifest.serverFiles.length) throw Error('安装包缺少服务器文件清单');
  const required = ['runtime/node.exe', 'dist/index.html', 'server/portable-launcher.mjs', 'server/portable-bootstrap.mjs',
    'node_modules/ws/package.json', 'node_modules/@msgpack/msgpack/package.json', 'node_modules/yauzl/package.json', 'node_modules/pend/package.json'];
  if (update.variant === 'steam') required.push('server/steam-launcher.mjs', 'node_modules/steamworks.js/package.json');
  for (const file of [...required, ...manifest.serverFiles]) {
    if (typeof file !== 'string') throw Error('无效的安装包文件清单');
    const stat = await fs.lstat(inside(root, file));
    if (!stat.isFile() || stat.isSymbolicLink()) throw Error('安装包文件缺失或不是普通文件');
  }
  return manifest;
}
function validReference(ref) {
  if (ref === null) return;
  if (!ref || typeof ref !== 'object' || !UUID.test(ref.folder) || typeof ref.id !== 'string') throw Error('无效的已安装更新记录');
  versionParts(ref.version);
}
export async function readState(storage) {
  try {
    const state = JSON.parse(await fs.readFile(inside(storage, 'state.json'), 'utf8'));
    if (state.schema !== 1) throw Error('未知的更新状态版本');
    validReference(state.active);
    if (Object.hasOwn(state, 'previous')) validReference(state.previous);
    if (state.skippedVersion != null) versionParts(state.skippedVersion);
    return state;
  } catch (error) {
    if (error.code === 'ENOENT') return { schema: 1, active: null };
    throw error;
  }
}
export async function writeState(storage, state) {
  validReference(state.active);
  if (Object.hasOwn(state, 'previous')) validReference(state.previous);
  const temporary = inside(storage, `state-${randomUUID()}.tmp`);
  const handle = await fs.open(temporary, 'wx');
  try { await handle.writeFile(JSON.stringify(state, null, 2) + '\n'); await handle.sync(); }
  finally { await handle.close(); }
  // Both resolved paths are confined to .updates; replacing this small pointer never moves game files.
  await fs.rename(temporary, inside(storage, 'state.json'));
}
export async function resolvePackage(base, storage, reference) {
  validReference(reference);
  if (reference === null) return { root: base, manifest: await readPackage(base) };
  const folder = inside(storage, 'versions', reference.folder);
  await regularDirectory(folder);
  const root = inside(folder, 'Starsector-Web');
  await regularDirectory(root);
  const manifest = await readPackage(root);
  if (manifest.version !== reference.version || manifest.id !== reference.id) throw Error('更新记录与实际文件不一致');
  return { root, manifest };
}

export function trustedUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !hosts.has(url.hostname) || url.username || url.password || url.port) throw Error('拒绝非 GitHub HTTPS 更新地址');
  return url;
}
async function request(url, { signal, fetchImpl = fetch } = {}) {
  for (let redirects = 0; redirects <= 5; redirects++) {
    const response = await fetchImpl(trustedUrl(url).href, { redirect: 'manual', signal,
      headers: { 'User-Agent': 'starsector-web-updater', Accept: new URL(url).hostname === 'api.github.com' ? 'application/vnd.github+json' : 'application/octet-stream' } });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    await response.body?.cancel();
    if (!location) throw Error('无效的下载重定向');
    url = new URL(location, url).href;
  }
  throw Error('更新下载重定向过多');
}
async function jsonResponse(response, limit) {
  if (!response.ok) { await response.body?.cancel(); throw Error(`GitHub HTTP ${response.status}`); }
  let bytes = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > limit) throw Error('更新元数据过大');
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function releaseAsset(release, name) {
  if (!Array.isArray(release.assets)) throw Error('Release 缺少附件');
  const matches = release.assets.filter(asset => asset.name === name);
  if (matches.length !== 1) throw Error(`Release 缺少唯一附件：${name}`);
  const asset = matches[0], url = trustedUrl(asset.browser_download_url);
  const expected = `/${UPDATE_REPOSITORY}/releases/download/${release.tag_name}/${name}`;
  if (url.hostname !== 'github.com' || decodeURIComponent(url.pathname) !== expected || url.search || url.hash) throw Error('更新附件不属于指定仓库/版本');
  return asset;
}
export function validateUpdateManifest(metadata, release, current) {
  if (metadata.schema !== 1 || metadata.repository !== UPDATE_REPOSITORY
    || release.tag_name !== `v${metadata.version}` || release.draft || release.prerelease) throw Error('更新清单与稳定 Release 不匹配');
  versionParts(metadata.version);
  const pkg = metadata.packages?.[current.update.variant];
  if (!pkg || typeof pkg.asset !== 'string' || !/^[A-Za-z0-9.-]+\.zip$/.test(pkg.asset)
    || typeof pkg.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(pkg.sha256)
    || !Number.isSafeInteger(pkg.bytes) || pkg.bytes < 1 || pkg.bytes > MAX_ZIP_BYTES
    || typeof pkg.id !== 'string' || !/^[A-Za-z0-9.-]{1,160}$/.test(pkg.id)
    || typeof pkg.build !== 'string' || pkg.bootstrapVersion !== BOOTSTRAP_VERSION) throw Error('更新包信息无效或需要手动升级启动器');
  const asset = releaseAsset(release, pkg.asset);
  if (asset.size !== pkg.bytes) throw Error('Release 附件大小与清单不一致');
  return { ...pkg, version: metadata.version, variant: current.update.variant, url: asset.browser_download_url };
}
export async function checkForUpdate(current, { fetchImpl = fetch } = {}) {
  const signal = AbortSignal.timeout(10000);
  const response = await request(`https://api.github.com/repos/${UPDATE_REPOSITORY}/releases/latest`, { signal, fetchImpl });
  if (response.status === 404) { await response.body?.cancel(); return null; }
  const release = await jsonResponse(response, 2 * 1024 ** 2);
  if (release.draft || release.prerelease || typeof release.tag_name !== 'string' || !release.tag_name.startsWith('v')) throw Error('不是受支持的稳定 Release');
  if (compareVersions(release.tag_name.slice(1), current.version) <= 0) return null;
  const manifestAsset = releaseAsset(release, 'windows-updates.json');
  const metadata = await jsonResponse(await request(manifestAsset.browser_download_url, { signal, fetchImpl }), 256 * 1024);
  return validateUpdateManifest(metadata, release, current);
}
export async function sha256File(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
export async function downloadUpdate(update, destination, { fetchImpl = fetch, log = console.log } = {}) {
  const response = await request(update.url, { signal: AbortSignal.timeout(15 * 60 * 1000), fetchImpl });
  if (!response.ok || !response.body) { await response.body?.cancel(); throw Error(`下载失败：HTTP ${response.status}`); }
  let bytes = 0, lastProgress = -1;
  const hash = createHash('sha256');
  const meter = new Transform({ transform(chunk, encoding, callback) {
    bytes += chunk.length;
    if (bytes > update.bytes || bytes > MAX_ZIP_BYTES) return callback(Error('下载大小超出清单限制'));
    hash.update(chunk);
    const progress = Math.floor(bytes / update.bytes * 10);
    if (progress > lastProgress) { lastProgress = progress; log(`更新下载 ${Math.min(100, progress * 10)}%`); }
    callback(null, chunk);
  } });
  await pipeline(Readable.fromWeb(response.body), meter, createWriteStream(destination, { flags: 'wx' }));
  if (bytes !== update.bytes || hash.digest('hex') !== update.sha256) throw Error('更新包大小或 SHA-256 校验失败，未启用新版');
}

export function zipEntryPath(name) {
  // .NET's packager can use backslashes; normalize before applying Windows-safe checks.
  const normalized = name.replaceAll('\\', '/'), directory = normalized.endsWith('/');
  const parts = (directory ? normalized.slice(0, -1) : normalized).split('/');
  if (parts[0] !== 'Starsector-Web' || (!directory && parts.length < 2)
    || parts.some(part => !part || part === '.' || part === '..' || /[<>:"|?*]/.test(part) || [...part].some(char => char.charCodeAt(0) < 32)
      || /[ .]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw Error('ZIP 含不安全的 Windows 路径');
  if (parts[1]?.toLowerCase() === '.updates') throw Error('ZIP 不能包含更新器状态');
  return { parts, directory };
}
export async function extractUpdate(zipPath, destination) {
  await regularDirectory(destination);
  if ((await fs.readdir(destination)).length) throw Error('只允许解压到新的空目录');
  const archive = await yauzl.openPromise(zipPath, { lazyEntries: true, validateEntrySizes: true });
  let total = 0, count = 0;
  const seen = new Set();
  try {
    for await (const entry of archive.eachEntry()) {
      const { parts, directory } = zipEntryPath(entry.fileName);
      const unixType = (entry.externalFileAttributes >>> 16) & 0xf000;
      if ((unixType !== 0 && unixType !== 0x8000 && unixType !== 0x4000)
        || (entry.externalFileAttributes & 0x400) || entry.isEncrypted()) throw Error('ZIP 含链接、特殊文件或加密内容');
      const key = parts.join('/').toLowerCase();
      if (seen.has(key)) throw Error('ZIP 含重复/大小写冲突的路径');
      seen.add(key);
      total += entry.uncompressedSize;
      if (++count > 100000 || !Number.isSafeInteger(total) || total > MAX_EXTRACTED_BYTES) throw Error('ZIP 解压大小或文件数超限');
      const target = inside(destination, ...parts);
      if (directory) await fs.mkdir(target, { recursive: true });
      else {
        await fs.mkdir(path.dirname(target), { recursive: true });
        const source = await archive.openReadStreamPromise(entry);
        await pipeline(source, createWriteStream(target, { flags: 'wx' }));
      }
    }
  } finally { archive.close(); }
}
export async function installUpdate(storage, update, options = {}) {
  const folder = randomUUID(), stage = inside(storage, 'versions', folder);
  await fs.mkdir(stage);
  const archive = inside(stage, 'download.zip'), unpacked = inside(stage, 'unpacked');
  await downloadUpdate(update, archive, options);
  await fs.mkdir(unpacked);
  await extractUpdate(archive, unpacked);
  const root = inside(unpacked, 'Starsector-Web'), manifest = await readPackage(root);
  if (manifest.version !== update.version || manifest.id !== update.id || manifest.build !== update.build
    || manifest.update.variant !== update.variant) throw Error('解压后的安装包与更新清单不一致');
  // Verify both absolute paths before moving a directory. Neither can escape its new staging folder.
  await fs.rename(inside(unpacked, 'Starsector-Web'), inside(stage, 'Starsector-Web'));
  await fs.unlink(archive);
  await fs.rmdir(unpacked); // Empty directory only; no recursive cleanup of user files.
  return { folder, version: manifest.version, id: manifest.id };
}

export async function acquireUpdateLock(storage) {
  const file = inside(storage, 'launcher.lock'), nonce = randomUUID();
  let handle;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { handle = await fs.open(file, 'wx'); break; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const recoveryFile = inside(storage, 'lock-recovery');
      let recovery;
      try { recovery = await fs.open(recoveryFile, 'wx'); }
      catch { throw Error('另一个启动器正在恢复锁；若已退出，请检查 .updates/lock-recovery'); }
      try {
        let record;
        try { record = JSON.parse(await fs.readFile(file, 'utf8')); }
        catch (readError) {
          if (readError.code === 'ENOENT') continue;
          throw Error('另一个启动器正在启动；如已退出，请检查 .updates/launcher.lock');
        }
        if (!Number.isInteger(record.pid) || record.pid <= 0) throw Error('无效的启动锁，请确认旧启动器已退出');
        for (const pid of [record.pid, record.childPid].filter(Boolean)) {
          try { process.kill(pid, 0); throw Error('游戏/更新器已在运行，请先退出原启动器再更新或切换版本'); }
          catch (probe) { if (probe.code !== 'ESRCH') throw probe; }
        }
        // Stale lock only. Do not kill any process; keep the record for diagnosis.
        await fs.rename(file, inside(storage, `stale-lock-${randomUUID()}.json`));
      } finally { await recovery.close(); await fs.unlink(recoveryFile); }
    }
  }
  if (!handle) throw Error('无法获得更新锁');
  const record = { pid: process.pid, nonce };
  await handle.writeFile(JSON.stringify(record));
  await handle.close();
  return {
    async child(pid) { await fs.writeFile(file, JSON.stringify({ ...record, childPid: pid })); },
    async release() {
      try { if (JSON.parse(await fs.readFile(file, 'utf8')).nonce === nonce) await fs.unlink(file); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    },
  };
}
