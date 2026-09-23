import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, unlinkSync, rmdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createReferenceRuleset } from '../src/campaign/ReferenceRuleset.mjs';
import { createCampaignWorld, validateCampaignWorld } from '../src/campaign/core/WorldState.mjs';
import { CampaignRuleRegistry } from '../src/campaign/core/RuleRegistry.mjs';
import { CampaignRepository } from '../server/campaign/Repository.mjs';

const rules = createReferenceRuleset();
const authority = { kind: 'system', id: 'scheduler' };
const player = id => ({ kind: 'player', id });
function fixture(selected = rules) {
  const w = structuredClone(createCampaignWorld({ id: 'world-test', rules: selected.lock, contentFingerprint: 'synthetic-v1' }));
  w.locations.port = { id: 'port', version: 0, name: 'Synthetic test only' , navigation: { space: 'normal', terrain: [] } };
  for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) {
    w.players[id] = { id, version: 0, name: id, factionId: null };
    w.fleets[id] = { id, version: 0, owner: { kind: 'player', id }, control: { kind: 'player', id }, locationId: 'port', position: [0, 0],
      memberIds: [id], cargo: { supplies: 100, fuel: 30 }, partyId: null, encounterId: null };
    w.members[id] = { id, version: 0, fleetId: id, owner: { kind: 'player', id }, loadout: { hullId: 'wolf' },
      condition: { status: 'ready', hullFraction: 0.4, combatReadiness: 0.6,
        armor: { cols: 2, rows: 2, fractions: [0, 0.3, 1, 0.8] }, ammunition: { missile: 3, laser: null } } };
  }
  return validateCampaignWorld(w);
}
function store(t, w = fixture(), selected = rules) {
  const s = new CampaignRepository(':memory:', selected);
  t.after(() => s.close()); s.create(w); return s;
}
function command(s, type, requestId, payload, entries = []) {
  const w = s.read('world-test');
  return { worldId: w.id, epoch: s.epoch, type, requestId, payload,
    expected: entries.map(([collection, id]) => ({ collection, id, version: w[collection][id].version })) };
}
function prepare(s, fleetIds = ['a', 'b'], requestId = 'prepare') {
  const sides = fleetIds.map((id, i) => ({ id: `side-${i}`, fleetIds: [id] }));
  return s.execute(authority, command(s, 'encounter.prepare', requestId, { sides, hostPlayerId: fleetIds[0], seed: 17 },
    fleetIds.flatMap(id => [['fleets', id], ['members', id]]))).result.encounterId;
}
function attempt(s, encounterId, type, payload = {}, requestId = `${type}-${s.read('world-test').revision}`) {
  const w = s.read('world-test');
  return command(s, type, requestId, { encounterId, battleAttempt: w.encounters[encounterId].battleAttempt, ...payload },
    [['encounters', encounterId], ['extensions', `cooperative.encounters:${encounterId}`]]);
}

test('checkpoint preserves persistent member IDs, damage, armor, ammo and ownership without changing them', t => {
  const s = store(t), before = s.read('world-test'), id = prepare(s), w = s.read('world-test');
  const checkpoint = w.extensions[`cooperative.encounters:${id}`].data.checkpoint;
  assert.deepEqual(checkpoint.members.a, before.members.a);
  assert.deepEqual(checkpoint.fleets.a, before.fleets.a);
  assert.deepEqual(w.members, before.members);
  assert.equal(w.fleets.a.encounterId, id); assert.equal(w.fleets.b.encounterId, id);
  assert.equal(w.fleets.c.encounterId, null);
  assert.equal(checkpoint.contentFingerprint, w.contentFingerprint);
  assert.deepEqual(checkpoint.rules, rules.lock);
});

test('preparing an overlapping battle fails atomically and never locks the other fleet', t => {
  const s = store(t); prepare(s); const before = s.read('world-test');
  assert.throws(() => prepare(s, ['b', 'c'], 'overlap'), { code: 'ASSET_LOCKED' });
  assert.deepEqual(s.read('world-test'), before);
});

