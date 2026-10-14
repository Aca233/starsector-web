import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

// Reuse the existing threat-phase seed 917, two-player/20-AI mixed roster. This is
// a development bundle only, with the numeric decision opt-in explicitly on.
const out = path.resolve(process.env.STAGE_BOUNDARY_OUT ?? 'artifacts/foundation-stage-boundaries-20261008');
fs.mkdirSync(out, { recursive: true });
const entry = `
export { assets, world } from './scripts/lib/native-projectile-fixture.mts';
export { createLanWorld } from './src/network/LanWorld';
export { captureCombat } from './src/network/AuthorityCombatSnapshot';
export { FireControlQueryRoster } from './src/engine/ai/FireControlQueryBatch';
export { enableWorkerOwnedPhaseReads } from './src/engine/simulation/Ship';
export { beginStage, readStageCoverage } from './src/engine/ai/batch/StageProducer';
export { aiDomainWork } from './src/engine/ai/batch/AIWork';
export { aiStage, assertAIStage } from './src/engine/ai/batch/AIInputs';
export { solveAIHostile } from './src/engine/ai/batch/AITargetSolver';
export { publishFireInputs, assertFireInputs } from './src/engine/ai/batch/FireInputs';
export { FireProgram } from './src/engine/ai/batch/FireProgram';
export { ContactKernel } from './src/engine/ai/batch/ContactKernel';
`;
const after = path.join(out, 'after.mjs');
await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' }, outfile: after,
  bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'warning',
  plugins: [{ name: 'vite-raw-text', setup(builder) {
    builder.onResolve({ filter: /\?raw$/ }, args => ({ path: path.resolve(args.resolveDir, args.path.replace(/\?raw$/, '')), namespace: 'raw-text' }));
    builder.onLoad({ filter: /.*/, namespace: 'raw-text' }, args => ({ contents: fs.readFileSync(args.path, 'utf8'), loader: 'text' }));
  } }],
  define: { __LAN_BUILD_ID__: '"stage-boundary-check"', 'import.meta.env': JSON.stringify({
    BASE_URL: '/', DEV: false, VITE_LAN_AI_WORKERS: 'false', VITE_COMBAT_NUMERIC_DECISION_CORE: 'true'
  }) } });
const api = await import(pathToFileURL(after).href);
await api.assets();
api.enableWorkerOwnedPhaseReads();
function create(module) {
  const hulls = ['web_zhuyuan', 'web_gloriana', 'web_sc2_hyperion'];
  const fleet = Array.from({ length: 20 }, (_, index) => hulls[index % 3]);
  const { engine } = module.createLanWorld({ id: 'stage-boundary', seed: 917, hostId: 'p0', snapshotHz: 60,
    players: [{ id: 'p0', seat: 0, team: 0, hull: hulls[0] }, { id: 'p1', seat: 1, team: 1, hull: hulls[0] }],
    options: { assignment: 'teams', aiDecisionProfile: 'standard', battleSize: 3200, deploymentLimit: 1600,
      aiHulls: [fleet.slice(0, 10), fleet.slice(10)] } });
  module.FireControlQueryRoster.ownForWorker(engine);
  for (const ship of engine.allCapitalShips) {
    ship.pos.scale(.2); ship.prevPos.copy(ship.pos); ship.fireControlMode = 'AI';
  }
  return engine;
}
const engine = create(api);
const sources = { ships: engine.ships, projectiles: engine.projectiles, beams: engine.beams };
const plan = api.aiStage(api.beginStage(engine, 'AI_PLAN', sources));
assert.ok(plan, 'real producer must admit AI stage');
api.solveAIHostile(plan, 0);
plan.invalidate();
assert.throws(() => api.solveAIHostile(plan, 0), /live valid stage/);
plan.recapture(); api.solveAIHostile(plan, 0);
plan.close();
assert.throws(() => api.solveAIHostile(plan, 0), /live valid stage/);
const fire = api.beginStage(engine, 'FIRE_QUERY', sources);
assert.ok(fire);
assert.throws(() => api.assertAIStage(fire), /AI stage/);
const world = { ships: engine.ships, missiles: [], asteroids: engine.asteroids };
const supplement = api.publishFireInputs(fire, world);
api.assertFireInputs(fire, supplement);
const program = new api.FireProgram();
const coverage = { numericMounts: 0, genericMounts: 0, specialForceMounts: 0, customBudgetCalls: 0, stageEpoch: fire.epoch };
program.bind(fire, supplement, new Uint8Array(fire.bodyCount).fill(1), new Uint8Array(), 0, false, true, coverage);
program.configureMount(0, 1 / 60);
fire.refreshChanged([fire.ships[0]]);
assert.throws(() => program.configureMount(0, 1 / 60), /supplement expired/);
api.publishFireInputs(fire, world); program.configureMount(0, 1 / 60);
fire.close();
assert.throws(() => program.configureMount(0, 1 / 60), /live valid stage/);
const kernel = new api.ContactKernel();
const contact = api.beginStage(engine, 'PROJECTILE_CONTACT', sources);
assert.ok(contact);
assert.throws(() => kernel.findHit(contact, 0), /published projectile row/);
assert.throws(() => kernel.findHit({ ...contact, kind: 'FIRE_QUERY' }, 0), /PROJECTILE_CONTACT/);
contact.close();
assert.throws(() => kernel.findHit(contact, 0), /live valid stage/);
console.log('Stage lifecycle, phase kind, publication revision and contact row contracts passed');

