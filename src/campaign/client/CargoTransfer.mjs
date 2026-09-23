import { sortCommodityCargo } from './CargoSort.mjs';

/**
 * Ordinary commodity cargo gestures; no network or commodity policy.
 * Native 0.98a-RC8 trade/F.java:245-288,479-590 and the 2026-09-20
 * cargo UI audit cover pickup/drop/merge/swap and returning held cargo.
 * Shift follows the quantity audit; Ctrl capacity policy remains outside this API; quickCargoTransfer only applies a quoted amount.
 */
const DISCARD_ID_LIMIT = 64; // Web transaction limit, not a native stack limit.
const LOCAL_SLOT_LIMIT = 4096; // Web allocation guard per container, not a native cargo limit.
const isSide = side => side === 'hold' || side === 'discard';
const isCargo = cargo => cargo !== null && typeof cargo === 'object' && !Array.isArray(cargo);
const positiveEntries = cargo => isCargo(cargo)
  ? Object.entries(cargo).filter(([, quantity]) => Number.isFinite(quantity) && quantity > 0)
  : [];

export function createCargoTransfer(cargo) {
  const entries = positiveEntries(cargo);
  return {
    // fromEntries defines own data properties, including the literal __proto__ key.
    baseline: Object.fromEntries(entries),
    hold: entries.map(([id, quantity]) => ({ id, quantity })),
    discard: [],
    held: null,
  };
}

function withSlot(slots, index, stack) {
  const next = [...slots];
  while (next.length <= index) next.push(null);
  next[index] = stack;
  return next;
}

function acceptTransfer(previous, next) {
  // Check the complete candidate, including swaps and returns, before committing.
  // A rejected operation retains the original held stack and every slot exactly.
  const ids = new Set(next.discard.filter(stack => stack !== null).map(stack => stack.id));
  return ids.size <= DISCARD_ID_LIMIT ? next : previous;
}

export function clickCargoSlot(state, side, index) {
  if (state.held?.selectionTotal !== undefined) return state;
  if (!isSide(side) || !Number.isInteger(index) || index < 0 || index >= LOCAL_SLOT_LIMIT) return state;
  const target = state[side][index] ?? null;
  if (!state.held) {
    if (!target) return state;
    return acceptTransfer(state, {
      ...state,
      [side]: withSlot(state[side], index, null),
      held: { stack: target, source: side, index },
    });
  }
  const stack = state.held.stack;
  if (target?.id === stack.id) {
    const quantity = conservingSum(target.quantity, stack.quantity);
    if (quantity === null) return state;
    return acceptTransfer(state, {
      ...state,
      [side]: withSlot(state[side], index, { id: stack.id, quantity }),
      held: null,
    });
  }
  return acceptTransfer(state, {
    ...state,
    [side]: withSlot(state[side], index, stack),
    // A swap starts a new pickup in the destination container. Its occupied
    // source slot must not be overwritten when the displaced stack is returned.
    held: target ? { stack: target, source: side, index } : null,
  });
}

/** Atomically move a server-quoted amount; never pick up the mouse cursor. */
export function quickCargoTransfer(state, side, index, amount) {
  if (state.held || !isSide(side) || !Number.isInteger(index) || index < 0 || index >= LOCAL_SLOT_LIMIT) return state;
  const stack = state[side][index];
  if (!stack || !Number.isFinite(amount) || amount <= 0 || amount > stack.quantity) return state;
  const remainder = stack.quantity - amount;
  if (remainder > 0 && conservingSum(remainder, amount) !== stack.quantity) return state;
  const other = side === 'hold' ? 'discard' : 'hold', slots = state[other];
  let destination = slots.findIndex(row => row?.id === stack.id);
  if (destination < 0) destination = slots.findIndex(row => row === null);
  if (destination < 0) destination = slots.length;
  if (destination >= LOCAL_SLOT_LIMIT) return state;
  const total = conservingSum(slots[destination]?.quantity ?? 0, amount);
  if (total === null) return state;
  return acceptTransfer(state, { ...state,
    [side]: withSlot(state[side], index, remainder > 0 ? { id: stack.id, quantity: remainder } : null),
    [other]: withSlot(slots, destination, { id: stack.id, quantity: total }),
  });
}

export function returnHeldCargo(state) {
  if (!state.held) return state;
  const { stack, source, index, remainder } = state.held;
  if (stack.quantity === 0) return { ...state, held: null };
  // Native cancellation merges only into the actual surviving source remainder,
  // not an arbitrary same-ID stack or an item swapped into the old source slot.
  if (remainder && state[source][index] === remainder) {
    const quantity = conservingSum(remainder.quantity, stack.quantity);
    if (quantity === null) return state;
    return acceptTransfer(state, { ...state, [source]: withSlot(state[source], index, { id: stack.id, quantity }), held: null });
  }
  const slots = state[source];
  // Whole-stack pickup removes the original object. Native F.java:268-280
  // therefore takes findFirstUnusedIndex(), even when the original slot is empty.
  let destination = slots.findIndex(slot => slot === null);
  if (destination < 0) destination = slots.length;
  if (destination >= LOCAL_SLOT_LIMIT) return state;
  return acceptTransfer(state, {
    ...state,
    [source]: withSlot(slots, destination, stack),
    held: null,
  });
}

/** Shift-left starts selection (>4) or takes one; on the surviving original
 * remainder, Shift-left/right adjust the held quantity by +/-1. */
