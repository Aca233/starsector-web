import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createReferenceRuleset } from '../src/campaign/ReferenceRuleset.mjs';
import { createCampaignWorld, validateCampaignWorld } from '../src/campaign/core/WorldState.mjs';
import { originalLogisticsProvider } from '../src/campaign/rules/OriginalLogistics.mjs';
import { CampaignRepository } from '../server/campaign/Repository.mjs';
import { CampaignService } from '../server/campaign/CampaignService.mjs';

const rules = createReferenceRuleset();
const player = id => ({ kind: 'player', id });
const bulkType = 'logistics.set-fleet-repairs';
function fixture(count = 3) {
  const w = structuredClone(createCampaignWorld({ id: 'bulk-repairs', rules: rules.lock, contentFingerprint: 'bulk-repairs-fixture' }));
  for (const id of ['a', 'b', 'c']) w.players[id] = { id, version: 0, name: id, factionId: null };
  w.factions.team = { id: 'team', version: 0, name: 'Team', playerRoles: { a: 'leader', b: 'manager', c: 'member' } };
  w.locations.port = { id: 'port', version: 0, name: 'Port', navigation: { space: 'normal', terrain: [], jumpTopology: 'complete' } };
  for (const [id, owner, size] of [['fleet', 'a', count], ['foreign', 'b', 1]]) {
    const fleet = { id, version: 0, owner: player(owner), control: player(owner), locationId: 'port', position: [0, 0],
      partyId: null, encounterId: null, memberIds: [], cargo: { supplies: 80, fuel: 100, crew: 15 * size } };
    w.fleets[id] = fleet;
    for (let i = 0; i < size; i++) {
      const memberId = `${id}-${i}`; fleet.memberIds.push(memberId);
      w.members[memberId] = { id: memberId, version: 0, fleetId: id, owner: player(owner), loadout: { hullId: 'wolf' },
        condition: { status: 'ready', hullFraction: 0.5, combatReadiness: 0.4, armor: { cols: 1, rows: 1, fractions: [0.25] }, ammunition: { missiles: 1 } },
        ...(i === 0 ? {} : { logistics: { mothballed: i === 1, suspendRepairs: false, retained: { repairCredit: 0.125 } } }) };
    }
  }
  return w;
}
function store(t, w = fixture(), filename = ':memory:') {
  const s = new CampaignRepository(filename, rules); t.after(() => s.close()); s.create(w); return s;
}
function command(s, suspended = true, requestId, fleetId = 'fleet') {
  const w = s.read('bulk-repairs'), fleet = w.fleets[fleetId];
  return { worldId: w.id, epoch: s.epoch, type: bulkType, requestId: requestId ?? `bulk-${w.revision}`, payload: { fleetId, suspended },
    expected: [{ collection: 'fleets', id: fleetId, version: fleet.version },
      ...fleet.memberIds.map(id => ({ collection: 'members', id, version: w.members[id].version }))] };
}
function rejectsWithoutWrites(s, actor, c, code) {
  const before = s.read('bulk-repairs'), outbox = s.eventsSince(before.id, 0);
  assert.throws(() => s.execute(actor, c), { code });
  assert.deepEqual(s.read(before.id), before);
  assert.deepEqual(s.eventsSince(before.id, 0), outbox);
}
function tempFile(t) {
  const directory = mkdtempSync(join(tmpdir(), 'starsector-bulk-repairs-')), filename = join(directory, 'world.sqlite');
  t.after(() => {
    // Delete only these exact test-created files, never recursively or from a user save path.
    for (const suffix of ['', '-wal', '-shm']) if (existsSync(filename + suffix)) unlinkSync(filename + suffix);
    rmdirSync(directory);
  });
  return filename;
}

