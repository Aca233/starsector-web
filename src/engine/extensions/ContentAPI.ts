import { assetManager } from '../assets/AssetResolver';
import { modManager, type ModPackage } from '../modding/ModManager';
/** All asset references must already belong to the local bundle manifest. */
export async function installContentPack(pack: ModPackage): Promise<void> {
  await assetManager.ensureManifestLoaded();
  modManager.loadMod(pack);
}
