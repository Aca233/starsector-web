import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOOTSTRAP_VERSION, UPDATE_REPOSITORY, inside, sha256File, versionParts } from '../server/portable-update.mjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--version') throw Error('Usage: npm run release:manifest -- --version x.y.z');
const version = args[1];
versionParts(version);
const output = path.join(project, 'artifacts', 'releases');
const packages = {};
for (const name of await fs.readdir(output)) {
  if (!name.endsWith('.update.json')) continue;
  const entry = JSON.parse(await fs.readFile(inside(output, name), 'utf8'));
  if (entry.version !== version) continue;
  if (entry.schema !== 1 || entry.repository !== UPDATE_REPOSITORY || !['multiplayer', 'steam'].includes(entry.variant)
    || entry.package?.bootstrapVersion !== BOOTSTRAP_VERSION || typeof entry.package.asset !== 'string'
    || !/^[A-Za-z0-9.-]+\.zip$/.test(entry.package.asset)) throw Error(`Invalid update entry: ${name}`);
  if (packages[entry.variant]) throw Error(`Multiple packages for ${version}/${entry.variant}; use a clean release output directory`);
  const zip = inside(output, entry.package.asset);
  if ((await fs.stat(zip)).size !== entry.package.bytes || await sha256File(zip) !== entry.package.sha256) throw Error(`Package verification failed: ${entry.package.asset}`);
  packages[entry.variant] = entry.package;
}
if (!packages.multiplayer || !packages.steam) throw Error('Build both multiplayer and Steam packages for the same version before publishing');
const manifest = { schema: 1, repository: UPDATE_REPOSITORY, version, packages };
await fs.writeFile(inside(output, 'windows-updates.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Created windows-updates.json for ${version} (multiplayer + Steam)`);
