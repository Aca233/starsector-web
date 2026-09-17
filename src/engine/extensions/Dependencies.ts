import { assetManager } from '../assets/AssetResolver';
import { requireSound } from '../audio/SoundBank';
export interface ExtensionResources { textures?: readonly string[]; sounds?: readonly string[] }
export function validateResources(resources?: ExtensionResources, requireAssets = false): void {
  if (!resources) return;
  for (const values of [resources.textures, resources.sounds]) if (values !== undefined && (!Array.isArray(values) || values.some(v=>typeof v !== 'string' || !v.trim()))) throw new Error('Invalid extension resource list');
  if (requireAssets) for (const path of resources.textures ?? []) if (!assetManager.isLoaded || !assetManager.hasPath(path)) throw new Error('Unbundled extension texture: ' + path);
  for (const key of resources.sounds ?? []) requireSound(key, requireAssets);
}
export function validateHooks(definition: object, hooks: string[]): void {
  for (const hook of hooks) { const value = (definition as Record<string,unknown>)[hook]; if (value !== undefined && typeof value !== 'function') throw new Error('Invalid extension hook: ' + hook); }
}
