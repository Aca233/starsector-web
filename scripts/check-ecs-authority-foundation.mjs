// ECS authority foundation check — verified against the real TypeScript authority RNG.
//
// Covers the stage-2 groundwork added to native/combat-core/src/ecs_core.rs:
//   1. deterministic streams must be bit-identical to src/engine/simulation/SimulationRandom.ts
//      (including the untruncated binary64 cursor and the 2^32 crossing),
//   2. the explicit tick contract (ecs_tick / ecs_step_checked rejection codes),
//   3. the per-ship authoritative readback buffer.
//
// The TypeScript side is bundled from the real source file, not re-implemented here.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

const root = process.cwd();
const args = process.argv.slice(2);
const option = (flag, fallback) => { const i = args.indexOf(flag); return i < 0 ? fallback : args[i + 1]; };
const wasmPath = path.resolve(option('--wasm', 'artifacts/rust-combat-core-20261008/build/wasm32-unknown-unknown/release/foundry_combat_core.wasm'));
const out = path.resolve(option('--out', 'artifacts/ecs-authority-foundation-20261013'));
fs.mkdirSync(out, { recursive: true });

const failures = [];
const cases = [];
// Cases may be synchronous or asynchronous; async ones are awaited before the result
// file is written so a rejected promise can never be mistaken for a pass.
const pending = [];
let started = 0;
const check = (label, fn) => {
  started++;
  const record = details => { cases.push({ label, ...(details ?? {}) }); console.log('ECS-FOUNDATION ' + label + ' passed'); };
  const fail = error => { failures.push({ label, error: String(error), stack: error?.stack }); console.log('ECS-FOUNDATION ' + label + ' FAILED ' + String(error)); };
  try {
    const outcome = fn();
    if (outcome && typeof outcome.then === 'function') pending.push(outcome.then(record, fail));
    else record(outcome);
  } catch (error) { fail(error); }
};

// Bundle the actual authority RNG so the comparison cannot drift from production code.
const bundleDir = path.join(root, 'tmp', 'ecs-foundation-check');
fs.mkdirSync(bundleDir, { recursive: true });
const rngBundle = path.join(bundleDir, 'SimulationRandom.mjs');
await build({
  entryPoints: [path.join(root, 'src/engine/simulation/SimulationRandom.ts')],
  outfile: rngBundle, bundle: true, platform: 'node', format: 'esm', target: 'es2022', logLevel: 'error'
});
const { SimulationRandom } = await import(pathToFileURL(rngBundle).href);

// The staged authority adapter is bundled from source so the check exercises the same
// code the Worker integration will use, not a copy of it.
const authorityBundle = path.join(bundleDir, 'EcsCombatAuthority.mjs');
await build({
  entryPoints: [path.join(root, 'src/engine/runtime/rust/EcsCombatAuthority.ts')],
  outfile: authorityBundle, bundle: true, platform: 'node', format: 'esm', target: 'es2022', logLevel: 'error'
});
const {
  EcsCombatAuthority, ECS_STEP_OK, ECS_STEP_TICK_MISMATCH, ECS_STEP_INVALID_DT,
  ECS_REASON_OK, ECS_REASON_UNKNOWN_OPCODE, ECS_WITNESS_WORDS, ECS_SHIP_STATE_STRIDE,
} = await import(pathToFileURL(authorityBundle).href);

const bytes = fs.readFileSync(wasmPath);
const sha256 = createHash('sha256').update(bytes).digest('hex');
const { instance } = await WebAssembly.instantiate(bytes, {});
const ex = instance.exports;

const SEED = 0x5eed1234;
const VISUAL_SEED = (SEED ^ 0x9e3779b9) >>> 0;
const STREAM_COMBAT = 0, STREAM_VISUAL = 1;

// Wasm memory can grow; every view is recreated per read.
const f64At = (ptr, words) => new Float64Array(ex.memory.buffer, ptr, words);
const f32At = (ptr, words) => new Float32Array(ex.memory.buffer, ptr, words);
const witness = world => {
  const ptr = ex.ecs_rng_witness_ptr(world);
  if (!ptr) throw new Error('RNG witness pointer unavailable');
  return Array.from(f64At(ptr, 6));
};
const allEqual = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
const firstDifference = (a, b) => { for (let i = 0; i < Math.min(a.length, b.length); i++) if (!Object.is(a[i], b[i])) return i; return -1; };
// Wasm `u32` returns reach JavaScript as signed i32, so failure sentinels such as
// `u32::MAX` arrive as -1. Normalize before comparing against unsigned constants.
const asU32 = value => value >>> 0;

check('abi-surface', () => {
  if (ex.ecs_abi_version() !== 200) throw new Error('ECS ABI version changed: ' + ex.ecs_abi_version());
  if (ex.ecs_rng_witness_words() !== 6) throw new Error('witness word count differs');
  if (ex.ecs_ship_state_stride() !== 16) throw new Error('ship state stride differs');
  if (!(ex.ecs_dt_min() > 0 && ex.ecs_dt_max() > ex.ecs_dt_min())) throw new Error('dt contract constants invalid');
  const world = ex.ecs_create_seeded(SEED);
  if (!world) throw new Error('ecs_create_seeded returned 0');
  ex.ecs_destroy(world);
  return { wasmSha256: sha256, bytes: bytes.length, dtMin: ex.ecs_dt_min(), dtMax: ex.ecs_dt_max() };
});

