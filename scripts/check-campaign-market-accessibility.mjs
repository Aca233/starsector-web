import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { CampaignError } from '../src/campaign/core/Values.mjs';
import { ORIGINAL_MARKET_ACCESSIBILITY as R, computeOriginalGroupAccessibility as core, reapplyOriginalLocalAccessibility as local, originalFreeMarketAccessBonus as freeBonus } from '../src/campaign/rules/OriginalMarketAccessibility.mjs';
import { resolveOriginalCommodityNetwork as network } from '../src/campaign/rules/OriginalCommodityNetwork.mjs';
import { newOriginalCivicIndustry } from '../src/campaign/rules/OriginalCivicIndustries.mjs';
import { newOriginalResourceIndustry } from '../src/campaign/rules/OriginalResourceIndustries.mjs';
import { reapplyOriginalIndustryCommodityPass } from '../src/campaign/rules/OriginalIndustryCommodityPass.mjs';
import { ORIGINAL_MARKET_ECONOMY, resolveOriginalMarketEconomyPass } from '../src/campaign/rules/OriginalMarketEconomy.mjs';
const f = Math.fround, mod = (id, value) => ({ id, value: f(value) });
const bonus = (flat = [], percent = [], mult = []) => ({ flat, percent, mult });
const op = (v = {}) => ({ disrupted: false, building: false, upgradeId: null, ...v });
const industry = (industryId, v = {}) => ({ industryId, operating: op(), aiCoreId: null, improved: false, specialItemId: null, ...v });
const localInput = (v = {}) => ({ accessibility: bonus(), hasSpaceport: false, marketSize: 6, firstQueuedIndustryHasSpaceportTag: false, conditions: [], freeMarketDaysByModId: {}, industries: [industry('population'), industry('spaceport')], ...v });
const market = (marketId, factionId, size, x = 0, y = 0, accessibility = bonus([mod('port', 0.5)])) => ({ marketId, factionId, size, location: { x: f(x), y: f(y) }, accessibility });
const group = (v = {}) => ({ econGroup: null, roster: [{ marketId: 'a', econGroup: null }, { marketId: 'b', econGroup: null }], markets: [market('a', 'f0', 6), market('b', 'f1', 3, 20000)], hostility: { f0: { f1: true }, f1: { f0: false } }, ...v });
const amounts = (maxSupply, maxDemand) => ({ maxSupply, maxDemand, supplyLegal: true, demandLegal: true });
const netMarket = (m, v = {}) => ({ ...m, hidden: false, amounts: amounts(0, 0), availableBeforeCore: 0, otherAvailableFlat: 0, eventModBeforeCore: 0, tradeMod: { both: 0, plus: 0, minus: 0 }, ...v });
const netInput = (v = {}) => { const g = group(); return { ...g, commodityId: 'food', markets: [netMarket(g.markets[0], { amounts: amounts(8, 1), availableBeforeCore: 8 }), netMarket(g.markets[1], { amounts: amounts(0, 8), availableBeforeCore: 0 })], ...v }; };
const reject = (fn, code) => assert.throws(fn, e => e instanceof CampaignError && (!code || e.code === code));

