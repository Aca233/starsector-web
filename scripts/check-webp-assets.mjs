import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { transform, build } from 'esbuild';
import { stageWebpPublic } from './prepare-webp-assets.mjs';
import { listWebFiles } from './web-build-integrity.mjs';
const hash = data => createHash('sha256').update(data).digest('hex');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'starsector-webp-stage-'));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(tmpdir()));
    assert.ok(path.basename(root).startsWith('starsector-webp-stage-'));
    await fs.rm(root, { recursive: true, force: true });
  });
  const publicDir = path.join(root, 'public'), cache = path.join(root, 'cache');
  await fs.mkdir(path.join(publicDir, 'game-assets/graphics'), { recursive: true }); await fs.mkdir(cache);
  const source = Buffer.from('original png placeholder; codec pixel validation is covered by encoder tests');
  const encoded = Buffer.from('RIFF0000WEBP');
  const name = 'game-assets/graphics/atlas.png', cacheFile = path.join(cache, 'test.webp');
  await fs.writeFile(path.join(publicDir, name), source); await fs.writeFile(cacheFile, encoded);
  await fs.writeFile(path.join(publicDir, 'game-assets/sound.ogg'), 'unchanged audio');
  await fs.writeFile(path.join(publicDir, 'game-assets/font.fnt'), 'info face="original"\r\npage id=0 file="graphics/atlas.png"\r\nchar id=65 x=2\r\n');
  await fs.writeFile(path.join(publicDir, 'game-assets/asset-manifest.json'), JSON.stringify([
    { id: 'graphics/atlas.png', path: 'graphics/atlas.png', type: 'image', sampler: { wrap: 'clamp' }, bytes: source.length, hash: hash(source) },
    { id: 'font', path: 'font.fnt', type: 'font', font: { glyphAtlases: ['graphics/atlas.png'] } },
  ]));
  const manifest = { schema: 1, images: [{ source: name, destination: name + '.webp', sourceBytes: source.length,
    sourceSha256: hash(source), bytes: encoded.length, sha256: hash(encoded), cacheFile }], skipped: [] };
  return { root, publicDir, cache, source, encoded, manifest, name };
}

test('WebP stage substitutes physical files, updates provenance, and leaves original/audio bytes intact', async t => {
  const f = await fixture(t), result = await stageWebpPublic(f.publicDir, f.cache, f.manifest);
  assert.equal(result.aliases['graphics/atlas.png'], 'graphics/atlas.png.webp');
  const files = await listWebFiles(result.directory);
  assert.ok(files.includes(f.name + '.webp')); assert.ok(!files.includes(f.name));
  assert.deepEqual(await fs.readFile(path.join(f.publicDir, f.name)), f.source);
  assert.equal(await fs.readFile(path.join(result.directory, 'game-assets/sound.ogg'), 'utf8'), 'unchanged audio');
  const assets = JSON.parse(await fs.readFile(path.join(result.directory, 'game-assets/asset-manifest.json'), 'utf8'));
  assert.equal(assets[0].id, 'graphics/atlas.png'); assert.equal(assets[0].path, 'graphics/atlas.png.webp');
  assert.equal(assets[0].hash, hash(f.encoded)); assert.deepEqual(assets[0].sampler, { wrap: 'clamp' });
  assert.deepEqual(assets[1].font.glyphAtlases, ['graphics/atlas.png.webp']);
  const font = await fs.readFile(path.join(result.directory, 'game-assets/font.fnt'), 'utf8');
  assert.equal(font, 'info face="original"\r\npage id=0 file="graphics/atlas.png.webp"\r\nchar id=65 x=2\r\n');
  assert.equal(assets[1].hash, hash(Buffer.from(font)));
  assert.ok((await fs.readFile(path.join(f.publicDir, 'game-assets/font.fnt'), 'utf8')).includes('file="graphics/atlas.png"'));
  assert.equal((await stageWebpPublic(f.publicDir, f.cache, f.manifest)).directory, result.directory);
});

test('stale source or encoded cache is rejected instead of silently substituting wrong pixels', async t => {
  const f = await fixture(t);
  f.manifest.images[0].sourceSha256 = '0'.repeat(64);
  await assert.rejects(stageWebpPublic(f.publicDir, f.cache, f.manifest), /changed during WebP encoding/);
  f.manifest.images[0].sourceSha256 = hash(f.source); f.manifest.images[0].sha256 = '0'.repeat(64);
  await assert.rejects(stageWebpPublic(f.publicDir, f.cache, f.manifest), /Invalid cached WebP/);
});