check('rng-combat-stream-exact', () => {
  const reference = new SimulationRandom(SEED);
  const world = ex.ecs_create_seeded(SEED);
  const expected = [], actual = [];
  for (let i = 0; i < 4096; i++) { expected.push(reference.next()); actual.push(ex.ecs_rng_sample(world, STREAM_COMBAT)); }
  const at = firstDifference(expected, actual);
  if (at >= 0) throw new Error(`combat sample ${at} differs: ts=${expected[at]} ecs=${actual[at]}`);
  const tsWitness = reference.checkpointWitness();
  const ecsWitness = witness(world);
  if (!allEqual([tsWitness[0], tsWitness[1], tsWitness[2]], [ecsWitness[0], ecsWitness[1], ecsWitness[2]])) {
    throw new Error(`combat witness differs: ts=${tsWitness.join(',')} ecs=${ecsWitness.slice(0, 3).join(',')}`);
  }
  ex.ecs_destroy(world);
  return { samples: 4096, witness: tsWitness };
});

check('rng-visual-stream-exact', () => {
  const reference = new SimulationRandom(VISUAL_SEED);
  const world = ex.ecs_create_seeded(SEED);
  const expected = [], actual = [];
  for (let i = 0; i < 4096; i++) { expected.push(reference.next()); actual.push(ex.ecs_rng_sample(world, STREAM_VISUAL)); }
  const at = firstDifference(expected, actual);
  if (at >= 0) throw new Error(`visual sample ${at} differs: ts=${expected[at]} ecs=${actual[at]}`);
  const ecsWitness = witness(world);
  if (!allEqual([VISUAL_SEED, reference.checkpointWitness()[1], reference.checkpointWitness()[2]], [ecsWitness[3], ecsWitness[4], ecsWitness[5]])) {
    throw new Error('visual witness differs: ' + ecsWitness.slice(3).join(','));
  }
  ex.ecs_destroy(world);
  if (ecsWitness[3] !== VISUAL_SEED) throw new Error('visual stream seed derivation differs');
  return { samples: 4096, visualSeed: VISUAL_SEED };
});

// The JS cursor is accumulated in binary64 and is NOT truncated between draws, so the
// interesting parity case is beyond 2^32. 300k draws crosses it several times.
check('rng-cursor-beyond-u32-crossing', () => {
  const reference = new SimulationRandom(SEED);
  const world = ex.ecs_create_seeded(SEED);
  const draws = 300_000;
  const step = 9973; // sample positions, keep memory bounded
  const positions = [];
  for (let i = 0; i < draws; i++) {
    const value = reference.next();
    const other = ex.ecs_rng_sample(world, STREAM_COMBAT);
    if (!Object.is(value, other)) throw new Error(`draw ${i} differs: ts=${value} ecs=${other}`);
    if (i % step === 0) positions.push(i);
  }
  const tsWitness = reference.checkpointWitness();
  const ecsWitness = witness(world);
  if (!allEqual([tsWitness[1], tsWitness[2]], [ecsWitness[1], ecsWitness[2]])) {
    throw new Error(`long-run witness differs: ts=${tsWitness[1]} ecs=${ecsWitness[1]}`);
  }
  const crossed = tsWitness[1] > 4_294_967_296;
  if (!crossed) throw new Error('test did not cross the u32 cursor boundary; parity claim unproven');
  ex.ecs_destroy(world);
  return { draws, sampledPositions: positions.length, tsState: tsWitness[1], crossedU32: crossed };
});

check('rng-identity-allocator-exact', () => {
  const reference = new SimulationRandom(SEED);
  const world = ex.ecs_create_seeded(SEED);
  const expected = [], actual = [];
  for (let i = 0; i < 257; i++) { expected.push(reference.nextNumericId()); actual.push(ex.ecs_rng_next_id(world)); }
  const at = firstDifference(expected, actual);
  if (at >= 0) throw new Error(`identity ${at} differs: ts=${expected[at]} ecs=${actual[at]}`);
  const ecsWitness = witness(world);
  if (!Object.is(ecsWitness[2], reference.checkpointWitness()[2])) throw new Error('identity witness differs');
  ex.ecs_destroy(world);
  return { ids: 257 };
});

check('rng-cursor-restore-exact', () => {
  const reference = new SimulationRandom(SEED);
  for (let i = 0; i < 1234; i++) reference.next();
  const cursor = reference.checkpointWitness();
  const world = ex.ecs_create_seeded(SEED);
  if (ex.ecs_set_rng_cursors(world, cursor[1], cursor[2], VISUAL_SEED, 0) !== 1) throw new Error('cursor restore rejected a valid witness');
  const expected = reference.next(), actual = ex.ecs_rng_sample(world, STREAM_COMBAT);
  if (!Object.is(expected, actual)) throw new Error(`post-restore sample differs: ts=${expected} ecs=${actual}`);
  if (ex.ecs_set_rng_cursors(world, -1, 0, 0, 0) !== 0) throw new Error('negative cursor accepted');
  if (ex.ecs_set_rng_cursors(world, 1.5, 0, 0, 0) !== 0) throw new Error('fractional cursor accepted');
  if (ex.ecs_set_rng_cursors(world, Number.NaN, 0, 0, 0) !== 0) throw new Error('NaN cursor accepted');
  ex.ecs_destroy(world);
  return { cursor: cursor[1] };
});

