import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { loadCombatLab } from './ai/load-combat-lab.mjs';
import { splitComponentBundle } from './ai/fleet-components.mjs';
import { emptyDistancePolicy, validateDistancePolicy, freezeDistancePolicy, distanceState, distanceAction, distanceObservations,
  updateDistanceTarget, distanceTrainingUpdates, assertDistanceExecutor, runDistanceBattle } from './ai/distance-policy.mjs';
import { DISTANCE_SCENARIOS, distanceCases, crossedInterval, summarizeDistanceStudy, distanceStudyGate } from './ai/distance-study.mjs';
import { summarizeFleetEvaluation } from './ai/fleet-evaluation.mjs';

const original = await loadCombatLab(), source = await readFile(original.engineBundlePath, 'utf8');
const folder = path.resolve(`artifacts/ai/distance-check-${process.pid}`); await mkdir(folder);
const file = path.join(folder, 'range.mjs'); await writeFile(file, splitComponentBundle(source, original.POLICY_TUNING).RANGE.source);
const lab = await import(pathToFileURL(file).href);
let passed = 0;
const test = (name, fn) => { fn(); console.log(`ok ${++passed} - ${name}`); };
const make = (side = 0, seconds = 2) => new lab.FleetCombatLab(DISTANCE_SCENARIOS.train[0], 8291, side, seconds);

