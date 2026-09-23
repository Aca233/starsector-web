import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { listWebFiles } from './web-build-integrity.mjs';

const run = promisify(execFile);
const hash = data => createHash('sha256').update(data).digest('hex');
const relativeName = name => typeof name === 'string' && name && !/[\\:\0]/.test(name)
  && !name.startsWith('/') && name.split('/').every(p => p && p !== '.' && p !== '..');

function rewriteBitmapFont(name, original, converted) {
  if (!name.endsWith('.fnt')) return original;
  const text = original.toString('utf8');
  if (!Buffer.from(text).equals(original)) throw Error('Bitmap font descriptor is not UTF-8: ' + name);
  const parent = path.posix.dirname(name);
  const updated = text.replace(/(^page\b[^\r\n]*?\bfile=")([^"]+)(")/gm, (match, before, atlas, after) => {
    const target = converted.get(path.posix.normalize(parent + '/' + atlas.replaceAll('\\', '/')));
    return target ? before + path.posix.relative(parent, target.destination) + after : match;
  });
  return updated === text ? original : Buffer.from(updated);
}

/** Build a content-addressed public tree. Original assets are never rewritten or deleted. */
export async function stageWebpPublic(publicDirectory, cacheDirectory, manifest) {
  const publicRoot = await fs.realpath(publicDirectory);
  const cacheRoot = await fs.realpath(cacheDirectory);
  if (cacheRoot === publicRoot || cacheRoot.startsWith(publicRoot + path.sep)
      || publicRoot.startsWith(cacheRoot + path.sep)) throw Error('WebP cache must be separate from public resources');
  if (manifest.schema !== 1 || !Array.isArray(manifest.images)) throw Error('Invalid WebP encoder manifest');
  const converted = new Map();
  for (const entry of manifest.images) {
    if (!relativeName(entry.source) || !entry.source.startsWith('game-assets/graphics/')
        || entry.destination !== entry.source + '.webp' || converted.has(entry.source)
        || !/^[a-f0-9]{64}$/.test(entry.sourceSha256) || !/^[a-f0-9]{64}$/.test(entry.sha256)
        || !Number.isSafeInteger(entry.bytes) || entry.bytes < 1 || entry.bytes >= entry.sourceBytes) {
      throw Error('Invalid WebP image conversion entry');
    }
    const cached = await fs.realpath(entry.cacheFile);
    if (!cached.startsWith(cacheRoot + path.sep)) throw Error('WebP encoded payload escaped its cache');
    const data = await fs.readFile(cached);
    if (data.length !== entry.bytes || hash(data) !== entry.sha256
        || data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WEBP') throw Error(`Invalid cached WebP: ${entry.source}`);
    converted.set(entry.source, { ...entry, cacheFile: cached });
  }
  const names = await listWebFiles(publicRoot), originalNames = new Set(names);
  const expected = new Map(), aliases = {}, snapshot = createHash('sha256');
  for (const entry of converted.values()) {
    if (!originalNames.has(entry.source) || originalNames.has(entry.destination)) throw Error(`WebP destination/source conflict: ${entry.source}`);
    aliases[entry.source.slice('game-assets/'.length)] = entry.destination.slice('game-assets/'.length);
  }
  let beforeBytes = 0, afterBytes = 0;
  for (const name of names) {
    const source = path.join(publicRoot, name), data = await fs.readFile(source), sourceHash = hash(data);
    beforeBytes += data.length;
    snapshot.update(name + '\0' + sourceHash + '\0');
    const entry = converted.get(name);
    if (entry) {
      if (data.length !== entry.sourceBytes || sourceHash !== entry.sourceSha256) throw Error(`Image changed during WebP encoding: ${name}; rebuild`);
      expected.set(entry.destination, { source: entry.cacheFile, bytes: entry.bytes, sha256: entry.sha256 });
      afterBytes += entry.bytes;
    } else if (name === 'game-assets/asset-manifest.json') {
      const assets = JSON.parse(data.toString('utf8').replace(/^\uFEFF/, ''));
      if (!Array.isArray(assets)) throw Error('Invalid asset manifest');
      for (const asset of assets) {
        const replacement = converted.get('game-assets/' + asset.path);
        if (replacement) {
          // Logical IDs/sampler metadata remain stable; only physical path/provenance change.
          asset.path = replacement.destination.slice('game-assets/'.length);
          asset.bytes = replacement.bytes; asset.hash = replacement.sha256;
        }
        if (typeof asset.path === 'string' && asset.path.endsWith('.fnt')) {
          const fontName = 'game-assets/' + asset.path;
          if (originalNames.has(fontName)) {
            const originalFont = await fs.readFile(path.join(publicRoot, fontName));
            const physicalFont = rewriteBitmapFont(fontName, originalFont, converted);
            if (physicalFont !== originalFont) { asset.bytes = physicalFont.length; asset.hash = hash(physicalFont); }
          }
        }
        if (Array.isArray(asset.font?.glyphAtlases)) {
          asset.font.glyphAtlases = asset.font.glyphAtlases.map(atlas => aliases[atlas] ?? atlas);
        }
      }
      const bytes = Buffer.from(JSON.stringify(assets));
      expected.set(name, { data: bytes, bytes: bytes.length, sha256: hash(bytes) }); afterBytes += bytes.length;
    } else {
      const physical = rewriteBitmapFont(name, data, converted);
      expected.set(name, physical === data ? { source, bytes: data.length, sha256: sourceHash }
        : { data: physical, bytes: physical.length, sha256: hash(physical) });
      afterBytes += physical.length;
    }
  }
  for (const [name, item] of [...expected].sort(([a], [b]) => a.localeCompare(b))) snapshot.update(name + '\0' + item.sha256 + '\0');
  const directory = path.join(cacheRoot, 'public-' + snapshot.digest('hex').slice(0, 24));
  await fs.mkdir(directory, { recursive: true });
  const resolved = await fs.realpath(directory);
  if (!resolved.startsWith(cacheRoot + path.sep)) throw Error('WebP staging directory escaped its cache');
  for (const [name, item] of expected) {
    const target = path.join(resolved, name);
    await fs.mkdir(path.dirname(target), { recursive: true });
    try {
      if (item.data) await fs.writeFile(target, item.data, { flag: 'wx' });
      else {
        try { await fs.link(item.source, target); }
        catch (error) {
          if (error.code === 'EEXIST') throw error;
          // Cross-volume/no-hardlink environments still work, without mutating originals.
          if (!['EXDEV', 'EPERM', 'ENOTSUP', 'EACCES'].includes(error.code)) throw error;
          await fs.copyFile(item.source, target, 1);
        }
      }
    } catch (error) { if (error.code !== 'EEXIST') throw error; }
    const actual = await fs.readFile(target);
    if (actual.length !== item.bytes || hash(actual) !== item.sha256) throw Error(`WebP staging file differs from source plan: ${name}`);
  }
  const actual = await listWebFiles(resolved);
  if (actual.length !== expected.size || actual.some(name => !expected.has(name))) throw Error('WebP staging directory has unexpected files');
  return { directory: resolved, aliases, manifest,
    summary: { convertedImages: converted.size, skippedImages: manifest.skipped?.length ?? 0,
      sourcePublicBytes: beforeBytes, optimizedPublicBytes: afterBytes, savedBytes: beforeBytes - afterBytes,
      imageSavedBytes: [...converted.values()].reduce((sum, entry) => sum + entry.sourceBytes - entry.bytes, 0),
      lossless: true, sourceResourcesUnchanged: true } };
}

export async function prepareWebpAssets(project, publicDirectory = path.join(project, 'public')) {
  const cache = path.resolve(project, '.vite/webp');
  await fs.mkdir(cache, { recursive: true });
  const manifestPath = path.join(cache, `manifest-${process.pid}-${randomUUID()}.json`);
  const python = process.env.STARSECTOR_PYTHON || 'python';
  try {
    await run(python, [path.join(project, 'scripts/encode-webp-assets.py'), '--public', publicDirectory,
      '--cache', cache, '--manifest', manifestPath], { cwd: project, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  } catch (cause) {
    throw Error(`Lossless WebP preparation failed. Install Python 3 + Pillow with WebP support (python -m pip install Pillow), or set STARSECTOR_PYTHON. ${cause.stderr || cause.message}`, { cause });
  }
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  return stageWebpPublic(publicDirectory, cache, manifest);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = await prepareWebpAssets(project);
  console.log(JSON.stringify({ directory: result.directory, ...result.summary }, null, 2));
}
