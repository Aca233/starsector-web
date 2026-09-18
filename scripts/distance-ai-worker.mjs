import assert from 'node:assert/strict';
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { emptyDistancePolicy, validateDistancePolicy, freezeDistancePolicy, distanceObservations, distanceTrainingUpdates,
  DISTANCE_ACTIONS, DISTANCE_EXECUTION, assertDistanceExecutor, runDistanceBattle } from './ai/distance-policy.mjs';
import { summarizeFleetEvaluation } from './ai/fleet-evaluation.mjs';

assert.equal(process.argv.length, 3, 'Internal worker requires one job file');
const job = JSON.parse(await readFile(process.argv[2], 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(await readFile(job.simulator)), job.simulatorSha256);
const lab = await import(pathToFileURL(job.simulator).href);
assertDistanceExecutor(lab);
const save = (file, value) => writeFile(path.join(job.output, file), JSON.stringify(value, null, 2) + '\n');
const baselinePairs = JSON.parse(await readFile(job.baselines, 'utf8'));
function evaluate(model) {
  const before = hash(JSON.stringify(model));
  const pairs = job.evaluationCases.map((entry, index) => {
    const control = baselinePairs[index];
    assert.equal(entry.scenario.id, control.scenario); assert.equal(entry.seed, control.seed);
    return { scenario: entry.scenario.id, seed: entry.seed, matches: [0, 1].map(side => {
      assert.equal(control.matches[side].side, side);
      return { side, baseline: control.matches[side].baseline,
        candidate: runDistanceBattle(lab, new lab.FleetCombatLab(entry.scenario, entry.seed, side, job.evaluationSeconds), model) };
    }) };
  });
  assert.equal(hash(JSON.stringify(model)), before, 'Evaluation mutated model');
  return { featureMode: job.featureMode, seedIndex: job.seedIndex, modelSha256: before, pairs,
    summary: summarizeFleetEvaluation(pairs, new lab.SimulationRandom(job.summarySeed)) };
}
try {
  if (job.kind === 'holdout') {
    const candidate = JSON.parse(await readFile(job.model, 'utf8'));
    assert.equal(hash(JSON.stringify(candidate)), job.modelSha256, 'Frozen selection changed');
    const model = freezeDistancePolicy(candidate);
    assert.equal(model.featureMode, job.featureMode);
    const evaluation = evaluate(model);
    await save('heldout.json', evaluation);
    console.log(`holdout ${job.featureMode}/${job.seedIndex}: ${JSON.stringify(evaluation.summary.candidate)}`);
  } else {
    assert.equal(job.kind, 'train');
    const policy = emptyDistancePolicy(job.featureMode); policy.enabled = true;
    const rng = new lab.SimulationRandom(job.explorationSeed), checkpoints = [];
    let updates = 0, best = null;
    for (let episode = 0; episode < job.episodes; episode++) {
      const entry = job.trainingCases[Math.floor(episode / 2)];
      const env = new lab.FleetCombatLab(entry.scenario, entry.seed, episode % 2, job.trainingSeconds);
      const epsilon = job.parameters.epsilonStart + (job.parameters.epsilonEnd - job.parameters.epsilonStart) * episode / Math.max(1, job.episodes - 1);
      const actionsTaken = Object.fromEntries(DISTANCE_ACTIONS.map(action => [action, 0]));
      let reward = 0;
      while (!env.done) {
        const observations = distanceObservations(lab, env, policy.featureMode), actions = new Map(), execution = new Map();
        for (const { ship, state } of observations) {
          const row = state === null ? null : policy.rows[state], visits = row?.visits ?? [0, 0, 0];
          const min = Math.min(...visits); let index = 0;
          if (state !== null && min < 2) {
            const choices = visits.map((v, i) => v === min ? i : -1).filter(i => i >= 0);
            index = choices[Math.floor(rng.next() * choices.length)];
          } else if (state !== null && rng.next() < epsilon) index = Math.floor(rng.next() * 3);
          else if (row) for (let i = 1; i < 3; i++) if (row.q[i] > row.q[index]) index = i;
          const action = DISTANCE_ACTIONS[index]; actions.set(ship.id, action); execution.set(ship.id, DISTANCE_EXECUTION[action]); actionsTaken[action]++;
        }
        const next = env.step(execution); reward += next.reward;
        updates += distanceTrainingUpdates(policy, observations, actions,
          { ...next, observations: distanceObservations(lab, env, policy.featureMode) }, job.parameters.gamma, job.parameters.alpha);
      }
      assert.ok(validateDistancePolicy(policy));
      await appendFile(path.join(job.output, 'training-episodes.jsonl'), JSON.stringify({ episode: episode + 1,
        ...env.summary(), reward, epsilon, actionsTaken, updates, visitedStates: Object.keys(policy.rows).length }) + '\n');
      if ((episode + 1) % 24 === 0 || episode + 1 === job.episodes) console.log(`train ${job.featureMode}/${job.seedIndex} ${episode + 1}/${job.episodes} states=${Object.keys(policy.rows).length}`);
      if ((episode + 1) % job.checkpointEvery === 0 || episode + 1 === job.episodes) {
        const model = freezeDistancePolicy(policy), validation = evaluate(model);
        const s = validation.summary, rank = 4 * s.meanScoreGain + s.meanHullGain + .1 * s.meanRewardGain;
        const item = { episode: episode + 1, rank, modelSha256: hash(JSON.stringify(model)), validation: s };
        checkpoints.push(item);
        await save(`checkpoint-${episode + 1}-policy.json`, model);
        await save(`checkpoint-${episode + 1}-validation.json`, validation);
        if (!best || rank > best.rank + 1e-12) best = { ...item, model };
        console.log(`validation ${job.featureMode}/${job.seedIndex} episode=${episode + 1} rank=${rank.toFixed(4)}`);
      }
    }
    assert.ok(best);
    await save('candidate-policy.json', best.model);
    await save('selection.json', { featureMode: job.featureMode, seedIndex: job.seedIndex, selectedEpisode: best.episode,
      modelSha256: best.modelSha256, rank: best.rank, updates, trainedStates: Object.keys(best.model.rows).length,
      checkpoints, status: 'FROZEN_BEFORE_HOLDOUT' });
  }
  await save(`${job.kind}-status.json`, { status: 'COMPLETE' });
} catch (error) {
  await save(`${job.kind}-status.json`, { status: 'FAILED', error: String(error) });
  throw error;
}
