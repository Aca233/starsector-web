import { originalOrbitsProvider } from '../src/campaign/rules/OriginalOrbits.mjs';
import { originalTravelProvider } from '../src/campaign/rules/OriginalTravel.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, unlinkSync, rmdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { DatabaseSync } from 'node:sqlite';
import { createReferenceRuleset } from '../src/campaign/ReferenceRuleset.mjs';
import { createCampaignWorld, validateCampaignWorld } from '../src/campaign/core/WorldState.mjs';
import { CampaignRuleRegistry } from '../src/campaign/core/RuleRegistry.mjs';
import { originalFleetStatsProvider } from '../src/campaign/rules/OriginalFleetStats.mjs';
import { originalLogisticsProvider } from '../src/campaign/rules/OriginalLogistics.mjs';
import { encounterLifecycleProvider } from '../src/campaign/rules/EncounterLifecycle.mjs';
import { cooperationProvider } from '../src/campaign/rules/Cooperation.mjs';
import { cooperativeSimulationProvider } from '../src/campaign/rules/CooperativeSimulation.mjs';
import { CampaignRepository } from '../server/campaign/Repository.mjs';
import { CampaignService } from '../server/campaign/CampaignService.mjs';
import { CampaignSimulationLoop } from '../server/campaign/SimulationLoop.mjs';
const rules = createReferenceRuleset(), system = { kind: 'system', id: 'world-service' };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
function shortDeadlineRules() {
  return new CampaignRuleRegistry().register(originalOrbitsProvider).register(originalFleetStatsProvider).register(originalLogisticsProvider).register(encounterLifecycleProvider)
    .register(cooperationProvider).register(cooperativeSimulationProvider).register(originalTravelProvider).compile({
      id: 'test.short-deadline', version: '1', providers: { spaceMotion: originalOrbitsProvider.id, travel: originalTravelProvider.id, fleetStats: originalFleetStatsProvider.id, logistics: originalLogisticsProvider.id,
        encounters: encounterLifecycleProvider.id, cooperation: cooperationProvider.id, simulation: cooperativeSimulationProvider.id },
      settings: { ...structuredClone(rules.lock.settings), simulation: { ...rules.lock.settings.simulation, preparationTimeoutGameSeconds: 1 } },
    });
}
function fixture(selected = rules) {
  const w = structuredClone(createCampaignWorld({ id: 'world', rules: selected.lock, contentFingerprint: 'simulation-fixture' }));
  w.locations.port = { id: 'port', version: 0, name: 'Common location' , navigation: { space: 'normal', terrain: [] } };
  for (const id of ['a', 'b', 'c']) {
    w.players[id] = { id, version: 0, name: id, factionId: null };
    w.fleets[id] = { id, version: 0, owner: { kind: 'player', id }, control: { kind: 'player', id }, locationId: 'port', position: [0, 0], memberIds: [id],
      partyId: null, encounterId: null, cargo: { supplies: 20, fuel: 10, crew: 15 } };
    w.members[id] = { id, version: 0, fleetId: id, owner: { kind: 'player', id }, loadout: { hullId: 'wolf' },
      condition: { status: 'ready', hullFraction: 0.5, combatReadiness: 0.5, armor: null, ammunition: {} } };
  }
  return validateCampaignWorld(w);
}
function store(t, selected = rules, w = fixture(selected), filename = ':memory:') {
  const s = new CampaignRepository(filename, selected); t.after(() => s.close()); s.create(w); return s;
}
function command(s, type, payload, refs = [], requestId = `${type}:${s.read('world').revision}`) {
  const w = s.read('world');
  return { worldId: 'world', epoch: s.epoch, requestId, type, payload,
    expected: refs.map(([collection, id]) => ({ collection, id, version: w[collection][id].version })) };
}
function step(s, ticks = 60, id) { return s.execute(system, command(s, 'world.advance', { fromTick: s.read('world').clock.tick, ticks }, [], id)); }
function prepare(s) {
  return s.execute(system, command(s, 'encounter.prepare', { sides: [{ id: 'one', fleetIds: ['a'] }, { id: 'two', fleetIds: ['b'] }],
    hostPlayerId: 'a', seed: 3 }, [['fleets', 'a'], ['fleets', 'b'], ['members', 'a'], ['members', 'b']])).result.encounterId;
}
function lifecycle(s, encounterId, type, payload = {}) {
  return s.execute(system, command(s, type, { encounterId, battleAttempt: s.read('world').encounters[encounterId].battleAttempt, ...payload },
    [['encounters', encounterId], ['extensions', `cooperative.encounters:${encounterId}`]]));
}
function temporary(t) {
  const directory = mkdtempSync(join(tmpdir(), 'starsector-world-time-')), filename = join(directory, 'world.sqlite');
  // Register cleanup BEFORE stores so they close in the test's explicit finally blocks.
  t.after(() => { for (const suffix of ['', '-wal', '-shm']) if (existsSync(filename + suffix)) unlinkSync(filename + suffix); rmdirSync(directory); });
  return filename;
}

