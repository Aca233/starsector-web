import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

// Stage 0 of docs/core-authority-60hz-gate-plan-2026-10-13.md:
// same-session, per-phase decomposition of the production rust-wasm kernel on the
// 22-ship ABBA scenario (seed 917, autopilot). Kernel-direct (same technique as the
// 10-09 profilers and profiling-installed-local-f080f34b), headless Chromium, no
// source instrumentation, zero production code changes.
// Windows mirror local-combat.worker.ts: simulationMs = applyPacked + step + refresh;
// encodeMs = capturePresentation + captureDetached (+ witness/telemetry inside window).

const root = process.cwd(), args = process.argv.slice(2);
const option = (key, fallback) => { const i = args.indexOf(key); return i < 0 ? fallback : args[i + 1]; };
const out = path.resolve(option('--out', 'artifacts/rust-combat-core-20261008/core-authority-baseline-f080f34b-20261013'));
const warm = Number(option('--warm', '90')), steps = Number(option('--steps', '180'));
const ships = Number(option('--ships', '22'));
if (!Number.isSafeInteger(warm) || warm < 0 || !Number.isSafeInteger(steps) || steps < 1) throw Error('Invalid benchmark length');
if (!Number.isSafeInteger(ships) || ships < 3 || ships > 256) throw Error('Invalid ship count');
const wasmPath = path.resolve(option('--wasm', 'public/game-assets/runtime/combat-core.wasm'));
const expectSha = option('--expect-sha', 'f080f34b');
const wasm = fs.readFileSync(wasmPath), sha256 = createHash('sha256').update(wasm).digest('hex');
if (expectSha && !sha256.startsWith(expectSha)) throw Error('Wasm sha256 ' + sha256 + ' does not start with ' + expectSha + '; pass --expect-sha to override');
fs.mkdirSync(out, { recursive: true });
if (fs.existsSync(path.join(out, 'result.json'))) throw Error('Refusing to overwrite a completed baseline measurement');

const define = { 'import.meta.env': JSON.stringify({ BASE_URL: '/', DEV: false, PROD: true }), '__LAN_BUILD_ID__': JSON.stringify('core-authority-baseline') };
const plugins = [{ name: 'raw', setup(b) {
  b.onResolve({ filter: /\?raw$/ }, a => ({ path: path.resolve(a.resolveDir, a.path.slice(0, -4)), namespace: 'raw' }));
  b.onLoad({ filter: /.*/, namespace: 'raw' }, a => ({ contents: fs.readFileSync(a.path, 'utf8'), loader: 'text' }));
} }];

