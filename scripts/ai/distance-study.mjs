import assert from 'node:assert/strict';

export const DISTANCE_SCENARIOS = {
  train: [
    { id: 'distance-train-light', teams: [['wolf', 'lasher'], ['wolf', 'lasher']], formation: 'LINE' },
    { id: 'distance-train-mixed', teams: [['hammerhead', 'wolf'], ['hammerhead', 'lasher']], formation: 'STAGGER' },
    { id: 'distance-train-strike', teams: [['sunder', 'lasher'], ['hammerhead', 'wolf']], formation: 'LINE' },
    { id: 'distance-train-escort-trio', teams: [['hammerhead', 'wolf', 'lasher'], ['sunder', 'lasher', 'wolf']], formation: 'LINE' },
    { id: 'distance-train-frigate-trio', teams: [['wolf', 'wolf', 'lasher'], ['lasher', 'lasher', 'wolf']], formation: 'WIDE' },
    { id: 'distance-train-destroyers', teams: [['hammerhead', 'sunder'], ['hammerhead', 'hammerhead']], formation: 'STAGGER' },
  ],
  validation: [
    { id: 'distance-validation-destroyer', teams: [['sunder', 'wolf'], ['hammerhead', 'wolf']], formation: 'WIDE' },
    { id: 'distance-validation-frigates', teams: [['lasher', 'lasher'], ['wolf', 'lasher']], formation: 'STAGGER' },
    { id: 'distance-validation-trio', teams: [['sunder', 'wolf', 'wolf'], ['hammerhead', 'lasher', 'lasher']], formation: 'STAGGER' },
  ],
  holdout: [
    { id: 'distance-holdout-strike', teams: [['shrike', 'wolf'], ['sunder', 'lasher']], formation: 'STAGGER' },
    { id: 'distance-holdout-mixed', teams: [['hammerhead', 'vigilance', 'lasher'], ['sunder', 'shrike', 'wolf']], formation: 'WIDE' },
    { id: 'distance-holdout-screen', teams: [['shrike', 'vigilance', 'wolf'], ['hammerhead', 'lasher', 'lasher']], formation: 'LINE' },
  ],
};
export function distanceCases(split, count, seed, trainingSeedIndex = 0) {
  assert.ok(Object.hasOwn(DISTANCE_SCENARIOS, split));
  assert.ok(Number.isInteger(count) && count > 0 && count <= 10000);
  assert.ok(Number.isInteger(seed) && seed >= 0 && seed < 100000000);
  assert.ok(Number.isInteger(trainingSeedIndex) && trainingSeedIndex >= 0 && trainingSeedIndex < 10);
  const offset = { train: 0, validation: 0x40000000, holdout: 0x80000000 }[split];
  return Array.from({ length: count }, (_, i) => ({ split,
    scenario: DISTANCE_SCENARIOS[split][i % DISTANCE_SCENARIOS[split].length],
    seed: seed + offset + i + (split === 'train' ? trainingSeedIndex * 100000 : 0), sides: [0, 1] }));
}
const average = values => values.reduce((a, b) => a + b, 0) / values.length;
/** Crossed resampling: model-training seeds AND shared mirrored battle cases.
 * Do not count reused opponents or ship decisions as independent evidence. */
