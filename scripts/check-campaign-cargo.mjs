import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CampaignRuleRegistry } from '../src/campaign/core/RuleRegistry.mjs';
import { createCampaignWorld } from '../src/campaign/core/WorldState.mjs';
import { planCampaignCommand } from '../src/campaign/core/Kernel.mjs';
import { cooperativeCargoProvider as provider } from '../src/campaign/rules/CooperativeCargo.mjs';
import { originalFleetRadius } from '../src/campaign/rules/OriginalTransitions.mjs';
import { CampaignRepository } from '../server/campaign/Repository.mjs';

const rules = new CampaignRuleRegistry().register(provider).compile({ id: 'test.cargo', version: '1', providers: { cargo: provider.id } });
const player = id => ({ kind: 'player', id });
let sequence = 0;
function fixture() {
  const w = structuredClone(createCampaignWorld({ id: 'cargo-test', rules: rules.lock, contentFingerprint: 'cargo-test' }));
  for (const id of ['port', 'elsewhere']) w.locations[id] = { id, version: 0, name: id };
  for (const id of ['a', 'b']) {
    w.players[id] = { id, version: 0, name: id, factionId: null };
    w.fleets[id] = { id, version: 0, owner: player(id), control: player(id), locationId: 'port', position: [5, -8],
      memberIds: [id], partyId: null, encounterId: null, cargo: { supplies: 2000, fuel: 200, crew: 150, marines: 20, food: 12.5 } };
    w.members[id] = { id, version: 0, fleetId: id, owner: player(id), loadout: { hullId: 'wolf' },
      condition: { status: 'ready', hullFraction: 1, combatReadiness: 0.7, armor: null, ammunition: {} } };
  }
  return w;
}
function store(t, world = fixture()) {
  const s = new CampaignRepository(':memory:', rules); t.after(() => s.close()); s.create(world); return s;
}
function command(s, type, payload, requestId = `cargo-${++sequence}`) {
  const w = s.read('cargo-test'), fleet = w.fleets[payload.fleetId];
  const refs = [['fleets', fleet.id], ...fleet.memberIds.map(id => ['members', id])];
  if (payload.podId) refs.push(['spaceEntities', payload.podId]);
  return { worldId: w.id, epoch: s.epoch, requestId, type, payload,
    expected: refs.map(([collection, id]) => ({ collection, id, version: w[collection][id].version })) };
}
function drop(s, items = { supplies: 10 }, fleetId = 'a', actorId = fleetId) {
  return s.execute(player(actorId), command(s, 'cargo.jettison', { fleetId, items })).result.podId;
}
function pick(s, podId, fleetId = 'a', actorId = fleetId) {
  return s.execute(player(actorId), command(s, 'cargo.collect', { fleetId, podId }));
}
function totals(w) {
  const total = {};
  for (const items of [...Object.values(w.fleets).map(f => f.cargo), ...Object.values(w.spaceEntities).filter(e => e.cargoPod).map(e => e.cargoPod.items)]) {
    for (const [id, n] of Object.entries(items)) total[id] = (total[id] ?? 0) + n;
  }
  return total;
}
function context(w, actor = player('a')) {
  return { world: w, actor, requireVersion: (collection, id) => w[collection][id] };
}

test('explicit incomplete provider metadata survives the lock', () => {
  assert.equal(provider.id, 'cooperative.cargo'); assert.equal(provider.service, 'cargo'); assert.equal(provider.version, '0.1.0');
  assert.equal(provider.lifecyclePolicy, 'persistent-until-collected');
  assert.ok(rules.lock.providers.cargo.evidence.some(e => e.lifecyclePolicy === provider.lifecyclePolicy && e.completeness === 'incomplete'));
  assert.deepEqual(Object.keys(provider.methods).sort(), ['canCollect', 'validateWorld']);
});

