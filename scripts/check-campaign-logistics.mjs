import { originalOrbitsProvider } from '../src/campaign/rules/OriginalOrbits.mjs';
import { originalTravelProvider } from '../src/campaign/rules/OriginalTravel.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveOriginalFleetStats } from '../src/campaign/rules/OriginalFleetStats.mjs';
import { advanceOriginalRecovery } from '../src/campaign/rules/OriginalRecovery.mjs';
import { advanceOriginalFleet } from '../src/campaign/rules/OriginalLogisticsStep.mjs';
import { createReferenceRuleset } from '../src/campaign/ReferenceRuleset.mjs';
import { createCampaignWorld, validateCampaignWorld } from '../src/campaign/core/WorldState.mjs';
import { CampaignRuleRegistry } from '../src/campaign/core/RuleRegistry.mjs';
import { cooperativeSimulationProvider } from '../src/campaign/rules/CooperativeSimulation.mjs';
import { encounterLifecycleProvider } from '../src/campaign/rules/EncounterLifecycle.mjs';
import { originalLogisticsProvider } from '../src/campaign/rules/OriginalLogistics.mjs';
import { CampaignRepository } from '../server/campaign/Repository.mjs';
import { CampaignService } from '../server/campaign/CampaignService.mjs';
import reference from '../src/campaign/data/reference-logistics.json' with { type: 'json' };
const near = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
function fixture(ids = ['one']) {
  const fleet = { id: 'fleet', version: 0, owner: { kind: 'player', id: 'a' }, control: { kind: 'player', id: 'a' }, locationId: 'port', position: [0, 0],
    partyId: null, encounterId: null, memberIds: ids, cargo: { supplies: 10, fuel: 10, crew: 15 * ids.length } };
  const members = ids.map(id => ({ id, version: 0, fleetId: 'fleet', owner: { kind: 'player', id: 'a' }, loadout: { hullId: 'wolf' },
    condition: { status: 'ready', hullFraction: 0.5, combatReadiness: 0.5, armor: null, ammunition: { missiles: 1, beam: null } } }));
  return { fleet, members };
}
const stationary = { speed: 0, inHyperspace: false, hyperFuelMultiplier: 1, normalFuelMultiplier: 0, hiddenFuelMultiplier: 1 };
const simulate = (f = fixture(), ticks = 600, motion = stationary, aiMode = false) => advanceOriginalFleet({ ...f, ticks, aiMode, motion });
const rules = createReferenceRuleset();
function world() {
  const w = structuredClone(createCampaignWorld({ id: 'logistics-test', rules: rules.lock, contentFingerprint: 'native-logistics-fixture' }));
  const f = fixture(); w.players.a = { id: 'a', version: 0, name: 'A', factionId: null };
  w.players.b = { id: 'b', version: 0, name: 'B', factionId: null };
  w.locations.port = { id: 'port', version: 0, name: 'Stationary native-rule test' , navigation: { space: 'normal', terrain: [] } };
  w.fleets.fleet = f.fleet; w.members.one = f.members[0]; return validateCampaignWorld(w);
}
function command(s, fromTick, requestId = `step-${fromTick}`, ticks = 60) {
  const w = s.read('logistics-test');
  return { worldId: w.id, epoch: s.epoch, type: 'world.advance', requestId, payload: { fromTick, ticks },
    expected: [{ collection: 'fleets', id: 'fleet', version: w.fleets.fleet.version }, { collection: 'members', id: 'one', version: w.members.one.version }] };
}
const system = { kind: 'system', id: 'scheduler' };
function repository(t, w = world()) { const s = new CampaignRepository(':memory:', rules); t.after(() => s.close()); s.create(w); return s; }

