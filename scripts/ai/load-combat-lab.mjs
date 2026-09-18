import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

/** No browser, GPU, Python or live match needed. Run the same TS simulation in Node. */
export async function loadCombatLab() {
  const directory = path.resolve('artifacts/ai');
  await mkdir(directory, { recursive: true });
  const outfile = path.join(directory, `combat-lab-${process.pid}.mjs`);
  await build({ entryPoints: ['scripts/ai/CombatLab.ts'], outfile, bundle: true, platform: 'node',
    define: { 'import.meta.env.BASE_URL': JSON.stringify('/') },
    format: 'esm', target: 'node22', logLevel: 'warning' });
  const engineBundleSha256 = createHash('sha256').update(await readFile(outfile)).digest('hex');
  return { ...await import(pathToFileURL(outfile).href), engineBundleSha256, engineBundlePath: outfile };
}