test('jettison creates exactly one versioned recoverable pod at fleet position; all-resource roundtrip conserves cargo', t => {
  const s = store(t), before = s.read('cargo-test'), all = totals(before);
  const items = { supplies: 40, fuel: 13.5, crew: 11, marines: 4, food: 2.5 }, id = drop(s, items);
  const w = s.read('cargo-test'), pod = w.spaceEntities[id];
  assert.equal(Object.keys(w.spaceEntities).length, 1); assert.equal(pod.version, 0);
  assert.deepEqual(pod.position, before.fleets.a.position); assert.equal(pod.locationId, before.fleets.a.locationId);
  assert.deepEqual(pod.cargoPod, { schemaVersion: 1, items, createdAtTick: 0, sourceFleetId: 'a', createdBy: 'a' });
  assert.deepEqual(pod.tags, ['cargo-pod']); assert.equal(pod.name, '货物吊舱');
  assert.equal(pod.radius, 30); // mass=71; floor(sqrt(71))=8; 10+10*sqrt(8-4)
  assert.equal(pod.presentation, undefined); assert.equal(pod.navigation, undefined);
  assert.deepEqual(totals(w), all); assert.equal(w.fleets.a.version, 1);
  pick(s, id); const after = s.read('cargo-test');
  assert.equal(after.spaceEntities[id], undefined); assert.deepEqual(after.fleets.a.cargo, before.fleets.a.cargo);
  assert.deepEqual(totals(after), all); assert.deepEqual(after.fleets.a.position, before.fleets.a.position);
});

test('native min/max pieces and strict cryo threshold use cargoSpace, fuel and integer personnel', t => {
  const s = store(t);
  for (const [items, name, radius] of [
    [{ food: 0.5 }, '货物吊舱', 20], [{ fuel: 50, crew: 50 }, '货物吊舱', 10 + 10 * Math.sqrt(6)],
    [{ crew: 51, fuel: 50 }, '冷冻吊舱', 10 + 10 * Math.sqrt(6)], [{ supplies: 1600 }, '货物吊舱', 70],
  ]) {
    const id = drop(s, items), pod = s.read('cargo-test').spaceEntities[id];
    assert.equal(pod.radius, radius); assert.equal(pod.name, name); pick(s, id);
  }
});

test('explicit control, not ownership; foreign, NPC and system commands rejected', t => {
  const w = fixture(); w.fleets.a.control = player('b'); const s = store(t, w);
  const c = command(s, 'cargo.jettison', { fleetId: 'a', items: { supplies: 1 } });
  assert.throws(() => s.execute(player('a'), c), { code: 'FORBIDDEN' });
  assert.throws(() => s.execute({ kind: 'system', id: 'system' }, c), { code: 'FORBIDDEN' });
  const id = s.execute(player('b'), c).result.podId;
  assert.throws(() => pick(s, id, 'a', 'a'), { code: 'FORBIDDEN' }); pick(s, id, 'a', 'b');
  const npc = fixture(); npc.fleets.a.control = { kind: 'npc' }; const n = store(t, npc);
  assert.throws(() => drop(n), { code: 'FORBIDDEN' });
});

test('faction manager can command, ordinary faction member cannot', t => {
  const w = fixture(); w.factions.team = { id: 'team', version: 0, name: 'team', playerRoles: { a: 'member', b: 'manager' } };
  w.fleets.a.control = { kind: 'faction', id: 'team' }; const s = store(t, w);
  assert.throws(() => drop(s), { code: 'FORBIDDEN' }); const id = drop(s, { fuel: 5 }, 'a', 'b'); pick(s, id, 'a', 'b');
});

test('another nearby player-controlled fleet may recover everything even overcapacity', t => {
  const s = store(t), before = s.read('cargo-test'), id = drop(s, { supplies: 1600, crew: 100, fuel: 150 });
  pick(s, id, 'b'); const after = s.read('cargo-test');
  assert.equal(after.fleets.b.cargo.supplies, 3600); assert.equal(after.fleets.b.cargo.crew, 250); assert.equal(after.fleets.b.cargo.fuel, 350);
  assert.deepEqual(totals(after), totals(before));
});

