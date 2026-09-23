/** Native HUD presentation only. Capacity and minimum crew are server values. */
const known = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
export function hudInteger(n, round = false) { return known(n) ? String(round ? Math.round(n) : Math.trunc(n)) : '—'; }
export function hudSupplies(n) { return known(n) && n === 0 ? '补给不足' : hudInteger(n); }
export function hudRoundedValue(n) {
  if (!known(n)) return '—';
  return n >= 10 || Math.abs(Math.round(n) - n) < 1e-4 ? String(Math.round(n)) : (Math.round(n * 10) / 10).toFixed(1);
}
export function hudSupplyRate(n, count) {
  if (known(count) && count === 0) return '';
  if (!known(n)) return '— / 天';
  // Native getRoundedValueMaxOneAfterDecimal: >=10 rounds to integers;
  // otherwise retain one decimal unless already within 1e-4 of an integer.
  const text = hudRoundedValue(n);
  return '-' + text + ' / 天';
}
export function hudCapacity(value, capacity) {
  const text = hudInteger(value, true) + ' / ' + hudInteger(capacity);
  if (!known(value) || !known(capacity)) return { text, known: false, fill: 0, excess: 0, overloaded: false };
  if (value > capacity) return { text, known: true, fill: capacity / value, excess: (value - capacity) / value, overloaded: true };
  return { text, known: true, fill: capacity > 0 ? value / capacity : 0, excess: 0, overloaded: false };
}
export function hudCargoQuantity(cargo, id) {
  if (!cargo || typeof cargo !== 'object' || Array.isArray(cargo)) return undefined;
  const n = Object.hasOwn(cargo, id) ? cargo[id] : 0;
  return known(n) ? n : undefined;
}

/** coreui.C: ten rounded UI samples; +/-0.1 sum hysteresis, not a simulation filter. */
export function hudBurnSample(state,level) {
  const f=Math.fround,samples=[...state.samples,Math.min(999,Math.round(level))].slice(-10);
  const sum=samples.reduce((a,b)=>f(a+b),0),round=n=>Math.round(f(n/samples.length));
  const candidates=[round(sum),round(f(sum+f(.1))),round(f(sum-f(.1)))];
  return {samples,level:candidates.includes(state.level)?state.level:candidates[0]};
}
