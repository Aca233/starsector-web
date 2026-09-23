import { originalOrbitsProvider } from '../src/campaign/rules/OriginalOrbits.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, existsSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createReferenceRuleset } from '../src/campaign/ReferenceRuleset.mjs';
import { createCampaignWorld, validateCampaignWorld } from '../src/campaign/core/WorldState.mjs';
import { originalFleetRadius, quoteOriginalJumpFuel, nearestOriginalGravityWell } from '../src/campaign/rules/OriginalTransitions.mjs';
import { advanceOriginalMovement } from '../src/campaign/rules/OriginalMovement.mjs';
import { CampaignRepository } from '../server/campaign/Repository.mjs';
import { CampaignService } from '../server/campaign/CampaignService.mjs';
const rules = createReferenceRuleset(), system = { kind: 'system', id: 'world-service' };
const player = id => ({ kind: 'player', id });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, a + ' != ' + b);
function fixture() {
  const w = structuredClone(createCampaignWorld({ id: 'jumps', rules: rules.lock, contentFingerprint: 'jump-fixture' }));
  for (const [id, space] of [['port', 'normal'], ['hyper', 'hyperspace'], ['abyss', 'normal']]) {
    w.locations[id] = { id, version: 0, name: id, navigation: { space, terrain: [], jumpTopology: 'complete' }, tags: id === 'abyss' ? ['system_abyssal'] : [] };
  }
  w.spaceEntities.exit = { id: 'exit', version: 0, name: 'System exit', locationId: 'port', position: [0, 0], radius: 40, tags: [],
    jump: { anchor: null, destinations: [{ targetId: 'well', minDistance: 100, maxDistance: 200 }] } };
  w.spaceEntities.well = { id: 'well', version: 0, name: 'Star gravity well', locationId: 'hyper', position: [1000, 1000], radius: 30, tags: [],
    jump: { anchor: 'star', destinations: [{ targetId: 'exit', minDistance: 50, maxDistance: 80 }] } };
  for (const [i, id] of ['a', 'b'].entries()) {
    w.players[id] = { id, version: 0, name: id, factionId: null };
    w.fleets[id] = { id, version: 0, owner: player(id), control: player(id), locationId: 'port', position: [i * 100, 0],
      memberIds: [id], partyId: null, encounterId: null, cargo: { supplies: 20, fuel: 10, crew: 15 } };
    w.members[id] = { id, version: 0, fleetId: id, owner: player(id), loadout: { hullId: 'wolf' },
      condition: { status: 'ready', hullFraction: 1, combatReadiness: 0.7, armor: null, ammunition: {} } };
  }
  return w;
}
function store(t, world = fixture()) {
  const s = new CampaignRepository(':memory:', rules); t.after(() => s.close()); s.create(world); return s;
}
function command(s, type, payload, refs = []) {
  const w = s.read('jumps'); return { worldId: w.id, epoch: s.epoch, requestId: type + ':' + w.revision, type, payload,
    expected: refs.map(([collection, id]) => ({ collection, id, version: w[collection][id].version })) };
}
function jumpCommand(s, id = 'a', sourceId = 'exit') {
  const node = s.read('jumps').spaceEntities[sourceId];
  return command(s, 'fleet.jump', { fleetId: id, sourceId, destinationIndex: 0 }, [['fleets', id], ['spaceEntities', sourceId], ['spaceEntities', node.jump.destinations[0].targetId]]);
}
function jump(s, id = 'a', sourceId = 'exit', actor = player(id)) { return s.execute(actor, jumpCommand(s, id, sourceId)); }
function step(s, ticks = 1) { return s.execute(system, command(s, 'world.advance', { fromTick: s.read('jumps').clock.tick, ticks })); }
function course(s, id = 'a', stop = false) {
  return s.execute(player(id), command(s, stop ? 'fleet.stop' : 'fleet.set-course', { fleetId: id, locationId: s.read('jumps').fleets[id].locationId,
    ...(stop ? {} : { destination: [900, 0] }) }, [['fleets', id]]));
}
function prepare(s) {
  return s.execute(system, command(s, 'encounter.prepare', { sides: [{ id: 'one', fleetIds: ['a'] }, { id: 'two', fleetIds: ['b'] }], hostPlayerId: 'a', seed: 1 },
    [['fleets', 'a'], ['fleets', 'b'], ['members', 'a'], ['members', 'b']]));
}
function physical(s) {
  const w = structuredClone(s.read('jumps')); w.revision = 0;
  for (const key of ['fleets', 'members']) for (const row of Object.values(w[key])) row.version = 0;
  return w;
}
function fileStore(t) {
  const dir = mkdtempSync(join(tmpdir(), 'starsector-jump-')), filename = join(dir, 'world.sqlite');
  t.after(() => { for (const suffix of ['', '-wal', '-shm']) if (existsSync(filename + suffix)) unlinkSync(filename + suffix); rmdirSync(dir); });
  return filename;
}

