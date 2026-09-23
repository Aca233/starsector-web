import logistics from '../data/reference-logistics.json' with { type: 'json' };
import market from '../data/reference-market.json' with { type: 'json' };
import { finite, identifier, integer, isRecord, requireThat } from '../core/Values.mjs';
import { canCommandFleet } from './FleetControl.mjs';
import { originalFleetRadius } from './OriginalTransitions.mjs';

const MAX_STACKS = 64;
const LIFECYCLE_POLICY = 'persistent-until-collected';
const shape = (value, keys, label) => requireThat(isRecord(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)),
'INVALID_CARGO_SCHEMA', `Expected exact ${label} fields: ${keys.join(', ')}`);
function commodity(id) {
  identifier(id, 'commodity');
  const row = Object.hasOwn(market.commodities, id) ? market.commodities[id] : Object.hasOwn(logistics.commodities, id) ? logistics.commodities[id] : null;
  requireThat(row && !row.tags.includes('meta') && id !== 'credits', 'UNSUPPORTED_CARGO', `Unsupported cargo commodity: ${id}`);
  return row;
}
function quantity(id, value, positive) {
  const row = commodity(id);
  finite(value, `${id} quantity`, 0, Number.MAX_SAFE_INTEGER);
  requireThat(!positive || value > 0, 'INVALID_CARGO_QUANTITY', 'Pod items must have positive quantities');
  // CargoAPI exposes crew, marines and total personnel as integer counts, not fractional cargo space.
  if (row.tags.includes('personnel')) integer(value, `${id} personnel`);
  return row;
}
function inventory(items, positive = true) {
  requireThat(isRecord(items), 'INVALID_CARGO_SCHEMA', 'Expected commodity quantities');
  const entries = Object.entries(items);
  requireThat(entries.length <= MAX_STACKS && (!positive || entries.length > 0), 'CARGO_STACK_LIMIT', 'Expected 1–64 pod stacks (up to 64 fleet stacks)');
  for (const [id, value] of entries) quantity(id, value, positive);
  return entries;
}
function podGeometry(items) {
  let space = 0, fuel = 0, personnel = 0;
  for (const [id, value] of inventory(items)) {
    const row = commodity(id);
    space += value * row.cargoSpace;
    if (id === 'fuel') fuel += value;
    if (row.tags.includes('personnel')) personnel += value;
  }
  const mass = finite(space + fuel + personnel, 'pod cargo mass', 0);
  const pieces = Math.max(5, Math.min(40, Math.floor(Math.sqrt(mass))));
  return { radius: 10 + 10 * Math.sqrt(pieces - 4), name: personnel > space + fuel ? '冷冻吊舱' : '货物吊舱' };
}
function validatePod(world, pod) {
  shape(pod, ['id', 'version', 'name', 'locationId', 'position', 'radius', 'tags', 'cargoPod'], 'cargo pod entity');
  identifier(pod.id, 'pod'); integer(pod.version, 'pod version'); identifier(pod.locationId, 'pod location');
  requireThat(Object.hasOwn(world.locations, pod.locationId), 'BROKEN_REFERENCE', 'Missing pod location');
  requireThat(Array.isArray(pod.position) && pod.position.length === 2, 'INVALID_CARGO_SCHEMA', 'Expected pod position');
  pod.position.forEach(n => finite(n, 'pod coordinate', -1e12, 1e12));
  requireThat(Array.isArray(pod.tags) && pod.tags.length === 1 && pod.tags[0] === 'cargo-pod', 'INVALID_CARGO_SCHEMA', 'Expected cargo-pod tag only');
  const data = pod.cargoPod;
  shape(data, ['schemaVersion', 'items', 'createdAtTick', 'sourceFleetId', 'createdBy'], 'cargoPod');
  requireThat(data.schemaVersion === 1, 'SAVE_VERSION', 'Unsupported cargo pod schema');
  integer(data.createdAtTick, 'pod creation tick');
  requireThat(data.createdAtTick <= world.clock.tick, 'INVALID_CARGO_SCHEMA', 'Pod creation is in the future');
  // Provenance is not ownership or a live foreign key: source fleets may be merged/removed.
  identifier(data.sourceFleetId, 'pod source fleet'); identifier(data.createdBy, 'pod creator');
  const geometry = podGeometry(data.items);
  requireThat(pod.radius === geometry.radius && pod.name === geometry.name, 'INVALID_CARGO_SCHEMA', 'Pod radius/name disagree with native cargo mass formula');
}
function validateWorld(world) {
  for (const pod of Object.values(world.spaceEntities)) {
    if (Object.hasOwn(pod, 'cargoPod') || pod.tags?.includes('cargo-pod')) validatePod(world, pod);
  }
}
function membersFor(world, fleet) {
  return fleet.memberIds.map(id => {
    const member = world.members[id];
    requireThat(member?.fleetId === fleet.id, 'BROKEN_REFERENCE', 'Missing fleet radius member');
    return member;
  });
}
function referenced(world, podId) {
  return Object.values(world.fleets).some(fleet => fleet.navigation?.interaction?.targetId === podId);
}
function inRange(fleet, pod, members) {
  return fleet.locationId === pod.locationId && Math.hypot(fleet.position[0] - pod.position[0], fleet.position[1] - pod.position[1])
    < originalFleetRadius(members) + pod.radius;
}
/** Physical eligibility only; the caller must separately check player control before revealing items. Never mutates or throws. */
function canCollect(world, fleet, pod) {
  try {
    if (!fleet || !pod || fleet.encounterId !== null || fleet.navigation?.transition || referenced(world, pod.id)) return false;
    validatePod(world, pod);
    return inRange(fleet, pod, membersFor(world, fleet));
  } catch { return false; }
}
function ownFleet(ctx, id) {
  identifier(id, 'fleet');
  requireThat(ctx.actor.kind === 'player', 'FORBIDDEN', 'Cargo commands require a player');
  const fleet = ctx.requireVersion('fleets', id);
  requireThat(canCommandFleet(ctx.world, fleet, ctx.actor.id), 'FORBIDDEN', 'No fleet command permission');
  requireThat(fleet.encounterId === null, 'ASSET_LOCKED', 'Fleet is committed to an encounter');
  requireThat(!fleet.navigation?.transition, 'IN_TRANSITION', 'Cannot transfer cargo during a jump');
  inventory(fleet.cargo, false);
  return fleet;
}
function podId(worldId, requestId, actor) {
  identifier(requestId, 'request');
  // Two deterministic uint32 hashes, not randomness/security. A collision fails closed, never overwrites cargo.
  const input = JSON.stringify([worldId, requestId, actor.kind, actor.id]);
  let a = 2166136261, b = 5381;
  for (let i = 0; i < input.length; i++) { a = Math.imul(a ^ input.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ input.charCodeAt(i); }
  return `cargo-pod:${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
}
function transferQuantity(id, before, amount, sign) {
  const after = before + sign * amount;
  quantity(id, after, false);
  // Reject swallowed/rounded-away transfers rather than minting or destroying an entire small stack.
  // Permit ordinary balance-scale IEEE-754 roundoff, bounded also relative to the transfer.
  const applied = sign * (after - before);
  const tolerance = Math.min(Number.EPSILON * Math.max(before, after, amount) * 2, amount * 1e-9);
  requireThat(applied > 0 && Math.abs(applied - amount) <= tolerance,
    'CARGO_PRECISION', 'Transfer cannot conserve this quantity at the stored numeric precision');
  return after;
}
const fleetChange = (fleet, cargo) => ({ collection: 'fleets', id: fleet.id, expectedVersion: fleet.version,
  value: { ...fleet, version: fleet.version + 1, cargo } });
function jettison(ctx, payload, requestId) {
  shape(payload, ['fleetId', 'items'], 'jettison command');
  const fleet = ownFleet(ctx, payload.fleetId), entries = inventory(payload.items), cargo = { ...fleet.cargo }, items = {};
  for (const [id, amount] of entries) {
    const before = cargo[id] ?? 0;
    requireThat(before >= amount, 'INSUFFICIENT_CARGO', `Insufficient ${id}`);
    cargo[id] = transferQuantity(id, before, amount, -1);
    requireThat(cargo[id] + amount === before, 'CARGO_PRECISION', 'Jettison would not conserve inventory');
    items[id] = amount;
  }
  const id = podId(ctx.world.id, requestId, ctx.actor);
  requireThat(!Object.hasOwn(ctx.world.spaceEntities, id), 'CARGO_ID_CONFLICT', 'Deterministic pod ID already exists');
  const pod = { id, version: 0, ...podGeometry(items), locationId: fleet.locationId, position: [...fleet.position], tags: ['cargo-pod'],
    cargoPod: { schemaVersion: 1, items, createdAtTick: ctx.world.clock.tick, sourceFleetId: fleet.id, createdBy: ctx.actor.id } };
  validatePod(ctx.world, pod);
  const result = { fleetId: fleet.id, podId: id };
  return { changes: [fleetChange(fleet, cargo), { collection: 'spaceEntities', id, expectedVersion: null, value: pod }],
    events: [{ type: 'cargo.jettisoned', data: result }], result };
}
function collect(ctx, payload) {
  shape(payload, ['fleetId', 'podId'], 'collect command');
  const fleet = ownFleet(ctx, payload.fleetId);
  identifier(payload.podId, 'pod');
  const pod = ctx.requireVersion('spaceEntities', payload.podId);
  validatePod(ctx.world, pod);
  const members = membersFor(ctx.world, fleet).map(member => ctx.requireVersion('members', member.id));
  requireThat(!referenced(ctx.world, pod.id), 'CARGO_TARGET_REFERENCED', 'A fleet navigation interaction still references this pod');
  requireThat(fleet.locationId === pod.locationId, 'LOCATION_CONFLICT', 'Cargo pod is in another location');
  requireThat(inRange(fleet, pod, members), 'OUT_OF_RANGE', 'Cargo pod is outside strict fleet contact range');
  const cargo = { ...fleet.cargo };
  for (const [id, amount] of inventory(pod.cargoPod.items)) cargo[id] = transferQuantity(id, cargo[id] ?? 0, amount, 1);
  inventory(cargo, false);
  // Native recovery permits overcapacity. Never truncate an item or delete a non-transferred remainder.
  const result = { fleetId: fleet.id, podId: pod.id };
  return { changes: [fleetChange(fleet, cargo), { collection: 'spaceEntities', id: pod.id, expectedVersion: pod.version, value: null }],
    events: [{ type: 'cargo.collected', data: result }], result };
}
export const cooperativeCargoProvider = Object.freeze({
  id: 'cooperative.cargo', service: 'cargo', version: '0.1.0', apiVersion: 1,
  lifecyclePolicy: LIFECYCLE_POLICY,
  capabilities: ['recoverable-cargo-jettison', 'atomic-cargo-collection', 'persistent-cargo-pods', 'incomplete-native-lifecycle'],
  evidence: [{ source: 'CargoPodsEntityPlugin.java:updateBaseMaxDays; CargoAPI integer personnel; reference-logistics/market commodities',
    scope: 'Native mass, piece clamp, radius and strict cryo threshold; strict originalFleetRadius contact; commodity-only whole-pod transfer' },
  { source: 'Explicit temporary WEB cooperative policy', lifecyclePolicy: LIFECYCLE_POLICY, completeness: 'incomplete',
    scope: 'Recoverable pods survive saves until fully collected. NOT native expiry, drift, sensor or float32 parity. No presentation or movement. Explicit controller authorization, no source-fleet ownership restriction.' }],
  methods: { validateWorld, canCollect }, commands: { 'cargo.jettison': jettison, 'cargo.collect': collect },
});

