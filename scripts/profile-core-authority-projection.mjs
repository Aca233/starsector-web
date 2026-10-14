import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';

// Stage 2b of docs/core-authority-60hz-gate-plan-2026-10-13.md:
// one-way projection prototype. Copies the crate into a scratch dir, adds a
// projection module (authority -> 16f sprite / 12f HUD / 16f readback / 22 f64
// witness flat buffers) with core_* exports, compiles a probe wasm, and drives
// the production RustCombatKernel on the ABBA scenario in headless Chromium.
// Scratch only: never merged, never installed. Witness stays f64-direct.
// E2 smoke: all buffers written, finite, id-matched geometry/hp/flux agree with
// the current snapshot publish, witness[0] === tick, witness words === 22.

const root = process.cwd(), args = process.argv.slice(2);
const option = (key, fallback) => { const i = args.indexOf(key); return i < 0 ? fallback : args[i + 1]; };
const out = path.resolve(option('--out', 'artifacts/rust-combat-core-20261008/core-authority-projection-20261013'));
const warm = Number(option('--warm', '20')), steps = Number(option('--steps', '80'));
const ships = Number(option('--ships', '6'));
if (!Number.isSafeInteger(warm) || warm < 0 || !Number.isSafeInteger(steps) || steps < 1) throw Error('Invalid tick window');
if (!Number.isSafeInteger(ships) || ships < 3 || ships > 256) throw Error('Invalid ship count');
fs.mkdirSync(out, { recursive: true });
if (fs.existsSync(path.join(out, 'result.json'))) throw Error('Refusing to overwrite a completed projection measurement');

