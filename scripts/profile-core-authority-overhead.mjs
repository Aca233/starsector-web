import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';

// Stage 1 of docs/core-authority-60hz-gate-plan-2026-10-13.md:
// transaction-overhead ceiling analysis for the core_* authority. Copies the crate,
// injects perf timers (whole-function inclusive timers + scoped clone-region timers),
// compiles a probe wasm (opt-level=3, codegen-units=1, panic=abort; still no fat LTO,
// so absolute values are indicative and ratios are authoritative), then drives the
// production RustCombatKernel on the 22-ship ABBA scenario in headless Chromium.
// Decision gate D1: floor = step - transaction overhead; floor <= 10ms keeps the route
// alive, floor > 10ms stops before any prototype is built.

const root = process.cwd(), args = process.argv.slice(2);
const option = (key, fallback) => { const i = args.indexOf(key); return i < 0 ? fallback : args[i + 1]; };
const out = path.resolve(option('--out', 'artifacts/rust-combat-core-20261008/core-authority-overhead-20261013'));
const warm = Number(option('--warm', '20')), steps = Number(option('--steps', '80'));
const ships = Number(option('--ships', '22'));
if (!Number.isSafeInteger(warm) || warm < 0 || !Number.isSafeInteger(steps) || steps < 1) throw Error('Invalid tick window');
if (!Number.isSafeInteger(ships) || ships < 3 || ships > 256) throw Error('Invalid ship count');
const baselinePath = path.resolve(option('--baseline', 'artifacts/rust-combat-core-20261008/core-authority-baseline-f080f34b-20261013-r2/result.json'));
if (!fs.existsSync(baselinePath)) throw Error('Stage 0 baseline result missing: ' + baselinePath);
fs.mkdirSync(out, { recursive: true });
if (fs.existsSync(path.join(out, 'result.json'))) throw Error('Refusing to overwrite a completed overhead measurement');

const copy = path.join(out, 'native');
fs.mkdirSync(copy, { recursive: true });
for (const f of fs.readdirSync(path.join(root, 'native/combat-core/src')).filter(f => f.endsWith('.rs'))) {
  fs.copyFileSync(path.join(root, 'native/combat-core/src', f), path.join(copy, f));
}

const names = [];
function timer(file, signature) {
  let s = fs.readFileSync(path.join(copy, file), 'utf8');
  const i = s.indexOf(signature);
  if (i < 0) return;
  const start = s.indexOf('{', i), id = names.length;
  names.push(file + ':' + signature);
  s = s.slice(0, start + 1) + 'let _perf=crate::perf::Timer::new(' + id + ');' + s.slice(start + 1);
  fs.writeFileSync(path.join(copy, file), s);
}

const functions = [
  ['state.rs', 'pub fn apply('], ['state.rs', 'fn apply_scene_sample('], ['state.rs', 'pub fn step('], ['state.rs', 'fn step_scene('],
  ['state.rs', 'fn validate_scene_draft('], ['state.rs', 'fn validate_scene_draft_with_specs('], ['state.rs', 'fn commit_scene_draft('],
  ['scene_runtime.rs', 'pub fn advance('], ['scene_runtime.rs', 'fn ai('], ['scene_runtime.rs', 'fn prepare('], ['scene_runtime.rs', 'fn motion_stage('],
  ['ai_resident.rs', 'pub fn phase_with_fleet('], ['ai_resident.rs', 'fn build('], ['ai_resident.rs', 'pub fn refresh('],
  ['ai_owner.rs', 'pub fn validate('], ['ai_owner.rs', 'pub fn plan('], ['ai_owner.rs', 'pub fn sample_decision('],
  ['tactical_ai.rs', 'pub fn validate('], ['tactical_ai.rs', 'pub fn hostile('], ['tactical_ai.rs', 'pub fn profile('], ['tactical_ai.rs', 'pub fn fleet('], ['tactical_ai.rs', 'pub fn position('],
  ['navigation_ai.rs', 'pub fn new(bodies:'],
  ['defense_ai.rs', 'pub fn validate('], ['defense_ai.rs', 'pub fn assess_into('],
  ['fire_control.rs', 'pub fn advance('], ['fire_control.rs', 'pub fn decide('], ['fire_control.rs', 'pub fn should_fire('], ['fire_control.rs', 'pub fn validate(&self)'],
  ['fire_query.rs', 'pub fn plan_queued('],
  ['battle.rs', 'pub fn advance_projectiles('], ['battle.rs', 'pub fn advance_beams('], ['battle.rs', 'fn fire_selected_inner('],
  ['world_owner.rs', 'pub fn terrain_stage('],
  ['terrain_owner.rs', 'pub fn asteroid_collisions('], ['terrain_owner.rs', 'pub fn pair('],
  ['gravity_runtime.rs', 'pub fn prepare('], ['gravity_runtime.rs', 'pub fn fields('], ['gravity_runtime.rs', 'pub fn weapons_selected('], ['gravity_runtime.rs', 'pub fn dispatch_with_flight('],
  ['flight_runtime.rs', 'pub fn collect_wings<A:Authority>'], ['flight_runtime.rs', 'pub fn finish<A:Authority>'], ['flight_runtime.rs', 'fn body('], ['flight_runtime.rs', 'fn hostile('],
  ['flight_owner.rs', 'fn body('], ['flight_owner.rs', 'fn mounts('], ['flight_owner.rs', 'fn aim('],
  ['system_owner.rs', 'pub fn reader('],
  ['phase_runtime.rs', 'pub fn phased_world('], ['phase_runtime.rs', 'pub fn with_ship_gravity<T,F>'],
];
for (const [file, signature] of functions) timer(file, signature);