test('one transaction advances one global clock and every independent fleet with native upkeep', t => {
  const s = store(t), before = s.read('world'); step(s, 600);
  const after = s.read('world'); assert.deepEqual(after.clock, { tick: 600, ticksPerSecond: 60, gameSeconds: 10 });
  for (const id of ['a', 'b', 'c']) {
    near(after.members[id].condition.hullFraction, 0.6); near(after.members[id].condition.combatReadiness, 0.6);
    near(before.fleets[id].cargo.supplies - after.fleets[id].cargo.supplies, 5 / 30 + 2.5);
    assert.deepEqual(after.fleets[id].owner, before.fleets[id].owner);
  }
  assert.equal(after.revision, 1); assert.equal(s.eventsSince('world', 0).length, 1);
});

test('failure in a later fleet rolls back earlier simulated fleets, clock and outbox', t => {
  const w = structuredClone(fixture()); w.members.c.loadout.hullMods = ['not-ported']; const s = store(t, rules, w);
  const before = s.read('world'); assert.throws(() => step(s), { code: 'UNSUPPORTED_LOGISTICS' });
  assert.deepEqual(s.read('world'), before); assert.deepEqual(s.eventsSince('world', 0), []);
});

test('clock commands are system only, idempotent, stale-tick fenced and cannot use the retired per-fleet bypass', t => {
  const s = store(t), c = command(s, 'world.advance', { fromTick: 0, ticks: 60 });
  assert.throws(() => s.execute({ kind: 'player', id: 'a' }, c), { code: 'FORBIDDEN' });
  const receipt = s.execute(system, c); assert.deepEqual(s.execute(system, c), receipt);
  assert.throws(() => s.execute(system, { ...c, requestId: 'new-id' }), { code: 'TIME_CONFLICT' });
  assert.throws(() => s.execute(system, command(s, 'logistics.advance-stationary', { fleetId: 'a', fromTick: 0, ticks: 60 })), { code: 'UNSUPPORTED_COMMAND' });
});

test('battle participants stay frozen but the other fleet and world clock advance; no catch-up on release', t => {
  const s = store(t), id = prepare(s), before = s.read('world'); lifecycle(s, id, 'encounter.start'); step(s, 60);
  const w = s.read('world');
  assert.deepEqual(w.fleets.a, before.fleets.a); assert.deepEqual(w.members.a, before.members.a);
  assert.ok(w.members.c.condition.hullFraction > before.members.c.condition.hullFraction); assert.equal(w.clock.tick, 60);
  // A separate never-started preparation may be released without granting missed repair or charging duplicate time.
  const other = store(t), preparation = prepare(other); step(other, 60); lifecycle(other, preparation, 'encounter.cancel-preparation'); step(other, 60);
  near(other.read('world').members.a.condition.hullFraction, 0.51);
});

test('preparation timeout takes effect at the exact tick inside a batch and releases only never-started fleets', t => {
  const selected = shortDeadlineRules(), s = store(t, selected), id = prepare(s); step(s, 120);
  const w = s.read('world'); assert.equal(w.encounters[id].status, 'cancelled'); assert.equal(w.fleets.a.encounterId, null);
  near(w.members.a.condition.hullFraction, 0.51); near(w.members.c.condition.hullFraction, 0.52);
  assert.ok(s.eventsSince('world', 0).flatMap(b => b.events).some(e => e.type === 'encounter.preparation-timed-out'));
});

