import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const CONTENT_SCHEMA = 1;
export const CONTENT_REPOSITORY = 'Aca233/starsector-web';
export const CONTENT_MANIFEST = 'desktop-content.json';
export const MAX_MANIFEST_BYTES = 8 * 1024 ** 2;
export const MAX_FILE_BYTES = 128 * 1024 ** 2;
const HASH = /^[a-f0-9]{64}$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export async function hashFile(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
export function compareVersions(a, b) {
  if (![a, b].every(v => typeof v === 'string' && VERSION.test(v) && v.split('.').every(n => Number.isSafeInteger(+n)))) throw Error('无效的稳定版本号');
  const right = b.split('.').map(Number);
  for (const [i, n] of a.split('.').map(Number).entries()) if (n !== right[i]) return n > right[i] ? 1 : -1;
  return 0;
}
export function contentAsset(version) {
  compareVersions(version, version);
  return `Starsector-Web-Content-${version}-x64.bin`;
}
export function safeRelative(file) {
  if (typeof file !== 'string' || file.length > 240 || !file || file.includes('\\') || file.startsWith('/')
    || file.split('/').some(part => !part || part === '.' || part === '..' || /[<>:"|?*]/.test(part) || [...part].some(c => c.charCodeAt(0) < 32)
      || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(?:\.|$)/i.test(part))) throw Error('更新文件路径不安全');
  return file;
}
export function contentPath(root, relative) { return path.join(root, ...safeRelative(relative).split('/')); }
export function validateManifest(m) {
  if (!m || m.schema !== CONTENT_SCHEMA || m.repository !== CONTENT_REPOSITORY || m.platform !== 'win32' || m.arch !== 'x64'
    || typeof m.runtime !== 'string' || !HASH.test(m.runtime) || typeof m.build !== 'string' || !m.build || m.build.length > 200) throw Error('不支持的游戏内容清单');
  compareVersions(m.version, m.version);
  if (m.asset !== contentAsset(m.version) || !Array.isArray(m.files) || !m.files.length || m.files.length > 30000) throw Error('无效的游戏内容文件列表');
  const seen = new Set();
  let offset = 0, expanded = 0;
  for (const f of m.files) {
    safeRelative(f.path);
    const key = f.path.toLowerCase();
    if (seen.has(key) || !HASH.test(f.sha256) || !Number.isSafeInteger(f.size) || f.size < 0 || f.size > MAX_FILE_BYTES
      || f.offset !== offset || !Number.isSafeInteger(f.packed) || f.packed < 1 || f.packed > MAX_FILE_BYTES + 1024 ** 2) throw Error('无效的游戏内容文件条目');
    seen.add(key); offset += f.packed; expanded += f.size;
  }
  for (const file of seen) {
    const parts = file.split('/');
    while (parts.length > 1) { parts.pop(); if (seen.has(parts.join('/'))) throw Error('更新文件与目录冲突'); }
  }
  if (offset !== m.bytes || offset > 2 * 1024 ** 3 || expanded > 4 * 1024 ** 3) throw Error('游戏内容包大小无效');
  for (const required of ['package.json', 'desktop-build.json', 'dist/index.html', 'dist/lan-build.json', 'server/electron-service.mjs']) {
    if (!m.files.some(f => f.path === required)) throw Error('游戏内容包缺少启动文件：' + required);
  }
  return m;
}
export function parseManifest(bytes) {
  if (bytes.length > MAX_MANIFEST_BYTES) throw Error('游戏内容清单过大');
  return validateManifest(JSON.parse(bytes.toString('utf8')));
}
/** No symlinks/junctions from a reusable source may escape its immutable version directory. */
export async function regularFile(root, relative) {
  let current = root;
  const parts = safeRelative(relative).split('/');
  const base = await fs.lstat(root);
  if (!base.isDirectory() || base.isSymbolicLink()) throw Error('游戏内容目录不是普通目录');
  for (const [i, part] of parts.entries()) {
    current = path.join(current, part);
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink() || (i === parts.length - 1 ? !stat.isFile() : !stat.isDirectory())) throw Error('游戏内容中不允许链接或特殊文件');
  }
  return current;
}
export async function verifyPayload(root, manifest, full = true) {
  const critical = new Set(['package.json', 'desktop-build.json', 'dist/lan-build.json', 'dist/index.html', 'server/electron-service.mjs']);
  for (const f of manifest.files) {
    if (!full && !critical.has(f.path)) continue;
    const file = await regularFile(root, f.path);
    if ((await fs.stat(file)).size !== f.size || await hashFile(file) !== f.sha256) throw Error('游戏内容校验失败：' + f.path);
  }
  const build = JSON.parse(await fs.readFile(contentPath(root, 'desktop-build.json'), 'utf8'));
  const frontend = JSON.parse(await fs.readFile(contentPath(root, 'dist/lan-build.json'), 'utf8'));
  const pkg = JSON.parse(await fs.readFile(contentPath(root, 'package.json'), 'utf8'));
  if (build.version !== manifest.version || pkg.version !== manifest.version || build.build !== manifest.build || frontend.build !== manifest.build) throw Error('游戏内容构建号不一致');
}