let state = fs.readFileSync(path.join(copy, 'state.rs'), 'utf8');
const stepCloneId = names.length; names.push('state.rs:step_scene draft+roster clones');
if (!state.includes('fn step_scene(&mut self,next:f64,dt:f64)->Result<(),u32>{') || !state.includes('let elapsed=crate::scene_runtime::advance(')) throw Error('step_scene anchor missing');
state = state.replace('fn step_scene(&mut self,next:f64,dt:f64)->Result<(),u32>{', 'fn step_scene(&mut self,next:f64,dt:f64)->Result<(),u32>{let _clone=crate::perf::Timer::new(' + stepCloneId + ');');
state = state.replace('let elapsed=crate::scene_runtime::advance(', 'drop(_clone);let elapsed=crate::scene_runtime::advance(');
const applyCloneId = names.length; names.push('state.rs:apply_scene_commands draft+roster clones');
const applyLoop = 'for cmd in self.input[..words].chunks_exact(COMMAND_WIDTH){let tag=integer(cmd[0]).ok_or(2u32)?;let id=integer(cmd[1]).ok_or(2u32)?;let h=Handle{';
if (!state.includes('fn apply_scene_commands(&mut self,words:usize)->Result<(),u32>{') || !state.includes(applyLoop)) throw Error('apply_scene_commands anchor missing');
state = state.replace('fn apply_scene_commands(&mut self,words:usize)->Result<(),u32>{', 'fn apply_scene_commands(&mut self,words:usize)->Result<(),u32>{let _clone=crate::perf::Timer::new(' + applyCloneId + ');');
state = state.replace(applyLoop, 'drop(_clone);' + applyLoop);
fs.writeFileSync(path.join(copy, 'state.rs'), state);
if (names.length > 64) throw Error('Timer budget exceeded: ' + names.length);

fs.writeFileSync(path.join(copy, 'perf.rs'), [
  'use std::cell::RefCell;',
  '#[link(wasm_import_module="perf")] extern "C" {fn now()->f64;}',
  'thread_local!{static TOTAL:RefCell<([f64;64],[f64;64])>=const{RefCell::new(([0.0;64],[0.0;64]))};}',
  'pub struct Timer{index:usize,start:f64}',
  'impl Timer{pub fn new(index:usize)->Self{Self{index,start:unsafe{now()}}}}',
  'impl Drop for Timer{fn drop(&mut self){let elapsed=unsafe{now()}-self.start;TOTAL.with_borrow_mut(|t|{t.0[self.index]+=elapsed;t.1[self.index]+=1.0;})}}',
  '#[no_mangle]pub extern "C" fn perf_reset(){TOTAL.with_borrow_mut(|t|*t=([0.0;64],[0.0;64]));}',
  '#[no_mangle]pub extern "C" fn perf_time(index:u32)->f64{TOTAL.with_borrow(|t|t.0[index as usize])}',
  '#[no_mangle]pub extern "C" fn perf_count(index:u32)->f64{TOTAL.with_borrow(|t|t.1[index as usize])}',
].join('\n'));
fs.appendFileSync(path.join(copy, 'lib.rs'), '\nmod perf;\n');