test('unversioned participants or player-forged lifecycle commands are rejected', t => {
  const s = store(t);
  const c = command(s, 'encounter.prepare', 'no-version', {
    sides: [{ id: 'one', fleetIds: ['a'] }, { id: 'two', fleetIds: ['b'] }], hostPlayerId: 'a', seed: 17,
  });
  assert.throws(() => s.execute(authority, c), { code: 'VERSION_REQUIRED' });
  assert.throws(() => s.execute(player('a'), c), { code: 'FORBIDDEN' });
  assert.equal(s.read('world-test').revision, 0);
  const id = prepare(s);
  assert.throws(() => s.execute(player('a'), attempt(s, id, 'encounter.start')), { code: 'FORBIDDEN' });
});

test('retry A retains B and unrelated player activity; no world rollback and no checkpoint regrant', t => {
  const s = store(t), a = prepare(s), b = prepare(s, ['c', 'd'], 'prepare-b');
  s.execute(authority, attempt(s, a, 'encounter.start'));
  s.execute(authority, attempt(s, b, 'encounter.start'));
  s.execute(player('e'), command(s, 'party.invite', 'outside-invite', { fromFleetId: 'e', toFleetId: 'f' }, [['fleets', 'e']]));
  s.execute(authority, attempt(s, a, 'encounter.interrupt', { reason: 'compute-host-lost' }));
  const before = s.read('world-test');
  const retry = attempt(s, a, 'encounter.retry', { hostPlayerId: 'b' });
  const receipt = s.execute(authority, retry);
  assert.equal(receipt.result.battleAttempt, 2);
  assert.deepEqual(s.execute(authority, retry), receipt);
  const after = s.read('world-test');
  assert.deepEqual(after.encounters[b], before.encounters[b]);
  assert.deepEqual(after.invitations, before.invitations);
  assert.deepEqual(after.fleets, before.fleets);
  assert.deepEqual(after.members, before.members);
  assert.deepEqual(after.extensions[`cooperative.encounters:${a}`].data.checkpoint,
    before.extensions[`cooperative.encounters:${a}`].data.checkpoint);
  assert.throws(() => s.execute(authority, attempt(s, a, 'encounter.start', { battleAttempt: 1 })), { code: 'STALE_ATTEMPT' });
  s.execute(authority, attempt(s, a, 'encounter.start'));
  assert.equal(s.read('world-test').encounters[a].status, 'running');
});

test('cancel releases only unstarted preparation; an already-started battle cannot evade resolution', t => {
  const s = store(t), a = prepare(s), b = prepare(s, ['c', 'd'], 'other');
  const before = s.read('world-test');
  s.execute(authority, attempt(s, a, 'encounter.cancel-preparation'));
  const w = s.read('world-test');
  assert.equal(w.encounters[a].status, 'cancelled'); assert.equal(w.fleets.a.encounterId, null);
  assert.equal(w.fleets.b.encounterId, null); assert.equal(w.fleets.c.encounterId, b);
  assert.deepEqual(w.members, before.members);
  s.execute(authority, attempt(s, b, 'encounter.start'));
  s.execute(authority, attempt(s, b, 'encounter.interrupt', { reason: 'lost' }));
  s.execute(authority, attempt(s, b, 'encounter.retry', { hostPlayerId: 'c' }));
  assert.throws(() => s.execute(authority, attempt(s, b, 'encounter.cancel-preparation')), { code: 'ENCOUNTER_PHASE' });
});

test('damaged locked assets require inspection, rather than silently restoring the checkpoint', t => {
  const s = store(t), id = prepare(s);
  s.execute(authority, attempt(s, id, 'encounter.interrupt', { reason: 'lost' }));
  // Simulates incompatible future code/import, not a production player command.
  const changed = structuredClone(s.read('world-test')); changed.revision = 0;
  changed.members.a.condition.ammunition.missile = 1;
  const other = store(t, changed);
  assert.throws(() => other.execute(authority, attempt(other, id, 'encounter.retry', { hostPlayerId: 'a' })), { code: 'LOCKED_ASSET_CHANGED' });
  assert.equal(other.read('world-test').members.a.condition.ammunition.missile, 1);
});

test('default bridge deliberately has no arbitrary client result/reward submission command', t => {
  const s = store(t), id = prepare(s);
  assert.throws(() => s.execute(authority, attempt(s, id, 'encounter.commit', { credits: 1000000 })), { code: 'UNSUPPORTED_COMMAND' });
});