test('source jump fee rounds effective fuel/ly with positive minimum; hyperspace entry is free', t => {
  const w = fixture(), fleet = w.fleets.a;
  const effective = rules.services.fleetStats.resolve(fleet, [w.members.a], { world: w });
  assert.equal(quoteOriginalJumpFuel(effective, false), 1); assert.equal(quoteOriginalJumpFuel(effective, true), 0);
  const tiny = structuredClone(effective); tiny.members[0].fuelPerLightYear = 0.1;
  assert.equal(quoteOriginalJumpFuel(tiny, false), 1);
  tiny.members[0].fuelPerLightYear = 2.5; assert.equal(quoteOriginalJumpFuel(tiny, false), 3);
  const s = store(t), c = jumpCommand(s); const r = s.execute(player('a'), c);
  assert.equal(r.result.paidFuel, 1); assert.equal(s.read('jumps').fleets.a.cargo.fuel, 9);
  assert.equal(s.read('jumps').fleets.a.navigation.transition.phase, 'start');
  assert.deepEqual(s.execute(player('a'), c), r); assert.equal(s.read('jumps').fleets.a.cargo.fuel, 9);
  w.fleets.a.locationId = 'hyper'; w.fleets.a.position = [1000, 1000]; w.fleets.a.cargo.fuel = 0;
  const entry = store(t, w); assert.equal(jump(entry, 'a', 'well').result.paidFuel, 0); step(entry, 200);
  assert.equal(entry.read('jumps').fleets.a.locationId, 'port');
});

test('jump intent derives authority costs and rejects actor, endpoint versions, location and fuel conflicts atomically', t => {
  const s = store(t), before = s.read('jumps');
  const c = jumpCommand(s);
  assert.throws(() => s.execute(player('b'), c), { code: 'FORBIDDEN' });
  assert.throws(() => s.execute(system, c), { code: 'FORBIDDEN' });
  for (const id of ['exit', 'well']) assert.throws(() => s.execute(player('a'), { ...c, expected: c.expected.filter(e => e.id !== id) }), { code: 'VERSION_REQUIRED' });
  assert.throws(() => s.execute(player('a'), { ...c, expected: c.expected.map(e => ({ ...e, version: 99 })) }), { code: 'VERSION_CONFLICT' });
  assert.throws(() => s.execute(player('a'), { ...c, payload: { ...c.payload, paidFuel: 0 } }), { code: 'INVALID_COMMAND' });
  assert.throws(() => s.execute(player('a'), { ...c, payload: { ...c.payload, destinationIndex: 20 } }), { code: 'NOT_FOUND' });
  assert.throws(() => jump(s, 'a', 'well'), { code: 'LOCATION_CONFLICT' }); assert.deepEqual(s.read('jumps'), before);
  const w = fixture(); w.fleets.a.cargo.fuel = 0.9; const poor = store(t, w);
  assert.throws(() => jump(poor), { code: 'INSUFFICIENT_FUEL' }); assert.equal(poor.read('jumps').fleets.a.cargo.fuel, 0.9);
});

