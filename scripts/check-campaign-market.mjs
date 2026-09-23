/** Targeted native-market tests. Fixtures are resolved test markets, NOT a generated original economy. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { CampaignRuleRegistry } from '../src/campaign/core/RuleRegistry.mjs';
import { createCampaignWorld, validateCampaignWorld } from '../src/campaign/core/WorldState.mjs';
import { planCampaignCommand } from '../src/campaign/core/Kernel.mjs';
import { CampaignRepository } from '../server/campaign/Repository.mjs';
import { originalMarketProvider, originalMarketStateId, quoteOriginalMarketTrade, validateOriginalMarketState, validateOriginalMarketWorld } from '../src/campaign/rules/OriginalMarket.mjs';
import { ORIGINAL_MARKET_REFERENCE as reference, quoteOriginalCommodityTrade, originalMarketStockpileUtility, originalTradeStockpileContribution } from '../src/campaign/rules/OriginalMarketPricing.mjs';
import { originalFleetRadius } from '../src/campaign/rules/OriginalTransitions.mjs';
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rules = new CampaignRuleRegistry().register(originalMarketProvider).compile({ id: 'market-test', version: '1', providers: { market: originalMarketProvider.id } });
const bonus = () => ({ flat: 0, percent: 0, mult: 1 });
const thresholds = () => ({ highThreshold: -1, highMult: 1, lowThreshold: -1, lowMult: 1 });
const commodity = (id = 'supplies', values = {}) => ({ stockpile: 1000, demandValue: 750, greed: 250,
  utilityOnMarket: reference.commodities[id].utility, availableWithoutTrade: 5, tradeMod: { both: 0, plus: 0, minus: 0 },
  supplyPrice: thresholds(), demandPrice: thresholds(), playerSupplyModsByPlayer: { a: bonus(), b: bonus() }, playerDemandModsByPlayer: { a: bonus(), b: bonus() }, ...values });
function fixture() {
  const w = structuredClone(createCampaignWorld({ id: 'market-fixture', rules: rules.lock, contentFingerprint: 'test-market-resolved-data-v1' }));
  w.locations.port = { id: 'port', version: 0, name: 'Test-only port' }; w.locations.other = { id: 'other', version: 0, name: 'Other system' };
  w.factions.merchant = { id: 'merchant', version: 0, name: 'Test merchant', playerRoles: {} };
  w.markets.port = { id: 'port', version: 0, owner: { kind: 'faction', id: 'merchant' }, locationId: 'port' };
  w.spaceEntities.station = { id: 'station', version: 0, name: 'Physical market anchor', locationId: 'port', position: [100, 100], radius: 50, tags: [] };
  for (const id of ['a', 'b']) {
    w.players[id] = { id, version: 0, name: id, factionId: null };
    w.fleets[id] = { id, version: 0, owner: { kind: 'player', id }, control: { kind: 'player', id }, locationId: 'port',
      position: [130, 100], cargo: { supplies: 100 }, memberIds: [id], partyId: null, encounterId: null };
    w.members[id] = { id, version: 0, fleetId: id, owner: { kind: 'player', id }, loadout: { hullId: 'wolf' },
      condition: { status: 'ready', hullFraction: 1, combatReadiness: 0.7, armor: null, ammunition: {} } };
    w.accounts[id] = { id, version: 0, owner: { kind: 'player', id }, currency: 'credits', balance: 1000000 };
  }
  const id = originalMarketStateId('port');
  w.extensions[id] = { id, version: 0, schemaVersion: 1, data: { marketId: 'port', anchorEntityId: 'station', asOfTick: 0,
    coverage: 'resolved-native-trade-v1', tariffRate: 0.3, admissionByPlayer: { a: 'OPEN', b: 'OPEN' }, illegalCommodityIds: [],
    commodityOrder: ['supplies'], commodities: { supplies: commodity() }, marketSupplyMod: bonus(), marketDemandMod: bonus(),
    submarkets: { open: { plugin: 'open', inventory: { supplies: 1000 } }, black: { plugin: 'black', inventory: { supplies: 500 } } }, tradeImpacts: [] } };
  return w;
}
const state = w => w.extensions[originalMarketStateId('port')].data;
const actor = id => ({ kind: 'player', id });
const request = (values = {}) => ({ marketId: 'port', submarketId: 'open', fleetId: 'a', accountId: 'a', commodityId: 'supplies', quantity: 10, side: 'buy', ...values });
const quote = (w, values = {}, who = 'a') => quoteOriginalMarketTrade(w, actor(who), request(values));
function command(w, values = {}, requestId = 'trade', epoch = 'test-epoch', who = 'a') {
  const input = request(values), q = quote(w, values, who), { side, ...payload } = input;
  return { worldId: w.id, epoch, type: 'market.' + side, requestId, payload, expected: q.expected };
}
function memory(t, w = fixture()) { const store = new CampaignRepository(':memory:', rules, { epoch: 'test-epoch' }); t.after(() => store.close()); store.create(w); return store; }
function temporary(t, close = () => {}) {
  const directory = mkdtempSync(join(tmpdir(), 'campaign-market-'));
  t.after(() => { close(); for (const name of readdirSync(directory)) { const p = resolve(directory, name); assert.ok(p.startsWith(resolve(directory) + '\\') || p.startsWith(resolve(directory) + '/')); unlinkSync(p); } rmdirSync(directory); });
  return directory;
}
function rejectsUnchanged(t, mutate, code, values = {}, who = 'a') {
  const w = fixture(), c = command(w, values, 'rejected', 'test-epoch', who); mutate(w, c); const store = memory(t, w), before = store.read(w.id);
  assert.throws(() => store.execute(actor(who), c), { code }); assert.deepEqual(store.read(w.id), before); assert.deepEqual(store.eventsSince(w.id, 0), []);
}
const pure = (values = {}) => ({ commodityId: 'supplies', side: 'buy', quantity: 10, submarketKind: 'open', tariffRate: 0.3,
  stockpileUtility: 1000, demandValue: 750, greed: 250, utilityOnMarket: 1, thresholds: thresholds(), marketMod: bonus(), playerMod: bonus(), ...values });

test('reference import is reproducible and all 18 native evidence hashes still match', () => {
  const result = spawnSync(process.execPath, ['scripts/import-campaign-market-reference.mjs', '--check'], { cwd: project, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr); assert.equal(Object.keys(reference.commodities).length, 33);
  assert.equal(reference.commodities.supplies.basePrice, 100); assert.equal(reference.commodities.fuel.basePrice, 25);
  assert.equal(reference.commodities.alpha_core.basePrice, 150000); assert.equal(reference.commodities.survey_data_5.basePrice, 30000);
  assert.equal(reference.settings.tradeImpactDays, 120); assert.equal(reference.settings.economyMinDemandForPricing, 100);
});
test('pure pricing uses the whole integral, not unit quote multiplied by quantity', () => {
  const bulk = quoteOriginalCommodityTrade(pure({ quantity: 500 })), single = quoteOriginalCommodityTrade(pure({ quantity: 1 }));
  assert.notEqual(bulk.gross, single.gross * 500); assert.ok(bulk.gross > single.gross * 500);
  const sell = quoteOriginalCommodityTrade(pure({ quantity: 500, side: 'sell' })); assert.ok(sell.gross < bulk.gross);
});
test('native resource V0 bypasses market modifiers; tariff rounds once with Math.round', () => {
  const q = quoteOriginalCommodityTrade(pure({ commodityId: 'survey_data_1', quantity: 1, marketMod: { flat: 123, mult: 9, percent: 70 }, tariffRate: 0.0005 }));
  assert.equal(q.gross, 1000); assert.equal(q.tariff, 1); assert.equal(q.creditsDelta, -1001);
  const black = quoteOriginalCommodityTrade(pure({ submarketKind: 'black' })); assert.equal(black.tariff, 0);
});
test('demand and supply reproduce native player-modifier asymmetry', () => {
  const plainBuy = quoteOriginalCommodityTrade(pure()), modBuy = quoteOriginalCommodityTrade(pure({ marketMod: { flat: 10, percent: 20, mult: 2 } }));
  assert.equal(plainBuy.gross, modBuy.gross);
  const plainSell = quoteOriginalCommodityTrade(pure({ side: 'sell' })), modSell = quoteOriginalCommodityTrade(pure({ side: 'sell', marketMod: { flat: 10, percent: 20, mult: 2 } }));
  assert.ok(modSell.gross > plainSell.gross * 2);
});
test('deficit/excess thresholds split an integral, negative stockpile clamps, dynamic price floors at one credit/unit', () => {
  const t = { highThreshold: 900, highMult: 1.25, lowThreshold: 1100, lowMult: 0.85 };
  assert.ok(quoteOriginalCommodityTrade(pure({ quantity: 500, thresholds: t })).gross > quoteOriginalCommodityTrade(pure({ quantity: 500 })).gross);
  assert.deepEqual(quoteOriginalCommodityTrade(pure({ stockpileUtility: -100 })), quoteOriginalCommodityTrade(pure({ stockpileUtility: 0 })));
  assert.equal(quoteOriginalCommodityTrade(pure({ side: 'sell', quantity: 21, playerMod: { flat: -9999, percent: 0, mult: 1 } })).gross, 21);
});
test('pricing rejects zero/fractional/negative/NaN/Infinity/huge quantities and unsupported items', () => {
  for (const quantity of [0, -1, 0.1, NaN, Infinity, 2 ** 25]) assert.throws(() => quoteOriginalCommodityTrade(pure({ quantity })));
  for (const commodityId of ['not-a-commodity', 'credits', 'ships', 'blueprints']) assert.throws(() => quoteOriginalCommodityTrade(pure({ commodityId })), { code: 'UNSUPPORTED_COMMODITY' });
  for (const values of [{ tariffRate: NaN }, { greed: Infinity }, { stockpileUtility: Infinity }, { demandValue: -1 }, { thresholds: { ...thresholds(), future: true } }]) assert.throws(() => quoteOriginalCommodityTrade(pure(values)));
});
test('quote is immutable/read-only, uses anchor contact and includes every dependency version', () => {
  const w = validateCampaignWorld(fixture()), before = structuredClone(w), q = quote(w);
  assert.equal(q.executable, true); assert.equal(q.distance, 30); assert.equal(q.asOfTick, 0); assert.equal(q.available, 1000);
  assert.deepEqual(q.expected.map(e => e.collection + '/' + e.id), ['players/a', 'fleets/a', 'accounts/a', 'markets/port', 'extensions/reference.market:port', 'spaceEntities/station', 'members/a', 'factions/merchant']);
  assert.deepEqual(w, before); assert.equal(Object.isFrozen(q), true);
});
test('buy settles retail inventory + cargo + credits + native impact + receipt + outbox atomically', t => {
  const store = memory(t), before = store.read('market-fixture'), q = quote(before), c = command(before), receipt = store.execute(actor('a'), c), after = store.read(before.id);
  assert.equal(after.fleets.a.cargo.supplies, 110); assert.equal(state(after).submarkets.open.inventory.supplies, 990);
  assert.equal(after.accounts.a.balance, before.accounts.a.balance + q.creditsDelta);
  assert.equal(state(after).commodities.supplies.stockpile, 1000); assert.equal(state(after).commodities.supplies.tradeMod.plus, -10);
  assert.equal(state(after).tradeImpacts[0].expiresAtGameSeconds, 1200);
  for (const row of [after.fleets.a, after.accounts.a, after.markets.port, after.extensions[originalMarketStateId('port')]]) assert.equal(row.version, 1);
  assert.deepEqual(after.fleets.b, before.fleets.b); assert.deepEqual(after.accounts.b, before.accounts.b);
  assert.equal(receipt.result.creditsDelta, q.creditsDelta); assert.equal(store.eventsSince(after.id, 0)[0].events[0].type, 'market.trade-settled');
});
test('sell credits net of tariff, preserves fractional remaining cargo, and never erases another commodity', t => {
  const w = fixture(); w.fleets.a.cargo = { supplies: 100.25, fuel: 11.5 };
  const store = memory(t, w), q = quote(w, { side: 'sell', quantity: 100 }); store.execute(actor('a'), command(w, { side: 'sell', quantity: 100 }));
  const after = store.read(w.id); assert.equal(after.fleets.a.cargo.supplies, 0.25); assert.equal(after.fleets.a.cargo.fuel, 11.5);
  assert.equal(after.accounts.a.balance, w.accounts.a.balance + q.gross - q.tariff); assert.equal(state(after).submarkets.open.inventory.supplies, 1100);
  assert.equal(state(after).commodities.supplies.tradeMod.plus, 100);
});
test('subsequent same-tick quote includes original trade-mod stockpile impact, not retail stockpile substitution', t => {
  const store = memory(t), w = store.read('market-fixture'), before = quote(w);
  store.execute(actor('a'), command(w, { quantity: 100 }, 'buy100'));
  const after = store.read(w.id); assert.ok(quote(after).gross > before.gross);
  assert.equal(originalMarketStockpileUtility(state(after).commodityOrder, state(after).commodities, 'supplies'), 900);
  const sellQuote = quote(after, { side: 'sell', quantity: 100 }); store.execute(actor('a'), command(after, { side: 'sell', quantity: 100 }, 'sell100'));
  assert.ok(sellQuote.creditsDelta > 0); assert.equal(state(store.read(w.id)).commodities.supplies.tradeMod.plus, 0);
});
test('sell-only impact converts availability units; negative plus affects pricing but not availability', () => {
  const spec = reference.commodities.supplies;
  assert.equal(originalTradeStockpileContribution(commodity('supplies', { tradeMod: { both: 0, plus: 900, minus: 0 } }), spec), 150);
  assert.equal(originalTradeStockpileContribution(commodity('supplies', { tradeMod: { both: 0, plus: -900, minus: 0 } }), spec), -900);
  assert.equal(originalTradeStockpileContribution(commodity('supplies', { tradeMod: { both: -4500, plus: 0, minus: 0 } }), spec), -750);
});
test('same request replay charges once; changed payload with reused request is rejected', t => {
  const store = memory(t), w = store.read('market-fixture'), c = command(w), first = store.execute(actor('a'), c), after = store.read(w.id);
  assert.deepEqual(store.execute(actor('a'), { ...c, epoch: 'obsolete' }), first); assert.deepEqual(store.read(w.id), after);
  assert.throws(() => store.execute(actor('a'), { ...c, payload: { ...c.payload, quantity: 11 } }), { code: 'REQUEST_REUSED' });
});
test('file-backed replay survives reopen and authority fencing without duplicate inventory movement', t => {
  let first, next; const file = join(temporary(t, () => { next?.close(); first?.close(); }), 'market.sqlite'); first = new CampaignRepository(file, rules, { epoch: 'first' });
  const w = fixture(); first.create(w); const c = command(w, {}, 'replay', 'first'), receipt = first.execute(actor('a'), c);
  next = new CampaignRepository(file, rules, { epoch: 'second' });
  assert.throws(() => first.read(w.id), { code: 'AUTHORITY_REPLACED' }); assert.deepEqual(next.execute(actor('a'), c), receipt);
  assert.equal(next.read(w.id).fleets.a.cargo.supplies, 110); assert.equal(next.eventsSince(w.id, 0).length, 1);
});
test('SQLite outbox failure rolls back inventory, fleet, credit, versions AND receipt; retry executes once', t => {
  let store, db; const file = join(temporary(t, () => { db?.close(); store?.close(); }), 'rollback.sqlite'); store = new CampaignRepository(file, rules, { epoch: 'test-epoch' });
  const w = fixture(); store.create(w); const c = command(w); db = new DatabaseSync(file);
  db.exec("CREATE TRIGGER fail_outbox BEFORE INSERT ON outbox BEGIN SELECT RAISE(ABORT, 'market-test-outbox-failure'); END;");
  assert.throws(() => store.execute(actor('a'), c), /market-test-outbox-failure/); assert.deepEqual(store.read(w.id), validateCampaignWorld(w));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM receipts').get().n, 0); assert.equal(db.prepare('SELECT COUNT(*) AS n FROM outbox').get().n, 0);
  db.exec('DROP TRIGGER fail_outbox'); assert.equal(store.execute(actor('a'), c).revision, 1); assert.equal(store.read(w.id).fleets.a.cargo.supplies, 110);
});
test('optimistic dependencies reject every omitted or stale version without any write', t => {
  const store = memory(t), w = store.read('market-fixture'), c = command(w);
  for (const entry of c.expected) {
    assert.throws(() => store.execute(actor('a'), { ...c, expected: c.expected.filter(e => e !== entry) }), { code: 'VERSION_REQUIRED' });
    assert.throws(() => store.execute(actor('a'), { ...c, expected: c.expected.map(e => e === entry ? { ...e, version: e.version + 1 } : e) }), { code: 'VERSION_CONFLICT' });
  }
  assert.deepEqual(store.read(w.id), w);
});
test('two-player competing quotes serialize on shared market inventory; fresh retry does not oversell', t => {
  const w = fixture(); state(w).submarkets.open.inventory.supplies = 10;
  const store = memory(t, w), a = command(w, {}, 'a'), b = command(w, { fleetId: 'b', accountId: 'b' }, 'b', 'test-epoch', 'b');
  store.execute(actor('a'), a); assert.throws(() => store.execute(actor('b'), b), { code: 'VERSION_CONFLICT' });
  assert.throws(() => quote(store.read(w.id), { fleetId: 'b', accountId: 'b' }, 'b'), { code: 'INSUFFICIENT_STOCK' });
  assert.equal(store.read(w.id).fleets.b.cargo.supplies, 100);
});
test('same system is NOT docking; exact radius boundary and another location reject', t => {
  rejectsUnchanged(t, w => { w.fleets.a.position = [1000, 100]; }, 'MARKET_OUT_OF_REACH');
  rejectsUnchanged(t, w => { w.fleets.a.position = [100 + 50 + originalFleetRadius([w.members.a]), 100]; }, 'MARKET_OUT_OF_REACH');
  rejectsUnchanged(t, w => { w.fleets.a.locationId = 'other'; }, 'WRONG_LOCATION');
  const w = fixture(); w.fleets.a.position = [100 + 50 + originalFleetRadius([w.members.a]) - 0.001, 100]; assert.equal(quote(w).executable, true);
});
test('foreign controller, foreign account, wrong currency and non-player principal reject', t => {
  rejectsUnchanged(t, w => { w.fleets.a.control.id = 'b'; }, 'FORBIDDEN');
  rejectsUnchanged(t, (_w, c) => { c.payload.accountId = 'b'; }, 'FORBIDDEN');
  rejectsUnchanged(t, w => { w.accounts.a.currency = 'tokens'; }, 'UNSUPPORTED_CURRENCY');
  const store = memory(t), w = store.read('market-fixture'); assert.throws(() => store.execute({ kind: 'system', id: 'host' }, command(w)), { code: 'FORBIDDEN' });
});
test('faction-controlled fleet and treasury require leader/manager and version both authorization records', t => {
  const w = fixture(); w.factions.guild = { id: 'guild', version: 0, name: 'Guild', playerRoles: { a: 'manager', b: 'member' } };
  w.fleets.a.owner = { kind: 'faction', id: 'guild' }; w.fleets.a.control = { kind: 'faction', id: 'guild' }; w.accounts.a.owner = { kind: 'faction', id: 'guild' };
  const q = quote(w); assert.ok(q.expected.some(e => e.collection === 'factions' && e.id === 'guild'));
  assert.throws(() => quote(w, {}, 'b'), { code: 'FORBIDDEN' });
  const store = memory(t, w); assert.equal(store.execute(actor('a'), command(w)).revision, 1);
});
test('encounter lock and jump transition reject trading independently of range', t => {
  rejectsUnchanged(t, w => { w.encounters.e = { id: 'e', version: 0, fleetIds: ['a'], battleAttempt: 1, status: 'forming' }; w.fleets.a.encounterId = 'e'; }, 'ASSET_LOCKED');
  // Direct provider quote isolates the transition guard; an invalid persisted jump is separately rejected by WorldState.
  const w = fixture(); w.fleets.a.navigation = { transition: {} }; assert.throws(() => quote(w), { code: 'IN_TRANSITION' });
});
test('current native port admission, legality and economics are mandatory, including stale tick refusal', t => {
  rejectsUnchanged(t, w => { state(w).admissionByPlayer.a = 'SNEAK'; }, 'MARKET_ACCESS_DENIED');
  rejectsUnchanged(t, w => { delete state(w).admissionByPlayer.a; }, 'MARKET_ACCESS_DENIED');
  rejectsUnchanged(t, w => { state(w).illegalCommodityIds = ['supplies']; }, 'ILLEGAL_COMMODITY');
  rejectsUnchanged(t, w => { w.clock.tick = 1; w.clock.gameSeconds = 1 / 60; }, 'MARKET_SNAPSHOT_STALE');
  rejectsUnchanged(t, w => { delete w.extensions[originalMarketStateId('port')]; }, 'VERSION_CONFLICT');
});
test('insufficient stock/cargo/credit reject instead of clamping quantity or going into debt', t => {
  rejectsUnchanged(t, w => { state(w).submarkets.open.inventory.supplies = 9; }, 'INSUFFICIENT_STOCK');
  rejectsUnchanged(t, w => { w.fleets.a.cargo.supplies = 9; }, 'INSUFFICIENT_CARGO', { side: 'sell' });
  rejectsUnchanged(t, w => { w.accounts.a.balance = 1; }, 'INSUFFICIENT_CREDITS');
});
test('forged price/tariff/stock/position and non-finite command values are rejected by strict boundaries', t => {
  for (const key of ['price', 'tariff', 'inventory', 'position', 'side']) rejectsUnchanged(t, (_w, c) => { c.payload[key] = 0; }, 'UNSUPPORTED_MARKET_STATE');
  for (const quantity of [NaN, Infinity, -Infinity]) rejectsUnchanged(t, (_w, c) => { c.payload.quantity = quantity; }, 'INVALID_NUMBER');
  for (const quantity of [0, -1, 0.5]) { const store = memory(t), w = store.read('market-fixture'), c = command(w); c.payload.quantity = quantity; assert.throws(() => store.execute(actor('a'), c)); assert.equal(store.read(w.id).revision, 0); }
});
test('missing anchor / cross-system anchor / jump point masquerading as port fail closed', () => {
  for (const change of [w => { state(w).anchorEntityId = 'missing'; }, w => { w.spaceEntities.station.locationId = 'other'; }, w => { w.spaceEntities.station.jump = { anchor: null, destinations: [] }; }]) {
    const w = fixture(); change(w); assert.throws(() => quote(w), { code: 'MARKET_ANCHOR_INVALID' });
  }
});
test('unknown state versions, silent modifiers, partial demand classes and custom submarkets are not approximated', () => {
  for (const change of [w => { state(w).coverage = 'fake-fixed-economy'; }, w => { state(w).futurePricing = 1; }, w => { state(w).commodities.supplies.stockpile = NaN; },
    w => { state(w).submarkets.open.plugin = 'military'; }, w => { w.extensions[originalMarketStateId('port')].schemaVersion = 2; },
    w => { state(w).commodityOrder.push('luxury_goods'); state(w).commodities.luxury_goods = commodity('luxury_goods'); }]) {
    const w = fixture(); change(w); assert.throws(() => validateOriginalMarketState(w, 'port'));
  }
});
test('black-market quote has zero tariff, but no command bypasses missing customs/reputation consequences', t => {
  const w = fixture(); state(w).admissionByPlayer.a = 'SNEAK'; state(w).illegalCommodityIds = ['supplies'];
  const q = quote(w, { submarketId: 'black' }); assert.equal(q.tariff, 0); assert.equal(q.executable, false); assert.equal(q.unavailableReason, 'BLACK_MARKET_CONSEQUENCES_UNIMPLEMENTED');
  const store = memory(t, w); assert.throws(() => store.execute(actor('a'), command(w, { submarketId: 'black' })), { code: 'UNSUPPORTED_MARKET_TRANSACTION' }); assert.equal(store.read(w.id).revision, 0);
});
test('market provider is replaceable through RuleRegistry without mutating kernel contracts', () => {
  const replacement = { ...originalMarketProvider, id: 'overhaul.market', version: '1', methods: { quote: () => ({ custom: true }) }, commands: {} };
  const compiled = new CampaignRuleRegistry().register(originalMarketProvider).register(replacement).compile({ id: 'overhaul-test', version: '1', providers: { market: replacement.id } });
  assert.deepEqual(compiled.services.market.quote(), { custom: true }); assert.equal(compiled.handler('market.buy'), undefined); assert.equal(compiled.acceptsLock(rules.lock), false);
});
test('planning never mutates the source world and changes only provider-owned market extension', () => {
  const w = validateCampaignWorld(fixture()), before = structuredClone(w), plan = planCampaignCommand(w, command(w), actor('a'), rules);
  assert.deepEqual(w, before); assert.equal(plan.world.revision, 1); assert.equal(plan.world.extensions[originalMarketStateId('port')].version, 1);
});


test('authority publishes initial native snapshot, then player buys through one repository without core schema changes', t => {
  const w = fixture(), data = structuredClone(state(w)); delete w.extensions[originalMarketStateId('port')];
  const store = memory(t, w), expected = [['markets', 'port'], ['spaceEntities', 'station'], ['factions', 'merchant'], ['players', 'a'], ['players', 'b']].map(([collection, id]) => ({ collection, id, version: w[collection][id].version }));
  const c = { worldId: w.id, epoch: store.epoch, requestId: 'publish', type: 'market.publish-snapshot', payload: { marketId: 'port', data }, expected };
  assert.throws(() => store.execute(actor('a'), c), { code: 'FORBIDDEN' }); assert.equal(store.read(w.id).revision, 0);
  const published = store.execute({ kind: 'system', id: 'native-economy-adapter' }, c); assert.equal(published.revision, 1);
  const ready = store.read(w.id); assert.equal(quote(ready).executable, true);
  assert.equal(store.execute(actor('a'), command(ready, {}, 'post-publish')).revision, 2);
  assert.equal(store.read(w.id).fleets.a.cargo.supplies, 110);
  assert.deepEqual(store.execute({ kind: 'system', id: 'native-economy-adapter' }, c), published);
});
test('snapshot refresh requires the previous extension version and cannot overwrite intervening player transactions', t => {
  const w = fixture(), store = memory(t, w), data = structuredClone(state(w));
  const c = { worldId: w.id, epoch: store.epoch, requestId: 'refresh', type: 'market.publish-snapshot', payload: { marketId: 'port', data },
    expected: [['markets','port'], ['extensions',originalMarketStateId('port')], ['spaceEntities','station'], ['factions','merchant'], ['players','a'], ['players','b']].map(([collection,id]) => ({collection,id,version:w[collection][id].version})) };
  assert.throws(() => store.execute({kind:'system',id:'economy'}, {...c, expected:c.expected.filter(e=>e.collection!=='extensions')}), {code:'VERSION_REQUIRED'});
  store.execute(actor('a'), command(w));
  assert.throws(() => store.execute({kind:'system',id:'economy'}, c), {code:'VERSION_CONFLICT'});
  assert.equal(state(store.read(w.id)).submarkets.open.inventory.supplies,990);
});
test('native V0 resource buy/sell creates retail inventory and does not clamp overloaded cargo', t => {
  const w = fixture(), d = state(w); d.commodityOrder.push('survey_data_1'); d.commodities.survey_data_1 = commodity('survey_data_1'); w.fleets.a.cargo.survey_data_1 = 500;
  const store=memory(t,w); store.execute(actor('a'),command(w,{commodityId:'survey_data_1',side:'sell',quantity:400},'sell-data'));
  const after=store.read(w.id); assert.equal(state(after).submarkets.open.inventory.survey_data_1,400);
  store.execute(actor('a'),command(after,{commodityId:'survey_data_1',quantity:400},'buy-data'));
  assert.equal(store.read(w.id).fleets.a.cargo.survey_data_1,500);
});
test('complete alternative-commodity class contributes to pricing; exotic transaction remains explicitly unavailable', t => {
  const w = fixture(), d=state(w); for(const id of ['luxury_goods','lobster']){d.commodityOrder.push(id); d.commodities[id]=commodity(id); d.submarkets.open.inventory[id]=100;}
  d.commodities.lobster.utilityOnMarket=2;
  assert.equal(originalMarketStockpileUtility(d.commodityOrder,d.commodities,'luxury_goods'),3000);
  const q=quote(w,{commodityId:'lobster'}); assert.equal(q.unavailableReason,'EXOTIC_TRADE_UNIMPLEMENTED');
  const store=memory(t,w); assert.throws(()=>store.execute(actor('a'),command(w,{commodityId:'lobster'})),{code:'UNSUPPORTED_MARKET_TRANSACTION'});
});

// Independent Java oracle: compile the actual inspected methods, not a second JS transcription.
function method(source, signature) {
  const start = source.indexOf(signature); assert.ok(start >= 0, signature); let at = source.indexOf('{', start), depth = 1;
  for (let i = at + 1; i < source.length; i++) { if (source[i] === '{') depth++; if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1); }
  throw Error('Unclosed native method ' + signature);
}
test('Java native-source oracle agrees on 320 integral/threshold/modifier/tariff vectors', t => {
  const directory = temporary(t), base = resolve(project, '../decompiled');
  const read = relative => { const text = readFileSync(join(base, relative), 'utf8'); assert.equal(createHash('sha256').update(text).digest('hex'), reference.provenance.sources[relative].sha256); return text; };
  const calculator = read('starfarer_obf/com/fs/starfarer/campaign/econ/PriceCalculator.java').replace(/^package .*;$/gm, '').replace(/^import .*;$/gm, '').replace('public class PriceCalculator', 'class PriceCalculator').replace('implements DoNotObfuscate', '');
  const variability = read('starfarer.api/com/fs/starfarer/api/campaign/econ/PriceVariability.java').replace(/^package .*;$/gm, '').replace('public enum PriceVariability', 'enum PriceVariability');
  const market = read('starfarer_obf/com/fs/starfarer/campaign/econ/Market.java');
  const stat = read('starfarer.api/com/fs/starfarer/api/combat/StatBonus.java');
  const java = `import java.util.*;
${calculator}\n${variability}
class Economy { static int MIN_DEMAND_FOR_PRICING=${reference.settings.economyMinDemandForPricing}; static int MIN_STOCKPILE_FOR_PRICING=${reference.settings.economyMinStockpileForPricing}; }
class StatBonus { float flatBonus,percentMod,mult; boolean needsRecompute=false; void recompute(){} StatBonus(float a,float b,float c){flatBonus=a;percentMod=b;mult=c;} ${method(stat, 'public float computeEffective(float baseValue)')} }
class Spec { float price; PriceVariability variability; float getBasePrice(){return price;} PriceVariability getPriceVariability(){return variability;} }
class CommodityOnMarket { Spec spec=new Spec(); float utility; PriceCalculator supply=new PriceCalculator(),demand=new PriceCalculator(); StatBonus player;
 Spec getCommodity(){return spec;} float getUtilityOnMarket(){return utility;} PriceCalculator getDemandPrice(){return demand;} PriceCalculator getSupplyPrice(){return supply;}
 StatBonus getPlayerDemandPriceMod(){return player;} StatBonus getPlayerSupplyPriceMod(){return player;} }
class Market { StatBonus demandPriceMod,supplyPriceMod;
${method(market, 'public float getDemandPriceAssumingStockpileUtility(')}
${method(market, 'public float getSupplyPriceAssumingStockpileUtility(')} }
public class Oracle { public static void main(String[] args) { Scanner scan=new Scanner(System.in); while(scan.hasNextLine()) { String[] s=scan.nextLine().split(","); float[] p=new float[s.length]; for(int i=0;i<p.length;i++)p[i]=Float.parseFloat(s[i]);
CommodityOnMarket c=new CommodityOnMarket(); c.spec.price=p[1];c.spec.variability=PriceVariability.values()[(int)p[5]];c.utility=p[2]; c.player=new StatBonus(p[15],p[16],p[17]);
for(PriceCalculator pc: new PriceCalculator[]{c.demand,c.supply}) {pc.setBasePrice(p[0]);pc.setDemand(pc==c.supply?p[3]+p[4]:p[3]);pc.setVariability(c.spec.variability);pc.setHighPriceThreshold(p[9]);pc.setHighPriceMult(p[10]);pc.setLowPriceThreshold(p[11]);pc.setLowPriceMult(p[12]);}
Market m=new Market();m.demandPriceMod=m.supplyPriceMod=new StatBonus(p[18],p[19],p[20]);float gross=p[8]==0?m.getSupplyPriceAssumingStockpileUtility(c,p[6],p[7],true):m.getDemandPriceAssumingStockpileUtility(c,p[6],p[7],true);
float tax=Math.round(p[13]*Math.abs(gross));float signed=p[8]==0?-gross:gross; signed=signed>0?(float)Math.floor(signed):(float)Math.ceil(signed);System.out.println((int)gross+","+(int)tax+","+(int)(signed-tax)); } } }`;
  writeFileSync(join(directory, 'Oracle.java'), java);
  const compile = spawnSync('javac', ['-encoding', 'UTF-8', '-d', directory, join(directory, 'Oracle.java')], { encoding: 'utf8', windowsHide: true, timeout: 30000 }); assert.equal(compile.status, 0, compile.stderr);
  const vectors = Array.from({ length: 320 }, (_, i) => pure({ commodityId: i % 7 === 0 ? 'survey_data_1' : i % 5 === 0 ? 'fuel' : 'supplies', side: i % 2 ? 'sell' : 'buy',
    quantity: 1 + (i * 7 % 90), stockpileUtility: -10 + (i * 317 % 2300), demandValue: (i * 173 % 2800), greed: (i * 11 % 500), tariffRate: [0, 0.05, 0.3, 0.5][i % 4],
    thresholds: { highThreshold: i % 3 ? 950 : -1, highMult: 1.25, lowThreshold: i % 4 ? 1250 : -1, lowMult: 0.85 },
    playerMod: { flat: i % 3, percent: i % 9, mult: [0.5, 1, 1.1][i % 3] }, marketMod: { flat: i % 8, percent: i % 20, mult: i % 2 ? 1.5 : 1 } }));
  const input = vectors.map(v => { const s = reference.commodities[v.commodityId], b = reference.commodities[s.demandClass]; return [Math.fround(b.basePrice / b.utility), s.basePrice, v.utilityOnMarket, v.demandValue, v.greed, Number(s.variability.slice(1)),
    v.stockpileUtility, v.quantity, v.side === 'buy' ? 0 : 1, v.thresholds.highThreshold, v.thresholds.highMult, v.thresholds.lowThreshold, v.thresholds.lowMult, v.tariffRate, 0,
    v.playerMod.flat, v.playerMod.percent, v.playerMod.mult, v.marketMod.flat, v.marketMod.percent, v.marketMod.mult].join(','); }).join('\n') + '\n';
  const run = spawnSync('java', ['-cp', directory, 'Oracle'], { encoding: 'utf8', windowsHide: true, input, timeout: 30000 }); assert.equal(run.status, 0, run.stderr);
  const lines = run.stdout.trim().split(/\r?\n/); assert.equal(lines.length, vectors.length);
  for (const [i, v] of vectors.entries()) { const q = quoteOriginalCommodityTrade(v); assert.deepEqual([q.gross, q.tariff, q.creditsDelta], lines[i].split(',').map(Number), 'Native vector ' + i + ': ' + JSON.stringify(v)); }
});

test('provider validateWorld hook rejects malformed owned snapshots but permits absent/stale read-only markets', () => {
  const w=fixture(); validateOriginalMarketWorld(w); assert.equal(originalMarketProvider.methods.validateWorld,validateOriginalMarketWorld);
  w.clock.tick=1;w.clock.gameSeconds=1/60;validateOriginalMarketWorld(w);
  state(w).futurePricing=true;assert.throws(()=>validateOriginalMarketWorld(w),{code:'UNSUPPORTED_MARKET_STATE'});
  delete w.extensions[originalMarketStateId('port')];validateOriginalMarketWorld(w);
  const bad=fixture(), ext=bad.extensions[originalMarketStateId('port')]; delete bad.extensions[originalMarketStateId('port')];
  ext.id='reference.market:other';bad.extensions[ext.id]=ext;assert.throws(()=>validateOriginalMarketWorld(bad),{code:'UNSUPPORTED_MARKET_STATE'});
});

test('commodity lacking current logistics support can be quoted but never bricks the simulation through a trade', t=>{
  const w=fixture(),d=state(w);d.commodityOrder.push('omega_core');d.commodities.omega_core=commodity('omega_core');d.submarkets.open.inventory.omega_core=1;w.accounts.a.balance=2000000;
  const q=quote(w,{commodityId:'omega_core',quantity:1});assert.equal(q.unavailableReason,'UNSUPPORTED_LOGISTICS_COMMODITY');assert.equal(q.executable,false);
  const store=memory(t,w);assert.throws(()=>store.execute(actor('a'),command(w,{commodityId:'omega_core',quantity:1})),{code:'UNSUPPORTED_MARKET_TRANSACTION'});
  assert.equal(store.read(w.id).fleets.a.cargo.omega_core,undefined);
});

test('player-specific price modifiers never leak one player discount into another player quote',()=>{
  const w=fixture(),row=state(w).commodities.supplies; row.playerSupplyModsByPlayer.a.mult=0.5;
  const a=quote(w),b=quote(w,{fleetId:'b',accountId:'b'},'b'); assert.ok(a.gross < b.gross);assert.equal(a.accountId,'a');assert.equal(b.accountId,'b');
  delete row.playerSupplyModsByPlayer.b; assert.throws(()=>validateOriginalMarketWorld(w),{code:'UNSUPPORTED_MARKET_STATE'});
});