test('accessibility import pins original settings, port/free-market constants and thirteen source hashes', () => {
  const result = spawnSync(process.execPath, ['scripts/import-campaign-market-accessibility.mjs', '--check'], { encoding: 'utf8', windowsHide: true }); assert.equal(result.status, 0, result.stderr);
  assert.equal(Object.keys(R.sources).length, 13); assert.equal(R.settings.unitsPerLightYear, 2000); assert.equal(R.settings.accessibilityDistFromCOM, 50);
});
test('population/spaceport reapply respects prior hasSpaceport and original ordered writes, not a fixed point', () => {
  let request = localInput(), result = local(request); assert.equal(result.hasSpaceport, true); assert.equal(result.value, f(f(-1 + f(0.15)) + 0.5));
  request = { ...request, accessibility: result.accessibility, hasSpaceport: result.hasSpaceport }; result = local(request); assert.equal(result.value, f(f(0.15) + 0.5));
  const reversed = local(localInput({ industries: [industry('spaceport'), industry('population')] })); assert.equal(reversed.value, result.value);
});
test('queued spaceport exempts penalty only with no other new construction; population and upgrading do not count', () => {
  const request = localInput({ industries: [industry('population')], firstQueuedIndustryHasSpaceportTag: true }); assert.equal(local(request).value, f(0.15));
  assert.equal(local({ ...request, industries: [...request.industries, industry('mining', { operating: op({ building: true }) })] }).value, f(-1 + f(0.15)));
  assert.equal(local({ ...request, industries: [...request.industries, industry('mining', { operating: op({ building: true, upgradeId: 'next' }) })] }).value, f(0.15));
});
test('spaceport alpha and improvement stack; disruption removes them but hasSpaceport remains true', () => {
  const request = localInput({ industries: [industry('megaport', { aiCoreId: 'alpha_core', improved: true })] }); const active = local(request);
  assert.equal(active.value, f(f(f(0.2) + f(0.2)) + f(0.8)));
  const stopped = local({ ...request, accessibility: active.accessibility, hasSpaceport: true, industries: [industry('megaport', { aiCoreId: 'alpha_core', improved: true, operating: op({ disrupted: true }) })] });
  assert.equal(stopped.value, 0); assert.equal(stopped.hasSpaceport, true); assert.deepEqual(stopped.accessibility.flat, []);
});
test('free-market progression uses captured days with native rounding, conditions reapply removes old modifier before appending', () => {
  assert.equal(freeBonus(0), f(0.05)); assert.equal(freeBonus(365), f(0.25)); assert.equal(freeBonus(10000), f(0.25));
  const request = localInput({ industries: [], accessibility: bonus([mod('free', 0.1), mod('external', 0.2)]), conditions: [{ id: 'free_market', modId: 'free', surveyed: true, suppressed: false }], freeMarketDaysByModId: { free: 365 } });
  assert.deepEqual(local(request).accessibility.flat, [mod('external', 0.2), mod('free', 0.25)]);
  assert.deepEqual(local({ ...request, conditions: [{ ...request.conditions[0], suppressed: true }] }).accessibility.flat, [mod('external', 0.2)]);
  reject(() => local({ ...request, freeMarketDaysByModId: {} })); reject(() => freeBonus(0.1));
});
test('weighted center and hostility use different size weights, preserve directed relations and self faction exclusion', () => {
  const result = core(group()); assert.equal(result.center.x, f(40000 * f(1 / 7))); assert.equal(result.center.y, 0);
  assert.deepEqual(result.factionWeights, { f0: 4, f1: 1 }); assert.deepEqual(result.hostileWeights, { f0: 1, f1: 0 });
  assert.equal(result.markets[0].base, f(0.44)); assert.equal(result.markets[0].hostilityPenalty, f(0.2)); assert.equal(result.markets[1].base, f(0.36));
  assert.equal(result.markets[1].hostilityPenalty, 0); assert.equal(result.markets[0].before.shipping.global, 5);
  assert.equal(result.markets[0].after.shipping.global, 7);
});
test('null and named economic groups are distinct and ordered complete roster is required', () => {
  const g = group({ econGroup: 'isolated', roster: [{ marketId: 'outside', econGroup: null }, { marketId: 'a', econGroup: 'isolated' }, { marketId: 'b', econGroup: 'isolated' }] });
  assert.deepEqual(core(g).center, core(group()).center);
  reject(() => core({ ...g, markets: [g.markets[0]] }), 'INCOMPLETE_ECONOMY_NETWORK'); reject(() => core({ ...g, markets: [...g.markets].reverse() }), 'INCOMPLETE_ECONOMY_NETWORK');
  reject(() => core({ ...g, hostility: { f0: { f1: true }, f1: {} } }), 'INCOMPLETE_ECONOMY_RELATIONS');
  assert.deepEqual(core({ econGroup: null, roster: [], markets: [], hostility: {} }).center, { x: 0, y: 0 });
});
test('core_base always keeps zero; obsolete core_hostile is removed; percent does not multiply flat at base zero', () => {
  const m = market('a', 'f0', 3, 50000, 0, bonus([mod('before', 1), mod('core_base', 9), mod('core_hostile', -0.1), mod('after', -1)], [mod('percent', 300)], [mod('mult', 0.5)]));
  const g = group({ markets: [m, market('b', 'f0', 3, -50000)], hostility: { f0: {} } }); const a = core(g).markets[0];
  assert.equal(a.base, 0); assert.deepEqual(a.accessibility.flat, [mod('before', 1), mod('core_base', 0), mod('after', -1)]); assert.equal(a.after.value, 0);
});
test('exports consume pre-core shipping, availability consumes post-core shipping and subsequent calls carry the updated access', () => {
  const request = netInput(), first = network(request); assert.equal(first.exports.maxExportGlobal, 5);
  assert.equal(first.markets[1].network.shippingGlobal, 8); assert.equal(first.markets[1].available, 5);
  const next = network({ ...request, markets: request.markets.map((m, i) => ({ ...m, accessibility: first.markets[i].accessibility, availableBeforeCore: first.markets[i].available })) });
  assert.equal(next.exports.maxExportGlobal, 7); assert.equal(next.markets[1].available, 7);
});
test('hidden markets still affect center/hostility/exports but do not receive imports; same-faction shipping is retained', () => {
  const request = netInput(); request.markets[0].hidden = true; let result = network(request);
  assert.equal(result.exports.maxExportGlobal, 5); assert.equal(result.markets[1].available, 5); assert.deepEqual(result.access.center, core(group()).center);
  request.markets[1].hidden = true; result = network(request); assert.equal(result.markets[1].available, 0);
  request.markets[1].hidden = false; request.markets[1].factionId = 'f0'; request.hostility = { f0: {} }; result = network(request);
  assert.equal(result.exports.maxExportPerFaction.f0, 8); assert.equal(result.markets[1].available, 8);
});
test('network preserves early-continue event modifiers, uses captured trades, rounds/clamps native available', () => {
  const request = netInput(); request.markets = request.markets.map(m => ({ ...m, amounts: amounts(0, 0), availableBeforeCore: 0, eventModBeforeCore: 2 }));
  let result = network(request); assert.equal(result.markets[0].availability.reappliesEventMod, false); assert.equal(result.markets[0].available, 2);
  request.markets[0].amounts = amounts(3, 1); request.markets[0].tradeMod.plus = ORIGINAL_MARKET_ECONOMY.commodities.food.econUnit;
  result = network(request); assert.equal(result.markets[0].appliedEventMod, 1); assert.equal(result.markets[0].available, 4);
  request.markets[0].otherAvailableFlat = -10; request.markets[0].tradeMod.plus = 0;
  result = network(request); assert.equal(result.markets[0].available, 0);
});
test('source-backed industry output feeds local accessibility, network and existing price kernel without creating live market stock', () => {
  const empty = () => ({ base: 0, modifiers: bonus() }), mods = { aiCoreId: null, improved: false, adminSupplyBonus: 0, adminDemandReduction: 0, supplyBonusFromOther: empty(), demandReductionFromOther: empty(), specialItemId: null };
  const industryResult = reapplyOriginalIndustryCommodityPass({ marketSize: 6, freePort: false, factionIllegalCommodityIds: [], conditions: [{ id: 'farmland_adequate', modId: 'farm', surveyed: true, suppressed: false }, { id: 'habitable', modId: 'habitable', surveyed: true, suppressed: false }], industries: [newOriginalCivicIndustry('population'), newOriginalResourceIndustry('farming'), newOriginalCivicIndustry('spaceport')].map(state => ({ state, operating: op(), modifiers: mods })), available: { heavy_machinery: 3 }, commodities: [{ commodityId: 'food', previousSupplyLegal: false, previousDemandLegal: false }] });
  const localResult = local(localInput({ hasSpaceport: true })), request = netInput(); request.markets[0].amounts = industryResult.commodities.food; request.markets[0].accessibility = localResult.accessibility;
  const result = network(request), m = result.markets[0];
  const price = resolveOriginalMarketEconomyPass({ marketId: 'a', commodityId: 'food', month: 9, sourceRevision: 'test-source-only', phase: 'native-final-iteration', industry: { industries: [{ id: 'resolved-source', supply: industryResult.commodities.food.maxSupply, demand: industryResult.commodities.food.maxDemand, supplyLegal: industryResult.commodities.food.supplyLegal, demandLegal: industryResult.commodities.food.demandLegal }], previousSupplyLegal: false, previousDemandLegal: false }, network: m.network, otherAvailableFlat: 0, eventModBeforePass: 0, tradeMod: { both: 0, plus: 0, minus: 0 }, demandStat: empty(), greedStat: empty(), playerModifiers: { a: { supply: bonus(), demand: bonus() } }, marketModifiers: { supply: bonus(), demand: bonus() } });
  assert.equal(price.diagnostics.available, m.available); assert.ok(!Object.hasOwn(result, 'asOfTick')); assert.ok(!Object.hasOwn(result, 'inventory')); assert.ok(!Object.hasOwn(result, 'completedTask'));
});
test('input/output immutability and unsupported local/network state fail closed', () => {
  const input = netInput(), before = structuredClone(input), result = network(input); assert.deepEqual(input, before); assert.ok(Object.isFrozen(result.markets[0].accessibility.flat));
  assert.equal(network({ ...input, commodityId: 'ships' }).commodityId, 'ships');
  reject(() => network({ ...input, commodityId: 'toString' }));
  // A variant constructor clears its own demand; inherited pre-constructor demand is not valid input here.
  reject(() => network({ ...input, commodityId: 'lobster' }));
  const variant = structuredClone(input); variant.commodityId = 'lobster'; for (const market of variant.markets) market.amounts.maxDemand = 0;
  assert.equal(network(variant).commodityId, 'lobster');
  reject(() => local(localInput({ industries: [industry('not_implemented')] }))); reject(() => local(localInput({ industries: [industry('spaceport', { specialItemId: 'item' })] })));
  const malformed = group(); malformed.markets[0].location.x = 0.1; reject(() => core(malformed));
  reject(() => core(group({ hostility: { f0: { f1: true }, f1: { f0: false, f1: true } } })));
});