check('tick-contract', () => {
  const world = ex.ecs_create_seeded(SEED);
  if (ex.ecs_tick(world) !== 0) throw new Error('fresh world tick is not 0');
  const dt = 1 / 60;
  if (ex.ecs_step_checked(world, 0, dt) !== 1) throw new Error('valid step rejected');
  if (ex.ecs_tick(world) !== 1) throw new Error('tick did not advance');
  if (ex.ecs_step_checked(world, 0, dt) !== 2) throw new Error('replayed tick was not rejected');
  if (ex.ecs_tick(world) !== 1) throw new Error('rejected step advanced the tick');
  if (ex.ecs_step_checked(world, 1, 10) !== 3) throw new Error('oversized dt was not rejected');
  if (ex.ecs_step_checked(world, 1, 0) !== 3) throw new Error('zero dt was not rejected');
  if (ex.ecs_step_checked(world, 1, Number.NaN) !== 3) throw new Error('NaN dt was not rejected');
  if (ex.ecs_tick(world) !== 1) throw new Error('invalid dt advanced the tick');
  if (ex.ecs_step_checked(world, 2, dt) !== 2) throw new Error('future tick was not rejected');
  if (ex.ecs_step_checked(world, 1, dt) !== 1) throw new Error('valid step after rejections failed');
  if (ex.ecs_step_checked(0xffff, 1, dt) !== 0) throw new Error('unknown world was not reported');
  if (ex.ecs_tick(0xffff) !== -1) throw new Error('unknown world tick is not -1');
  // Legacy step keeps its clamp semantics and must not be broken by the new contract.
  const legacy = ex.ecs_step(world, dt);
  if (ex.ecs_tick(world) !== 3) throw new Error('legacy step stopped advancing: tick=' + ex.ecs_tick(world));
  ex.ecs_step(world, 10);
  if (ex.ecs_tick(world) !== 4) throw new Error('legacy step no longer clamps/advances: tick=' + ex.ecs_tick(world));
  ex.ecs_destroy(world);
  return { rejectCodes: { mismatch: 2, invalidDt: 3, unknownWorld: 0 }, legacySpriteCount: legacy };
});

check('ship-state-readback', () => {
  const world = ex.ecs_create_seeded(SEED);
  const first = ex.ecs_spawn_ship(world, 7, 0, -120, 45, 0.5, 85, 1400, 130, 175, 125, 95, 0.8, 8000, 850, 13000, 650, 210, 105, 0.7, 55, 750, 0);
  const second = ex.ecs_spawn_ship(world, 9, 1, 300, -210, -0.25, 60, 900, 90, 120, 140, 110, 0.9, 4000, 500, 6000, 400, 180, 90, 0.8, 45, 700, 0);
  if (asU32(first) === 0xffffffff || asU32(second) === 0xffffffff) throw new Error('ship spawn failed');
  ex.ecs_step_checked(world, 0, 1 / 60);
  const count = ex.ecs_ship_state_count(world);
  if (count !== 2) throw new Error('ship state count differs: ' + count);
  const stride = ex.ecs_ship_state_stride();
  const state = f32At(ex.ecs_ship_state_ptr(world), count * stride);
  const row = i => Array.from(state.slice(i * stride, (i + 1) * stride));
  const [a, b] = [row(0), row(1)];
  const expect = (label, actual, want) => { if (actual !== want) throw new Error(`${label}: ${actual} != ${want}`); };
  expect('ship0 id', a[0], 7); expect('ship0 team', a[1], 0); expect('ship0 active', a[2], 1);
  expect('ship0 hp', a[9], 8000); expect('ship0 max_hp', a[10], 8000);
  expect('ship1 id', b[0], 9); expect('ship1 team', b[1], 1); expect('ship1 hp', b[9], 4000);
  expect('ship0 shield_active', a[13], 1);
  if (!Number.isFinite(a[3]) || !Number.isFinite(a[4]) || !Number.isFinite(a[15])) throw new Error('readback has non-finite geometry/armor');
  if (!(a[15] > 0)) throw new Error('armor average is not populated');
  // Ships must have accelerated along their facing after one step.
  if (a[3] === -120 && a[4] === 45) throw new Error('readback did not observe integration');
  ex.ecs_destroy(world);
  return { stride, ships: count, ship0: { x: a[3], y: a[4], hp: a[9], armorAvg: a[15] } };
});

const WITNESS_WORDS = 22, COMMAND_RESULT_STRIDE = 2;
const CMD_APPLY_FORCE = 1, CMD_SET_TIME_SCALE = 2;
const ROLE_NONE = 0, ROLE_PLAYER = 1, ROLE_ENEMY = 2;
const APPLY_UNKNOWN_WORLD = 0xffffffff;
const CMD_REASON_OK = 0, CMD_REASON_UNKNOWN_OPCODE = 1, CMD_REASON_UNKNOWN_TARGET = 2;

const witnessWords = world => {
  const ptr = ex.ecs_witness_ptr(world);
  if (!ptr) throw new Error('witness pointer unavailable');
  return Array.from(f64At(ptr, WITNESS_WORDS));
};
const spawnShip = (world, id, team, x, y, rot, opts = {}) => {
  const index = ex.ecs_spawn_ship(
    world, id, team, x, y, rot, opts.radius ?? 80, opts.mass ?? 1200, 120, 160,
    opts.maxSpeed ?? 120, 90, 0.8, opts.hp ?? 5000, opts.armor ?? 600,
    opts.maxFlux ?? 8000, 600, 200, 100, 0.8, 50, 700, 0);
  if (asU32(index) === 0xffffffff) throw new Error(`ship spawn failed for id ${id}`);
  return index;
};

