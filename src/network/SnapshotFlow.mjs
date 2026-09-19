/** Fixed-size interval counters. Rates are observations, never target-clamped.
 * Only the local monotonic clock is used. No packets, IDs or payloads retained. */
export class FlowCounters {
  constructor(keys, now = performance.now()) {
    this.keys = [...keys]; this.reset(now);
  }
  reset(now = performance.now()) {
    this.at = now; this.counts = Object.fromEntries(this.keys.map(k => [k, 0]));
    this.last = { windowMs: null, rates: Object.fromEntries(this.keys.map(k => [k, null])) };
  }
  count(key, amount = 1) {
    if (!Object.hasOwn(this.counts, key) || !Number.isSafeInteger(amount) || amount < 0) throw Error('Invalid flow counter');
    this.counts[key] += amount;
  }
  sample(now = performance.now()) {
    if (!Number.isFinite(now)) throw Error('Invalid counter clock');
    if (now < this.at) this.reset(now);
    const elapsed = now - this.at;
    if (elapsed >= 1000) {
      // A suspended process is not a current throughput measurement.
      this.last = { windowMs: elapsed, rates: Object.fromEntries(this.keys.map(k => [k, elapsed > 5000 ? null : this.counts[k] * 1000 / elapsed])) };
      for (const k of this.keys) this.counts[k] = 0;
      this.at = now;
    }
    return { windowMs: this.last.windowMs, rates: { ...this.last.rates } };
  }
}

const finite = (v, max) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
/** Allowlist only; never forward the complete Worker diagnostic object. */
export function publicAuthorityPerformance(value) {
  if (!object(value) || !Number.isSafeInteger(value.tick) || value.tick < 0) return null;
  const result = { tick: value.tick };
  for (const key of ['simulationMs', 'captureMs', 'encodeMs', 'callbackGapMs', 'backlogMs']) {
    if (!finite(value[key], 300000)) return null;
    result[key] = value[key];
  }
  if (object(value.flow) && object(value.flow.rates)) {
    const flow = { windowMs: value.flow.windowMs, rates: {} };
    if (flow.windowMs !== null && !finite(flow.windowMs, 300000)) return null;
    for (const key of ['simulated', 'produced', 'blocked']) {
      const v = value.flow.rates[key];
      if (v !== null && !finite(v, 100000)) return null;
      flow.rates[key] = v;
    }
    result.flow = flow;
  }
  return result;
}
