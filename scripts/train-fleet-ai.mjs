/** Team residual Q-learning against the unchanged rule AI. Never writes src/ model weights. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { loadCombatLab } from './ai/load-combat-lab.mjs';
import { summarizeFleetEvaluation, fleetPromotionGate } from './ai/fleet-evaluation.mjs';
const opts = {}, args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (!['--episodes', '--seconds', '--test-seconds', '--seed', '--checkpoint-every', '--validation-pairs', '--holdout-pairs', '--output', '--model'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw Error(`Unknown/incomplete argument: ${args[i]}`);
  opts[args[i].slice(2)] = args[++i];
}
const integer = (key, fallback, lo, hi) => {
  const n = Number(opts[key] ?? fallback);
  assert.ok(Number.isInteger(n) && n >= lo && n <= hi, `--${key} must be ${lo}..${hi}`); return n;
};
const config = {
  episodes: integer('episodes', opts.model ? 0 : 64, 0, 100000),
  seconds: integer('seconds', 75, 2, 600), testSeconds: integer('test-seconds', 120, 2, 600),
  seed: integer('seed', 20260918, 0, 0x7fffffff), checkpointEvery: integer('checkpoint-every', 32, 1, 100000),
  validationPairs: integer('validation-pairs', 3, 1, 1000), holdoutPairs: integer('holdout-pairs', 12, 1, 1000),
};
assert.ok(config.episodes > 0 || opts.model, 'Evaluation-only requires --model');
assert.ok(!opts.model || config.episodes === 0, 'External model loading is evaluation-only; do not resume from held-out results.');
const output = path.resolve(opts.output ?? 'artifacts/ai/fleet-latest');
const src = path.resolve('src');
assert.ok(output !== src && !output.startsWith(src + path.sep), 'Outputs must be outside src/');
await mkdir(path.join(output, 'checkpoints'), { recursive: true });
const save = async (file, data) => writeFile(path.join(output, file), JSON.stringify(data, null, 2) + '\n');
const lab = await loadCombatLab();
const { FleetCombatLab, FLEET_LAB_VERSION, FLEET_SCENARIOS, fleetCase, SimulationRandom,
  emptyCombatPolicy, validateCombatPolicy, policyAction, learnTransition, POLICY_ACTIONS } = lab;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const freezeModel = model => Object.freeze({ ...model, enabled: true, actions: Object.freeze([...model.actions]),
  rows: Object.freeze(Object.fromEntries(Object.entries(model.rows).map(([k, v]) => [k,
    Object.freeze({ q: Object.freeze([...v.q]), visits: Object.freeze([...v.visits]) })]))) });
const started = performance.now(), rng = new SimulationRandom(config.seed);
const policy = emptyCombatPolicy(); policy.enabled = true;
const parameters = { algorithm: 'shared-tabular-Q', alpha: .12, gamma: .97, epsilonStart: .45, epsilonEnd: .12,
  decisionSeconds: 1, physicsHz: 60, sharedCredit: 'mean TD target once per state/action per team-step',
  selection: 'validation-only: 4*pairedScoreGain + hullGain + 0.1*rewardGain',
  minimumActionVisits: policy.minVisits, minimumActionAdvantage: policy.minAdvantage };
await save('run.json', { status: 'TRAINING', config, parameters, labVersion: FLEET_LAB_VERSION,
  engineBundleSha256: lab.engineBundleSha256, nodeVersion: process.version, scenarios: FLEET_SCENARIOS });
await writeFile(path.join(output, 'training-episodes.jsonl'), '');
let updates = 0, best = null;
const checkpoints = [], baselineCache = new Map();
function runBattle(model, scenario, seed, side, seconds) {
  const env = new FleetCombatLab(scenario, seed, side, seconds);
  let reward = 0, nonBaselineDecisions = 0, decisions = 0;
  const actionsTaken = Object.fromEntries(POLICY_ACTIONS.map(a => [a, 0]));
  while (!env.done) {
    const actions = new Map();
    for (const { ship, state } of env.observations()) {
      const action = model ? policyAction(model, state) : 'BALANCED';
      actions.set(ship.id, action); actionsTaken[action]++; decisions++;
      if (action !== 'BALANCED') nonBaselineDecisions++;
    }
    reward += env.step(actions).reward;
  }
  const summary = { ...env.summary(), reward, nonBaselineDecisions, decisions, actionsTaken };
  assert.ok(summary.checksum.every(Number.isFinite) && Number.isFinite(reward), 'Nonfinite combat state');
  return summary;
}
async function evaluate(model, split, pairCount, seconds) {
  const before = hash(model), pairs = [];
  for (let i = 0; i < pairCount; i++) {
    const { scenario, seed } = fleetCase(split, i, config.seed), matches = [];
    for (const side of [0, 1]) {
      const key = `${split}/${i}/${side}/${seconds}`;
      if (!baselineCache.has(key)) baselineCache.set(key, runBattle(null, scenario, seed, side, seconds));
      matches.push({ baseline: baselineCache.get(key), candidate: runBattle(model, scenario, seed, side, seconds) });
    }
    pairs.push({ scenario: scenario.id, seed, matches });
    console.log(`${split} pair ${i + 1}/${pairCount}: ${scenario.id} ${matches.map(m => m.candidate.outcome).join('/')} actions=${matches.reduce((n,m)=>n+m.candidate.nonBaselineDecisions,0)}`);
  }
  assert.equal(hash(model), before, 'Evaluation mutated the candidate');
  return { pairs, summary: summarizeFleetEvaluation(pairs, new SimulationRandom(config.seed ^ (split === 'holdout' ? 0x771a : 0x334b))) };
}
for (let episode = 0; episode < config.episodes; episode++) {
  // Adjacent episodes exchange the learner team for the same physical battle.
  const { scenario, seed } = fleetCase('train', Math.floor(episode / 2), config.seed);
  const env = new FleetCombatLab(scenario, seed, episode % 2, config.seconds);
  const epsilon = parameters.epsilonStart + (parameters.epsilonEnd - parameters.epsilonStart) * episode / Math.max(1, config.episodes - 1);
  const actionsTaken = Object.fromEntries(POLICY_ACTIONS.map(a => [a, 0]));
  let reward = 0;
  while (!env.done) {
    const observations = env.observations(), actions = new Map();
    for (const { ship, state } of observations) {
      const row = state === null ? null : policy.rows[state];
      let index = 0;
      const counts = row?.visits ?? POLICY_ACTIONS.map(() => 0), min = Math.min(...counts);
      if (state !== null && min < 2) {
        const choices = counts.map((n,i)=>n===min?i:-1).filter(i=>i>=0);
        index = choices[Math.floor(rng.next() * choices.length)];
      } else if (state !== null && rng.next() < epsilon) index = Math.floor(rng.next() * POLICY_ACTIONS.length);
      else if (row) for (let i = 1; i < row.q.length; i++) if (row.q[i] > row.q[index]) index = i;
      actions.set(ship.id, POLICY_ACTIONS[index]); actionsTaken[POLICY_ACTIONS[index]]++;
    }
    const next = env.step(actions); reward += next.reward;
    const states = new Map(next.observations.map(o => [o.ship.id, o.state]));
    // Compute all bootstrapped targets before any update; correlated same-state fleetmates
    // cannot count one team reward as several independent observations of the same action.
    const groups = new Map();
    for (const { ship, state } of observations) {
      if (state === null) continue;
      const action = actions.get(ship.id), nextState = states.get(ship.id), terminal = next.done || !states.has(ship.id);
      const row = nextState === null || nextState === undefined ? null : policy.rows[nextState];
      const tdTarget = next.reward + (!terminal && row ? parameters.gamma ** next.elapsedSeconds * Math.max(...row.q) : 0);
      const key = `${state}/${action}`, group = groups.get(key) ?? { state, action, targets: [] };
      group.targets.push(tdTarget); groups.set(key, group);
    }
    for (const group of groups.values()) {
      const target = group.targets.reduce((a,b)=>a+b,0) / group.targets.length;
      learnTransition(policy, group.state, group.action, target, null, true, parameters.alpha, 0); updates++;
    }
  }
  assert.ok(validateCombatPolicy(policy), 'Invalid learned policy');
  const summary = { episode: episode + 1, ...env.summary(), reward, epsilon, actionsTaken, updates };
  await appendFile(path.join(output, 'training-episodes.jsonl'), JSON.stringify(summary) + '\n');
  console.log(`train ${episode + 1}/${config.episodes} ${scenario.id} team=${env.learnerTeam} ${summary.outcome} reward=${reward.toFixed(3)} states=${Object.keys(policy.rows).length}`);
  if ((episode + 1) % config.checkpointEvery === 0 || episode + 1 === config.episodes) {
    const frozen = freezeModel(policy), checkpoint = `checkpoints/episode-${String(episode + 1).padStart(6,'0')}`;
    await save(checkpoint + '-policy.json', frozen);
    const validation = await evaluate(frozen, 'validation', config.validationPairs, config.seconds);
    await save(checkpoint + '-validation.json', validation);
    const v = validation.summary, rank = v.meanScoreGain * 4 + v.meanHullGain + v.meanRewardGain * .1;
    const row = { episode: episode + 1, modelSha256: hash(frozen), rank, validation: v };
    checkpoints.push(row);
    if (!best || rank > best.rank + 1e-12) best = { ...row, policy: frozen };
    await save('candidate-policy.json', best.policy);
    await save('run.json', { status: 'TRAINING', config, parameters, labVersion: FLEET_LAB_VERSION,
      engineBundleSha256: lab.engineBundleSha256, updates, checkpoints, selectedEpisode: best.episode });
  }
}
if (opts.model) {
  const loaded = JSON.parse((await readFile(opts.model, 'utf8')).replace(/^\uFEFF/, ''));
  assert.ok(validateCombatPolicy(loaded), 'Model schema does not match this observation/action version');
  best = { episode: null, policy: freezeModel(loaded), rank: null };
}
// Freeze selection BEFORE looking at the held-out battles. Nothing after this line calls learnTransition.
assert.ok(best);
await save('selection.json', { selectedEpisode: best.episode, modelSha256: hash(best.policy), rank: best.rank, checkpoints,
  sourceModel: opts.model ?? null, rule: parameters.selection, status: 'FROZEN_BEFORE_HOLDOUT' });
await save('candidate-policy.json', best.policy);
await save('run.json', { status: 'HELD_OUT_EVALUATION', config, selectedEpisode: best.episode, updates });
const heldout = await evaluate(best.policy, 'holdout', config.holdoutPairs, config.testSeconds);
const gate = fleetPromotionGate(heldout.summary);
const report = { schemaVersion: 1, labVersion: FLEET_LAB_VERSION, config, parameters, scenarios: FLEET_SCENARIOS,
  engineBundleSha256: lab.engineBundleSha256, modelSha256: hash(best.policy), nodeVersion: process.version,
  selectedEpisode: best.episode, trainedStates: Object.keys(best.policy.rows).length, updates, checkpoints,
  heldout, gate, elapsedSeconds: (performance.now() - started) / 1000,
  limitations: ['Only the original rule AI is used as the opponent; not a human/league/self-play evaluation.',
    'Bootstrap units are mirrored scenario/seed pairs; small-sample intervals are only screening evidence.',
    'Timeouts score 0.5 for comparison but are reported separately, never counted as wins.',
    'No carrier/phase/capital curriculum, browser worker stress test or automatic deployment.'] };
await save('evaluation.json', report);
await save('run.json', { status: 'COMPLETE', config, selectedEpisode: best.episode, updates, gate });
console.log(JSON.stringify({ output, selectedEpisode: best.episode, trainedStates: report.trainedStates, updates,
  summary: heldout.summary, gate, elapsedSeconds: report.elapsedSeconds }, null, 2));