test('one-ship full-precision transition has staged jitter/fades and one second of finish protection, not an instant teleport', t => {
  const s = store(t); jump(s); step(s);
  let f = s.read('jumps').fleets.a; assert.equal(f.navigation.transition.phase, 'warp-out'); assert.equal(f.navigation.transition.warpedCount, 1);
  assert.equal(f.navigation.transition.jitterUntilTick, 61); assert.equal(f.locationId, 'port');
  step(s, 59); assert.equal(s.read('jumps').fleets.a.navigation.transition.phase, 'warp-out');
  step(s); assert.equal(s.read('jumps').fleets.a.navigation.transition.phase, 'fade-out');
  step(s, 14); f = s.read('jumps').fleets.a; assert.equal(f.locationId, 'hyper'); assert.equal(f.navigation.transition.phase, 'fade-in');
  const distance = Math.hypot(f.position[0] - 1000, f.position[1] - 1000); assert.ok(distance >= 100 && distance <= 200);
  step(s, 14); assert.equal(s.read('jumps').fleets.a.navigation.transition.phase, 'warp-in');
  step(s, 60); f = s.read('jumps').fleets.a; assert.equal(f.navigation.transition, undefined); assert.equal(f.navigation.noEngageUntilTick, 209);
  assert.deepEqual(s.read('jumps').fleets.b.position, [100, 0]); assert.equal(s.read('jumps').fleets.b.locationId, 'port');
  const events = s.eventsSince('jumps', 0).flatMap(b => b.events);
  assert.equal(events.filter(e => e.type === 'fleet.jump-location-changed').length, 1);
  assert.equal(events.filter(e => e.type === 'fleet.jump-completed').length, 1);
});

test('source selection radius and approach boost use hull weights, half point radius and 0.1 GAME DAY', t => {
  const w = fixture(); near(originalFleetRadius([w.members.a]), 23.8);
  near(originalFleetRadius(Array.from({ length: 100 }, () => w.members.a)), 100);
  w.fleets.a.position = [44, 0]; const s = store(t, w); jump(s); step(s);
  assert.equal(s.read('jumps').fleets.a.navigation.transition.phase, 'approach');
  assert.equal(s.read('jumps').fleets.a.navigation.accelerationUntilTick, 61); step(s);
  near(s.read('jumps').fleets.a.navigation.velocity[0], -2000 / 60);
  const at = (tick) => { const state = structuredClone(s.read('jumps')); state.clock.tick = tick;
    return rules.services.travel.describe(state, state.fleets.a, [state.members.a], rules.services.fleetStats.resolve).stats.acceleration; };
  assert.equal(at(60), 2000); assert.equal(at(61), 200);
  assert.equal(s.read('jumps').fleets.a.navigation.transition.phase, 'warp-out');
});

test('approach timeout aborts without refund and retains 30-second no-engagement deadline', t => {
  const w = fixture(); w.spaceEntities.exit.position = [1000000, 0]; const s = store(t, w); jump(s); step(s, 121);
  const f = s.read('jumps').fleets.a; assert.equal(f.navigation.transition, undefined); assert.equal(f.locationId, 'port');
  assert.equal(f.cargo.fuel, 9); assert.equal(f.navigation.noEngageUntilTick, 1921); assert.deepEqual(f.navigation.destination, f.position);
  assert.throws(() => prepare(s), { code: 'NO_ENGAGE' });
});

test('location switch keeps pre-switch velocity and charges that tick in the OLD space', t => {
  const w = fixture(); w.spaceEntities.exit.radius = 1000000;
  w.fleets.a.navigation = { velocity: [10000, 0], destination: [1000000, 0] };
  const s = store(t, w); jump(s); step(s, 74);
  const before = s.read('jumps'), f = before.fleets.a;
  assert.equal(f.navigation.transition.phase, 'fade-out');
  const desc = rules.services.travel.describe(before, f, [before.members.a], rules.services.fleetStats.resolve);
  const expected = advanceOriginalMovement({ position: f.position, velocity: f.navigation.velocity, destination: f.navigation.destination, ...desc.stats, seconds: 1 / 60 });
  step(s); const after = s.read('jumps').fleets.a;
  assert.equal(after.locationId, 'hyper'); assert.deepEqual(after.navigation.velocity, expected.velocity); assert.ok(after.navigation.velocity[0] > 0);
  assert.equal(after.cargo.fuel, f.cargo.fuel); step(s); assert.ok(s.read('jumps').fleets.a.cargo.fuel < after.cargo.fuel);
});

test('saved RNG, landing and phase progress are independent of batch partition and duplicate requests', t => {
  const a = store(t), b = store(t); jump(a); jump(b);
  step(a, 200); for (const n of [1, 2, 11, 47, 14, 31, 94]) { const c = command(b, 'world.advance', { fromTick: b.read('jumps').clock.tick, ticks: n });
    const receipt = b.execute(system, c); assert.deepEqual(b.execute(system, c), receipt); }
  assert.deepEqual(physical(a), physical(b)); assert.ok(a.read('jumps').fleets.a.navigation.rngState > 0);
});

