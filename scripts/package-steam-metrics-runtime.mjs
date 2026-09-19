import path from 'node:path';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

export const STEAM_METRICS_PACKAGES = Object.freeze(['koffi', '@koromix/koffi-win32-x64']);

/** Explicit Windows-x64 runtime dependency for the helper's fixed read-only FFI.
 * Do not ship unrelated platform binaries or rely on the parent app's node path. */
export async function copySteamMetricsRuntime(project, destination, copy) {
  for (const name of STEAM_METRICS_PACKAGES) {
    await copy(path.join(project, 'node_modules', name), path.join(destination, 'node_modules', name));
  }
}

/** electron-builder omits root node_modules from the broad backend FileSet.
 * The native diagnostic dependencies need explicit FileSets as well as staging. */
export function steamMetricsExtraResources(backend) {
  return STEAM_METRICS_PACKAGES.map(name => ({
    from: path.join(backend, 'node_modules', name), to: 'backend/node_modules/' + name,
  }));
}

/** Fail packaging if a dependency falls through to the development checkout or
 * the desktop parent's ASAR. Resolution alone does not invoke the native SDK. */
export async function verifySteamMetricsRuntime(backend) {
  const require = createRequire(path.join(backend, 'package.json'));
  for (const name of STEAM_METRICS_PACKAGES) {
    if (!require.resolve(name).startsWith(path.join(backend, 'node_modules') + path.sep)) {
      throw Error('Steam diagnostics dependency escaped the packaged backend: ' + name);
    }
  }
  await fs.access(path.join(backend, 'node_modules', '@koromix', 'koffi-win32-x64', 'win32_x64', 'koffi.node'));
}
