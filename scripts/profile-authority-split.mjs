// Diagnostic: split the production single-player Rust authority's per-tick cost into
// "inside the Wasm simulation" versus "JS-side materialisation".
//
// Why this exists: the ABBA gate reported rust-wasm `simulationMs = 88.54 ms` for the
// 22-ship scenario, but that figure is measured in the Worker as "everything from
// message receipt until encoding starts" - it includes `copyControlSample`,
// `encodeRustSceneControl`, `applyCorePacked`, `core.step` AND `refresh()` (the
// snapshot/scene read plus JS object materialisation). Deciding whether the
// "ECS outer shell + core_* domain reuse" route can hold 60Hz therefore needs the
// split, not the total.
//
// Method (same proven approach as scripts/profile-rust-hot-step.mjs): copy the Rust
// sources, inject `crate::perf::Timer` into the tick-level functions, compile a
// dedicated instrumented Wasm, and drive the real single-player `RustCombatKernel`
// with the exact ABBA roster. Instrumentation inflates absolute numbers, so the
// result is reported as a *share of the measured tick*, next to the uninstrumented
// ABBA total.
//
// This is a diagnostic, not a formal performance gate.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const args = process.argv.slice(2);
const option = (name, fallback) => { const at = args.indexOf(name); return at < 0 ? fallback : args[at + 1]; };
const ticks = Number(option('--ticks', '40')), warm = Number(option('--warm', '12'));
if (!Number.isSafeInteger(ticks) || ticks < 1 || !Number.isSafeInteger(warm) || warm < 0 || warm >= ticks)
  throw Error('Invalid diagnostic tick window');
const out = path.resolve(option('--out', 'artifacts/ecs-reuse-spike-20261013/profiling-authority-split'));
// `--minimal` instruments only the outermost tick function, which is the closest
// available reading of the uninstrumented tick cost (the full set overlaps heavily).
const minimal = args.includes('--minimal');
const copy = path.join(out, 'native');
fs.mkdirSync(copy, { recursive: true });
for (const f of fs.readdirSync('native/combat-core/src').filter(f => f.endsWith('.rs')))
  fs.copyFileSync(path.join('native/combat-core/src', f), path.join(copy, f));

// Tick-level attribution. Kept deliberately broad so the instrumented sum is a real
// lower bound on "time inside Wasm".
const functions = [
  ['state.rs', 'pub fn step('], ['state.rs', 'fn step_scene('], ['state.rs', 'fn validate_scene_draft_with_specs('],
  ['ai_resident.rs', 'fn refresh('], ['ai_resident.rs', 'fn build('], ['ai_resident.rs', 'pub fn phase_with_fleet('],
  ['scene_runtime.rs', 'pub fn advance('], ['scene_runtime.rs', 'fn prepare('], ['scene_runtime.rs', 'fn motion_stage('],
  ['scene_runtime.rs', 'fn ai('], ['fire_query.rs', 'pub fn plan_queued('], ['fire_query.rs', 'pub fn observe_ship('],
  ['gravity_runtime.rs', 'pub fn prepare('], ['gravity_runtime.rs', 'pub fn fields('], ['gravity_runtime.rs', 'pub fn dispatch_with_flight('],
  ['world_owner.rs', 'pub fn terrain_stage('], ['terrain_owner.rs', 'pub fn pair('], ['terrain_owner.rs', 'fn ship_near_circle('],
  ['fire_control.rs', 'pub fn advance('], ['fire_control.rs', 'pub fn decide('], ['fire_control.rs', 'pub fn aim('], ['fire_control.rs', 'pub fn validate(&self)'],
  ['battle.rs', 'fn fire_selected_inner('], ['battle.rs', 'pub fn advance_projectiles('], ['battle.rs', 'pub fn advance_beams('],
  ['phase_runtime.rs', 'pub fn with_ship_gravity('], ['combat_visuals.rs', 'pub fn status_capitals('], ['combat_visuals.rs', 'pub fn advance('],
  ['scene_owner.rs', 'pub fn navigate_retreat('], ['ai_owner.rs', 'pub fn plan('], ['ai_owner.rs', 'pub fn sample_decision('],
  ['tactical_ai.rs', 'pub fn profile('], ['tactical_ai.rs', 'pub fn fleet('], ['tactical_ai.rs', 'pub fn position('],
  ['navigation_ai.rs', 'pub fn new(bodies:'], ['defense_ai.rs', 'pub fn assess_into('], ['flight_runtime.rs', 'pub fn finish<A:Authority>'],
];
const names = [];
function timer(file, signature) {
  let s = fs.readFileSync(path.join(copy, file), 'utf8');
  const i = s.indexOf(signature);
  if (i < 0) return;
  const start = s.indexOf('{', i), id = names.length;
  names.push(file + ':' + signature);
  s = s.slice(0, start + 1) + `let _perf=crate::perf::Timer::new(${id});` + s.slice(start + 1);
  fs.writeFileSync(path.join(copy, file), s);
}
for (const [f, s] of (minimal ? [['state.rs', 'pub fn step(']] : functions)) timer(f, s);

