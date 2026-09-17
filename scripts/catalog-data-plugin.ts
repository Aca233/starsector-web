import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { projectCatalog } from './catalog-projection.ts';

/** Emit content-hashed JSON for production and serve the same parts in development. */
export function catalogDataPlugin(): Plugin {
  const publicId = 'virtual:native-catalog';
  const resolvedId = '\0' + publicId;
  const route = '/@native-catalog/';
  let sourcePath = '', base = '/', build = false;
  let pending: Promise<ReturnType<typeof projectCatalog>> | undefined;
  const loadData = () => pending ??= readFile(sourcePath, 'utf8').then(text => projectCatalog(JSON.parse(text)));
  return {
    name: 'native-catalog-data',
    configResolved(config) {
      sourcePath = resolve(config.root, 'src/engine/data/generated/native-catalog.json');
      base = config.base;
      build = config.command === 'build';
    },
    buildStart() { pending = undefined; },
    resolveId(id) { if (id === publicId) return resolvedId; },
    async load(id) {
      if (id !== resolvedId) return;
      this.addWatchFile(sourcePath);
      const { index, parts } = await loadData();
      const urls = Object.entries(parts).map(([part, value]) => {
        if (!build) return JSON.stringify(part) + ':' + JSON.stringify(base + route.slice(1) + part + '.json');
        const ref = this.emitFile({ type: 'asset', name: 'native-catalog-' + part + '.json', source: JSON.stringify(value) });
        return JSON.stringify(part) + ':import.meta.ROLLUP_FILE_URL_' + ref;
      });
      return 'export const catalogText = ' + JSON.stringify(JSON.stringify(index)) + '; export const catalogPartUrls = {' + urls.join(',') + '};';
    },
    configureServer(server) {
      // Accept either form: plugin middleware can run before Vite strips its base.
      server.middlewares.use((request, response, next) => {
        const requestedPath = new URL(request.url ?? '/', 'http://localhost').pathname;
        const basePrefix = base.replace(/\/$/, '');
        const pathname = basePrefix && requestedPath.startsWith(basePrefix + route) ? requestedPath.slice(basePrefix.length) : requestedPath;
        if (!pathname.startsWith(route)) return next();
        void (async () => {
          try {
            const part = pathname.slice(route.length).replace(/\.json$/, '');
            const { parts } = await loadData();
            if (!Object.hasOwn(parts, part) || pathname !== route + part + '.json') {
              response.statusCode = 404; response.end('Unknown catalog part'); return;
            }
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.setHeader('Cache-Control', 'no-cache');
            response.end(JSON.stringify(parts[part]));
          } catch (error) {
            server.config.logger.error(String(error));
            response.statusCode = 500; response.end('Unable to load native catalog data');
          }
        })();
      });
    },
    handleHotUpdate({ file, server }) {
      if (resolve(file) !== sourcePath) return;
      pending = undefined;
      const module = server.moduleGraph.getModuleById(resolvedId);
      if (module) server.moduleGraph.invalidateModule(module);
      server.ws.send({ type: 'full-reload' });
      return [];
    },
  };
}