const driver = [
"import { RustCombatKernel } from './src/engine/runtime/rust/RustCombatKernel';",
"import { CombatPresentationEncoder } from './src/engine/runtime/local/CombatPresentationEncoder';",
"import { contentRegistry } from './src/engine/content/ContentRegistry';",
"import { runtimeShipPacks } from './src/engine/modding/ShipPackCatalog';",
"import { assetManager } from './src/engine/assets/AssetResolver';",
"import manifest from './public/game-assets/asset-manifest.json';",
"",
"export async function run(wasmUrl, warm, steps, ships) {",
"  await assetManager.loadManifest('data:application/json,' + encodeURIComponent(JSON.stringify(manifest)));",
"  const wasm = await (await fetch(wasmUrl)).arrayBuffer();",
"  const module = await WebAssembly.compile(wasm);",
"  const hulls = ['web_zhuyuan', 'web_gloriana', 'web_sc2_hyperion'];",
"  const config = {",
"    backend: 'rust-wasm', seed: 917, multicore: false, playerHull: hulls[0], enemyHull: hulls[0],",
"    additionalShips: Array.from({ length: ships - 2 }, (_, i) => ({",
"      hull: hulls[i % 3], isPlayer: i % 2 === 0,",
"      position: [((i >> 1) % 8 - 3.5) * 700, (i % 2 ? 1 : -1) * (1300 + Math.floor(i / 16) * 650)],",
"      facing: i % 2 ? -Math.PI / 2 : Math.PI / 2 })),",
"    content: { ships: contentRegistry.getAllShips(), weapons: contentRegistry.getAllWeapons(), packs: runtimeShipPacks() },",
"  };",
"  const kernel = await RustCombatKernel.create(config, 1, { module, sha256: 'baseline', bytes: wasm.byteLength });",
"  const core = kernel.core;",
"  const parts = { applyPacked: 0, step: 0, snapshot: 0, scenePublication: 0, capturePresentation: 0, presenter: 0, captureDetached: 0, witness: 0 };",
"  const wrap = (obj, key, name) => {",
"    const orig = obj[key].bind(obj);",
"    obj[key] = (...a) => { const t = performance.now(); try { return orig(...a); } finally { parts[name] += performance.now() - t; } };",
"  };",
"  wrap(core, 'applyPacked', 'applyPacked');",
"  wrap(core, 'step', 'step');",
"  wrap(core, 'snapshot', 'snapshot');",
"  wrap(core, 'scenePublication', 'scenePublication');",
"  wrap(kernel, 'capturePresentation', 'capturePresentation');",
"  wrap(kernel, 'replayWitness', 'witness');",
"  wrap(kernel.presenter, 'capture', 'presenter');",
"  const initial = { capitals: kernel.scene.rosters.allCapitalShips.length, projectiles: kernel.snapshot.projectiles.length };",
"  if (initial.capitals !== ships) throw new Error('Actual benchmark roster differs: ' + initial.capitals);",
"  const encoder = new CombatPresentationEncoder(1, 'render-strict');",
"  wrap(encoder, 'captureDetached', 'captureDetached');",
"  const sample = { autopilot: true, blocked: false, keys: {}, aim: [0, 0], firing: false, mouseSteering: false, pointerActive: false };",
"  const samples = [], witnesses = [];",
"  let recycle, recycleVisuals;",
"  for (let i = 0; i < warm + steps; i++) {",
"    for (const key of Object.keys(parts)) parts[key] = 0;",
"    const t0 = performance.now();",
"    kernel.stepScheduled(sample);",
"    const t1 = performance.now();",
"    const frame = kernel.capturePresentation();",
"    const packet = encoder.captureDetached(frame.presentation, kernel.tick, recycle, recycleVisuals);",
"    const witness = kernel.replayWitness();",
"    const telemetry = kernel.telemetry;",
"    const t2 = performance.now();",
"    kernel.acknowledgePublication();",
"    recycle = packet.buffer; recycleVisuals = packet.visuals.buffer;",
"    witnesses.push(witness);",
"    if (i >= warm) samples.push({",
"      tick: kernel.tick, simulation: t1 - t0, encode: t2 - t1,",
"      applyPacked: parts.applyPacked, step: parts.step, snapshot: parts.snapshot, scenePublication: parts.scenePublication,",
"      captureAssembly: parts.capturePresentation - parts.presenter, presenter: parts.presenter,",
"      captureDetached: parts.captureDetached, witness: parts.witness,",
"      bytes: (packet.length + packet.visuals.length) * 8,",
"      ships: kernel.scene.rosters.allCapitalShips.length,",
"      projectiles: kernel.snapshot.projectiles.length, beams: kernel.snapshot.beams.length });",
"  }",
"  kernel.dispose();",
"  return { backend: 'rust-wasm', wasmBytes: wasm.byteLength, warm, steps, initial, samples, witnesses,",
"    finalTick: kernel.tick,",
"    environment: { hardwareConcurrency: navigator.hardwareConcurrency, userAgent: navigator.userAgent } };",
"}",
].join('\n');

const bundle = path.join(out, 'baseline.mjs');
const built = await build({ stdin: { contents: driver, resolveDir: root, sourcefile: 'core-authority-baseline.ts', loader: 'ts' },
  outfile: bundle, bundle: true, platform: 'browser', format: 'esm', target: 'es2023', mainFields: ['module', 'main'], define, plugins, metafile: true });
