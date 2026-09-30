import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { test, after } from 'node:test';
import asar from '@electron/asar';
import { buildContentBundle, runtimeFingerprint } from './package-desktop-content.mjs';
import { CONTENT_MANIFEST, contentAsset, parseManifest, safeRelative, sha256 } from '../desktop/content-manifest.mjs';
import { CONTENT_LATEST, fetchContentBytes } from '../desktop/content-network.mjs';
import { stageContentUpdate, changedRanges } from '../desktop/content-stage.mjs';
import { ContentStore } from '../desktop/content-store.mjs';
import { checkContentUpdate } from '../desktop/content-updates.mjs';

const parent = path.resolve('artifacts');
await fs.mkdir(parent, { recursive: true });
const root = await fs.mkdtemp(path.join(parent, 'content-updater-test-'));
after(async () => {
  const real = await fs.realpath(root), workspace = await fs.realpath(parent);
  if (!real.startsWith(workspace + path.sep) || !path.basename(real).startsWith('content-updater-test-')) throw Error('Refuse unsafe test cleanup');
  await fs.rm(real, { recursive: true, force: true });
});
const runtime = '1'.repeat(64);
const art = randomBytes(256 * 1024);
let serial = 0;
async function write(rootDir, name, bytes) {
  const target = path.join(rootDir, name); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, bytes);
}
async function fixture(version, extras = {}, runtimeId = runtime) {
  const dir = path.join(root, `fixture-${serial++}`), backend = path.join(dir, 'backend'), output = path.join(dir, 'output');
  const build = `build-${version}`;
  for (const [file, data] of Object.entries({
    'package.json': JSON.stringify({ name: 'content-test-backend', version, type: 'module' }),
    'desktop-build.json': JSON.stringify({ version, build }),
    'dist/lan-build.json': JSON.stringify({ build }),
    'dist/index.html': '<html>content updater fixture</html>',
    'server/electron-service.mjs': 'export const service = true;',
    'node_modules/native/package.json': '{"name":"native","version":"1"}',
    'dist/art.bin': art, 'dist/obsolete.txt': 'removed in next version', ...extras,
  })) if (data !== null) await write(backend, file, data);
  const manifest = await buildContentBundle({ backend, output, version, build, runtime: runtimeId });
  const bytes = await fs.readFile(path.join(output, CONTENT_MANIFEST));
  const bundle = await fs.readFile(path.join(output, contentAsset(version)));
  return { root: backend, manifest, bytes, bundle, output };
}
function transport(fixture, options = {}) {
  const calls = [];
  let active = 0, maximum = 0;
  return { calls, maximum: () => maximum, fetchImpl: async (url, request) => {
    if (url === CONTENT_LATEST) return new Response(options.manifestBytes ?? fixture.bytes);
    assert.match(url, new RegExp(`/v${fixture.manifest.version}/Starsector-Web-Content-`));
    assert.equal(request.redirect, 'manual');
    const [, start, end] = request.headers.Range.match(/^bytes=(\d+)-(\d+)$/).map(Number);
    calls.push({ start, end }); active++; maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 2)); active--;
    if (options.fail) throw Error('test offline');
    let bytes = fixture.bundle.subarray(start, end + 1);
    if (options.corrupt) { bytes = Buffer.from(bytes); bytes[0] ^= 1; }
    return new Response(bytes, { status: options.status ?? 206,
      headers: { 'Content-Range': `bytes ${start}-${end}/${fixture.bundle.length}` } });
  } };
}
async function freshStore(base) {
  const storage = path.join(root, `store-${serial++}`);
  const args = { baseRoot: base.root, baseManifest: base.manifest, storage };
  const store = new ContentStore(args); await store.begin();
  return { store, restart: async () => { const next = new ContentStore(args); await next.begin(); return next; } };
}
const base = await fixture('1.0.0');
const next = await fixture('1.0.1', { 'server/game.mjs': 'export const fixed = true;', 'dist/obsolete.txt': null });

test('file-level update transfers only changed compressed bytes; unchanged art is hardlinked; removed files do not leak', async () => {
  const { store } = await freshStore(base), net = transport(next);
  const staged = await stageContentUpdate({ storage: store.storage, manifestBytes: next.bytes, source: store.current, fetchImpl: net.fetchImpl });
  const oldHashes = new Set(base.manifest.files.map(f => f.sha256));
  const changed = next.manifest.files.filter(f => !oldHashes.has(f.sha256));
  assert.equal(staged.transferred, changed.reduce((n, f) => n + f.packed, 0));
  assert.equal(staged.changedFiles, 4);
  assert.ok(staged.transferred < next.bundle.length / 100);
  assert.ok(net.maximum() <= 4);
  assert.equal((await fs.stat(path.join(base.root, 'dist/art.bin'))).ino, (await fs.stat(path.join(staged.root, 'dist/art.bin'))).ino);
  await assert.rejects(fs.access(path.join(staged.root, 'dist/obsolete.txt')));
  assert.equal(store.current.root, base.root, 'staging does not switch the running service');
  assert.equal(store.state.pending, null, 'no activation before confirmation');
  console.log(JSON.stringify({ scenario: '256KiB unchanged art + four small changed files', downloaded: staged.transferred,
    fullBundle: next.bundle.length, reusedBytes: staged.reusedBytes, changedFiles: staged.changedFiles }));
});

