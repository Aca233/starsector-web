/** Distance-only learning with a matched no-range-feature control; never deploys. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { loadCombatLab } from './ai/load-combat-lab.mjs';
import { splitComponentBundle } from './ai/fleet-components.mjs';
import { assertDistanceExecutor, runDistanceBattle, DISTANCE_FEATURES } from './ai/distance-policy.mjs';
import { distanceCases, DISTANCE_SCENARIOS, summarizeDistanceStudy, distanceStudyGate } from './ai/distance-study.mjs';

const opts = {}, args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  assert.ok(['--episodes', '--seconds', '--test-seconds', '--checkpoint-every', '--validation-pairs', '--holdout-pairs', '--training-seeds', '--workers', '--seed', '--output'].includes(args[i])
    && args[i + 1] && !args[i + 1].startsWith('--'), `Unknown/incomplete argument: ${args[i]}`);
  assert.ok(!Object.hasOwn(opts, args[i].slice(2)), `Duplicate argument: ${args[i]}`);
  opts[args[i].slice(2)] = args[++i];
}
const integer = (key, fallback, lo, hi) => {
  const n = Number(opts[key] ?? fallback); assert.ok(Number.isInteger(n) && n >= lo && n <= hi, `--${key} must be ${lo}..${hi}`); return n;
};
const config = { episodes: integer('episodes', 192, 2, 10000), seconds: integer('seconds', 90, 2, 600),
  testSeconds: integer('test-seconds', 120, 2, 600), checkpointEvery: integer('checkpoint-every', 96, 1, 10000),
  validationPairs: integer('validation-pairs', 6, 3, 300), holdoutPairs: integer('holdout-pairs', 12, 3, 300),
  trainingSeeds: integer('training-seeds', 3, 1, 8), workers: integer('workers', 2, 1, 4), seed: integer('seed', 20261207, 0, 99999999) };
assert.equal(config.episodes % 2, 0, 'Training episodes must form mirrored pairs');
assert.equal(config.validationPairs % 3, 0, 'Validation must balance all three scenarios');
assert.equal(config.holdoutPairs % 3, 0, 'Holdout must balance all three scenarios');
const root = path.resolve('artifacts/ai'), output = path.resolve(opts.output ?? `artifacts/ai/distance-${Date.now()}`);
const relative = path.relative(root, output);
assert.ok(relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative), 'Use a new artifacts/ai directory');
await mkdir(path.dirname(output), { recursive: true }); await mkdir(output);
const save = (name, value) => writeFile(path.join(output, name), JSON.stringify(value, null, 2) + '\n');
const hash = value => createHash('sha256').update(value).digest('hex');
const active = new Set();
async function pool(jobs, phase) {
  let cursor = 0, failed = false;
  try {
    await Promise.all(Array.from({ length: Math.min(config.workers, jobs.length) }, async () => {
      while (cursor < jobs.length && !failed) {
        const job = jobs[cursor++], file = path.join(job.output, `${phase}-job.json`);
        await writeFile(file, JSON.stringify(job, null, 2) + '\n');
        await new Promise((resolve, reject) => {
          const log = createWriteStream(path.join(job.output, `${phase}.log`), { flags: 'wx' });
          const child = spawn(process.execPath, [path.join(output, 'sources/scripts/distance-ai-worker.mjs'), file], { cwd: process.cwd(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
          active.add(child);
          const abort = error => { failed = true; for (const p of active) p.kill(); reject(error); };
          log.on('error', abort);
          child.stdout.on('data', bytes => { log.write(bytes); process.stdout.write(bytes); });
          child.stderr.on('data', bytes => { log.write(bytes); process.stderr.write(bytes); });
          child.on('error', abort);
          child.on('close', code => {
            active.delete(child); log.end();
            if (code === 0) resolve(); else abort(Error(`${phase} worker ${job.featureMode}/${job.seedIndex} exited ${code}`));
          });
        });
      }
    }));
  } finally { if (failed) for (const child of active) child.kill(); }
}
const started = performance.now();
try {
  const runtimeFile = 'src/engine/ai/learning/combat-policy.json', runtimeBefore = await readFile(runtimeFile);
  const original = await loadCombatLab(), originalSource = await readFile(original.engineBundlePath, 'utf8');
  const rangeVariant = splitComponentBundle(originalSource, original.POLICY_TUNING).RANGE;
  const simulator = path.join(output, 'simulator-range.mjs'), simulatorSha256 = hash(rangeVariant.source);
  await writeFile(simulator, rangeVariant.source, { flag: 'wx' });
  await writeFile(path.join(output, 'simulator-original.mjs'), originalSource, { flag: 'wx' });
  const lab = await import(pathToFileURL(simulator).href); assertDistanceExecutor(lab);
  const parameters = { algorithm: 'shared-tabular-Q', alpha: .12, gamma: .99, epsilonStart: .45, epsilonEnd: .12,
    minVisits: 8, minAdvantage: .03, decisionSeconds: 1, physicsHz: 60,
    sharedCredit: 'mean target once per state/action per team-step',
    selection: 'validation-only: 4*pairedScoreGain + hullGain + 0.1*rewardGain',
    featureControl: 'Same distance actions, compact base features, training seeds, rewards and validation selection; only explicit distance ratio differs' };
  const trainingCases = Array.from({ length: config.trainingSeeds }, (_, index) => distanceCases('train', config.episodes / 2, config.seed, index));
  const validationCases = distanceCases('validation', config.validationPairs, config.seed), holdoutCases = distanceCases('holdout', config.holdoutPairs, config.seed);
  const scriptFiles = ['scripts/train-distance-ai.mjs', 'scripts/distance-ai-worker.mjs', 'scripts/ai/distance-policy.mjs', 'scripts/ai/distance-study.mjs',
    'scripts/ai/fleet-evaluation.mjs', 'scripts/ai/fleet-components.mjs', 'scripts/ai/load-combat-lab.mjs'];
  const archivedScripts = {};
  for (const file of scriptFiles) {
    const bytes = await readFile(file), archived = path.join(output, 'sources', file);
    await mkdir(path.dirname(archived), { recursive: true }); await writeFile(archived, bytes, { flag: 'wx' });
    archivedScripts[file] = hash(bytes);
  }
  const plan = { schemaVersion: 1, experiment: 'distance-only-feature-control-v1', config, parameters,
    features: DISTANCE_FEATURES, labVersion: lab.FLEET_LAB_VERSION, nodeVersion: process.version,
    originalSimulatorSha256: original.engineBundleSha256, simulatorSha256, executorTuning: rangeVariant.tuning,
    neutralizedBodySha256: rangeVariant.neutralizedBodySha256, runtimePolicySha256: hash(runtimeBefore),
    scripts: archivedScripts,
    scenarios: DISTANCE_SCENARIOS, trainingCases, validationCases, holdoutCases,
    screening: { trainingSeeds: 3, mirrorPairs: 12, terminalBattlesPerSeed: 12, scoreGainLowerBoundAbove: 0,
      featureIncrementLowerBoundAbove: 0, minimumHullGain: -.02, minimumScenarioScoreGain: -.1, minimumSeedScoreGain: -.05,
      statisticalUnit: 'crossed bootstrap of training seeds and mirrored battle cases', deployment: 'NOT_DEPLOYED' } };
  await save('plan.json', plan); await save('run.json', { status: 'VALIDATION_BASELINES', config });
  async function baselines(cases) {
    return cases.map(entry => ({ scenario: entry.scenario.id, seed: entry.seed, matches: [0, 1].map(side =>
      ({ side, baseline: runDistanceBattle(lab, new lab.FleetCombatLab(entry.scenario, entry.seed, side, config.testSeconds)) })) }));
  }
  // Check neutral execution/extra range observation against the original engine before training.
  const first = validationCases[0];
  for (const side of [0, 1]) {
    const baseline = runDistanceBattle(lab, new lab.FleetCombatLab(first.scenario, first.seed, side, 2));
    const unchanged = runDistanceBattle(original, new original.FleetCombatLab(first.scenario, first.seed, side, 2));
    assert.deepEqual(baseline, unchanged, 'Neutral distance executor changed original AI');
  }
  const validationBaselines = await baselines(validationCases);
  await save('validation-baselines.json', validationBaselines);
  const jobs = [];
  for (let seedIndex = 0; seedIndex < config.trainingSeeds; seedIndex++) for (const featureMode of ['WITHOUT_RANGE', 'WITH_RANGE']) {
    const directory = path.join(output, `seed-${seedIndex}-${featureMode.toLowerCase()}`); await mkdir(directory);
    jobs.push({ kind: 'train', output: directory, simulator, simulatorSha256, featureMode, seedIndex,
      episodes: config.episodes, checkpointEvery: config.checkpointEvery, trainingSeconds: config.seconds,
      trainingCases: trainingCases[seedIndex], explorationSeed: (config.seed ^ (0x13579b + seedIndex * 0x1f123bb5)) >>> 0,
      evaluationCases: validationCases, baselines: path.join(output, 'validation-baselines.json'), evaluationSeconds: config.testSeconds,
      summarySeed: config.seed ^ 0x1927, parameters });
  }
  await save('run.json', { status: 'TRAINING', config, jobs: jobs.map(j => ({ featureMode: j.featureMode, seedIndex: j.seedIndex })) });
  await pool(jobs, 'train');
  const selections = await Promise.all(jobs.map(async job => ({ directory: job.output,
    ...JSON.parse(await readFile(path.join(job.output, 'selection.json'), 'utf8')) })));
  // Every seed and both feature arms are frozen together. No winner picked using holdout.
  await save('selection.json', { status: 'ALL_FROZEN_BEFORE_HOLDOUT', selections });
  await save('run.json', { status: 'HOLDOUT_BASELINES', config });
  const holdoutBaselines = await baselines(holdoutCases); await save('holdout-baselines.json', holdoutBaselines);
  const evaluationJobs = jobs.map((job, i) => ({ kind: 'holdout', output: job.output, simulator, simulatorSha256,
    featureMode: job.featureMode, seedIndex: job.seedIndex, model: path.join(job.output, 'candidate-policy.json'), modelSha256: selections[i].modelSha256,
    evaluationCases: holdoutCases, baselines: path.join(output, 'holdout-baselines.json'), evaluationSeconds: config.testSeconds, summarySeed: config.seed ^ 0x4831 }));
  await save('run.json', { status: 'HOLDOUT', config }); await pool(evaluationJobs, 'holdout');
  const results = await Promise.all(jobs.map(job => readFile(path.join(job.output, 'heldout.json'), 'utf8').then(JSON.parse)));
  const summary = summarizeDistanceStudy(lab, results, config.seed), gate = distanceStudyGate(summary);
  assert.equal(hash(await readFile(runtimeFile)), hash(runtimeBefore), 'Runtime policy changed');
  for (const selection of selections) assert.equal(hash(JSON.stringify(JSON.parse(await readFile(path.join(selection.directory, 'candidate-policy.json'), 'utf8')))), selection.modelSha256);
  const report = { ...plan, selections, summary, gate, elapsedSeconds: (performance.now() - started) / 1000,
    accounting: { trainingBattles: jobs.length * config.episodes, uniqueHoldoutBaselineBattles: config.holdoutPairs * 2,
      holdoutCandidateBattles: jobs.length * config.holdoutPairs * 2, neutralityChecks: 4 },
    limitations: ['Offline candidate artifact, not a runtime-enabled policy or production worker integration.',
      'Three training seeds and twelve mirrored holdout cases give only small-sample screening evidence.',
      'Matched baselines are shared across models; their repeated counts are not additional independent battles.',
      'WITH_RANGE versus WITHOUT_RANGE isolates the ratio feature in this new compact distance-only learner, not every change from the old v2 model.',
      'No per-role/hull feature claims, new reward shaping, human/league opponent, carriers/capitals/phase curriculum or automatic deployment.',
      'New holdout results must not be reused for future tuning and then presented as independent evidence.'] };
  await save('evaluation.json', report); await save('run.json', { status: 'COMPLETE', config, gate });
  console.log(JSON.stringify({ output, accounting: report.accounting, summary, gate, elapsedSeconds: report.elapsedSeconds }, null, 2));
} catch (error) {
  for (const child of active) child.kill();
  await save('run.json', { status: 'FAILED', error: String(error), deployment: 'NOT_DEPLOYED' }); throw error;
}