test('a timed-out retry after combat requires recovery and never silently releases combat assets', t => {
  const selected = shortDeadlineRules(), s = store(t, selected), id = prepare(s);
  lifecycle(s, id, 'encounter.start'); lifecycle(s, id, 'encounter.interrupt', { reason: 'lost' }); lifecycle(s, id, 'encounter.retry', { hostPlayerId: 'b' });
  step(s, 120); const w = s.read('world'); assert.equal(w.encounters[id].status, 'recovery-required');
  assert.equal(w.fleets.a.encounterId, id); near(w.members.a.condition.hullFraction, 0.5); near(w.members.c.condition.hullFraction, 0.52);
});

test('batch partitioning across timeout boundaries produces identical clock, resources and member condition', t => {
  const selected = shortDeadlineRules(), a = store(t, selected), b = store(t, selected); prepare(a); prepare(b);
  step(a, 120); for (const ticks of [17, 20, 41, 42]) step(b, ticks);
  const left = a.read('world'), right = b.read('world'); assert.deepEqual(left.clock, right.clock);
  for (const id of ['a', 'b', 'c']) {
    assert.deepEqual(left.fleets[id].cargo, right.fleets[id].cargo); assert.deepEqual(left.members[id].condition, right.members[id].condition);
  }
});

test('invitations expire on global time, including fractional seconds, without touching fleet ownership', t => {
  const w = structuredClone(fixture()); w.invitations.i = { id: 'i', version: 0, fromFleetId: 'a', toFleetId: 'b', createdBy: 'a', partyId: null, expiresAt: 1.5 };
  const s = store(t, rules, w); step(s, 89); assert.ok(s.read('world').invitations.i); step(s, 1);
  assert.equal(s.read('world').invitations.i, undefined); assert.equal(s.read('world').clock.gameSeconds, 1.5);
  assert.deepEqual(s.read('world').fleets.a.owner, w.fleets.a.owner);
});

test('kernel rejects clock edits by another service and inconsistent clock fields', t => {
  const provider = { id: 'test.bad-clock', service: 'research', version: '1', apiVersion: 1, capabilities: [],
    commands: { 'clock.bad': ctx => ({ changes: [], events: [], clock: { expected: ctx.world.clock, value: { ...ctx.world.clock, tick: 60, gameSeconds: 1 } } }) } };
  const selected = new CampaignRuleRegistry().register(originalOrbitsProvider).register(provider).compile({ id: 'test-clock', version: '1', providers: { research: provider.id } });
  const s = store(t, selected); assert.throws(() => s.execute(system, command(s, 'clock.bad', {})), { code: 'FORBIDDEN' });
  const w = structuredClone(fixture()); w.clock.tick = 1; assert.throws(() => validateCampaignWorld(w), { code: 'INVALID_CLOCK' });
});

test('SQLite failure rolls back the world clock together with all resource changes', t => {
  const filename = temporary(t); let s, control;
  try {
    s = new CampaignRepository(filename, rules); s.create(fixture()); control = new DatabaseSync(filename);
    control.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT,'clock-rollback-test'); END;");
    const before = s.read('world'); assert.throws(() => step(s), /clock-rollback-test/); assert.deepEqual(s.read('world'), before);
    assert.deepEqual(s.eventsSince('world', 0), []);
  } finally { control?.close(); s?.close(); }
});

test('database-level epoch fences an older live authority, including its duplicate receipts', t => {
  const filename = temporary(t); let older, newer;
  try {
    older = new CampaignRepository(filename, rules); older.create(fixture());
    const c = command(older, 'world.advance', { fromTick: 0, ticks: 60 }), r = older.execute(system, c);
    newer = new CampaignRepository(filename, rules);
    assert.throws(() => older.execute(system, c), { code: 'AUTHORITY_REPLACED' });
    assert.throws(() => older.read('world'), { code: 'AUTHORITY_REPLACED' });
    assert.deepEqual(newer.execute(system, c), r); step(newer, 60); assert.equal(newer.read('world').clock.tick, 120);
  } finally { older?.close(); newer?.close(); }
});

