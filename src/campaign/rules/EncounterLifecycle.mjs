import { canonicalJSON, identifier, integer, isRecord, requireThat } from '../core/Values.mjs';

import { canCommandFleet } from './FleetControl.mjs';
const PROVIDER_ID = 'cooperative.encounters';
const put = (collection, before, value) => ({
  collection, id: value.id, expectedVersion: before?.version ?? null,
  value: { ...value, version: before ? before.version + 1 : 0 },
});
const extensionId = id => `${PROVIDER_ID}:${id}`;
const event = (type, data) => ({ type, data });
function preparationDeadline(ctx) {
  const seconds=integer(ctx.settings.simulation?.preparationTimeoutGameSeconds,'preparation timeout',1);
  requireThat(seconds<=300,'RULE_SETTINGS','Preparation timeout exceeds supported range');
  return integer(ctx.world.clock.tick+seconds*ctx.world.clock.ticksPerSecond,'preparation deadline');
}
function systemOnly(ctx) {
  requireThat(ctx.actor.kind === 'system', 'FORBIDDEN', 'Only the world authority can schedule battle lifecycle commands');
}
function hostCanCommand(world, hostPlayerId, fleets) {
  identifier(hostPlayerId, 'compute host');
  requireThat(Object.hasOwn(world.players, hostPlayerId), 'NOT_FOUND', 'Compute host is not a player in this world');
  requireThat(fleets.some(f => canCommandFleet(world, f, hostPlayerId)),
  'FORBIDDEN', 'Compute host must command a participating fleet');
}
function loadAttempt(ctx, payload) {
  systemOnly(ctx);
  const encounter = ctx.requireVersion('encounters', identifier(payload.encounterId));
  integer(payload.battleAttempt, 'battle attempt', 1);
  requireThat(encounter.battleAttempt === payload.battleAttempt, 'STALE_ATTEMPT', 'Battle attempt has been superseded');
  const state = ctx.requireVersion('extensions', extensionId(encounter.id));
  requireThat(state.schemaVersion === 1 && state.data.kind === 'managed-battle', 'ENCOUNTER_SCHEMA', 'Unsupported battle checkpoint');
  return { encounter, state };
}
/** A frozen launch checkpoint, never a whole-world rollback image. */
function checkLockedAssets(ctx, encounter, state) {
  for (const before of Object.values(state.data.checkpoint.fleets)) {
    const current = ctx.world.fleets[before.id];
    requireThat(current && canonicalJSON(current) === canonicalJSON({ ...before, version: before.version + 1, encounterId: encounter.id }),
      'LOCKED_ASSET_CHANGED', 'A participating fleet changed while locked; recovery requires inspection');
  }
  for (const before of Object.values(state.data.checkpoint.members)) {
    requireThat(canonicalJSON(ctx.world.members[before.id] ?? null) === canonicalJSON(before),
      'LOCKED_ASSET_CHANGED', 'A participating ship changed while locked; recovery requires inspection');
  }
}
function prepare(ctx, payload) {
  systemOnly(ctx);
  requireThat(Array.isArray(payload.sides) && payload.sides.length === 2, 'INVALID_ENCOUNTER', 'This bridge requires exactly two combat sides');
  const seen = new Set(), fleetIds = [], sides = [];
  for (const side of payload.sides) {
    requireThat(isRecord(side) && Array.isArray(side.fleetIds) && side.fleetIds.length > 0, 'INVALID_ENCOUNTER', 'Each combat side needs fleets');
    const id = identifier(side.id, 'combat side');
    requireThat(!sides.some(s => s.id === id), 'INVALID_ENCOUNTER', 'Combat side IDs must be unique');
    for (const fleetId of side.fleetIds) {
      identifier(fleetId, 'fleet');
      requireThat(!seen.has(fleetId), 'INVALID_ENCOUNTER', 'A fleet cannot appear twice');
      seen.add(fleetId); fleetIds.push(fleetId);
    }
    sides.push({ id, fleetIds: [...side.fleetIds] });
  }
  requireThat(fleetIds.length <= 8, 'ENCOUNTER_LIMIT', 'Battle bridge fleet capacity exceeded');
  integer(payload.seed, 'battle seed');
  const fleets = fleetIds.map(id => ctx.requireVersion('fleets', id));
  requireThat(fleets.every(f => f.encounterId === null), 'ASSET_LOCKED', 'A fleet already belongs to an encounter');
  requireThat(fleets.every(f => !f.navigation?.transition), 'IN_TRANSITION', 'Cannot prepare a battle during a jump');
  requireThat(fleets.every(f => ctx.world.clock.tick >= (f.navigation?.noEngageUntilTick ?? 0)), 'NO_ENGAGE', 'A fleet is under jump protection');
  // Initiation/diplomacy/range policy belongs upstream. This internal bridge cannot be called by player packets.
  hostCanCommand(ctx.world, payload.hostPlayerId, fleets);
  const members = fleets.flatMap(f => f.memberIds.map(id => ctx.requireVersion('members', id)));
  requireThat(members.length > 0 && members.length <= 128, 'ENCOUNTER_LIMIT', 'Battle bridge ship capacity exceeded');
  const id = `encounter:${ctx.world.revision + 1}`;
  const encounter = { id, version: 0, fleetIds, battleAttempt: 1, status: 'preparing' };
  const checkpoint = {
    contentFingerprint: ctx.world.contentFingerprint,
    rules: ctx.world.rules,
    fleets: Object.fromEntries(fleets.map(f => [f.id, f])),
    members: Object.fromEntries(members.map(m => [m.id, m])),
  };
  const state = { id: extensionId(id), version: 0, schemaVersion: 1, data: {
    kind: 'managed-battle', hostPlayerId: payload.hostPlayerId, seed: payload.seed, sides,
    everStarted: false, preparationDeadlineTick: preparationDeadline(ctx), preparedRevision: ctx.world.revision + 1, checkpoint,
  } };
  return {
    changes: [put('encounters', null, encounter), put('extensions', null, state),
      ...fleets.map(f => put('fleets', f, { ...f, encounterId: id }))],
    events: [event('encounter.prepared', { encounterId: id, battleAttempt: 1 })],
    result: { encounterId: id, battleAttempt: 1 },
  };
}
function start(ctx, payload) {
  const { encounter, state } = loadAttempt(ctx, payload);
  requireThat(encounter.status === 'preparing', 'ENCOUNTER_PHASE', 'Battle is not preparing');
  checkLockedAssets(ctx, encounter, state);
  // The eventual gateway issues this only after content/roster/controls-ready checks.
  return {
    changes: [put('encounters', encounter, { ...encounter, status: 'running' }),
      put('extensions', state, { ...state, data: { ...state.data, everStarted: true } })],
    events: [event('encounter.started', { encounterId: encounter.id, battleAttempt: encounter.battleAttempt })], result: {},
  };
}
function interrupt(ctx, payload) {
  const { encounter } = loadAttempt(ctx, payload);
  requireThat(['preparing', 'running'].includes(encounter.status), 'ENCOUNTER_PHASE', 'Battle cannot be interrupted from this phase');
  const reason = identifier(payload.reason, 'interruption reason');
  return {
    changes: [put('encounters', encounter, { ...encounter, status: 'recovery-required' })],
    events: [event('encounter.interrupted', { encounterId: encounter.id, battleAttempt: encounter.battleAttempt, reason })], result: {},
  };
}
function retry(ctx, payload) {
  const { encounter, state } = loadAttempt(ctx, payload);
  requireThat(encounter.status === 'recovery-required', 'ENCOUNTER_PHASE', 'Battle does not require recovery');
  checkLockedAssets(ctx, encounter, state);
  hostCanCommand(ctx.world, payload.hostPlayerId, encounter.fleetIds.map(id => ctx.world.fleets[id]));
  const battleAttempt = integer(encounter.battleAttempt + 1, 'next battle attempt', 1);
  return {
    changes: [put('encounters', encounter, { ...encounter, status: 'preparing', battleAttempt }),
      put('extensions', state, { ...state, data: { ...state.data, hostPlayerId: payload.hostPlayerId, preparationDeadlineTick: preparationDeadline(ctx) } })],
    events: [event('encounter.retry-prepared', { encounterId: encounter.id, battleAttempt })],
    result: { encounterId: encounter.id, battleAttempt },
  };
}
function cancellationPlan(world, encounter, state) {
  requireThat(['preparing','recovery-required'].includes(encounter.status)&&!state.data.everStarted,
    'ENCOUNTER_PHASE','An already-started encounter requires battle resolution, not cancellation');
  checkLockedAssets({world},encounter,state);
  return {
    changes:[put('encounters',encounter,{...encounter,status:'cancelled'}),
      ...encounter.fleetIds.map(id=>put('fleets',world.fleets[id],{...world.fleets[id],encounterId:null}))],
    events:[event('encounter.preparation-cancelled',{encounterId:encounter.id})],result:{}
  };
}
function cancelPreparation(ctx,payload) {
  const {encounter,state}=loadAttempt(ctx,payload);
  return cancellationPlan(ctx.world,encounter,state);
}
/** Pure simulation service: no database writes, and no full-world checkpoint restore. */
function preparationDeadlines(world) {
  return Object.values(world.encounters).filter(e=>['preparing','recovery-required'].includes(e.status)).flatMap(e=>{
    const state=world.extensions[extensionId(e.id)];
    requireThat(state?.schemaVersion===1&&state.data.kind==='managed-battle','ENCOUNTER_SCHEMA','Missing managed-battle state');
    if(e.status==='recovery-required'&&state.data.everStarted)return [];
    return [{encounterId:e.id,tick:integer(state.data.preparationDeadlineTick,'preparation deadline')}];
  });
}
function expirePreparations(world,atTick) {
  const changes=[],events=[];
  for(const deadline of preparationDeadlines(world)) {
    if(deadline.tick>atTick)continue;
    const e=world.encounters[deadline.encounterId],state=world.extensions[extensionId(e.id)];
    if(state.data.everStarted) changes.push(put('encounters',e,{...e,status:'recovery-required'}));
    else {const plan=cancellationPlan(world,e,state);changes.push(...plan.changes);events.push(...plan.events);}
    events.push(event('encounter.preparation-timed-out',{encounterId:e.id,battleAttempt:e.battleAttempt,released:!state.data.everStarted}));
  }
  return {changes,events};
}
export const encounterLifecycleProvider = Object.freeze({
  id: PROVIDER_ID, version: '0.4.0', service: 'encounters', apiVersion: 1,
  capabilities: ['isolated-launch-checkpoints', 'attempt-fencing', 'preparation-cancellation','preparation-deadlines'],
  evidence: [{ source: 'Web cooperative bridge', scope: 'Lifecycle only; no original initiation, deployment cost, combat adapter, result settlement or rewards' }],
  methods: { preparationDeadlines, expirePreparations },
  commands: {
    'encounter.prepare': prepare, 'encounter.start': start, 'encounter.interrupt': interrupt,
    'encounter.retry': retry, 'encounter.cancel-preparation': cancelPreparation,
  },
});
