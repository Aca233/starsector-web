// Self-contained Windows packaging smoke. Does not initialize Steam or call any
// session API. Exercises explicit Electron FileSet mappings, not a final release.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copySteamMetricsRuntime, steamMetricsExtraResources, verifySteamMetricsRuntime } from './package-steam-metrics-runtime.mjs';

if (process.platform !== 'win32' || process.arch !== 'x64') throw Error('Windows x64 packaging check only');
const project = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
await fs.mkdir(path.join(project, 'artifacts'), { recursive: true });
const output = await fs.mkdtemp(path.join(project, 'artifacts', 'steam-session-runtime-'));
const stage = path.join(output, 'stage', 'backend'), runtime = path.join(output, 'app', 'resources', 'backend');
const copy = async (source, target) => {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.cp(source, target, { recursive: true, dereference: true, errorOnExist: true, force: false });
};
await copySteamMetricsRuntime(project, stage, copy);
for (const entry of steamMetricsExtraResources(stage)) {
  await copy(entry.from, path.join(output, 'app', 'resources', entry.to));
}
await verifySteamMetricsRuntime(runtime);
await copy(path.join(project, 'server/steam/session-metrics.mjs'), path.join(runtime, 'session-metrics.mjs'));
for (const name of ['package.json', 'index.js', 'dist/win64/steam_api64.dll']) {
  await copy(path.join(project, 'node_modules/steamworks.js', name), path.join(runtime, 'node_modules/steamworks.js', name));
}
await fs.writeFile(path.join(runtime, 'probe.mjs'), `
import {createRequire} from 'node:module';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';import {loadSteamSessionReader} from './session-metrics.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),require=createRequire(import.meta.url),resolved={};
for(const name of ['koffi','@koromix/koffi-win32-x64','steamworks.js']){resolved[name]=require.resolve(name);assert.ok(resolved[name].startsWith(root+path.sep));}
const result=loadSteamSessionReader();assert.equal(typeof result.read,'function');console.log(JSON.stringify({bound:true,sdkInitialized:false,sessionQueries:0,resolved}));
`);
const env = { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' };
const result = spawnSync(process.execPath, [path.join(runtime, 'probe.mjs')], {
  cwd: runtime, env, encoding: 'utf8', windowsHide: true, timeout: 30000,
});
if (result.error || result.status !== 0) throw Error(result.error?.message || result.stderr || 'isolated runtime failed');
const report = {
  ...JSON.parse(result.stdout.trim()), output, runtime, explicitElectronFileSets: true,
  helperSha256: createHash('sha256').update(await fs.readFile(path.join(runtime, 'session-metrics.mjs'))).digest('hex'),
  scope: 'Actual copied Windows runtime using Electron FileSet mappings and fixed Steam exports; no SDK initialization, live session/native queue validation or final desktop release',
};
await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(report, null, 2));
await fs.writeFile(path.join(project, 'artifacts/steam-session-runtime-latest.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