test('path escape, existing destination and cache inside original public resources are rejected', async t => {
  const f = await fixture(t);
  f.manifest.images[0].destination = '../escape.webp';
  await assert.rejects(stageWebpPublic(f.publicDir, f.cache, f.manifest), /Invalid WebP image conversion/);
  f.manifest.images[0].destination = f.name + '.webp';
  await fs.writeFile(path.join(f.publicDir, f.name + '.webp'), 'user asset');
  await assert.rejects(stageWebpPublic(f.publicDir, f.cache, f.manifest), /destination\/source conflict/);
  await assert.rejects(stageWebpPublic(f.publicDir, f.publicDir, f.manifest), /separate from public/);
});

const alias = { 'graphics/atlas.png': 'graphics/atlas.png.webp' };
async function runtime(base, aliases = alias) {
  const source = await fs.readFile('src/engine/runtime/RuntimePaths.ts', 'utf8');
  const { code } = await transform(source, { loader: 'ts', format: 'esm', define: {
    'import.meta.env.BASE_URL': JSON.stringify(base), __WEBP_ASSET_MAP__: JSON.stringify(aliases),
  } });
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}

test('runtime aliases support root/subdirectory deployments, repeat resolution, queries, external URLs and originals', async () => {
  for (const base of ['./', '/', '/nested/']) {
    const r = await runtime(base), prefix = base + 'game-assets/';
    for (const source of ['graphics/atlas.png', '/game-assets/graphics/atlas.png', './game-assets/graphics/atlas.png', prefix + 'graphics/atlas.png']) {
      const url = r.runtimeAssetUrl(source + '?v=2#glyph');
      assert.equal(url, prefix + 'graphics/atlas.png.webp?v=2#glyph'); assert.equal(r.runtimeAssetUrl(url), url);
    }
    assert.equal(r.runtimeAssetUrl('graphics/retained.jpg'), prefix + 'graphics/retained.jpg');
    assert.equal(r.runtimeAssetUrl('sounds/loop.ogg'), prefix + 'sounds/loop.ogg');
    for (const external of ['https://example.test/image.png', '//example.test/image.png', 'data:image/png;base64,AA', 'blob:123']) assert.equal(r.runtimeAssetUrl(external), external);
  }
  assert.equal((await runtime('./', {})).runtimeAssetUrl('graphics/atlas.png'), './game-assets/graphics/atlas.png');
});

test('texture AssetResolver resolves aliases while keeping original logical normalization', async () => {
  const result = await build({ entryPoints: ['src/engine/assets/AssetResolver.ts'], bundle: true, write: false, format: 'esm', platform: 'browser',
    define: { 'import.meta.env.BASE_URL': '"./"', __WEBP_ASSET_MAP__: JSON.stringify(alias) } });
  const { AssetResolver, AssetManager } = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
  const resolver = new AssetResolver();
  assert.equal(resolver.normalize('/game-assets/graphics/atlas.png'), 'graphics/atlas.png');
  assert.equal(resolver.url('/game-assets/graphics/atlas.png'), './game-assets/graphics/atlas.png.webp');
  assert.throws(() => resolver.normalize('../../outside.png'), /escapes/);
  const originalFetch = globalThis.fetch;
  const sampler = { wrap: 'repeat', minFilter: 'linear', magFilter: 'linear', mipmap: true };
  globalThis.fetch = async () => ({ ok: true, json: async () => [{ id: 'graphics/atlas.png', path: 'graphics/atlas.png.webp', type: 'image', group: 'graphics', sampler }] });
  try {
    const manager = new AssetManager(); await manager.loadManifest();
    assert.deepEqual(manager.getByPath('/game-assets/graphics/atlas.png').sampler, sampler);
    assert.deepEqual(manager.getByPath('./game-assets/graphics/atlas.png.webp').sampler, sampler);
    assert.equal(manager.resolve('graphics/atlas.png'), './game-assets/graphics/atlas.png.webp');
  } finally { globalThis.fetch = originalFetch; }
});
