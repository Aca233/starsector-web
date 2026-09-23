import { identifier, finite, requireThat } from '../core/Values.mjs';
import { LOGISTICS_TICKS_PER_SECOND, advanceOriginalFleet } from './OriginalLogisticsStep.mjs';
import { ORIGINAL_LOGISTICS_CONSTANTS, quoteOriginalLogistics } from './OriginalLogisticsQuote.mjs';
export { ORIGINAL_LOGISTICS_CONSTANTS, quoteOriginalLogistics } from './OriginalLogisticsQuote.mjs';

import { canCommandFleet } from './FleetControl.mjs';
const put = (collection, before, value) => ({ collection, id: value.id, expectedVersion: before?.version ?? null,
  value: { ...value, version: before ? before.version + 1 : 0 } });
function requireRepairControl(ctx, fleet) {
  requireThat(canCommandFleet(ctx.world, fleet, ctx.actor.id), 'FORBIDDEN', 'No fleet command permission');
  requireThat(fleet.encounterId === null, 'ASSET_LOCKED', 'Cannot change repairs during an encounter');
  requireThat(!fleet.navigation?.transition, 'IN_TRANSITION', 'Cannot change repairs during a jump');
}
function setRepairs(ctx, payload) {
  requireThat(ctx.actor.kind === 'player', 'FORBIDDEN', 'Player command required');
  requireThat(typeof payload.suspended === 'boolean', 'INVALID_COMMAND', 'Specify suspended as boolean');
  const member = ctx.requireVersion('members', identifier(payload.memberId));
  const fleet = ctx.requireVersion('fleets', member.fleetId);
  requireRepairControl(ctx, fleet);
  // Native individual repair control is disabled for mothballed ships. Enforce it beyond the UI.
  requireThat(!member.logistics?.mothballed, 'MEMBER_MOTHBALLED', 'Mothballed ships cannot change repair policy');
  return { changes: [put('members', member, { ...member, logistics: { mothballed: false, ...member.logistics, suspendRepairs: payload.suspended } })],
    events: [{ type: 'logistics.repair-policy-changed', data: { memberId: member.id, suspended: payload.suspended } }], result: {} };
}
function setFleetRepairs(ctx, payload) {
  requireThat(ctx.actor.kind === 'player', 'FORBIDDEN', 'Player command required');
  requireThat(typeof payload.suspended === 'boolean', 'INVALID_COMMAND', 'Specify suspended as boolean');
  const fleet = ctx.requireVersion('fleets', identifier(payload.fleetId));
  requireRepairControl(ctx, fleet);
  // One bounded plan, never partial chunks. The kernel also bounds supplied expectations.
  requireThat(fleet.memberIds.length <= 512, 'PLAN_LIMIT', 'Fleet repair policy exceeds the 512-member plan budget');
  // Require the entire roster, including already-matching policies, before planning any writes.
  const members = fleet.memberIds.map(id => ctx.requireVersion('members', id));
  const changes = members.filter(member => !member.logistics?.mothballed
    && (member.logistics?.suspendRepairs ?? false) !== payload.suspended)
    .map(member => put('members', member, { ...member,
      logistics: { mothballed: false, ...member.logistics, suspendRepairs: payload.suspended } }));
  const changedMemberIds = changes.map(change => change.id);
  const result = { fleetId: fleet.id, suspended: payload.suspended, changedMemberIds };
  return { changes, events: changes.length ? [{ type: 'logistics.fleet-repair-policy-changed', data: result }] : [], result };
}
function setMothballed(ctx, payload) {
  requireThat(ctx.actor.kind === 'player', 'FORBIDDEN', 'Player command required');
  requireThat(Object.keys(payload).length === 2 && Object.hasOwn(payload, 'memberId') && typeof payload.mothballed === 'boolean', 'INVALID_COMMAND', 'Specify memberId and mothballed only');
  const member = ctx.requireVersion('members', identifier(payload.memberId));
  const fleet = ctx.requireVersion('fleets', member.fleetId);
  requireRepairControl(ctx, fleet);
  const wasMothballed = member.logistics?.mothballed ?? false;
  const previousCR = finite(member.logistics?.crPriorToMothballing ?? 0, 'CR before mothballing', 0, 1);
  const changed = wasMothballed !== payload.mothballed;
  const combatReadiness = changed ? (payload.mothballed ? 0 : previousCR) : member.condition.combatReadiness;
  const result = { fleetId: fleet.id, memberId: member.id, mothballed: payload.mothballed, combatReadiness };
  if (!changed && !member.logistics?.suspendRepairs) return { changes: [], events: [], result };
  const value = { ...member, condition: { ...member.condition, combatReadiness },
    logistics: { ...member.logistics, mothballed: payload.mothballed, suspendRepairs: false,
      crPriorToMothballing: changed && payload.mothballed ? member.condition.combatReadiness : previousCR } };
  return { changes: [put('members', member, value)], events: [{ type: 'logistics.mothball-state-changed', data: result }], result };
}
export const originalLogisticsProvider = Object.freeze({
  id: 'reference.logistics', version: '0.8.0', service: 'logistics', apiVersion: 1,
  capabilities: ['effective-stat-quote', 'monthly-maintenance', 'cr-recovery-cost', 'overcapacity-cost', 'hyperspace-fuel-cost', 'native-step-recovery', 'native-repair-controls', 'native-repair-sidebar', 'native-mothball-controls'],
  requires: { fleetStats: ['effective-logistics-stats'] },
  evidence: [{ reference: 'Starsector 0.98a-RC8', source: 'LogisticsModule.java / RepairTracker.java / FleetMemberStatus.java',
    scope: 'Stepwise supply consumption, base CR and non-modular ship repair; movement cost kernel only, no world travel scheduler' },
    { source: 'coreui/refit/auto/new.java:365-381 / coreui fleet-member repair control',
      scope: 'Native Q/W excludes mothballed members; individual repair control is unavailable while mothballed' },
    { source: 'LogisticsModule.java:207-219 / coreui/refit/auto/new.java:175-194',
      scope: 'Fleet repair sidebar includes recovering members upkeep; separate from additional recovery cost and total billing' },
    { source: 'RepairTracker.java:124-135,447-460 / FleetMemberRow:624-638', scope: 'Single-member mothball toggle, repair reset, CR undo until positive simulation time, original existing Fleet-tab button' },
    { source: 'data/config/settings.json', scope: 'Native logistics constants', effectiveConstants: ORIGINAL_LOGISTICS_CONSTANTS },
    { source: 'Web authority scheduling policy', ticksPerSecond: LOGISTICS_TICKS_PER_SECOND }],
  methods: { quote: quoteOriginalLogistics, advance: advanceOriginalFleet },
  commands: { 'logistics.set-repairs': setRepairs, 'logistics.set-fleet-repairs': setFleetRepairs, 'logistics.set-mothballed': setMothballed },
});