check('witness-layout-and-roles', () => {
  if (ex.ecs_witness_words() !== WITNESS_WORDS) throw new Error('witness word count differs: ' + ex.ecs_witness_words());
  const world = ex.ecs_create_seeded(SEED);
  if (spawnShip(world, 1, 0, -100, 20, 0) < 0) throw new Error('player spawn failed');
  if (spawnShip(world, 2, 1, 250, -60, 0) < 0) throw new Error('enemy spawn failed');
  ex.ecs_step_checked(world, 0, 1 / 60);
  const unmarked = witnessWords(world);
  if (ex.ecs_witness_roles_present(world) !== 0) throw new Error('roles reported without marking');
  for (let i = 8; i <= 18; i++) if (unmarked[i] !== 0) throw new Error(`unmarked witness[${i}] is ${unmarked[i]}, expected 0`);
  if (ex.ecs_mark_ship_role(world, 5, ROLE_PLAYER) !== 0) throw new Error('out-of-range role index accepted');
  if (ex.ecs_mark_ship_role(world, 0, 7) !== 0) throw new Error('invalid role accepted');
  if (ex.ecs_mark_ship_role(world, 0, ROLE_PLAYER) !== 1) throw new Error('player role rejected');
  if (ex.ecs_mark_ship_role(world, 1, ROLE_ENEMY) !== 1) throw new Error('enemy role rejected');
  if (ex.ecs_witness_roles_present(world) !== 3) throw new Error('roles_present mask differs');
  const w = witnessWords(world);
  if (w.length !== WITNESS_WORDS) throw new Error('witness length differs');
  if (w[0] !== ex.ecs_tick(world)) throw new Error(`witness[0] ${w[0]} != tick ${ex.ecs_tick(world)}`);
  if (!w.every(Number.isFinite)) throw new Error('witness contains non-finite values');
  const rng = witness(world);
  if (!allEqual([w[1], w[2], w[3], w[4], w[5], w[6]], rng)) throw new Error('witness RNG fields differ from the RNG witness');
  if (w[7] <= 0) throw new Error('combatTime was not published');
  if (ex.ecs_mark_ship_role(world, 0, ROLE_NONE) !== 1) throw new Error('role clear rejected');
  if (ex.ecs_witness_roles_present(world) !== 2) throw new Error('cleared player role still reported');
  ex.ecs_destroy(world);
  return { words: WITNESS_WORDS, tick: w[0], combatTime: w[7] };
});

check('witness-tracks-authority-state', () => {
  const world = ex.ecs_create_seeded(SEED);
  const player = spawnShip(world, 11, 0, -150, 30, 0, { hp: 4321, armor: 700 });
  const enemy = spawnShip(world, 22, 1, 400, -120, 0, { hp: 3456, armor: 500 });
  ex.ecs_mark_ship_role(world, player, ROLE_PLAYER);
  ex.ecs_mark_ship_role(world, enemy, ROLE_ENEMY);
  ex.ecs_step_checked(world, 0, 1 / 60);
  const before = witnessWords(world);
  // Push the player sideways; the layout proof is *which* fields move.
  ex.ecs_push_command(world, CMD_APPLY_FORCE, player, 0, -9000, 0);
  if (ex.ecs_apply_commands(world) !== 1) throw new Error('force command was not applied');
  ex.ecs_step_checked(world, 1, 1 / 60);
  const after = witnessWords(world);
  const stride = ex.ecs_ship_state_stride();
  const state = f32At(ex.ecs_ship_state_ptr(world), ex.ecs_ship_state_count(world) * stride);
  const row = i => Array.from(state.slice(i * stride, (i + 1) * stride));
  const p = row(player), e = row(enemy);
  for (const [label, index, value] of [['x', 8, p[3]], ['y', 9, p[4]], ['vx', 10, p[5]], ['vy', 11, p[6]], ['facing', 12, p[7]]]) {
    if (!Object.is(after[index], value)) throw new Error(`player ${label} witness ${after[index]} != readback ${value}`);
  }
  for (const [label, index, value] of [['hull', 13, p[9]], ['softFlux', 14, p[11]], ['hardFlux', 15, p[12]]]) {
    if (!Object.is(after[index], value)) throw new Error(`player ${label} witness ${after[index]} != readback ${value}`);
  }
  if (!Object.is(after[16], e[3]) || !Object.is(after[17], e[4]) || !Object.is(after[18], e[9])) throw new Error('enemy witness fields differ from readback');
  if (!Object.is(after[20], ex.ecs_active_projectile_count(world))) throw new Error('projectile witness field differs');
  const moved = [8, 9, 10, 11].filter(i => !Object.is(before[i], after[i]));
  if (moved.length === 0) throw new Error('lateral impulse moved no player geometry field');
  // The impulse was (0, -9000): the player's vertical velocity must have gone down.
  if (!(after[11] < before[11])) throw new Error(`player vy did not follow the impulse: ${before[11]} -> ${after[11]}`);
  // Documented placeholders: no reinforcement reserve and no beams exist in ECS yet.
  if (after[19] !== 0 || after[21] !== 0) throw new Error('placeholder witness fields are not zero');
  if (after[0] !== before[0] + 1) throw new Error('witness tick did not advance by one');
  ex.ecs_destroy(world);
  return { movedFields: moved, playerVy: [before[11], after[11]], projectiles: after[20] };
});