test('native wolf statistics and commodity capacities derive from imported data, not command payloads', () => {
  const f = fixture(), stats = resolveOriginalFleetStats(f.fleet, f.members), m = stats.members[0];
  assert.equal(m.minCrew, 15); assert.equal(m.assignedCrew, 15); assert.equal(stats.cargo.capacity, 50);
  assert.equal(stats.cargo.fuelCapacity, 20); assert.equal(stats.cargo.personnelCapacity, 30); assert.equal(stats.cargo.spaceUsed, 10);
  near(m.maxCR, 0.7); near(m.recoveryPerDay, 0.1); near(m.repairRatePerDay, 0.1); near(m.suppliesPerMonth, 5);
});

test('native ordered rounded crew assignment does not give fractional crew to every ship', () => {
  const f = fixture(['one', 'two']); f.fleet.cargo.crew = 1;
  const stats = resolveOriginalFleetStats(f.fleet, f.members);
  assert.deepEqual(stats.members.map(m => m.assignedCrew), [1, 0]);
  near(stats.members[0].maxCR, 0.7 - 0.5 * 14 / 15);
  near(stats.members[0].recoveryPerDay, 0.1 / 15); near(stats.members[1].maxCR, 0.2);
});

test('mothballing removes capacity and maintenance but not base fuel use', () => {
  const f = fixture(); f.members[0].logistics = { mothballed: true, suspendRepairs: false };
  const stats = resolveOriginalFleetStats(f.fleet, f.members);
  assert.equal(stats.cargo.capacity, 0); assert.equal(stats.cargo.fuelCapacity, 0); assert.equal(stats.cargo.personnelCapacity, 0);
  assert.equal(stats.members[0].minCrew, 0); assert.equal(stats.members[0].suppliesPerMonth, 0); assert.equal(stats.members[0].fuelPerLightYear, 1);
  const r = simulate(f, 1); assert.deepEqual(r.members[0].condition, f.members[0].condition);
});

test('efficiency overhaul modifies fuel, crew and upkeep while speeding actual recovery', () => {
  const f = fixture(); f.members[0].loadout.hullMods = ['efficiency_overhaul'];
  let m = resolveOriginalFleetStats(f.fleet, f.members).members[0];
  assert.equal(m.minCrew, 12); near(m.suppliesPerMonth, 4); near(m.fuelPerLightYear, 0.8); near(m.repairRatePerDay, 0.15);
  f.members[0].loadout.sMods = ['efficiency_overhaul'];
  m = resolveOriginalFleetStats(f.fleet, f.members).members[0];
  assert.equal(m.minCrew, 11); near(m.suppliesPerMonth, 3.5); near(m.fuelPerLightYear, 0.7);
});

test('civilian expansion surcharges add before multipliers; S-mods double expansion and remove surcharge', () => {
  const f = fixture(); f.members[0].loadout = { hullId: 'buffalo', hullMods: ['expanded_cargo_holds', 'auxiliary_fuel_tanks', 'efficiency_overhaul'] };
  f.fleet.cargo.crew = 1000;
  let m = resolveOriginalFleetStats(f.fleet, f.members).members[0], h = reference.hulls.buffalo;
  near(m.suppliesPerMonth, h.suppliesPerMonth * 2 * 0.8);
  assert.equal(m.cargoCapacity, Math.trunc(h.cargoCapacity + Math.max(60, h.cargoCapacity * 0.3)));
  f.members[0].loadout.sMods = ['expanded_cargo_holds', 'auxiliary_fuel_tanks'];
  m = resolveOriginalFleetStats(f.fleet, f.members).members[0]; near(m.suppliesPerMonth, h.suppliesPerMonth * 0.8);
  assert.equal(m.cargoCapacity, Math.trunc(h.cargoCapacity + 2 * Math.max(60, h.cargoCapacity * 0.3)));
});

test('militarization removes civilian expansion surcharge and doubles minimum crew only when not S-modded', () => {
  const f = fixture(); f.members[0].loadout = { hullId: 'buffalo', hullMods: ['expanded_cargo_holds', 'militarized_subsystems'] };
  let m = resolveOriginalFleetStats(f.fleet, f.members).members[0], h = reference.hulls.buffalo;
  assert.equal(m.minCrew, h.minCrew * 2); near(m.suppliesPerMonth, h.suppliesPerMonth);
  f.members[0].loadout.sMods = ['militarized_subsystems'];
  m = resolveOriginalFleetStats(f.fleet, f.members).members[0]; assert.equal(m.minCrew, h.minCrew);
});

