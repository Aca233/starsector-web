import assert from 'node:assert/strict';

export const DISTANCE_ACTIONS = Object.freeze(['BALANCED', 'CLOSE', 'STAND_OFF']);
export const DISTANCE_EXECUTION = Object.freeze({ BALANCED: 'BALANCED', CLOSE: 'PRESSURE', STAND_OFF: 'CAUTIOUS' });
export const DISTANCE_FEATURES = Object.freeze({
  WITHOUT_RANGE: { observation: 'flux-hull-window-pressure-v1', states: 54 },
  WITH_RANGE: { observation: 'flux-hull-window-pressure-distance-ratio-v1', states: 162 },
});
export function emptyDistancePolicy(featureMode) {
  assert.ok(Object.hasOwn(DISTANCE_FEATURES, featureMode));
  return { kind: 'distance-residual-policy', version: 1, featureMode, ...DISTANCE_FEATURES[featureMode],
    actions: [...DISTANCE_ACTIONS], rangeMultipliers: [1, .9, 1.12], enabled: false,
    minVisits: 8, minAdvantage: .03, rows: {} };
}
export function validateDistancePolicy(value) {
  if (!value || value.kind !== 'distance-residual-policy' || value.version !== 1
    || !Object.hasOwn(DISTANCE_FEATURES, value.featureMode ?? '')) return false;
  const definition = DISTANCE_FEATURES[value.featureMode];
  return value.observation === definition.observation && value.states === definition.states
    && JSON.stringify(value.actions) === JSON.stringify(DISTANCE_ACTIONS)
    && JSON.stringify(value.rangeMultipliers) === '[1,0.9,1.12]' && typeof value.enabled === 'boolean'
    && Number.isInteger(value.minVisits) && value.minVisits >= 8 && value.minVisits <= 1e9
    && Number.isFinite(value.minAdvantage) && value.minAdvantage >= .03 && value.minAdvantage <= 100
    && !!value.rows && typeof value.rows === 'object' && !Array.isArray(value.rows)
    && Object.entries(value.rows).every(([key, row]) => /^(0|[1-9]\d*)$/.test(key) && Number(key) < definition.states
      && row && Array.isArray(row.q) && row.q.length === 3 && row.q.every(q => Number.isFinite(q) && Math.abs(q) <= 1000)
      && Array.isArray(row.visits) && row.visits.length === 3 && row.visits.every(n => Number.isInteger(n) && n >= 0 && n <= 1e9));
}
export function freezeDistancePolicy(input) {
  assert.ok(validateDistancePolicy(input), 'Invalid or incompatible distance policy');
  const model = structuredClone(input); model.enabled = true;
  Object.freeze(model.actions); Object.freeze(model.rangeMultipliers);
  for (const row of Object.values(model.rows)) { Object.freeze(row.q); Object.freeze(row.visits); Object.freeze(row); }
  Object.freeze(model.rows); return Object.freeze(model);
}
/** Keep only flux/hull/visible target window/visible local pressure from v2.
 * No identity, role, target loadout or held-out labels. The controlled ablation adds ONE ratio bin. */
