// Test-only data isolation/preflight. Never imported by production runtime code.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';

// Shared JSON imports in the headless harness's Node graph. A graph contract
// checks this list so new relay imports cannot silently escape the preflight.
export const MULTIPLAYER_NODE_JSON = Object.freeze([
  'src/network/protocol.json',
  'src/shared/captain-portraits.json',
  'src/engine/data/generated/deployment-costs.json',
]);
const sha = data => createHash('sha256').update(data).digest('hex');
const urlFor = (root, file) => pathToFileURL(path.resolve(root, file)).href;
let installed = null;
function snapshotRows(file) {
  const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(Array.isArray(snapshot.files), 'Frozen source files must be an array');
  const rows = new Map();
  for (const name of MULTIPLAYER_NODE_JSON) {
    const matches = snapshot.files.filter(row => row.file === name);
    assert.equal(matches.length, 1, 'One frozen Node JSON entry required: ' + name);
    const row = matches[0];
    assert.equal(typeof row.code, 'string');
    assert.equal(sha(row.code), row.sha256, 'Frozen Node JSON checksum: ' + name);
    JSON.parse(row.code);
    rows.set(name, row);
  }
  return rows;
}
/** Install BEFORE importing the relay/harness, e.g. from a Node --import
 * preloader. Does not write the workspace or bypass server validation. Removing
 * a hook does not invalidate Node's module cache: use a fresh process per run. */
export function registerFrozenMultiplayerJson(file, {root = process.cwd()} = {}) {
  assert.equal(installed, null, 'Only one frozen Node JSON owner per process');
  const sources = new Map([...snapshotRows(file)].map(([name, row]) => [urlFor(root, name), row.code]));
  const hook = registerHooks({load(url, context, nextLoad) {
    const source = sources.get(url);
    return source === undefined ? nextLoad(url, context) : {format: 'json', source, shortCircuit: true};
  }});
  installed = sources;
  let closed = false;
  return {count: sources.size, deregister() {
    if (closed) return;
    closed = true; hook.deregister(); installed = null;
  }};
}

/** Targeted room-catalog readiness check, not a full asset/render audit.
 * The catalog contract compares these declarations with actual authored packs. */
export async function inspectMultiplayerFixtureSources({root = process.cwd(), frozenFile,
  requiredHulls, expectedAssetManifestSha256} = {}) {
  const frozen = frozenFile ? snapshotRows(frozenFile) : null;
  const issues = [], json = [], loaded = new Map();
  for (const file of MULTIPLAYER_NODE_JSON) {
    const url = urlFor(root, file), source = installed?.get(url) ?? fs.readFileSync(path.resolve(root, file), 'utf8');
    const actual = (await import(url, {with: {type: 'json'}})).default;
    loaded.set(file, actual);
    const row = {file, nodeSha256: sha(source), browserSha256: frozen?.get(file).sha256 ?? sha(source), frozenNode: installed?.has(url) ?? false};
    json.push(row);
    if (!isDeepStrictEqual(actual, JSON.parse(source))) issues.push({code: 'stale-node-module', file});
    if (row.nodeSha256 !== row.browserSha256) issues.push({code: 'node-browser-json-mismatch', file});
  }
  const catalogFile = 'src/network/protocol.json';
  const catalog = loaded.get(catalogFile).ships ?? [], browserCatalog = (frozen ? JSON.parse(frozen.get(catalogFile).code) : loaded.get(catalogFile)).ships ?? [];
  requiredHulls ??= catalog.map(row => row.id);
  const assetFile = path.resolve(root, 'public/game-assets/asset-manifest.json');
  const manifestBytes = fs.readFileSync(assetFile), manifest = JSON.parse(manifestBytes);
  assert.ok(Array.isArray(manifest), 'Asset manifest must be an array');
  const assetManifestSha256 = sha(manifestBytes);
  if (expectedAssetManifestSha256 !== undefined) {
    assert.match(expectedAssetManifestSha256, /^[0-9a-f]{64}$/, 'Expected manifest hash must be SHA256');
    if (assetManifestSha256 !== expectedAssetManifestSha256) issues.push({code: 'asset-manifest-mismatch', expected: expectedAssetManifestSha256, actual: assetManifestSha256});
  }
  const assetPaths = new Set(manifest.map(entry => entry.path)), assets = [];
  const assetRoot = path.resolve(root, 'public/game-assets');
  for (const hull of requiredHulls) {
    if (!catalog.some(row => row.id === hull)) issues.push({code: 'unsupported-node-ai-hull', hull});
    const spec = browserCatalog.find(row => row.id === hull);
    if (!spec) { issues.push({code: 'fixture-hull-not-in-browser-json', hull}); continue; }
    const sprite = spec.spriteUrl;
    if (typeof sprite !== 'string' || !sprite.startsWith('/game-assets/')) { issues.push({code: 'unsupported-fixture-sprite-url', hull}); continue; }
    const relative = sprite.slice('/game-assets/'.length), target = path.resolve(assetRoot, relative);
    if (!relative || !target.startsWith(assetRoot + path.sep)) { issues.push({code: 'fixture-asset-path-escape', hull}); continue; }
    const listed = assetPaths.has(relative), present = fs.existsSync(target) && fs.statSync(target).isFile();
    assets.push({hull, path: relative, listed, present});
    if (!listed) issues.push({code: 'missing-fixture-sprite-entry', hull, path: relative});
    if (!present) issues.push({code: 'missing-fixture-sprite-file', hull, path: relative});
  }
  return {pass: issues.length === 0, scope: 'Shared Node JSON and selected AI hull sprites only; not full asset equivalence or performance acceptance.', json, assetManifestSha256, assets, issues};
}