// The whole-world clone is the suspected dominant cost; measure it explicitly.
let state = fs.readFileSync(path.join(copy, 'state.rs'), 'utf8');
const cloneNeedle = 'let mut world=self.world.clone().ok_or(8u32)?;let mut scene=self.scene.clone().ok_or(8u32)?;';
if (state.includes(cloneNeedle)) {
  const cloneId = names.length;
  names.push('scene draft clone (world+scene)');
  state = state.replace(cloneNeedle, `let _clone=crate::perf::Timer::new(${cloneId});${cloneNeedle}`);
  state = state.replace('let mut notices=Vec::new();\n        let elapsed=', 'let mut notices=Vec::new();drop(_clone);\n        let elapsed=');
  fs.writeFileSync(path.join(copy, 'state.rs'), state);
} else {
  console.log('WARN: scene draft clone anchor not found; clone cost will not be attributed separately');
}

fs.writeFileSync(path.join(copy, 'perf.rs'), `use std::cell::RefCell;
#[link(wasm_import_module="perf")] extern "C" {fn now()->f64;}
thread_local!{static TOTAL:RefCell<([f64;64],[f64;64])>=const{RefCell::new(([0.0;64],[0.0;64]))};}
pub struct Timer{index:usize,start:f64}
impl Timer{pub fn new(index:usize)->Self{Self{index,start:unsafe{now()}}}}
impl Drop for Timer{fn drop(&mut self){let elapsed=unsafe{now()}-self.start;TOTAL.with_borrow_mut(|t|{t.0[self.index]+=elapsed;t.1[self.index]+=1.0;});}}
#[no_mangle]pub extern "C" fn perf_reset(){TOTAL.with_borrow_mut(|t|*t=([0.0;64],[0.0;64]));}
#[no_mangle]pub extern "C" fn perf_time(index:u32)->f64{TOTAL.with_borrow(|t|t.0[index as usize])}
#[no_mangle]pub extern "C" fn perf_count(index:u32)->f64{TOTAL.with_borrow(|t|t.1[index as usize])}
`);
fs.appendFileSync(path.join(copy, 'lib.rs'), '\nmod perf;\n');

const compiler = 'C:/Users/Aca/.rustup/toolchains/stable-x86_64-pc-windows-msvc/bin/rustc.exe';
const sysroot = path.resolve('artifacts/rust-combat-core-20261008/toolchain/sysroot');
const host = spawnSync(compiler, ['--print', 'sysroot'], { encoding: 'utf8', windowsHide: true }).stdout.trim();
const wasmPath = path.join(out, 'profile.wasm');
const compiled = spawnSync(compiler, ['--edition=2021', '--crate-type=cdylib', '--target=wasm32-unknown-unknown',
  '--sysroot', sysroot, '-C', 'opt-level=3',
  '-C', `linker=${host.replaceAll('\\', '/')}/lib/rustlib/x86_64-pc-windows-msvc/bin/rust-lld.exe`,
  '-A', 'dead_code', path.join(copy, 'lib.rs'), '-o', wasmPath], { encoding: 'utf8', windowsHide: true });
fs.writeFileSync(path.join(out, 'compile.log'), compiled.stderr);
if (compiled.status) throw Error(compiled.stderr);

const instantiate = WebAssembly.instantiate.bind(WebAssembly);
WebAssembly.instantiate = (source, imports) => instantiate(source, { ...imports, perf: { now: () => performance.now() } });