check('command-receipts', () => {
  const world = ex.ecs_create_seeded(SEED);
  const ship = spawnShip(world, 5, 0, 0, 0, 0);
  if (ex.ecs_command_result_stride() !== COMMAND_RESULT_STRIDE) throw new Error('result stride differs');
  if (ex.ecs_command_results_count(world) !== 0) throw new Error('fresh world has receipts');
  if (ex.ecs_push_command(world, CMD_APPLY_FORCE, ship, 100, 0, 0) !== 1) throw new Error('valid command was not queued');
  if (ex.ecs_push_command(world, 4242, ship, 0, 0, 0) !== 1) throw new Error('unknown opcode was not queued');
  if (ex.ecs_push_command(world, CMD_APPLY_FORCE, 9999, 0, 0, 0) !== 1) throw new Error('bad target was not queued');
  const tickBefore = ex.ecs_tick(world);
  if (ex.ecs_apply_commands(world) !== 3) throw new Error('apply did not report three commands');
  if (ex.ecs_tick(world) !== tickBefore) throw new Error('applying commands advanced the tick');
  const read = () => { const count = ex.ecs_command_results_count(world); return Array.from(f32At(ex.ecs_command_results_ptr(world), count * COMMAND_RESULT_STRIDE)); };
  const receipts = read();
  const expected = [1, CMD_REASON_OK, 0, CMD_REASON_UNKNOWN_OPCODE, 0, CMD_REASON_UNKNOWN_TARGET];
  if (!allEqual(receipts, expected)) throw new Error('receipts differ: ' + receipts.join(',') + ' expected ' + expected.join(','));
  // Receipts stay readable until the next non-empty batch (documented contract).
  if (ex.ecs_apply_commands(world) !== 3) throw new Error('empty apply dropped the readable batch');
  if (ex.ecs_push_command(world, CMD_SET_TIME_SCALE, ship, 2, 0, 0) !== 1) throw new Error('second batch was not queued');
  if (ex.ecs_apply_commands(world) !== 1) throw new Error('second batch size differs');
  if (!allEqual(read(), [1, CMD_REASON_OK])) throw new Error('second batch did not replace the receipts');
  // The legacy step path must record receipts too.
  if (ex.ecs_push_command(world, CMD_APPLY_FORCE, ship, 0, 0, 0) !== 1) throw new Error('legacy batch was not queued');
  ex.ecs_step(world, 1 / 60);
  if (!allEqual(read(), [1, CMD_REASON_OK])) throw new Error('legacy step did not record receipts');
  if (asU32(ex.ecs_apply_commands(0xffff)) !== APPLY_UNKNOWN_WORLD) throw new Error('unknown world apply status differs');
  ex.ecs_destroy(world);
  return { batches: 3, reasonCodes: { ok: CMD_REASON_OK, unknownOpcode: CMD_REASON_UNKNOWN_OPCODE, unknownTarget: CMD_REASON_UNKNOWN_TARGET } };
});

// ---------------------------------------------------------------------------
// Staged authority adapter: driven exactly the way the Worker host drives a kernel
// (init -> commands -> step*, with a replay that re-runs the same journal).
// ---------------------------------------------------------------------------

const ROSTER = [
  { id: 1, team: 0, x: -200, y: 0, rot: 0, radius: 80, mass: 1200, maxSpeed: 120, accel: 90,
    turnRate: 0.8, hp: 5000, armor: 600, maxFlux: 8000, dissipation: 600, shieldArcDeg: 200,
    shieldRadius: 100, shieldEfficiency: 0.8, weaponDamage: 50, projSpeed: 700, texSlot: 0, role: 'player' },
  { id: 2, team: 1, x: 300, y: -50, rot: Math.PI, radius: 80, mass: 1200, maxSpeed: 120, accel: 90,
    turnRate: 0.8, hp: 5000, armor: 600, maxFlux: 8000, dissipation: 600, shieldArcDeg: 200,
    shieldRadius: 100, shieldEfficiency: 0.8, weaponDamage: 50, projSpeed: 700, texSlot: 0, role: 'enemy' },
];
const JOURNAL = [
  { kind: 'commands', commands: [
    { opcode: 1, target: 0, a: 0, b: -9000, c: 0 },
    { opcode: 6, target: 0, a: 0.9, b: 0, c: 0 },
  ] },
  { kind: 'step', count: 24 },
  { kind: 'commands', commands: [{ opcode: 1, target: 1, a: 500, b: 250, c: 0 }] },
  { kind: 'step', count: 24 },
];
const compiledModule = await WebAssembly.compile(bytes);
const runJournal = async journal => {
  const authority = await EcsCombatAuthority.create({ module: compiledModule, config: { seed: SEED, ships: ROSTER }, wasmSha256: sha256 });
  const witnesses = [], receipts = [];
  try {
    for (const entry of journal) {
      if (entry.kind === 'commands') {
        for (const command of entry.commands) authority.pushCommand(command.opcode, command.target, command.a, command.b, command.c);
        receipts.push(authority.applyCommands().map(r => ({ accepted: r.accepted, reason: r.reason })));
      } else {
        for (let i = 0; i < entry.count; i++) {
          // A control sample belongs to one tick, exactly like the host's contract.
          if (entry.control) authority.setControl(entry.control.index, entry.control);
          authority.stepScheduled();
          witnesses.push(authority.replayWitness());
        }
      }
    }
  } finally { authority.dispose(); }
  return { witnesses, receipts };
};
const INPUT_JOURNAL = [
  { kind: 'step', count: 6, control: { index: 0, aimX: 400, aimY: 0, thrust: 1 } },
  { kind: 'step', count: 6, control: { index: 0, aimX: 0, aimY: 400, thrust: 1, strafe: 0.5 } },
  { kind: 'commands', commands: [{ opcode: 1, target: 1, a: -400, b: 0, c: 0 }] },
  { kind: 'step', count: 12, control: { index: 0, aimX: 400, aimY: -400, thrust: 1, firing: true } },
  { kind: 'step', count: 6 },
];

