/** Bounded source refresh: lifecycle fields/status only, never full content/assets/campaign import. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const root = path.resolve('../starsector-core');
const generated = path.resolve('src/engine/data/generated');
const outfile = path.resolve('artifacts/projectile-lifecycle-tests/source-reader.mjs');
await build({ stdin: { contents: `export { parseStarsectorJson } from './src/engine/data/StarsectorTextParsers'; export { missileLifecycleSpecFromSource } from './src/engine/data/MissileLifecycleSpec';`, resolveDir: process.cwd() }, outfile, bundle: true, platform: 'node', format: 'esm', logLevel: 'warning' });
const { parseStarsectorJson: parse, missileLifecycleSpecFromSource } = await import(pathToFileURL(outfile));
const read = async p => parse(await fs.readFile(path.join(root, p), 'utf8'));
const projectiles = new Map();
async function scan(dir) {
  for (const entry of (await fs.readdir(path.join(root, dir), { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name,'en'))) {
    const p = dir + '/' + entry.name;
    if (entry.isDirectory()) await scan(p);
    else if (entry.name.endsWith('.proj')) {
      const data = await read(p);
      if (!projectiles.has(data.id) || path.basename(p, '.proj') === data.id) projectiles.set(data.id, data);
    }
  }
}
await scan('data/weapons');
const names = ['weapons', 'refit-source', 'runtime-import-report'];
const data = Object.fromEntries(await Promise.all(names.map(async name => [name, JSON.parse(await fs.readFile(path.join(generated, name + '.json'), 'utf8'))])));
let missileCount = 0, plasmaCount = 0;
const fixed = /^Native projectile (collisionClassAfterFlameout|dudProbabilityOnFlameout|fizzleOnReachingWeaponRange|flameoutTime|noCollisionWhileFading|reduceDamageWhileFading|maxFlightTime)=/;
for (const [id, spec] of Object.entries(data.weapons)) {
  const wpn = await read(data['runtime-import-report'].weapons[id].sourcePath);
  if (!wpn.projectileSpecId) continue;
  const proj = projectiles.get(wpn.projectileSpecId);
  if (!proj) throw Error('Missing projectile ' + wpn.projectileSpecId);
  let reason;
  if (proj.spawnType === 'PLASMA') {
    spec.spawnType = 'PLASMA'; plasmaCount++;
    reason = 'Native PLASMA lifetime is restored; rotating-ray appearance and charge/collision geometry remain approximate.';
  }
  if (proj.specClass === 'missile') {
    spec.missileLifecycleSpec = missileLifecycleSpecFromSource(proj); missileCount++;
    reason = 'Native missile flameout timing is restored; MISSILE_FF/team collision filtering and engine spool visuals remain approximate.';
  }
  if (!reason) continue;
  for (const status of [data['refit-source'].weaponStatus[id], data['runtime-import-report'].weapons[id]]) {
    status.reasons = status.reasons.filter(r => !fixed.test(r) && !r.startsWith('Native spawn type PLASMA '));
    if (!status.reasons.includes(reason)) status.reasons.push(reason);
    status.level = 'approximate';
  }
}
const report = data['runtime-import-report'];
for (const level of ['supported','approximate']) report.counts.weapons[level] = Object.values(report.weapons).filter(w => w.registered && w.level === level).length;
for (const name of names) {
  const file = path.join(generated, name + '.json'), next = JSON.stringify(data[name], null, 2) + '\n';
  if (process.argv.includes('--check')) {
    if (JSON.stringify(JSON.parse(await fs.readFile(file, 'utf8'))) !== JSON.stringify(data[name])) throw Error('Lifecycle metadata stale: ' + name);
  } else await fs.writeFile(file, next);
}
console.log(`Source lifecycle sweep: ${plasmaCount} plasma weapons, ${missileCount} missile/torpedo weapons; ${process.argv.includes('--check') ? 'verified' : 'updated'}.`);