test('explicit activation, trial startup, healthy commit, and offline next boot', async () => {
  const { store, restart } = await freshStore(base);
  const staged = await stageContentUpdate({ storage: store.storage, manifestBytes: next.bytes, source: store.current, fetchImpl: transport(next).fetchImpl });
  await store.activate(staged.reference);
  assert.equal(store.current.manifest.version, '1.0.0');
  const trial = await restart();
  assert.equal(trial.current.manifest.version, '1.0.1'); assert.equal(trial.state.trial, true);
  await trial.healthy();
  assert.equal((await restart()).current.manifest.version, '1.0.1');
});

test('crash before healthy marker rolls back and skips the failed version', async () => {
  const { store, restart } = await freshStore(base);
  const staged = await stageContentUpdate({ storage: store.storage, manifestBytes: next.bytes, source: store.current, fetchImpl: transport(next).fetchImpl });
  await store.activate(staged.reference); await restart();
  const recovered = await restart();
  assert.equal(recovered.current.root, base.root); assert.equal(recovered.state.skipped, '1.0.1');
  const net = transport(next);
  assert.deepEqual(await checkContentUpdate({ store: recovered, fetchImpl: net.fetchImpl, notify: () => {}, log: () => {} }), { current: true });
  assert.equal(net.calls.length, 0);
});

test('second failed update rolls back to previous healthy content version, not factory installation', async () => {
  const { store, restart } = await freshStore(base);
  const first = await stageContentUpdate({ storage: store.storage, manifestBytes: next.bytes, source: store.current, fetchImpl: transport(next).fetchImpl });
  await store.activate(first.reference);
  const healthy = await restart(); await healthy.healthy();
  const newer = await fixture('1.0.2');
  const second = await stageContentUpdate({ storage: store.storage, manifestBytes: newer.bytes, source: healthy.current, fetchImpl: transport(newer).fetchImpl });
  await healthy.activate(second.reference);
  const failed = await restart(); assert.equal(await failed.rollback(), true);
  assert.equal((await restart()).current.manifest.version, '1.0.1');
});

test('corrupt downloaded chunks or unsupported ranges never become pending updates', async () => {
  for (const options of [{ corrupt: true }, { status: 200 }, { fail: true }]) {
    const { store } = await freshStore(base);
    await assert.rejects(stageContentUpdate({ storage: store.storage, manifestBytes: next.bytes, source: store.current, fetchImpl: transport(next, options).fetchImpl }));
    assert.equal(store.state.pending, null); assert.equal(store.current.root, base.root);
  }
});

test('cancelled preparation never activates or deletes existing files', async () => {
  const { store } = await freshStore(base);
  await assert.rejects(stageContentUpdate({ storage: store.storage, manifestBytes: next.bytes, source: store.current,
    fetchImpl: transport(next).fetchImpl, signal: AbortSignal.abort() }));
  assert.equal(await fs.readFile(path.join(base.root, 'dist/obsolete.txt'), 'utf8'), 'removed in next version');
});

test('tampered staged file is rejected before activation, and again before trial startup', async () => {
  const { store, restart } = await freshStore(base);
  const staged = await stageContentUpdate({ storage: store.storage, manifestBytes: next.bytes, source: store.current, fetchImpl: transport(next).fetchImpl });
  const target = path.join(staged.root, 'server/game.mjs');
  await fs.writeFile(target, 'corrupt');
  await assert.rejects(store.activate(staged.reference), /校验失败/);
  await fs.writeFile(target, 'export const fixed = true;'); await store.activate(staged.reference);
  await fs.writeFile(target, 'corrupt after activation');
  const recovered = await restart();
  assert.equal(recovered.current.root, base.root); assert.equal(recovered.state.skipped, '1.0.1');
});

test('corrupt local source file is repaired from network instead of reused', async () => {
  const isolated = await fixture('1.0.0');
  await fs.writeFile(path.join(isolated.root, 'dist/art.bin'), Buffer.alloc(art.length));
  const { store } = await freshStore(isolated), net = transport(next);
  const staged = await stageContentUpdate({ storage: store.storage, manifestBytes: next.bytes, source: store.current, fetchImpl: net.fetchImpl });
  assert.equal(sha256(await fs.readFile(path.join(staged.root, 'dist/art.bin'))), sha256(art));
  assert.equal(staged.changedFiles, 5);
});