const noBuild = args.includes('--no-build');
let wasmPath;
if (noBuild) wasmPath = path.resolve(option('--wasm', 'public/game-assets/runtime/combat-core.wasm'));
if (!noBuild) {
const copy = path.join(out, 'native');
fs.mkdirSync(copy, { recursive: true });
for (const f of fs.readdirSync(path.join(root, 'native/combat-core/src')).filter(f => f.endsWith('.rs'))) {
  fs.copyFileSync(path.join(root, 'native/combat-core/src', f), path.join(copy, f));
}

fs.writeFileSync(path.join(copy, 'projection.rs'), [
  'use crate::state::{Core, Handle};',
  'use std::cell::RefCell;',
  '',
  'pub const FLOATS_PER_SPRITE: usize = 16;',
  'pub const FLOATS_PER_HUD: usize = 12;',
  'pub const FLOATS_PER_READBACK: usize = 16;',
  'pub const WITNESS_WORDS: usize = 22;',
  '',
  'thread_local! {',
  '    pub static SPRITE: RefCell<Vec<f32>> = const { RefCell::new(Vec::new()) };',
  '    pub static HUD: RefCell<Vec<f32>> = const { RefCell::new(Vec::new()) };',
  '    pub static READBACK: RefCell<Vec<f32>> = const { RefCell::new(Vec::new()) };',
  '    pub static WITNESS: RefCell<Vec<f64>> = const { RefCell::new(Vec::new()) };',
  '}',
  '',
  'fn body_of(core: &Core, handle: Handle) -> Option<&crate::state::Body> {',
  '    let slot = core.slots.get(handle.slot as usize)?;',
  '    if slot.generation != handle.generation { return None; }',
  '    slot.body.as_ref()',
  '}',
  '',
  '/// One-way projection of the authoritative core state into flat presentation',
  '/// buffers. Read-only over the authority; no mutation, no allocation churn',
  '/// beyond the retained buffers. Known semantic deltas vs the ECS buffer',
  '/// contract (documented, resolved during migration, not silently aligned):',
  '/// sprite w/h/texSlot are placeholders (hull content binding pending),',
  '/// armor_avg uses the core armor grid mean / cell value (ECS uses an 8-sector',
  '/// model), HUD word 12 (system_state) is written as 1.0, team comes from',
  '/// ship.combat.team, no dead/retreated filtering (ECS active semantics).',
  'pub fn project(core: &Core) {',
  '    SPRITE.with_borrow_mut(|s| s.clear());',
  '    HUD.with_borrow_mut(|s| s.clear());',
  '    READBACK.with_borrow_mut(|s| s.clear());',
  '    WITNESS.with_borrow_mut(|s| s.clear());',
  '    let Some(scene) = core.scene.as_ref() else { return };',
  '    let mut capitals = 0usize;',
  '    for r in &scene.roots {',
  '        if r.pending { continue; }',
  '        let Some(body) = body_of(core, r.ship) else { continue };',
  '        let Some(ship) = body.ship.as_ref() else { continue };',
  '        if ship.flags & crate::ship_state::RETREATED == 0 && (r.ship != scene.enemy || scene.primary_enemy_deployed) { capitals += 1; }',
  '    }',
  '    for handle in &core.roster {',
  '        let Some(body) = body_of(core, *handle) else { continue };',
  '        let Some(ship) = body.ship.as_ref() else { continue };',
  '        let armor = ship.armor.as_ref();',
  '        let flux = &ship.flux;',
  '        let hp = armor.map(|a| a.data[14]).unwrap_or(0.0);',
  '        let max_hp = armor.map(|a| a.data[13]).unwrap_or(1.0);',
  '        let soft = flux.soft;',
  '        let hard = flux.hard;',
  '        let max_flux = flux.max;',
  '        let shield_active = ship.shield.is_some() && ship.flags & crate::ship_state::SHIELD != 0;',
  '        let overloaded = flux.overloaded || flux.overload_timer > 0.0;',
  '        let team = ship.combat.as_ref().map(|c| c.team).unwrap_or(0);',
  '        let armor_avg = armor.map(|a| { let n = a.cells.len(); if n == 0 { 0.0 } else { a.cells.iter().map(|&c| c as f64).sum::<f64>() / n as f64 / a.data[7].max(1e-9) } }).unwrap_or(0.0);',
  '        let x = body.motion[0]; let y = body.motion[1];',
  '        let vx = body.motion[2]; let vy = body.motion[3];',
  '        let rot = body.motion[4]; let vrot = body.motion[5];',
  '        let tint = (0.55 + 0.45 * armor_avg).clamp(0.35, 1.0);',
  '        let radius = ship.combat.as_ref().map(|c| c.radius).unwrap_or(32.0).max(8.0) * 2.0;',
  '        SPRITE.with_borrow_mut(|s| s.extend_from_slice(&[x as f32, y as f32, radius as f32, radius as f32, rot as f32,',
  '            0.5, 0.5, 0.0, 0.0, 1.0, 1.0, tint as f32, tint as f32, tint as f32, 1.0, 0.0]));',
  '        HUD.with_borrow_mut(|s| s.extend_from_slice(&[body.id as f32, team as f32, x as f32, y as f32, rot as f32,',
  '            (hp / max_hp.max(1.0)).clamp(0.0, 1.0) as f32,',
  '            ((soft + hard) / max_flux.max(1.0)).clamp(0.0, 1.0) as f32,',
  '            (hard / max_flux.max(1.0)).clamp(0.0, 1.0) as f32,',
  '            u8::from(shield_active) as f32, u8::from(overloaded) as f32,',
  '            armor_avg.clamp(0.0, 1.5) as f32, 1.0]));',
  '        READBACK.with_borrow_mut(|s| s.extend_from_slice(&[body.id as f32, team as f32, 1.0, x as f32, y as f32, vx as f32, vy as f32, rot as f32, vrot as f32,',
  '            hp as f32, max_hp as f32, soft as f32, hard as f32, u8::from(shield_active) as f32, flux.overload_timer as f32, armor_avg.clamp(0.0, 1.5) as f32]));',
  '    }',
  '    for p in &core.ordnance.projectiles {',
  '        SPRITE.with_borrow_mut(|s| s.extend_from_slice(&[p.pos[0] as f32, p.pos[1] as f32, 6.0, 6.0, p.angle as f32,',
  '            0.5, 0.5, 0.0, 0.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0]));',
  '    }',
  '    let player = body_of(core, scene.player);',
  '    let enemy = body_of(core, scene.enemy);',
  '    let words: [f64; WITNESS_WORDS] = [',
  '        core.tick, core.random.seed as f64, core.random.cursor, core.random.ids,',
  '        core.visual_random.seed as f64, core.visual_random.cursor, core.visual_random.ids, core.time,',
  '        player.map(|b| b.motion[0]).unwrap_or(0.0), player.map(|b| b.motion[1]).unwrap_or(0.0),',
  '        player.map(|b| b.motion[2]).unwrap_or(0.0), player.map(|b| b.motion[3]).unwrap_or(0.0),',
  '        player.map(|b| b.motion[4]).unwrap_or(0.0),',
  '        player.and_then(|b| b.ship.as_ref()).and_then(|s| s.armor.as_ref()).map(|a| a.data[14]).unwrap_or(0.0),',
  '        player.map(|b| b.ship.as_ref().map(|s| s.flux.soft).unwrap_or(0.0)).unwrap_or(0.0),',
  '        player.map(|b| b.ship.as_ref().map(|s| s.flux.hard).unwrap_or(0.0)).unwrap_or(0.0),',
  '        enemy.map(|b| b.motion[0]).unwrap_or(0.0), enemy.map(|b| b.motion[1]).unwrap_or(0.0),',
  '        enemy.and_then(|b| b.ship.as_ref()).and_then(|s| s.armor.as_ref()).map(|a| a.data[14]).unwrap_or(0.0),',
  '        capitals as f64 - 1.0 - u8::from(scene.primary_enemy_deployed) as f64,',
  '        core.ordnance.projectiles.len() as f64, core.ordnance.beams.len() as f64,',
  '    ];',
  '    WITNESS.with_borrow_mut(|w| w.extend_from_slice(&words));',
  '}',
].join('\n'));

let lib = fs.readFileSync(path.join(copy, 'lib.rs'), 'utf8');
lib += '\nmod projection;\n';
lib += [
  '#[no_mangle] pub extern "C" fn core_project(id: u32) -> u32 {',
  '    REGISTRY.with_borrow_mut(|r| r.cores.get_mut(&id).map_or(0, |core| {',
  '        crate::projection::project(core);',
  '        crate::projection::READBACK.with(|s| (s.borrow().len() / crate::projection::FLOATS_PER_READBACK) as u32)',
  '    }))',
  '}',
  '#[no_mangle] pub extern "C" fn core_sprite_ptr() -> u32 { crate::projection::SPRITE.with(|s| s.borrow().as_ptr() as usize as u32) }',
  '#[no_mangle] pub extern "C" fn core_sprite_words() -> u32 { crate::projection::SPRITE.with(|s| s.borrow().len() as u32) }',
  '#[no_mangle] pub extern "C" fn core_hud_ptr() -> u32 { crate::projection::HUD.with(|s| s.borrow().as_ptr() as usize as u32) }',
  '#[no_mangle] pub extern "C" fn core_hud_words() -> u32 { crate::projection::HUD.with(|s| s.borrow().len() as u32) }',
  '#[no_mangle] pub extern "C" fn core_readback_ptr() -> u32 { crate::projection::READBACK.with(|s| s.borrow().as_ptr() as usize as u32) }',
  '#[no_mangle] pub extern "C" fn core_readback_words() -> u32 { crate::projection::READBACK.with(|s| s.borrow().len() as u32) }',
  '#[no_mangle] pub extern "C" fn core_witness_ptr() -> u32 { crate::projection::WITNESS.with(|s| s.borrow().as_ptr() as usize as u32) }',
  '#[no_mangle] pub extern "C" fn core_witness_words() -> u32 { crate::projection::WITNESS.with(|s| s.borrow().len() as u32) }',
].join('\n') + '\n';
fs.writeFileSync(path.join(copy, 'lib.rs'), lib);

let state = fs.readFileSync(path.join(copy, 'state.rs'), 'utf8');
for (const [from, to] of [
  ['    slots: Vec<Slot>, free: Vec<u32>, roster: Vec<Handle>, ids: BTreeMap<u32, Handle>,', '    pub slots: Vec<Slot>, free: Vec<u32>, pub roster: Vec<Handle>, ids: BTreeMap<u32, Handle>,'],
  ['    ordnance:crate::battle::Ordnance,ordnance_scratch:crate::battle::Ordnance,', '    pub ordnance:crate::battle::Ordnance,ordnance_scratch:crate::battle::Ordnance,'],
  ['    scene:Option<crate::scene_owner::Owned>,', '    pub scene:Option<crate::scene_owner::Owned>,'],
]) {
  if (!state.includes(from)) throw Error('state.rs visibility anchor missing: ' + from.slice(0, 40));
  state = state.replace(from, to);
}
fs.writeFileSync(path.join(copy, 'state.rs'), state);

const compiler = option('--rustc', 'C:/Users/Aca/.rustup/toolchains/stable-x86_64-pc-windows-msvc/bin/rustc.exe');
if (!fs.existsSync(compiler)) throw Error('Rust compiler unavailable: ' + compiler);
const host = spawnSync(compiler, ['--print', 'sysroot'], { encoding: 'utf8', windowsHide: true }).stdout.trim();
const artifactsSysroot = path.resolve(root, 'artifacts/rust-combat-core-20261008/toolchain/sysroot');
const sysroot = fs.existsSync(path.join(artifactsSysroot, 'lib/rustlib/wasm32-unknown-unknown/lib')) ? artifactsSysroot : host;
const linker = path.join(host, 'lib/rustlib/x86_64-pc-windows-msvc/bin/rust-lld.exe');
if (!fs.existsSync(linker)) throw Error('rust-lld unavailable: ' + linker);
const wasmPath = path.join(out, 'projection.wasm');
const compiled = spawnSync(compiler, ['--edition=2021', '--crate-type=cdylib', '--target=wasm32-unknown-unknown', '--sysroot', sysroot,
  '-C', 'opt-level=3', '-C', 'codegen-units=1', '-C', 'panic=abort', '-C', 'linker=' + linker.replaceAll('\\', '/'), '-A', 'dead_code',
  path.join(copy, 'lib.rs'), '-o', wasmPath], { encoding: 'utf8', windowsHide: true });
fs.writeFileSync(path.join(out, 'compile.log'), compiled.stderr || '');
if (compiled.status) throw Error(compiled.stderr);
}
const wasm = fs.readFileSync(wasmPath), sha256 = crypto.createHash('sha256').update(wasm).digest('hex');

