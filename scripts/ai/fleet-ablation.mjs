import assert from 'node:assert/strict';
import { summarizeFleetEvaluation } from './fleet-evaluation.mjs';

/** Development diagnostics only: never consume or select against the holdout split. */
export function ablationCases(lab, pairsPerScenario, seed) {
  assert.ok(Number.isInteger(pairsPerScenario) && pairsPerScenario >= 1 && pairsPerScenario <= 1000);
  assert.ok(Number.isInteger(seed) && seed >= 0 && seed <= 0x3fffffff - 3000);
  return ['train', 'validation'].flatMap(split =>
    Array.from({ length: lab.FLEET_SCENARIOS[split].length * pairsPerScenario }, (_, index) => {
      const entry = lab.fleetCase(split, index, seed);
      return { split, scenario: entry.scenario, seed: entry.seed, sides: [0, 1] };
    }));
}

export function freezeAblationModel(lab, input) {
  assert.ok(lab.validateCombatPolicy(input), 'Incompatible or invalid model');
  const model = structuredClone(input);
  // An experimental candidate may be packaged disabled; enable only this isolated clone.
  model.enabled = true;
  Object.freeze(model.actions);
  for (const row of Object.values(model.rows)) {
    Object.freeze(row.q); Object.freeze(row.visits); Object.freeze(row);
  }
  Object.freeze(model.rows);
  return Object.freeze(model);
}

export function runAblationBattle(lab, env, controller, onDecision) {
  assert.ok(controller.model ? !controller.action : lab.POLICY_ACTIONS.includes(controller.action), 'Choose one valid controller');
  let reward = 0, decisions = 0, nonBaselineDecisions = 0, guardFallbackDecisions = 0;
  const requestedActions = Object.fromEntries(lab.POLICY_ACTIONS.map(a => [a, 0]));
  const eligibleActionsAtDecision = { ...requestedActions };
  const statesAtDecision = {};
  while (!env.done) {
    const actions = new Map();
    for (const { ship, state } of env.observations()) {
      const requested = controller.model ? lab.policyAction(controller.model, state) : controller.action;
      actions.set(ship.id, requested);
      // Sample the same AI/contact guard used by the actual controller, not just intent.
      lab.setTrainingAction(ship, requested);
      const eligible = lab.shipPolicyAction(ship);
      onDecision?.({ ship, state, requested, eligible });
      requestedActions[requested]++; eligibleActionsAtDecision[eligible]++; decisions++;
      if (eligible !== 'BALANCED') nonBaselineDecisions++;
      if (eligible !== requested) guardFallbackDecisions++;
      const key = state === null ? 'no-contact' : String(state);
      statesAtDecision[key] = (statesAtDecision[key] ?? 0) + 1;
    }
    reward += env.step(actions).reward;
  }
  const result = { ...env.summary(), reward, decisions, nonBaselineDecisions, guardFallbackDecisions,
    requestedActions, eligibleActionsAtDecision, statesAtDecision };
  assert.ok(result.checksum.every(Number.isFinite), 'Nonfinite trajectory');
  for (const key of ['score', 'ownHull', 'enemyHull', 'reward', 'seconds', 'overloadSeconds', 'blockedWeaponSeconds'])
    assert.ok(Number.isFinite(result[key]), `Nonfinite ${key}`);
  return result;
}

const mean = values => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
export function compareAblationModes(pairs, candidateMode, baselineMode, random) {
  assert.ok(pairs.length > 0, 'No comparison pairs');
  const prepared = pairs.map(pair => {
    assert.equal(pair.matches.length, 2, 'Each statistical unit must include both learner sides');
    assert.deepEqual(pair.matches.map(m => m.side).sort(), [0, 1]);
    return { scenario: pair.scenario, seed: pair.seed, matches: pair.matches.map(match => {
      const candidate = match.runs[candidateMode], baseline = match.runs[baselineMode];
      assert.ok(candidate && baseline, 'Missing paired controller');
      for (const run of [candidate, baseline]) {
        assert.equal(run.scenario, pair.scenario); assert.equal(run.seed, pair.seed);
        assert.equal(run.learnerTeam, match.side);
      }
      return { candidate, baseline };
    }) };
  });
  const summary = summarizeFleetEvaluation(prepared, random);
  const matches = prepared.flatMap(p => p.matches);
  return { ...summary, candidateMode, baselineMode,
    meanDurationDelta: mean(matches.map(m => m.candidate.seconds - m.baseline.seconds)),
    meanOverloadDelta: mean(matches.map(m => m.candidate.overloadSeconds - m.baseline.overloadSeconds)),
    meanBlockedWeaponDelta: mean(matches.map(m => m.candidate.blockedWeaponSeconds - m.baseline.blockedWeaponSeconds)),
    requestedActions: Object.fromEntries(Object.keys(matches[0].candidate.requestedActions).map(action =>
      [action, matches.reduce((n, m) => n + m.candidate.requestedActions[action], 0)])),
    eligibleActionsAtDecision: Object.fromEntries(Object.keys(matches[0].candidate.eligibleActionsAtDecision).map(action =>
      [action, matches.reduce((n, m) => n + m.candidate.eligibleActionsAtDecision[action], 0)])),
    guardFallbackDecisions: matches.reduce((n, m) => n + m.candidate.guardFallbackDecisions, 0) };
}

export function summarizeAblation(lab, pairs, modes, seed) {
  const compare = (group, candidate, baseline) => compareAblationModes(group, candidate, baseline, new lab.SimulationRandom(seed ^ 0x4193));
  const versusBalanced = Object.fromEntries(modes.map(mode => [mode, compare(pairs, mode, 'BALANCED')]));
  const byScenario = Object.fromEntries([...new Set(pairs.map(p => p.scenario))].map(scenario =>
    [scenario, Object.fromEntries(modes.map(mode => [mode, compare(pairs.filter(p => p.scenario === scenario), mode, 'BALANCED')]))]));
  const bySplit = Object.fromEntries(['train', 'validation'].map(split =>
    [split, Object.fromEntries(modes.map(mode => [mode, compare(pairs.filter(p => p.split === split), mode, 'BALANCED')]))]));
  const learnedVsFixed = modes.includes('LEARNED') ? Object.fromEntries(lab.POLICY_ACTIONS.map(mode => [mode, compare(pairs, 'LEARNED', mode)])) : null;
  return { versusBalanced, byScenario, bySplit, learnedVsFixed };
}