test('database schema 1 is rejected unchanged rather than silently upgraded', t => {
  const filename = temporary(t), db = new DatabaseSync(filename); db.exec('CREATE TABLE keep_me(value TEXT); INSERT INTO keep_me VALUES(\'untouched\'); PRAGMA user_version=1;'); db.close();
  assert.throws(() => new CampaignRepository(filename, rules), { code: 'DATABASE_VERSION' });
  const check = new DatabaseSync(filename); try { assert.equal(check.prepare('SELECT value FROM keep_me').get().value, 'untouched'); assert.equal(check.prepare('PRAGMA user_version').get().user_version, 1); } finally { check.close(); }
});

test('scheduler uses monotonic online time only, and repeated start cannot reset running time', t => {
  const s = store(t); let now = 100000;
  const loop = new CampaignSimulationLoop(s, { now: () => now, intervalMs: 60000 }); t.after(() => loop.close());
  assert.equal(loop.status('world').status, 'stopped'); loop.start('world'); now += 200; loop.start('world'); loop.pulse();
  assert.equal(s.read('world').clock.tick, 12); loop.stop('world'); now += 1000000; loop.pulse(); assert.equal(s.read('world').clock.tick, 12);
  loop.start('world'); now += 200; loop.pulse(); assert.equal(s.read('world').clock.tick, 24);
});

test('large sleep and unsupported effects pause visibly instead of skipping time or partially charging fleets', t => {
  const s = store(t); let now = 0; const loop = new CampaignSimulationLoop(s, { now: () => now, intervalMs: 60000 }); t.after(() => loop.close());
  loop.start('world'); now = 20000; loop.pulse(); assert.equal(loop.status('world').error.code, 'SIMULATION_LAG'); assert.equal(s.read('world').clock.tick, 0);
  loop.start('world'); now += 100; loop.pulse(); assert.equal(s.read('world').clock.tick, 6);
  const bad = structuredClone(fixture()); bad.members.b.loadout.hullMods = ['unported']; const other = store(t, rules, bad);
  const failed = new CampaignSimulationLoop(other, { now: () => now, intervalMs: 60000 }); t.after(() => failed.close());
  failed.start('world'); now += 100; failed.pulse(); assert.equal(failed.status('world').error.code, 'UNSUPPORTED_LOGISTICS'); assert.equal(other.read('world').clock.tick, 0);
  now += 100; failed.pulse(); assert.equal(other.read('world').clock.tick, 0);
});

test('actual Worker runs an explicitly started simulation and opening its saved world does not resume it', async t => {
  const filename = temporary(t); let service = new CampaignService({ filename });
  try {
    await service.ready(); await service.create(fixture()); assert.equal((await service.simulationStatus('world')).status, 'stopped');
    await service.startSimulation('world');
    const deadline = Date.now() + 3000; let state;
    do { await delay(40); state = await service.simulationStatus('world'); } while (state.tick < 6 && state.status === 'running' && Date.now() < deadline);
    assert.equal(state.status, 'running'); assert.ok(state.tick >= 6, 'real interval never advanced');
    await service.stopSimulation('world'); const saved = await service.read('world'); await service.close();
    service = new CampaignService({ filename }); await service.ready(); await delay(120);
    assert.equal((await service.simulationStatus('world')).status, 'stopped'); assert.deepEqual((await service.read('world')).clock, saved.clock);
  } finally { await service.close(); }
});

test('disconnecting before the first start does not bypass preparation timeout by entering recovery-required', t => {
  const selected = shortDeadlineRules(), s = store(t, selected), id = prepare(s);
  lifecycle(s, id, 'encounter.interrupt', { reason: 'left-during-loading' }); step(s, 120);
  const w = s.read('world'); assert.equal(w.encounters[id].status, 'cancelled'); assert.equal(w.fleets.a.encounterId, null);
  near(w.members.a.condition.hullFraction, 0.51);
});