const compiler = option('--rustc', 'C:/Users/Aca/.rustup/toolchains/stable-x86_64-pc-windows-msvc/bin/rustc.exe');
if (!fs.existsSync(compiler)) throw Error('Rust compiler unavailable: ' + compiler);
const host = spawnSync(compiler, ['--print', 'sysroot'], { encoding: 'utf8', windowsHide: true }).stdout.trim();
const artifactsSysroot = path.resolve(root, 'artifacts/rust-combat-core-20261008/toolchain/sysroot');
const sysroot = fs.existsSync(path.join(artifactsSysroot, 'lib/rustlib/wasm32-unknown-unknown/lib')) ? artifactsSysroot : host;
const linker = path.join(host, 'lib/rustlib/x86_64-pc-windows-msvc/bin/rust-lld.exe');
if (!fs.existsSync(linker)) throw Error('rust-lld unavailable: ' + linker);
const wasmPath = path.join(out, 'overhead.wasm');
const compiled = spawnSync(compiler, ['--edition=2021', '--crate-type=cdylib', '--target=wasm32-unknown-unknown', '--sysroot', sysroot,
  '-C', 'opt-level=3', '-C', 'codegen-units=1', '-C', 'panic=abort', '-C', 'linker=' + linker.replaceAll('\\', '/'), '-A', 'dead_code',
  path.join(copy, 'lib.rs'), '-o', wasmPath], { encoding: 'utf8', windowsHide: true });
fs.writeFileSync(path.join(out, 'compile.log'), compiled.stderr || '');
if (compiled.status) throw Error(compiled.stderr);
const wasm = fs.readFileSync(wasmPath), sha256 = crypto.createHash('sha256').update(wasm).digest('hex');

const buildManifest = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/rust-combat-core-20261008/build/build-manifest.json'), 'utf8'));
const recorded = buildManifest.sources || {};
let sourcesIdentical = 0, sourcesChanged = [];
for (const f of fs.readdirSync(path.join(root, 'native/combat-core/src')).filter(f => f.endsWith('.rs'))) {
  const key = 'native/combat-core/src/' + f;
  const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'native/combat-core/src', f))).digest('hex').toLowerCase();
  if (recorded[key] === hash) sourcesIdentical++; else sourcesChanged.push(key);
}

const define = { 'import.meta.env': JSON.stringify({ BASE_URL: '/', DEV: false, PROD: true }), '__LAN_BUILD_ID__': JSON.stringify('core-authority-overhead') };
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
"export async function run(wasmUrl, warm, steps, ships) {",
"  const instantiate = WebAssembly.instantiate.bind(WebAssembly);",
"  WebAssembly.instantiate = (source, imports) => instantiate(source, { ...imports, perf: { now: () => performance.now() } });",
"  await assetManager.loadManifest('data:application/json,' + encodeURIComponent(JSON.stringify(manifest)));",
"  const wasm = await (await fetch(wasmUrl)).arrayBuffer();",
"  const instance = await WebAssembly.instantiate(wasm);",
"  const hulls = ['web_zhuyuan', 'web_gloriana', 'web_sc2_hyperion'];",
"  const config = {",
"    backend: 'rust-wasm', seed: 917, multicore: false, playerHull: hulls[0], enemyHull: hulls[0],",
"    additionalShips: Array.from({ length: ships - 2 }, (_, i) => ({",
"      hull: hulls[i % 3], isPlayer: i % 2 === 0,",
"      position: [((i >> 1) % 8 - 3.5) * 700, (i % 2 ? 1 : -1) * (1300 + Math.floor(i / 16) * 650)],",
"      facing: i % 2 ? -Math.PI / 2 : Math.PI / 2 })),",
"    content: { ships: contentRegistry.getAllShips(), weapons: contentRegistry.getAllWeapons(), packs: runtimeShipPacks() },",
"  };",
"  const kernel = await RustCombatKernel.create(config, 1, { module: instance.module, sha256: 'overhead', bytes: wasm.byteLength });",
"  const exports = kernel.core.exports;",
"  if (typeof exports.perf_reset !== 'function') throw new Error('Probe module lacks perf exports');",
"  const initial = { capitals: kernel.scene.rosters.allCapitalShips.length };",
"  if (initial.capitals !== ships) throw new Error('Actual benchmark roster differs: ' + initial.capitals);",
"  const sample = { autopilot: true, blocked: false, keys: {}, aim: [0, 0], firing: false, mouseSteering: false, pointerActive: false };",
"  const rows = [], witnesses = [];",
"  let maxProjectiles = 0;",
"  for (let i = 0; i < warm + steps; i++) {",
"    exports.perf_reset();",
"    const t0 = performance.now();",
"    kernel.stepScheduled(sample);",
"    const t1 = performance.now();",
"    kernel.acknowledgePublication();",
"    maxProjectiles = Math.max(maxProjectiles, kernel.snapshot.projectiles.length);",
"    witnesses.push(kernel.replayWitness());",
"    if (i >= warm) rows.push({ tick: kernel.tick, stepWall: t1 - t0,",
"      timers: Array.from({ length: 64 }, (_, j) => exports.perf_time(j)),",
"      counts: Array.from({ length: 64 }, (_, j) => exports.perf_count(j)) });",
"  }",
"  kernel.dispose();",
"  const trivial = witnesses.every((w, i) => i === 0 || w.every((n, j) => Object.is(n, witnesses[0][j])));",
"  if (trivial) throw new Error('Witness never changed: scenario is trivial');",
"  if (maxProjectiles <= 0) throw new Error('No projectiles ever observed: weapons never fired');",
"  return { backend: 'rust-wasm', probe: true, warm, steps, initial, rows, maxProjectiles, finalTick: kernel.tick,",
"    environment: { hardwareConcurrency: navigator.hardwareConcurrency, userAgent: navigator.userAgent } };",
"}",
].join('\n');

