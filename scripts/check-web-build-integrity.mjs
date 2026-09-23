import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { assertCleanWebBuild, writeWebBuildManifest, WEB_BUILD_MANIFEST } from './web-build-integrity.mjs';

async function fixture(t) {
  const prefix = path.join(tmpdir(), 'starsector-web-integrity-');
  const root = await fs.mkdtemp(prefix);
  t.after(async () => {
    const resolved = path.resolve(root);
    if (!resolved.startsWith(path.resolve(prefix)) || path.dirname(resolved) !== path.resolve(tmpdir())) throw Error('Unsafe fixture cleanup');
    await fs.rm(resolved, { recursive: true, force: true });
  });
  const output = path.join(root, 'output'), publicDir = path.join(root, 'public');
  await fs.mkdir(path.join(output, 'assets'), { recursive: true });
  await fs.mkdir(publicDir);
  await fs.writeFile(path.join(publicDir, 'font.png'), 'unchanged optimized font bytes');
  await fs.copyFile(path.join(publicDir, 'font.png'), path.join(output, 'font.png'));
  await fs.writeFile(path.join(output, 'index.html'), '<script src="./assets/main-new.js"></script>');
  await fs.writeFile(path.join(output, 'assets/main-new.js'), 'console.log("current");');
  const bundle = ['index.html', 'assets/main-new.js'];
  return { output, publicDir, bundle, write: () => writeWebBuildManifest(output, bundle, publicDir) };
}

test('fresh build preserves public resources and verifies exact output contents', async t => {
  const f = await fixture(t), manifest = await f.write();
  const audit = await assertCleanWebBuild(f.output);
  assert.equal(audit.files, 3);
  assert.equal(audit.bytes, manifest.files.reduce((sum, entry) => sum + entry.bytes, 0));
  assert.deepEqual(manifest.files.map(entry => entry.path), ['assets/main-new.js', 'font.png', 'index.html']);
});

test('merged stale hashed chunk fails without deleting anything', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.output, 'assets/main-old.js'), 'old build');
  await assert.rejects(f.write(), /Mixed or incomplete/);
  assert.equal(await fs.readFile(path.join(f.output, 'assets/main-old.js'), 'utf8'), 'old build');
});

test('stale copied font fails before writing manifest', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.output, 'font.png'), 'outdated large font');
  await assert.rejects(f.write(), /Copied public resource is stale/);
  await assert.rejects(fs.access(path.join(f.output, WEB_BUILD_MANIFEST)), { code: 'ENOENT' });
});

test('package guard rejects extra files, changed files and missing files', async t => {
  const f = await fixture(t); await f.write();
  const extra = path.join(f.output, 'old.json');
  await fs.writeFile(extra, '{}');
  await assert.rejects(assertCleanWebBuild(f.output), /Mixed or incomplete/);
  await fs.unlink(extra);
  await fs.writeFile(path.join(f.output, 'font.png'), 'modified resource');
  await assert.rejects(assertCleanWebBuild(f.output), /changed after build/);
  await fs.unlink(path.join(f.output, 'font.png'));
  await assert.rejects(assertCleanWebBuild(f.output), /Mixed or incomplete/);
});

test('package guard rejects legacy unaudited builds', async t => {
  const f = await fixture(t);
  await assert.rejects(assertCleanWebBuild(f.output), /Run npm run build/);
});

test('manifest cannot reference paths outside the build or duplicate entries', async t => {
  const f = await fixture(t), manifest = await f.write();
  manifest.files[0].path = '../outside';
  await fs.writeFile(path.join(f.output, WEB_BUILD_MANIFEST), JSON.stringify(manifest));
  await assert.rejects(assertCleanWebBuild(f.output), /Invalid Web build manifest/);
  const clean = await f.write();
  clean.files.push(clean.files[0]);
  await fs.writeFile(path.join(f.output, WEB_BUILD_MANIFEST), JSON.stringify(clean));
  await assert.rejects(assertCleanWebBuild(f.output), /Invalid Web build manifest/);
});

test('public files cannot shadow generated assets', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.publicDir, 'index.html'), 'stale html');
  await assert.rejects(f.write(), /shadows a build output/);
});