test('native bulk suspension and resumption update non-mothballed ships once, preserving all other state', t => {
  assert.equal(originalLogisticsProvider.version, '0.8.0');
  const s = store(t);
  for (const suspended of [true, false]) {
    const before = s.read('bulk-repairs'), ids = before.fleets.fleet.memberIds.filter(id => !before.members[id].logistics?.mothballed);
    const receipt = s.execute(player('a'), command(s, suspended));
    assert.deepEqual(receipt.result, { fleetId: 'fleet', suspended, changedMemberIds: ids });
    const expected = structuredClone(before); expected.revision++;
    for (const id of ids) {
      expected.members[id].version++;
      expected.members[id].logistics = { mothballed: false, ...expected.members[id].logistics, suspendRepairs: suspended };
    }
    assert.deepEqual(s.read(before.id), expected); // Includes CR, hull, armor, ammo, cargo, clock and foreign fleet.
    assert.deepEqual(s.eventsSince(before.id, before.revision), [{ revision: receipt.revision,
      events: [{ type: 'logistics.fleet-repair-policy-changed', data: receipt.result }] }]);
  }
});

test('mixed policies update only differing ships but return one fleet receipt', t => {
  const w = fixture(); w.members['fleet-2'].logistics.suspendRepairs = true;
  const s = store(t, w), before = s.read(w.id);
  assert.deepEqual(s.execute(player('a'), command(s)).result.changedMemberIds, ['fleet-0']);
  assert.deepEqual(s.read(w.id).members['fleet-2'], before.members['fleet-2']);
});

test('one stale ship rolls back the entire bulk request; failed request can be retried', t => {
  const s = store(t), stale = command(s, true, 'retry-after-conflict');
  const single = { ...command(s), requestId: 'single-first', type: 'logistics.set-repairs', payload: { memberId: 'fleet-2', suspended: true } };
  s.execute(player('a'), single);
  rejectsWithoutWrites(s, player('a'), stale, 'VERSION_CONFLICT');
  assert.deepEqual(s.execute(player('a'), command(s, true, stale.requestId)).result.changedMemberIds, ['fleet-0']);
  // Single-member control remains functional after a bulk update.
  s.execute(player('a'), { ...command(s), type: 'logistics.set-repairs', payload: { memberId: 'fleet-0', suspended: false } });
  assert.deepEqual(s.read('bulk-repairs').fleets.fleet.memberIds.map(id => s.read('bulk-repairs').members[id].logistics.suspendRepairs), [false, false, true]);
});

test('fleet and ALL member expectations are mandatory, even for matching no-op policies', t => {
  const s = store(t);
  for (const suspended of [false, true]) {
    const c = command(s, suspended);
    for (let i = 0; i < c.expected.length; i++) {
      rejectsWithoutWrites(s, player('a'), { ...c, expected: c.expected.filter((_, index) => index !== i) }, 'VERSION_REQUIRED');
      const stale = structuredClone(c); stale.expected[i].version++;
      rejectsWithoutWrites(s, player('a'), stale, 'VERSION_CONFLICT');
    }
  }
});

test('player actor, explicit control and a boolean are required', t => {
  const s = store(t), c = command(s);
  rejectsWithoutWrites(s, { kind: 'system', id: 'scheduler' }, c, 'FORBIDDEN');
  rejectsWithoutWrites(s, player('b'), c, 'FORBIDDEN');
  rejectsWithoutWrites(s, player('a'), command(s, true, 'foreign-attempt', 'foreign'), 'FORBIDDEN');
  for (const suspended of [null, 'true', 1, {}])
    rejectsWithoutWrites(s, player('a'), { ...c, payload: { fleetId: 'fleet', suspended } }, 'INVALID_COMMAND');
  rejectsWithoutWrites(s, player('a'), { ...c, payload: { fleetId: 'fleet' } }, 'INVALID_COMMAND');
});

test('ownership cannot override delegated control or NPC control', t => {
  for (const control of [player('b'), { kind: 'npc' }]) {
    const w = fixture(); w.fleets.fleet.control = control;
    const s = store(t, w);
    rejectsWithoutWrites(s, player('a'), command(s), 'FORBIDDEN');
    if (control.kind === 'player') assert.equal(s.execute(player('b'), command(s)).result.changedMemberIds.length, 2);
  }
});

test('faction leaders and managers can command; ordinary members and outsiders cannot', t => {
  const w = fixture(); w.fleets.fleet.control = { kind: 'faction', id: 'team' };
  w.players.outsider = { id: 'outsider', version: 0, name: 'Outsider', factionId: null };
  const s = store(t, w);
  for (const id of ['c', 'outsider']) rejectsWithoutWrites(s, player(id), command(s), 'FORBIDDEN');
  assert.equal(s.execute(player('a'), command(s)).result.changedMemberIds.length, 2);
  assert.equal(s.execute(player('b'), command(s, false)).result.changedMemberIds.length, 2);
});

