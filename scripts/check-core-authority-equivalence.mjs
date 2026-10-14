import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

// P2 of docs/core-authority-migration-plan-2026-10-13.md:
// the E1 equivalence gate harness. Runs one mixed command journal (steps + pilot /
// ship / tactical / add-ship commands) three times through the production
// RustCombatKernel: baseline, repeat (replay determinism), and deviated (one extra
// combat RNG draw at a fixed entry = the negative control for the failure mode the
// migration fears most: RNG consumption order drifting by one step).
// Pass requires: baseline === repeat bit-exactly (witness + full-state fingerprint
// + command receipts) AND baseline !== deviated. Otherwise the gate is useless.

const root = process.cwd(), args = process.argv.slice(2);
const option = (key, fallback) => { const i = args.indexOf(key); return i < 0 ? fallback : args[i + 1]; };
const out = path.resolve(option('--out', 'artifacts/rust-combat-core-20261008/core-authority-equivalence-20261013'));
const ships = Number(option('--ships', '6'));
const deviationAt = Number(option('--deviation-at', '12'));
if (!Number.isSafeInteger(ships) || ships < 3 || ships > 256) throw Error('Invalid ship count');
if (!Number.isSafeInteger(deviationAt) || deviationAt < 0) throw Error('Invalid deviation index');
fs.mkdirSync(out, { recursive: true });
if (fs.existsSync(path.join(out, 'result.json'))) throw Error('Refusing to overwrite a completed equivalence run');

const define = { 'import.meta.env': JSON.stringify({ BASE_URL: '/', DEV: false, PROD: true }), '__LAN_BUILD_ID__': JSON.stringify('core-authority-equivalence') };
const plugins = [{ name: 'raw', setup(b) {
  b.onResolve({ filter: /\?raw$/ }, a => ({ path: path.resolve(a.resolveDir, a.path.slice(0, -4)), namespace: 'raw' }));
  b.onLoad({ filter: /.*/, namespace: 'raw' }, a => ({ contents: fs.readFileSync(a.path, 'utf8'), loader: 'text' }));
} }];

