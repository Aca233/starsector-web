/** Paired 2x2 component diagnostics against a hash-verified archived simulator. No src edits. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ablationCases, runAblationBattle, summarizeAblation } from './ai/fleet-ablation.mjs';
import { componentHash as hash, splitComponentBundle, summarizeComponents, observationContext, ObservationContextAudit } from './ai/fleet-components.mjs';

const opts = {}, args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  assert.ok(['--reference', '--output'].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--'), `Unknown/incomplete argument: ${args[i]}`);
  assert.ok(!(args[i].slice(2) in opts), `Duplicate argument: ${args[i]}`);
  opts[args[i].slice(2)] = args[++i];
}
assert.ok(opts.reference, 'Pass --reference with a completed fixed-mode ablation including simulator.mjs');
const referencePath = path.resolve(opts.reference);
const referenceFiles = ['evaluation.json', 'plan.json', 'pairs.jsonl', 'run.json', 'simulator.mjs'];
const referenceBytes = Object.fromEntries(await Promise.all(referenceFiles.map(async f => [f, await readFile(path.join(referencePath, f))])));
const parse = file => JSON.parse(referenceBytes[file].toString('utf8'));
const reference = parse('evaluation.json'), referencePlan = parse('plan.json');
assert.equal(parse('run.json').status, 'COMPLETE');
assert.equal(reference.experiment, 'fixed-mode-development-ablation-v1');
assert.equal(reference.design.holdoutUsed, false);
assert.deepEqual(reference.config, referencePlan.config);
assert.deepEqual(reference.cases, referencePlan.cases);
assert.equal(reference.engineBundleSha256, referencePlan.engineBundleSha256);
assert.equal(hash(referenceBytes['simulator.mjs']), reference.engineBundleSha256, 'Reference simulator hash mismatch');
const originalPairs = referenceBytes['pairs.jsonl'].toString('utf8').trim().split('\n').map(JSON.parse);
assert.equal(originalPairs.length, reference.completedPairs);
const root = path.resolve('artifacts/ai'), output = path.resolve(opts.output ?? `artifacts/ai/components-${Date.now()}`);
const relative = path.relative(root, output);
assert.ok(relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative), 'Output must be a new directory inside artifacts/ai');
await mkdir(path.dirname(output), { recursive: true });
await mkdir(output); // Never overwrite saved evidence, including the reference.
const save = (name, data) => writeFile(path.join(output, name), JSON.stringify(data, null, 2) + '\n');
const started = performance.now();
try {
  const runtimePath = 'src/engine/ai/learning/combat-policy.json', runtimeBefore = await readFile(runtimePath);
  const fullSource = referenceBytes['simulator.mjs'].toString('utf8');
  await writeFile(path.join(output, 'simulator-full.mjs'), fullSource, { flag: 'wx' });
  const full = await import(pathToFileURL(path.join(output, 'simulator-full.mjs')).href);
  assert.equal(full.FLEET_LAB_VERSION, reference.labVersion);
  const cases = ablationCases(full, reference.config.pairsPerScenario, reference.config.seed);
  assert.deepEqual(cases, reference.cases, 'Reference schedule must contain all planned development cases');
  assert.equal(originalPairs.length, cases.length);
  for (let i = 0; i < cases.length; i++) {
    const pair = originalPairs[i], entry = cases[i];
    assert.equal(pair.split, entry.split); assert.equal(pair.scenario, entry.scenario.id); assert.equal(pair.seed, entry.seed);
    assert.deepEqual(pair.matches.map(m => m.side), [0, 1]);
  }
  assert.deepEqual(summarizeAblation(full, originalPairs, reference.modes, reference.config.seed), reference.summary, 'Reference summary cannot be reproduced');
  const variants = splitComponentBundle(fullSource, full.POLICY_TUNING), labs = { FULL: full };
  for (const component of ['RANGE', 'TARGET']) {
    const filename = path.join(output, `simulator-${component.toLowerCase()}.mjs`);
    await writeFile(filename, variants[component].source, { flag: 'wx' });
    labs[component] = await import(pathToFileURL(filename).href);
    assert.deepEqual(labs[component].POLICY_TUNING, variants[component].tuning);
    assert.deepEqual(labs[component].FLEET_SCENARIOS, full.FLEET_SCENARIOS);
  }
  const actions = full.POLICY_ACTIONS.filter(a => a !== 'BALANCED');
  const modes = ['BALANCED', ...actions.flatMap(a => ['FULL', 'RANGE', 'TARGET'].map(c => `${a}_${c}`))];
  const scriptPaths = ['scripts/ablate-fleet-components.mjs', 'scripts/ai/fleet-components.mjs', 'scripts/ai/fleet-ablation.mjs', 'scripts/ai/fleet-evaluation.mjs'];
  const plan = { schemaVersion: 1, experiment: 'paired-component-development-ablation-v1', config: reference.config,
    labVersion: full.FLEET_LAB_VERSION, nodeVersion: process.version,
    reference: { directory: referencePath, hashes: Object.fromEntries(referenceFiles.map(f => [f, hash(referenceBytes[f])])) },
    scripts: Object.fromEntries(await Promise.all(scriptPaths.map(async f => [f, hash(await readFile(f))]))),
    runtimePolicySha256: hash(runtimeBefore), modes, cases,
    variants: Object.fromEntries(Object.entries(variants).map(([name, variant]) => [name, {
      filename: `simulator-${name.toLowerCase()}.mjs`, sha256: hash(variant.source), tuning: variant.tuning,
      neutralizedBodySha256: variant.neutralizedBodySha256 }])),
    design: { holdoutUsed: false, training: false, deployment: 'NOT_DEPLOYED',
      factors: ['range multiplier', 'target utility weights (pressure and finish together)'],
      primaryContrasts: ['RANGE - BALANCED', 'TARGET - BALANCED', 'FULL - RANGE', 'FULL - TARGET', 'FULL - RANGE - TARGET + BALANCED'],
      statisticalUnit: 'scenario/seed including both learner sides',
      interval: '2000 mirrored-pair bootstrap draws, descriptive and not multiplicity-adjusted',
      referenceReuse: 'Original BALANCED and FULL records, no LEARNED selection; all BALANCED trajectories replayed exactly',
      neutralityChecks: 'Both isolated bundles replay both learner sides of the first BALANCED pair',
      observationAudit: 'Baseline only; own hull/role/effective battery range and visible contact distance/class; no enemy weapon loadout',
      rangeBins: [500, 800], relativeDistanceBins: [.8, 1.1] } };
  await save('plan.json', plan); // All modes, coefficients, cases and bins fixed before measurement.
  await save('run.json', { status: 'RUNNING', completedPairs: 0, totalPairs: cases.length });
  const audit = new ObservationContextAudit(), pairs = [], neutralReplays = [];
  for (const component of ['RANGE', 'TARGET']) for (const side of [0, 1]) {
    const entry = cases[0], lab = labs[component];
    const result = runAblationBattle(lab, new lab.FleetCombatLab(entry.scenario, entry.seed, side, reference.config.seconds), { action: 'BALANCED' });
    assert.deepEqual(result, originalPairs[0].matches[side].runs.BALANCED, `${component} altered the neutral baseline`);
    neutralReplays.push({ component, side, exactMatch: true });
  }
  let replayedBaselineBattles = 0, newComponentBattles = 0;
  for (let i = 0; i < cases.length; i++) {
    const entry = cases[i], matches = [];
    for (const side of [0, 1]) {
      const previous = originalPairs[i].matches[side].runs;
      const baseline = runAblationBattle(full, new full.FleetCombatLab(entry.scenario, entry.seed, side, reference.config.seconds),
        { action: 'BALANCED' }, ({ ship, state }) => audit.add(state, observationContext(full, ship, state), entry.scenario.id));
      assert.deepEqual(baseline, previous.BALANCED, 'Baseline replay or telemetry changed the archived trajectory');
      replayedBaselineBattles++;
      const runs = { BALANCED: baseline };
      for (const action of actions) {
        runs[`${action}_FULL`] = previous[action];
        for (const component of ['RANGE', 'TARGET']) {
          const lab = labs[component];
          runs[`${action}_${component}`] = runAblationBattle(lab,
            new lab.FleetCombatLab(entry.scenario, entry.seed, side, reference.config.seconds), { action });
          newComponentBattles++;
        }
      }
      matches.push({ side, runs });
    }
    const pair = { split: entry.split, scenario: entry.scenario.id, seed: entry.seed, matches };
    pairs.push(pair);
    await appendFile(path.join(output, 'pairs.jsonl'), JSON.stringify(pair) + '\n');
    await save('run.json', { status: 'RUNNING', completedPairs: pairs.length, totalPairs: cases.length });
    console.log(`pair ${pairs.length}/${cases.length} ${pair.scenario}: ${modes.map(mode => `${mode}=${matches.map(m => m.runs[mode].outcome).join('/')}`).join(' ')}`);
  }
  assert.equal(hash(await readFile(runtimePath)), hash(runtimeBefore), 'Runtime policy changed during diagnostics');
  for (const file of referenceFiles) assert.equal(hash(await readFile(path.join(referencePath, file))), hash(referenceBytes[file]), `Reference ${file} changed`);
  const summary = summarizeAblation(full, pairs, modes, reference.config.seed);
  const components = summarizeComponents(full, pairs, reference.config.seed);
  await save('observation-contexts.json', { summary: audit.summary(), states: audit.states });
  const report = { ...plan, summary, components, observationAudit: audit.summary(),
    accounting: { mainBattleRecords: pairs.length * 2 * modes.length, referenceRecordsReused: pairs.length * 2 * 4,
      newComponentBattles, replayedBaselineBattles, neutralityAuditBattles: neutralReplays.length,
      newSimulations: newComponentBattles + replayedBaselineBattles + neutralReplays.length },
    audit: { neutralReplays, allBaselineReplaysExact: true, referenceUnchanged: true, runtimeUnchanged: true },
    elapsedSeconds: (performance.now() - started) / 1000, deployment: 'NOT_DEPLOYED',
    limitations: [
      'Development diagnostics reusing the previous fixed-mode cases and FULL evidence; not independent holdout validation.',
      'Only the archived tuning table differs across bundles. Findings apply to this archived simulator, not untested newer code.',
      'Intervals are exploratory and unadjusted for multiple modes, mechanisms, or scenarios; do not auto-promote.',
      'Target-only retains both pressure and finish utility weights together; these two weights are not separately identified.',
      'Fixed fleet-wide actions do not establish when an individual ship should switch modes.',
      'Observation aliasing is descriptive. It does not prove new features will improve a policy or identify the cause of prior failure.',
      'Decision counts are correlated within trajectories, not independent efficacy samples.',
      'Identical seeds do not force identical random events after policies diverge; all downstream interactions remain part of the outcome.',
      'Extra replays are checks, not new independent samples.' ] };
  await save('evaluation.json', report);
  await save('run.json', { status: 'COMPLETE', accounting: report.accounting, deployment: 'NOT_DEPLOYED' });
  console.log(JSON.stringify({ output, accounting: report.accounting, versusBalanced: Object.fromEntries(Object.entries(summary.versusBalanced)
    .map(([name, s]) => [name, { ...s.candidate, gain: s.meanScoreGain, interval: s.scoreGain95Interval }])),
    observationAudit: { ...report.observationAudit, examples: undefined }, elapsedSeconds: report.elapsedSeconds, deployment: report.deployment }, null, 2));
} catch (error) {
  await save('run.json', { status: 'FAILED', error: String(error), deployment: 'NOT_DEPLOYED' });
  throw error;
}
