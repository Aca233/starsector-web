import { build } from 'esbuild';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const outfile = path.resolve('artifacts/projectile-lifecycle-tests/check.mjs');
await build({ entryPoints: ['scripts/check-projectile-lifecycle.mts'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', define: { __LAN_BUILD_ID__: '"lifecycle-test"', 'import.meta.env': '{"BASE_URL":"/","DEV":false}' }, logLevel: 'warning' });
await import(pathToFileURL(outfile));