export function crossedInterval(matrix, random) {
  assert.ok(matrix.length && matrix[0].length && matrix.every(row => row.length === matrix[0].length && row.every(Number.isFinite)));
  const seeds = matrix.length, cases = matrix[0].length, samples = [];
  for (let b = 0; b < 3000; b++) {
    const seedIndices = Array.from({ length: seeds }, () => Math.floor(random.next() * seeds));
    const caseIndices = Array.from({ length: cases }, () => Math.floor(random.next() * cases));
    let total = 0;
    for (const s of seedIndices) for (const c of caseIndices) total += matrix[s][c];
    samples.push(total / (seeds * cases));
  }
  samples.sort((a, b) => a - b);
  return { mean: average(matrix.map(average)), interval95: [samples[75], samples[2925]], trainingSeeds: seeds, mirrorPairs: cases };
}
export function summarizeDistanceStudy(lab, results, seed) {
  const modes = ['WITHOUT_RANGE', 'WITH_RANGE'];
  const groups = Object.fromEntries(modes.map(mode => [mode, results.filter(r => r.featureMode === mode).sort((a, b) => a.seedIndex - b.seedIndex)]));
  assert.ok(groups.WITH_RANGE.length && groups.WITH_RANGE.length === groups.WITHOUT_RANGE.length);
  assert.equal(results.length, groups.WITH_RANGE.length + groups.WITHOUT_RANGE.length, 'Unknown feature arm');
  for (const mode of modes) {
    assert.ok(groups[mode].every(r => Number.isInteger(r.seedIndex) && r.seedIndex >= 0));
    assert.equal(new Set(groups[mode].map(r => r.seedIndex)).size, groups[mode].length, 'Duplicate training seed');
    assert.ok(groups[mode].every(r => r.pairs.length === groups.WITH_RANGE[0].pairs.length));
  }
  for (let i = 0; i < groups.WITH_RANGE.length; i++) {
    const withRange = groups.WITH_RANGE[i], without = groups.WITHOUT_RANGE[i];
    assert.equal(withRange.seedIndex, without.seedIndex); assert.equal(withRange.pairs.length, without.pairs.length);
    for (let j = 0; j < withRange.pairs.length; j++) for (const result of [withRange, without]) {
      const pair = result.pairs[j], reference = groups.WITH_RANGE[0].pairs[j];
      assert.equal(pair.scenario, reference.scenario); assert.equal(pair.seed, reference.seed);
      assert.deepEqual(pair.matches.map(m => m.side), [0, 1]);
      for (const m of pair.matches) {
        assert.equal(m.candidate.learnerTeam, m.side); assert.equal(m.baseline.learnerTeam, m.side);
        assert.equal(m.candidate.seed, pair.seed); assert.equal(m.baseline.seed, pair.seed);
        assert.equal(m.candidate.scenario, pair.scenario); assert.equal(m.baseline.scenario, pair.scenario);
        assert.deepEqual(m.baseline, reference.matches[m.side].baseline);
      }
    }
  }
  const stats = {};
  for (const mode of modes) {
    const matrix = groups[mode].map(r => r.pairs.map(p => average(p.matches.map(m => m.candidate.score - m.baseline.score))));
    const matches = groups[mode].flatMap(r => r.pairs.flatMap(p => p.matches));
    const count = kind => Object.fromEntries(['win', 'loss', 'timeout', 'mutual'].map(o => [o, matches.filter(m => m[kind].outcome === o).length]));
    stats[mode] = { ...crossedInterval(matrix, new lab.SimulationRandom(seed ^ 0x4231)),
      candidate: count('candidate'), repeatedMatchedBaseline: count('baseline'),
      perTrainingSeed: groups[mode].map((r, i) => ({ seedIndex: r.seedIndex, meanScoreGain: average(matrix[i]),
        nonBaselineDecisions: r.summary.nonBaselineDecisions, terminalBattles: r.summary.candidate.win + r.summary.candidate.loss + r.summary.candidate.mutual })),
      meanHullGain: average(matches.map(m => (m.candidate.ownHull - m.candidate.enemyHull) - (m.baseline.ownHull - m.baseline.enemyHull))),
      nonBaselineDecisions: matches.reduce((n, m) => n + m.candidate.nonBaselineDecisions, 0),
      byScenario: Object.fromEntries([...new Set(groups[mode][0].pairs.map(p => p.scenario))].map(id => {
        const selected = groups[mode].flatMap(r => r.pairs.filter(p => p.scenario === id).flatMap(p => p.matches));
        return [id, { battles: selected.length, meanScoreGain: average(selected.map(m => m.candidate.score - m.baseline.score)) }];
      })) };
  }
  const increments = groups.WITH_RANGE.map((r, i) => r.pairs.map((p, j) => average(p.matches.map((m, side) =>
    m.candidate.score - groups.WITHOUT_RANGE[i].pairs[j].matches[side].candidate.score))));
  return { ...stats, rangeFeatureIncrement: crossedInterval(increments, new lab.SimulationRandom(seed ^ 0x6217)) };
}
export function distanceStudyGate(summary) {
  const s = summary.WITH_RANGE, reasons = [];
  if (s.trainingSeeds < 3 || s.mirrorPairs < 12) reasons.push('At least three training seeds and twelve mirrored holdout pairs are required.');
  if (s.perTrainingSeed.some(s => s.terminalBattles < 12)) reasons.push('Too few terminal battles for a training seed.');
  if (s.perTrainingSeed.some(s => s.nonBaselineDecisions === 0)) reasons.push('A training seed never used supported distance actions.');
  if (s.interval95[0] <= 0) reasons.push('Distance policy gain over original AI is not established.');
  if (summary.rangeFeatureIncrement.interval95[0] <= 0) reasons.push('Benefit of explicit range observation over the matched feature control is not established.');
  if (s.meanHullGain < -.02) reasons.push('Remaining hull balance regressed.');
  if (Object.values(s.byScenario).some(s => s.meanScoreGain < -.1)) reasons.push('A new held-out scenario regressed materially.');
  if (s.perTrainingSeed.some(s => s.meanScoreGain < -.05)) reasons.push('A training seed regressed materially.');
  return { passed: reasons.length === 0, reasons, deployment: 'NOT_DEPLOYED' };
}
