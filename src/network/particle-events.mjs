// Complete, bounded native additive-particle windows. No damage/physics authority.
export const PARTICLE_EVENT_LIMITS = Object.freeze({ groups: 128, particles: 2048, steps: 64 });
const integer = (v, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(v) && v >= 0 && v <= max;
export function particleEventWeight(recipe) { return recipe[1] === 0 ? 10 : recipe[5]; }
export function validateParticleEvents(batch) {
  const bad = () => { throw Error('Invalid local particle events'); };
  if (!batch || typeof batch !== 'object' || Array.isArray(batch) || batch.version !== 1
      || !integer(batch.epoch) || !integer(batch.step) || !integer(batch.latest)
      || !Array.isArray(batch.events) || batch.events.length > PARTICLE_EVENT_LIMITS.groups) bad();
  let previous = 0, work = 0;
  for (const row of batch.events) {
    if (!Array.isArray(row) || row.length !== 3 || !integer(row[0]) || row[0] <= previous || row[0] > batch.latest
        || !integer(row[1]) || row[1] > batch.step || batch.step - row[1] > PARTICLE_EVENT_LIMITS.steps) bad();
    previous = row[0];
    const r = row[2];
    if (!Array.isArray(r) || r.length !== 11 || !Array.from(r).every(Number.isFinite) || r[0] !== 1 || (r[1] !== 0 && r[1] !== 2)
        || !Number.isInteger(r[2]) || r[2] < 0 || r[2] > 1e18 || Math.abs(r[3]) > 1e9 || Math.abs(r[4]) > 1e9
        || r[5] <= 0 || r[5] > (r[1] === 0 ? 1e9 : 720) || (r[1] === 2 && !integer(r[5],720))
        || r.slice(6,9).some(v=>v<0||v>255) || r[9] !== 0 || r[10] !== 0) bad();
    work += particleEventWeight(r);
    if (work > PARTICLE_EVENT_LIMITS.particles) bad();
  }
  return batch;
}