test('unknown hullmod, commodity, officer or unported loadout cannot silently use base statistics', () => {
  for (const mutate of [
    f => { f.members[0].loadout.hullMods = ['unknown_mod']; },
    f => { f.members[0].loadout.wings = ['some_wing']; },
    f => { f.members[0].officerId = 'officer'; },
    f => { f.fleet.cargo.unknown_goods = 1; },
  ]) { const f = fixture(); mutate(f); assert.throws(() => resolveOriginalFleetStats(f.fleet, f.members), { code: 'UNSUPPORTED_LOGISTICS' }); }
});

test('hull repair and ordered armor repair occur together; ammo is not reloaded by repair', () => {
  const f = fixture(), c = f.members[0].condition; c.armor = { cols: 2, rows: 2, fractions: [0, 0, 0, 0] };
  const stats = resolveOriginalFleetStats(f.fleet, f.members).members[0];
  const r = advanceOriginalRecovery(c, stats, 1, true);
  near(r.condition.hullFraction, 0.6); near(r.condition.combatReadiness, 0.6);
  assert.deepEqual(r.condition.armor.fractions, [0, 0, 0.4, 0]); assert.deepEqual(r.condition.ammunition, c.ammunition);
  assert.equal(c.hullFraction, 0.5); assert.deepEqual(c.armor.fractions, [0, 0, 0, 0]);
});

test('armor exactly filled at final damaged cell remains a grid until native next pass clears it', () => {
  const f = fixture(), c = f.members[0].condition; c.hullFraction = 1; c.armor = { cols: 1, rows: 1, fractions: [0] };
  const m = resolveOriginalFleetStats(f.fleet, f.members).members[0]; m.repairRatePerDay = 1;
  const first = advanceOriginalRecovery(c, m, 1, true); assert.deepEqual(first.condition.armor.fractions, [1]);
  const second = advanceOriginalRecovery(first.condition, m, 0.1, true); assert.equal(second.condition.armor, null); assert.equal(second.repairsCompleted, true);
});

test('without supplies CR loses half base recovery, regardless of recovery-speed bonuses', () => {
  const f = fixture(); f.members[0].loadout.hullMods = ['efficiency_overhaul'];
  const m = resolveOriginalFleetStats(f.fleet, f.members).members[0];
  const r = advanceOriginalRecovery(f.members[0].condition, m, 1, false);
  near(r.condition.combatReadiness, 0.45); near(r.shortageCRLoss, 0.05); assert.equal(r.condition.hullFraction, 0.5);
});

test('CR above maximum decays toward it; AI captains immediately clamp, and decay never undershoots while supplied', () => {
  const f = fixture(), m = resolveOriginalFleetStats(f.fleet, f.members).members[0]; f.members[0].condition.combatReadiness = 0.9;
  near(advanceOriginalRecovery(f.members[0].condition, m, 1, true).condition.combatReadiness, 0.85);
  near(advanceOriginalRecovery(f.members[0].condition, { ...m, aiCaptain: true }, 1, true).condition.combatReadiness, 0.7);
  near(advanceOriginalRecovery(f.members[0].condition, m, 10, true).condition.combatReadiness, 0.7);
});

test('suspended repairs still pay ordinary maintenance and do not recover hull/CR', () => {
  const f = fixture(); f.members[0].logistics = { mothballed: false, suspendRepairs: true };
  const r = simulate(f); near(r.suppliesConsumed, 5 / 30); assert.deepEqual(r.members[0].condition, f.members[0].condition);
});

