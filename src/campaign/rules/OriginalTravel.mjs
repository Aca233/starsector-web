import { advanceOriginalTransitions, requestOriginalJump, originalFleetRadius, nearestOriginalGravityWell } from './OriginalTransitions.mjs';
import reference from '../data/reference-logistics.json' with { type: 'json' };
import { finite, identifier, isRecord, requireThat } from '../core/Values.mjs';
import { advanceOriginalMovement } from './OriginalMovement.mjs';
import { canCommandFleet, fleetUsesNpcLogistics } from './FleetControl.mjs';

export function resolveOriginalTravelStats(fleet, members, cargo) {
  requireThat(members.length === fleet.memberIds.length, 'INVALID_TRAVEL', 'Travel needs all ordered member statistics');
  const burns = members.map((m, i) => {
    requireThat(m.id === fleet.memberIds[i], 'INVALID_TRAVEL', 'Travel member order mismatch');
    return finite(m.maxBurn, 'member maximum burn', 0, 1e6);
  });
  // FleetData includes mothballed members in MIN burn. Its empty-fleet speed is a separate branch.
  const minBurn = burns.length ? Math.min(...burns) : 0;
  requireThat(isRecord(cargo), 'INVALID_TRAVEL', 'Travel requires authoritative capacities and cargo');
  for (const key of ['spaceUsed', 'capacity', 'fuel', 'fuelCapacity', 'crew', 'marines', 'personnelCapacity']) finite(cargo[key], key, 0);
  // CampaignFleet.updateSpeedBonus: the largest overload ratio wins; ship-count
  // excess is doubled before dividing by the limit. Only player-mode fleets pay it.
  const overload = fleetUsesNpcLogistics(fleet) ? 1 : Math.min(2, Math.max(1,
    cargo.fuel / Math.max(1, cargo.fuelCapacity), (cargo.crew + cargo.marines) / Math.max(1, cargo.personnelCapacity),
    cargo.spaceUsed / Math.max(1, cargo.capacity), (2 * members.length - reference.settings.maxShips) / reference.settings.maxShips));
  const burnMultiplier = 2 - overload, effectiveBurn = minBurn * burnMultiplier;
  let roundedBurn = Math.floor(effectiveBurn + 0.5);
  // FleetData guarantees that a real reduction cannot round back to the original burn.
  if (effectiveBurn < minBurn && roundedBurn === minBurn) roundedBurn -= 1;
  const burnLevel = Math.min(20, Math.max(0, roundedBurn));
  const maxSpeed = burns.length === 0 ? 200 : burnLevel <= 0 ? reference.navigation.minTravelSpeed
    : reference.navigation.baseTravelSpeed + Math.max(1, burnLevel) * reference.navigation.speedPerBurnLevel;
  return { minBurn, burnLevel, maxSpeed, acceleration: Math.max(10, maxSpeed) };
}
function environment(world, fleet) {
  const nav = world.locations[fleet.locationId]?.navigation;
  requireThat(isRecord(nav) && ['normal', 'hyperspace'].includes(nav.space) && Array.isArray(nav.terrain),
    'UNSUPPORTED_TRAVEL', 'Location needs an explicit navigation environment');
  requireThat(nav.terrain.length === 0, 'UNSUPPORTED_TRAVEL', 'Location terrain has not been ported; refusing unobstructed travel');
  requireThat(!fleet.travelOrder && !fleet.velocity && !fleet.travelModifiers && !fleet.activeAbilities && !fleet.goSlow,
    'UNSUPPORTED_TRAVEL', 'Unported legacy movement, modifiers or abilities');
  return nav;
}
function describe(world, fleet, members, resolveStats) {
  const nav = environment(world, fleet);
  if (!fleet.navigation) {
    return { world, members, motion: { inHyperspace: nav.space === 'hyperspace', speed: 0, hyperFuelMultiplier: 1, normalFuelMultiplier: 0, hiddenFuelMultiplier: 1 }, stats: null };
  }
  const effective = resolveStats(fleet, members, { aiMode: fleetUsesNpcLogistics(fleet), world });
  const stats = resolveOriginalTravelStats(fleet, effective.members, effective.cargo);
  if (world.clock.tick < (fleet.navigation.accelerationUntilTick ?? 0)) stats.acceleration = Math.max(10, stats.maxSpeed * 10);
  return { world, members, stats, motion: { inHyperspace: nav.space === 'hyperspace', speed: Math.hypot(...fleet.navigation.velocity),
    hyperFuelMultiplier: 1, normalFuelMultiplier: 0, hiddenFuelMultiplier: 1 } };
}
function advance(fleet, description, seconds) {
  requireThat(seconds === 1 / description.world.clock.ticksPerSecond, 'SIMULATION_LIMIT', 'Travel scripts require one authoritative tick');
  let next = fleet;
  const events = [];
  if (fleet.navigation?.interaction) {
    const target = description.world.spaceEntities[fleet.navigation.interaction.targetId];
    requireThat(target?.locationId === fleet.locationId, 'LOCATION_CONFLICT', 'Interaction target is not local');
    const arrived = Math.hypot(target.position[0] - fleet.position[0], target.position[1] - fleet.position[1]) < originalFleetRadius(description.members) + target.radius;
    // NoFuelDriftScript uses setMoveDestinationOverride: ordinary interaction following
    // cannot overwrite the engine-script destination from the preceding tick. A local
    // arrived-dialog hold is the explicit multiplayer replacement for native global pause.
    const driftOverride = description.motion.inHyperspace && !fleetUsesNpcLogistics(fleet) && (fleet.cargo.fuel ?? 0) === 0
      && nearestOriginalGravityWell(description.world, fleet) !== null;
    next = { ...fleet, navigation: { ...fleet.navigation, interaction: { ...fleet.navigation.interaction, arrived },
      destination: arrived ? [...fleet.position] : driftOverride ? fleet.navigation.destination : [...target.position], velocity: arrived ? [0, 0] : fleet.navigation.velocity } };
    if (arrived && !fleet.navigation.interaction.arrived) events.push({ type: 'fleet.interaction-ready', data: { fleetId: fleet.id, targetId: target.id } });
  }
  if (next.navigation && next.navigation.destination !== null && !next.navigation.interaction?.arrived) {
    const result = advanceOriginalMovement({ position: next.position, velocity: next.navigation.velocity,
      destination: next.navigation.destination, ...description.stats, seconds });
    next = { ...next, position: result.position, navigation: { ...next.navigation, velocity: result.velocity } };
  }
  const transitioned = advanceOriginalTransitions(description.world, next, description.members);
  return { fleet: transitioned.fleet, events: [...events, ...transitioned.events] };
}
function command(ctx, payload, kind, orderId) {
  const stop = kind === 'stop', approach = kind === 'approach';
  requireThat(Object.keys(payload).every(k => (approach ? ['fleetId', 'targetId'] : stop ? ['fleetId', 'locationId'] : ['fleetId', 'locationId', 'destination']).includes(k)),
    'INVALID_COMMAND', 'Course commands do not accept speed, fuel costs or new fleet state');
  const fleet = ctx.requireVersion('fleets', identifier(payload.fleetId));
  const allowed = ctx.actor.kind === 'player' ? canCommandFleet(ctx.world, fleet, ctx.actor.id) : fleetUsesNpcLogistics(fleet);
  requireThat(allowed, 'FORBIDDEN', 'Only the controller may order this fleet');
  requireThat(fleet.encounterId === null, 'ASSET_LOCKED', 'Cannot change course during an encounter');
  requireThat(!fleet.navigation?.transition, 'IN_TRANSITION', 'Cannot change course during a jump');
  const target = approach ? ctx.requireVersion('spaceEntities', identifier(payload.targetId)) : null;
  if (target) {
    const knownPort = ctx.actor.kind === 'player' && ctx.services.market?.ports?.(ctx.world, ctx.actor).some(port => port.anchorEntityId === target.id);
    requireThat(target.jump?.destinations.length > 0 && !target.tags.includes('wormhole') || knownPort,
      'UNSUPPORTED_INTERACTION', 'Only supported ordinary jump points and known market anchors are interactive');
  }
  requireThat((target?.locationId ?? identifier(payload.locationId)) === fleet.locationId, 'LOCATION_CONFLICT', 'Course is for a different location');
  environment(ctx.world, fleet);
  const destination = target ? target.position : stop ? [...fleet.position] : payload.destination;
  requireThat(Array.isArray(destination) && destination.length === 2, 'INVALID_COMMAND', 'Expected destination coordinates');
  destination.forEach(n => finite(n, 'destination', -1e12, 1e12));
  const value = { ...fleet, version: fleet.version + 1, navigation: { ...fleet.navigation, velocity: fleet.navigation?.velocity ?? [0, 0], destination: [...destination] } };
  delete value.navigation.interaction;
  if (target) value.navigation.interaction = { targetId: target.id, orderId: identifier(orderId), arrived: false };
  describe(ctx.world, value, fleet.memberIds.map(id => ctx.world.members[id]), ctx.services.fleetStats.resolve);
  return { changes: [{ collection: 'fleets', id: fleet.id, expectedVersion: fleet.version, value }],
    events: [{ type: approach ? 'fleet.approaching' : stop ? 'fleet.stopping' : 'fleet.course-set', data: { fleetId: fleet.id, locationId: fleet.locationId, destination } }], result: {} };
}
export const originalTravelProvider = Object.freeze({
  id: 'reference.travel', version: '0.7.0', service: 'travel', apiVersion: 1,
  capabilities: ['authoritative-motion', 'persistent-interaction-intent', 'post-movement-events', 'persistent-jump-transitions', 'native-open-space-movement'], requires: { spaceMotion: ['authoritative-space-motion', 'validated-orbit-graph'], fleetStats: ['effective-travel-stats', 'effective-logistics-stats'] },
  evidence: [{ source: 'SmoothMovementModule.advance / FleetData.getBurnLevel,getTravelSpeed / CampaignFleet.advance,updateSpeedBonus',
    scope: 'Native float SmoothMovementModule with resolved fleet speed; fixed destination, known modifiers, explicit empty-terrain environments; staged ordinary jumps and explicit gravity-well topology; not terrain, abilities or wormholes; orbital endpoints are supplied by the selected space-motion provider', navigation: reference.navigation },
    { source: 'CampaignEngine.doHyperspaceTransition / NoFuelDriftScript / JumpPointInteractionDialogPluginImpl',
      scope: 'Ordinary jump fee, ordered engine-script stages after fleet physics, nearest eligible well, no-engaging guard' },
    { source: 'CampaignState.controlPlayerFleet / BaseLocation player interaction', scope: 'Persisted ordinary jump or known market interaction target, pursuit and fleet selection radius + entity radius arrival. Web holds only the interacting fleet, never pauses the shared world.' },
    { source: 'Explicit Web multiplayer policy', scope: 'Full-precision fixed-tick transitions for every fleet, no viewport or fast-advance shortcuts; human control gets player fades',
      replayRandom: 'Per-fleet saved xorshift32 with world/fleet identity seed; not Java random sequence parity or secret reward randomness',
      topology: 'Known-empty and unavailable topology are distinct; live endpoints may move spatially but cannot change locations mid-jump' }],
  methods: { describe, advance }, commands: { 'fleet.jump': requestOriginalJump, 'fleet.approach': (ctx, payload, orderId) => command(ctx, payload, 'approach', orderId), 'fleet.set-course': (ctx, payload) => command(ctx, payload, 'course'), 'fleet.stop': (ctx, payload) => command(ctx, payload, 'stop') },
});