test('canCollect is side-effect-free boolean; strict boundary and location checked by authority', t => {
  const s = store(t), id = drop(s), base = structuredClone(s.read('cargo-test')), pod = base.spaceEntities[id];
  const contact = originalFleetRadius([base.members.b]) + pod.radius;
  for (const [distance, expected] of [[contact - 1e-8, true], [contact, false], [contact + 1e-8, false]]) {
    const w = structuredClone(base); w.fleets.b.position = [pod.position[0] + distance, pod.position[1]];
    const saved = JSON.stringify(w); assert.equal(provider.methods.canCollect(w, w.fleets.b, w.spaceEntities[id]), expected); assert.equal(JSON.stringify(w), saved);
    w.revision = 0; const other = store(t, w);
    if (expected) pick(other, id, 'b'); else assert.throws(() => pick(other, id, 'b'), { code: 'OUT_OF_RANGE' });
  }
  const w = structuredClone(base); w.revision = 0; w.fleets.b.locationId = 'elsewhere';
  assert.equal(provider.methods.canCollect(w, w.fleets.b, pod), false);
  const other = store(t, w); assert.throws(() => pick(other, id, 'b'), { code: 'LOCATION_CONFLICT' });
});

test('encounter, jump and unsupported hull eligibility fail closed without DTO exceptions', t => {
  const s = store(t), id = drop(s), base = structuredClone(s.read('cargo-test'));
  for (const [modify, code] of [
    [w => { w.fleets.a.encounterId = 'battle'; }, 'ASSET_LOCKED'],
    [w => { w.fleets.a.navigation = { transition: {} }; }, 'IN_TRANSITION'],
  ]) {
    const w = structuredClone(base); modify(w);
    assert.equal(provider.methods.canCollect(w, w.fleets.a, w.spaceEntities[id]), false);
    for (const [type, payload] of [['cargo.collect', { fleetId: 'a', podId: id }], ['cargo.jettison', { fleetId: 'a', items: { fuel: 1 } }]])
      assert.throws(() => provider.commands[type](context(w), payload, 'locked'), { code });
  }
  const w = structuredClone(base); w.members.a.loadout.hullId = 'unported-hull';
  assert.equal(provider.methods.canCollect(w, w.fleets.a, w.spaceEntities[id]), false);
  assert.equal(provider.methods.canCollect(w, w.fleets.a, null), false);
});

test('ALL-or-nothing insufficient inventory, invalid quantities/IDs/schema and stack limit', t => {
  const s = store(t), before = s.read('cargo-test');
  for (const items of [{ supplies: 1, fuel: 201 }, {}, { fuel: 0 }, { fuel: -1 }, { fuel: NaN }, { fuel: Infinity }, { fuel: '1' },
    { crew: 0.5 }, { marines: 1.1 }, { credits: 1 }, { ships: 1 }, { blueprints: 1 }, { ship_weapons: 1 }, { lightmg: 1 }, { invented: 1 },
    { supplies: Number.MAX_SAFE_INTEGER + 1 }, Object.fromEntries(Array.from({ length: 65 }, (_, i) => ['item' + i, 1]))]) {
    assert.throws(() => drop(s, items)); assert.deepEqual(s.read('cargo-test'), before);
  }
  for (const payload of [{ fleetId: 'a', items: { fuel: 1 }, extra: {} }, { fleetId: 'a' }, { items: { fuel: 1 } }]) {
    const c = command(s, 'cargo.jettison', { fleetId: 'a', items: { fuel: 1 } }); c.payload = payload;
    assert.throws(() => s.execute(player('a'), c)); assert.deepEqual(s.read('cargo-test'), before);
  }
  const id = drop(s), after = s.read('cargo-test'), c = command(s, 'cargo.collect', { fleetId: 'a', podId: id });
  c.payload.items = { fuel: 9000 }; assert.throws(() => s.execute(player('a'), c), { code: 'INVALID_CARGO_SCHEMA' }); assert.deepEqual(s.read('cargo-test'), after);
});

test('malformed persisted pods rejected, including unknown metadata and geometry tampering', t => {
  const s = store(t), id = drop(s), base = structuredClone(s.read('cargo-test'));
  for (const mutate of [p => { p.cargoPod.schemaVersion = 2; }, p => { p.cargoPod.extra = 1; }, p => { p.extra = 1; },
    p => { p.cargoPod.items = {}; }, p => { p.cargoPod.items = { fuel: -1 }; }, p => { p.cargoPod.items = { crew: 0.5 }; },
    p => { p.cargoPod.items = { credits: 1 }; }, p => { p.cargoPod.createdAtTick = 1; }, p => { p.radius = 1e4; },
    p => { p.tags = []; }, p => { p.cargoPod.sourceFleetId = ''; }, p => { p.cargoPod.createdBy = {}; }, p => { delete p.cargoPod; }]) {
    const w = structuredClone(base); mutate(w.spaceEntities[id]);
    assert.throws(() => provider.methods.validateWorld(w));
    assert.equal(provider.methods.canCollect(w, w.fleets.a, w.spaceEntities[id]), false);
  }
});

