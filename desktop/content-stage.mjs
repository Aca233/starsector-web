import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { CONTENT_MANIFEST, contentPath, hashFile, parseManifest, regularFile, sha256, verifyPayload } from './content-manifest.mjs';
import { contentUrl, fetchContentBytes } from './content-network.mjs';

const unzip = promisify(gunzip);
/** Only adjacent changed chunks are grouped: unchanged art never crosses the network. */
export function changedRanges(files, maxBytes = 4 * 1024 ** 2) {
  const groups = [];
  for (const file of files) {
    const last = groups.at(-1);
    if (last && last.end === file.offset && last.end - last.start + file.packed <= maxBytes) {
      last.end += file.packed; last.files.push(file);
    } else groups.push({ start: file.offset, end: file.offset + file.packed, files: [file] });
  }
  return groups;
}
/** No running files are written. Incomplete stages are deliberately not activated or recursively deleted. */
export async function stageContentUpdate({ storage, manifestBytes, source, fetchImpl, signal, progress = () => {} }) {
  const manifest = parseManifest(manifestBytes);
  if (manifest.runtime !== source.manifest.runtime) throw Error('桌面运行环境不兼容，必须使用完整安装器');
  const folder = randomUUID();
  const stage = path.join(storage, 'versions', folder);
  const root = path.join(stage, 'backend');
  await fs.mkdir(root, { recursive: true });
  const known = new Map(source.manifest.files.map(f => [`${f.sha256}:${f.size}`, f]));
  const changed = [];
  let reusedFiles = 0, reusedBytes = 0;
  progress({ phase: 'reuse', checked: 0, files: manifest.files.length });
  for (const [index, file] of manifest.files.entries()) {
    signal?.throwIfAborted();
    const destination = contentPath(root, file.path);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    const old = known.get(`${file.sha256}:${file.size}`);
    let reusable;
    if (old) {
      try {
        const candidate = await regularFile(source.root, old.path);
        if ((await fs.stat(candidate)).size === file.size && await hashFile(candidate) === file.sha256) reusable = candidate;
      } catch { /* Missing/corrupt local files are fetched and verified, not trusted. */ }
    }
    if (reusable) {
      try { await fs.link(reusable, destination); }
      catch { await fs.copyFile(reusable, destination, fs.constants.COPYFILE_EXCL); }
      reusedFiles++; reusedBytes += file.size;
    } else changed.push(file);
    if (index % 100 === 0) progress({ phase: 'reuse', checked: index + 1, files: manifest.files.length });
  }
  const groups = changedRanges(changed);
  const total = changed.reduce((sum, f) => sum + f.packed, 0);
  let transferred = 0, next = 0, firstError;
  const inFlight = new Map();
  const report = () => progress({ phase: 'download', transferred: transferred + [...inFlight.values()].reduce((a, b) => a + b, 0),
    total, reusedFiles, reusedBytes, changedFiles: changed.length });
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  progress({ phase: 'download', transferred, total, reusedFiles, reusedBytes, changedFiles: changed.length });
  try {
    const workers = Array.from({ length: Math.min(4, groups.length) }, async () => {
      try {
        while (next < groups.length) {
          controller.signal.throwIfAborted();
          const group = groups[next++];
          let bytes;
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              bytes = await fetchContentBytes(contentUrl(manifest), { fetchImpl, signal: controller.signal,
                onBytes: size => { inFlight.set(group.start, size); report(); },
                range: [group.start, group.end - 1], total: manifest.bytes, limit: group.end - group.start, timeout: 120000 });
              break;
            } catch (error) { inFlight.delete(group.start); if (controller.signal.aborted || attempt === 2) throw error; }
          }
          for (const file of group.files) {
            controller.signal.throwIfAborted();
            const start = file.offset - group.start;
            const data = await unzip(bytes.subarray(start, start + file.packed), { maxOutputLength: Math.max(1, file.size) });
            if (data.length !== file.size || sha256(data) !== file.sha256) throw Error('游戏更新 SHA-256 校验失败：' + file.path);
            await fs.writeFile(contentPath(root, file.path), data, { flag: 'wx' });
          }
          inFlight.delete(group.start); transferred += bytes.length;
          progress({ phase: 'download', transferred, total, reusedFiles, reusedBytes, changedFiles: changed.length });
        }
      } catch (error) { firstError ??= error; controller.abort(); throw error; }
    });
    await Promise.allSettled(workers);
    if (firstError) throw firstError;
    controller.signal.throwIfAborted();
    // All reused files were hashed; downloaded files were bounded, decoded and hashed above.
    await verifyPayload(root, manifest, false);
    await fs.writeFile(path.join(stage, CONTENT_MANIFEST), manifestBytes, { flag: 'wx' });
    return { reference: { folder, digest: sha256(manifestBytes), version: manifest.version },
      manifest, root, transferred, reusedBytes, reusedFiles, changedFiles: changed.length };
  } finally { controller.abort(); signal?.removeEventListener('abort', abort); }
}