check('authority-adapter-drives-kernel', async () => {
  const authority = await EcsCombatAuthority.create({ module: compiledModule, config: { seed: SEED, ships: ROSTER }, wasmSha256: sha256 });
  try {
    if (authority.tick !== 0) throw new Error('fresh authority tick is not 0');
    if (authority.rolesPresent !== 3) throw new Error('adapter did not mark both roles');
    if (authority.replayWitness().length !== ECS_WITNESS_WORDS) throw new Error('adapter witness length differs');
    if (ECS_SHIP_STATE_STRIDE !== 16) throw new Error('adapter ship state stride constant differs');
    const [minDt, maxDt] = authority.dtRange;
    if (!(minDt > 0 && maxDt > minDt)) throw new Error('adapter dt range invalid');
    authority.pushCommand(1, 0, 0, -5000, 0);
    const receipts = authority.applyCommands();
    if (receipts.length !== 1 || !receipts[0].accepted || receipts[0].reason !== ECS_REASON_OK)
      throw new Error('adapter receipt for a valid command differs: ' + JSON.stringify(receipts));
    authority.pushCommand(9999, 0, 0, 0, 0);
    const rejected = authority.applyCommands();
    if (rejected.length !== 1 || rejected[0].accepted || rejected[0].reason !== ECS_REASON_UNKNOWN_OPCODE)
      throw new Error('adapter receipt for an unknown opcode differs: ' + JSON.stringify(rejected));
    authority.stepScheduled();
    if (authority.tick !== 1) throw new Error('adapter step did not advance the tick');
    const ships = authority.readShips();
    if (ships.length !== 2) throw new Error('adapter readback count differs: ' + ships.length);
    if (!ships.every(s => s.active && Number.isFinite(s.x) && Number.isFinite(s.armorAverage)))
      throw new Error('adapter readback contains inactive or non-finite rows');
    return { tick: authority.tick, ships: ships.length, witnessWords: ECS_WITNESS_WORDS };
  } finally { authority.dispose(); }
});

check('authority-mistimed-step-rejected', async () => {
  const authority = await EcsCombatAuthority.create({ module: compiledModule, config: { seed: SEED, ships: ROSTER } });
  try {
    if (authority.stepChecked(authority.tick + 1) !== ECS_STEP_TICK_MISMATCH) throw new Error('future tick was not rejected');
    if (authority.tick !== 0) throw new Error('rejected step advanced the tick');
    if (authority.stepChecked(authority.tick, 0.5) !== ECS_STEP_INVALID_DT) throw new Error('out-of-range dt was not rejected');
    if (authority.stepChecked(authority.tick, Number.NaN) !== ECS_STEP_INVALID_DT) throw new Error('NaN dt was not rejected');
    const committed = authority.tick;
    if (authority.stepChecked(committed) !== ECS_STEP_OK) throw new Error('valid step was rejected');
    // Re-applying an already committed tick is exactly the replay hazard: the stale
    // value must be rejected, not silently re-stepped.
    if (authority.stepChecked(committed) !== ECS_STEP_TICK_MISMATCH) throw new Error('replayed tick was accepted');
    if (authority.tick !== committed + 1) throw new Error('rejected replay changed the tick');
    authority.dispose();
    let threw = false;
    try { authority.stepScheduled(); } catch { threw = true; }
    if (!threw) throw new Error('disposed authority still steps');
    return { tick: authority.tick };
  } finally { authority.dispose(); }
});

check('authority-replay-determinism', async () => {
  const first = await runJournal(JOURNAL);
  const second = await runJournal(JOURNAL);
  if (first.witnesses.length !== second.witnesses.length) throw new Error('replay produced a different tick count');
  if (first.witnesses.length !== 48) throw new Error('journal did not produce the expected ticks: ' + first.witnesses.length);
  for (let tick = 0; tick < first.witnesses.length; tick++) {
    const a = first.witnesses[tick], b = second.witnesses[tick];
    if (a.length !== ECS_WITNESS_WORDS) throw new Error(`witness ${tick} length differs`);
    for (let field = 0; field < a.length; field++)
      if (!Object.is(a[field], b[field])) throw new Error(`replay tick ${tick} field ${field} differs: ${a[field]} vs ${b[field]}`);
  }
  if (JSON.stringify(first.receipts) !== JSON.stringify(second.receipts)) throw new Error('replay receipts differ');
  // A trivial journal would pass vacuously; demand real movement and a real tick clock.
  const last = first.witnesses.at(-1), first0 = first.witnesses[0];
  if (last[0] !== 48) throw new Error('witness tick clock differs: ' + last[0]);
  if (Object.is(last[8], first0[8]) && Object.is(last[9], first0[9])) throw new Error('player never moved across the journal');
  if (!first.receipts.every(batch => batch.length > 0)) throw new Error('a command batch produced no receipts');
  return { ticks: first.witnesses.length, batches: first.receipts.length, lastTick: last[0] };
});

