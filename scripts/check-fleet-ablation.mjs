import assert from 'node:assert/strict';
import { loadCombatLab } from './ai/load-combat-lab.mjs';
import { ablationCases, freezeAblationModel, runAblationBattle, compareAblationModes, summarizeAblation } from './ai/fleet-ablation.mjs';

const lab = await loadCombatLab();
let passed = 0;
const test = (name, check) => { check(); console.log(`ok ${++passed} - ${name}`); };
const make = (side = 0, seconds = 2) => new lab.FleetCombatLab(lab.FLEET_SCENARIOS.train[0], 1731, side, seconds);

test('ablation schedule is deterministic, mirrored, balanced across development scenarios, and never uses holdout', () => {
  const plan = ablationCases(lab, 4, 20261001);
  assert.deepEqual(plan, ablationCases(lab, 4, 20261001));
  assert.equal(plan.length, 24);
  for (const split of ['train', 'validation']) for (const scenario of lab.FLEET_SCENARIOS[split]) {
    const entries = plan.filter(p => p.scenario.id === scenario.id);
    assert.equal(entries.length, 4);
    assert.equal(new Set(entries.map(p => p.seed)).size, 4);
  }
  const previousSeeds = new Set();
  for (const split of ['train', 'validation', 'holdout']) for (let i = 0; i < 32; i++) previousSeeds.add(lab.fleetCase(split, i, 20260918).seed);
  for (const entry of plan) {
    assert.deepEqual(entry.sides, [0, 1]); assert.notEqual(entry.split, 'holdout');
    assert.ok(!previousSeeds.has(entry.seed), 'Default diagnostic seeds must not reuse the preceding pilot');
  }
  for (const n of [0, -1, 1.5, 1001]) assert.throws(() => ablationCases(lab, n, 7));
});
test('fixed controllers actually reach the learning interface on both sides; opponents stay BALANCED', () => {
  for (const side of [0, 1]) for (const action of lab.POLICY_ACTIONS) {
    const env = make(side), result = runAblationBattle(lab, env, { action });
    assert.equal(result.requestedActions[action], result.decisions);
    assert.ok(result.eligibleActionsAtDecision[action] > 0);
    assert.equal(result.nonBaselineDecisions, action === 'BALANCED' ? 0 : result.eligibleActionsAtDecision[action]);
    for (const ship of env.opponents) assert.equal(lab.shipPolicyAction(ship), 'BALANCED');
    for (const other of lab.POLICY_ACTIONS.filter(a => a !== action)) assert.equal(result.requestedActions[other], 0);
  }
  assert.throws(() => runAblationBattle(lab, make(), { action: 'INVALID' }));
});
test('BALANCED reproduces the direct baseline and is physically identical regardless of diagnostic learner side', () => {
  const a = runAblationBattle(lab, make(0), { action: 'BALANCED' });
  const b = runAblationBattle(lab, make(1), { action: 'BALANCED' });
  assert.deepEqual(a.checksum, b.checksum);
  const direct = make(0);
  while (!direct.done) direct.step(new Map(direct.observations().map(o => [o.ship.id, 'BALANCED'])));
  assert.deepEqual(a.checksum, direct.summary().checksum);
});
test('eligible telemetry records contact-guard fallback instead of crediting unexecuted mode requests', () => {
  const env = make(0, 1);
  for (const ship of env.learners) ship.currentTargetShip = null;
  const result = runAblationBattle(lab, env, { action: 'FINISH' });
  assert.equal(result.nonBaselineDecisions, 0);
  assert.equal(result.guardFallbackDecisions, result.decisions);
  assert.equal(result.eligibleActionsAtDecision.BALANCED, result.decisions);
});
test('the optional model is cloned, validated, deeply frozen, and evaluated without updating Q', () => {
  const source = lab.emptyCombatPolicy();
  const state = make().observations()[0].state;
  source.rows[state] = { q: [0, 1, 0, 0], visits: [20, 20, 20, 20] };
  const before = JSON.stringify(source), model = freezeAblationModel(lab, source), frozenBefore = JSON.stringify(model);
  assert.equal(source.enabled, false); assert.equal(model.enabled, true);
  assert.throws(() => { model.rows[state].q[1] = 5; });
  assert.throws(() => freezeAblationModel(lab, { ...source, version: 1 }));
  const result = runAblationBattle(lab, make(), { model });
  assert.ok(result.requestedActions.PRESSURE > 0);
  assert.equal(JSON.stringify(model), frozenBefore); assert.equal(JSON.stringify(source), before);
});
test('controller order cannot leak learned or forced actions into another encounter', () => {
  const first = runAblationBattle(lab, make(), { action: 'CAUTIOUS' });
  runAblationBattle(lab, make(), { action: 'PRESSURE' });
  assert.deepEqual(runAblationBattle(lab, make(), { action: 'CAUTIOUS' }), first);
});
const counters = { BALANCED: 0, PRESSURE: 0, FINISH: 0, CAUTIOUS: 0 };
const result = (scenario, seed, side, outcome, score) => ({ scenario, seed, learnerTeam: side, outcome, score,
  ownHull: .5, enemyHull: .5, reward: 0, nonBaselineDecisions: 0, seconds: 2, overloadSeconds: 0,
  blockedWeaponSeconds: 0, guardFallbackDecisions: 0, requestedActions: { ...counters }, eligibleActionsAtDecision: { ...counters } });
