/** CargoData resource operations, in native slot/float order. Does not generate or sort ships/weapons. */
import { finite, requireThat, isRecord } from '../core/Values.mjs';
import { ORIGINAL_MARKET_REFERENCE as R } from './OriginalMarketPricing.mjs';
const f = Math.fround;
const check = (ok, message) => requireThat(ok, 'UNSUPPORTED_RESOURCE_CARGO', message);
const number = (v, label, min = 0, max = 2 ** 31) => { finite(v, label, min, max); check(v === f(v), label + ' must be a native float'); return v; };
function spec(id) { const s = Object.hasOwn(R.commodities, id) && R.commodities[id]; check(s && !s.plugin, 'Resource spec requires a native decoder'); return s; }
export function validateOriginalResourceCargo(cargo) {
 check(isRecord(cargo) && typeof cargo.unlimitedStacks === 'boolean' && Array.isArray(cargo.slots) && cargo.slots.length <= 65536, 'Invalid cargo slots');
 check(cargo.partials === null || isRecord(cargo.partials) && Object.keys(cargo.partials).length <= 256, 'Invalid partials');
 for (const [key, value] of Object.entries(cargo.partials ?? {})) { check(key.startsWith('RESOURCES'), 'Unknown resource partial key'); spec(key.slice(9)); number(value, 'partial', -1, 1); }
 for (const stack of cargo.slots) {
  if (stack === null) continue;
  check(isRecord(stack) && typeof stack.type === 'string', 'Invalid cargo stack'); number(stack.size, 'stack size');
  if (stack.type !== 'RESOURCES') continue; // Opaque non-resource slots stay in place; their lifecycle is not imported here.
  spec(stack.commodityId); number(stack.maxSize, 'stack maximum', 1); check(typeof stack.roundSize === 'boolean', 'Missing roundSize');
 }
}
export function originalResourceQuantity(cargo, commodityId) {
 let result = 0;
 for (const stack of cargo.slots) if (stack?.type === 'RESOURCES' && stack.commodityId === commodityId) result = f(result + stack.size);
 return result;
}
function find(cargo, id) {
 let index = -1;
 for (let n = 0; n < cargo.slots.length; n++) { const s = cargo.slots[n]; if (s?.type === 'RESOURCES' && s.commodityId === id && (index < 0 || cargo.slots[index].size > s.size)) index = n; }
 return index;
}
function setSize(stack, value) { stack.size = f(Math.min(stack.maxSize, Math.max(0, stack.roundSize ? Math.trunc(value) : value))); }
function setPartial(cargo, key, value) { if (value === 0) delete cargo.partials[key]; else cargo.partials[key] = value; }
function withPartials(cargo, id, amount, remove) {
 if (cargo.partials === null) return amount;
 const key = 'RESOURCES' + id, remainder = f(amount - f(Math.trunc(amount))), old = cargo.partials[key] ?? 0;
 const combined = remove ? f(remainder - old) : f(old + remainder);
 let whole = f(Math.trunc(amount));
 if (combined >= 1) { const carry = f(Math.trunc(combined)); whole = f(whole + carry); setPartial(cargo, key, f((remove ? -1 : 1) * f(combined - carry))); }
 else setPartial(cargo, key, f((remove ? -1 : 1) * combined));
 return whole;
}
/** In-place trusted draft operation; discard the draft if a bound/validation fails. */
export function addOriginalResourceCargo(cargo, commodityId, amount, updateSpaceUsed = () => {}, mutationReady = () => {}) {
 number(amount, 'resource amount'); const s = spec(commodityId); if (amount <= 0) return;
 amount = withPartials(cargo, commodityId, amount, false); if (amount <= 0) return; mutationReady(amount);
 let iterations = 0;
 do {
  check(++iterations <= 65536, 'Resource operation work limit');
  let index = find(cargo, commodityId), stack = cargo.slots[index];
  if (!stack || stack.size >= stack.maxSize) {
   if (amount < 1) break;
   stack = { objectRef: null, type: 'RESOURCES', commodityId, size: 0, maxSize: cargo.unlimitedStacks ? 1000000 : s.stackSize, roundSize: false, cargoSpacePerUnit: s.cargoSpace };
   index = cargo.slots.findIndex(row => row === null || row.type === 'NULL' || row.size <= 0);
   if (index < 0) { check(cargo.slots.length < 65536, 'Cargo slot limit'); index = cargo.slots.length; }
   cargo.slots[index] = stack; updateSpaceUsed();
   // addStack's partial handling has no effect for a new zero-sized resource stack.
  }
  const used = Math.min(f(stack.maxSize - stack.size), amount); setSize(stack, f(stack.size + used)); updateSpaceUsed();
  const next = f(amount - used); check(next < amount, 'Resource add did not make float progress'); amount = next;
 } while (amount >= 1);
 updateSpaceUsed();
}
export function removeOriginalResourceCargo(cargo, commodityId, amount, updateSpaceUsed = () => {}, mutationReady = () => {}) {
 number(amount, 'resource amount'); spec(commodityId); if (amount <= 0) return true;
 amount = withPartials(cargo, commodityId, amount, true); if (amount <= 0) return true; mutationReady(amount);
 let iterations = 0;
 while (amount > 0) {
  check(++iterations <= 65536, 'Resource operation work limit');
  const index = find(cargo, commodityId); if (index < 0) return false;
  const stack = cargo.slots[index], used = Math.min(stack.size, amount); setSize(stack, f(stack.size - used)); updateSpaceUsed();
  if (stack.size < 1) cargo.slots[index] = null;
  const next = f(amount - used); check(next < amount || cargo.slots[index] === null, 'Resource remove did not make float progress'); amount = next;
 }
 updateSpaceUsed(); return true;
}