test('two jumping fleets have independent RNG streams; a later unsupported fleet rolls the WHOLE tick back', t => {
  const w = fixture(); w.fleets.b.position = [0, 0]; const a = store(t, w), b = store(t, w);
  jump(a); jump(b); jump(b, 'b'); step(a, 200); step(b, 200);
  const fleet = s => { const f = structuredClone(s.read('jumps').fleets.a); delete f.version; return f; };
  assert.deepEqual(fleet(a), fleet(b)); assert.equal(b.read('jumps').fleets.b.locationId, 'hyper');
  assert.notEqual(b.read('jumps').fleets.a.navigation.rngState, b.read('jumps').fleets.b.navigation.rngState);
  const badWorld = fixture(); badWorld.members.b.loadout.hullMods = ['unported']; const bad = store(t, badWorld); jump(bad);
  const prior = bad.read('jumps'); assert.throws(() => step(bad, 200), { code: 'UNSUPPORTED_LOGISTICS' }); assert.deepEqual(bad.read('jumps'), prior);
});

test('SQLite receipt failure rolls back jump fee, phase, random stream, landing and event outbox', t => {
  const filename = fileStore(t); let s, db;
  try {
    s = new CampaignRepository(filename, rules); s.create(fixture()); db = new DatabaseSync(filename);
    const fail = () => db.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT,'jump-rollback'); END;");
    fail(); const requested = jumpCommand(s), before = s.read('jumps');
    assert.throws(() => s.execute(player('a'), requested), /jump-rollback/); assert.deepEqual(s.read('jumps'), before); assert.deepEqual(s.eventsSince('jumps', 0), []);
    db.exec('DROP TRIGGER fail_receipt'); s.execute(player('a'), requested); step(s, 74);
    const prior = s.read('jumps'), events = s.eventsSince('jumps', 0), c = command(s, 'world.advance', { fromTick: 74, ticks: 1 });
    fail(); assert.throws(() => s.execute(system, c), /jump-rollback/); assert.deepEqual(s.read('jumps'), prior); assert.deepEqual(s.eventsSince('jumps', 0), events);
    db.exec('DROP TRIGGER fail_receipt'); const receipt = s.execute(system, c); assert.deepEqual(s.execute(system, c), receipt);
    const uninterrupted = store(t); jump(uninterrupted); step(uninterrupted, 75); assert.deepEqual(physical(s), physical(uninterrupted));
  } finally { db?.close(); s?.close(); }
});

test('file reopen during warp resumes persisted stage/RNG without charging again or using offline elapsed time', t => {
  const filename = fileStore(t); let s;
  try {
    s = new CampaignRepository(filename, rules); s.create(fixture()); jump(s); step(s, 40); const before = s.read('jumps');
    s.close(); s = new CampaignRepository(filename, rules); assert.deepEqual(s.read('jumps'), before); step(s, 160);
    const uninterrupted = store(t); jump(uninterrupted); step(uninterrupted, 200); assert.deepEqual(physical(s), physical(uninterrupted));
    assert.equal(s.eventsSince('jumps', 0).flatMap(b => b.events).filter(e => e.type === 'fleet.jump-requested').length, 1);
  } finally { s?.close(); }
});