export function distanceState(lab, ship, originalState, featureMode) {
  assert.ok(Object.hasOwn(DISTANCE_FEATURES, featureMode));
  if (originalState === null) return null;
  assert.ok(Number.isInteger(originalState) && originalState >= 0 && originalState < 324);
  if (lab.combatObservation(ship, ship.currentTargetShip) !== originalState) return null;
  const pressure = originalState % 3, window = Math.floor(originalState / 18) % 3;
  const hull = Math.floor(originalState / 54) % 2, flux = Math.floor(originalState / 108);
  const compact = ((flux * 2 + hull) * 3 + window) * 3 + pressure;
  if (featureMode === 'WITHOUT_RANGE') return compact;
  const range = lab.combatProfile(ship, ship.currentTargetShip).range;
  const ratio = ship.pos.distanceTo(ship.currentTargetShip.pos) / range;
  if (!(range > 0) || !Number.isFinite(ratio)) return null;
  return compact * 3 + (ratio < .8 ? 0 : ratio <= 1.1 ? 1 : 2);
}
export function distanceObservations(lab, env, featureMode) {
  return env.observations().map(({ ship, state }) => ({ ship, state: distanceState(lab, ship, state, featureMode) }));
}
export function distanceAction(policy, state) {
  if (!policy.enabled || state === null) return 'BALANCED';
  const row = policy.rows[state];
  if (!row || row.visits[0] < policy.minVisits) return 'BALANCED';
  let best = 0;
  for (let i = 1; i < 3; i++) if (row.visits[i] >= policy.minVisits && row.q[i] > row.q[best] + 1e-9) best = i;
  return best && row.q[best] - row.q[0] >= policy.minAdvantage ? DISTANCE_ACTIONS[best] : 'BALANCED';
}
export function updateDistanceTarget(policy, state, action, target, alpha = .12) {
  assert.ok(Number.isInteger(state) && state >= 0 && state < policy.states);
  assert.ok(DISTANCE_ACTIONS.includes(action) && Number.isFinite(target) && alpha > 0 && alpha <= 1);
  const row = policy.rows[state] ??= { q: [0, 0, 0], visits: [0, 0, 0] }, index = DISTANCE_ACTIONS.indexOf(action);
  row.q[index] += alpha * (target - row.q[index]); row.visits[index]++;
}
export function distanceTrainingUpdates(policy, observations, actions, next, gamma = .99, alpha = .12) {
  const nextStates = new Map(next.observations.map(o => [o.ship.id, o.state])), groups = new Map();
  for (const { ship, state } of observations) {
    if (state === null) continue;
    const action = actions.get(ship.id), nextState = nextStates.get(ship.id);
    const terminal = next.done || !nextStates.has(ship.id), row = nextState === null || nextState === undefined ? null : policy.rows[nextState];
    const target = next.reward + (!terminal && row ? gamma ** next.elapsedSeconds * Math.max(...row.q) : 0);
    const key = `${state}/${action}`, group = groups.get(key) ?? { state, action, targets: [] };
    group.targets.push(target); groups.set(key, group);
  }
  // Targets are computed before any write; same-state/action team-mates share one average update.
  for (const group of groups.values()) updateDistanceTarget(policy, group.state, group.action,
    group.targets.reduce((a, b) => a + b, 0) / group.targets.length, alpha);
  return groups.size;
}
export function assertDistanceExecutor(lab) {
  for (const action of Object.values(DISTANCE_EXECUTION)) {
    assert.equal(lab.POLICY_TUNING[action].pressure, 1); assert.equal(lab.POLICY_TUNING[action].finish, 1);
  }
  assert.deepEqual(Object.values(DISTANCE_EXECUTION).map(action => lab.POLICY_TUNING[action].range), [1, .9, 1.12]);
}
export function runDistanceBattle(lab, env, model = null) {
  let reward = 0, decisions = 0, nonBaselineDecisions = 0, guardFallbackDecisions = 0;
  const actionsTaken = Object.fromEntries(DISTANCE_ACTIONS.map(a => [a, 0])), statesVisited = {};
  while (!env.done) {
    const observations = distanceObservations(lab, env, model?.featureMode ?? 'WITH_RANGE'), execution = new Map();
    for (const { ship, state } of observations) {
      const action = model ? distanceAction(model, state) : 'BALANCED';
      const mapped = DISTANCE_EXECUTION[action]; execution.set(ship.id, mapped); lab.setTrainingAction(ship, mapped);
      const eligible = lab.shipPolicyAction(ship);
      if (eligible !== 'BALANCED') nonBaselineDecisions++;
      if (eligible !== mapped) guardFallbackDecisions++;
      decisions++; actionsTaken[action]++; statesVisited[state ?? 'no-contact'] = (statesVisited[state ?? 'no-contact'] ?? 0) + 1;
    }
    reward += env.step(execution).reward;
  }
  const result = { ...env.summary(), reward, decisions, nonBaselineDecisions, guardFallbackDecisions, actionsTaken, statesVisited };
  assert.ok(result.checksum.every(Number.isFinite) && Number.isFinite(reward)); return result;
}