export function shiftCargoSlot(state, side, index, button = 'left') {
  if (!isSide(side) || !Number.isInteger(index) || index < 0 || index >= LOCAL_SLOT_LIMIT
    || !['left', 'right'].includes(button) || state.held?.selectionTotal !== undefined) return state;
  const target = state[side][index], held = state.held;
  if (held) {
    if (held.source === side && held.index === index && held.remainder && target === held.remainder) {
      const total = conservingSum(target.quantity, held.stack.quantity);
      if (total === null) return state;
      const quantity = button === 'left' ? Math.min(total, held.stack.quantity + 1) : Math.max(0, held.stack.quantity - 1);
      if (quantity === 0) return returnHeldCargo(state);
      return splitAt(state, side, index, held.stack.id, total, quantity, false);
    }
    return button === 'left' ? clickCargoSlot(state, side, index) : state;
  }
  if (!target || button !== 'left') return state;
  return splitAt(state, side, index, target.id, target.quantity, Math.min(1, target.quantity), target.quantity > 4);
}

function splitAt(state, side, index, id, total, quantity, selecting) {
  const rest = total - quantity;
  // Check both halves before accepting; e.g. taking 1 from 1e20 would mint cargo.
  if (!(rest >= 0) || conservingSum(rest, quantity) !== total) return state;
  const remainder = rest > 0 ? { id, quantity: rest } : null;
  return acceptTransfer(state, { ...state, [side]: withSlot(state[side], index, remainder),
    held: { stack: { id, quantity }, source: side, index, remainder, ...(selecting ? { selectionTotal: total } : {}) } });
}

export function setCargoSelection(state, quantity) {
  const held = state.held, total = held?.selectionTotal;
  if (total === undefined || !Number.isInteger(quantity) || quantity < 0 || quantity > Math.min(5000, Math.floor(total))) return state;
  if (quantity === held.stack.quantity) return state;
  return splitAt(state, held.source, held.index, held.stack.id, total, quantity, true);
}

export function finishCargoSelection(state) {
  if (state.held?.selectionTotal === undefined) return state;
  if (state.held.stack.quantity === 0) return { ...state, held: null };
  const { selectionTotal: _total, ...held } = state.held;
  return { ...state, held };
}

/** F.cancelTransaction(): reverse transfers into the current hold, not the initial layout. */
export function cancelCargoTransfer(state) {
  if (state.held || !state.discard.some(Boolean)) return state;
  const hold = [...state.hold];
  for (const stack of state.discard) {
    if (!stack) continue;
    const matching = hold.findIndex(item => item?.id === stack.id);
    if (matching >= 0) {
      const quantity = conservingSum(hold[matching].quantity, stack.quantity);
      if (quantity === null) return state;
      hold[matching] = { id: stack.id, quantity };
      continue;
    }
    let destination = hold.findIndex(item => item === null);
    if (destination < 0) destination = hold.length;
    if (destination >= LOCAL_SLOT_LIMIT) return state;
    hold[destination] = stack;
  }
  return { ...state, hold, discard: [] };
}

export function cargoTransferPending(state) {
  return state.held !== null || state.discard.some(stack => stack !== null);
}

function conservingSum(a, b) {
  const sum = a + b;
  if (!Number.isFinite(sum)) return null;
  // Match CooperativeCargo.transferQuantity's bounded roundoff allowance.
  // Check both operands: checking only the incoming amount misses 1 + 1e20.
  for (const [before, amount] of [[a, b], [b, a]]) {
    if (amount === 0) continue;
    const applied = sum - before;
    const tolerance = Math.min(Number.EPSILON * Math.max(before, sum, amount) * 2, amount * 1e-9);
    if (!(applied > 0) || Math.abs(applied - amount) > tolerance) return null;
  }
  return sum;
}

function totals(slots, checkPrecision = false) {
  const result = new Map();
  for (const stack of slots) {
    if (!stack) continue;
    const before = result.get(stack.id) ?? 0;
    const quantity = checkPrecision ? conservingSum(before, stack.quantity) : before + stack.quantity;
    if (quantity === null) return null;
    result.set(stack.id, quantity);
  }
  return result;
}

/** Retained hold only: cursor and discard no longer contribute to the HUD. */
export function cargoTransferRetained(state) {
  return Object.fromEntries(totals(state.hold));
}

export function cargoTransferItems(state) {
  return Object.fromEntries(totals(state.discard));
}

export function cargoTransferMatches(state, cargo) {
  // Missing snapshots are not authoritative empty inventories.
  if (!isCargo(cargo)) return false;
  const entries = positiveEntries(cargo);
  return entries.length === Object.keys(state.baseline).length
    && entries.every(([id, quantity]) => Object.hasOwn(state.baseline, id) && state.baseline[id] === quantity);
}

export function sortCargoTransfer(state, side, commodities) {
  if (!isSide(side) || state.held) return state;
  const merged = totals(state[side], true);
  if (merged === null) return state;
  const rows = [...merged].map(([id, quantity]) => ({ id, quantity, commodity: commodities.get(id) }));
  // CargoSort owns order/tie/unknown-metadata rules. Consolidate first, then
  // compact this container only; metadata never becomes part of a transfer stack.
  const sorted = sortCommodityCargo(rows).map(({ id, quantity }) => ({ id, quantity }));
  return acceptTransfer(state, { ...state, [side]: sorted });
}