test('encounter lock rejects suspension and no-op resumption with no writes', t => {
  const w = fixture(); w.fleets.fleet.encounterId = 'battle';
  w.encounters.battle = { id: 'battle', version: 0, fleetIds: ['fleet'], battleAttempt: 1, status: 'forming' };
  const s = store(t, w);
  for (const suspended of [true, false]) rejectsWithoutWrites(s, player('a'), command(s, suspended), 'ASSET_LOCKED');
});

test('real jump transition locks bulk policy without changing ship state or paid fuel', t => {
  const w = fixture();
  w.locations.hyper = { id: 'hyper', version: 0, name: 'Hyperspace', navigation: { space: 'hyperspace', terrain: [], jumpTopology: 'complete' } };
  w.spaceEntities.exit = { id: 'exit', version: 0, name: 'Exit', locationId: 'port', position: [0, 0], radius: 40, tags: [],
    jump: { anchor: null, destinations: [{ targetId: 'well', minDistance: 100, maxDistance: 200 }] } };
  w.spaceEntities.well = { id: 'well', version: 0, name: 'Well', locationId: 'hyper', position: [1000, 1000], radius: 30, tags: [],
    jump: { anchor: 'star', destinations: [{ targetId: 'exit', minDistance: 50, maxDistance: 80 }] } };
  const s = store(t, w), c = command(s);
  s.execute(player('a'), { ...c, type: 'fleet.jump', requestId: 'jump', payload: { fleetId: 'fleet', sourceId: 'exit', destinationIndex: 0 },
    expected: [...c.expected, ...['exit', 'well'].map(id => ({ collection: 'spaceEntities', id, version: 0 }))] });
  assert.ok(s.read(w.id).fleets.fleet.navigation.transition);
  for (const suspended of [true, false]) rejectsWithoutWrites(s, player('a'), command(s, suspended), 'IN_TRANSITION');
});

test('no-op policies retain ship versions and absent logistics; exact replays retain receipts', t => {
  const s = store(t);
  for (const suspended of [false, true]) {
    if (suspended) s.execute(player('a'), command(s));
    const before = s.read('bulk-repairs'), c = command(s, suspended), receipt = s.execute(player('a'), c);
    assert.deepEqual(receipt.result.changedMemberIds, []);
    assert.deepEqual(s.read(before.id), { ...before, revision: before.revision + 1 });
    assert.deepEqual(s.eventsSince(before.id, before.revision), [{ revision: receipt.revision, events: [] }]);
    assert.deepEqual(s.execute(player('a'), c), receipt);
    assert.equal(s.read(before.id).revision, receipt.revision);
    rejectsWithoutWrites(s, player('a'), { ...c, payload: { ...c.payload, suspended: !suspended } }, 'REQUEST_REUSED');
  }
});

test('empty fleet is a versioned no-op, never a partial failure', t => {
  const s = store(t, fixture(0)), c = command(s), receipt = s.execute(player('a'), c);
  assert.deepEqual(receipt.result.changedMemberIds, []);
  assert.deepEqual(s.execute(player('a'), c), receipt);
});

test('maximum envelope-sized fleet commits in one revision and one event; larger envelope rolls back', t => {
  // The existing kernel permits 256 expectations (one fleet + 255 members), separate from its 512-write plan budget.
  const s = store(t, fixture(255));
  assert.equal(s.execute(player('a'), command(s)).result.changedMemberIds.length, 254);
  assert.equal(s.read('bulk-repairs').revision, 1);
  assert.equal(s.eventsSince('bulk-repairs', 0)[0].events.length, 1);
  const large = store(t, fixture(256));
  rejectsWithoutWrites(large, player('a'), command(large), 'COMMAND_LIMIT');
});