check('authority-roster-limit-and-u32-normalisation', async () => {
  // 257 spawns must fail on the 257th: this only works if `u32::MAX` is normalised
  // (Wasm returns it to JS as -1, not 4294967295).
  const authority = await EcsCombatAuthority.create({ module: compiledModule, config: { seed: SEED, ships: [] } });
  try {
    for (let i = 0; i < 256; i++) authority.spawn({ ...ROSTER[0], id: 1000 + i, role: 'none' });
    let threw = false;
    try { authority.spawn({ ...ROSTER[0], id: 9999, role: 'none' }); } catch { threw = true; }
    if (!threw) throw new Error('roster overflow was accepted (u32 sentinel not normalised?)');
    if (authority.readShips().length !== 256) throw new Error('roster overflow changed the ship count');
    return { spawned: 256, overflowRejected: true };
  } finally { authority.dispose(); }
});

// ---------------------------------------------------------------------------
// Control input channel: the ECS authority must accept the same per-tick sample
// shape the TS authority consumes, without disturbing the AI path.
// ---------------------------------------------------------------------------

check('authority-control-drives-motion', async () => {
  const run = async withControl => {
    const authority = await EcsCombatAuthority.create({ module: compiledModule, config: { seed: SEED, ships: ROSTER } });
    try {
      const start = authority.readShips()[0];
      for (let i = 0; i < 30; i++) {
        if (withControl) authority.setControl(0, { aimX: 400, aimY: 0, thrust: 1 });
        authority.stepScheduled();
      }
      const end = authority.readShips()[0];
      return { start, end };
    } finally { authority.dispose(); }
  };
  const controlled = await run(true), untouched = await run(false);
  // 30 ticks of full thrust on hull accel 90 at 1/60: the discrete sum is
  // accel * dt^2 * (n(n+1)/2). Asserting the analytic value is far stronger than a
  // loose "it moved" threshold - it pins the input channel to the hull's own limits.
  const TICKS = 30, fixedDt = 1 / 60;
  const expectedDx = ROSTER[0].accel * fixedDt * fixedDt * (TICKS * (TICKS + 1) / 2);
  const dx = controlled.end.x - controlled.start.x;
  if (Math.abs(dx - expectedDx) > 0.05)
    throw new Error(`manual thrust did not follow hull acceleration: dx=${dx} expected≈${expectedDx}`);
  if (!(controlled.end.vx > 0)) throw new Error('manual thrust produced no forward velocity');
  // Facing must converge toward the aim point, and never faster than the hull's own
  // turn rate (aim is straight ahead here, so the residual angle must shrink).
  if (!(Math.abs(controlled.end.rot) <= Math.abs(controlled.start.rot) + 1e-6))
    throw new Error(`facing did not track the aim point: ${controlled.start.rot} -> ${controlled.end.rot}`);
  if (Object.is(controlled.end.x, untouched.end.x))
    throw new Error('control input had no effect on the authority');
  return { controlledDx: dx, expectedDx, untouchedDx: untouched.end.x - untouched.start.x };
});

check('authority-control-is-per-tick', async () => {
  const run = async pattern => {
    const authority = await EcsCombatAuthority.create({ module: compiledModule, config: { seed: SEED, ships: ROSTER } });
    try {
      for (const armed of pattern) {
        if (armed) authority.setControl(0, { aimX: 400, aimY: 0, thrust: 1 });
        authority.stepScheduled();
      }
      return authority.readShips()[0];
    } finally { authority.dispose(); }
  };
  // Armed on the first tick only vs armed on both ticks: if the sample leaked across
  // ticks these would be identical.
  const once = await run([true, false]);
  const twice = await run([true, true]);
  if (Object.is(once.x, twice.x) && Object.is(once.vx, twice.vx))
    throw new Error('a control sample leaked into the following tick');
  const twiceAgain = await run([true, true]);
  if (!Object.is(twice.x, twiceAgain.x)) throw new Error('controlled runs are not reproducible');
  return { onceX: once.x, twiceX: twice.x };
});

check('authority-replay-determinism-with-inputs', async () => {
  const first = await runJournal(INPUT_JOURNAL);
  const second = await runJournal(INPUT_JOURNAL);
  if (first.witnesses.length !== 30) throw new Error('input journal tick count differs: ' + first.witnesses.length);
  for (let tick = 0; tick < first.witnesses.length; tick++) {
    const a = first.witnesses[tick], b = second.witnesses[tick];
    for (let field = 0; field < a.length; field++)
      if (!Object.is(a[field], b[field])) throw new Error(`input replay tick ${tick} field ${field} differs: ${a[field]} vs ${b[field]}`);
  }
  if (JSON.stringify(first.receipts) !== JSON.stringify(second.receipts)) throw new Error('input replay receipts differ');
  const last = first.witnesses.at(-1);
  if (last[0] !== 30) throw new Error('input journal tick clock differs: ' + last[0]);
  // Weapon activity is the point of the firing sample: projectiles must exist at some
  // point in the run (witness[20]) rather than the sample being silently ignored.
  const peakProjectiles = Math.max(...first.witnesses.map(w => w[20]));
  if (!(peakProjectiles > 0)) throw new Error('the firing control sample produced no projectiles');
  return { ticks: first.witnesses.length, batches: first.receipts.length, peakProjectiles };
});

