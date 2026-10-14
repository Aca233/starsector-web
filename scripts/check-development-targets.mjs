import assert from 'node:assert/strict';
import path from 'node:path';
import {resolveConfig, build} from 'vite';
const root = path.resolve(import.meta.dirname, '..');
for (const [file, input, required] of [
  ['vite.combat.config.ts', 'index.html', 'local-combat-development-scope'],
  ['vite.campaign-dev.config.ts', 'campaign.html', 'combat-replay-build'],
  ['vite.server.config.ts', 'index.html', 'dedicated-combat-scope'],
]) {
  const config = await resolveConfig({root, configFile: path.join(root, file), publicDir: false}, 'build');
  assert.deepEqual(Object.values(config.build.rollupOptions.input), [input], file);
  assert.ok(config.plugins.some(plugin => plugin.name === required), file + ' lost required scope plugin');
  assert.ok(config.plugins.some(plugin => plugin.name === 'combat-replay-build'), file + ' lost base plugins');
  assert.ok(config.define.__LAN_BUILD_ID__, file + ' lost shared defines');
  if (file === 'vite.server.config.ts') assert.equal(config.define['import.meta.env.VITE_SERVER_AUTHORITY'], '"true"');
}
console.log('Combat, campaign development and dedicated host configurations preserve base plugins and correct entrypoints.');
if (process.argv.includes('--build')) {
  // Code/Worker validation only; do not copy/encode media or create a release package.
  await build({root, configFile: path.join(root, 'vite.combat.config.ts'), publicDir: false,
    build: {copyPublicDir: false, outDir: path.join(root, 'artifacts/foundation-code-build')}, logLevel: 'warn'});
  console.log('Combat development code and Worker chunks built successfully.');
}
