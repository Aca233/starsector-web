import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

/** No browser, GPU, Python or live match needed. Run the same TS simulation in Node. */
export async function loadCombatLab({ autofireBaseline, ownedAdmissionBaseline, fleetTacticsBaseline, publisherBaseline } = {}) {
  const directory = path.resolve('artifacts/ai');
  await mkdir(directory, { recursive: true });
  const outfile = path.join(directory, `combat-lab-${process.pid}.mjs`);
  let referenceAdmission;
  if (ownedAdmissionBaseline) {
    const graph = JSON.parse(await readFile(ownedAdmissionBaseline, 'utf8'));
    const row = graph['src/engine/simulation/Ship.ts'];
    if (!row || createHash('sha256').update(row.code).digest('hex') !== row.sha256) throw Error('Invalid admission baseline');
    const matches = [...row.code.matchAll(/export function hasOwnedFireControlReadHooks\(ship: Ship\): boolean \{[\s\S]*?\n\}/g)];
    if (matches.length !== 1) throw Error('Expected one complete frozen owned-admission function');
    referenceAdmission = matches[0][0].replace('hasOwnedFireControlReadHooks', 'BeforeHasOwnedFireControlReadHooks');
  }
  await build({ entryPoints: ['scripts/ai/CombatLab.ts'], outfile, bundle: true, platform: 'node',
    define: { 'import.meta.env.BASE_URL': JSON.stringify('/') },
    format: 'esm', target: 'node22', logLevel: 'warning',
    plugins: autofireBaseline || referenceAdmission || fleetTacticsBaseline || publisherBaseline ? [{ name: 'combat-references', setup(b) {
      b.onLoad({ filter: /[/\\]CombatLab\.ts$/ }, async info => ({ loader: 'ts', resolveDir: path.dirname(info.path),
        contents: await readFile(info.path, 'utf8')
          + (autofireBaseline ? '\nexport { AutofireController as BeforeAutofireController } from "autofire-before";\n' : '')
          + (fleetTacticsBaseline ? '\nexport { planFleetTactics as BeforePlanFleetTactics } from "fleet-tactics-before";\n' : '')
          + (publisherBaseline ? '\nexport { Publisher as BeforePublisher } from "publisher-before";\n' : '')
          + (referenceAdmission ? '\nexport { BeforeHasOwnedFireControlReadHooks } from "../../src/engine/simulation/Ship";\n' : '') }));
      if (autofireBaseline) {
        b.onResolve({ filter: /^autofire-before$/ }, () => ({ path: 'reference', namespace: 'autofire-before' }));
        b.onLoad({ filter: /.*/, namespace: 'autofire-before' }, async () => ({ loader: 'ts',
          contents: await readFile(autofireBaseline, 'utf8'), resolveDir: path.resolve('src/engine/ai') }));
      }
      if (fleetTacticsBaseline) {
        b.onResolve({ filter: /^fleet-tactics-before$/ }, () => ({ path: 'reference', namespace: 'fleet-tactics-before' }));
        b.onLoad({ filter: /.*/, namespace: 'fleet-tactics-before' }, async () => ({ loader: 'ts',
          contents: await readFile(fleetTacticsBaseline, 'utf8'), resolveDir: path.resolve('src/engine/ai') }));
      }
      if (publisherBaseline) {
        b.onResolve({ filter: /^publisher-before$/ }, () => ({ path: 'reference', namespace: 'publisher-before' }));
        b.onLoad({ filter: /.*/, namespace: 'publisher-before' }, async () => ({ loader: 'ts',
          contents: await readFile(publisherBaseline, 'utf8'), resolveDir: path.resolve('src/engine/ai/multicore') }));
      }
      // Same module, same native callback WeakMaps: do not instantiate a second Ship class.
      if (referenceAdmission) b.onLoad({ filter: /[/\\]simulation[/\\]Ship\.ts$/ }, async info => ({ loader: 'ts',
        resolveDir: path.dirname(info.path), contents: await readFile(info.path, 'utf8') + '\n' + referenceAdmission + '\n' }));
    } }] : [] });
  const engineBundleSha256 = createHash('sha256').update(await readFile(outfile)).digest('hex');
  return { ...await import(pathToFileURL(outfile).href), engineBundleSha256, engineBundlePath: outfile };
}