test('overhaul provider can persist and update its own versioned state without kernel/table changes', t => {
  const namespace = 'test.overhaul:research';
  const provider = { id: 'test.overhaul', version: '1', service: 'research', apiVersion: 1, capabilities: ['different-progression'],
    commands: { 'research.advance': ctx => {
      const before = ctx.world.extensions[namespace];
      if (before) ctx.requireVersion('extensions', namespace);
      return { changes: [{ collection: 'extensions', id: namespace, expectedVersion: before?.version ?? null,
        value: { id: namespace, version: before ? before.version + 1 : 0, schemaVersion: 1,
          data: { points: (before?.data.points ?? 0) + 7 } } }], events: [], result: {} };
    } } };
  const custom = new CampaignRuleRegistry().register(provider).compile({ id: 'overhaul-test', version: '1', providers: { research: 'test.overhaul' } });
  const s = store(t, fixture(custom), custom);
  s.execute(authority, command(s, 'research.advance', 'research-1', {}));
  s.execute(authority, command(s, 'research.advance', 'research-2', {}, [['extensions', namespace]]));
  assert.equal(s.read('world-test').extensions[namespace].data.points, 14);
  assert.throws(() => s.execute(authority, command(s, 'research.advance', 'missing-version', {})), { code: 'VERSION_REQUIRED' });
});

test('provider cannot write another namespace and orphaned extension state is rejected on load', t => {
  const p = { id: 'test.overhaul', version: '1', service: 'research', apiVersion: 1, capabilities: [], commands: {
    'research.bad': () => ({ changes: [{ collection: 'extensions', id: 'other.provider:data', expectedVersion: null,
      value: { id: 'other.provider:data', version: 0, schemaVersion: 1, data: {} } }], events: [] }),
  } };
  const custom = new CampaignRuleRegistry().register(p).compile({ id: 'test', version: '1', providers: { research: p.id } });
  const s = store(t, fixture(custom), custom);
  assert.throws(() => s.execute(authority, command(s, 'research.bad', 'bad', {})), { code: 'EXTENSION_OWNER' });
  const w = structuredClone(fixture());
  w.extensions['missing.provider:data'] = { id: 'missing.provider:data', version: 0, schemaVersion: 1, data: {} };
  assert.throws(() => validateCampaignWorld(w), { code: 'EXTENSION_OWNER' });
});

test('invalid armor/ammo and terminal encounter locks fail validation', () => {
  for (const mutate of [
    w => { w.members.a.condition.armor.fractions.pop(); },
    w => { w.members.a.condition.armor.fractions[0] = -0.1; },
    w => { w.members.a.condition.ammunition.missile = 1.5; },
    w => { w.members.a.condition.ammunition.missile = -1; },
    w => { w.members.a.condition.status = 'destroyed'; },
    w => { w.encounters.bad = { id: 'bad', version: 0, battleAttempt: 1, status: 'cancelled', fleetIds: ['a'] }; w.fleets.a.encounterId = 'bad'; },
  ]) {
    const w = structuredClone(fixture()); mutate(w); assert.throws(() => validateCampaignWorld(w));
  }
});

test('three-fleet party transfers leadership on exit and removes departed leader invitations', t => {
  const s = store(t);
  const invite = (from, to, requestId, partyId = null) => s.execute(player(from), command(s, 'party.invite', requestId,
    { fromFleetId: from, toFleetId: to }, [['fleets', from], ...(partyId ? [['parties', partyId]] : [])])).result.invitationId;
  const accept = (to, invitationId, partyId = null) => s.execute(player(to), command(s, 'party.accept', `accept-${to}`,
    { invitationId }, [['invitations', invitationId], ['fleets', 'a'], ['fleets', to], ...(partyId ? [['parties', partyId]] : [])])).result.partyId;
  const partyId = accept('b', invite('a', 'b', 'invite-b'));
  assert.equal(accept('c', invite('a', 'c', 'invite-c', partyId), partyId), partyId);
  const stale = invite('a', 'd', 'invite-d', partyId);
  const before = s.read('world-test');
  s.execute(player('a'), command(s, 'party.leave', 'leave-a', { fleetId: 'a' }, [['fleets', 'a'], ['parties', partyId]]));
  const w = s.read('world-test');
  assert.deepEqual(w.parties[partyId].fleetIds, ['b', 'c']); assert.equal(w.parties[partyId].leaderFleetId, 'b');
  assert.equal(w.invitations[stale], undefined); assert.equal(w.fleets.a.partyId, null);
  assert.deepEqual(w.members, before.members); assert.deepEqual(w.fleets.a.cargo, before.fleets.a.cargo);
});