const bundle = path.join(out, 'overhead-driver.mjs');
const built = await build({ stdin: { contents: driver, resolveDir: root, sourcefile: 'core-authority-overhead.ts', loader: 'ts' },
  outfile: bundle, bundle: true, platform: 'browser', format: 'esm', target: 'es2023', mainFields: ['module', 'main'], define, plugins, metafile: true });
if (Object.keys(built.metafile.inputs).some(p => /[/\\]campaign[/\\]/.test(p))) throw Error('Campaign entered overhead probe');

const require = createRequire(import.meta.url), { chromium } = require(require.resolve('playwright', { paths: [root, 'C:/Users/Aca/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'] }));
let browser, server;
try {
  await new Promise(resolve => { server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Core authority overhead</title>'); return; }
    if (pathname === '/overhead-driver.mjs') { response.setHeader('Content-Type', 'text/javascript'); response.end(fs.readFileSync(bundle)); return; }
    if (pathname === '/overhead.wasm') { response.setHeader('Content-Type', 'application/wasm'); response.end(wasm); return; }
    response.writeHead(404); response.end();
  }); server.listen(0, '127.0.0.1', resolve); });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('http://127.0.0.1:' + server.address().port);
  const result = await page.evaluate(async ({ warm, steps, ships }) => {
    const mod = await import('/overhead-driver.mjs');
    return mod.run('/overhead.wasm', warm, steps, ships);
  }, { warm, steps, ships });
  if (errors.length) throw Error('Page errors: ' + errors.join(' | '));
  result.sha256 = sha256; result.names = names; result.browser = browser.version();
  result.build = { compiler, sysroot, flags: 'opt-level=3 codegen-units=1 panic=abort (no fat LTO)',
    sourcesIdenticalToBuild: sourcesIdentical, sourcesChanged };
  result.environment = { ...result.environment, node: process.version, os: os.version(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length };

  const mean = values => values.reduce((sum, n) => sum + n, 0) / values.length;
  const timers = names.map((name, i) => ({ name, meanMs: mean(result.rows.map(r => r.timers[i])), calls: mean(result.rows.map(r => r.counts[i])) }))
    .filter(t => t.calls > 0).sort((a, b) => b.meanMs - a.meanMs);
  const byName = Object.fromEntries(timers.map(t => [t.name, t]));
  const wall = { mean: mean(result.rows.map(r => r.stepWall)) };
  const transactionNames = ['state.rs:step_scene draft+roster clones', 'state.rs:apply_scene_commands draft+roster clones',
    'state.rs:fn validate_scene_draft(', 'state.rs:fn validate_scene_draft_with_specs(', 'state.rs:fn commit_scene_draft(', 'ai_resident.rs:fn build('];
  const transaction = transactionNames.reduce((sum, n) => sum + (byName[n]?.meanMs ?? 0), 0);
  const stepScene = byName['state.rs:fn step_scene(']?.meanMs ?? 0;
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  const baselineStep = baseline.summary.metrics.step.mean, baselineSim = baseline.summary.metrics.simulation.mean;
  const transactionShare = stepScene > 0 ? transaction / stepScene : 0;
  const floorEstimate = baselineStep * (1 - transactionShare);
  const gate = { floorEstimateMs: floorEstimate, thresholdMs: 10, pass: floorEstimate <= 10,
    note: 'floor = Stage 0 production step (' + baselineStep.toFixed(2) + 'ms) x (1 - transaction share of probe step)' };
  result.summary = { timers, wallStepMs: wall.mean, stepSceneMs: stepScene, transactionMs: transaction, transactionShare,
    baselineStepMs: baselineStep, baselineSimMs: baselineSim, gate, maxProjectiles: result.maxProjectiles, finalTick: result.finalTick };
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ timers: timers.slice(0, 24), wallStepMs: wall.mean, stepSceneMs: stepScene, transactionMs: transaction,
    transactionShare, baselineStepMs: baselineStep, floorEstimateMs: floorEstimate, gate: gate.pass ? 'D1 PASS' : 'D1 FAIL', maxProjectiles: result.maxProjectiles }, null, 2));
} catch (error) {
  fs.writeFileSync(path.join(out, 'failure.json'), JSON.stringify({ error: String(error), stack: error.stack, sha256 }, null, 2));
  throw error;
} finally { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); }
