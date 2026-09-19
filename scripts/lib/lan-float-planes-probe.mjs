// Portable benchmark core: the SAME functions execute in Node and an Edge
// dedicated Worker. No Node dependencies or game mutations here.
import { encodeProjectedBinaryFrame, decodeBinaryFrame, decodeBinaryState } from '../../src/network/BinarySnapshot.mjs';
import { shuffleLanFrame, unshuffleLanFrame } from '../../src/network/experimental/LanFloatPlanes.mjs';

export const plan = Object.freeze({ warmupPerFrame: 30, rounds: 6, samplesPerBlock: 20,
  gates: { minimumCompressionSaving: 0.10, maximumHostWorkerRatio: 1.10, maximumGuestWorkerRatio: 1.10,
    maximumNodeCombinedRatio: 1.10, maximumWorkerP95ExtraMs: 1 },
  scope: 'Recorded complete 32-ship frames; no running game, render/input latency or physical network measurement' });
export function check(condition, message) { if (!condition) throw Error(message); }
export function equalBytes(a, b) { return a.length === b.length && a.every((v, i) => v === b[i]); }
export function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return { n: values.length, mean: values.reduce((s, n) => s + n, 0) / values.length,
    median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.ceil(sorted.length * .95) - 1], min: sorted[0], max: sorted.at(-1) };
}
export function inputsFrom(buffers) {
  return buffers.map(buffer => {
    const state = decodeBinaryState(buffer), baseline = encodeProjectedBinaryFrame(state.frame), candidate = shuffleLanFrame(baseline);
    check(state.frame.ships.length === 32, 'expected full 32-ship frame');
    check(candidate !== null && equalBytes(unshuffleLanFrame(candidate), baseline), 'byte identity');
    check(JSON.stringify(decodeBinaryFrame(unshuffleLanFrame(candidate))) === JSON.stringify(decodeBinaryFrame(baseline)), 'tree/key order identity');
    return { state, baseline, candidate };
  });
}
export function runCodecBenchmark(inputs) {
  const result = { plan, phases: {}, transferChecks: [], fullTreeAndByteEquality: true };
  const host = {
    baseline: input => encodeProjectedBinaryFrame(input.state.frame),
    candidate: input => shuffleLanFrame(encodeProjectedBinaryFrame(input.state.frame)),
  };
  const guest = {
    baseline: input => decodeBinaryFrame(input.baseline),
    candidate: input => decodeBinaryFrame(unshuffleLanFrame(input.candidate)),
  };
  for (const [phase, functions] of Object.entries({ host, guest })) {
    for (const input of inputs) for (let w = 0; w < plan.warmupPerFrame; w++) {
      for (const key of w % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']) functions[key](input);
    }
    const pairs = [];
    for (let round = 0; round < plan.rounds; round++) for (let index = 0; index < inputs.length; index++) {
      const input = inputs[index], order = (round + index) % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate'];
      const pair = { round, index, order, blocks: {} };
      for (const key of order) {
        const samples = [], outputs = [], fn = functions[key];
        for (let i = 0; i < plan.samplesPerBlock; i++) {
          const at = performance.now(); outputs.push(fn(input)); samples.push(performance.now() - at);
        }
        // Validation outside the timed section. No quantization/schema reduction.
        if (phase === 'host') for (const bytes of outputs) check(equalBytes(bytes, input[key]), 'host output changed');
        else check(JSON.stringify(outputs.at(-1)) === JSON.stringify(decodeBinaryFrame(input.baseline)), 'guest tree changed');
        pair.blocks[key] = { ...stats(samples), samples };
      }
      pairs.push(pair);
    }
    const byFrame = inputs.map((_, index) => {
      const relevant = pairs.filter(p => p.index === index);
      const a = stats(relevant.flatMap(p => p.blocks.baseline.samples)), b = stats(relevant.flatMap(p => p.blocks.candidate.samples));
      return { index, baseline: a, candidate: b, meanRatio: b.mean / a.mean, p95ExtraMs: b.p95 - a.p95,
        pairedMeanGeomean: Math.exp(relevant.reduce((s, p) => s + Math.log(p.blocks.candidate.mean / p.blocks.baseline.mean), 0) / relevant.length) };
    });
    const a = stats(pairs.flatMap(p => p.blocks.baseline.samples)), b = stats(pairs.flatMap(p => p.blocks.candidate.samples));
    result.phases[phase] = { baseline: a, candidate: b, meanRatio: b.mean / a.mean, p95ExtraMs: b.p95 - a.p95, byFrame, pairs };
  }
  for (const input of inputs) {
    const bytes = shuffleLanFrame(input.baseline), copy = bytes.slice();
    const moved = structuredClone(bytes, { transfer: [bytes.buffer] });
    check(bytes.buffer.byteLength === 0 && equalBytes(moved, copy), 'transfer detach');
    check(equalBytes(shuffleLanFrame(input.baseline), copy), 'transfer reencode');
    result.transferChecks.push({ detached: true, repeatByteExact: true });
  }
  return result;
}