function replaceProviders(replacements) {
  const selected = [originalOrbitsProvider, originalTravelProvider, originalFleetStatsProvider, originalLogisticsProvider, encounterLifecycleProvider, cooperationProvider, cooperativeSimulationProvider]
    .map(p => replacements[p.service] ?? p);
  if (replacements.retail) selected.push(replacements.retail);
  const registry = new CampaignRuleRegistry(); selected.forEach(p => registry.register(p));
  return registry.compile({ id: 'test.simulation-overrides', version: '1', providers: Object.fromEntries(selected.map(p => [p.service, p.id])),
    settings: structuredClone(rules.lock.settings) });
}

test('world-dependent replacement stats see tick-start snapshots and precise invitation expiry regardless of batches or fleet order', t => {
  const customStats = { ...originalFleetStatsProvider, id: 'test.world-stats', methods: { resolve: (fleet, members, options) => {
    const w = options.world;
    assert.ok(Object.isFrozen(w) && Object.isFrozen(w.fleets.a.cargo) && Object.isFrozen(w.invitations));
    assert.deepEqual(fleet.cargo, w.fleets[fleet.id].cargo);
    const result = originalFleetStatsProvider.methods.resolve(fleet, members, options);
    const totalSupplies = ['a', 'b', 'c'].reduce((sum, id) => sum + w.fleets[id].cargo.supplies, 0);
    result.members.forEach(m => { m.suppliesPerMonth = totalSupplies + (w.invitations.i ? 30 : 60); });
    return result;
  } } };
  const selected = replaceProviders({ fleetStats: customStats }), w = structuredClone(fixture(selected));
  for (const member of Object.values(w.members)) member.logistics = { mothballed: false, suspendRepairs: true };
  w.invitations.i = { id: 'i', version: 0, fromFleetId: 'a', toFleetId: 'b', createdBy: 'a', partyId: null, expiresAt: 0.375 };
  const reversed = structuredClone(w); reversed.fleets = Object.fromEntries(Object.entries(reversed.fleets).reverse());
  const a = store(t, selected, w), b = store(t, selected, w), c = store(t, selected, reversed);
  step(a, 60); for (const ticks of [11, 12, 1, 7, 29]) step(b, ticks); step(c, 60);
  for (const id of ['a', 'b', 'c']) {
    assert.deepEqual(a.read('world').fleets[id].cargo, b.read('world').fleets[id].cargo);
    assert.deepEqual(a.read('world').fleets[id].cargo, c.read('world').fleets[id].cargo);
  }
  const expired = a.eventsSince('world', 0)[0].events.find(e => e.type === 'party.invitations-expired');
  assert.deepEqual(expired.data.expirations, [{ invitationId: 'i', tick: 23 }]);
});

test('replacement deadline services observe an immutable world whose clock matches the processed boundary', t => {
  const ticksSeen = [];
  const custom = { ...encounterLifecycleProvider, methods: { ...encounterLifecycleProvider.methods,
    expirePreparations: (w, tick) => {
      assert.equal(w.clock.tick, tick); assert.equal(w.clock.gameSeconds, tick / 60);
      assert.ok(Object.isFrozen(w) && Object.isFrozen(w.encounters) && Object.isFrozen(w.fleets.a));
      ticksSeen.push(tick); return encounterLifecycleProvider.methods.expirePreparations(w, tick);
    },
  } };
  const selected = replaceProviders({ encounters: custom }), s = store(t, selected); prepare(s); step(s, 60);
  assert.deepEqual(ticksSeen, [0, 60]);
});

test('incompatible deadline plans fail atomically instead of silently discarding extension writes', t => {
  const custom = { ...encounterLifecycleProvider, methods: { ...encounterLifecycleProvider.methods,
    expirePreparations: () => ({ events: [], changes: [{ collection: 'extensions', id: `${encounterLifecycleProvider.id}:unsupported`,
      expectedVersion: null, value: { id: `${encounterLifecycleProvider.id}:unsupported`, version: 0, schemaVersion: 1, data: {} } }] }),
  } };
  const selected = replaceProviders({ encounters: custom }), s = store(t, selected), before = s.read('world');
  assert.throws(() => step(s), { code: 'INVALID_PLAN' }); assert.deepEqual(s.read('world'), before);
  assert.deepEqual(s.eventsSince('world', 0), []);
});