const driver = [
"import { RustCombatKernel } from './src/engine/runtime/rust/RustCombatKernel';",
"import { contentRegistry } from './src/engine/content/ContentRegistry';",
"import { runtimeShipPacks } from './src/engine/modding/ShipPackCatalog';",
"import { assetManager } from './src/engine/assets/AssetResolver';",
"import manifest from './public/game-assets/asset-manifest.json';",
"",
"const hulls = ['web_zhuyuan', 'web_gloriana', 'web_sc2_hyperion'];",
"const autopilot = () => ({ autopilot: true, blocked: false, keys: {}, aim: [0, 0], firing: false, mouseSteering: false, pointerActive: false });",
"const manual = (step) => ({ autopilot: false, blocked: false, keys: { KeyW: true, KeyD: step % 2 === 0 }, aim: [step * 40, 400 - step * 25], firing: step % 2 === 1, mouseSteering: true, pointerActive: true });",
"",
"function journal() {",
"  const entries = [];",
"  for (let i = 0; i < 8; i++) entries.push({ kind: 'step', sample: autopilot() });",
"  entries.push({ kind: 'command', command: { kind: 'pilot', autopilot: false } });",
"  for (let i = 0; i < 4; i++) entries.push({ kind: 'step', sample: manual(i) });",
"  entries.push({ kind: 'command', command: { kind: 'ship', command: { kind: 'system', value: 0 } } });",
"  entries.push({ kind: 'command', command: { kind: 'ship', command: { kind: 'shield' } } });",
"  for (let i = 0; i < 3; i++) entries.push({ kind: 'step', sample: manual(i) });",
"  entries.push({ kind: 'command', command: { kind: 'ship', command: { kind: 'group', value: 0 } } });",
"  entries.push({ kind: 'command', command: { kind: 'ship', command: { kind: 'vent' } } });",
"  entries.push({ kind: 'command', command: { kind: 'tactical', command: { action: 'select', unitId: 'fleet' } } });",
"  entries.push({ kind: 'command', command: { kind: 'tactical', command: { action: 'close' } } });",
"  entries.push({ kind: 'command', command: { kind: 'tactical', command: { action: 'cancel', unitId: 'fleet' } } });",
"  entries.push({ kind: 'command', command: { kind: 'stop-firing' } });",
"  entries.push({ kind: 'command', command: { kind: 'toggle-map' } });",
"  entries.push({ kind: 'command', command: { kind: 'clear-input' } });",
"  entries.push({ kind: 'command', command: { kind: 'add-ship', hull: hulls[1], isPlayer: false, position: [0, -1500], facing: Math.PI / 2 } });",
"  entries.push({ kind: 'command', command: { kind: 'pilot', autopilot: true } });",
"  for (let i = 0; i < 10; i++) entries.push({ kind: 'step', sample: autopilot() });",
"  return entries;",
"}",
"",
"async function pass(wasmUrl, ships, deviationAt) {",
"  await assetManager.loadManifest('data:application/json,' + encodeURIComponent(JSON.stringify(manifest)));",
"  const wasm = await (await fetch(wasmUrl)).arrayBuffer();",
"  const module = await WebAssembly.compile(wasm);",
"  const config = {",
"    backend: 'rust-wasm', seed: 917, multicore: false, playerHull: hulls[0], enemyHull: hulls[0],",
"    additionalShips: Array.from({ length: ships - 2 }, (_, i) => ({",
"      hull: hulls[i % 3], isPlayer: i % 2 === 0,",
"      position: [((i >> 1) % 8 - 3.5) * 700, (i % 2 ? 1 : -1) * (1300 + Math.floor(i / 16) * 650)],",
"      facing: i % 2 ? -Math.PI / 2 : Math.PI / 2 })),",
"    content: { ships: contentRegistry.getAllShips(), weapons: contentRegistry.getAllWeapons(), packs: runtimeShipPacks() },",
"  };",
"  const kernel = await RustCombatKernel.create(config, 1, { module, sha256: 'equivalence', bytes: wasm.byteLength });",
"  const exports = kernel.core.exports, id = kernel.core.id;",
"  const rows = [];",
"  let index = 0;",
"  for (const entry of journal()) {",
"    let outcome = null;",
"    if (entry.kind === 'step') { kernel.stepScheduled(entry.sample); outcome = { stepped: true }; }",
"    else { try { const result = kernel.command(entry.command); outcome = { accepted: result.accepted, reason: result.reason ?? null }; }",
"      catch (error) { outcome = { thrown: String(error) }; } }",
"    if (index === deviationAt) exports.core_random(id, 0);",
"    const ptr = exports.core_publish(id) >>> 0, words = exports.core_output_words(id);",
"    const view = new Uint32Array(exports.memory.buffer, ptr, words * 2);",
"    let h1 = 0x811c9dc5, h2 = 0x01000193;",
"    for (let i = 0; i < view.length; i++) { h1 = Math.imul(h1 ^ view[i], 0x01000193) >>> 0; h2 = (h2 + Math.imul(view[i] + i, 0x85ebca6b)) >>> 0; }",
"    rows.push({ index, kind: entry.kind, tick: kernel.tick, witness: kernel.replayWitness(), projected: kernel.projectedWitness(), stateWords: words,",
"      fingerprint: h1.toString(16) + ':' + h2.toString(16), outcome });",
"    kernel.acknowledgePublication();",
"    index++;",
"  }",
"  const finalTick = kernel.tick;",
"  kernel.dispose();",
"  return { rows, finalTick, initialCapitals: rows.length };",
"}",
"",
"export async function run(wasmUrl, ships, deviationAt) {",
"  return { baseline: await pass(wasmUrl, ships, -1), repeat: await pass(wasmUrl, ships, -1), deviated: await pass(wasmUrl, ships, deviationAt) };",
"}",
].join('\n');

const bundle = path.join(out, 'equivalence-driver.mjs');
const built = await build({ stdin: { contents: driver, resolveDir: root, sourcefile: 'core-authority-equivalence.ts', loader: 'ts' },
  outfile: bundle, bundle: true, platform: 'browser', format: 'esm', target: 'es2023', mainFields: ['module', 'main'], define, plugins, metafile: true });
if (Object.keys(built.metafile.inputs).some(p => /[/\\]campaign[/\\]/.test(p))) throw Error('Campaign entered equivalence harness');

const wasmPath = path.resolve(option('--wasm', 'public/game-assets/runtime/combat-core.wasm'));
const wasm = fs.readFileSync(wasmPath), sha256 = crypto.createHash('sha256').update(wasm).digest('hex');

