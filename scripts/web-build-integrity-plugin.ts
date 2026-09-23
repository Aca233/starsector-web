import { resolve } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';
import { writeWebBuildManifest } from './web-build-integrity.mjs';

/** Fail on merged build leftovers rather than deleting files that another task may be using. */
export function webBuildIntegrityPlugin(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'web-build-integrity',
    apply: 'build',
    enforce: 'post',
    configResolved(value) { config = value; },
    writeBundle: {
      order: 'post',
      async handler(options, bundle) {
        if (!options.dir) throw Error('Web builds require an output directory');
        await writeWebBuildManifest(resolve(options.dir), Object.keys(bundle),
          config.build.copyPublicDir && config.publicDir ? config.publicDir : undefined);
      },
    },
  };
}
