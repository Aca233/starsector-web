/** Frozen particle motion compression reference v1, NOT gameplay math.
 * Only fixed IEEE-754 arithmetic. Never display an uncorrected reference.
 * Do not replace with Math.sin/cos/exp: those differ across JS runtimes. */
const PI = 3.141592653589793, HALF_PI = 1.5707963267948966, TAU = 6.283185307179586;
export function particleReferenceAngle(angle, speed) {
  if (!Number.isFinite(angle) || angle < 0 || angle > TAU || !Number.isFinite(speed)) throw Error('Invalid particle reference angle');
  let x = angle > PI ? angle - TAU : angle, sign = 1;
  if (x > HALF_PI) { x = PI - x; sign = -1; }
  else if (x < -HALF_PI) { x = -PI - x; sign = -1; }
  const square = x * x; let sin = x, cos = 1, s = x, c = 1;
  for (let k = 1; k <= 12; k++) {
    s = -s * square / ((2 * k) * (2 * k + 1)); sin += s;
    c = -c * square / ((2 * k - 1) * (2 * k)); cos += c;
  }
  return [sign * cos * speed, sin * speed];
}
export function particleReferenceDrag(x) {
  if (!Number.isFinite(x) || x < -0.1 || x > 0) throw Error('Invalid particle reference drag');
  let sum = 1, term = 1;
  for (let k = 1; k <= 16; k++) { term = term * x / k; sum += term; }
  return sum;
}
const bits = new DataView(new ArrayBuffer(16)), TWO32 = 4294967296, MAX_DELTA = 65535;
const valid = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e12;
const invalid = () => { throw Error('Invalid particle motion residual'); };
/** [literalMask, x, y, vx, vy]. Unmasked entries are signed bit-pattern deltas,
 * not arithmetic differences or quantization. Mask bits 4..7 retain literal -0
 * across JSON/MessagePack writers that normalize numeric zero. Large/cross-sign cases are raw. */
export function encodeParticleMotionResidual(actual, reference) {
  if (!Array.isArray(actual) || !Array.isArray(reference) || actual.length !== 4 || reference.length !== 4 || !Array.from(actual).every(valid) || !Array.from(reference).every(valid)) invalid();
  const out = [0];
  for (let i = 0; i < 4; i++) {
    bits.setFloat64(0, reference[i]); bits.setFloat64(8, actual[i]);
    const delta = (bits.getUint32(8) - bits.getUint32(0)) * TWO32 + bits.getUint32(12) - bits.getUint32(4);
    // The high-word bound ensures this subtraction is exact before checking it.
    if (Math.abs(bits.getUint32(8) - bits.getUint32(0)) <= 1 && Number.isSafeInteger(delta) && Math.abs(delta) <= MAX_DELTA) out.push(delta);
    else { out[0] |= 1 << i; if (Object.is(actual[i], -0)) out[0] |= 1 << (i + 4); out.push(actual[i] === 0 ? 0 : actual[i]); }
  }
  // Even an all-literal row keeps this format, so one birth group never
  // alternates between two decoder modes/caches inside the same cold frame.
  return out;
}
export function validateParticleMotion(value) {
  if (!Array.isArray(value) || (value.length !== 4 && value.length !== 5) || !Array.from(value).every(valid)) invalid();
  if (value.length === 4) return;
  if (!Number.isInteger(value[0]) || value[0] < 0 || value[0] > 255 || Object.is(value[0], -0)) invalid();
  for (let i = 0; i < 4; i++) if ((value[0] & (1 << (i + 4))) && (!(value[0] & (1 << i)) || value[i + 1] !== 0)) invalid();
  for (let i = 0; i < 4; i++) if (!(value[0] & (1 << i)) && (!Number.isInteger(value[i + 1]) || Math.abs(value[i + 1]) > MAX_DELTA || Object.is(value[i + 1], -0))) invalid();
}
export function decodeParticleMotionResidual(value, reference) {
  validateParticleMotion(value);
  if (value.length === 4) return value.slice();
  if (!Array.isArray(reference) || reference.length !== 4 || !Array.from(reference).every(valid)) invalid();
  const out = [];
  for (let i = 0; i < 4; i++) {
    if (value[0] & (1 << i)) { out.push(value[0] & (1 << (i + 4)) ? -0 : value[i + 1]); continue; }
    bits.setFloat64(0, reference[i]);
    let lo = bits.getUint32(4) + value[i + 1], hi = bits.getUint32(0);
    if (lo < 0) { lo += TWO32; hi--; } else if (lo >= TWO32) { lo -= TWO32; hi++; }
    if (hi < 0 || hi >= TWO32) invalid();
    bits.setUint32(0, hi); bits.setUint32(4, lo);
    const n = bits.getFloat64(0); if (!valid(n)) invalid(); out.push(n);
  }
  return out;
}
