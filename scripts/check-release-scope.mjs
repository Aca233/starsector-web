// Release-only safety check. Existing catalog icons/audio named campaign are not
// a game mode; only unfinished mode sources, entrypoints and new scripts are barred.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const forbidden = ['src/campaign', 'server/campaign', 'campaign.html', 'tsconfig.campaign.json'];
for (const name of forbidden) assert.ok(!fs.existsSync(name), 'Build from a clean release checkout without unfinished career mode: ' + name);
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const unexpected = files.filter(name => /^(?:src|server)\/campaign\//.test(name)
  || /^(?:campaign\.html|tsconfig\.campaign\.json)$/.test(name)
  || /^(?:scripts|docs)\/[^/]*campaign[^/]*$/.test(name));
assert.deepEqual(unexpected, [], 'Unfinished career files must not be committed for this release');
assert.doesNotMatch(fs.readFileSync('vite.config.ts', 'utf8'), /campaign\.html/);
assert.ok(!fs.existsSync('dist/campaign.html'), 'Stale career build output must not enter a release');
console.log('Release scope OK: no unfinished career source, entrypoint or build output.');