test('no-fuel drift chooses nearest eligible non-abyssal star/gas-giant well and leaves unrelated fleets alone', t => {
  const w = fixture(); w.fleets.a.locationId = 'hyper'; w.fleets.a.position = [0, 0]; w.fleets.a.cargo.fuel = 0;
  w.spaceEntities.exit2 = { ...structuredClone(w.spaceEntities.exit), id: 'exit2', locationId: 'abyss' };
  w.spaceEntities.abyssWell = { ...structuredClone(w.spaceEntities.well), id: 'abyssWell', position: [0, 0], jump: { anchor: 'star', destinations: [{ targetId: 'exit2', minDistance: 0, maxDistance: 0 }] } };
  w.spaceEntities.invalidWell = { ...structuredClone(w.spaceEntities.well), id: 'invalidWell', position: [1, 0], jump: { anchor: null, destinations: w.spaceEntities.well.jump.destinations } };
  w.spaceEntities.emptyWell = { ...structuredClone(w.spaceEntities.well), id: 'emptyWell', position: [2, 0], jump: { anchor: 'star', destinations: [] } };
  w.spaceEntities.nearWell = { ...structuredClone(w.spaceEntities.well), id: 'nearWell', position: [50, 0], jump: { anchor: 'gas-giant', destinations: w.spaceEntities.well.jump.destinations } };
  assert.equal(nearestOriginalGravityWell(w, w.fleets.a).id, 'nearWell');
  const s = store(t, w); course(s); step(s);
  const f = s.read('jumps').fleets.a; assert.deepEqual(f.navigation.destination, [50, 0]); assert.equal(f.navigation.transition, undefined);
  step(s, 250); assert.equal(s.read('jumps').fleets.a.locationId, 'port'); assert.equal(s.read('jumps').fleets.a.cargo.fuel, 0);
  assert.deepEqual(s.read('jumps').fleets.b.position, [100, 0]);
});

test('new drift transition waits for the next engine-script tick; exhausted-on-this-tick fuel is detected after billing', t => {
  const w = fixture(); w.fleets.a.locationId = 'hyper'; w.fleets.a.position = [1000, 1000]; w.fleets.a.cargo.fuel = 0.000001;
  w.fleets.a.navigation = { velocity: [10, 0], destination: [1000, 1000] };
  const s = store(t, w); step(s); const f = s.read('jumps').fleets.a;
  assert.equal(f.cargo.fuel, 0); assert.equal(f.navigation.transition.phase, 'start'); assert.equal(f.navigation.transition.startedTick, 1);
  assert.equal(f.navigation.accelerationUntilTick, undefined); assert.equal(f.navigation.noEngageUntilTick, undefined);
  step(s); assert.equal(s.read('jumps').fleets.a.navigation.transition.phase, 'warp-out');
  assert.equal(s.read('jumps').fleets.a.navigation.accelerationUntilTick, 62);
});

test('known-empty topology preserves course, unknown topology rejects atomically; NPCs do not run no-fuel drift', t => {
  const empty = fixture(); empty.fleets.a.locationId = 'hyper'; empty.fleets.a.cargo.fuel = 0; empty.spaceEntities.well.jump.anchor = null;
  const s = store(t, empty); course(s); step(s, 10); assert.deepEqual(s.read('jumps').fleets.a.navigation.destination, [900, 0]); assert.ok(s.read('jumps').fleets.a.position[0] > 0);
  for (const coverage of [undefined, 'unavailable']) {
    const w = fixture(); w.fleets.a.locationId = 'hyper'; w.fleets.a.cargo.fuel = 0;
    if (coverage === undefined) delete w.locations.hyper.navigation.jumpTopology; else w.locations.hyper.navigation.jumpTopology = coverage;
    const unknown = store(t, w), before = unknown.read('jumps'); assert.throws(() => step(unknown), { code: 'UNSUPPORTED_FUEL_DRIFT' }); assert.deepEqual(unknown.read('jumps'), before);
    w.fleets.a.control = { kind: 'npc' }; const npc = store(t, w); step(npc); assert.equal(npc.read('jumps').fleets.a.navigation, undefined);
  }
});

test('equal-distance wells use stable identity order, not map insertion or host locale', () => {
  const w = fixture(); w.fleets.a.locationId = 'hyper'; w.fleets.a.position = [0, 0];
  w.spaceEntities.Awell = { ...structuredClone(w.spaceEntities.well), id: 'Awell', position: [-1000, -1000] };
  assert.equal(nearestOriginalGravityWell(w, w.fleets.a).id, 'Awell');
  w.spaceEntities = Object.fromEntries(Object.entries(w.spaceEntities).reverse()); assert.equal(nearestOriginalGravityWell(w, w.fleets.a).id, 'Awell');
});