const synthetic = ['train', 'validation'].flatMap(split => Array.from({ length: 4 }, (_, seed) => ({ split, scenario: split, seed,
  matches: [0, 1].map(side => ({ side, runs: { BALANCED: result(split, seed, side, 'loss', 0),
    PRESSURE: result(split, seed, side, 'win', 1) } })) })));
test('comparison counts mirrored pairs, preserves timeouts, and yields zero for baseline compared with itself', () => {
  const stats = summarizeAblation(lab, synthetic, ['BALANCED', 'PRESSURE'], 4);
  assert.equal(stats.versusBalanced.PRESSURE.mirrorPairs, 8);
  assert.equal(stats.versusBalanced.PRESSURE.battles, 16);
  assert.deepEqual(stats.versusBalanced.PRESSURE.scoreGain95Interval, [1, 1]);
  assert.deepEqual(stats.versusBalanced.BALANCED.scoreGain95Interval, [0, 0]);
  assert.equal(stats.byScenario.train.PRESSURE.battles, 8);
  const timeouts = structuredClone(synthetic);
  for (const pair of timeouts) for (const match of pair.matches) Object.assign(match.runs.PRESSURE, { outcome: 'timeout', score: .5 });
  const summary = compareAblationModes(timeouts, 'PRESSURE', 'BALANCED', new lab.SimulationRandom(1));
  assert.equal(summary.candidate.win, 0); assert.equal(summary.candidate.timeout, 16); assert.equal(summary.meanScoreGain, .5);
});
test('unpaired, duplicate-side, missing-controller, and mismatched-seed evidence is rejected', () => {
  const bad = structuredClone(synthetic);
  bad[0].matches.pop(); assert.throws(() => compareAblationModes(bad, 'PRESSURE', 'BALANCED', new lab.SimulationRandom(1)));
  bad[0] = structuredClone(synthetic[0]); bad[0].matches[1].side = 0;
  assert.throws(() => compareAblationModes(bad, 'PRESSURE', 'BALANCED', new lab.SimulationRandom(1)));
  bad[0] = structuredClone(synthetic[0]); bad[0].matches[1].runs.PRESSURE.seed = 999;
  assert.throws(() => compareAblationModes(bad, 'PRESSURE', 'BALANCED', new lab.SimulationRandom(1)));
  assert.throws(() => compareAblationModes(synthetic, 'UNKNOWN', 'BALANCED', new lab.SimulationRandom(1)));
});
console.log(`PASS ${passed} fleet-ablation checks`);
