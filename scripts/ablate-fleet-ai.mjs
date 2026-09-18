/** Fixed-action ablation, not training or promotion. Leaves the runtime policy untouched. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { loadCombatLab } from './ai/load-combat-lab.mjs';
import { ablationCases, freezeAblationModel, runAblationBattle, summarizeAblation } from './ai/fleet-ablation.mjs';

const opts = {}, args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  assert.ok(['--pairs-per-scenario', '--seconds', '--seed', '--output', '--model'].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--'), `Unknown/incomplete argument: ${args[i]}`);
  assert.ok(!(args[i].slice(2) in opts), `Duplicate argument: ${args[i]}`);
  opts[args[i].slice(2)] = args[++i];
}
const integer = (key, fallback, lo, hi) => {
  const value = Number(opts[key] ?? fallback);
  assert.ok(Number.isInteger(value) && value >= lo && value <= hi, `--${key} must be ${lo}..${hi}`);
  return value;
};
const config = { pairsPerScenario: integer('pairs-per-scenario', 4, 1, 1000),
  seconds: integer('seconds', 120, 2, 600), seed: integer('seed', 20261001, 0, 0x3fffffff - 3000) };
const root = path.resolve('artifacts/ai'), output = path.resolve(opts.output ?? `artifacts/ai/ablation-${Date.now()}`);
const relative = path.relative(root, output);
assert.ok(relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative), 'Output must be a new directory inside artifacts/ai');
// Refuse reuse, so a diagnostic run cannot silently erase earlier evidence.
await mkdir(path.dirname(output), { recursive: true });
await mkdir(output);
const save = async (name, value) => writeFile(path.join(output, name), JSON.stringify(value, null, 2) + '\n');
const sha = value => createHash('sha256').update(value).digest('hex');
const started = performance.now();
try {
  const lab = await loadCombatLab();
  const runtimePath = 'src/engine/ai/learning/combat-policy.json';
  const runtimeBefore = await readFile(runtimePath);
  const modelBytes = opts.model ? await readFile(opts.model) : null;
  const model = modelBytes ? freezeAblationModel(lab, JSON.parse(modelBytes.toString('utf8'))) : null;
  const modelHash = model ? sha(JSON.stringify(model)) : null;
  const controllers = Object.fromEntries(lab.POLICY_ACTIONS.map(action => [action, { action }]));
  if (model) controllers.LEARNED = { model };
  const modes = Object.keys(controllers), cases = ablationCases(lab, config.pairsPerScenario, config.seed);
  const programFiles = ['scripts/ablate-fleet-ai.mjs', 'scripts/ai/fleet-ablation.mjs', 'scripts/ai/fleet-evaluation.mjs'];
  const manifest = { schemaVersion: 1, experiment: 'fixed-mode-development-ablation-v1', config,
    labVersion: lab.FLEET_LAB_VERSION, engineBundleSha256: lab.engineBundleSha256, nodeVersion: process.version,
    scripts: Object.fromEntries(await Promise.all(programFiles.map(async file => [file, sha(await readFile(file))]))),
    modes, modelSource: opts.model ? path.resolve(opts.model) : null, modelFileSha256: modelBytes ? sha(modelBytes) : null,
    modelSha256: modelHash, runtimePolicySha256: sha(runtimeBefore),
    design: { splits: ['train', 'validation'], holdoutUsed: false, seconds: config.seconds,
      learnerSides: [0, 1], opponent: 'BALANCED', statisticalUnit: 'scenario/seed with both learner sides',
      baselineReusedWithinPair: true, interval: '2000 mirrored-pair bootstrap draws; descriptive, not multiplicity-adjusted',
      selection: 'NONE', deployment: 'NOT_DEPLOYED' }, cases };
  await save('plan.json', manifest); // Freeze the entire schedule before running any battle.
  await save('run.json', { status: 'RUNNING', completedPairs: 0, totalPairs: cases.length });
  const pairs = [];
  for (const entry of cases) {
    const matches = [];
    for (const side of entry.sides) {
      const runs = {};
      for (const mode of modes) {
        const env = new lab.FleetCombatLab(entry.scenario, entry.seed, side, config.seconds);
        runs[mode] = runAblationBattle(lab, env, controllers[mode]);
      }
      matches.push({ side, runs });
    }
    const pair = { split: entry.split, scenario: entry.scenario.id, seed: entry.seed, matches };
    pairs.push(pair);
    await appendFile(path.join(output, 'pairs.jsonl'), JSON.stringify(pair) + '\n');
    await save('run.json', { status: 'RUNNING', completedPairs: pairs.length, totalPairs: cases.length });
    console.log(`pair ${pairs.length}/${cases.length} ${pair.scenario} seed=${pair.seed}: ${modes.map(mode => `${mode}=${matches.map(m => m.runs[mode].outcome).join('/')}`).join(' ')}`);
  }
  assert.equal(model ? sha(JSON.stringify(model)) : null, modelHash, 'Diagnostic mutated the frozen model');
  assert.equal(sha(await readFile(runtimePath)), sha(runtimeBefore), 'Runtime policy changed during ablation');
  const summary = summarizeAblation(lab, pairs, modes, config.seed);
  const report = { ...manifest, summary, completedPairs: pairs.length, battlesRun: pairs.length * 2 * modes.length,
    elapsedSeconds: (performance.now() - started) / 1000, deployment: 'NOT_DEPLOYED',
    limitations: [
      'Exploratory diagnostics on development scenarios, NOT an independent holdout strength claim.',
      'Multiple modes/scenarios are compared; bootstrap intervals are descriptive and not multiplicity-adjusted.',
      'Fixed fleet-wide actions differ from conditional per-ship switching; a losing fixed mode can still be useful in some states.',
      'Actions bundle range and target weights. This experiment does not isolate those individual mechanisms.',
      'Eligible action counts are sampled at decision boundaries, not proof that the mode changed a shot or maneuver every frame.',
      'Time and blocking deltas depend on battle duration and casualties; they are not standalone efficiency measures.',
      'The game uses seeded PRNG streams, but different actions can consume random draws differently.',
      'If an old model is included, these development scenarios are familiar to its training/selection; comparison is diagnostic only.',
      'Only six small-fleet development scenarios; not all hulls, players, carriers, terrain, or multiplayer.' ] };
  await save('evaluation.json', report);
  await save('run.json', { status: 'COMPLETE', completedPairs: pairs.length, battlesRun: report.battlesRun, deployment: 'NOT_DEPLOYED' });
  console.log(JSON.stringify({ output, battlesRun: report.battlesRun, versusBalanced: summary.versusBalanced,
    elapsedSeconds: report.elapsedSeconds, deployment: report.deployment }, null, 2));
} catch (error) {
  await save('run.json', { status: 'FAILED', error: String(error), deployment: 'NOT_DEPLOYED' });
  throw error;
}
