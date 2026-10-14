import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp, readFile, writeFile, unlink, rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

// Uses the real registered content and fit compiler; no browser profile or package writes.
const dir = await mkdtemp(join(tmpdir(), 'foundry-pack-catalog-'));
const file = join(dir, 'catalog.mjs');
let runtime;
try {
  const result = await build({stdin: {resolveDir: process.cwd(), loader: 'ts', contents: `
    export {bundledShipPacks} from './src/engine/modding/BundledShipPacks';
    export {validateShipPack} from './src/engine/modding/ShipPackValidation';
    export * from './src/engine/modding/ShipPackCapabilities';
    export * from './src/engine/modding/ShipPackCatalog';
    export {extensionVariantsForHull} from './src/studio/ExtensionVariantCatalog';
    export {preflightShipPackFile} from './src/engine/modding/ShipPackInstaller';
    export {shipPackAssetPaths} from './src/engine/modding/ShipPackDependencies';
    export {assetManager} from './src/engine/assets/AssetResolver';
    export {runtimeAssetUrl} from './src/engine/runtime/RuntimePaths';
    export {contentRegistry} from './src/engine/content/ContentRegistry';
  `}, bundle: true, write: false, platform: 'node', format: 'esm', target: 'node22', logLevel: 'warning',
    plugins: [{name: 'raw-json', setup(builder) {
      builder.onResolve({filter: /\?raw$/}, args => ({path: resolve(args.resolveDir, args.path.slice(0, -4)), namespace: 'raw'}));
      builder.onLoad({filter: /.*/, namespace: 'raw'}, async args => ({contents: await readFile(args.path, 'utf8'), loader: 'text'}));
    }}], define: {'import.meta.env': '{"BASE_URL":"/","DEV":true}'}});
  await writeFile(file, result.outputFiles[0].text);
  runtime = await import(pathToFileURL(file).href);
} finally { await unlink(file).catch(() => {}); await rmdir(dir); }

const packs = runtime.bundledShipPacks;
let fits = 0;
for (const pack of packs) {
  const {compiled} = runtime.validateShipPack(pack, false, packs);
  assert.ok(compiled.length > 0, pack.id + ' has no default fit');
  assert.equal(compiled.length, pack.variants.length);
  assert.deepEqual(runtime.extensionVariantsForHull(pack.mainHull).map(v => v.id), pack.variants.map(v => v.id));
  for (const ship of compiled) assert.equal(ship.id, pack.mainHull);
  fits += compiled.length;
}

const before = runtime.runtimeShipPacks(), revision = runtime.shipPackCatalogRevision();
const invalid = pack => assert.throws(() => runtime.setRuntimeShipPacks([pack, ...packs.filter(other => other.id !== pack.id)]));
for (const capability of [{id: 'future:unknown', minVersion: 1, scope: 'combat'},
  {id: 'behavior:' + packs[0].behavior, minVersion: 2, scope: 'combat'},
  {id: 'behavior:' + packs[0].behavior, minVersion: 1, scope: 'campaign'}]) {
  invalid({...structuredClone(packs[0]), capabilities: [capability]});
}
const disguised = structuredClone(packs[0]); disguised.capabilities = [];
disguised.ships[0].systemType = 'unknown-ship-system';
invalid(disguised);
invalid({...structuredClone(packs[0]), dependencies: [{id: 'not-installed', minVersion: '1.0.0'}]});
invalid({...structuredClone(packs[0]), dependencies: [{id: packs[0].id, minVersion: '1.0.0'}]});
assert.equal(runtime.runtimeShipPacks(), before, 'rejected catalogs cannot publish');
assert.equal(runtime.shipPackCatalogRevision(), revision, 'rejected catalogs cannot change revision');
for (const pack of packs) for (const dependency of pack.dependencies ?? []) {
  assert.throws(() => runtime.validateRuntimeShipPacks(packs.filter(other => other.id !== dependency.id)), /需要已启用/);
  assert.throws(() => runtime.validateShipPack({...pack, dependencies: []}, false, packs), /未知武器|Unknown|weapon|武器/,
    'undeclared packages cannot accidentally satisfy references');
}
assert.ok(Object.isFrozen(runtime.packageRefit()), 'catalog projection is immutable');
assert.ok(Object.isFrozen(runtime.packageHullTemplate(packs[0].mainHull)), 'templates are immutable');

