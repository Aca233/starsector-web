import { canonicalJSON, integer, isRecord, jsonCopy, requireThat, deepFreeze } from '../core/Values.mjs';
import { LOGISTICS_TICKS_PER_SECOND, LOGISTICS_MAX_TICKS } from './OriginalLogisticsStep.mjs';

import { fleetUsesNpcLogistics } from './FleetControl.mjs';
/** Explicit multiplayer time policy, not a second implementation of native logistics. */
function advanceWorld(ctx, payload) {
  requireThat(ctx.actor.kind === 'system', 'FORBIDDEN', 'Only the world scheduler may advance time');
  requireThat(Object.keys(payload).every(k => ['fromTick', 'ticks'].includes(k)), 'INVALID_COMMAND', 'World step accepts only an expected tick and bounded tick count');
  integer(payload.fromTick, 'starting tick'); integer(payload.ticks, 'tick count', 1);
  requireThat(payload.ticks <= LOGISTICS_MAX_TICKS, 'SIMULATION_LIMIT', 'World step exceeds tick budget');
  requireThat(payload.fromTick === ctx.world.clock.tick, 'TIME_CONFLICT', 'World already advanced beyond this slice');
  requireThat(ctx.world.clock.ticksPerSecond === LOGISTICS_TICKS_PER_SECOND && ctx.settings.simulation.ticksPerSecond === LOGISTICS_TICKS_PER_SECOND,
    'RULE_SETTINGS', 'Native logistics scheduler requires its declared tick rate');
  requireThat(ctx.settings.simulation.encounterTimePolicy === 'pause-participants', 'RULE_SETTINGS', 'Unsupported encounter time policy');
  const nextTick = integer(payload.fromTick + payload.ticks, 'next world tick');
  const draft = jsonCopy(ctx.world), events = [], reports = {}, paused = new Set(), expirations = [];
  // Copy writable collection containers before freezing; entity values are replaced, never mutated.
  const snapshot = () => deepFreeze({ ...draft, clock: { ...draft.clock }, spaceEntities: { ...draft.spaceEntities }, fleets: { ...draft.fleets }, members: { ...draft.members },
    extensions: { ...draft.extensions }, encounters: { ...draft.encounters }, invitations: { ...draft.invitations } });
  const deadlines = new Set(ctx.services.encounters.preparationDeadlines(snapshot()).map(d => d.tick));
  const atBoundary = tick => {
    draft.clock = { ...draft.clock, tick, gameSeconds: tick / draft.clock.ticksPerSecond };
    // Expire BEFORE rules observe this frame, even inside a larger transaction.
    for (const invite of Object.values(draft.invitations)) {
      if (invite.expiresAt <= draft.clock.gameSeconds) {
        delete draft.invitations[invite.id]; expirations.push({ invitationId: invite.id, tick });
      }
    }
    if (tick !== payload.fromTick && tick !== nextTick && !deadlines.has(tick)) return;
    const plan = ctx.services.encounters.expirePreparations(snapshot(), tick);
    requireThat(isRecord(plan) && Array.isArray(plan.changes) && Array.isArray(plan.events) && plan.clock === undefined,
      'INVALID_PLAN', 'Preparation expiry must return entity changes and events, not its own clock');
    for (const change of plan.changes) {
      // This policy supports only in-place encounter/fleet transitions. An overhaul needing
      // wider effects must replace simulation too, not have its writes silently discarded.
      requireThat(isRecord(change) && ['encounters', 'fleets'].includes(change.collection),
        'INVALID_PLAN', 'Preparation expiry may only update encounters and fleet locks in this simulation policy');
      const before = draft[change.collection][change.id];
      requireThat(before && before.version === change.expectedVersion && isRecord(change.value)
        && change.value.id === change.id && change.value.version === before.version + 1,
      'INVALID_PLAN', 'Preparation expiry must update an existing entity at its current version');
      draft[change.collection][change.id] = change.value;
    }
    events.push(...plan.events);
  };
  for (let tick = payload.fromTick; tick < nextTick; tick++) {
    atBoundary(tick);
    // Explicit Web order: all spatial endpoints advance focus-first, then all fleets
    // observe the same endpoint state. Not native BaseLocation insertion-order parity.
    const spatial = ctx.services.spaceMotion.advance(snapshot(), 1 / draft.clock.ticksPerSecond);
    requireThat(isRecord(spatial) && Array.isArray(spatial.changes) && Array.isArray(spatial.events) && spatial.clock === undefined,
      'INVALID_PLAN', 'Space motion must return entity changes and events only');
    const spatialIds = new Set();
    for (const change of spatial.changes) {
      requireThat(isRecord(change) && change.collection === 'spaceEntities' && !spatialIds.has(change.id),
        'INVALID_PLAN', 'Space motion must update each spatial entity at most once');
      const before = draft.spaceEntities[change.id];
      requireThat(before && before.version === change.expectedVersion && isRecord(change.value)
        && change.value.id === change.id && change.value.version === before.version + 1,
        'INVALID_PLAN', 'Space motion must update an existing entity at its current version');
      spatialIds.add(change.id); draft.spaceEntities[change.id] = change.value;
    }
    events.push(...spatial.events);
    // All fleets sample the SAME tick-start world. Entity versions/revision are commit
    // metadata, not simulation inputs; providers must not use them to compute mechanics.
    const frame = snapshot();
    for (const fleet of Object.values(frame.fleets)) {
      if (fleet.encounterId !== null) { paused.add(fleet.id); continue; }
      const members = fleet.memberIds.map(id => frame.members[id]);
      const travel = ctx.services.travel.describe(frame, fleet, members, ctx.services.fleetStats.resolve);
      const result = ctx.services.logistics.advance({ fleet, members: fleet.memberIds.map(id => frame.members[id]), ticks: 1,
        aiMode: fleetUsesNpcLogistics(fleet), motion: travel.motion }, (f, members, options) => ctx.services.fleetStats.resolve(f, members, { ...options, world: frame }));
      // CampaignFleet.advance bills logistics from the old velocity before integrating movement.
      const movement = ctx.services.travel.advance(result.fleet, travel, 1 / frame.clock.ticksPerSecond);
      requireThat(isRecord(movement) && isRecord(movement.fleet) && Array.isArray(movement.events), 'INVALID_PLAN', 'Travel must return a fleet and events');
      draft.fleets[fleet.id] = movement.fleet; events.push(...movement.events);
      result.members.forEach(member => { draft.members[member.id] = member; });
      const report = reports[fleet.id] ?? { suppliesConsumed: 0, fuelConsumed: 0, activeTicks: 0, memberReports: {} };
      report.suppliesConsumed += result.suppliesConsumed; report.fuelConsumed += result.fuelConsumed; report.activeTicks += 1;
      for (const [id, value] of Object.entries(result.memberReports)) {
        const previous = report.memberReports[id];
        report.memberReports[id] = { ...value, shortageCRLoss: (previous?.shortageCRLoss ?? 0) + value.shortageCRLoss,
          repairsCompleted: Boolean(previous?.repairsCompleted || value.repairsCompleted) };
      }
      reports[fleet.id] = report;
    }
    // Optional replaceable retail service advances counters only; entering a market performs stocking.
    if (ctx.services.retail) {
      requireThat(typeof ctx.services.retail.advanceFrame === 'function', 'INVALID_PLAN', 'Selected retail service must supply fixed-frame advancement');
      const retail = ctx.services.retail.advanceFrame(snapshot());
      requireThat(isRecord(retail) && Array.isArray(retail.changes) && Array.isArray(retail.events) && retail.clock === undefined,
        'INVALID_PLAN', 'Retail time may return extension changes and events, not its own clock');
      const ids = new Set();
      for (const change of retail.changes) {
        requireThat(isRecord(change) && change.collection === 'extensions' && !ids.has(change.id), 'INVALID_PLAN', 'Retail time may update each existing extension once');
        const before = draft.extensions[change.id];
        requireThat(before && before.version === change.expectedVersion && isRecord(change.value) && change.value.id === change.id && change.value.version === before.version + 1,
          'INVALID_PLAN', 'Retail time must update an existing extension at its current version');
        ids.add(change.id); draft.extensions[change.id] = change.value;
      }
      events.push(...retail.events);
    }
  }
  atBoundary(nextTick);
  if (expirations.length) events.push({ type: 'party.invitations-expired', data: { invitationIds: expirations.map(e => e.invitationId), expirations } });
  // Collapse all timed substeps to one write/version per entity in the atomic commit.
  const changes = [];
  for (const collection of ['spaceEntities', 'fleets', 'members', 'encounters', 'invitations', 'extensions']) {
    for (const [id, before] of Object.entries(ctx.world[collection])) {
      const after = draft[collection][id];
      if (after === undefined) changes.push({ collection, id, expectedVersion: before.version, value: null });
      else if (canonicalJSON(before) !== canonicalJSON(after)) changes.push({ collection, id, expectedVersion: before.version, value: { ...after, version: before.version + 1 } });
    }
  }
  const { gameSeconds } = draft.clock;
  events.push({ type: 'world.advanced', data: { fromTick: payload.fromTick, tick: nextTick, pausedFleetIds: [...paused] } });
  return { changes, events, clock: { expected: ctx.world.clock, value: draft.clock },
    result: { tick: nextTick, gameSeconds, fleets: reports, pausedFleetIds: [...paused] } };
}
export const cooperativeSimulationProvider = Object.freeze({
  id: 'cooperative.simulation', version: '0.5.0', service: 'simulation', apiVersion: 1,
  capabilities: ['world-clock-writer', 'atomic-world-step', 'pause-encounter-participants'],
  requires: { spaceMotion: ['authoritative-space-motion', 'validated-orbit-graph'], travel: ['authoritative-motion', 'post-movement-events'], logistics: ['native-step-recovery'], fleetStats: ['effective-logistics-stats'], encounters: ['preparation-deadlines'] },
  evidence: [{ source: 'Explicit Web multiplayer policy', scope: 'One clock; pause locked participant logistics without catch-up, continue other fleets; bounded preparation' }],
  commands: { 'world.advance': advanceWorld },
});