test('NPC direct transitions are free and omit human fades without pretending NPC decision AI exists', t => {
  const w = fixture(); w.fleets.a.control = { kind: 'npc' }; w.fleets.a.cargo.fuel = 0;
  const s = store(t, w); assert.equal(jump(s, 'a', 'exit', system).result.paidFuel, 0); step(s, 61);
  assert.equal(s.read('jumps').fleets.a.locationId, 'hyper'); assert.equal(s.read('jumps').fleets.a.navigation.transition.phase, 'warp-in');
  step(s, 60); assert.equal(s.read('jumps').fleets.a.navigation.transition, undefined);
  const phases = s.eventsSince('jumps', 0).flatMap(b => b.events).filter(e => e.type === 'fleet.jump-phase').map(e => e.data.phase);
  assert.ok(!phases.includes('fade-in') && !phases.includes('fade-out'));
});

test('jump lock guards course, stop, repair, duplicate jump, encounters and party invitation roles', t => {
  const s = store(t); const invitationId = s.execute(player('a'), command(s, 'party.invite', { fromFleetId: 'a', toFleetId: 'b' }, [['fleets', 'a']])).result.invitationId;
  jump(s); assert.throws(() => jump(s), { code: 'IN_TRANSITION' });
  assert.throws(() => course(s), { code: 'IN_TRANSITION' }); assert.throws(() => course(s, 'a', true), { code: 'IN_TRANSITION' });
  assert.throws(() => s.execute(player('a'), command(s, 'logistics.set-repairs', { memberId: 'a', suspended: true }, [['members', 'a'], ['fleets', 'a']])), { code: 'IN_TRANSITION' });
  assert.throws(() => prepare(s), { code: 'IN_TRANSITION' });
  for (const [from, to] of [['a', 'b'], ['b', 'a']]) assert.throws(() => s.execute(player(from), command(s, 'party.invite', { fromFleetId: from, toFleetId: to }, [['fleets', from]])), { code: 'IN_TRANSITION' });
  assert.throws(() => s.execute(player('b'), command(s, 'party.accept', { invitationId }, [['invitations', invitationId], ['fleets', 'a'], ['fleets', 'b']])), { code: 'IN_TRANSITION' });
  assert.throws(() => s.execute(player('a'), command(s, 'party.decline', { invitationId }, [['invitations', invitationId], ['fleets', 'a']])), { code: 'IN_TRANSITION' });
  step(s, 149); assert.throws(() => prepare(s), { code: 'NO_ENGAGE' }); step(s, 59); assert.throws(() => prepare(s), { code: 'NO_ENGAGE' });
  step(s); prepare(s); // Internal lifecycle bridge, not a diplomacy/range rule.
});

test('joining does not force followers to jump; party changes cannot indirectly alter a jumping fleet', t => {
  const s = store(t); const invitationId = s.execute(player('a'), command(s, 'party.invite', { fromFleetId: 'a', toFleetId: 'b' }, [['fleets', 'a']])).result.invitationId;
  const partyId = s.execute(player('b'), command(s, 'party.accept', { invitationId }, [['invitations', invitationId], ['fleets', 'a'], ['fleets', 'b']])).result.partyId;
  jump(s); assert.throws(() => s.execute(player('b'), command(s, 'party.leave', { fleetId: 'b' }, [['fleets', 'b'], ['parties', partyId]])), { code: 'IN_TRANSITION' });
  step(s, 200); assert.equal(s.read('jumps').fleets.a.locationId, 'hyper'); assert.equal(s.read('jumps').fleets.b.locationId, 'port');
  assert.equal(s.read('jumps').fleets.b.partyId, partyId);
});

test('course commands preserve replay RNG, acceleration and no-engagement state after transition', t => {
  const s = store(t); jump(s); step(s, 149); const nav = s.read('jumps').fleets.a.navigation;
  course(s); course(s, 'a', true); const after = s.read('jumps').fleets.a.navigation;
  for (const key of ['rngState', 'accelerationUntilTick', 'noEngageUntilTick']) assert.equal(after[key], nav[key]);
});

test('unsupported wormholes, terrain and travel abilities fail explicitly before fee debit', t => {
  for (const [mutate, code] of [
    [w => w.spaceEntities.exit.tags.push('wormhole'), 'UNSUPPORTED_JUMP'],
    [w => w.locations.hyper.navigation.terrain.push('storm'), 'UNSUPPORTED_TRAVEL'],
    [w => { w.fleets.a.activeAbilities = ['sustained-burn']; }, 'UNSUPPORTED_TRAVEL'],
  ]) {
    const w = fixture(); mutate(w); const s = store(t, w), before = s.read('jumps');
    assert.throws(() => jump(s), { code }); assert.deepEqual(s.read('jumps'), before);
  }
});

