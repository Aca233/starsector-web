import reference from '../data/reference-logistics.json' with { type: 'json' };
import { finite, identifier, integer, isRecord, jsonCopy, requireThat } from '../core/Values.mjs';
import { canCommandFleet, fleetUsesNpcLogistics } from './FleetControl.mjs';
import { quoteOriginalLogistics } from './OriginalLogisticsQuote.mjs';

const weights = { FRIGATE: 1, DESTROYER: 2, CRUISER: 3, CAPITAL_SHIP: 4 };
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export function originalFleetRadius(members) {
  const size = members.reduce((sum, m) => {
    const hull = reference.hulls[m.loadout.hullId];
    requireThat(hull && !hull.hasModules && Object.hasOwn(weights, hull.hullSize), 'UNSUPPORTED_TRAVEL', 'Fleet radius needs supported non-station hulls');
    return sum + weights[hull.hullSize];
  }, 0);
  return Math.min(reference.navigation.maxFleetSelectionRadius, reference.navigation.baseFleetSelectionRadius + size * reference.navigation.fleetSelectionRadiusPerUnitSize);
}
export function quoteOriginalJumpFuel(effectiveStats, inHyperspace) {
  const cost = quoteOriginalLogistics(effectiveStats).fuelPerLightYear;
  return inHyperspace ? 0 : cost > 0 ? Math.max(1, Math.floor(cost + 0.5)) : 0;
}
function seedFor(worldId, fleetId) {
  let seed = 2166136261;
  for (const ch of worldId + '\0' + fleetId) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619) >>> 0;
  return seed || 1;
}
/** Explicit Web replay policy: per-fleet persisted xorshift32, not Java Math.random parity or a secret RNG. */
function random(navigation, world, fleet) {
  let seed = navigation.rngState ?? seedFor(world.id, fleet.id);
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
  navigation.rngState = seed >>> 0;
  return navigation.rngState / 4294967296;
}
function supportedNode(world, id) {
  const node = world.spaceEntities[id]; requireThat(node, 'NOT_FOUND', 'Jump entity is missing');
  requireThat(!node.tags.includes('wormhole'), 'UNSUPPORTED_JUMP', 'Wormholes require their own complete rules');
  const nav = world.locations[node.locationId]?.navigation;
  requireThat(nav && ['normal', 'hyperspace'].includes(nav.space) && nav.terrain.length === 0,
    'UNSUPPORTED_TRAVEL', 'Jump endpoint needs a supported environment');
  return node;
}
function begin(world, fleet, source, destination, paidFuel, tick) {
  requireThat(!fleet.navigation?.transition, 'IN_TRANSITION', 'Fleet is already jumping');
  requireThat(fleet.memberIds.length <= 256, 'TRANSITION_LIMIT', 'Transition roster exceeds this provider budget');
  const target = supportedNode(world, destination.targetId);
  const next = jsonCopy(fleet);
  next.navigation = { ...next.navigation, velocity: next.navigation?.velocity ?? [0, 0], destination: next.navigation?.destination ?? [...next.position] };
  delete next.navigation.interaction;
  next.navigation.transition = { schemaVersion: 1, sourceId: source.id, targetId: target.id, sourceLocationId: source.locationId, targetLocationId: target.locationId,
    minDistance: destination.minDistance, maxDistance: destination.maxDistance, phase: 'start', startedTick: tick, phaseTick: tick,
    moveTicks: 0, shipIds: [...next.memberIds], warpedCount: 0, jitterUntilTick: tick, intervalProgress: 0, nextInterval: 0.05, warpRate: 1, paidFuel };
  return next;
}
export function nearestOriginalGravityWell(world, fleet) {
  requireThat(world.locations[fleet.locationId]?.navigation?.jumpTopology === 'complete', 'UNSUPPORTED_FUEL_DRIFT',
    'Cannot infer absence of gravity wells from missing or incomplete topology');
  let nearest = null, nearestDistance = Infinity;
  // Stable identity order supplies the list order used to break exact native distance ties.
  for (const node of Object.values(world.spaceEntities).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) {
    if (node.locationId !== fleet.locationId || !node.jump || !['star', 'gas-giant'].includes(node.jump.anchor) || node.jump.destinations.length === 0) continue;
    const locations = node.jump.destinations.map(d => world.locations[world.spaceEntities[d.targetId].locationId]);
    if (locations.some(l => l.tags?.includes('system_abyssal'))) continue;
    requireThat(locations.every(l => l.navigation?.space === 'normal') && new Set(locations.map(l => l.id)).size === 1,
      'UNSUPPORTED_JUMP', 'Native gravity wells require one unambiguous destination star system');
    const d = distance(node.position, fleet.position);
    if (d < nearestDistance) { nearest = node; nearestDistance = d; }
  }
  return nearest;
}
export function requestOriginalJump(ctx, payload) {
  requireThat(isRecord(payload) && Object.keys(payload).every(k => ['fleetId', 'sourceId', 'destinationIndex'].includes(k)), 'INVALID_COMMAND', 'Jump accepts only an endpoint choice');
  const fleet = ctx.requireVersion('fleets', identifier(payload.fleetId));
  requireThat(ctx.actor.kind === 'player' ? canCommandFleet(ctx.world, fleet, ctx.actor.id) : fleetUsesNpcLogistics(fleet), 'FORBIDDEN', 'No fleet jump permission');
  requireThat(fleet.encounterId === null, 'ASSET_LOCKED', 'Cannot jump during an encounter');
  requireThat(!fleet.navigation?.transition, 'IN_TRANSITION', 'Fleet is already jumping');
  const source = ctx.requireVersion('spaceEntities', identifier(payload.sourceId)); supportedNode(ctx.world, source.id);
  requireThat(source.locationId === fleet.locationId && source.jump, 'LOCATION_CONFLICT', 'Jump point is not in this location');
  const index = integer(payload.destinationIndex, 'destination index');
  const destination = source.jump.destinations[index]; requireThat(destination, 'NOT_FOUND', 'Jump destination is unavailable');
  ctx.requireVersion('spaceEntities', destination.targetId);
  const members = fleet.memberIds.map(id => ctx.world.members[id]);
  ctx.services.travel.describe(ctx.world, fleet, members, ctx.services.fleetStats.resolve);
  originalFleetRadius(members);
  // As in the dialog, the amount is authority-derived and paid at request time, even if approach later aborts.
  const effective = ctx.services.fleetStats.resolve(fleet, fleet.memberIds.map(id => ctx.world.members[id]), { aiMode: fleetUsesNpcLogistics(fleet), world: ctx.world });
  const paidFuel = fleetUsesNpcLogistics(fleet) ? 0 : quoteOriginalJumpFuel(effective, ctx.world.locations[fleet.locationId].navigation.space === 'hyperspace');
  requireThat((fleet.cargo.fuel ?? 0) >= paidFuel, 'INSUFFICIENT_FUEL', 'Not enough fuel to initiate this jump');
  const next = begin(ctx.world, fleet, source, destination, paidFuel, ctx.world.clock.tick);
  next.cargo.fuel = (next.cargo.fuel ?? 0) - paidFuel; next.version = fleet.version + 1;
  return { changes: [{ collection: 'fleets', id: fleet.id, expectedVersion: fleet.version, value: next }],
    events: [{ type: 'fleet.jump-requested', data: { fleetId: fleet.id, sourceId: source.id, targetId: destination.targetId, paidFuel } }], result: { paidFuel } };
}
/** Engine-level script slice AFTER this tick's logistics and movement. No database or wall-clock I/O. */
export function advanceOriginalTransitions(world, fleet, members) {
  const rate = world.clock.ticksPerSecond, tick = world.clock.tick + 1, seconds = 1 / rate, events = [];
  let next = fleet;
  if (!next.navigation?.interaction?.arrived && !next.navigation?.transition && world.locations[next.locationId].navigation.space === 'hyperspace'
      && !fleetUsesNpcLogistics(next) && (next.cargo.fuel ?? 0) === 0) {
    const well = nearestOriginalGravityWell(world, next);
    if (well) {
      supportedNode(world, well.id);
      next = jsonCopy(next); next.navigation = { ...next.navigation, velocity: next.navigation?.velocity ?? [0, 0], destination: [...well.position] };
      if (distance(next.position, well.position) <= originalFleetRadius(members)) {
        const choice = Math.floor(random(next.navigation, world, next) * well.jump.destinations.length);
        next = begin(world, next, well, well.jump.destinations[choice], 0, tick);
        events.push({ type: 'fleet.drift-jump-started', data: { fleetId: next.id, sourceId: well.id, targetId: next.navigation.transition.targetId } });
        // Native scripts iterate a snapshot; the newly added transition starts next tick.
        return { fleet: next, events };
      }
    }
  }
  if (!next.navigation?.transition) return { fleet: next, events };
  next = jsonCopy(next);
  const nav = next.navigation, state = nav.transition, source = supportedNode(world, state.sourceId), target = supportedNode(world, state.targetId);
  requireThat(source.locationId === state.sourceLocationId && target.locationId === state.targetLocationId,
    'INVALID_TRANSITION', 'A live jump endpoint changed locations');
  const human = !fleetUsesNpcLogistics(next);
  nav.noEngageUntilTick = tick + 30 * rate;
  const emit = type => events.push({ type, data: { fleetId: next.id, sourceId: source.id, targetId: target.id, tick } });
  const enter = phase => {
    state.phase = phase; state.phaseTick = tick;
    if (phase === 'warp-out' || phase === 'warp-in') {
      state.warpedCount = 0; state.intervalProgress = 0; state.nextInterval = 0.05; state.warpRate = 1; state.jitterUntilTick = tick;
    }
    events.push({ type: 'fleet.jump-phase', data: { fleetId: next.id, phase, tick } });
  };
  const warpDone = () => state.warpedCount >= state.shipIds.length && (tick >= state.jitterUntilTick || (tick - state.phaseTick + 1) / rate > 5);
  const warpMember = () => {
    state.intervalProgress += seconds * state.warpRate;
    if (state.warpedCount < state.shipIds.length && (state.warpedCount === 0 || state.intervalProgress >= state.nextInterval)) {
      state.intervalProgress = state.warpedCount === 0 ? 0 : state.intervalProgress - state.nextInterval;
      state.warpedCount++; state.warpRate *= 1.1; state.jitterUntilTick = tick + rate;
      state.nextInterval = 0.05 + 0.15 * random(nav, world, next);
    }
  };
  const switchLocation = () => {
    const angle = random(nav, world, next) * Math.PI * 2;
    const radius = state.minDistance + random(nav, world, next) * (state.maxDistance - state.minDistance);
    next.locationId = target.locationId;
    next.position = [target.position[0] + Math.cos(angle) * radius, target.position[1] + Math.sin(angle) * radius];
    nav.destination = [...next.position]; // Native setLocation does NOT clear the movement module's velocity.
    emit('fleet.jump-location-changed'); enter(human ? 'fade-in' : 'warp-in');
  };
  if (state.phase === 'start') {
    nav.accelerationUntilTick = tick + Math.ceil(0.1 * reference.settings.secondsPerDay * rate);
    enter('approach');
  }
  if (state.phase === 'approach') {
    requireThat(next.locationId === source.locationId, 'INVALID_TRANSITION', 'Approach source changed locations');
    nav.destination = [...source.position]; state.moveTicks++;
    if (distance(next.position, source.position) - source.radius * 0.5 <= originalFleetRadius(members)) enter('warp-out');
    else if (state.moveTicks / rate > 2) {
      nav.destination = [...next.position]; delete nav.transition; emit('fleet.jump-aborted'); return { fleet: next, events };
    }
  }
  if (state.phase === 'warp-out') {
    nav.destination = [...source.position];
    if (warpDone()) { if (human) enter('fade-out'); else switchLocation(); }
    else warpMember();
  }
  if (state.phase === 'fade-out') {
    nav.destination = [...source.position];
    if ((tick - state.phaseTick + 1) / rate >= 0.25) switchLocation();
  }
  if (state.phase === 'fade-in' && (tick - state.phaseTick + 1) / rate >= 0.25) enter('warp-in');
  if (state.phase === 'warp-in') {
    if (warpDone()) {
      nav.destination = [...next.position]; nav.noEngageUntilTick = tick + rate; delete nav.transition; emit('fleet.jump-completed');
    } else if (state.warpedCount < state.shipIds.length) { nav.destination = [...next.position]; warpMember(); }
  }
  finite(nav.rngState ?? 1, 'jump random state', 1, 4294967295);
  return { fleet: next, events };
}