test('provider bounds the whole roster to 512 writes, including oversize no-op requests', () => {
  const handler = originalLogisticsProvider.commands[bulkType];
  for (const count of [512, 513]) {
    const world = validateCampaignWorld(fixture(count)), seen = [];
    const ctx = { world, actor: player('a'), requireVersion(collection, id) { seen.push(`${collection}:${id}`); return world[collection][id]; } };
    if (count === 512) {
      const plan = handler(ctx, { fleetId: 'fleet', suspended: true });
      assert.equal(plan.changes.length, 511); assert.equal(plan.events.length, 1);
      assert.deepEqual(seen, ['fleets:fleet', ...world.fleets.fleet.memberIds.map(id => `members:${id}`)]);
      assert.ok(plan.changes.every(change => change.expectedVersion === 0 && change.value.version === 1));
    } else {
      for (const suspended of [true, false]) assert.throws(() => handler(ctx, { fleetId: 'fleet', suspended }), { code: 'PLAN_LIMIT' });
    }
    assert.equal(world.revision, 0); assert.equal(world.members['fleet-0'].logistics, undefined);
  }
});

test('SQLite receipt-write failure rolls back every ship, revision and outbox row', t => {
  const filename = tempFile(t), s = store(t, fixture(), filename), db = new DatabaseSync(filename);
  t.after(() => { if (db.isOpen) db.close(); });
  db.exec("CREATE TRIGGER reject_bulk_receipt BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT,'injected receipt failure'); END;");
  const c = command(s), before = s.read('bulk-repairs');
  assert.throws(() => s.execute(player('a'), c), /injected receipt failure/);
  assert.deepEqual(s.read(before.id), before); assert.deepEqual(s.eventsSince(before.id, 0), []);
  db.exec('DROP TRIGGER reject_bulk_receipt');
  assert.equal(s.execute(player('a'), c).revision, 1);
  db.close(); s.close();
});

test('disk reopening persists all policies, no-op receipts and exactly-once replay', t => {
  const filename = tempFile(t), s = store(t, fixture(), filename);
  const c = command(s), receipt = s.execute(player('a'), c);
  const noop = command(s), noopReceipt = s.execute(player('a'), noop), before = s.read('bulk-repairs'), events = s.eventsSince(before.id, 0);
  s.close();
  const reopened = new CampaignRepository(filename, rules); t.after(() => reopened.close());
  assert.deepEqual(reopened.read(before.id), before);
  assert.deepEqual(reopened.execute(player('a'), c), receipt); // Old epoch and old ship versions are valid for an exact replay.
  assert.deepEqual(reopened.execute(player('a'), noop), noopReceipt);
  assert.deepEqual(reopened.eventsSince(before.id, 0), events);
  rejectsWithoutWrites(reopened, player('a'), { ...noop, requestId: 'new-old-epoch' }, 'STALE_AUTHORITY');
  reopened.close();
});

test('authority Worker handles the bulk command and its replay through the existing service', async () => {
  const service = new CampaignService({ filename: ':memory:' });
  try {
    const ready = await service.ready(), w = fixture(); await service.create(w);
    const c = command({ epoch: ready.epoch, read: () => w });
    const receipt = await service.execute(player('a'), c);
    assert.equal(receipt.result.changedMemberIds.length, 2);
    assert.deepEqual(await service.execute(player('a'), c), receipt);
    const saved = await service.read(w.id);
    for (const id of w.fleets.fleet.memberIds) assert.equal(saved.members[id].logistics.suspendRepairs, !w.members[id].logistics?.mothballed);
    assert.equal(saved.revision, 1);
  } finally { await service.close(); }
});

// Native coreui/refit/auto/new.java:365-381 explicitly continues past mothballed members.
test('both Q/W preserve opposite policies and versions on mothballed ships, including an all-mothballed fleet', t => {
  for (const onlyMothballed of [false, true]) {
    const w = fixture(4);
    for (const [i, id] of w.fleets.fleet.memberIds.entries())
      w.members[id].logistics = { mothballed: onlyMothballed || i < 2, suspendRepairs: i % 2 === 0 };
    const s = store(t, w);
    for (const suspended of [true, false, false, true]) {
      const before = s.read(w.id), c = command(s, suspended), receipt = s.execute(player('a'), c), after = s.read(w.id);
      const changed = before.fleets.fleet.memberIds.filter(id => !before.members[id].logistics.mothballed && before.members[id].logistics.suspendRepairs !== suspended);
      assert.deepEqual(receipt.result.changedMemberIds, changed);
      for (const id of before.fleets.fleet.memberIds) {
        if (!changed.includes(id)) assert.deepEqual(after.members[id], before.members[id]);
        else assert.equal(after.members[id].logistics.suspendRepairs, suspended);
      }
      assert.deepEqual(after.fleets, before.fleets);
      assert.deepEqual(s.execute(player('a'), c), receipt);
    }
  }
});