test('world validation rejects malformed RNG, endpoint references, location tags and corrupted transition state', t => {
  const s = store(t); jump(s); step(s); const saved = s.read('jumps');
  for (const mutate of [
    w => { w.fleets.a.navigation.rngState = 0; }, w => { w.fleets.a.navigation.rngState = 4294967296; },
    w => { w.fleets.a.navigation.transition.targetId = 'missing'; }, w => { w.fleets.a.navigation.transition.phase = 'teleport'; },
    w => { w.fleets.a.navigation.transition.shipIds = []; }, w => { w.fleets.a.navigation.transition.phaseTick = 999; },
    w => { w.fleets.a.navigation.transition.startedTick = 2; }, w => { w.fleets.a.locationId = 'hyper'; },
    w => { w.spaceEntities.well.locationId = 'abyss'; }, w => { w.spaceEntities.exit.jump.destinations[0].minDistance = 1000; },
    w => { w.locations.abyss.tags = ['system_abyssal', 'system_abyssal']; },
  ]) { const w = structuredClone(saved); mutate(w); assert.throws(() => validateCampaignWorld(w)); }
});

test('actual campaign Worker executes and persists jumps with duplicate-receipt protection', async () => {
  const service = new CampaignService({ filename: ':memory:' });
  try {
    const ready = await service.ready(); await service.create(fixture());
    const c = { worldId: 'jumps', epoch: ready.epoch, requestId: 'worker-jump', type: 'fleet.jump', payload: { fleetId: 'a', sourceId: 'exit', destinationIndex: 0 },
      expected: [{ collection: 'fleets', id: 'a', version: 0 }, { collection: 'spaceEntities', id: 'exit', version: 0 }, { collection: 'spaceEntities', id: 'well', version: 0 }] };
    const receipt = await service.execute(player('a'), c); assert.deepEqual(await service.execute(player('a'), c), receipt);
    await service.execute(system, { worldId: 'jumps', epoch: ready.epoch, requestId: 'worker-step', type: 'world.advance', payload: { fromTick: 0, ticks: 200 }, expected: [] });
    const w = await service.read('jumps'); assert.equal(w.fleets.a.locationId, 'hyper'); assert.equal(w.fleets.a.navigation.transition, undefined); assert.ok(w.fleets.a.navigation.rngState > 0);
    assert.deepEqual(w.fleets.b.position, [100, 0]);
  } finally { await service.close(); }
});

test('multiple ships warp in persistent ordered steps; partitioning preserves phase events and all RNG draws', t => {
  const w = fixture();
  for (const id of ['a2', 'a3', 'a4']) { w.members[id] = { ...structuredClone(w.members.a), id }; w.fleets.a.memberIds.push(id); }
  w.fleets.a.cargo.crew = 60;
  const a = store(t, w), b = store(t, w); jump(a); jump(b);
  step(b); let state = b.read('jumps').fleets.a.navigation.transition;
  assert.equal(state.warpedCount, 1); near(state.warpRate, 1.1); assert.ok(state.nextInterval >= 0.05 && state.nextInterval <= 0.2);
  step(b, 20); state = b.read('jumps').fleets.a.navigation.transition; assert.ok(state.warpedCount > 1 && state.warpedCount <= 4);
  step(b, 29); step(b, 47); step(b, 203); step(a, 300); assert.deepEqual(physical(a), physical(b));
  const phases = s => s.eventsSince('jumps', 0).flatMap(b => b.events).filter(e => e.type !== 'world.advanced');
  assert.deepEqual(phases(a), phases(b)); assert.equal(a.read('jumps').fleets.a.navigation.transition, undefined);
});

test('live destination position is read at the switch, but its containing location is pinned', t => {
  const s = store(t); jump(s); step(s, 74);
  const saved = structuredClone(s.read('jumps')); saved.spaceEntities.well.position = [9000, -2000]; saved.spaceEntities.well.version++;
  const frame = validateCampaignWorld(saved);
  const description = rules.services.travel.describe(frame, frame.fleets.a, [frame.members.a], rules.services.fleetStats.resolve);
  const f = rules.services.travel.advance(frame.fleets.a, description, 1 / 60).fleet;
  const radius = Math.hypot(f.position[0] - 9000, f.position[1] + 2000); assert.ok(radius >= 100 && radius <= 200);
  saved.spaceEntities.well.locationId = 'abyss'; assert.throws(() => validateCampaignWorld(saved), { code: 'INVALID_WORLD' });
});

