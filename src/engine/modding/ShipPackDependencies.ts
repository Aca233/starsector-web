import { assetResolver } from '../assets/AssetResolver';
import { shipSystemDefinitions, resolveSystemId } from '../extensions/ship-systems/Registry';
import { hullModDefinitions } from '../extensions/HullMods';
import { weaponEffects } from '../extensions/weapon-effects/Registry';
import { soundPaths, soundVariants } from '../audio/SoundBank';
import type { ShipPack } from './ShipPack';
/** Exact paths consumed by data and trusted behavior resources, plus explicit renderer-only textures. */
export function shipPackAssetPaths(pack: ShipPack): string[] {
  const paths = new Set<string>(), visited = new Set<unknown>();
  const walk = (value: unknown, key = '') => {
    if (typeof value === 'string') {
      if (/^(?:\/game-assets\/|graphics\/|sounds\/)/.test(value)) paths.add(assetResolver.normalize(value));
      if ((key === 'soundKey' || ['activate','loop','deactivate'].includes(key)) && soundPaths[value]) {
        for (const sample of soundVariants(value) ?? [{file: soundPaths[value]}]) paths.add(assetResolver.normalize(sample.file));
      }
      if (['systemType','defenseSystemType','rightClickSystemType','systemTypes'].includes(key)) walk(shipSystemDefinitions.require(resolveSystemId(value)));
      if (['hullMods','builtInHullMods','sMods'].includes(key)) walk(hullModDefinitions.require(value));
      if (['beamEffect','onHitEffect','everyFrameEffect'].includes(key)) walk(weaponEffects.require(value));
      if (key === 'sounds' && soundPaths[value]) for (const sample of soundVariants(value) ?? [{file: soundPaths[value]}]) paths.add(assetResolver.normalize(sample.file));
    } else if (value && typeof value === 'object' && !visited.has(value)) {
      visited.add(value);
      if (Array.isArray(value)) value.forEach(item => walk(item, key));
      else for (const [childKey, child] of Object.entries(value)) walk(child, childKey);
    }
  };
  walk(pack.ships); walk(pack.weapons); walk(pack.baselines); walk(pack.refit); walk(pack.variants); walk(pack.extraTextures);
  return [...paths].sort();
}
