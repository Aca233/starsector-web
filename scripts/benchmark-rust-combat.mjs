import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = process.cwd(), args = process.argv.slice(2);
const option = (key, fallback) => { const i = args.indexOf(key); return i < 0 ? fallback : args[i + 1]; };
const out = path.resolve(option('--out', 'artifacts/rust-combat-core-20261008/performance-abba'));
const warm = Number(option('--warm', '90')), steps = Number(option('--steps', '180'));
if (!Number.isSafeInteger(warm) || warm < 0 || !Number.isSafeInteger(steps) || steps < 1) throw Error('Invalid benchmark length');
const wasmPath = path.resolve(option('--wasm', 'public/game-assets/runtime/combat-core.wasm'));
const wasm = fs.readFileSync(wasmPath), hash = value => createHash('sha256').update(value).digest('hex');
const sha256 = hash(wasm), frozen = {};
fs.mkdirSync(out, { recursive: true });
if (fs.existsSync(path.join(out, 'result.json'))) throw Error('Refusing to overwrite a completed ABBA measurement');
const define = { 'import.meta.env': JSON.stringify({ BASE_URL: '/', DEV: false, PROD: true }), '__LAN_BUILD_ID__': JSON.stringify('rust-abba-frozen') };
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
for (const [name, entry] of [['authority', 'src/engine/runtime/local/local-combat.worker.ts'], ['measure', 'scripts/lib/rust-combat-performance.ts']]) {
  const built = await build({ entryPoints: [entry], outfile: path.join(out, name + '.mjs'), bundle: true,
    platform: 'browser', format: 'esm', target: 'es2023', mainFields: ['module', 'main'], define, plugins, metafile: true });
  if (Object.keys(built.metafile.inputs).some(p => /[/\\]campaign[/\\]/.test(p))) throw Error('Campaign entered combat benchmark');
}
fs.writeFileSync(path.join(out, 'frozen-sources.json'), JSON.stringify(frozen));
const bundles = Object.fromEntries(['authority', 'measure'].map(n => [n, hash(fs.readFileSync(path.join(out, n + '.mjs')))]));
const mime = { '.wasm': 'application/wasm', '.json': 'application/json', '.mjs': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg' };
const server = http.createServer((request, response) => {
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin'); response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Frozen combat performance</title>'); return; }
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
  for (const [index, backend] of ['typescript', 'rust-wasm', 'rust-wasm', 'typescript'].entries()) {
    const page = await browser.newPage(); page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(address);
    const arm = await page.evaluate(async ({ backend, warm, steps }) => (await import('/measure.mjs')).measure(backend, warm, steps), { backend, warm, steps });
    arms.push(arm); fs.writeFileSync(path.join(out, 'arm-' + index + '.json'), JSON.stringify(arm));
    console.log('RUST-ABBA arm ' + index + ' ' + backend + ' completed ' + arm.finalTick + ' ticks'); await page.close();
  }
  const geometric = new Set([8, 9, 10, 11, 12, 16, 17]); let strict = 0, geometry = 0, maxDifference = 0;
  for (let arm = 1; arm < arms.length; arm++) {
    const a = arms[0], b = arms[arm];
    if (a.witnesses.length !== b.witnesses.length) throw Error('ABBA completed tick count differs');
    for (let tick = 0; tick < a.witnesses.length; tick++) for (let field = 0; field < a.witnesses[tick].length; field++) {
      const expected = a.witnesses[tick][field], actual = b.witnesses[tick][field];
      if (geometric.has(field)) { geometry++; const d = Math.abs(expected - actual); maxDifference = Math.max(maxDifference, d); if (d > Math.max(1e-9, 32 * Number.EPSILON * Math.max(1, Math.abs(expected), Math.abs(actual)))) throw Error(`ABBA arm ${arm} tick ${tick} geometry[${field}] ${actual}/${expected}`); }
      else { strict++; if (!Object.is(expected, actual)) throw Error(`ABBA arm ${arm} tick ${tick} strict[${field}] ${actual}/${expected}`); }
    }
  }
  const stats = values => { const sorted = [...values].sort((a, b) => a - b); return { mean: values.reduce((sum, n) => sum + n, 0) / values.length, p95: sorted[Math.ceil(sorted.length * .95) - 1], p99: sorted[Math.ceil(sorted.length * .99) - 1] }; };
  const metrics = arm => Object.fromEntries(['simulation', 'encode', 'decode', 'roundtrip'].map(key => [key, stats(arm.samples.map(row => row[key]))]));
  const aggregates = Object.fromEntries(['typescript', 'rust-wasm'].map(backend => [backend, metrics({ samples: arms.filter(arm => arm.backend === backend).flatMap(arm => arm.samples) })]));
  const pairs = [[0, 1], [3, 2]].map(([ts, rust]) => ({ ts, rust, simulationReduction: 1 - metrics(arms[rust]).simulation.mean / metrics(arms[ts]).simulation.mean,
    roundtripReduction: 1 - metrics(arms[rust]).roundtrip.mean / metrics(arms[ts]).roundtrip.mean }));
  const ts = aggregates.typescript, rust = aggregates['rust-wasm'];
  const gate = pairs.every(pair => pair.simulationReduction > 0 && pair.roundtripReduction > 0)
    && rust.simulation.mean <= ts.simulation.mean * .7 && rust.roundtrip.mean <= ts.roundtrip.mean * .8
    && rust.simulation.p95 <= ts.simulation.p95 && rust.simulation.p99 <= ts.simulation.p99
    && rust.roundtrip.p95 <= ts.roundtrip.p95 && rust.roundtrip.p99 <= ts.roundtrip.p99;
  const result = { passed: !errors.length, performanceGate: gate, sha256, wasmPath, bundles, browser: browser.version(),
    environment: { node: process.version, os: os.version(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length },
    scope: 'Actual production local Worker, command/rules/publication/encoding/IPC/decoding. Fixed 60Hz dt; no renderer or cross-machine network. Independent fresh pages in TS/Rust/Rust/TS order. All raw samples retained.',
    strict, geometry, maxDifference, errors, pairs, aggregates, armMetrics: arms.map(metrics), warm, steps, fullBattleReady: false };
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exitCode = 1;
} catch (error) { fs.writeFileSync(path.join(out, 'failure.json'), JSON.stringify({ error: String(error), stack: error.stack, errors, sha256, bundles, completedArms: arms.length }, null, 2)); throw error;
} finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