test('source provenance need not name a surviving fleet and cannot restrict collection', t => {
  const s = store(t), id = drop(s), w = structuredClone(s.read('cargo-test'));
  w.revision = 0; w.spaceEntities[id].cargoPod.sourceFleetId = 'removed-fleet'; w.spaceEntities[id].cargoPod.createdBy = 'departed-player';
  const other = store(t, w); pick(other, id, 'b');
});

test('any navigation interaction referencing a pod blocks deletion', t => {
  const s = store(t), id = drop(s), w = structuredClone(s.read('cargo-test')); w.revision = 0;
  w.fleets.b.navigation = { velocity: [0, 0], destination: [...w.spaceEntities[id].position], interaction: { targetId: id, orderId: 'approach', arrived: true } };
  const other = store(t, w), before = other.read('cargo-test');
  assert.equal(provider.methods.canCollect(before, before.fleets.a, before.spaceEntities[id]), false);
  assert.throws(() => pick(other, id), { code: 'CARGO_TARGET_REFERENCED' }); assert.deepEqual(other.read('cargo-test'), before);
});

test('fleet version mandatory for both; pod and every radius member version mandatory for collect', t => {
  const w = fixture(); w.members.c = { ...structuredClone(w.members.a), id: 'c' }; w.fleets.a.memberIds.push('c'); const s = store(t, w);
  const c = command(s, 'cargo.jettison', { fleetId: 'a', items: { fuel: 1 } }); c.expected = c.expected.filter(e => e.collection !== 'fleets');
  assert.throws(() => s.execute(player('a'), c), { code: 'VERSION_REQUIRED' });
  const id = drop(s);
  for (const [collection, target] of [['fleets', 'a'], ['members', 'a'], ['members', 'c'], ['spaceEntities', id]]) {
    const c = command(s, 'cargo.collect', { fleetId: 'a', podId: id }); c.expected = c.expected.filter(e => !(e.collection === collection && e.id === target));
    assert.throws(() => s.execute(player('a'), c), { code: 'VERSION_REQUIRED' });
  }
  const stale = command(s, 'cargo.collect', { fleetId: 'a', podId: id }); stale.expected.find(e => e.collection === 'members').version++;
  assert.throws(() => s.execute(player('a'), stale), { code: 'VERSION_CONFLICT' });
});

test('deterministic IDs, retries and stale pod races cannot mint cargo', t => {
  const s = store(t), before = s.read('cargo-test'), c = command(s, 'cargo.jettison', { fleetId: 'a', items: { supplies: 10 } }, 'stable-request');
  const p1 = planCampaignCommand(before, c, player('a'), rules), p2 = planCampaignCommand(before, c, player('a'), rules);
  assert.deepEqual(p1, p2);
  const changed = planCampaignCommand(before, { ...c, requestId: 'other-request' }, player('a'), rules);
  assert.notEqual(changed.result.podId, p1.result.podId);
  const receipt = s.execute(player('a'), c), id = receipt.result.podId;
  assert.deepEqual(s.execute(player('a'), c), receipt); assert.equal(s.read('cargo-test').revision, 1);
  assert.throws(() => s.execute(player('a'), { ...c, payload: { fleetId: 'a', items: { supplies: 11 } } }), { code: 'REQUEST_REUSED' });
  const a = command(s, 'cargo.collect', { fleetId: 'a', podId: id }), b = command(s, 'cargo.collect', { fleetId: 'b', podId: id });
  const result = s.execute(player('b'), b); assert.deepEqual(s.execute(player('b'), b), result);
  assert.throws(() => s.execute(player('a'), a), { code: 'VERSION_CONFLICT' });
  assert.deepEqual(totals(s.read('cargo-test')), totals(before));
});