test('distance policy schema rejects legacy, malformed, nonfinite and incompatible feature tables', () => {
  for (const mode of ['WITH_RANGE', 'WITHOUT_RANGE']) {
    const p = emptyDistancePolicy(mode); assert.ok(validateDistancePolicy(p));
    p.rows[0] = { q: [0, 1, 0], visits: [8, 8, 8] }; assert.ok(validateDistancePolicy(p));
    assert.equal(validateDistancePolicy({ ...p, actions: ['BALANCED', 'PRESSURE', 'FINISH', 'CAUTIOUS'] }), false);
    assert.equal(validateDistancePolicy({ ...p, rows: { [p.states]: p.rows[0] } }), false);
    p.rows[0].q[0] = NaN; assert.equal(validateDistancePolicy(p), false);
  }
  assert.equal(validateDistancePolicy(original.emptyCombatPolicy()), false);
  assert.throws(() => emptyDistancePolicy('UNKNOWN'));
});
test('explicit range is the only encoded-feature difference, has bounded bins and preserves compact base state', () => {
  const target = { pos: new lab.Vector2() }, ship = { pos: new lab.Vector2(300, 0), currentTargetShip: target };
  for (let base = 0; base < 324; base++) {
    const view = { combatObservation: () => base, combatProfile: () => ({ range: 500 }) };
    const without = distanceState(view, ship, base, 'WITHOUT_RANGE');
    assert.ok(without >= 0 && without < 54);
    for (const [distance, bin] of [[300, 0], [400, 1], [550, 1], [600, 2]]) {
      ship.pos.set(distance, 0);
      assert.equal(distanceState(view, ship, base, 'WITH_RANGE'), without * 3 + bin);
    }
  }
});
test('no-contact observations read nothing and visible-range observation never reads enemy weapons', () => {
  assert.equal(distanceState(lab, new Proxy({}, { get() { throw Error('No contact'); } }), null, 'WITH_RANGE'), null);
  const env = make(), ship = env.learners[0], target = ship.currentTargetShip, state = lab.combatObservation(ship, target);
  const before = distanceState(lab, ship, state, 'WITH_RANGE');
  Object.defineProperty(target, 'weapons', { get() { throw Error('Hidden loadout'); } });
  assert.equal(distanceState(lab, ship, state, 'WITH_RANGE'), before);
  target.visibilityMask = 0; assert.equal(distanceState(lab, ship, state, 'WITH_RANGE'), null);
});
test('sparse, unsupported, disabled and tied models fall back; frozen evaluation clones cannot update Q', () => {
  const p = emptyDistancePolicy('WITH_RANGE'); p.rows[0] = { q: [0, 1, 0], visits: [8, 8, 8] };
  assert.equal(distanceAction(p, 0), 'BALANCED'); p.enabled = true;
  assert.equal(distanceAction(p, 0), 'CLOSE'); assert.equal(distanceAction(p, null), 'BALANCED');
  p.rows[0].visits[0] = 7; assert.equal(distanceAction(p, 0), 'BALANCED');
  p.rows[0].visits[0] = 8; p.rows[0].q[1] = .02; assert.equal(distanceAction(p, 0), 'BALANCED');
  p.rows[0].q[1] = 0; assert.equal(distanceAction(p, 0), 'BALANCED');
  const frozen = freezeDistancePolicy(p); assert.throws(() => updateDistanceTarget(frozen, 0, 'CLOSE', 1));
  assert.notEqual(frozen.rows, p.rows);
});
test('team TD targets are computed before writes, average duplicate credit and stop bootstrapping dead/terminal ships', () => {
  const p = emptyDistancePolicy('WITHOUT_RANGE'); p.rows[1] = { q: [2, 0, 0], visits: [8, 8, 8] };
  const ships = [{ id: 'a' }, { id: 'b' }], observations = ships.map(ship => ({ ship, state: 0 }));
  const actions = new Map(ships.map(s => [s.id, 'CLOSE']));
  const next = { reward: 1, elapsedSeconds: 1, done: false, observations: [{ ship: ships[0], state: 1 }] };
  assert.equal(distanceTrainingUpdates(p, observations, actions, next, .5, 1), 1);
  assert.equal(p.rows[0].q[1], 1.5); assert.equal(p.rows[0].visits[1], 1);
  distanceTrainingUpdates(p, observations, actions, { ...next, done: true }, .5, 1);
  assert.equal(p.rows[0].q[1], 1); assert.equal(p.rows[0].visits[1], 2);
});
test('execution is distance-only, neutral trajectories match original AI and manual ownership rejects the current decision', () => {
  assertDistanceExecutor(lab); assert.throws(() => assertDistanceExecutor(original));
  for (const side of [0, 1]) {
    const baseline = runDistanceBattle(lab, make(side));
    const originalEnv = new original.FleetCombatLab(DISTANCE_SCENARIOS.train[0], 8291, side, 2);
    assert.deepEqual(baseline, runDistanceBattle(original, originalEnv));
  }
  // The fleet lab intentionally reassigns AI control during its next physics step.
  // Check the current manual-owned decision, not persistent manual play in this AI-only harness.
  const env = make(0, 1), p = emptyDistancePolicy('WITH_RANGE'); p.enabled = true;
  for (let state = 0; state < p.states; state++) p.rows[state] = { q: [0, 1, 0], visits: [20, 20, 20] };
  for (const ship of env.learners) ship.fireControlMode = 'MANUAL';
  const result = runDistanceBattle(lab, env, freezeDistancePolicy(p));
  assert.equal(result.nonBaselineDecisions, 0); assert.ok(result.guardFallbackDecisions > 0);
  for (const ship of env.opponents) assert.equal(lab.shipPolicyAction(ship), 'BALANCED');
});
const canonical = scenario => JSON.stringify([scenario.teams.map(team => [...team].sort().join('|')).sort(), scenario.formation]);
test('new holdout compositions and seeds are disjoint from both development splits and all old holdout cases', () => {
  const all = new Set(), seeds = new Set();
  for (const split of ['train', 'validation', 'holdout']) for (const scenario of DISTANCE_SCENARIOS[split]) {
    assert.ok(!all.has(canonical(scenario))); all.add(canonical(scenario));
  }
  const previous = new Set(Object.values(original.FLEET_SCENARIOS).flat().map(canonical));
  for (const s of DISTANCE_SCENARIOS.holdout) assert.ok(!previous.has(canonical(s)));
  for (const split of ['train', 'validation', 'holdout']) for (const entry of distanceCases(split, 100, 20261107)) {
    assert.ok(!seeds.has(entry.seed)); seeds.add(entry.seed);
  }
  for (let index = 1; index < 3; index++) for (const entry of distanceCases('train', 100, 20261107, index)) assert.ok(!seeds.has(entry.seed));
  const oldSeeds = new Set();
  for (const base of [20260918, 20261001]) for (const split of ['train', 'validation', 'holdout'])
    for (let i = 0; i < 100; i++) oldSeeds.add(original.fleetCase(split, i, base).seed);
  for (const split of ['train', 'validation', 'holdout']) for (const entry of distanceCases(split, 100, 20261107)) assert.ok(!oldSeeds.has(entry.seed));
});
test('all new scenario compositions run finite real physics and observations for both learner sides', () => {
  for (const scenario of Object.values(DISTANCE_SCENARIOS).flat()) for (const side of [0, 1]) {
    const env = new lab.FleetCombatLab(scenario, 921, side, 1);
    for (const mode of ['WITH_RANGE', 'WITHOUT_RANGE']) for (const observation of distanceObservations(lab, env, mode))
      assert.ok(observation.state === null || Number.isInteger(observation.state));
    assert.ok(runDistanceBattle(lab, env).checksum.every(Number.isFinite));
  }
});
test('crossed intervals respect seed/case units and reject jagged or nonfinite evidence', () => {
  assert.deepEqual(crossedInterval([[0, 0], [0, 0]], new lab.SimulationRandom(1)).interval95, [0, 0]);
  assert.deepEqual(crossedInterval([[1, 1], [1, 1]], new lab.SimulationRandom(1)).interval95, [1, 1]);
  const mixed = crossedInterval([[0, 0], [1, 1]], new lab.SimulationRandom(1));
  assert.equal(mixed.mean, .5); assert.deepEqual(mixed.interval95, [0, 1]);
  assert.throws(() => crossedInterval([[0], [0, 1]], new lab.SimulationRandom(1)));
});
test('feature control is paired by training seed and case, and screening rejects a feature with no established gain', () => {
  const makeRun = (side, score, caseSeed) => ({ scenario: 'synthetic', seed: caseSeed, learnerTeam: side,
    outcome: score === 1 ? 'win' : 'loss', score, ownHull: .5, enemyHull: .5, reward: 0, nonBaselineDecisions: 1 });
  const results = [];
  for (let seedIndex = 0; seedIndex < 3; seedIndex++) for (const featureMode of ['WITHOUT_RANGE', 'WITH_RANGE']) {
    const pairs = Array.from({ length: 12 }, (_, seed) => ({ scenario: 'synthetic', seed,
      matches: [0, 1].map(side => ({ side, baseline: makeRun(side, 1 - side, seed),
        candidate: makeRun(side, featureMode === 'WITH_RANGE' ? 1 : 1 - side, seed) })) }));
    results.push({ featureMode, seedIndex, pairs, summary: summarizeFleetEvaluation(pairs, new lab.SimulationRandom(1)) });
  }
  const stats = summarizeDistanceStudy(lab, results, 1);
  assert.equal(stats.WITH_RANGE.mean, .5); assert.equal(stats.rangeFeatureIncrement.mean, .5);
  assert.equal(distanceStudyGate(stats).passed, true); assert.equal(distanceStudyGate(stats).deployment, 'NOT_DEPLOYED');
  assert.equal(distanceStudyGate({ ...stats, rangeFeatureIncrement: { ...stats.rangeFeatureIncrement, interval95: [0, .5] } }).passed, false);
  results[0].pairs[0].matches[0].baseline.score = 0;
  assert.throws(() => summarizeDistanceStudy(lab, results, 1));
});
console.log(`PASS ${passed} distance-learning checks`);
