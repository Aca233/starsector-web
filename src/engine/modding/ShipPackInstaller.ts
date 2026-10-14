import { assetManager } from '../assets/AssetResolver';
import { mountRuntimeAssets } from '../runtime/RuntimePaths';
import { ContentRegistry } from '../content/ContentRegistry';
import { bundledShipPacks } from './BundledShipPacks';
import { emptyPackHull, type ShipPack, type ShipPackFile, type ShipPackProfile } from './ShipPack';
import { validateShipPack, safePackPath } from './ShipPackValidation';
import { shipPackAssetPaths } from './ShipPackDependencies';
import { writeShipPackProfile } from './ShipPackStore';
import { validateRuntimeShipPacks, shipPackDependencyClosure } from './ShipPackCapabilities';
const MAX_BYTES = 96 * 1024 * 1024;
const MAX_ASSET_BYTES = 24 * 1024 * 1024;
export async function readShipPackFile(file: Blob): Promise<ShipPackFile> {
  if (!file.size || file.size > MAX_BYTES) throw new Error('舰船包文件过大或为空。');
  const prefix = new Uint8Array(await file.slice(0,2).arrayBuffer());
  const stream = prefix[0] === 31 && prefix[1] === 139 ? file.stream().pipeThrough(new DecompressionStream('gzip')) : file.stream();
  const reader = stream.getReader(), chunks: Uint8Array[] = []; let bytes = 0;
  try { while (true) {
    const next = await reader.read(); if (next.done) break;
    bytes += next.value.length; if (bytes > MAX_BYTES) throw new Error('舰船包解压内容超出限制。');
    chunks.push(next.value);
  } } finally { await reader.cancel(); }
  const data = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(data));
}
export async function preparePackAssets(file: ShipPackFile, available: readonly ShipPack[] = bundledShipPacks): Promise<{dispose: () => void; commit: () => void}> {
  if (!file || file.format !== 'starship-foundry-ship-pack' || file.version !== 1 || !file.pack || !Array.isArray(file.assets)
    || file.assets.length > 2048 || !Array.isArray(file.hostAssets) || file.hostAssets.length > 4096) throw new Error('不支持的舰船包文件。');
  // Validate identity/graph without asset activation first; filenames never extract to a filesystem.
  validateShipPack(file.pack, false, available);
  const urls: [string,string][] = [], paths = new Set<string>(); let bytes = 0;
  try {
    for (const asset of file.assets) {
      const path = asset.entry?.path;
      if (!safePackPath(path) || !file.pack.assetRoots.some(root => path.startsWith(root)) || paths.has(path)
        || !/^[a-f0-9]{64}$/.test(asset.sha256) || typeof asset.base64 !== 'string' || asset.base64.length > MAX_ASSET_BYTES * 1.4
        || !['image/png','image/webp','image/jpeg','audio/ogg','audio/wav'].includes(asset.mime)) throw new Error('非法、重复或越界的包内素材。');
      if (!asset.entry.id?.trim() || !asset.entry.group?.trim() || !['image','audio'].includes(asset.entry.type)
        || (asset.entry.type === 'image' && (!asset.mime.startsWith('image/') || !asset.entry.sampler || !['clamp','repeat'].includes(String(asset.entry.sampler.wrap))
          || !['nearest','linear'].includes(String(asset.entry.sampler.minFilter)) || !['nearest','linear'].includes(String(asset.entry.sampler.magFilter)) || typeof asset.entry.sampler.mipmap !== 'boolean'))
        || (asset.entry.type === 'audio' && !asset.mime.startsWith('audio/'))) throw new Error('素材元数据无效。');
      const raw = Uint8Array.from(atob(asset.base64), character => character.charCodeAt(0));
      bytes += raw.length;
      if (!raw.length || raw.length > MAX_ASSET_BYTES || bytes > MAX_BYTES || asset.entry.bytes !== raw.length) throw new Error('素材字节数不符或超出限制。');
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', raw))].map(byte => byte.toString(16).padStart(2,'0')).join('');
      if (digest !== asset.sha256) throw new Error('素材校验失败：' + path);
      const signature = new TextDecoder('ascii').decode(raw.slice(0,12));
      const matches = asset.mime === 'image/png' ? raw[0] === 137 && signature.slice(1,4) === 'PNG'
        : asset.mime === 'image/webp' ? signature.startsWith('RIFF') && signature.endsWith('WEBP')
        : asset.mime === 'image/jpeg' ? raw[0] === 255 && raw[1] === 216
        : asset.mime === 'audio/ogg' ? signature.startsWith('OggS') : signature.startsWith('RIFF') && signature.endsWith('WAVE');
      if (!matches) throw new Error('素材实际格式与声明不同：' + path);
      const blob = new Blob([raw], {type: asset.mime});
      if (asset.entry.type === 'image' && typeof createImageBitmap === 'function') {
        const bitmap = await createImageBitmap(blob); const valid = bitmap.width > 0 && bitmap.height > 0 && bitmap.width <= 8192 && bitmap.height <= 8192; bitmap.close();
        if (!valid) throw new Error('素材实际尺寸超出限制：' + path);
      }
      paths.add(path); urls.push([path, URL.createObjectURL(blob)]);
    }
    for (const path of file.hostAssets) if (!safePackPath(path) || paths.has(path) || file.pack.assetRoots.some(root => path.startsWith(root))) throw new Error('宿主资源声明不能代替包内素材。');
    const required = shipPackAssetPaths(file.pack);
    for (const path of required) if (!paths.has(path) && !file.hostAssets.includes(path)) throw new Error('素材闭包缺少声明：' + path);
    await assetManager.ensureManifestLoaded();
    for (const path of file.hostAssets) if (!assetManager.hasPath(path)) throw new Error('兼容宿主缺少公共资源：' + path);
    const rollbackEntries = assetManager.mountEntries(file.assets.map(asset => asset.entry)), rollbackUrls = mountRuntimeAssets(urls);
    let committed = false;
    return {commit: () => { committed = true; }, dispose: () => { if (!committed) { rollbackUrls(); rollbackEntries(); for (const [,url] of urls) URL.revokeObjectURL(url); } }};
  } catch (error) { for (const [,url] of urls) URL.revokeObjectURL(url); throw error; }
}
export function profilePacks(profile: ShipPackProfile) {
  const installed = new Map(profile.installed.map(file => [file.pack.id,file.pack]));
  return [...bundledShipPacks.filter(pack => !installed.has(pack.id)), ...installed.values()].filter(pack => !profile.disabled.includes(pack.id));
}
export async function preflightShipPackFile(file: ShipPackFile, profile: ShipPackProfile): Promise<void> {
  const existing = profilePacks(profile).filter(pack => pack.id !== file.pack.id);
  const available = [...existing, file.pack];
  validateRuntimeShipPacks(available);
  const staged: Awaited<ReturnType<typeof preparePackAssets>>[] = [];
  try {
    // Saved packages may not have been activated by refresh yet. Validate the full
    // selected profile with their verified files, then roll everything back together.
    const ordered = new Map(available.flatMap(pack => [...shipPackDependencyClosure(pack, available), pack]).map(pack => [pack.id, pack]));
    for (const pack of ordered.values()) {
      const installed = pack.id === file.pack.id ? file : profile.installed.find(candidate => candidate.pack.id === pack.id);
      if (installed) staged.push(await preparePackAssets(installed, available));
    }
    validateShipPack(file.pack, true, available);
    const registry = new ContentRegistry();
    registry.registerPack([...existing, file.pack].flatMap(pack => pack.ships.map(emptyPackHull)), [...existing,file.pack].flatMap(pack => pack.weapons), true);
  } finally { staged.reverse().forEach(asset => asset.dispose()); }
}
export async function persistShipPackFile(file: ShipPackFile, profile: ShipPackProfile): Promise<ShipPackProfile> {
  if (profile.installed.length >= 64 && !profile.installed.some(existing => existing.pack.id === file.pack.id)) throw new Error('已达到 64 个安装包上限，请先卸载不再使用的包。');
  if (profile.installed.some(existing => existing.pack.id === file.pack.id && existing.pack.version === file.pack.version)) throw new Error('该版本的舰船包已经安装。');
  await preflightShipPackFile(file, profile);
  // Replacements preserve stable identities and slots; saving happens before any runtime activation.
  const old = profile.installed.find(existing => existing.pack.id === file.pack.id)?.pack ?? bundledShipPacks.find(pack => pack.id === file.pack.id);
  if (old) {
    const shape = (pack: typeof old) => JSON.stringify([pack.ships.map(ship => [ship.id, ship.weaponSlots.map(slot => [slot.slotId,slot.slotSize,slot.weaponType,slot.builtIn ?? false])]).sort(),
      pack.weapons.map(weapon => [weapon.id,weapon.mountSize,weapon.weaponType]).sort(), Object.keys(pack.refit.wings ?? {}).sort()]);
    if (shape(old) !== shape(file.pack)) throw new Error('升级改变了稳定 ID 或槽位结构；需要明确的存档迁移版本。');
  }
  const next = {...profile, installed: [...profile.installed.filter(existing => existing.pack.id !== file.pack.id), file], disabled: profile.disabled.filter(id => id !== file.pack.id)};
  await writeShipPackProfile(next, profile.revision); return {...next, revision: profile.revision + 1};
}
