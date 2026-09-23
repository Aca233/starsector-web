/** Pure in-memory checks: no server, save files, fixture writes or network. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCargoTransfer, cancelCargoTransfer, clickCargoSlot, returnHeldCargo, cargoTransferPending,
  cargoTransferItems, cargoTransferMatches, sortCargoTransfer,
} from '../src/campaign/client/CargoTransfer.mjs';

const stack = (id, quantity = 1) => ({ id, quantity });
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function inventory(state) {
  const result = new Map();
  for (const item of [...state.hold, ...state.discard, state.held?.stack]) {
    if (item) result.set(item.id, (result.get(item.id) ?? 0) + item.quantity);
  }
  return result;
}
function fixture(hold, discard = [], held = null) {
  const state = { baseline: {}, hold, discard, held };
  state.baseline = Object.fromEntries(inventory(state));
  return freeze(state);
}
function conserved(state) {
  assert.deepEqual(inventory(state), new Map(Object.entries(state.baseline)));
  assert.ok(new Set(state.discard.filter(Boolean).map(item => item.id)).size <= 64);
  for (const item of [...state.hold, ...state.discard, state.held?.stack]) {
    if (item) assert.ok(Number.isFinite(item.quantity) && item.quantity > 0);
  }
}
function move(state, from, index, to, destination) {
  const picked = clickCargoSlot(freeze(state), from, index);
  return clickCargoSlot(freeze(picked), to, destination);
}

test('creation filters invalid quantities and inherited entries without touching the snapshot', () => {
  const cargo = Object.assign(Object.create({ inherited: 9 }), {
    fuel: 3.5, crew: 1.25, zero: 0, negativeZero: -0, negative: -3,
    nan: NaN, infinity: Infinity, minusInfinity: -Infinity,
    text: '4', boolean: true, boxed: new Number(3), nil: null, missing: undefined,
  });
  Object.defineProperty(cargo, 'hidden', { value: 7 });
  cargo[Symbol('symbol')] = 2;
  freeze(cargo);
  const state = createCargoTransfer(cargo);
  assert.deepEqual(state, {
    baseline: { fuel: 3.5, crew: 1.25 }, hold: [stack('fuel', 3.5), stack('crew', 1.25)],
    discard: [], held: null,
  });
  assert.equal(cargo.inherited, 9);
  assert.equal(cargo.hidden, 7);
  // No personnel rounding or commodity metadata restrictions belong in this layer.
  conserved(state);
});

test('missing and malformed cargo create empty states, but are not authoritative snapshots', () => {
  for (const cargo of [undefined, null, false, true, 5, 'fuel', [], [1], () => 3]) {
    const state = createCargoTransfer(cargo);
    assert.deepEqual(state, { baseline: {}, hold: [], discard: [], held: null });
    assert.equal(cargoTransferMatches(state, cargo), false);
    assert.equal(cargoTransferMatches(state, {}), true);
    assert.equal(cargoTransferPending(state), false);
    assert.deepEqual(cargoTransferItems(state), {});
  }
});

test('prototype-named IDs remain own data through creation, transfers, sorting and matching', () => {
  const cargo = JSON.parse('{"__proto__":2,"constructor":3,"toString":4,"hasOwnProperty":5,"":6}');
  const prototype = Object.getPrototypeOf(cargo);
  let state = createCargoTransfer(freeze(cargo));
  assert.deepEqual(state.baseline, cargo);
  for (let i = 0; i < state.hold.length; i++) state = move(state, 'hold', i, 'discard', i);
  state = sortCargoTransfer(freeze(state), 'discard', new Map());
  const items = cargoTransferItems(freeze(state));
  assert.deepEqual(items, cargo);
  assert.equal(Object.hasOwn(items, '__proto__'), true);
  assert.equal(Object.getPrototypeOf(items), Object.prototype);
  assert.equal(Object.getPrototypeOf(cargo), prototype);
  assert.equal(cargoTransferMatches(state, Object.fromEntries(Object.entries(cargo).reverse())), true);
  assert.equal(cargoTransferMatches(state, Object.create(cargo)), false);
  conserved(state);
});

test('creation and aggregate results are independent copies, not shared server snapshots', () => {
  const cargo = { fuel: 7 };
  const first = createCargoTransfer(cargo), second = createCargoTransfer(cargo);
  cargo.fuel = 100;
  first.baseline.fuel = 50;
  first.hold[0].quantity = 20;
  assert.deepEqual(second.baseline, { fuel: 7 });
  assert.deepEqual(second.hold, [stack('fuel', 7)]);
  const state = move(second, 'hold', 0, 'discard', 0);
  const items = cargoTransferItems(freeze(state));
  items.fuel = 200;
  assert.deepEqual(cargoTransferItems(state), { fuel: 7 });
  assert.equal(state.baseline.fuel, 7);
  conserved(state);
});

test('whole-stack pickup, empty-slot drop and return preserve holes and all quantities', () => {
  const start = freeze(createCargoTransfer({ fuel: 5, food: 3 }));
  const picked = clickCargoSlot(start, 'hold', 0);
  assert.deepEqual(picked.held, { stack: stack('fuel', 5), source: 'hold', index: 0 });
  assert.deepEqual(picked.hold, [null, stack('food', 3)]);
  assert.equal(cargoTransferPending(picked), true);
  assert.deepEqual(cargoTransferItems(picked), {});
  assert.deepEqual(returnHeldCargo(freeze(picked)), start);
  const dropped = clickCargoSlot(picked, 'discard', 4);
  assert.deepEqual(dropped.discard, [null, null, null, null, stack('fuel', 5)]);
  assert.equal(dropped.held, null);
  assert.equal(dropped.hold, picked.hold);
  assert.equal(dropped.baseline, start.baseline);
  assert.deepEqual(cargoTransferItems(dropped), { fuel: 5 });
  conserved(dropped);
});

test('whole-stack cancel uses an earlier empty slot even when the original slot is empty', () => {
  for (const side of ['hold', 'discard']) {
    const slots = [null, stack('food', 4), null, stack('heavy_machinery', 16)];
    const start = side === 'hold' ? fixture(slots) : fixture([], slots);
    const picked = freeze(clickCargoSlot(start, side, 3));
    assert.equal(picked[side][3], null);
    assert.equal(picked.held.index, 3);
    const returned = returnHeldCargo(picked);
    assert.deepEqual(returned[side], [stack('heavy_machinery', 16), stack('food', 4), null, null]);
    assert.equal(returned.held, null);
    assert.equal(returned[side === 'hold' ? 'discard' : 'hold'], start[side === 'hold' ? 'discard' : 'hold']);
    conserved(returned);
  }
});

test('Web slot guard rejects huge indices without allocation and permits exactly 4096 local slots', () => {
  const start = freeze(createCargoTransfer({ fuel: 4 }));
  const picked = freeze(clickCargoSlot(start, 'hold', 0));
  for (const current of [start, picked]) {
    for (const side of ['hold', 'discard']) {
      for (const index of [4096, 4097, 100_000_000, 1_000_000_000, 0xfffffffe, Number.MAX_SAFE_INTEGER]) {
        assert.equal(clickCargoSlot(current, side, index), current);
      }
    }
  }
  for (const side of ['hold', 'discard']) {
    const last = clickCargoSlot(picked, side, 4095);
    assert.equal(last[side].length, 4096);
    assert.deepEqual(last[side][4095], stack('fuel', 4));
    assert.ok(last[side].slice(0, 4095).every(slot => slot === null));
    conserved(last);
    const returned = returnHeldCargo(freeze(clickCargoSlot(freeze(last), side, 4095)));
    assert.deepEqual(returned[side][0], stack('fuel', 4));
    assert.equal(returned[side][4095], null);
    conserved(returned);
  }
});

test('a full local container cannot grow past the Web slot guard when cancelling a swap', () => {
  const start = fixture(Array.from({ length: 4096 }, () => stack('food')), [stack('fuel')]);
  const swapped = freeze(move(start, 'discard', 0, 'hold', 10));
  assert.deepEqual(swapped.held.stack, stack('food'));
  assert.equal(returnHeldCargo(swapped), swapped);
  assert.equal(swapped.hold.length, 4096);
  const recovered = clickCargoSlot(swapped, 'discard', 0);
  assert.equal(recovered.held, null);
  conserved(recovered);
});

test('invalid sides/indices and empty pickups are referential no-ops, even while holding', () => {
  const state = freeze(createCargoTransfer({ fuel: 4 }));
  const picked = freeze(clickCargoSlot(state, 'hold', 0));
  for (const current of [state, picked]) {
    for (const index of [-1, 0.5, NaN, Infinity, -Infinity, undefined, null, '0', 0xffffffff, 2 ** 32, Number.MAX_SAFE_INTEGER]) {
      assert.equal(clickCargoSlot(current, 'hold', index), current);
    }
    for (const side of ['bad', '__proto__', 'baseline', undefined, null]) {
      assert.equal(clickCargoSlot(current, side, 0), current);
      assert.equal(sortCargoTransfer(current, side, new Map()), current);
    }
  }
  assert.equal(clickCargoSlot(state, 'discard', 0), state);
  assert.equal(clickCargoSlot(state, 'hold', 4), state);
  assert.equal(returnHeldCargo(state), state);
});

test('same-ID drops merge and clear held; same and cross-container gestures conserve cargo', () => {
  for (const side of ['hold', 'discard']) {
    const start = side === 'hold'
      ? fixture([stack('fuel', 2.5), null, stack('fuel', 1.25)])
      : fixture([stack('fuel', 2.5)], [null, null, stack('fuel', 1.25)]);
    const next = move(start, 'hold', 0, side, 2);
    assert.deepEqual(next[side][2], stack('fuel', 3.75));
    assert.equal(next.held, null);
    assert.equal(next.hold[0], null);
    assert.equal(cargoTransferPending(next), side === 'discard');
    conserved(next);
  }
});

test('swap cancellation uses the new source container and first hole, never overwrites', () => {
  const start = fixture([stack('fuel', 5), stack('food', 2), null], [stack('ore', 3), null]);
  const swapped = move(start, 'hold', 0, 'discard', 0);
  assert.deepEqual(swapped.discard, [stack('fuel', 5), null]);
  assert.deepEqual(swapped.held, { stack: stack('ore', 3), source: 'discard', index: 0 });
  assert.deepEqual(cargoTransferItems(swapped), { fuel: 5 });
  const cancelled = returnHeldCargo(freeze(swapped));
  assert.deepEqual(cancelled.discard, [stack('fuel', 5), stack('ore', 3)]);
  assert.deepEqual(cancelled.hold, [null, stack('food', 2), null]);
  assert.equal(cancelled.held, null);
  conserved(cancelled);
  const sameSide = returnHeldCargo(freeze(move(start, 'hold', 0, 'hold', 1)));
  assert.deepEqual(sameSide.hold, [stack('food', 2), stack('fuel', 5), null]);
  conserved(sameSide);
});

test('return appends if source is full and does not merge into an occupied original slot', () => {
  const swapped = move(fixture([stack('fuel', 2)], [stack('ore', 3)]), 'hold', 0, 'discard', 0);
  const cancelled = returnHeldCargo(freeze(swapped));
  assert.deepEqual(cancelled.discard, [stack('fuel', 2), stack('ore', 3)]);
  conserved(cancelled);
  const occupied = fixture([stack('fuel', 2), null], [], { stack: stack('fuel', 3), source: 'hold', index: 0 });
  assert.deepEqual(returnHeldCargo(occupied).hold, [stack('fuel', 2), stack('fuel', 3)]);
});

test('repeated swaps update held provenance; cancel returns to the latest source', () => {
  let state = fixture([stack('fuel'), stack('food')], [stack('ore')]);
  state = move(state, 'hold', 0, 'discard', 0);
  state = clickCargoSlot(freeze(state), 'hold', 1);
  assert.deepEqual(state.held, { stack: stack('food'), source: 'hold', index: 1 });
  state = returnHeldCargo(freeze(state));
  assert.deepEqual(state.hold, [stack('food'), stack('ore')]);
  assert.deepEqual(state.discard, [stack('fuel')]);
  conserved(state);
});

test('discard recovery and hold-only rearrangement stop being pending, including empty slots', () => {
  const start = createCargoTransfer({ fuel: 9, food: 4 });
  let state = move(start, 'hold', 0, 'discard', 2);
  state = clickCargoSlot(freeze(state), 'discard', 2);
  assert.equal(cargoTransferPending(state), true);
  assert.deepEqual(cargoTransferItems(state), {});
  const returned = returnHeldCargo(freeze(state));
  assert.deepEqual(returned.discard, [stack('fuel', 9), null, null]);
  state = clickCargoSlot(state, 'hold', 3);
  assert.equal(cargoTransferPending(state), false);
  assert.deepEqual(state.discard, [null, null, null]);
  assert.deepEqual(state.hold, [null, stack('food', 4), null, stack('fuel', 9)]);
  assert.equal(cargoTransferMatches(state, { food: 4, fuel: 9 }), true);
  conserved(state);
});

test('discard payload aggregates duplicate stacks only, not hold or held', () => {
  const state = fixture([stack('food', 7)], [stack('fuel', 2), null, stack('fuel', 3), stack('__proto__', 4)],
    { stack: stack('ore', 9), source: 'hold', index: 1 });
  assert.deepEqual(cargoTransferItems(state), Object.fromEntries([['fuel', 5], ['__proto__', 4]]));
  assert.equal(cargoTransferPending(state), true);
});

test('sorting consolidates and compacts just the requested side with stable native order rules', () => {
  const slots = [stack('unknown-z'), stack('tie-z', 2), null, stack('plus-zero'), stack('minus-zero'),
    stack('low', 0.25), stack('tie-a', 99), stack('low', 0.5), stack('unknown-a'), stack('invalid')];
  const commodities = new Map([
    ['low', freeze({ order: -1 })], ['minus-zero', freeze({ order: -0 })], ['plus-zero', freeze({ order: +0 })],
    ['tie-z', freeze({ order: 2 })], ['tie-a', freeze({ order: 2 })], ['invalid', freeze({ order: Infinity })],
  ]);
  const originalMetadata = structuredClone(commodities);
  for (const side of ['hold', 'discard']) {
    const other = side === 'hold' ? 'discard' : 'hold';
    const state = side === 'hold' ? fixture(slots, [null, stack('food')]) : fixture([null, stack('food')], slots);
    const sorted = sortCargoTransfer(state, side, commodities);
    assert.deepEqual(sorted[side], [stack('low', 0.75), stack('minus-zero'), stack('plus-zero'),
      stack('tie-z', 2), stack('tie-a', 99), stack('unknown-z'), stack('unknown-a'), stack('invalid')]);
    assert.equal(sorted[other], state[other]);
    assert.equal(sorted.baseline, state.baseline);
    assert.deepEqual(sortCargoTransfer(freeze(sorted), side, commodities), sorted);
    assert.deepEqual(commodities, originalMetadata);
    conserved(sorted);
  }
});

test('sorting either container while holding is an exact no-op', () => {
  const state = freeze(clickCargoSlot(createCargoTransfer({ fuel: 3, food: 5 }), 'hold', 0));
  for (const side of ['hold', 'discard']) assert.equal(sortCargoTransfer(state, side, new Map()), state);
});

function fullDiscard(duplicate = false) {
  const discard = Array.from({ length: 64 }, (_, i) => stack('item-' + i));
  if (duplicate) discard.push(stack('item-0', 2));
  return fixture([stack('extra'), stack('item-0', 3)], discard);
}

test('discard limit counts distinct IDs, allowing the 64th and rejecting the 65th atomically', () => {
  let state = createCargoTransfer(Object.fromEntries(Array.from({ length: 65 }, (_, i) => ['item-' + i, i + 1])));
  for (let i = 0; i < 64; i++) {
    state = move(state, 'hold', i, 'discard', i);
    conserved(state);
  }
  state = freeze(clickCargoSlot(freeze(state), 'hold', 64));
  assert.equal(clickCargoSlot(state, 'discard', 64), state);
  assert.deepEqual(state.held.stack, stack('item-64', 65));
  const returned = returnHeldCargo(state);
  assert.deepEqual(returned.hold[0], stack('item-64', 65));
  assert.equal(returned.hold[64], null);
  const sameID = move(fullDiscard(), 'hold', 1, 'discard', 64);
  assert.equal(sameID.discard.length, 65, '64 kinds is not a 64-slot limit');
  assert.equal(cargoTransferItems(sameID)['item-0'], 4);
  conserved(sameID);
  const merged = move(fullDiscard(), 'hold', 1, 'discard', 0);
  assert.equal(merged.discard[0].quantity, 4);
  conserved(merged);
});

test('limit validates swap result; rejected swaps and returns never lose either stack', () => {
  const picked = freeze(clickCargoSlot(fullDiscard(true), 'hold', 0));
  assert.equal(clickCargoSlot(picked, 'discard', 0), picked, 'outgoing ID still exists: swap would create ID 65');
  const swapped = freeze(move(fullDiscard(), 'hold', 0, 'discard', 0));
  assert.equal(swapped.discard[0].id, 'extra', 'replacing the only occurrence stays at 64 IDs');
  assert.deepEqual(swapped.held, { stack: stack('item-0'), source: 'discard', index: 0 });
  assert.equal(returnHeldCargo(swapped), swapped, 'return would create ID 65; preserve held cargo');
  const recovered = clickCargoSlot(swapped, 'hold', 0);
  assert.equal(recovered.held, null);
  assert.equal(recovered.hold[0].id, 'item-0');
  conserved(recovered);
});

test('baseline matching ignores entry order and layout but rejects any positive inventory drift', () => {
  const state = freeze(move(createCargoTransfer({ fuel: 5, food: 4 }), 'hold', 0, 'discard', 0));
  assert.equal(cargoTransferMatches(state, { food: 4, fuel: 5, invalid: NaN, zero: 0, negative: -1 }), true);
  for (const cargo of [undefined, null, {}, { fuel: 5 }, { food: 4 }, { fuel: 6, food: 4 },
    { fuel: 5, food: 4, ore: 1 }, { fuel: 0, food: 4 }, { fuel: '5', food: 4 },
    { fuel: Infinity, food: 4 }, Object.create({ fuel: 5, food: 4 })]) {
    assert.equal(cargoTransferMatches(state, cargo), false);
  }
  assert.equal(cargoTransferMatches(createCargoTransfer({}), { invalid: NaN, zero: 0 }), true);
  assert.equal(cargoTransferMatches(createCargoTransfer({}), { fuel: 1 }), false);
  assert.equal(cargoTransferMatches(createCargoTransfer({}), undefined), false);
  conserved(state);
});

test('merge and sort reject swallowed or rounded increments in either operand order', () => {
  for (const [large, small] of [[1e20, 1], [1e20, 20_000], [1e12, 0.1], [1, 1e-20]]) {
    for (const [a, b] of [[large, small], [small, large]]) {
      for (const side of ['hold', 'discard']) {
        const start = side === 'hold'
          ? fixture([stack('fuel', a), stack('fuel', b)])
          : fixture([stack('fuel', a)], [stack('fuel', b)]);
        const held = freeze(clickCargoSlot(start, 'hold', 0));
        assert.equal(clickCargoSlot(held, side, side === 'hold' ? 1 : 0), held);
        assert.deepEqual(held.held.stack, stack('fuel', a));
        // Earlier, safe consolidation must also roll back if a later sum fails.
        const rows = [stack('food', 0.1), null, stack('food', 0.2), stack('fuel', a), stack('fuel', b)];
        const unsorted = side === 'hold' ? fixture(rows, [stack('ore')]) : fixture([stack('ore')], rows);
        assert.equal(sortCargoTransfer(unsorted, side, new Map()), unsorted);
      }
    }
  }
});

test('merge and sort allow ordinary floating-point roundoff and exactly representable increments', () => {
  for (const [a, b] of [[0.1, 0.2], [0.2, 0.1], [100.1, 0.2], [1e6, 0.1],
    [1e20, 16384], [16384, 1e20], [1, Number.EPSILON], [Number.MIN_VALUE, Number.MIN_VALUE]]) {
    for (const side of ['hold', 'discard']) {
      const start = side === 'hold'
        ? fixture([stack('fuel', a), stack('fuel', b)])
        : fixture([stack('fuel', a)], [stack('fuel', b)]);
      const merged = move(start, 'hold', 0, side, side === 'hold' ? 1 : 0);
      assert.equal(merged.held, null);
      assert.equal(merged[side][side === 'hold' ? 1 : 0].quantity, a + b);
      conserved(merged);
      const rows = [stack('fuel', a), null, stack('fuel', b)];
      const unsorted = side === 'hold' ? fixture(rows, [stack('ore')]) : fixture([stack('ore')], rows);
      const sorted = sortCargoTransfer(unsorted, side, new Map());
      assert.deepEqual(sorted[side], [stack('fuel', a + b)]);
      conserved(sorted);
    }
  }
});

test('numeric overflow cannot destroy finite stacks during merge or consolidation', () => {
  const state = fixture([stack('fuel', Number.MAX_VALUE), stack('fuel', Number.MAX_VALUE)]);
  const held = freeze(clickCargoSlot(state, 'hold', 0));
  assert.equal(clickCargoSlot(held, 'hold', 1), held);
  assert.equal(sortCargoTransfer(state, 'hold', new Map()), state);
});

test('6000 deterministic gestures conserve cargo and leave every frozen prior snapshot untouched', () => {
  let seed = 0xc0ffee;
  const random = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  const cargo = Object.fromEntries(Array.from({ length: 72 }, (_, i) => ['item-' + i, (i + 1) / 4]));
  const commodities = new Map(Object.keys(cargo).map((id, i) => [id, freeze({ order: (i * 7) % 11 })]));
  let state = createCargoTransfer(freeze(cargo));
  const snapshots = [];
  for (let i = 0; i < 6000; i++) {
    const previous = freeze(state), copy = structuredClone(previous);
    const side = random(7) < 3 ? 'hold' : 'discard';
    switch (random(13)) {
      case 0: state = returnHeldCargo(previous); break;
      case 1: state = sortCargoTransfer(previous, side, commodities); break;
      default: state = clickCargoSlot(previous, side, random(previous[side].length + 4));
    }
    assert.deepEqual(previous, copy);
    conserved(state);
    assert.equal(cargoTransferMatches(state, cargo), true);
    assert.equal(cargoTransferPending(state), Boolean(state.held || state.discard.some(Boolean)));
    const items = new Map();
    for (const item of state.discard) if (item) items.set(item.id, (items.get(item.id) ?? 0) + item.quantity);
    assert.deepEqual(new Map(Object.entries(cargoTransferItems(state))), items);
    if (i % 250 === 0) snapshots.push([previous, copy]);
  }
  for (const [previous, copy] of snapshots) assert.deepEqual(previous, copy);
});


test('transaction cancellation fills hold holes without resetting current order or slot positions', () => {
  const before = fixture([stack('supplies', 30), null, stack('crew', 15), null, stack('fuel', 20)],
    [stack('heavy_machinery', 4), stack('metals', 2)]);
  const after = cancelCargoTransfer(before);
  assert.deepEqual(after.hold, [stack('supplies', 30), stack('heavy_machinery', 4), stack('crew', 15), stack('metals', 2), stack('fuel', 20)]);
  assert.deepEqual(after.discard, []);
  assert.equal(after.baseline, before.baseline);
  assert.equal(cargoTransferPending(after), false);
  assert.equal(before.hold[1], null);
  conserved(after);
});

test('transaction cancellation merges supported quantities; held or empty transactions are no-ops', () => {
  const split = fixture([stack('supplies', 10), stack('fuel', 20)], [stack('supplies', 3)]);
  const result = cancelCargoTransfer(split);
  assert.deepEqual(result.hold, [stack('supplies', 13), stack('fuel', 20)]);
  conserved(result);
  assert.equal(cancelCargoTransfer(result), result);
  const held = clickCargoSlot(split, 'hold', 0);
  assert.equal(cancelCargoTransfer(held), held);
});

test('transaction cancellation fails atomically on unrepresentable sums or local slot exhaustion', () => {
  const precision = fixture([stack('fuel', 1e20)], [stack('metals'), stack('fuel', 1)]);
  assert.equal(cancelCargoTransfer(precision), precision);
  const full = fixture(Array.from({length:4096}, (_, i) => stack('item-' + i)), [stack('unplaced')]);
  assert.equal(cancelCargoTransfer(full), full);
});