test('an overhaul replaces the entire simulation and clock rate while retaining scheduler, atomic persistence and idempotency', t => {
  // Test-only counter mechanism; deliberately NOT a claim of original gameplay.
  const replacement = { id: 'test.alternative-time', service: 'simulation', version: '1', apiVersion: 1, capabilities: ['world-clock-writer'],
    commands: { 'world.advance': (ctx, payload) => {
      assert.equal(ctx.actor.kind, 'system'); assert.equal(payload.fromTick, ctx.world.clock.tick);
      const id = 'test.alternative-time:counter', before = ctx.world.extensions[id];
      const tick = ctx.world.clock.tick + payload.ticks;
      return { clock: { expected: ctx.world.clock, value: { tick, ticksPerSecond: 10, gameSeconds: tick / 10 } },
        changes: [{ collection: 'extensions', id, expectedVersion: before?.version ?? null,
          value: { id, version: before ? before.version + 1 : 0, schemaVersion: 1, data: { elapsed: (before?.data.elapsed ?? 0) + payload.ticks } } }],
        events: [{ type: 'test.time-advanced', data: { tick } }], result: { tick } };
    } } };
  const selected = new CampaignRuleRegistry().register(originalOrbitsProvider).register(replacement).compile({ id: 'test.alternative-time', version: '1',
    providers: { simulation: replacement.id }, settings: { simulation: { ticksPerSecond: 10 } } });
  const s = store(t, selected), initial = s.read('world'); let now = 0;
  const loop = new CampaignSimulationLoop(s, { now: () => now, intervalMs: 60000 });
  try {
    loop.start('world'); now = 100; loop.pulse(); assert.equal(loop.status('world').tick, 1);
    now = 400; loop.stop('world'); const w = s.read('world');
    assert.deepEqual(w.clock, { tick: 4, ticksPerSecond: 10, gameSeconds: 0.4 });
    assert.equal(w.extensions['test.alternative-time:counter'].data.elapsed, 4); assert.deepEqual(w.fleets, initial.fleets);
    const c = command(s, 'world.advance', { fromTick: 4, ticks: 1 }, [], 'retry-overhaul');
    const receipt = s.execute(system, c); assert.deepEqual(s.execute(system, c), receipt);
    assert.equal(s.read('world').extensions['test.alternative-time:counter'].data.elapsed, 5);
  } finally { loop.close(); }
});


test('replaceable retail sees matching tick-start state, writes only its owner-granted extension, and preserves fleet views', t => {
  const id='test.retail:counter';
  const retail={id:'test.retail',service:'retail',version:'1',apiVersion:1,capabilities:['fixed-frame-retail-counters'],
    extensionWriteGrants:[{service:'simulation',capabilities:['world-clock-writer'],commands:['world.advance']}],
    methods:{validateWorld:w=>{assert.equal(w.extensions[id].data.tick,w.clock.tick);},advanceFrame:w=>{
      assert.ok(Object.isFrozen(w.extensions[id].data));assert.equal(w.extensions[id].data.tick,w.clock.tick);
      const row=w.extensions[id];return {changes:[{collection:'extensions',id,expectedVersion:row.version,value:{...row,version:row.version+1,data:{tick:w.clock.tick+1}}}],events:[]};
    }}};
  const fleetStats={...originalFleetStatsProvider,id:'test.retail-aware-stats',methods:{resolve:(fleet,members,options)=>{
    assert.equal(options.world.extensions[id].data.tick,options.world.clock.tick);
    return originalFleetStatsProvider.methods.resolve(fleet,members,options);
  }}};
  const selected=replaceProviders({retail,fleetStats}),w=structuredClone(fixture(selected));w.extensions[id]={id,version:0,schemaVersion:1,data:{tick:0}};
  const s=store(t,selected,w);step(s,10);assert.equal(s.read('world').extensions[id].data.tick,10);assert.equal(s.read('world').extensions[id].version,1);
});