const define = { 'import.meta.env': JSON.stringify({ BASE_URL: '/', DEV: false, PROD: true }), '__LAN_BUILD_ID__': JSON.stringify('core-authority-projection') };
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
"  const kernel = await RustCombatKernel.create(config, 1, { module, sha256: 'projection', bytes: wasm.byteLength });",
"  const exports = kernel.core.exports;",
"  const id = kernel.core.id;",
"  if (typeof exports.core_project !== 'function') throw new Error('Probe module lacks projection exports');",
"  const initial = { capitals: kernel.scene.rosters.allCapitalShips.length };",
"  if (initial.capitals !== ships) throw new Error('Actual benchmark roster differs: ' + initial.capitals);",
"  const sample = { autopilot: true, blocked: false, keys: {}, aim: [0, 0], firing: false, mouseSteering: false, pointerActive: false };",
"  const rows = [], problems = [];",
"  let bindingDiag = null;",
"  for (let i = 0; i < warm + steps; i++) {",
"    kernel.stepScheduled(sample);",
"    kernel.acknowledgePublication();",
"    const t0 = performance.now();",
"    const count = exports.core_project(id);",
"    const t1 = performance.now();",
"    if (i < warm) continue;",
"    const memory = exports.memory.buffer;",
"    const sprite = new Float32Array(memory, exports.core_sprite_ptr() >>> 0, exports.core_sprite_words());",
"    const hud = new Float32Array(memory, exports.core_hud_ptr() >>> 0, exports.core_hud_words());",
"    const readback = new Float32Array(memory, exports.core_readback_ptr() >>> 0, exports.core_readback_words());",
"    const witness = new Float64Array(memory, exports.core_witness_ptr() >>> 0, exports.core_witness_words());",
"    const finite = [...sprite, ...hud, ...readback, ...witness].every(Number.isFinite);",
"    const bodies = kernel.snapshot.bodies;",
"    const byId = new Map(bodies.map(b => [b.id, b]));",
"    let matched = 0;",
"    for (let s = 0; s < count; s++) {",
"      const body = byId.get(readback[s * 16]);",
"      if (!body) { problems.push({ tick: kernel.tick, kind: 'unknown-id', id: readback[s * 16] }); continue; }",
"      matched++;",
"      const bx = body.motion[0], by = body.motion[1];",
"      if (Math.abs(sprite[s * 16] - bx) > 1e-2 * Math.max(1, Math.abs(bx)) || Math.abs(sprite[s * 16 + 1] - by) > 1e-2 * Math.max(1, Math.abs(by)))",
"        problems.push({ tick: kernel.tick, kind: 'geometry', id: body.id });",
"      const hp = body.ship && body.ship.armor ? body.ship.armor.values[14] : 0;",
"      if (Math.abs(readback[s * 16 + 9] - hp) > 1e-3 * Math.max(1, Math.abs(hp))) problems.push({ tick: kernel.tick, kind: 'hp', id: body.id });",
"      const soft = body.ship ? body.ship.flux[8] : 0, hard = body.ship ? body.ship.flux[9] : 0;",
"      if (Math.abs(readback[s * 16 + 11] - soft) > 1e-2 * Math.max(1, Math.abs(soft)) || Math.abs(readback[s * 16 + 12] - hard) > 1e-2 * Math.max(1, Math.abs(hard)))",
"        problems.push({ tick: kernel.tick, kind: 'flux', id: body.id });",
"    }",
"    if (witness.length !== 22 || witness[0] !== kernel.tick) problems.push({ tick: kernel.tick, kind: 'witness', words: witness.length, first: witness[0] });",
"    const playerHandle = kernel.scene.player;",
"    const playerBody = bodies.find(b => b.handle.slot === playerHandle.slot && b.handle.generation === playerHandle.generation);",
"    if (playerBody) {",
"      const px = playerBody.motion[0], py = playerBody.motion[1];",
"      if (Math.abs(witness[8] - px) > 1e-9 * Math.max(1, Math.abs(px)) || Math.abs(witness[9] - py) > 1e-9 * Math.max(1, Math.abs(py))) problems.push({ tick: kernel.tick, kind: 'witness-player-geometry', actual: [witness[8], witness[9]], expected: [px, py] });",
"      const php = playerBody.ship && playerBody.ship.armor ? playerBody.ship.armor.values[14] : 0;",
"      if (Math.abs(witness[13] - php) > 1e-9 * Math.max(1, Math.abs(php))) problems.push({ tick: kernel.tick, kind: 'witness-player-hp', actual: witness[13], expected: php });",
"    }",
"    const expectedRoster = kernel.scene.rosters.allCapitalShips.length - 1 - Number(kernel.scene.primaryEnemyDeployed);",
"    if (witness[19] !== expectedRoster) problems.push({ tick: kernel.tick, kind: 'witness-roster', actual: witness[19], expected: expectedRoster });",
"    if (witness[20] !== kernel.snapshot.projectiles.length || witness[21] !== kernel.snapshot.beams.length) problems.push({ tick: kernel.tick, kind: 'witness-ordnance', actual: [witness[20], witness[21]], expected: [kernel.snapshot.projectiles.length, kernel.snapshot.beams.length] });",
"    if (hud.length !== count * 12 || readback.length !== count * 16) problems.push({ tick: kernel.tick, kind: 'counts', count, sprite: sprite.length, hud: hud.length, readback: readback.length });",
"    if (sprite.length !== (count + kernel.snapshot.projectiles.length) * 16) problems.push({ tick: kernel.tick, kind: 'sprite-counts', count, projectiles: kernel.snapshot.projectiles.length, sprite: sprite.length });",
"    const sizes = kernel.projectionSpriteSizes();",
"    let bound = 0;",
"    for (let s = 0; s < count; s++) { const size = sizes.get(readback[s * 16]); if (size && size.width > 0 && size.height > 0) bound++; }",
"    const view = kernel.captureProjected();",
"    const expectedSlices = kernel.snapshot.projectiles.length > 0 ? 2 : 1;",
"    const viewOk = view.spriteCount === count + kernel.snapshot.projectiles.length && view.hudShipCount === count",
"      && view.batchSliceCount === expectedSlices",
"      && view.batchSlices[0] === 0 && view.batchSlices[1] === count && view.batchSlices[2] === 0 && view.batchSlices[3] === 0",
"      && (expectedSlices === 1 || (view.batchSlices[4] === count && view.batchSlices[5] === kernel.snapshot.projectiles.length && view.batchSlices[6] === 1))",
"      && view.spriteInstances[0] === sprite[0] && view.spriteInstances[1] === sprite[1] && view.hudTelemetry[0] === hud[0];",
"    if (!viewOk) problems.push({ tick: kernel.tick, kind: 'frame-views', spriteCount: view.spriteCount, hud: view.hudShipCount, slices: view.batchSliceCount, count, projectiles: kernel.snapshot.projectiles.length });",
"    if (bound !== count && !bindingDiag) bindingDiag = { sizes: sizes.size, sceneShips: kernel.scene.ships.slice(0, 2).map(s => ({ id: s.id, specKey: s.specKey })), readbackIds: Array.from(readback.subarray(0, 48)).filter((_, i) => i % 16 === 0), specs: contentRegistry.getAllShips().length, specIds: contentRegistry.getAllShips().slice(0, 2).map(s => s.id) };",
"    rows.push({ tick: kernel.tick, projectionMs: t1 - t0, count, projectiles: kernel.snapshot.projectiles.length, matched, finite, playerX: witness[8], bound, viewOk, spriteWords: sprite.length, hudWords: hud.length, readbackWords: readback.length, witnessWords: witness.length });",
"  }",
"  kernel.dispose();",
"  if (rows.some(r => r.count <= 0)) throw new Error('Projection wrote zero ships');",
"  const moved = rows.some((r, i) => i > 0 && r.playerX !== rows[0].playerX);",
"  if (!moved) throw new Error('Projection output never changed: scenario is trivial');",
"  if (problems.length) throw new Error('E2 smoke failed: ' + JSON.stringify(problems.slice(0, 5)));",
"  if (rows.some(r => !r.finite)) throw new Error('Projection wrote non-finite values');",
"  if (rows.some(r => r.matched !== r.count)) throw new Error('Projection ship set differs from snapshot');",
"  if (rows.some(r => !r.viewOk)) throw new Error('Projected frame views differ from the raw buffers');",
"  const unbound = rows.filter(r => r.bound !== r.count);",
"  if (unbound.length) throw new Error('Sprite size binding incomplete: ' + JSON.stringify(bindingDiag));",
"  return { backend: 'rust-wasm', probe: 'projection', warm, steps, initial, rows, finalTick: kernel.tick,",
"    environment: { hardwareConcurrency: navigator.hardwareConcurrency, userAgent: navigator.userAgent } };",
"}",
].join('\n');