test('tiny transfers against huge balances fail atomically instead of minting or losing a stack', t => {
  const w = fixture(); w.fleets.a.cargo.fuel = Number.MAX_SAFE_INTEGER; const s = store(t, w), before = s.read('cargo-test');
  assert.throws(() => drop(s, { supplies: 1, fuel: 0.25 }), { code: 'CARGO_PRECISION' }); assert.deepEqual(s.read('cargo-test'), before);
  const id = drop(s, { fuel: 0.25 }, 'b'), pending = s.read('cargo-test');
  assert.throws(() => pick(s, id), { code: 'CARGO_PRECISION' }); assert.deepEqual(s.read('cargo-test'), pending);
});

test('SQLite reopen preserves pod items, receipts and later recovery; elapsed ticks do not expire pods', () => {
  const directory = mkdtempSync(join(tmpdir(), 'campaign-cargo-')), file = join(directory, 'world.sqlite'); let s;
  try {
    s = new CampaignRepository(file, rules); const w = fixture(); w.clock = { tick: 60000000, ticksPerSecond: 60, gameSeconds: 1000000 }; s.create(w);
    const c = command(s, 'cargo.jettison', { fleetId: 'a', items: { fuel: 25, crew: 4 } }), receipt = s.execute(player('a'), c);
    const persisted = s.read('cargo-test'), id = receipt.result.podId;
    const future = structuredClone(persisted); future.clock.tick += 60000000; future.clock.gameSeconds = future.clock.tick / 60;
    provider.methods.validateWorld(future); assert.equal(provider.methods.canCollect(future, future.fleets.b, future.spaceEntities[id]), true);
    s.close(); s = new CampaignRepository(file, rules);
    assert.deepEqual(s.read('cargo-test'), persisted); assert.deepEqual(s.execute(player('a'), c), receipt);
    const collect = command(s, 'cargo.collect', { fleetId: 'b', podId: id }), recovered = s.execute(player('b'), collect);
    s.close(); s = new CampaignRepository(file, rules);
    assert.equal(s.read('cargo-test').spaceEntities[id], undefined); assert.deepEqual(s.execute(player('b'), collect), recovered);
    assert.deepEqual(totals(s.read('cargo-test')), totals(w));
  } finally {
    s?.close(); for (const path of [file, file + '-wal', file + '-shm']) if (existsSync(path)) unlinkSync(path); rmdirSync(directory);
  }
});

test('decimal commodities remain transferable; personnel stay exact integer counts', t => {
  const s = store(t), before = s.read('cargo-test'), id = drop(s, { supplies: 0.1, food: 0.3, fuel: 0.1 });
  pick(s, id); assert.deepEqual(s.read('cargo-test').fleets.a.cargo, before.fleets.a.cargo);
});

test('overflow on a later collected resource leaves all balances and the entire pod untouched', t => {
  const w = fixture(); w.fleets.a.cargo.fuel = Number.MAX_SAFE_INTEGER; const s = store(t, w);
  const id = drop(s, { supplies: 5, fuel: 10 }, 'b'), before = s.read('cargo-test');
  assert.throws(() => pick(s, id), { code: 'INVALID_NUMBER' }); assert.deepEqual(s.read('cargo-test'), before);
});

test('stale existing pod version and deterministic ID collision both fail closed', t => {
  const s = store(t), id = drop(s), w = structuredClone(s.read('cargo-test')); w.revision = 0; w.spaceEntities[id].version = 1;
  const other = store(t, w), c = command(other, 'cargo.collect', { fleetId: 'a', podId: id });
  c.expected.find(e => e.collection === 'spaceEntities').version = 0;
  assert.throws(() => other.execute(player('a'), c), { code: 'VERSION_CONFLICT' });
  const input = command(s, 'cargo.jettison', { fleetId: 'a', items: { fuel: 1 } }, 'collision');
  const plan = planCampaignCommand(s.read('cargo-test'), input, player('a'), rules);
  const collision = structuredClone(s.read('cargo-test')); collision.revision = 0;
  collision.spaceEntities[plan.result.podId] = { ...structuredClone(collision.spaceEntities[id]), id: plan.result.podId };
  const target = store(t, collision), before = target.read('cargo-test');
  const retry = command(target, 'cargo.jettison', input.payload, 'collision');
  assert.throws(() => target.execute(player('a'), retry), { code: 'CARGO_ID_CONFLICT' }); assert.deepEqual(target.read('cargo-test'), before);
});