test('last positive supply pays for one full native step; subsequent empty step loses CR', () => {
  const f = fixture(); f.fleet.cargo.supplies = 1e-9;
  const r = simulate(f, 2); near(r.suppliesConsumed, 1e-9);
  near(r.members[0].condition.combatReadiness, 0.5 + 0.1 / 600 - 0.05 / 600);
  near(r.members[0].condition.hullFraction, 0.5 + 0.1 / 600);
  assert.equal(r.fleet.cargo.supplies, 0); assert.equal(r.memberReports.one.losingCR, true);
});

test('one game day consumes the source quote while changing persistent-ready CR and hull', () => {
  const f = fixture(), before = structuredClone(f), r = simulate(f);
  near(r.suppliesConsumed, 5 / 30 + 5 * 0.1 / 0.2); near(r.members[0].condition.hullFraction, 0.6);
  near(r.members[0].condition.combatReadiness, 0.6); assert.deepEqual(f, before);
});

test('partitioning identical fixed ticks preserves state exactly across batch sizes', () => {
  const f = fixture(), whole = simulate(f), one = simulate(f, 203), two = simulate(one, 397);
  assert.deepEqual(two.fleet, whole.fleet); assert.deepEqual(two.members, whole.members);
  near(one.suppliesConsumed + two.suppliesConsumed, whole.suppliesConsumed);
});

test('native fuel cost uses travel distance, normal/hyperspace modifiers and burn-20 speed cap', () => {
  let r = simulate(fixture(), 600, { ...stationary, speed: 800, inHyperspace: true });
  near(r.fuelConsumed, 2);
  r = simulate(fixture(), 600, { ...stationary, speed: 200 }); near(r.fuelConsumed, 0);
  r = simulate(fixture(), 600, { ...stationary, speed: 200, normalFuelMultiplier: 0.5, hiddenFuelMultiplier: 2 }); near(r.fuelConsumed, 1);
});

test('native AI mode has crew, recovers and does not consume player resources', () => {
  const f = fixture(); f.fleet.cargo = { supplies: 0, crew: 0, fuel: 0 };
  const r = simulate(f, 600, { ...stationary, speed: 200, inHyperspace: true }, true);
  near(r.members[0].condition.combatReadiness, 0.6); near(r.members[0].condition.hullFraction, 0.6);
  assert.equal(r.suppliesConsumed, 0); assert.equal(r.fuelConsumed, 0);
});

test('authoritative advancement persists costs and condition atomically, retries once, and fences repeated time', t => {
  const s = repository(t), c = command(s, 0), r = s.execute(system, c);
  assert.deepEqual(s.execute(system, c), r);
  const w = s.read('logistics-test'); assert.equal(w.clock.tick, 60);
  assert.ok(w.fleets.fleet.cargo.supplies < 10); assert.ok(w.members.one.condition.hullFraction > 0.5);
  assert.equal(s.eventsSince(w.id, 0)[0].events[0].type, 'world.advanced');
  assert.throws(() => s.execute(system, command(s, 0, 'old-time')), { code: 'TIME_CONFLICT' });
  assert.throws(() => s.execute({ kind: 'player', id: 'a' }, command(s, 60)), { code: 'FORBIDDEN' });
  const forged = command(s, 60); forged.payload.suppliesPerMonth = 0;
  assert.throws(() => s.execute(system, forged), { code: 'INVALID_COMMAND' });
});

test('unsupported skills stop the entire world step without partial costs or clock movement', t => {
  const w=structuredClone(world());w.players.a.skills={unported:1};
  const s=repository(t,w),before=s.read(w.id);
  assert.throws(()=>s.execute(system,command(s,0)),{code:'UNSUPPORTED_LOGISTICS'});
  assert.deepEqual(s.read(w.id),before);
});

