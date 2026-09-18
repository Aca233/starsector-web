import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadCombatLab } from './ai/load-combat-lab.mjs';
import { runAblationBattle } from './ai/fleet-ablation.mjs';
import { splitComponentBundle, componentHash, componentContrast, observationContext, ObservationContextAudit } from './ai/fleet-components.mjs';

const full = await loadCombatLab(), source = await readFile(`artifacts/ai/combat-lab-${process.pid}.mjs`, 'utf8');
const variants = splitComponentBundle(source, full.POLICY_TUNING), labs = { FULL: full };
// Windows may reuse a PID while prior evidence is still present. Never delete it.
const directory = await mkdtemp(path.resolve('artifacts/ai/component-check-'));
for (const key of ['RANGE', 'TARGET']) {
  const file = path.join(directory, `${key}.mjs`);
  await writeFile(file, variants[key].source);
  labs[key] = await import(pathToFileURL(file).href);
}
let passed = 0;
const test = (name, fn) => { fn(); console.log(`ok ${++passed} - ${name}`); };
const make = (lab, side = 0, seconds = 2) => new lab.FleetCombatLab(lab.FLEET_SCENARIOS.train[0], 9171, side, seconds);

test('bundle surgery preserves every byte outside one verified constant table and keeps FULL exact', () => {
  assert.equal(componentHash(variants.FULL.source), full.engineBundleSha256);
  assert.equal(new Set(Object.values(variants).map(v => v.neutralizedBodySha256)).size, 1);
  assert.deepEqual(labs.FULL.POLICY_TUNING, variants.FULL.tuning);
  assert.deepEqual(labs.RANGE.POLICY_TUNING, variants.RANGE.tuning);
  assert.deepEqual(labs.TARGET.POLICY_TUNING, variants.TARGET.tuning);
  const declaration = source.match(/var POLICY_TUNING = Object\.freeze\(\{\r?\n[\s\S]*?\r?\n\}\);/)[0];
  assert.throws(() => splitComponentBundle(source + '\n' + declaration, full.POLICY_TUNING));
  assert.throws(() => splitComponentBundle(source.replace('var POLICY_TUNING =', 'var RENAMED_TUNING ='), full.POLICY_TUNING));
  assert.throws(() => splitComponentBundle(source, { ...full.POLICY_TUNING, PRESSURE: { range: 2, pressure: 1.6, finish: .8 } }));
});
test('RANGE changes actual engagement distance but cannot change target utility; TARGET does the reverse', () => {
  for (const [key, lab] of Object.entries(labs)) {
    const env = make(lab), ship = env.learners[0], target = ship.currentTargetShip;
    target.flux.softFlux = target.flux.maxFlux * .5; target.hullHp *= .5;
    const mount = ship.weapons[0];
    lab.setTrainingAction(ship, 'BALANCED');
    const baseRange = lab.fleetEngagementRange(ship, target, 900);
    const baseUtility = lab.fireTargetUtility(ship, mount, target, true, false, 0, 0, 'BALANCED');
    for (const action of ['PRESSURE', 'FINISH', 'CAUTIOUS']) {
      lab.setTrainingAction(ship, action);
      const range = lab.fleetEngagementRange(ship, target, 900);
      const utility = lab.fireTargetUtility(ship, mount, target, true, false, 0, 0, action);
      if (key === 'TARGET') assert.equal(range, baseRange); else assert.notEqual(range, baseRange);
      if (key === 'RANGE') assert.equal(utility, baseUtility); else assert.notEqual(utility, baseUtility);
    }
  }
});
test('all bundles keep neutral physical trajectories, legal targeting and opposing controls unchanged on both sides', () => {
  for (const side of [0, 1]) {
    const baseline = runAblationBattle(full, make(full, side), { action: 'BALANCED' });
    for (const lab of [labs.RANGE, labs.TARGET]) {
      assert.deepEqual(runAblationBattle(lab, make(lab, side), { action: 'BALANCED' }), baseline);
      const env = make(lab, side);
      runAblationBattle(lab, env, { action: 'PRESSURE' });
      for (const opponent of env.opponents) assert.equal(lab.shipPolicyAction(opponent), 'BALANCED');
      const own = env.learners[0], target = own.currentTargetShip;
      target.visibilityMask = 0; assert.equal(lab.shipPolicyAction(own), 'BALANCED');
    }
  }
});
test('range isolation still respects emergency reserve, clearance and carrier station', () => {
  const lab = labs.RANGE, env = make(lab), ship = env.learners[0], target = ship.currentTargetShip;
  const clearance = ship.spec.collisionRadius + target.spec.collisionRadius + 8;
  for (const action of lab.POLICY_ACTIONS) {
    lab.setTrainingAction(ship, action);
    assert.ok(lab.fleetEngagementRange(ship, target, 10) >= clearance);
    assert.equal(lab.fleetEngagementRange(ship, target, 900, { role: 'CARRIER', carrierRange: 1800 }), 1800);
  }
  ship.flux.softFlux = ship.flux.maxFlux * .9;
  lab.setTrainingAction(ship, 'BALANCED'); const baseline = lab.fleetEngagementRange(ship, target, 900);
  lab.setTrainingAction(ship, 'PRESSURE'); assert.equal(lab.fleetEngagementRange(ship, target, 900), baseline);
});
test('descriptive observation hooks leave baseline rewards and complete trajectories unchanged', () => {
  const before = runAblationBattle(full, make(full, 1, 4), { action: 'BALANCED' });
  const audit = new ObservationContextAudit();
  const after = runAblationBattle(full, make(full, 1, 4), { action: 'BALANCED' }, ({ ship, state }) =>
    audit.add(state, observationContext(full, ship, state), 'test'));
  assert.deepEqual(after, before);
  const summary = audit.summary();
  assert.equal(summary.eligibleDecisions + summary.noContactDecisions, after.decisions);
  assert.ok(summary.statesObserved > 0);
  for (const row of Object.values(audit.states)) {
    assert.ok(row.features.role); assert.ok(row.features.ownRangeBand); assert.ok(row.features.contactRangeBand);
  }
});
test('context collection ignores missing or hidden contacts and never reads target weapons', () => {
  assert.equal(observationContext(full, new Proxy({}, { get() { throw Error('No contact must not be read'); } }), null), null);
  const env = make(full), ship = env.learners[0], target = ship.currentTargetShip;
  const state = full.combatObservation(ship, target);
  const before = observationContext(full, ship, state);
  Object.defineProperty(target, 'weapons', { get() { throw Error('Enemy loadout is not an observation'); } });
  assert.deepEqual(observationContext(full, ship, state), before);
  target.visibilityMask = 0;
  const hidden = full.combatObservation(ship, target);
  assert.equal(hidden, null); assert.equal(observationContext(full, ship, hidden), null);
});
test('aliasing audit distinguishes states from correlated decision counts and handles null observations', () => {
  const audit = new ObservationContextAudit();
  audit.add(7, { role: 'LINE', ownRangeBand: 'SHORT' }, 'a');
  audit.add(7, { role: 'LINE', ownRangeBand: 'SHORT' }, 'a');
  audit.add(7, { role: 'SKIRMISHER', ownRangeBand: 'LONG' }, 'b');
  audit.add(8, { role: 'LINE', ownRangeBand: 'SHORT' }, 'a');
  audit.add(null, null, 'a');
  const summary = audit.summary();
  assert.equal(summary.statesObserved, 2); assert.equal(summary.eligibleDecisions, 4); assert.equal(summary.noContactDecisions, 1);
  assert.deepEqual(summary.dimensions.role, { statesWithMultipleContexts: 1, decisionsInThoseStates: 3 });
});
test('factorial interaction is paired across both sides and rejects missing or mismatched evidence', () => {
  const pairs = Array.from({ length: 4 }, (_, seed) => ({ scenario: 'test', seed, matches: [0, 1].map(side => ({ side,
    runs: Object.fromEntries([['BALANCED', 0], ['RANGE', .5], ['TARGET', .5], ['FULL', 1]].map(([mode, score]) =>
      [mode, { scenario: 'test', seed, learnerTeam: side, score, ownHull: score, enemyHull: 0 }])) })) }));
  const coefficients = { FULL: 1, RANGE: -1, TARGET: -1, BALANCED: 1 };
  const result = componentContrast(pairs, coefficients, new full.SimulationRandom(9));
  assert.equal(result.mirrorPairs, 4); assert.equal(result.meanScoreEffect, 0); assert.deepEqual(result.scoreEffect95Interval, [0, 0]);
  for (const pair of pairs) for (const match of pair.matches) match.runs.FULL.score = .5;
  assert.deepEqual(componentContrast(pairs, coefficients, new full.SimulationRandom(9)).scoreEffect95Interval, [-.5, -.5]);
  assert.throws(() => componentContrast(pairs, { MISSING: 1 }, new full.SimulationRandom(9)));
  pairs[0].matches[0].runs.FULL.seed = 99;
  assert.throws(() => componentContrast(pairs, coefficients, new full.SimulationRandom(9)));
});
console.log(`PASS ${passed} component-ablation checks`);
