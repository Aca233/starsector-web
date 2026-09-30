// Deterministic scheduling only: never changes a world's ticks, inputs or audits.
export function createArmOrderCycle(arms, { policy = 'balanced', reverse = false } = {}) {
  if (![2, 3].includes(arms.length) || new Set(arms).size !== arms.length || arms.some(arm => typeof arm !== 'string' || !arm)) {
    throw new Error('Benchmark order requires two or three distinct arm names');
  }
  if (!['balanced', 'legacy'].includes(policy) || typeof reverse !== 'boolean') throw new Error('Invalid benchmark order policy');
  // Two-arm alternation already balances positions. Legacy preserves historical
  // three-arm order too, including its always-middle before arm, for reproduction.
  const cycle = policy === 'legacy' || arms.length === 2
    ? [[...arms].reverse(), [...arms]]
    : [[0, 1, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0], [1, 0, 2], [0, 2, 1]].map(order => order.map(i => arms[i]));
  return reverse ? cycle.map(order => order.toReversed()) : cycle;
}

export function countArmPositions(cycle, skip, ticks) {
  if (!Number.isSafeInteger(skip) || skip < 0 || !Number.isSafeInteger(ticks) || ticks < 0) throw new Error('Invalid benchmark order window');
  const counts = Object.fromEntries(cycle[0].map(arm => [arm, Array(cycle[0].length).fill(0)]));
  for (let tick = skip; tick < skip + ticks; tick++) {
    const order = cycle[tick % cycle.length];
    for (let position = 0; position < order.length; position++) counts[order[position]][position]++;
  }
  return counts;
}
