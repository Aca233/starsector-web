import { readShipPackProfile } from './ShipPackStore';
import { setShipPackProfile } from './ShipPackSelection';
import { preparePackAssets, profilePacks } from './ShipPackInstaller';
import { ContentRegistry } from '../content/ContentRegistry';
import { emptyPackHull } from './ShipPack';
import { validateShipPack } from './ShipPackValidation';
import { validateRuntimeShipPacks, shipPackDependencyClosure } from './ShipPackCapabilities';
/** Complete persisted installation before importing UI modules that build their catalogs. */
export async function initializeShipPacks(): Promise<void> {
  const profile = await readShipPackProfile();
  if (!Number.isSafeInteger(profile.revision) || profile.revision < 0 || !Array.isArray(profile.disabled) || !Array.isArray(profile.installed)
    || profile.installed.length > 64 || profile.disabled.some(id => typeof id !== 'string')
    || new Set(profile.installed.map(file => file.pack?.id)).size !== profile.installed.length) throw new Error('舰船包安装记录损坏。');
  const staged: Awaited<ReturnType<typeof preparePackAssets>>[] = [];
  const packs = profilePacks(profile);
  validateRuntimeShipPacks(packs);
  try {
    const ordered = new Map(packs.flatMap(pack => [...shipPackDependencyClosure(pack, packs), pack]).map(pack => [pack.id, pack]));
    for (const pack of ordered.values()) {
      const file = profile.installed.find(candidate => candidate.pack.id === pack.id);
      if (file) staged.push(await preparePackAssets(file, packs));
    }
    for (const file of profile.installed.filter(file => !profile.disabled.includes(file.pack.id))) validateShipPack(file.pack, true, packs);
    const registry = new ContentRegistry();
    registry.registerPack(packs.flatMap(pack => pack.ships.map(emptyPackHull)), packs.flatMap(pack => pack.weapons), false);
    setShipPackProfile(profile);
    staged.forEach(asset => asset.commit());
  } finally { staged.reverse().forEach(asset => asset.dispose()); }
}
