import { canCommandFleet } from '../../src/campaign/rules/FleetControl.mjs';
import { identifier, integer, finite, isRecord, requireThat, immutableJSON } from '../../src/campaign/core/Values.mjs';
import { projectFleetLogistics } from './FleetHudProjection.mjs';

/** A read-only presentation query, never a cargo mutation or command receipt.
 * The authenticated world/player and the pinned providers are authority-owned. */
export function quoteCargoPreview(world, playerId, input, rules) {
  requireThat(isRecord(input) && Object.keys(input).every(key => ['worldId', 'epoch', 'fleetId', 'fleetVersion', 'memberVersions', 'cargo', 'quickTransfer'].includes(key)), 'INVALID_REQUEST', 'Invalid cargo preview');
  requireThat(input.worldId === world.id, 'FORBIDDEN', 'Wrong world');
  identifier(input.fleetId, 'fleet ID');
  const fleet = Object.hasOwn(world.fleets, input.fleetId) ? world.fleets[input.fleetId] : null;
  requireThat(fleet && canCommandFleet(world, fleet, playerId), 'FORBIDDEN', 'Fleet is not commandable');
  integer(input.fleetVersion, 'fleet version');
  requireThat(input.fleetVersion === fleet.version, 'VERSION_CONFLICT', 'Fleet changed');
  requireThat(Array.isArray(input.memberVersions) && input.memberVersions.length === fleet.memberIds.length, 'VERSION_CONFLICT', 'Roster changed');
  const seen = new Set();
  for (const row of input.memberVersions) {
    requireThat(isRecord(row) && Object.keys(row).every(key => ['id', 'version'].includes(key)), 'INVALID_REQUEST', 'Invalid member version');
    identifier(row.id, 'member ID'); integer(row.version, 'member version');
    requireThat(!seen.has(row.id) && fleet.memberIds.includes(row.id) && world.members[row.id]?.version === row.version, 'VERSION_CONFLICT', 'Member changed');
    seen.add(row.id);
  }
  requireThat(isRecord(input.cargo), 'INVALID_REQUEST', 'Invalid retained cargo');
  const retained = {};
  for (const [id, quantity] of Object.entries(input.cargo)) {
    identifier(id, 'commodity ID');
    requireThat(Object.hasOwn(fleet.cargo, id), 'INVALID_CARGO', 'Cannot invent retained cargo');
    retained[id] = finite(quantity, 'retained quantity', 0, fleet.cargo[id]);
  }
  // Store reads are deeply immutable. A mutable standalone caller is copied once;
  // normal worker queries share untouched sector collections rather than cloning them.
  const base = Object.isFrozen(world) ? world : immutableJSON(world);
  const shadowFleet = Object.freeze({ ...base.fleets[fleet.id], cargo: Object.freeze(retained) });
  const shadowWorld = Object.freeze({ ...base, fleets: Object.freeze({ ...base.fleets, [fleet.id]: shadowFleet }) });
  let quickTransfer;
  if (input.quickTransfer !== undefined) {
    const q = input.quickTransfer;
    requireThat(isRecord(q) && Object.keys(q).length === 3 && ['side', 'id', 'quantity'].every(k => Object.hasOwn(q, k))
      && ['hold', 'discard'].includes(q.side), 'INVALID_REQUEST', 'Invalid shortcut request');
    identifier(q.id, 'shortcut commodity');
    requireThat(Object.hasOwn(fleet.cargo, q.id), 'INVALID_CARGO', 'Unknown shortcut source');
    const available = q.side === 'hold' ? (retained[q.id] ?? 0) : fleet.cargo[q.id] - (retained[q.id] ?? 0);
    finite(q.quantity, 'shortcut stack', Number.MIN_VALUE, available);
    requireThat(rules && rules.acceptsLock(world.rules), 'RULESET_MISMATCH', 'Shortcut rules must match saved world');
    requireThat(rules.services.cargoGestures?.quoteQuickTransfer && rules.services.fleetStats?.resolve, 'RULES_UNAVAILABLE', 'Shortcut provider unavailable');
    const amount = rules.services.cargoGestures.quoteQuickTransfer(shadowWorld, shadowFleet, Object.freeze({ ...q }), rules.services.fleetStats.resolve);
    // A mod may reject/no-op a gesture, but never authorize a negative/invented stack.
    quickTransfer = { ...q, amount: finite(amount, 'shortcut result', 0, q.quantity) };
  }
  return immutableJSON({ ...(quickTransfer ? { quickTransfer } : {}), worldId: world.id, revision: world.revision, fleetId: fleet.id, fleetVersion: fleet.version,
    memberVersions: fleet.memberIds.map(id => ({ id, version: world.members[id].version })), cargo: retained,
    ...projectFleetLogistics(shadowWorld, shadowFleet, rules) });
}