test('direct single-ship commands cannot bypass mothballed repair UI, even for a matching policy', t => {
  const s = store(t);
  for (const suspended of [false, true]) {
    const c = { ...command(s, suspended), type: 'logistics.set-repairs', payload: { memberId: 'fleet-1', suspended } };
    rejectsWithoutWrites(s, player('a'), c, 'MEMBER_MOTHBALLED');
  }
});

test('corrected native repair rules do not silently accept the previous provider lock', () => {
  const w = fixture();
  w.rules.version = '0.10.0';
  assert.equal(rules.acceptsLock(w.rules), false);
});


test('mothball roundtrip persists CR undo, resumes repairs, expires undo on time advance and preserves unrelated state', t => {
  const filename = tempFile(t), w = fixture(1); w.members['fleet-0'].logistics = { mothballed: false, suspendRepairs: true, retained: { marker: 1 } };
  let s = store(t, w, filename);
  const mothball = state => ({ ...command(s), type: 'logistics.set-mothballed', payload: { memberId: 'fleet-0', mothballed: state } });
  const before = s.read(w.id), c = mothball(true), receipt = s.execute(player('a'), c);
  const sealed = s.read(w.id); assert.equal(sealed.members['fleet-0'].condition.combatReadiness, 0);
  assert.deepEqual(sealed.members['fleet-0'].logistics, { mothballed: true, suspendRepairs: false, crPriorToMothballing: 0.4, retained: { marker: 1 } });
  assert.deepEqual(sealed.fleets, before.fleets); assert.deepEqual(sealed.members['foreign-0'], before.members['foreign-0']);
  assert.deepEqual(sealed.members['fleet-0'].condition, { ...before.members['fleet-0'].condition, combatReadiness: 0 });
  assert.deepEqual(s.execute(player('a'), c), receipt);
  s.close(); s = new CampaignRepository(filename, rules); t.after(() => s.close());
  assert.deepEqual(s.read(w.id), sealed); assert.deepEqual(s.execute(player('a'), c), receipt);
  s.execute(player('a'), mothball(false)); assert.equal(s.read(w.id).members['fleet-0'].condition.combatReadiness, 0.4);
  s.execute(player('a'), mothball(true));
  const saved = s.read(w.id), zero = rules.services.logistics.advance({ fleet: saved.fleets.fleet, members: [saved.members['fleet-0']], ticks: 0, aiMode: false, motion: { speed: 0, inHyperspace: false, hyperFuelMultiplier: 1, normalFuelMultiplier: 0, hiddenFuelMultiplier: 1 } });
  assert.equal(zero.members[0].logistics.crPriorToMothballing, 0.4);
  s.execute({kind:'system',id:'test-clock'},{worldId:w.id,epoch:s.epoch,requestId:'mothball-tick',type:'world.advance',payload:{fromTick:0,ticks:1},expected:[]});
  assert.equal(s.read(w.id).members['fleet-0'].logistics.crPriorToMothballing, 0);
  s.execute(player('a'), mothball(false)); assert.equal(s.read(w.id).members['fleet-0'].condition.combatReadiness, 0);
  s.execute({kind:'system',id:'test-clock'},{worldId:w.id,epoch:s.epoch,requestId:'recover-after-unseal',type:'world.advance',payload:{fromTick:1,ticks:60},expected:[]});
  assert.ok(s.read(w.id).members['fleet-0'].condition.combatReadiness > 0);
  const forged = mothball(true); rejectsWithoutWrites(s, player('b'), forged, 'FORBIDDEN');
  rejectsWithoutWrites(s, player('a'), { ...forged, payload: { ...forged.payload, crPriorToMothballing: 1 } }, 'INVALID_COMMAND');
  rejectsWithoutWrites(s, player('a'), { ...forged, expected: [] }, 'VERSION_REQUIRED');
  const invalid = structuredClone(s.read(w.id)); invalid.members['fleet-0'].logistics.crPriorToMothballing=2; assert.throws(()=>validateCampaignWorld(invalid));
  s.close();
});