import { nativeAccessibilityOracle } from './campaign-accessibility-native-oracle.mjs';
test('original Java core/hostility/Vector2f and local access blocks match 180 groups and 288 sequential local snapshots', () => {
  const groupCases = Array.from({ length: 180 }, (_, i) => {
    const n = 2 + i % 7, factionCount = Math.min(3, n), mask = (i * 173) % 512;
    const markets = Array.from({ length: n }, (_, j) => market('m' + j, 'f' + j % factionCount, (i + j) % 11,
      f(((i * 7919 + j * 233) % 200001 - 100000) * (i % 5 === 0 ? f(0.1) : 1)), f(((i * 3001 - j * 1717) % 500000) * f(0.3)),
      bonus([mod('external', f(((i + j) % 7 - 2) * f(0.1))), mod('core_base', ((i + j) % 5 - 2) / 10), mod('core_hostile', -0.25)], [mod('percent', i % 3 * 50)], [mod('mult', [0, 0.3, 1, 1.2][i % 4])])));
    const hostility = Object.fromEntries(Array.from({ length: factionCount }, (_, a) => ['f' + a, Object.fromEntries(Array.from({ length: factionCount }, (_, b) => b === a ? null : ['f' + b, !!(mask & 1 << (a * 3 + b))]).filter(Boolean))]));
    return { mask, input: { econGroup: null, roster: markets.map(m => ({ marketId: m.marketId, econGroup: null })), markets, hostility } };
  });
  const localCases = Array.from({ length: 96 }, (_, seed) => {
    let industries = [industry('population'), industry(seed % 2 ? 'spaceport' : 'megaport', { aiCoreId: [null, 'alpha_core', 'beta_core', 'gamma_core'][seed % 4], improved: seed % 3 === 0, operating: op({ disrupted: seed % 5 === 0, building: seed % 7 === 0, upgradeId: seed % 14 === 0 ? 'target' : null }) }), industry('mining', { operating: op({ building: seed % 3 === 0, upgradeId: seed % 9 === 0 ? 'target' : null }) })];
    if (seed % 2) industries.reverse();
    if (seed % 8 === 0) industries.push(industry('spaceport', { improved: true }));
    return { seed, input: localInput({ marketSize: seed % 11, hasSpaceport: seed % 3 === 0, firstQueuedIndustryHasSpaceportTag: seed % 4 === 0,
      accessibility: bonus([mod('external', f((seed % 7) * f(0.1))), mod('core_base', 0.4), mod('free', 0.05)], [mod('percent', 50)], [mod('mult', 1.1)]),
      conditions: [{ id: 'free_market', modId: 'free', surveyed: true, suppressed: seed % 7 === 0 }], freeMarketDaysByModId: { free: f(seed % 2 ? seed * 7.3 : seed * 365 / 90) }, industries }) };
  });
  const native = nativeAccessibilityOracle(groupCases, localCases); assert.equal(native.length, 468);
  groupCases.forEach((c, n) => {
    const actual = core(c.input), expected = native[n]; assert.deepEqual(actual.center, expected.center, 'native center ' + n);
    for (let i = 0; i < actual.markets.length; i++) {
      const a = actual.markets[i], e = expected.markets[i]; assert.equal(a.base, e.base, 'base ' + n + '/' + i); assert.deepEqual(a.accessibility, e.accessibility, 'access modifiers ' + n + '/' + i);
      assert.deepEqual(a.before, { value: e.beforeValue, shipping: { global: e.beforeG, inFaction: e.beforeF } });
      assert.deepEqual(a.after, { value: e.afterValue, shipping: { global: e.afterG, inFaction: e.afterF } });
    }
  });
  localCases.forEach((c, n) => {
    let request = c.input;
    for (let step = 0; step < 3; step++) {
      const actual = local(request), expected = native[groupCases.length + n * 3 + step];
      assert.deepEqual({ accessibility: actual.accessibility, hasSpaceport: actual.hasSpaceport, value: actual.value }, expected, 'native local ' + n + '/' + step);
      request = { ...request, accessibility: actual.accessibility, hasSpaceport: actual.hasSpaceport };
    }
  });
});
