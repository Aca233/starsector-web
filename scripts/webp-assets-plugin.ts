import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { prepareWebpAssets } from './prepare-webp-assets.mjs';

/** Production-only conversion; development and original game resources stay untouched. */
export function webpAssetsPlugin(): Plugin {
  let aliases: Record<string, string> = {};
  let summary: Record<string, unknown> | undefined;
  return {
    name: 'lossless-webp-assets',
    enforce: 'pre',
    async config(config, environment) {
      if (environment.command !== 'build' || config.publicDir === false) {
        return { define: { __WEBP_ASSET_MAP__: '{}' } };
      }
      const root = resolve(config.root ?? process.cwd());
      const result = await prepareWebpAssets(root, resolve(root, config.publicDir || 'public'));
      aliases = result.aliases; summary = result.summary;
      return { publicDir: result.directory, define: { __WEBP_ASSET_MAP__: JSON.stringify(aliases) } };
    },
    transform(code, id) {
      if (!Object.keys(aliases).length || !/\.css(?:\?|$)/.test(id)) return;
      // Do this before Vite's normal CSS asset pass. The staged publicDir contains
      // these WebPs, so Vite still handles root/subdirectory relative deployments.
      const updated = code.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (match, quote: string, value: string) => {
        const path = value.trim().replace(/^\.?\//, '');
        if (!path.startsWith('game-assets/')) return match;
        const asset = path.slice('game-assets/'.length), at = asset.search(/[?#]/);
        const file = at < 0 ? asset : asset.slice(0, at), suffix = at < 0 ? '' : asset.slice(at);
        const target = aliases[file];
        return target ? `url(${quote}/game-assets/${target}${suffix}${quote})` : match;
      });
      return updated === code ? undefined : { code: updated, map: null };
    },
    generateBundle() {
      if (summary) this.emitFile({ type: 'asset', fileName: 'webp-build-summary.json', source: JSON.stringify(summary) });
    },
  };
}
