import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

/** Keep the home screen independent of the runtime registries and refit UI. */
export function studioSummaryPlugin(): Plugin {
  const publicId = 'virtual:studio-summary';
  const resolvedId = '\0' + publicId;
  let root = '';
  return {
    name: 'studio-content-summary',
    configResolved(config) { root = config.root; },
    resolveId(id) { if (id === publicId) return resolvedId; },
    async load(id) {
      if (id !== resolvedId) return;
      const read = async (relative: string) => {
        const file = resolve(root, relative);
        this.addWatchFile(file);
        return JSON.parse(await readFile(file, 'utf8'));
      };
      const [ships, weapons, imported, curated] = await Promise.all([
        read('src/engine/data/generated/ships.json'),
        read('src/engine/data/generated/weapons.json'),
        read('src/engine/data/generated/refit-source.json'),
        read('src/studio/refit-data.json'),
      ]);
      // Match DesignModel's built-in roster, excluding fighters and built-in-only weapons.
      const hullCount = Object.keys({ ...imported.ships, ...curated.ships })
        .filter(id => ships[id] && ships[id].hullSize !== 'FIGHTER').length;
      const refitWeapons = { ...imported.weapons, ...curated.weapons };
      const weaponCount = Object.keys(weapons)
        .filter(id => refitWeapons[id] && id !== 'tpc' && !imported.weapons[id]?.builtInOnly).length;
      return 'export const hullCount = ' + hullCount + '; export const weaponCount = ' + weaponCount + ';';
    },
  };
}
