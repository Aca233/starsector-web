import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {MULTIPLAYER_NODE_JSON, registerFrozenMultiplayerJson, inspectMultiplayerFixtureSources} from './lib/multiplayer-fixture-source.mjs';
const sha = data => createHash('sha256').update(data).digest('hex');
const catalogFile = 'src/network/protocol.json';
function fixture(t, sprite = '/game-assets/ship.png') {
  const parent = path.resolve(os.tmpdir()), root = fs.mkdtempSync(path.join(parent, 'lan-fixture-source-'));
  t.after(() => { assert.ok(path.resolve(root).startsWith(parent + path.sep)); fs.rmSync(root, {recursive: true, force: true}); });
  const write = (file, data) => { const target = path.join(root, file); fs.mkdirSync(path.dirname(target), {recursive: true}); fs.writeFileSync(target, data); };
  const data = [{version: 1, ships: [{id: 'hammerhead', name: 'Fixture hull', deploymentPoints: 10, spriteUrl: sprite}]}, [], {hammerhead: 10}];
  const files = MULTIPLAYER_NODE_JSON.map((file, index) => {const code = JSON.stringify(data[index]); write(file, code); return {file, code, sha256: sha(code)};});
  write('public/game-assets/asset-manifest.json', JSON.stringify([{path: 'ship.png'}]));
  write('public/game-assets/ship.png', 'fixture only; no browser starts');
  const frozenFile = path.join(root, 'frozen.json'); write('frozen.json', JSON.stringify({files}));
  return {root, frozenFile, files, write, inspect: options => inspectMultiplayerFixtureSources({root, frozenFile, requiredHulls: ['hammerhead'], ...options})};
}
test('matching Node/browser data and selected sprite pass with recorded hashes', async t => {
  const f = fixture(t), result = await f.inspect();
  assert.equal(result.pass, true); assert.equal(result.json.length, 3);
  assert.ok(result.json.every(row => row.nodeSha256 === row.browserSha256 && !row.frozenNode));
  assert.deepEqual(result.assets, [{hull: 'hammerhead', path: 'ship.png', listed: true, present: true}]);
});
test('empty live catalog fails before a historical browser fixture can launch', async t => {
  const f = fixture(t); f.write(catalogFile, '{}'); const result = await f.inspect();
  assert.equal(result.pass, false);
  assert.ok(result.issues.some(row => row.code === 'node-browser-json-mismatch' && row.file === catalogFile));
  assert.ok(result.issues.some(row => row.code === 'unsupported-node-ai-hull'));
});
test('explicit early loader isolates actual Node imports without changing disk', async t => {
  const f = fixture(t); f.write(catalogFile, '{}');
  const hook = registerFrozenMultiplayerJson(f.frozenFile, {root: f.root});
  try {
    assert.equal(hook.count, 3); const result = await f.inspect();
    assert.equal(result.pass, true); assert.ok(result.json.every(row => row.frozenNode));
    assert.equal(fs.readFileSync(path.join(f.root, catalogFile), 'utf8'), '{}');
  } finally { hook.deregister(); hook.deregister(); }
});
test('installing after a JSON import cannot hide the stale Node module cache', async t => {
  const f = fixture(t); f.write(catalogFile, '{}');
  await import(pathToFileURL(path.join(f.root, catalogFile)).href, {with: {type: 'json'}});
  const hook = registerFrozenMultiplayerJson(f.frozenFile, {root: f.root});
  try { assert.ok((await f.inspect()).issues.some(row => row.code === 'stale-node-module' && row.file === catalogFile)); }
  finally { hook.deregister(); }
});
test('corrupt, duplicate, missing and invalid JSON snapshots never install', t => {
  const f = fixture(t);
  for (const kind of ['checksum', 'duplicate', 'missing', 'invalidJson']) {
    const files = structuredClone(f.files);
    if (kind === 'checksum') files[0].sha256 = '0'.repeat(64);
    if (kind === 'duplicate') files.push({...files[0]});
    if (kind === 'missing') files.shift();
    if (kind === 'invalidJson') { files[0].code = '{'; files[0].sha256 = sha('{'); }
    f.write('bad.json', JSON.stringify({files}));
    assert.throws(() => registerFrozenMultiplayerJson(path.join(f.root, 'bad.json'), {root: f.root}));
  }
});
test('loader has one owner, leaves other JSON alone, and permits clean deregistration', async t => {
  const f = fixture(t); f.write('unrelated.json', '{"untouched":true}');
  const hook = registerFrozenMultiplayerJson(f.frozenFile, {root: f.root});
  try {
    assert.throws(() => registerFrozenMultiplayerJson(f.frozenFile, {root: f.root}), /one frozen Node JSON owner/);
    assert.deepEqual((await import(pathToFileURL(path.join(f.root, 'unrelated.json')).href, {with: {type: 'json'}})).default, {untouched: true});
  } finally { hook.deregister(); }
  const next = registerFrozenMultiplayerJson(f.frozenFile, {root: f.root}); next.deregister();
});
test('missing sprite and changed expected manifest are explicit, not silent render fallbacks', async t => {
  const f = fixture(t); f.write('public/game-assets/asset-manifest.json', '[]');
  fs.unlinkSync(path.join(f.root, 'public/game-assets/ship.png'));
  const result = await f.inspect({expectedAssetManifestSha256: '0'.repeat(64)});
  assert.equal(result.pass, false);
  assert.deepEqual(result.issues.map(row => row.code), ['asset-manifest-mismatch', 'missing-fixture-sprite-entry', 'missing-fixture-sprite-file']);
});
test('fixture asset traversal is refused before any outside file lookup', async t => {
  const f = fixture(t, '/game-assets/../../outside.png'), result = await f.inspect();
  assert.equal(result.pass, false); assert.deepEqual(result.assets, []);
  assert.ok(result.issues.some(row => row.code === 'fixture-asset-path-escape'));
});
test('unfrozen current fixture is supported and no-AI does not demand a historical hull', async t => {
  const f = fixture(t); f.write(catalogFile, '{}');
  assert.equal((await inspectMultiplayerFixtureSources({root: f.root, requiredHulls: []})).pass, true);
});
test('declared shared JSON set matches the real harness Node import graph', async () => {
  const graph = await build({entryPoints: ['scripts/check-normal-multiplayer-browser.mjs'], bundle: true, platform: 'node', format: 'esm', write: false, metafile: true, packages: 'external', logLevel: 'silent', plugins: [{name: 'browser-imports', setup(b) { b.onResolve({filter: /^\/(?:src|scripts|node_modules)\//}, ({path}) => ({path, external: true})); }}]});
  assert.deepEqual(Object.keys(graph.metafile.inputs).filter(file => file.startsWith('src/') && file.endsWith('.json')).sort(), [...MULTIPLAYER_NODE_JSON].sort());
});

test('missing browser JSON is reported as unresolved fixture, not absent authored browser content', async t => {
  const f = fixture(t); f.write(catalogFile, '{}');
  const result = await inspectMultiplayerFixtureSources({root: f.root, requiredHulls: ['hammerhead']});
  assert.equal(result.pass, false);
  assert.ok(result.issues.some(row => row.code === 'fixture-hull-not-in-browser-json'));
  assert.ok(!result.issues.some(row => row.code === 'unsupported-browser-ai-hull'));
});
