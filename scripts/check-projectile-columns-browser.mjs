import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import assert from 'node:assert/strict';
import { createRequire } from 'node:module'; import { build } from 'esbuild';
const require = createRequire(import.meta.url); let playwright;
try { playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); }
catch (error) { if (process.env.PLAYWRIGHT_MODULE) throw error; playwright = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const base = path.resolve('artifacts/projectile-columns-20260919/repeat-1'), publicRoot = path.resolve('public');
const profile = JSON.parse(fs.readFileSync(path.join(base, 'production-profile.json')));
const cases = [600, 660, 720].map(tick => ({ tick, full: fs.readFileSync(path.join(base, `full-${tick}.bin`)).toString('base64'), compact: fs.readFileSync(path.join(base, `columns-${tick}.bin`)).toString('base64') }));
const code = (await build({ stdin: { contents: 'export {createLanWorld} from "./src/network/LanWorld"; export {assetManager} from "./src/engine/assets/AssetResolver"; export {applyCombatSnapshots} from "./src/network/CombatSnapshot"; export {decodeBinaryState} from "./src/network/BinarySnapshot.mjs";', resolveDir: process.cwd() }, bundle: true, platform: 'browser', format: 'iife', globalName: 'fixture', write: false, define: { __LAN_BUILD_ID__: '"columns-browser-test"', 'import.meta.env': '{"BASE_URL":"/","DEV":false}' }, logLevel: 'silent' })).outputFiles[0].text;
const browser = await playwright.chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE || (process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : undefined) });
try {
  const page = await browser.newPage(), errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url()); if (url.origin !== 'http://columns.test') return route.abort();
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Isolated projectile regression</title>' });
    const file = path.resolve(publicRoot, decodeURIComponent(url.pathname).replace(/^\//, ''));
    if (!file.startsWith(publicRoot + path.sep)) return route.abort();
    try { return await route.fulfill({ contentType: file.endsWith('.json') ? 'application/json' : 'application/octet-stream', body: fs.readFileSync(file) }); }
    catch { return route.fulfill({ status: 404, body: '' }); }
  });
  await page.goto('http://columns.test'); await page.addScriptTag({ content: code });
  const result = await page.evaluate(async ({ match, cases }) => {
    await fixture.assetManager.ensureManifestLoaded();
    const full = fixture.createLanWorld(match).engine, compact = fixture.createLanWorld(match).engine;
    const decode = data => fixture.decodeBinaryState(Uint8Array.from(atob(data), c => c.charCodeAt(0))).frame;
    let comparisons = 0;
    for (const c of cases) {
      const a = decode(c.full), b = decode(c.compact);
      if (!b.world.projectiles.$projectileColumns) throw Error('Fixture not compact');
      fixture.applyCombatSnapshots(full, [a], false, undefined, { nativeTargeting: true });
      fixture.applyCombatSnapshots(compact, [b], false, undefined, { nativeTargeting: true });
      if (JSON.stringify(full.projectiles) !== JSON.stringify(compact.projectiles)) throw Error('Projectile state differs at ' + c.tick);
      comparisons += compact.projectiles.length;
      const freshA = fixture.createLanWorld(match).engine, freshB = fixture.createLanWorld(match).engine;
      fixture.applyCombatSnapshots(freshA, [a], true, undefined, { nativeTargeting: true }); fixture.applyCombatSnapshots(freshB, [b], true, undefined, { nativeTargeting: true });
      if (JSON.stringify(freshA.projectiles) !== JSON.stringify(freshB.projectiles)) throw Error('Fresh restore differs');
      comparisons += freshB.projectiles.length;
    }
    return { scope: 'Real browser SWF2 decode and native restore of paired production captures; not a network/FPS measurement.', frames: cases.length, projectileComparisons: comparisons, exact: true };
  }, { match: profile.match, cases });
  assert.deepEqual(errors, []); result.browserVersion = browser.version();
  fs.writeFileSync(path.resolve('artifacts/projectile-columns-20260919/browser.json'), JSON.stringify(result, null, 2)); console.log(result);
} finally { await browser.close(); }
