import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const WEB_BUILD_MANIFEST = 'web-build-manifest.json';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fingerprint = bytes => ({ bytes: bytes.length, sha256: digest(bytes) });

/** Enumerate only ordinary files: never follow a link outside the output tree. */
export async function listWebFiles(directory) {
  const root = path.resolve(directory), files = [];
  const walk = async folder => {
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (entry.isSymbolicLink()) throw Error(`Web build contains a symbolic link: ${file}`);
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile()) files.push(path.relative(root, file).replaceAll('\\', '/'));
    }
  };
  await walk(root);
  return files.sort();
}

function validFileName(name) {
  return typeof name === 'string' && name.length > 0 && !name.includes('\\')
    && !name.includes(':') && !name.includes('\0') && !name.startsWith('/')
    && name.split('/').every(part => part && part !== '.' && part !== '..')
    && name !== WEB_BUILD_MANIFEST;
}

function compareNames(expected, actual) {
  const wanted = new Set(expected), found = new Set(actual.filter(name => name !== WEB_BUILD_MANIFEST));
  const extra = [...found].filter(name => !wanted.has(name));
  const missing = [...wanted].filter(name => !found.has(name));
  if (extra.length || missing.length) throw Error(`Mixed or incomplete Web build. Rebuild into an empty output directory; do not merge builds. Extra: ${extra.slice(0, 8).join(', ') || 'none'}; missing: ${missing.slice(0, 8).join(', ') || 'none'}`);
}

/** Called by Vite after writing. Only this build's Rollup outputs + current public files belong. */
export async function writeWebBuildManifest(directory, bundleFiles, publicDirectory) {
  const expected = new Set(bundleFiles);
  if ([...expected].some(name => !validFileName(name))) throw Error('Invalid or reserved Web bundle filename');
  const publicFiles = publicDirectory ? await listWebFiles(publicDirectory) : [];
  for (const name of publicFiles) {
    if (!validFileName(name) || expected.has(name)) throw Error(`Public resource shadows a build output: ${name}`);
    expected.add(name);
  }
  await compareNames([...expected], await listWebFiles(directory));
  const files = [];
  const publicSet = new Set(publicFiles);
  for (const name of [...expected].sort()) {
    const record = { path: name, ...fingerprint(await fs.readFile(path.join(directory, name))) };
    if (publicSet.has(name)) {
      const source = fingerprint(await fs.readFile(path.join(publicDirectory, name)));
      if (source.bytes !== record.bytes || source.sha256 !== record.sha256) {
        throw Error(`Copied public resource is stale or changed during build: ${name}. Rebuild before packaging.`);
      }
    }
    files.push(record);
  }
  const manifest = { schema: 1, files };
  await fs.writeFile(path.join(directory, WEB_BUILD_MANIFEST), JSON.stringify(manifest) + '\n');
  return manifest;
}

/** Packaging guard: --skip-build must not silently ship old chunks or stale copied fonts. */
export async function assertCleanWebBuild(directory) {
  let manifest;
  try { manifest = JSON.parse(await fs.readFile(path.join(directory, WEB_BUILD_MANIFEST), 'utf8')); }
  catch (cause) { throw Error('No valid Web build manifest. Run npm run build before packaging (including --skip-build).', { cause }); }
  if (manifest.schema !== 1 || !Array.isArray(manifest.files) || !manifest.files.length
      || manifest.files.some(file => !file || !validFileName(file.path) || !Number.isSafeInteger(file.bytes)
        || file.bytes < 0 || !/^[a-f0-9]{64}$/.test(file.sha256))
      || new Set(manifest.files.map(file => file.path)).size !== manifest.files.length) {
    throw Error('Invalid Web build manifest');
  }
  compareNames(manifest.files.map(file => file.path), await listWebFiles(directory));
  for (const file of manifest.files) {
    const actual = fingerprint(await fs.readFile(path.join(directory, file.path)));
    if (actual.bytes !== file.bytes || actual.sha256 !== file.sha256) throw Error(`Web build file changed after build: ${file.path}. Rebuild before packaging.`);
  }
  return { files: manifest.files.length, bytes: manifest.files.reduce((sum, file) => sum + file.bytes, 0) };
}
