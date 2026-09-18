/** Offline Q-learning on the real combat engine; never edits the deployed model. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { loadCombatLab } from './ai/load-combat-lab.mjs';

const args = process.argv.slice(2), options = {};
for (let i = 0; i < args.length; i++) {
  const key = args[i];
  if (!['--episodes', '--seconds', '--seed', '--eval-pairs', '--output', '--model'].includes(key) || !args[i + 1] || args[i + 1].startsWith('--'))
    throw new Error(`Unknown or incomplete option: ${key}`);
  options[key.slice(2)] = args[++i];
}
function integer(name, fallback, min, max) {
  const value = Number(options[name] ?? fallback);
  assert.ok(Number.isInteger(value) && value >= min && value <= max, `Invalid --${name}: expected ${min}..${max}`);
  return value;
}
const episodes = integer('episodes', options.model ? 0 : 24, 0, 100000);
const seconds = integer('seconds', 45, 2, 600);
const seed = integer('seed', 1729, 0, 0x7fffffff);
const pairs = integer('eval-pairs', 12, 1, 10000);
const output = path.resolve(options.output ?? 'artifacts/ai/latest');
// Prevent a candidate-training command from accidentally replacing the runtime baseline.
const runtimeDirectory = path.resolve('src');
assert.ok(output !== runtimeDirectory && !output.startsWith(runtimeDirectory + path.sep), 'Training output must stay outside src/');
const lab = await loadCombatLab();
const { CombatLab, LAB_SCENARIOS, LAB_VERSION, SimulationRandom, emptyCombatPolicy, validateCombatPolicy,
  POLICY_ACTIONS, learnTransition, policyAction } = lab;
const model = options.model ? JSON.parse((await readFile(options.model, 'utf8')).replace(/^\uFEFF/, '')) : emptyCombatPolicy();
assert.ok(validateCombatPolicy(model), 'Invalid input policy');
model.enabled = true; // Only for the isolated lab; runtime JSON is untouched.
const rng = new SimulationRandom(seed);
const training = [];
const start = performance.now();
for (let episode = 0; episode < episodes; episode++) {
  const env = new CombatLab((seed + episode) >>> 0, episode % LAB_SCENARIOS.length, episode % 2, seconds);
  let totalReward = 0;
  const epsilon = .35 - .25 * episode / Math.max(1, episodes - 1);
  while (!env.done) {
    const state = env.state;
    const row = state === null ? null : model.rows[state];
    let index = 0;
    if (rng.next() < epsilon) index = Math.floor(rng.next() * POLICY_ACTIONS.length);
    else if (row) for (let i = 1; i < row.q.length; i++) if (row.q[i] > row.q[index]) index = i;
    const action = POLICY_ACTIONS[index];
    const step = env.step(action);
    totalReward += step.reward;
    if (state !== null) learnTransition(model, state, action, step.reward, step.state, step.done);
  }
  training.push({ ...env.summary(), reward: totalReward });
  console.log(`train ${episode + 1}/${episodes}: ${training.at(-1).scenario} ${training.at(-1).outcome} reward=${totalReward.toFixed(3)}`);
}
assert.ok(validateCombatPolicy(model), 'Training produced invalid values');
// Same starting state and side for baseline vs candidate. Evaluation never calls learnTransition.
const beforeEvaluation = JSON.stringify(model);
const evaluation = [];
for (let i = 0; i < pairs; i++) {
  const evaluationSeed = (seed + 0x40000000 + Math.floor(i / 2)) >>> 0;
  const scenario = Math.floor(i / 2) % LAB_SCENARIOS.length, side = i % 2;
  const run = (candidate) => {
    const env = new CombatLab(evaluationSeed, scenario, side, seconds);
    let reward = 0, learnedDecisions = 0, decisions = 0;
    while (!env.done) {
      const action = candidate ? policyAction(model, env.state) : 'BALANCED';
      if (action !== 'BALANCED') learnedDecisions++;
      decisions++;
      reward += env.step(action).reward;
    }
    return { ...env.summary(), reward, learnedDecisions, decisions };
  };
  const baseline = run(false), candidate = run(true);
  evaluation.push({ baseline, candidate, rewardDelta: candidate.reward - baseline.reward,
    hullDelta: (candidate.ownHull - candidate.enemyHull) - (baseline.ownHull - baseline.enemyHull) });
  console.log(`eval ${i + 1}/${pairs}: delta=${evaluation.at(-1).rewardDelta.toFixed(3)}, learned=${candidate.learnedDecisions}/${candidate.decisions}`);
}
assert.equal(JSON.stringify(model), beforeEvaluation, 'Evaluation mutated the policy');
const mean = key => evaluation.reduce((sum, e) => sum + e[key], 0) / pairs;
const report = {
  schemaVersion: 1, labVersion: LAB_VERSION, seed, episodes, seconds, pairs,
  engineBundleSha256: lab.engineBundleSha256, nodeVersion: process.version,
  sourceModel: options.model ?? null,
  learning: { algorithm: 'tabular-Q', alpha: .12, gamma: .97, epsilonStart: .35, epsilonEnd: .10, decisionSeconds: 1, physicsHz: 60 },
  scenarios: LAB_SCENARIOS,
  modelSha256: createHash('sha256').update(JSON.stringify(model)).digest('hex'),
  meanRewardDelta: mean('rewardDelta'), meanHullDelta: mean('hullDelta'),
  candidateWins: evaluation.filter(e => e.candidate.outcome === 'win').length,
  baselineWins: evaluation.filter(e => e.baseline.outcome === 'win').length,
  candidateTimeouts: evaluation.filter(e => e.candidate.outcome === 'timeout').length,
  learnedDecisions: evaluation.reduce((n, e) => n + e.candidate.learnedDecisions, 0),
  trainedStates: Object.keys(model.rows).length,
  elapsedSeconds: (performance.now() - start) / 1000,
  deployment: 'NOT_DEPLOYED',
  limitations: ['Small duel curriculum only; held-out seeds are not held-out hulls.',
    'Timeouts are not wins. These metrics do not establish fleet/multiplayer superiority.',
    'Review safety, broader scenarios and enough held-out battles before enabling a bundled policy.'],
  training, evaluation,
};
await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'candidate-policy.json'), JSON.stringify(model, null, 2) + '\n');
await writeFile(path.join(output, 'evaluation.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, ...Object.fromEntries(Object.entries(report).filter(([k]) => !['training', 'evaluation'].includes(k))) }, null, 2));
