import { build } from 'esbuild';
// Bundle in memory: standalone test run writes no fixtures/build outputs to the repo.
const result = await build({ entryPoints: ['scripts/check-combat-component-events.mts'], bundle: true,
  platform: 'node', format: 'esm', target: 'es2023', write: false, logLevel: 'warning' });
await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
