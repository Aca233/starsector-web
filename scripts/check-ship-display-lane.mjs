// Focused lane check only. Bundles in memory: no artifacts or production writes.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const rawText = {
  name: 'ship-display-raw-text',
  setup(b) {
    b.onResolve({ filter: /\?raw$/ }, args => ({ path: path.resolve(args.resolveDir, args.path.slice(0, -4)), namespace: 'raw-text' }));
    b.onLoad({ filter: /.*/, namespace: 'raw-text' }, args => ({ contents: fs.readFileSync(args.path, 'utf8'), loader: 'text' }));
  },
};
try {
  const result = await build({
    entryPoints: ['scripts/check-ship-display-lane.mts'],
    absWorkingDir: root, bundle: true, write: false, platform: 'node', format: 'esm',
    plugins: [rawText],
    define: { __LAN_BUILD_ID__: '"ship-display-check"', 'import.meta.env': '{"BASE_URL":"/","DEV":false,"VITE_LAN_AI_WORKERS":"false"}' },
    logLevel: 'warning',
  });
  await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].contents).toString('base64'));
} catch (error) {
  // A data-URL stack otherwise prints the entire in-memory bundle on failure.
  console.error('SHIP_DISPLAY_CHECK_FAILED', String(error?.message ?? error));
  process.exitCode = 1;
}