check('ai-path-unchanged-across-builds', async () => {
  // The installed 10-10 build predates every authority change (rounds 2-5). Replaying
  // the identical AI-only scenario on it and on the fresh build proves the new code
  // paths did not disturb AI movement, at all.
  const legacyBytes = fs.readFileSync(path.join(root, 'public/runtime/combat-core.wasm'));
  const legacy = (await WebAssembly.instantiate(legacyBytes, {})).instance.exports;
  const HUD_STRIDE = 12, STEPS = 48;
  const sampleHud = exports => {
    const world = exports.ecs_create();
    if (!world) throw new Error('legacy world creation failed');
    const spawn = ship => exports.ecs_spawn_ship(world, ship.id, ship.team, ship.x, ship.y, ship.rot,
      ship.radius, ship.mass, 120, 160, ship.maxSpeed, ship.accel, ship.turnRate, ship.hp, ship.armor,
      ship.maxFlux, ship.dissipation, ship.shieldArcDeg, ship.shieldRadius, ship.shieldEfficiency,
      ship.weaponDamage, ship.projSpeed, ship.texSlot);
    for (const ship of ROSTER) if ((spawn(ship) >>> 0) === 0xffffffff) throw new Error('legacy spawn failed');
    const frames = [];
    for (let i = 0; i < STEPS; i++) {
      exports.ecs_step(world, 1 / 60);
      const count = exports.ecs_hud_ship_count(world);
      if (count !== ROSTER.length) throw new Error('HUD ship count differs: ' + count);
      const view = new Float32Array(exports.memory.buffer, exports.ecs_hud_ptr(world), count * HUD_STRIDE);
      frames.push(Array.from(view));
    }
    exports.ecs_destroy(world);
    return frames;
  };
  const before = sampleHud(legacy), after = sampleHud(ex);
  for (let frame = 0; frame < STEPS; frame++) {
    const a = before[frame], b = after[frame];
    if (a.length !== b.length) throw new Error(`frame ${frame} HUD length differs`);
    for (let field = 0; field < a.length; field++)
      if (!Object.is(a[field], b[field]))
        throw new Error(`AI path changed at step ${frame} HUD[${field}]: legacy=${a[field]} current=${b[field]}`);
  }
  const legacyEcs = WebAssembly.Module.exports(await WebAssembly.compile(legacyBytes)).filter(e => e.name.startsWith('ecs_')).length;
  return { steps: STEPS, hudFields: before[0].length, legacyEcsExports: legacyEcs };
});

// Guard for the "same name, two meanings" defect: armor_avg is published on both
// the HUD channel (word 10) and the readback channel (word 15) and must agree.
check('armor-average-is-one-semantic', () => {
  const world = ex.ecs_create();
  if (!world) throw new Error('ECS world creation failed');
  const spawn = ship => ex.ecs_spawn_ship(world, ship.id, ship.team, ship.x, ship.y, ship.rot,
    ship.radius, ship.mass, 120, 160, ship.maxSpeed, ship.accel, ship.turnRate, ship.hp, ship.armor,
    ship.maxFlux, ship.dissipation, ship.shieldArcDeg, ship.shieldRadius, ship.shieldEfficiency,
    ship.weaponDamage, ship.projSpeed, ship.texSlot);
  for (const ship of ROSTER) if ((spawn(ship) >>> 0) === 0xffffffff) throw new Error('ECS spawn failed');
  let compared = 0;
  for (let i = 0; i < 48; i++) {
    ex.ecs_step(world, 1 / 60);
    const hudCount = ex.ecs_hud_ship_count(world);
    const hud = new Float32Array(ex.memory.buffer, ex.ecs_hud_ptr(world), hudCount * 12);
    const stateCount = ex.ecs_ship_state_count(world);
    const state = new Float32Array(ex.memory.buffer, ex.ecs_ship_state_ptr(world), stateCount * 16);
    const hudById = new Map();
    for (let s = 0; s < hudCount; s++) hudById.set(hud[s * 12], hud[s * 12 + 10]);
    for (let s = 0; s < stateCount; s++) {
      const id = state[s * 16], readback = state[s * 16 + 15], hudValue = hudById.get(id);
      if (hudValue === undefined) continue;
      if (Math.abs(hudValue - readback) > 1e-6)
        throw new Error('armor_avg differs by channel: ship=' + id + ' hud=' + hudValue + ' readback=' + readback);
      compared++;
    }
  }
  ex.ecs_destroy(world);
  if (compared < ROSTER.length) throw new Error('too few armor comparisons: ' + compared);
  return { comparisons: compared };
});

// Every check must be awaited before the verdict is computed, otherwise a late
// failure would be recorded after `passed` was decided and the run would "pass".
await Promise.all(pending);
if (cases.length + failures.length !== started)
  throw new Error(`Check accounting mismatch: ${cases.length + failures.length} recorded vs ${started} started`);

const result = {
  passed: failures.length === 0, sha256, wasmPath, wasmBytes: bytes.length,
  cases, failures,
  scope: 'ECS authority foundation: exact SimulationRandom parity (combat + visual + identity + cursor restore + >2^32 crossing), tick contract, per-ship readback. No rendering, no content admission, no gameplay rules.'
};
fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ passed: result.passed, cases: cases.length, failures: failures.map(f => f.label) }));
if (!result.passed) process.exitCode = 1;
