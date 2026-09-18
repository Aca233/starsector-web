/** Bounded, self-contained cosmetic event windows; never collision or damage input. */
export const MAX_MUZZLE_EVENTS = 4096, MAX_MUZZLE_STYLES = 512, MAX_MUZZLE_PARTICLES = 65536;
const flashKeys = ['length','spread','particleSizeMin','particleSizeRange','particleDuration','particleCount'];
const smokeKeys = ['particleSizeMin','particleSizeRange','cloudParticleCount','cloudDuration','cloudRadius','blowbackParticleCount','blowbackDuration','blowbackLength','blowbackSpread'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const bounded = (value, max = 1e6) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;
export function describeMuzzleStyle(kind, input) {
  if ((kind !== 0 && kind !== 1) || !object(input)) return null;
  const spec = {}, keys = kind === 0 ? flashKeys : smokeKeys;
  for (const key of keys) { const value = input[key]; if (!bounded(value)) return null; spec[key] = value; }
  if (!Array.isArray(input.particleColor) || input.particleColor.length !== 4 || Array.from(input.particleColor).some(v => !bounded(v,255))) return null;
  spec.particleColor = [...input.particleColor];
  const counts = kind === 0 ? [spec.particleCount] : [spec.cloudParticleCount,spec.blowbackParticleCount];
  if (!counts.every(v => Number.isInteger(v) && v <= 2048)) return null;
  const particles = counts.reduce((a,b)=>a+b,0);
  const duration = kind === 0 ? spec.particleDuration : Math.max(spec.cloudParticleCount ? spec.cloudDuration : 0, spec.blowbackParticleCount ? spec.blowbackDuration : 0);
  if (!particles || !bounded(duration,30) || duration === 0) return null;
  const samples = kind === 0 ? 3*spec.particleCount : 4*spec.cloudParticleCount+3*spec.blowbackParticleCount;
  return {style:{kind,spec},particles,samples,duration};
}
export function validateMuzzleEvents(batch) {
  const invalid = () => {throw Error('Invalid muzzle event window');};
  if (!object(batch) || !bounded(batch.time,1e9) || !Number.isSafeInteger(batch.latest) || batch.latest < 0
    || !Array.isArray(batch.styles) || batch.styles.length > MAX_MUZZLE_STYLES || !Array.isArray(batch.events) || batch.events.length > MAX_MUZZLE_EVENTS) invalid();
  const styles=Array.from(batch.styles,style=>{const info=object(style)?describeMuzzleStyle(style.kind,style.spec):null;if(!info)invalid();return info;});
  let previous=0,particles=0;
  for(const row of batch.events){
    if(!Array.isArray(row)||row.length!==9||Array.from(row).some(v=>typeof v!=='number'||!Number.isFinite(v))
      ||!Number.isSafeInteger(row[0])||row[0]<=previous||row[0]>batch.latest||row[1]<0||row[1]>batch.time
      ||!Number.isInteger(row[2])||row[2]<0||row[2]>=styles.length||!Number.isInteger(row[3])||row[3]<0
      ||row.slice(4).some(v=>Math.abs(v)>1e9))invalid();
    previous=row[0];particles+=styles[row[2]].particles;
    if(particles>MAX_MUZZLE_PARTICLES)invalid();
  }
  return styles;
}