test('a wholesale travel/jump overhaul replaces mechanics and extension state without modifying authority or vanilla provider', async t => {
  const { CampaignRuleRegistry } = await import('../src/campaign/core/RuleRegistry.mjs');
  const { originalFleetStatsProvider } = await import('../src/campaign/rules/OriginalFleetStats.mjs');
  const { originalLogisticsProvider } = await import('../src/campaign/rules/OriginalLogistics.mjs');
  const { encounterLifecycleProvider } = await import('../src/campaign/rules/EncounterLifecycle.mjs');
  const { cooperativeSimulationProvider } = await import('../src/campaign/rules/CooperativeSimulation.mjs');
  // Deliberately not spread from or delegated to originalTravelProvider.
  const travel = { id: 'test.instant-jump', version: '1', service: 'travel', apiVersion: 1,
    capabilities: ['authoritative-motion', 'post-movement-events'], methods: {
      describe: () => ({ motion: { inHyperspace: false, speed: 0, hyperFuelMultiplier: 1, normalFuelMultiplier: 0, hiddenFuelMultiplier: 1 } }),
      advance: fleet => ({ fleet, events: [] }),
    }, commands: { 'fleet.jump': ctx => {
      const fleet = ctx.requireVersion('fleets', 'a');
      assert.equal(ctx.actor.id, 'a');
      return { changes: [
        { collection: 'fleets', id: 'a', expectedVersion: fleet.version, value: { ...fleet, version: fleet.version + 1, locationId: 'hyper', position: [700, 700], cargo: { ...fleet.cargo, fuel: fleet.cargo.fuel - 3 } } },
        { collection: 'extensions', id: 'test.instant-jump:charge', expectedVersion: null, value: { id: 'test.instant-jump:charge', version: 0, schemaVersion: 1, data: { usedCharges: 1 } } },
      ], events: [{ type: 'overhaul.teleported', data: { fleetId: fleet.id } }], result: { overhaul: true } };
    } } };
  const providers = [originalOrbitsProvider, travel, originalFleetStatsProvider, originalLogisticsProvider, encounterLifecycleProvider, cooperativeSimulationProvider];
  const registry = new CampaignRuleRegistry(); providers.forEach(p => registry.register(p));
  const custom = registry.compile({ id: 'test.overhaul', version: '1', providers: Object.fromEntries(providers.map(p => [p.service, p.id])), settings: rules.lock.settings });
  const world = fixture(); world.rules = custom.lock;
  const s = new CampaignRepository(':memory:', custom); t.after(() => s.close()); s.create(world);
  const c = command(s, 'fleet.jump', {}, [['fleets', 'a']]); const receipt = s.execute(player('a'), c); assert.equal(receipt.result.overhaul, true);
  assert.deepEqual(s.execute(player('a'), c), receipt); step(s, 100);
  const after = s.read('jumps'); assert.equal(after.fleets.a.cargo.fuel, 7); assert.equal(after.fleets.a.locationId, 'hyper'); assert.deepEqual(after.fleets.a.position, [700, 700]);
  assert.equal(after.fleets.a.navigation, undefined); assert.equal(after.extensions['test.instant-jump:charge'].data.usedCharges, 1);
  assert.equal(rules.acceptsLock(custom.lock), false);
});

test('ambiguous well topology never randomly bypasses abyss exclusion or guesses a destination system', t => {
  const w = fixture(); w.fleets.a.locationId = 'hyper'; w.fleets.a.cargo.fuel = 0;
  w.spaceEntities.abyssExit = { ...structuredClone(w.spaceEntities.exit), id: 'abyssExit', locationId: 'abyss' };
  w.spaceEntities.well.jump.destinations.push({ targetId: 'abyssExit', minDistance: 0, maxDistance: 0 });
  assert.equal(nearestOriginalGravityWell(w, w.fleets.a), null);
  w.locations.abyss.tags = []; const s = store(t, w), before = s.read('jumps');
  assert.throws(() => step(s), { code: 'UNSUPPORTED_JUMP' }); assert.deepEqual(s.read('jumps'), before);
});