test('new shell/native runtime uses installer fallback; same or older content does not offer shell version again', async () => {
  const { store } = await freshStore(base);
  for (const [f, expected] of [[await fixture('1.0.1', {}, '2'.repeat(64)), false], [base, { current: true }]]) {
    const net = transport(f);
    assert.deepEqual(await checkContentUpdate({ store, fetchImpl: net.fetchImpl, notify: () => {}, log: () => {} }), expected);
    assert.equal(net.calls.length, 0);
  }
  assert.equal(await checkContentUpdate({ store, fetchImpl: async () => new Response(null, { status: 404 }), notify: () => {}, log: () => {} }), false);
});

test('unsafe paths, duplicate aliases, missing entries, malformed offsets and oversized entries are rejected', () => {
  for (const unsafe of ['../escape', '/absolute', 'a\\b', 'a/../b', 'C:/x', 'a:stream', 'a/NUL.txt', 'a/trailing.', 'a//b', 'a/COM¹']) assert.throws(() => safeRelative(unsafe));
  for (const mutate of [m => { m.files[0].path = '../escape'; }, m => { m.files[1].path = m.files[0].path.toUpperCase(); },
    m => { m.files[0].offset = 1; }, m => { m.files[0].size = 2 ** 40; }, m => { m.version = '../2'; },
    m => { m.runtime = 'wrong'; }, m => { m.asset = 'evil.bin'; }, m => { m.bytes--; },
    m => { m.files.find(f => f.path === 'dist/index.html').path = 'dist/other.html'; }]) {
    const copy = structuredClone(next.manifest); mutate(copy); assert.throws(() => parseManifest(Buffer.from(JSON.stringify(copy))));
  }
});

test('state references cannot traverse outside the content storage', async () => {
  const { store } = await freshStore(base);
  await assert.rejects(store.resolve({ folder: '../../outside', digest: '1'.repeat(64), version: '1.0.1' }));
});

test('range request enforces HTTPS hosts, redirect targets, exact range and bounded body', async () => {
  await assert.rejects(fetchContentBytes('http://github.com/x', { limit: 10 }), /HTTPS/);
  await assert.rejects(fetchContentBytes(CONTENT_LATEST, { limit: 10,
    fetchImpl: async () => new Response(null, { status: 302, headers: { Location: 'https://evil.example/x' } }) }), /HTTPS/);
  await assert.rejects(fetchContentBytes(CONTENT_LATEST, { limit: 3, fetchImpl: async () => new Response('too long') }), /大小限制/);
  await assert.rejects(fetchContentBytes(CONTENT_LATEST, { limit: 3, range: [0, 2], total: 3,
    fetchImpl: async () => new Response('ab', { status: 206, headers: { 'Content-Range': 'bytes 0-2/3' } }) }), /截断/);
});

test('range grouping never includes an unchanged gap', () => {
  assert.deepEqual(changedRanges([{ offset: 0, packed: 10 }, { offset: 10, packed: 10 }, { offset: 30, packed: 10 }]).map(g => [g.start, g.end]), [[0, 20], [30, 40]]);
});

test('runtime fingerprint ignores version branding but detects shell code, dependency and Electron changes', async () => {
  const dir = path.join(root, 'fingerprint'), app = path.join(dir, 'app'), source = path.join(dir, 'source'), electron = path.join(dir, 'electron.exe');
  await write(dir, 'electron.exe', 'stable Electron');
  await write(app, 'resources/backend/node_modules/native/addon.node', 'stable native binary');
  await write(source, 'desktop/main.mjs', 'stable shell');
  await write(source, 'node_modules/example/deep/entry.js', 'nested dependency path');
  await write(source, 'package.json', '{"name":"test","version":"1.0.0"}');
  const archive = path.join(app, 'resources/app.asar');
  await asar.createPackage(source, archive);
  const first = await runtimeFingerprint(app, electron);
  await write(source, 'package.json', '{"name":"test","version":"1.0.1"}');
  await write(app, 'Starsector Web.exe', 'version-stamped executable');
  await asar.createPackage(source, archive); asar.uncacheAll();
  assert.equal(await runtimeFingerprint(app, electron), first);
  await write(source, 'desktop/main.mjs', 'changed shell');
  await asar.createPackage(source, archive); asar.uncacheAll();
  const changed = await runtimeFingerprint(app, electron); assert.notEqual(changed, first);
  await write(app, 'resources/backend/node_modules/native/addon.node', 'changed native binary');
  const native = await runtimeFingerprint(app, electron); assert.notEqual(native, changed);
  await fs.writeFile(electron, 'changed Electron');
  assert.notEqual(await runtimeFingerprint(app, electron), native);
});
