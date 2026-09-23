import reference from '../data/reference-market.json' with { type: 'json' };
import { finite, requireThat } from '../core/Values.mjs';
import { fleetUsesNpcLogistics } from './FleetControl.mjs';

/** Native F.java:420-464, free crew/fuel int casts in CargoData.java:199-205.
 * Free/no-cost commodity containers only; NOT market deficit/excess trading.
 * No mutations. The caller authenticates and validates source availability. */
export function quoteOriginalQuickTransfer(world, fleet, request, resolveStats) {
  const { id, side, quantity } = request;
  const spec = Object.hasOwn(reference.commodities, id) ? reference.commodities[id] : null;
  requireThat(spec && !spec.tags.includes('meta') && id !== 'credits', 'UNSUPPORTED_CARGO', 'Unsupported shortcut commodity');
  requireThat(side === 'hold' || side === 'discard', 'INVALID_REQUEST', 'Invalid shortcut direction');
  finite(quantity, 'shortcut stack', Number.MIN_VALUE, Number.MAX_SAFE_INTEGER);
  requireThat(!spec.tags.includes('personnel') || Number.isInteger(quantity), 'INVALID_CARGO_QUANTITY', 'Personnel must be whole');
  const { cargo } = resolveStats(fleet, fleet.memberIds.map(mid => world.members[mid]), { world, aiMode: fleetUsesNpcLogistics(fleet) });
  let free;
  if (id === 'crew' || id === 'marines') free = Math.trunc(cargo.personnelCapacity - cargo.crew - cargo.marines);
  else if (id === 'fuel') free = Math.trunc(cargo.fuelCapacity - cargo.fuel);
  else free = cargo.capacity - cargo.spaceUsed;
  requireThat(Number.isFinite(free), 'STATS_UNAVAILABLE', 'Invalid shortcut free space');
  if (spec.cargoSpace > 0) free = Math.floor(free / spec.cargoSpace);
  let amount = quantity;
  if (side === 'discard' && free > 0) amount = Math.min(quantity, free);
  else if (side === 'hold' && free < 0) amount = Math.min(quantity, -free);
  // This is the native shortcut's final sub-unit remainder check, not the
  // unrelated Shift-decompile branch that might destroy a fractional remainder.
  if (quantity - amount < 1) amount = quantity;
  return finite(amount, 'shortcut quantity', Number.MIN_VALUE, quantity);
}
export const originalCargoGesturesProvider = Object.freeze({
  id: 'reference.cargo-gestures', service: 'cargoGestures', version: '0.1.0', apiVersion: 1,
  capabilities: ['native-no-cost-commodity-shortcuts'], requires: { fleetStats: ['effective-logistics-stats'] },
  evidence: [{ source: '0.98a-RC8 trade/F.java:410-476; CargoData.java:199-205', scope: 'No-cost Ctrl transfer; not paid-market shortage/excess rules or multi-type stacks' }],
  methods: { quoteQuickTransfer: quoteOriginalQuickTransfer },
});
