/** Private single-ship artifact. Gzip JSON contains data and assets, never executable source. */
import {build} from 'esbuild';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
const requested = process.argv[2] ?? 'gloriana';
if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,95}$/.test(requested)) throw new Error('Usage: node scripts/package-ship-pack.mjs <package-id or short name>');
const out = resolve('artifacts/ship-packs'); await mkdir(out, {recursive: true});
const factory = join(out, `pack-factory-${process.pid}.mjs`);
await build({stdin: {contents: `export {bundledShipPacks} from './src/engine/modding/BundledShipPacks';
export {validateShipPack} from './src/engine/modding/ShipPackValidation';`, loader: 'ts', resolveDir: process.cwd()},
  outfile: factory, bundle: true, platform: 'node', format: 'esm', target: 'node22',
  define: {'import.meta.env': '{"BASE_URL":"/","DEV":false}'}, logLevel: 'warning'});
const {bundledShipPacks, validateShipPack} = await import(pathToFileURL(factory).href);
const pack = bundledShipPacks.find(pack => pack.id === requested || pack.id === 'foundry.' + requested);
if (!pack) throw new Error('Unknown package: ' + requested);
const {paths, compiled} = validateShipPack(pack, false);
const manifest = JSON.parse(await readFile('public/game-assets/asset-manifest.json','utf8'));
const entries = new Map(manifest.map(entry => [entry.path,entry]));
const owned = new Set([...paths.filter(path => pack.assetRoots.some(root => path.startsWith(root))),
  ...manifest.filter(entry => pack.assetRoots.some(root => entry.path.startsWith(root))).map(entry => entry.path)]);
const assets = [];
for (const path of [...owned].sort()) {
  const entry = entries.get(path); if (!entry) throw new Error('Missing owned manifest entry: ' + path);
  const full = resolve('public/game-assets',path), root = resolve('public/game-assets');
  if (!full.startsWith(root + '\\') && !full.startsWith(root + '/')) throw new Error('Path escapes runtime asset root');
  const bytes = await readFile(full), sha256 = createHash('sha256').update(bytes).digest('hex');
  const mime = path.endsWith('.png') ? 'image/png' : path.endsWith('.webp') ? 'image/webp' : path.endsWith('.jpg') ? 'image/jpeg'
    : path.endsWith('.ogg') ? 'audio/ogg' : path.endsWith('.wav') ? 'audio/wav' : null;
  if (!mime) throw new Error('Unsupported runtime media: ' + path);
  assets.push({entry: {...entry, bytes: bytes.length, hash: sha256}, sha256, mime, base64: bytes.toString('base64')});
}
const hostAssets = paths.filter(path => !owned.has(path));
for (const path of hostAssets) if (!entries.has(path)) throw new Error('Missing declared host asset: ' + path);
const file = {format: 'starship-foundry-ship-pack', version: 1, pack, assets, hostAssets};
const raw = Buffer.from(JSON.stringify(file)), compressed = gzipSync(raw, {level: 9});
const name = `${requested}-${pack.version}.ship-pack`;
await writeFile(join(out,name),compressed);
await writeFile(join(out,`${requested}-inventory.json`),JSON.stringify({format: file.format, pack: pack.id, version: pack.version, hostABI: pack.hostABI,
  behavior: pack.behavior, dependencies: pack.dependencies ?? [], capabilities: pack.capabilities ?? [], mainHull: pack.mainHull,
  ships: pack.ships.map(ship => ship.id), weapons: pack.weapons.map(weapon => weapon.id),
  variants: pack.variants.map(variant => variant.id), compiledHulls: compiled.map(ship => ship.id), hostAssets,
  assets: assets.map(({entry,sha256,mime}) => ({path:entry.path, bytes:entry.bytes, sha256, mime})),
  file: name, compressedBytes: compressed.length, uncompressedBytes: raw.length, sha256: createHash('sha256').update(compressed).digest('hex'), sources: pack.sources},null,2)+'\n');
console.log(JSON.stringify({file:join(out,name),ships:pack.ships.length,weapons:pack.weapons.length,assets:assets.length,hostAssets:hostAssets.length,bytes:compressed.length}));
