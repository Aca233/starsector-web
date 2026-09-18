const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
/** Statistical unit = one seed/scenario with BOTH learner sides, not correlated per-ship decisions. */
export function summarizeFleetEvaluation(pairs, random) {
  const matches = pairs.flatMap(pair => pair.matches);
  const scoreGains = pairs.map(pair => mean(pair.matches.map(m => m.candidate.score - m.baseline.score)));
  const samples = [];
  for (let i = 0; i < 2000 && scoreGains.length; i++) {
    let sum = 0;
    for (let j = 0; j < scoreGains.length; j++) sum += scoreGains[Math.floor(random.next() * scoreGains.length)];
    samples.push(sum / scoreGains.length);
  }
  samples.sort((a, b) => a - b);
  const counts = mode => Object.fromEntries(['win', 'loss', 'timeout', 'mutual'].map(k => [k, matches.filter(m => m[mode].outcome === k).length]));
  const byScenario = Object.fromEntries([...new Set(pairs.map(p => p.scenario))].map(id => {
    const group = matches.filter(m => m.candidate.scenario === id);
    return [id, { matches: group.length,
      meanScoreGain: mean(group.map(m => m.candidate.score - m.baseline.score)),
      meanHullGain: mean(group.map(m => (m.candidate.ownHull - m.candidate.enemyHull) - (m.baseline.ownHull - m.baseline.enemyHull))) }];
  }));
  return { mirrorPairs: pairs.length, battles: matches.length, candidate: counts('candidate'), baseline: counts('baseline'),
    meanCandidateScore: mean(matches.map(m => m.candidate.score)),
    meanScoreGain: mean(scoreGains), scoreGain95Interval: [samples[Math.floor(samples.length * .025)] ?? 0, samples[Math.floor(samples.length * .975)] ?? 0],
    meanHullGain: mean(matches.map(m => (m.candidate.ownHull - m.candidate.enemyHull) - (m.baseline.ownHull - m.baseline.enemyHull))),
    meanRewardGain: mean(matches.map(m => m.candidate.reward - m.baseline.reward)),
    nonBaselineDecisions: matches.reduce((n, m) => n + m.candidate.nonBaselineDecisions, 0), byScenario };
}
/** Preregistered conservative screening, not automatic deployment or a safety certificate. */
export function fleetPromotionGate(summary) {
  const reasons = [];
  if (summary.mirrorPairs < 12) reasons.push('At least 12 mirrored held-out pairs are required.');
  if (summary.candidate.win + summary.candidate.loss + summary.candidate.mutual < 12) reasons.push('At least 12 candidate battles must reach an actual terminal outcome.');
  if (summary.nonBaselineDecisions === 0) reasons.push('No supported non-baseline actions were exercised.');
  if (summary.scoreGain95Interval[0] <= 0) reasons.push('The paired score-gain interval does not exclude zero.');
  if (summary.meanHullGain < -.02) reasons.push('Overall remaining-hull balance regressed.');
  if (Object.values(summary.byScenario).some(s => s.meanScoreGain < -.1)) reasons.push('A held-out scenario regressed materially.');
  return { passed: reasons.length === 0, reasons, deployment: 'NOT_DEPLOYED' };
}
