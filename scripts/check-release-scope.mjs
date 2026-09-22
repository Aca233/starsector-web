// Release-only safety check. Existing catalog icons/audio named campaign are not
// a game mode; only unfinished mode sources, entrypoints and new scripts are barred.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const careerOnlyFiles=[
  "scripts/lib/NativeClockCapture.java",
  "scripts/lib/NativeFactionPersonInputs.java",
  "scripts/lib/NativeFleetCompositionConstants.java",
  "scripts/lib/NativeFleetMotionProbe.java",
  "scripts/lib/NativeJsonOrder.java",
  "public/game-assets/graphics/fonts/native-menu/victor10.fnt",
  "public/game-assets/graphics/fonts/native-menu/victor10_0.png",
  "public/game-assets/graphics/fx/ship_shadow_mask.png",
  "public/game-assets/graphics/warroom/ship_arrow.png",
  "public/game-assets/graphics/fx/particleline32ln.png"
];
const forbidden = ['src/campaign', 'server/campaign', 'campaign.html', 'tsconfig.campaign.json',...careerOnlyFiles];
for (const name of forbidden) assert.ok(!fs.existsSync(name), 'Build from a clean release checkout without unfinished career mode: ' + name);
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const unexpected = files.filter(name => /^(?:src|server)\/campaign\//.test(name)
  || /^(?:campaign\.html|tsconfig\.campaign\.json)$/.test(name)
  || /^(?:scripts|docs)\/.*(?:campaign|career)[^/]*$/i.test(name));
assert.deepEqual(unexpected, [], 'Unfinished career files must not be committed for this release');
assert.doesNotMatch(fs.readFileSync('vite.config.ts', 'utf8'), /campaign\.html/);
assert.ok(!fs.existsSync('dist/campaign.html'), 'Stale career build output must not enter a release');
for(const file of careerOnlyFiles)if(file.startsWith('public/'))assert.ok(!fs.existsSync('dist/'+file.slice(7)),'Stale career asset in release: '+file);
console.log('Release scope OK: no unfinished career source, entrypoint or build output.');
