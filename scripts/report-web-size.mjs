import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { brotliCompress, gzip, constants } from 'node:zlib';
import { assertCleanWebBuild, listWebFiles, WEB_BUILD_MANIFEST } from './web-build-integrity.mjs';
import { isCompressibleStaticAsset } from '../server/StaticAssetResponse.mjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.resolve(project, process.argv[2] ?? 'dist');
const brotli = promisify(brotliCompress), gz = promisify(gzip);
const files = await listWebFiles(directory);
const verified = files.includes(WEB_BUILD_MANIFEST) ? await assertCleanWebBuild(directory) : null;
const extensions = {}, largest = [];
let bytes = 0, compressibleBytes = 0, gzipBytes = 0, brotliBytes = 0;
for (const name of files) {
  const size = (await fs.stat(path.join(directory, name))).size;
  bytes += size;
  const extension = path.extname(name) || '[none]';
  extensions[extension] = (extensions[extension] ?? 0) + size;
  largest.push({ path: name, bytes: size });
  if (!isCompressibleStaticAsset(name)) continue;
  const data = await fs.readFile(path.join(directory, name));
  compressibleBytes += size;
  gzipBytes += Math.min(size, (await gz(data, { level: 6 })).length);
  brotliBytes += Math.min(size, (await brotli(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } })).length);
}
console.log(JSON.stringify({ directory, verified: Boolean(verified), files: files.length, bytes,
  extensions: Object.fromEntries(Object.entries(extensions).sort((a, b) => b[1] - a[1])),
  transferEstimate: { compressibleBytes, gzipBytes, brotliBytes,
    note: 'Sum of all eligible files, not first-page traffic, ZIP size or runtime memory. HTTP caching/loading patterns also matter.' },
  largest: largest.sort((a, b) => b.bytes - a.bytes).slice(0, 12),
}, null, 2));