test('repair toggle is permission checked and takes effect in the next upkeep step', t => {
  const s = repository(t), c = { ...command(s, 0), type: 'logistics.set-repairs', requestId: 'pause-repairs', payload: { memberId: 'one', suspended: true } };
  assert.throws(() => s.execute({ kind: 'player', id: 'b' }, c), { code: 'FORBIDDEN' });
  s.execute({ kind: 'player', id: 'a' }, c);
  const before = s.read('logistics-test').members.one.condition;
  s.execute(system, command(s, 0, 'upkeep'));
  assert.deepEqual(s.read('logistics-test').members.one.condition, before);
});

test('real authority Worker executes native upkeep, not just the quote RPC', async () => {
  const service = new CampaignService({ filename: ':memory:' });
  try {
    const ready = await service.ready(); await service.create(world());
    await service.execute(system, { worldId: 'logistics-test', epoch: ready.epoch, requestId: 'worker-step', type: 'world.advance',
      payload: { fromTick: 0, ticks: 600 }, expected: [{ collection: 'fleets', id: 'fleet', version: 0 }, { collection: 'members', id: 'one', version: 0 }] });
    const w = await service.read('logistics-test'); near(w.members.one.condition.combatReadiness, 0.6); near(w.fleets.fleet.cargo.supplies, 10 - 5 / 30 - 2.5);
  } finally { await service.close(); }
});

test('a stat-provider replacement can implement skills without changing the logistics command or kernel', t => {
  const replacement = { id: 'test.skill-stats', service: 'fleetStats', version: '1', apiVersion: 1, capabilities: ['effective-logistics-stats', 'effective-travel-stats'],
    methods: { resolve: (fleet, members, options) => {
      // Test-only overhaul deliberately changes maintenance; it is never selected by reference.cooperative.
      const result = resolveOriginalFleetStats(fleet, members);
      if (options.world.players.a.skills.test_perk === 1) result.members.forEach(m => { m.suppliesPerMonth *= 0.5; });
      return result;
    } } };
  const custom = new CampaignRuleRegistry().register(originalOrbitsProvider).register(replacement).register(originalLogisticsProvider).register(cooperativeSimulationProvider).register(originalTravelProvider).register(encounterLifecycleProvider).compile({
    id: 'test.skill-overhaul', version: '1', providers: { spaceMotion: originalOrbitsProvider.id, travel: originalTravelProvider.id, fleetStats: replacement.id, logistics: originalLogisticsProvider.id, simulation: cooperativeSimulationProvider.id, encounters: encounterLifecycleProvider.id }, settings: structuredClone(rules.lock.settings),
  });
  const w = structuredClone(world()); w.rules = custom.lock; w.players.a.skills = { test_perk: 1 };
  w.members.one.logistics = { mothballed: false, suspendRepairs: true };
  const s = new CampaignRepository(':memory:', custom); t.after(() => s.close()); s.create(w);
  const r = s.execute(system, command(s, 0, 'custom-advance', 600));
  near(r.result.fleets.fleet.suppliesConsumed, 2.5 / 30);
});

test('simulation bounds and invalid member flags are rejected rather than creating nonfinite state', () => {
  assert.throws(() => simulate(fixture(), 601), { code: 'SIMULATION_LIMIT' });
  assert.throws(() => simulate(fixture(), -1));
  assert.throws(() => simulate(fixture(), 1, { ...stationary, speed: Infinity }));
  const w = structuredClone(world()); w.members.one.logistics = { mothballed: 'yes', suspendRepairs: false };
  assert.throws(() => validateCampaignWorld(w), { code: 'INVALID_WORLD' });
});

test('native weapon slot IDs containing spaces survive validated upkeep without ammo loss', t => {
  const w = structuredClone(world()); w.members.one.condition.ammunition = { 'WS 001': 2, 'WS 002': null };
  const s = repository(t, w); s.execute(system, command(s, 0));
  assert.deepEqual(s.read(w.id).members.one.condition.ammunition, { 'WS 001': 2, 'WS 002': null });
  const invalid = structuredClone(w); invalid.members.one.condition.ammunition = { 'bad\nslot': 2 };
  assert.throws(() => validateCampaignWorld(invalid), { code: 'INVALID_SLOT_ID' });
});