// Exercise the actual reversible install path when a dependency is saved but not activated.
// Tiny in-memory PNGs are validation fixtures; no authored files or player storage are written.
const manifest = JSON.parse(await readFile('public/game-assets/asset-manifest.json', 'utf8'));
const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async () => new Response(JSON.stringify(manifest), {headers: {'content-type': 'application/json'}});
  await runtime.assetManager.ensureManifestLoaded();
} finally { globalThis.fetch = originalFetch; }
const entries = new Map(manifest.map(entry => [entry.path, entry]));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlEAAAAAASUVORK5CYII=', 'base64');
const sha256 = createHash('sha256').update(png).digest('hex');
const fileFor = pack => {
  const paths = runtime.shipPackAssetPaths(pack), owned = paths.filter(path => pack.assetRoots.some(root => path.startsWith(root)));
  return {format: 'starship-foundry-ship-pack', version: 1, pack,
    assets: owned.map(path => ({entry: {...(entries.get(path) ?? {id: path, path, type: 'image', group: 'test',
      sampler: {wrap: 'clamp', minFilter: 'linear', magFilter: 'linear', mipmap: false}}), bytes: png.length},
    sha256, base64: png.toString('base64'), mime: 'image/png'})), hostAssets: paths.filter(path => !owned.includes(path))};
};
const pendingDependency = structuredClone(packs.find(pack => pack.id === 'foundry.hyperion'));
pendingDependency.version = '1.0.1';
const addedPath = 'graphics/ships/web_sc2_hyperion/foundation-preflight-only.png';
const pd = pendingDependency.weapons.find(weapon => weapon.id === 'web_sc2_hyperion_pd');
pd.turretSpriteUrl = '/game-assets/' + addedPath;
pd.hardpointSpriteUrl = '/game-assets/' + addedPath;
const dependent = fileFor(structuredClone(packs.find(pack => pack.id === 'foundry.zhuyuan')));
const pendingUnrelated = structuredClone(packs.find(pack => pack.id === 'foundry.zhefeng'));
pendingUnrelated.version = '1.0.1';
const unrelatedPath = 'graphics/ships/web_zhefeng/foundation-preflight-only.png';
pendingUnrelated.weapons[0].turretSpriteUrl = '/game-assets/' + unrelatedPath;
const profile = {revision: 0, disabled: [], installed: [fileFor(pendingDependency), fileFor(pendingUnrelated)]};
const contentRevision = runtime.contentRegistry.revision;
assert.equal(runtime.assetManager.hasPath(addedPath), false);
await runtime.preflightShipPackFile(dependent, profile);
assert.equal(runtime.assetManager.hasPath(addedPath), false, 'successful preflight rolls back dependency manifest entries');
assert.equal(runtime.assetManager.hasPath(unrelatedPath), false, 'successful preflight rolls back other pending packages');
assert.ok(!runtime.runtimeAssetUrl(addedPath).startsWith('blob:'), 'successful preflight rolls back dependency object URLs');
const badFile = structuredClone(dependent); badFile.assets[0].sha256 = '0'.repeat(64);
await assert.rejects(() => runtime.preflightShipPackFile(badFile, profile), /素材校验失败/);
assert.equal(runtime.assetManager.hasPath(addedPath), false, 'failed preflight rolls back dependency manifest entries');
assert.equal(runtime.assetManager.hasPath(unrelatedPath), false, 'failed preflight rolls back other pending packages');
assert.ok(!runtime.runtimeAssetUrl(addedPath).startsWith('blob:'), 'failed preflight rolls back dependency object URLs');
assert.equal(runtime.contentRegistry.revision, contentRevision, 'preflight never publishes runtime content');
assert.equal(runtime.shipPackCatalogRevision(), revision, 'preflight never publishes the package catalog');

// One-time migration evidence can be supplied by a developer without a permanent duplicate fixture.
const previousFile = process.argv[2];
if (previousFile) {
  const scrub = design => {
    const {id: _id, updatedAt: _updatedAt, ...rest} = design;
    if (rest.modules) rest.modules = Object.fromEntries(Object.entries(rest.modules).map(([key, value]) => [key, scrub(value)]));
    return JSON.parse(JSON.stringify(rest));
  };
  const previous = JSON.parse(await readFile(previousFile, 'utf8'));
  const current = packs.map(pack => ({id: pack.id, hull: pack.mainHull,
    variants: runtime.extensionVariantsForHull(pack.mainHull).map(variant => ({id: variant.id, name: variant.name,
      ...(variant.warnings ? {warnings: variant.warnings} : {}), design: scrub(variant.create())}))}));
  assert.deepEqual(current, previous, 'existing fit IDs, labels, equipment, investment, groups and warnings must stay identical');
}
console.log(`Ship pack catalog: ${packs.length} packs / ${fits} fits; compiler, capability versions/scopes, declared dependencies, atomic rejection and staged dependency asset rollback passed${previousFile ? '; legacy fit comparison passed' : ''}.`);
