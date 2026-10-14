import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = process.cwd(), args = process.argv.slice(2);
const option = (key, fallback) => { const i = args.indexOf(key); return i < 0 ? fallback : args[i + 1]; };
const out = path.resolve(option('--out', 'artifacts/rust-combat-core-20261008/core-authority-projected-frames'));
const warm = Number(option('--warm', '60')), steps = Number(option('--steps', '120'));
if (!Number.isSafeInteger(warm) || warm < 0 || !Number.isSafeInteger(steps) || steps < 1) throw Error('Invalid benchmark length');
const wasmPath = path.resolve(option('--wasm', 'artifacts/rust-combat-core-20261008/build/wasm32-unknown-unknown/release/foundry_combat_core.wasm'));
const wasm = fs.readFileSync(wasmPath), hash = value => createHash('sha256').update(value).digest('hex');
const sha256 = hash(wasm), frozen = {};
fs.mkdirSync(out, { recursive: true });
if (fs.existsSync(path.join(out, 'result.json'))) throw Error('Refusing to overwrite a completed projected-frames measurement');
const define = { 'import.meta.env': JSON.stringify({ BASE_URL: '/', DEV: false, PROD: true }), '__LAN_BUILD_ID__': JSON.stringify('projected-frames-frozen') };
const plugins = [{ name: 'freeze-production-modules', setup(b) {
  b.onResolve({ filter: /\?raw$/ }, a => ({ path: path.resolve(a.resolveDir, a.path.slice(0, -4)), namespace: 'raw' }));
  b.onLoad({ filter: /.*/, namespace: 'raw' }, a => {
    const code = fs.readFileSync(a.path, 'utf8'); frozen[path.relative(root, a.path).replaceAll('\\', '/') + '?raw'] = { code, sha256: hash(code) };
    return { contents: code, loader: 'text' };
  });
  b.onLoad({ filter: /\.(ts|tsx|mts|mjs|js|json)$/ }, a => {
    const key = path.relative(root, a.path).replaceAll('\\', '/');
    if (key.startsWith('node_modules/')) return;
    const disk = fs.readFileSync(a.path, 'utf8');
    if (frozen[key] && frozen[key].code !== disk) throw Error('Source changed while freezing: ' + key);
    frozen[key] = { code: disk, sha256: hash(disk) };
    const code = disk.replace("new URL('./local-combat.worker.ts', import.meta.url)", "new URL('/authority.mjs', location.href)");
    return { contents: code, loader: path.extname(a.path).slice(1).replace('mts', 'ts').replace('mjs', 'js') };
  });
} }];
for (const [name, entry] of [['authority', 'src/engine/runtime/local/local-combat.worker.ts'], ['measure', 'scripts/lib/projected-frames-performance.ts']]) {
  const built = await build({ entryPoints: [entry], outfile: path.join(out, name + '.mjs'), bundle: true,
    platform: 'browser', format: 'esm', target: 'es2023', mainFields: ['module', 'main'], define, plugins, metafile: true });
  if (Object.keys(built.metafile.inputs).some(p => /[/\\]campaign[/\\]/.test(p))) throw Error('Campaign entered projected-frames check');
}
fs.writeFileSync(path.join(out, 'frozen-sources.json'), JSON.stringify(frozen));
const bundles = Object.fromEntries(['authority', 'measure'].map(n => [n, hash(fs.readFileSync(path.join(out, n + '.mjs')))]));
const mime = { '.wasm': 'application/wasm', '.json': 'application/json', '.mjs': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg' };
const server = http.createServer((request, response) => {
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin'); response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Projected frames check</title>'); return; }
  if (pathname === '/favicon.ico') { response.writeHead(204); response.end(); return; }
  if (pathname === '/game-assets/runtime/combat-core.wasm') { response.setHeader('Content-Type', 'application/wasm'); response.end(wasm); return; }
  if (pathname === '/game-assets/runtime/combat-core.json') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ version: 1, sha256, bytes: wasm.length })); return; }
  const target = pathname === '/authority.mjs' || pathname === '/measure.mjs' ? path.join(out, pathname.slice(1)) : path.resolve('public', '.' + decodeURIComponent(pathname));
  const allowed = target.startsWith(path.resolve('public') + path.sep) || target === path.join(out, 'authority.mjs') || target === path.join(out, 'measure.mjs');
  if (!allowed || !fs.existsSync(target) || !fs.statSync(target).isFile()) { response.writeHead(404); response.end(); return; }
  response.setHeader('Content-Type', mime[path.extname(target)] ?? 'application/octet-stream'); fs.createReadStream(target).pipe(response);
});
const require = createRequire(import.meta.url), { chromium } = require(require.resolve('playwright', { paths: [root, 'C:/Users/Aca/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'] }));
let browser;
const arms = [], errors = [];
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); browser = await chromium.launch({ headless: true });
  const address = 'http://127.0.0.1:' + server.address().port;
  for (const [index, projected] of [false, true, true, false].entries()) {
    const page = await browser.newPage(); page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(address);
    const arm = await page.evaluate(async ({ projected, warm, steps }) => (await import('/measure.mjs')).measureProjected(projected, warm, steps), { projected, warm, steps });
    arms.push(arm); fs.writeFileSync(path.join(out, 'arm-' + index + '.json'), JSON.stringify(arm));
    console.log('PROJECTED-FRAMES arm ' + index + ' projected=' + projected + ' completed ' + arm.finalTick + ' ticks, problems ' + arm.problems.length);
    await page.close();
  }
  const syntheticPage = await browser.newPage();
  await syntheticPage.goto(address);
  const synthetic = await syntheticPage.evaluate(async () => (await import('/measure.mjs')).exerciseProjectedUploader());
  await syntheticPage.close();
  await browser.close(); browser = undefined;
  // --- Synthetic planner / uploader assertions -------------------------------
  const expectedGroups = [
    { start: 0, count: 2, textureKey: 'hull-a' }, { start: 2, count: 1, textureKey: 'hull-b' },
    { start: 3, count: 1, textureKey: 'hull-c' }, { start: 4, count: 1, textureKey: 'hull-d' },
    { start: 5, count: 3, textureKey: '' },
  ];
  const planChecks = [
    ['plan total', synthetic.plan.total === 8],
    ['plan groups', JSON.stringify(synthetic.plan.groups) === JSON.stringify(expectedGroups)],
    ['plan order preserved', JSON.stringify(synthetic.plan.orderedX) === JSON.stringify([0, 50, 10, 20, 30, 40, 60, 70])],
    ['upload count', synthetic.upload.stats.uploadedSpriteCount === 8],
    ['upload bytes', synthetic.upload.stats.uploadBytes === 8 * 16 * 4],
    ['upload groups', synthetic.upload.groups === 5],
    ['upload draws', JSON.stringify(synthetic.upload.draws.map(d => [d.textureKey, d.start, d.count])) === JSON.stringify(expectedGroups.map(g => [g.textureKey, g.start, g.count]))],
    ['upload bindings', JSON.stringify(synthetic.upload.bound) === JSON.stringify(['hull-a', 'hull-b', 'hull-c', 'hull-d', ''])],
  ];
  for (const [name, ok] of planChecks) if (!ok) throw Error('Synthetic projected uploader check failed: ' + name + ' -> ' + JSON.stringify(synthetic));
  // --- Wire gates -------------------------------------------------------------
  const offArms = arms.filter((_, i) => i === 0 || i === 3), onArms = arms.filter((_, i) => i === 1 || i === 2);
  const problems = arms.flatMap(arm => arm.problems);
  const stats = values => { const sorted = [...values].sort((a, b) => a - b); return { mean: values.reduce((sum, n) => sum + n, 0) / values.length, p95: sorted[Math.ceil(sorted.length * .95) - 1] }; };
  const simulation = list => stats(list.flatMap(arm => arm.samples.map(row => row.simulation)));
  const additiveSimulationMs = simulation(onArms).mean - simulation(offArms).mean;
  const projectedBytes = stats(onArms.flatMap(arm => arm.samples.map(row => row.projectedBytes)));
  // Cross-arm witness parity: the toggle must not perturb the authority.
  let witnessDiffs = 0;
  for (let arm = 1; arm < arms.length; arm++) {
    const a = arms[0], b = arms[arm];
    if (a.witnesses.length !== b.witnesses.length) throw Error('Arm witness count differs');
    for (let tick = 0; tick < a.witnesses.length; tick++) for (let field = 0; field < a.witnesses[tick].length; field++)
      if (!Object.is(a.witnesses[tick][field], b.witnesses[tick][field])) witnessDiffs += 1;
  }
  const gates = {
    toggleOffClean: offArms.every(arm => arm.problems.every(p => p.kind !== 'toggle' && p.kind !== 'missing')),
    geometryAndWitnessClean: onArms.every(arm => arm.problems.length === 0),
    additiveSimulationBounded: additiveSimulationMs <= 0.5,
    witnessParity: witnessDiffs === 0,
    syntheticPlanner: planChecks.every(([, ok]) => ok),
  };
  const passed = Object.values(gates).every(Boolean) && !errors.length;
  const result = { passed, gates, sha256, wasmPath, bundles, browser: browser === undefined ? 'closed' : browser.version(),
    environment: { node: process.version, os: os.version(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length },
    scope: 'Actual production local Worker with projectedPresentation off/on/on/off in one session. The presenter packet is still produced while the toggle is on, so encodeMs is expected unchanged; the additive simulation cost of the projection frame is the measured quantity. Geometry: projected sprite poses vs presenter ship poses per entity id; witness: projected vs snapshot 22 words bit-exact.',
    arms: arms.map(arm => ({ projected: arm.projected, finalTick: arm.finalTick, problems: arm.problems.length,
      simulation: stats(arm.samples.map(r => r.simulation)), encode: stats(arm.samples.map(r => r.encode)),
      projectedBytes: stats(arm.samples.map(r => r.projectedBytes)) })),
    additiveSimulationMs, problems: problems.slice(0, 20), problemCount: problems.length, errors, warm, steps, synthetic };
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exitCode = 1;
} catch (error) { fs.writeFileSync(path.join(out, 'failure.json'), JSON.stringify({ error: String(error), stack: error.stack, errors, sha256, bundles, completedArms: arms.length }, null, 2)); throw error;
} finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
