import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { registerHooks } from 'node:module';

// One focused, headless check; bundle in memory and leave no generated files.
const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const result = await build({
  absWorkingDir: root,
  entryPoints: ['scripts/check-record-deltas.mts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'es2023',
  write: false,
  logLevel: 'warning',
  define: {
    __LAN_BUILD_ID__: '"record-deltas-check"',
    // Deliberately opposite defaults: the fixture MUST pass both flags explicitly.
    'import.meta.env': JSON.stringify({ BASE_URL: '/', DEV: false,
      VITE_LAN_AI_WORKERS: 'false', VITE_LAN_COMPONENTS: 'false',
      VITE_LAN_FIXED_DISPLAY: 'true', VITE_LAN_RECORD_DELTAS: 'true' }),
  },
});
// A virtual module URL keeps failures readable (no megabytes of base64 stacks).
const bundleURL = new URL('./check-record-deltas.bundle.mjs', import.meta.url).href;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    return specifier === bundleURL ? { url: bundleURL, shortCircuit: true } : nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    return url === bundleURL
      ? { format: 'module', source: result.outputFiles[0].text, shortCircuit: true }
      : nextLoad(url, context);
  },
});
try { await import(bundleURL); } finally { hooks.deregister(); }