// Same roster/config as scripts/lib/rust-combat-performance.ts so the numbers are
// comparable with the ABBA gate.
const source = `import {RustCombatKernel} from './src/engine/runtime/rust/RustCombatKernel';
import {contentRegistry} from './src/engine/content/ContentRegistry';
import {assetManager} from './src/engine/assets/AssetResolver';
import manifest from './public/game-assets/asset-manifest.json';
export async function run(wasm){
  await assetManager.loadManifest('data:application/json,'+encodeURIComponent(JSON.stringify(manifest)));
  const module=await WebAssembly.compile(wasm),hulls=['web_zhuyuan','web_gloriana','web_sc2_hyperion'];
  const config={playerHull:hulls[0],enemyHull:hulls[0],seed:917,multicore:false,additionalShips:Array.from({length:20},(_,i)=>({hull:hulls[i%3],isPlayer:i%2===0,position:[((i>>1)%8-3.5)*700,(i%2?1:-1)*(1300+Math.floor(i/16)*650)],facing:i%2?-Math.PI/2:Math.PI/2})),content:{ships:contentRegistry.getAllShips(),weapons:contentRegistry.getAllWeapons()}};
  const kernel=await RustCombatKernel.create(config,1,{module,sha256:'split-profile'});
  const exports=kernel.core.exports;
  const sample={autopilot:true,blocked:false,keys:{},aim:[0,0],firing:false,mouseSteering:false,pointerActive:false};
  const samples=[];
  for(let i=0;i<${ticks};i++){
    exports.perf_reset();
    const t0=performance.now(); kernel.stepScheduled(sample); const total=performance.now()-t0;
    if(i>=${warm}) samples.push({tick:kernel.tick,totalMs:total,
      metrics:Array.from({length:${names.length}},(_,j)=>({name:${JSON.stringify(names)}[j],ms:exports.perf_time(j),calls:exports.perf_count(j)}))});
  }
  const data={diagnostic:true,actualKernel:true,mode:'local-single-player',ticks:kernel.tick,bodies:kernel.snapshot.bodies.length,samples};
  kernel.dispose(); return data;}`;
const plugins = [{ name: 'raw', setup(b) {
  b.onResolve({ filter: /\?raw$/ }, a => ({ path: path.resolve(a.resolveDir, a.path.slice(0, -4)), namespace: 'raw' }));
  b.onLoad({ filter: /.*/, namespace: 'raw' }, a => ({ contents: fs.readFileSync(a.path, 'utf8'), loader: 'text' }));
} }];
const js = path.join(out, 'profile.mjs');
await build({ stdin: { contents: source, resolveDir: process.cwd(), sourcefile: 'authority-split.ts', loader: 'ts' },
  outfile: js, bundle: true, platform: 'neutral', mainFields: ['module', 'main'], format: 'esm', target: 'es2023', plugins,
  define: { 'import.meta.env': JSON.stringify({ BASE_URL: './', DEV: false, PROD: true }), '__LAN_BUILD_ID__': JSON.stringify('authority-split') } });

const result = await (await import(pathToFileURL(js).href)).run(fs.readFileSync(wasmPath));
const n = result.samples.length;
const perTick = (values) => values.reduce((a, b) => a + b, 0) / n;
const average = names.map((name, i) => ({
  name,
  ms: perTick(result.samples.map(s => s.metrics[i].ms)),
  calls: perTick(result.samples.map(s => s.metrics[i].calls)),
})).sort((a, b) => b.ms - a.ms);
const totalMs = perTick(result.samples.map(s => s.totalMs));
// Only the outermost tick function is a clean total: the other timers nest inside it
// (state::step > step_scene > scene_runtime::advance > ai/plan/terrain...), so summing
// them would count the same time several times over.
const wasmStepMs = average.find(r => r.name === 'state.rs:pub fn step(')?.ms ?? 0;
const summary = {
  mode: minimal ? 'minimal-instrumentation' : 'full-instrumentation',
  rosterBodies: result.bodies, ticks: result.ticks, sampled: n,
  measuredStepTotalMs: Number(totalMs.toFixed(3)),
  wasmStepMs: Number(wasmStepMs.toFixed(3)),
  wasmShare: totalMs > 0 ? Number((wasmStepMs / totalMs).toFixed(4)) : 0,
  jsGlueMs: Number((totalMs - wasmStepMs).toFixed(3)),
  // Nested timers: use for ranking hot spots only, never as an additive budget.
  hotSpots: average.slice(0, 15).map(r => ({ name: r.name, ms: Number(r.ms.toFixed(3)), calls: Number(r.calls.toFixed(1)) })),
};
fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ ...result, average, summary }, null, 2));
console.log(JSON.stringify(summary, null, 2));
