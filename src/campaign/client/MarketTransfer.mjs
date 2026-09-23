import { createCargoTransfer, cargoTransferRetained, cargoTransferItems, returnHeldCargo } from './CargoTransfer.mjs';
const equal = (a, b) => a != null && b != null && new Set([...Object.keys(a), ...Object.keys(b)]).size <= 4096
  && [...new Set([...Object.keys(a), ...Object.keys(b)])].every(id => (a[id] ?? 0) === (b[id] ?? 0));
export function createMarketTransfer(cargo, inventory) {
  const player = createCargoTransfer(cargo), market = createCargoTransfer(inventory);
  return { ...player, marketBaseline: market.baseline, discard: market.hold };
}
export function marketTransferMatches(state, cargo, inventory) { return equal(state.baseline, cargo) && equal(state.marketBaseline, inventory); }
/** One ordered NET line per commodity. Never quote the cursor as already transferred. */
export function marketTransferItems(state) {
  if (state.held) return [];
  const held = cargoTransferRetained(state), other = cargoTransferItems(state), lines = [];
  for (const id of new Set([...Object.keys(state.baseline), ...Object.keys(state.marketBaseline), ...Object.keys(held), ...Object.keys(other)])) {
    const delta = (held[id] ?? 0) - (state.baseline[id] ?? 0);
    const opposite = (state.marketBaseline[id] ?? 0) - (other[id] ?? 0);
    const net = Math.round(delta), scale = Math.max(1, Math.abs(held[id] ?? 0), Math.abs(state.baseline[id] ?? 0), Math.abs(other[id] ?? 0), Math.abs(state.marketBaseline[id] ?? 0));
    const tolerance = Math.min(Number.EPSILON * scale * 2, Math.max(1, Math.abs(net)) * 1e-9);
    if (!Number.isFinite(delta) || !Number.isSafeInteger(net) || Math.abs(delta - net) > tolerance || Math.abs(opposite - net) > tolerance) return null;
    if (net !== 0) {
      lines.push({ commodityId: id, side: net > 0 ? 'buy' : 'sell', quantity: Math.abs(net) });
    }
  }
  return lines.length <= 64 ? lines : null;
}
export function marketTransferPending(state) { return !!state.held || !equal(cargoTransferRetained(state), state.baseline) || !equal(cargoTransferItems(state), state.marketBaseline); }
function restore(slots, baseline) {
  const remaining = { ...baseline };
  const result = slots.map(stack => {
    if (!stack) return null;
    const quantity = Math.min(stack.quantity, remaining[stack.id] ?? 0);
    remaining[stack.id] = (remaining[stack.id] ?? 0) - quantity;
    return quantity > 0 ? { id: stack.id, quantity } : null;
  });
  for (const [id, quantity] of Object.entries(remaining)) if (quantity > 0) {
    const same = result.findIndex(s => s?.id === id);
    if (same >= 0) result[same] = { id, quantity: result[same].quantity + quantity };
    else { const empty = result.indexOf(null); if (empty >= 0) result[empty] = { id, quantity }; else result.push({ id, quantity }); }
  }
  return result;
}
export function cancelMarketTransfer(state) {
  const next = returnHeldCargo(state);
  return { ...next, hold: restore(next.hold, state.baseline), discard: restore(next.discard, state.marketBaseline), held: null };
}