const bundle = path.join(out, 'projection-driver.mjs');
const built = await build({ stdin: { contents: driver, resolveDir: root, sourcefile: 'core-authority-projection.ts', loader: 'ts' },
  outfile: bundle, bundle: true, platform: 'browser', format: 'esm', target: 'es2023', mainFields: ['module', 'main'], define, plugins, metafile: true });
if (Object.keys(built.metafile.inputs).some(p => /[/\\]campaign[/\\]/.test(p))) throw Error('Campaign entered projection probe');

const require = createRequire(import.meta.url), { chromium } = require(require.resolve('playwright', { paths: [root, 'C:/Users/Aca/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'] }));
let browser, server;
try {
  await new Promise(resolve => { server = http.createServer((request, response) => {
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Core authority projection</title>'); return; }
    if (pathname === '/projection-driver.mjs') { response.setHeader('Content-Type', 'text/javascript'); response.end(fs.readFileSync(bundle)); return; }
    if (pathname === '/projection.wasm') { response.setHeader('Content-Type', 'application/wasm'); response.end(wasm); return; }
    response.writeHead(404); response.end();
  }); server.listen(0, '127.0.0.1', resolve); });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('http://127.0.0.1:' + server.address().port);
  const result = await page.evaluate(async ({ warm, steps, ships }) => {
    const mod = await import('/projection-driver.mjs');
    return mod.run('/projection.wasm', warm, steps, ships);
  }, { warm, steps, ships });
  if (errors.length) throw Error('Page errors: ' + errors.join(' | '));
  result.sha256 = sha256; result.browser = browser.version();
  result.environment = { ...result.environment, node: process.version, os: os.version(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length };
  const mean = values => values.reduce((sum, n) => sum + n, 0) / values.length;
  const sorted = values => [...values].sort((a, b) => a - b);
  const projection = result.rows.map(r => r.projectionMs);
  result.summary = { ships, count: result.rows[0]?.count, projectionMs: mean(projection),
    p95: sorted(projection)[Math.ceil(projection.length * .95) - 1], p99: sorted(projection)[Math.ceil(projection.length * .99) - 1],
    wordsPerTick: result.rows[0] ? result.rows[0].spriteWords + result.rows[0].hudWords + result.rows[0].readbackWords + result.rows[0].witnessWords : 0,
    spriteBinding: 'PASS', finalTick: result.finalTick, initial: result.initial };
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result.summary, null, 2));
} catch (error) {
  fs.writeFileSync(path.join(out, 'failure.json'), JSON.stringify({ error: String(error), stack: error.stack, sha256 }, null, 2));
  throw error;
} finally { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); }
