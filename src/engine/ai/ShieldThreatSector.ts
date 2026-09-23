import { signedAngle } from '../math/Angles';

interface SectorThreat { direction: number; shieldFlux: number; eta: number }
const TAU = Math.PI * 2;
// More than the rounding slack in the legacy predicate and the translated angles.
const PAD = 1e-11;
function covered(direction: number, center: number, halfArc: number): boolean {
  const difference = direction - center, absolute = Math.abs(difference);
  const separation = absolute <= Math.PI ? absolute : TAU - absolute;
  return absolute <= TAU && Math.abs(separation - halfArc) > 1e-12
    ? separation <= halfArc : Math.abs(signedAngle(difference)) <= halfArc;
}

/** Same shield-sector decision and EXACT original-order Float64 additions. Angle
 * sorting only discovers membership; it never sorts damage accumulation or ties.
 * Unlike a prefix-sum/sliding-sum algorithm, no floating-point reassociation occurs. */
export function selectThreatFacing(threats: readonly SectorThreat[], halfArc: number): number | null {
  const n = threats.length, weights = threats.map(t => t.shieldFlux / (1 + t.eta));
  let best = -1, facing: number | null = null;
  if (n < 128 || !(halfArc > 1e-9 && halfArc < Math.PI - 1e-9)
    || threats.some(t => !Number.isFinite(t.direction) || Math.abs(t.direction) > Math.PI)) {
    for (const candidate of threats) {
      let weight = 0;
      for (let i = 0; i < n; i++) if (covered(threats[i].direction, candidate.direction, halfArc)) weight += weights[i];
      if (weight > best) { best = weight; facing = candidate.direction; }
    }
    return facing;
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => threats[a].direction - threats[b].direction || a - b);
  const angles = new Float64Array(n * 3), members = new Uint32Array(Math.ceil(n / 32)), scores = new Float64Array(n);
  for (let i = 0; i < angles.length; i++) angles[i] = threats[order[i % n]].direction + (Math.floor(i / n) - 1) * TAU;
  let lo = 0, hi = 0, priorDirection: number | undefined, priorScore = 0;
  const excluded: number[] = [];
  for (const candidate of order) {
    const center = threats[candidate].direction;
    if (center === priorDirection) { scores[candidate] = priorScore; continue; }
    const lower = center - halfArc, upper = center + halfArc;
    while (lo < angles.length && angles[lo] < lower - PAD) {
      if (lo < hi) { const index = order[lo % n]; members[index >>> 5] &= ~(1 << (index & 31)); }
      lo++;
    }
    if (hi < lo) hi = lo;
    while (hi < angles.length && angles[hi] <= upper + PAD) {
      const index = order[hi++ % n]; members[index >>> 5] |= 1 << (index & 31);
    }
    // Only rounded endpoints need the legacy trig predicate. The interior is
    // strictly inside the arc; the expanded window never drops a boundary hit.
    const check = (i: number) => {
      const index = order[i % n];
      if (!covered(threats[index].direction, center, halfArc)) {
        members[index >>> 5] &= ~(1 << (index & 31)); excluded.push(index);
      }
    };
    for (let i = lo; i < hi && angles[i] <= lower + PAD; i++) check(i);
    for (let i = hi - 1; i >= lo && angles[i] >= upper - PAD; i--) check(i);
    let weight = 0;
    // Least significant set bits give ORIGINAL threat order, including signed
    // zero, negative/NaN/Infinity weights, and rounding-sensitive accumulations.
    for (let block = 0; block < members.length; block++) {
      let word = members[block];
      while (word) {
        const low = word & -word;
        weight += weights[block * 32 + 31 - Math.clz32(low)];
        word = (word ^ low) >>> 0;
      }
    }
    for (const index of excluded) members[index >>> 5] |= 1 << (index & 31);
    excluded.length = 0;
    scores[candidate] = priorScore = weight; priorDirection = center;
  }
  for (let i = 0; i < n; i++) if (scores[i] > best) { best = scores[i]; facing = threats[i].direction; }
  return facing;
}