const baseline = process.env.STAGE_BOUNDARY_BASELINE;
const modules = { after: api };
if (baseline) {
  modules.before = await import(pathToFileURL(path.resolve(baseline)).href);
  await modules.before.assets(); modules.before.enableWorkerOwnedPhaseReads();
}
const capture = (module, state, tick) => JSON.stringify([
  module.captureCombat(state, tick, { 0: tick, 1: tick }, 0, true, true, true, true, true),
  state.random, state.visualRandom
]);
const expected = new Map();
const results = [];
for (const arm of baseline ? ['before', 'after', 'after', 'before'] : ['after']) {
  const module = modules[arm], state = create(module), steps = [];
  let maxProjectiles = 0, maxBeams = 0, numericFire = 0;
  const aiBefore = module.aiDomainWork.plans;
  for (let tick = 1; tick <= 270; tick++) {
    const start = performance.now(); state.fixedUpdate(1 / 60);
    if (tick > 30) steps.push(performance.now() - start);
    maxProjectiles = Math.max(maxProjectiles, state.projectiles.length);
    maxBeams = Math.max(maxBeams, state.beams.length);
    numericFire += state.ships.reduce((n, ship) => n + (ship.weaponControl.actualFireCoverage?.numericMounts ?? 0), 0);
    if (tick % 30) continue;
    const full = capture(module, state, tick);
    if (!expected.has(tick)) expected.set(tick, full);
    else assert.equal(full, expected.get(tick), 'complete snapshot and RNG at tick ' + tick);
  }
  const stages = module.readStageCoverage(state), contacts = { ...state.weaponSystem.collisionHandler.actualCoverage };
  assert.ok(module.aiDomainWork.plans > aiBefore && numericFire > 0 && contacts.numericQueries > 0,
    'actual complete step must execute all three numeric domains');
  assert.ok(maxProjectiles > 30, 'fixture must include real launched projectiles');
  steps.sort((a, b) => a - b);
  const row = { arm, ticks: 270, measuredSteps: steps.length, meanMs: steps.reduce((a, b) => a + b, 0) / steps.length,
    p95Ms: steps[Math.floor(steps.length * .95)], maxProjectiles, maxBeams,
    numericAIPlans: module.aiDomainWork.plans - aiBefore, numericFire, contacts, stages };
  results.push(row);
  console.log(JSON.stringify({ arm, meanMs: row.meanMs, p95Ms: row.p95Ms, maxProjectiles, numericFire, numericContacts: contacts.numericQueries }));
}
fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ baseline: baseline ?? null,
  scenario: 'existing threat-phase mixed roster seed 917, 22 capital ships, positions scaled .2',
  comparison: 'same numeric opt-in and fixed 60 Hz; full snapshot/RNG every 30 ticks; entire fixedUpdate timing after 30 warmup ticks', results }, null, 2));
console.log('Complete stage consumer scenario passed; report: ' + path.join(out, 'result.json'));