const require = createRequire(import.meta.url), { chromium } = require(require.resolve('playwright', { paths: [root, 'C:/Users/Aca/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'] }));
let browser, server;
try {
  await new Promise(resolve => { server = http.createServer((request, response) => {
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Core authority equivalence</title>'); return; }
    if (pathname === '/equivalence-driver.mjs') { response.setHeader('Content-Type', 'text/javascript'); response.end(fs.readFileSync(bundle)); return; }
    if (pathname === '/combat-core.wasm') { response.setHeader('Content-Type', 'application/wasm'); response.end(wasm); return; }
    const target = path.resolve('public', '.' + decodeURIComponent(pathname));
    if (target.startsWith(path.resolve('public') + path.sep) && fs.existsSync(target) && fs.statSync(target).isFile()) {
      const mime = { '.wasm': 'application/wasm', '.json': 'application/json', '.mjs': 'text/javascript', '.png': 'image/png',
        '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.txt': 'text/plain' };
      response.setHeader('Content-Type', mime[path.extname(target)] ?? 'application/octet-stream');
      fs.createReadStream(target).pipe(response);
      return;
    }
    response.writeHead(404); response.end();
  }); server.listen(0, '127.0.0.1', resolve); });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('http://127.0.0.1:' + server.address().port);
  const result = await page.evaluate(async ({ ships, deviationAt }) => {
    const mod = await import('/equivalence-driver.mjs');
    return mod.run('/combat-core.wasm', ships, deviationAt);
  }, { ships, deviationAt });
  if (errors.length) throw Error('Page errors: ' + errors.join(' | '));

  const compare = (a, b) => {
    if (a.length !== b.length) return [{ kind: 'length', a: a.length, b: b.length }];
    const diffs = [];
    for (let i = 0; i < a.length; i++) {
      if (a[i].tick !== b[i].tick) diffs.push({ index: i, kind: 'tick', a: a[i].tick, b: b[i].tick });
      if (a[i].fingerprint !== b[i].fingerprint) diffs.push({ index: i, kind: 'fingerprint', a: a[i].fingerprint, b: b[i].fingerprint });
      if (a[i].stateWords !== b[i].stateWords) diffs.push({ index: i, kind: 'stateWords', a: a[i].stateWords, b: b[i].stateWords });
      for (let f = 0; f < a[i].witness.length; f++) {
        if (!Object.is(a[i].witness[f], b[i].witness[f])) { diffs.push({ index: i, kind: 'witness', field: f, a: a[i].witness[f], b: b[i].witness[f] }); break; }
      }
      if (JSON.stringify(a[i].outcome) !== JSON.stringify(b[i].outcome)) diffs.push({ index: i, kind: 'outcome', a: a[i].outcome, b: b[i].outcome });
    }
    return diffs;
  };
  const baseline = result.baseline.rows, repeat = result.repeat.rows, deviated = result.deviated.rows;
  const determinism = compare(baseline, repeat);
  const detected = compare(baseline, deviated);

  const ticks = baseline.map(r => r.tick);
  const witnessChanged = baseline.some((row, i) => i > 0 && row.witness.some((n, f) => !Object.is(n, baseline[i - 1].witness[f])));
  const commands = baseline.filter(r => r.kind === 'command');
  const receipts = commands.filter(r => r.outcome && ('accepted' in r.outcome || 'thrown' in r.outcome));
  const problems = [];
  const projectedMismatch = (rows) => {
    const first = [];
    let count = 0;
    for (const row of rows) {
      if (!row.projected) { count++; if (first.length < 3) first.push({ index: row.index, kind: 'missing' }); continue; }
      for (let f = 0; f < row.witness.length; f++) {
        if (!Object.is(row.witness[f], row.projected[f])) {
          count++;
          if (first.length < 3) first.push({ index: row.index, field: f, snapshot: row.witness[f], projected: row.projected[f] });
          break;
        }
      }
    }
    return { count, first };
  };
  const projected = projectedMismatch(baseline);
  if (projected.count) problems.push('projected witness differs from the snapshot witness: ' + JSON.stringify(projected.first));
  if (determinism.length) problems.push('replay determinism failed: ' + JSON.stringify(determinism.slice(0, 3)));
  if (!detected.length) problems.push('negative control not detected: an extra RNG draw produced no divergence, the gate is insensitive');
  if (!witnessChanged) problems.push('witness never changed: scenario is trivial');
  if (ticks[ticks.length - 1] <= ticks[0]) problems.push('tick never advanced');
  if (receipts.length < 8) problems.push('too few command receipts: ' + receipts.length);

  const summary = { passed: problems.length === 0, problems, ships, deviationAt, entries: baseline.length,
    finalTick: result.baseline.finalTick, commandEntries: commands.length,
    rejectedOrThrown: receipts.filter(r => r.outcome.thrown || r.outcome.accepted === false).length,
    determinismDiffs: determinism.length, negativeControlDiffs: detected.length,
    projectedWitnessEntries: baseline.length, projectedWitnessMismatches: projected.count, projectedWitnessFirst: projected.first,
    firstDivergence: detected[0] ?? null, stateWords: baseline[0]?.stateWords, sha256,
    environment: { node: process.version, os: os.version(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, browser: browser.version() } };
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ ...result, summary }, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.passed) process.exitCode = 1;
} catch (error) {
  fs.writeFileSync(path.join(out, 'failure.json'), JSON.stringify({ error: String(error), stack: error.stack, sha256 }, null, 2));
  throw error;
} finally { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); }
