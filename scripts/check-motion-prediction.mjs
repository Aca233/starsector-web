import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const baseline = path.resolve('scripts/fixtures/motion-prediction-phase25.txt');
const outfile = path.resolve('artifacts/network-stream-20260921/phase26/check-motion-prediction.mjs');
const result = await build({ entryPoints: ['scripts/check-motion-prediction.mts'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', metafile: true,
  define: { __LAN_BUILD_ID__: '"motion-prediction-test"', 'import.meta.env': '{"BASE_URL":"/","DEV":false,"VITE_LAN_AI_WORKERS":"false"}' }, logLevel: 'warning',
  plugins: [{ name: 'before-prediction', setup(b) {
    b.onResolve({filter: /^phase26-baseline-motion$/}, () => ({path: baseline, namespace: 'before'}));
    b.onLoad({filter: /.*/, namespace: 'before'}, async () => ({contents: await fs.readFile(baseline, 'utf8'), loader: 'ts', resolveDir: path.resolve('src/network')}));
  } }] });
if (Object.keys(result.metafile.inputs).some(p => /(^|\/)campaign(\/|\.)/.test(p))) throw Error('Campaign leaked into prediction test');
await import(pathToFileURL(outfile).href);