if (Object.keys(built.metafile.inputs).some(p => /[/\\]campaign[/\\]/.test(p))) throw Error('Campaign entered combat baseline');

const require = createRequire(import.meta.url), { chromium } = require(require.resolve('playwright', { paths: [root, 'C:/Users/Aca/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'] }));
let browser, server;
try {
  await new Promise(resolve => { server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Core authority baseline</title>'); return; }
    if (pathname === '/baseline.mjs') { response.setHeader('Content-Type', 'text/javascript'); response.end(fs.readFileSync(bundle)); return; }
    if (pathname === '/probe.wasm') { response.setHeader('Content-Type', 'application/wasm'); response.end(wasm); return; }
    response.writeHead(404); response.end();
  }); server.listen(0, '127.0.0.1', resolve); });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('http://127.0.0.1:' + server.address().port);
  const result = await page.evaluate(async ({ warm, steps, ships }) => {
    const mod = await import('/baseline.mjs');
    return mod.run('/probe.wasm', warm, steps, ships);
  }, { warm, steps, ships });
  if (errors.length) throw Error('Page errors: ' + errors.join(' | '));
  result.sha256 = sha256; result.wasmPath = wasmPath; result.browser = browser.version();
  result.environment = { ...result.environment, node: process.version, os: os.version(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length };
  const stats = values => { const sorted = [...values].sort((a, b) => a - b); return { mean: values.reduce((sum, n) => sum + n, 0) / values.length, p95: sorted[Math.ceil(sorted.length * .95) - 1], p99: sorted[Math.ceil(sorted.length * .99) - 1] }; };
  const keys = ['simulation', 'encode', 'applyPacked', 'step', 'snapshot', 'scenePublication', 'captureAssembly', 'presenter', 'captureDetached', 'witness', 'bytes', 'projectiles', 'beams'];
  const metrics = Object.fromEntries(keys.map(key => [key, stats(result.samples.map(row => row[key]))]));
  const simParts = metrics.applyPacked.mean + metrics.step.mean + metrics.snapshot.mean + metrics.scenePublication.mean;
  const encodeParts = metrics.captureAssembly.mean + metrics.presenter.mean + metrics.captureDetached.mean + metrics.witness.mean;
  const reconciliation = {
    simulation: { windowMs: metrics.simulation.mean, partsSumMs: simParts, overheadMs: metrics.simulation.mean - simParts, coverage: simParts / metrics.simulation.mean },
    encode: { windowMs: metrics.encode.mean, partsSumMs: encodeParts, overheadMs: metrics.encode.mean - encodeParts, coverage: encodeParts / metrics.encode.mean } };
  const witnesses = result.witnesses;
  const trivial = witnesses.every((w, i) => i === 0 || w.every((n, j) => Object.is(n, witnesses[0][j])));
  const maxProjectiles = Math.max(...result.samples.map(s => s.projectiles));
  if (trivial) throw Error('Witness never changed: scenario is trivial');
  if (maxProjectiles <= 0) throw Error('No projectiles ever observed: weapons never fired');
  if (result.finalTick !== warm + steps) throw Error('Final tick differs: ' + result.finalTick);
  result.summary = { metrics, reconciliation, maxProjectiles, finalTick: result.finalTick, initial: result.initial,
    reference: { note: '10-13 ABBA rerun of this same sha (f080f34b): rust simulation 51.61ms / encode 29.64ms; TS 21.45 / 4.43. Cross-run comparison is indicative only; same-session arms are the gate.' } };
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result.summary, null, 2));
} catch (error) {
  fs.writeFileSync(path.join(out, 'failure.json'), JSON.stringify({ error: String(error), stack: error.stack, sha256 }, null, 2));
  throw error;
} finally { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); }
