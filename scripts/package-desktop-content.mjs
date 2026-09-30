import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import asar from '@electron/asar';
import { CONTENT_MANIFEST, CONTENT_REPOSITORY, CONTENT_SCHEMA, MAX_MANIFEST_BYTES, contentAsset, hashFile, parseManifest, sha256, verifyPayload } from '../desktop/content-manifest.mjs';

async function filesIn(root, prefix = '') {
  const result = [];
  for (const entry of await fs.readdir(path.join(root, prefix), { withFileTypes: true })) {
    const relative = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.isSymbolicLink()) throw Error('Content packaging refuses links: ' + relative);
    if (entry.isDirectory()) result.push(...await filesIn(root, relative));
    else if (entry.isFile()) result.push(relative);
    else throw Error('Content packaging refuses special files: ' + relative);
  }
  return result.sort();
}
/** Fingerprint actual shipped shell bytes, not source version strings. Normalize only app package.version. */
export async function runtimeFingerprint(appOutDir, electronExecutable) {
  const hash = createHash('sha256');
  const add = (file, digest) => hash.update(JSON.stringify([file, digest]) + '\n');
  // electron-builder stamps app version/ASAR integrity into the branded EXE every release.
  // Hash the original Electron executable instead so branding alone is not a runtime upgrade.
  add('electron.exe', await hashFile(electronExecutable));
  for (const file of await filesIn(appOutDir)) {
    if (file.startsWith('resources/backend/') || file.startsWith('resources/licenses/')
      || ['Starsector Web.exe', 'resources/' + CONTENT_MANIFEST, 'resources/desktop-guide.md', 'resources/app-update.yml'].includes(file)) continue;
    if (file === 'resources/app.asar') {
      const archive = path.join(appOutDir, file);
      for (const name of asar.listPackage(archive).map(n => n.replaceAll('\\', '/').replace(/^\//, '')).sort()) {
        const archiveName = name.split('/').join(path.sep);
        const stat = asar.statFile(archive, archiveName, false);
        if (stat.files) continue;
        if (stat.link) throw Error('Shell ASAR contains a link');
        let bytes = asar.extractFile(archive, archiveName, false);
        if (name === 'package.json') {
          const pkg = JSON.parse(bytes.toString()); delete pkg.version;
          bytes = Buffer.from(JSON.stringify(pkg));
        }
        add(file + '/' + name, sha256(bytes));
      }
    } else add(file, await hashFile(path.join(appOutDir, file)));
  }
  // Native/backend dependencies cannot change through the lightweight update path.
  const backend = path.join(appOutDir, 'resources', 'backend');
  for (const file of await filesIn(path.join(backend, 'node_modules'))) {
    add('backend/node_modules/' + file, await hashFile(path.join(backend, 'node_modules', file)));
  }
  return hash.digest('hex');
}
export async function buildContentBundle({ backend, output, version, build, runtime, baseManifestPath }) {
  await fs.mkdir(output, { recursive: true });
  const manifest = { schema: CONTENT_SCHEMA, repository: CONTENT_REPOSITORY, platform: 'win32', arch: 'x64',
    version, build, runtime, asset: contentAsset(version), bytes: 0, files: [] };
  const handle = await fs.open(path.join(output, manifest.asset), 'wx');
  try {
    for (const file of await filesIn(backend)) {
      const data = await fs.readFile(path.join(backend, file));
      const compressed = gzipSync(data, { level: 6 });
      manifest.files.push({ path: file, size: data.length, sha256: sha256(data), offset: manifest.bytes, packed: compressed.length });
      await handle.writeFile(compressed);
      manifest.bytes += compressed.length;
    }
    await handle.sync();
  } finally { await handle.close(); }
  const bytes = Buffer.from(JSON.stringify(manifest));
  if (bytes.length > MAX_MANIFEST_BYTES) throw Error('Content manifest exceeds updater bound');
  parseManifest(bytes);
  await verifyPayload(backend, manifest, false);
  await fs.writeFile(path.join(output, CONTENT_MANIFEST), bytes);
  if (baseManifestPath) await fs.writeFile(baseManifestPath, bytes);
  return manifest;
}
