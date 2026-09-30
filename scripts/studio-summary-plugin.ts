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
      await read('src/engine/data/content-selection.json');
      // Bundled authored hulls, excluding internal modules/aircraft/system projectiles.
      const hullCount = 3, weaponCount = 10;
      return 'export const hullCount = ' + hullCount + '; export const weaponCount = ' + weaponCount + ';';
    },
  };
}