test('faction fleet permission is role based, without taking ownership of personal member assets', t => {
  const w = structuredClone(fixture());
  w.factions.guild = { id: 'guild', version: 0, name: 'Player-founded faction', playerRoles: { a: 'member', b: 'manager', c: 'leader' } };
  w.fleets.a.owner = { kind: 'faction', id: 'guild' }; w.fleets.a.control = { kind: 'faction', id: 'guild' };
  const s = store(t, w);
  const c = command(s, 'party.invite', 'faction-invite', { fromFleetId: 'a', toFleetId: 'd' }, [['fleets', 'a']]);
  assert.throws(() => s.execute(player('a'), c), { code: 'FORBIDDEN' });
  const id = s.execute(player('b'), c).result.invitationId;
  s.execute(player('d'), command(s, 'party.accept', 'join-faction', { invitationId: id }, [['invitations', id], ['fleets', 'a'], ['fleets', 'd']]));
  assert.deepEqual(s.read('world-test').fleets.a.owner, { kind: 'faction', id: 'guild' });
  assert.deepEqual(s.read('world-test').members.a.owner, { kind: 'player', id: 'a' });
});

test('expired invitations and invitations from a demoted faction manager cannot be accepted', t => {
  const w = structuredClone(fixture());
  w.factions.guild = { id: 'guild', version: 0, name: 'Guild', playerRoles: { a: 'manager' } };
  w.fleets.a.owner = { kind: 'faction', id: 'guild' }; w.fleets.a.control = { kind: 'faction', id: 'guild' };
  const s = store(t, w);
  const id = s.execute(player('a'), command(s, 'party.invite', 'invited', { fromFleetId: 'a', toFleetId: 'b' }, [['fleets', 'a']])).result.invitationId;
  for (const [change, error] of [
    [draft => { draft.clock.gameSeconds = draft.invitations[id].expiresAt; draft.clock.tick = Math.round(draft.clock.gameSeconds * draft.clock.ticksPerSecond); }, 'INVITE_EXPIRED'],
    [draft => { draft.factions.guild.playerRoles.a = 'member'; }, 'INVITE_STALE'],
  ]) {
    const draft = structuredClone(s.read('world-test')); draft.revision = 0; change(draft);
    const other = store(t, draft);
    assert.throws(() => other.execute(player('b'), command(other, 'party.accept', 'accept', { invitationId: id },
      [['invitations', id], ['fleets', 'a'], ['fleets', 'b']])), { code: error });
  }
});

test('disk restart retains the exact launch checkpoint and receipts while fencing new stale-authority commands', t => {
  const directory = mkdtempSync(join(tmpdir(), 'starsector-encounter-'));
  const filename = join(directory, 'world.sqlite');
  let s;
  t.after(() => {
    s?.close();
    for (const suffix of ['', '-wal', '-shm']) if (existsSync(filename + suffix)) unlinkSync(filename + suffix);
    rmdirSync(directory);
  });
  s = new CampaignRepository(filename, rules); s.create(fixture());
  const id = prepare(s);
  const c = attempt(s, id, 'encounter.start'), receipt = s.execute(authority, c);
  const checkpoint = s.read('world-test').extensions[`cooperative.encounters:${id}`];
  const interruption = attempt(s, id, 'encounter.interrupt', { reason: 'authority-restarted' });
  s.close(); s = new CampaignRepository(filename, rules);
  assert.deepEqual(s.execute(authority, c), receipt);
  assert.deepEqual(s.read('world-test').extensions[checkpoint.id], checkpoint);
  assert.throws(() => s.execute(authority, interruption), { code: 'STALE_AUTHORITY' });
  // Restart scanning is the scheduler's responsibility; only a fresh internal command can recover it.
  s.execute(authority, attempt(s, id, 'encounter.interrupt', { reason: 'authority-restarted' }));
  s.execute(authority, attempt(s, id, 'encounter.retry', { hostPlayerId: 'b' }));
  assert.equal(s.read('world-test').encounters[id].battleAttempt, 2);
});
