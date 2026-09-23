import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { CampaignError } from '../src/campaign/core/Values.mjs';
import { ORIGINAL_INDUSTRY_COMMODITIES as R, newOriginalCivicIndustry as fresh, applyOriginalCivicIndustry as apply, originalCivicIndustryOutput as output } from '../src/campaign/rules/OriginalCivicIndustries.mjs';
import { newOriginalResourceIndustry, applyOriginalResourceDeposit } from '../src/campaign/rules/OriginalResourceIndustries.mjs';
import { reapplyOriginalIndustryCommodityPass as pass } from '../src/campaign/rules/OriginalIndustryCommodityPass.mjs';
import { resolveOriginalIndustryAmounts, resolveOriginalIndustryCommodityAmounts, originalEconomyCommodity } from '../src/campaign/rules/OriginalMarketEconomy.mjs';
const stat = () => ({ base: 0, modifiers: { flat: [], percent: [], mult: [] } });
const operating = (overrides = {}) => ({ disrupted: false, building: false, upgradeId: null, ...overrides });
const modifiers = (overrides = {}) => ({ aiCoreId: null, improved: false, adminSupplyBonus: 0, adminDemandReduction: 0, supplyBonusFromOther: stat(), demandReductionFromOther: stat(), specialItemId: null, ...overrides });
const run = (state, size = 6, overrides = {}) => apply({ state, marketSize: size, habitable: true, operating: operating(), modifiers: modifiers(), ...overrides });
const value = (s, id, channel = 'demand') => output(s, { commodityId: id, illegal: false })[channel];
const reject = (fn, code) => assert.throws(fn, e => e instanceof CampaignError && (!code || e.code === code));
const resource = id => ['farming', 'aquaculture', 'mining'].includes(id);
const entry = id => ({ state: resource(id) ? newOriginalResourceIndustry(id) : fresh(id), operating: operating(), modifiers: modifiers() });
const previous = id => ({ commodityId: id, previousSupplyLegal: false, previousDemandLegal: false });
const condition = (id, overrides = {}) => ({ id, modId: id, surveyed: true, suppressed: false, ...overrides });
const input = (overrides = {}) => ({ marketSize: 6, freePort: false, factionIllegalCommodityIds: [], conditions: [], industries: [entry('population')], available: { heavy_machinery: 99 }, commodities: ['food', 'crew', 'supplies', 'ships', 'marines', 'hand_weapons', 'organs', 'drugs', 'heavy_machinery', 'organics', 'volatiles'].map(previous), ...overrides });

test('industry data reproduces 18 civic definitions, 36 commodity-neutral conditions and 21 source hashes', () => {
  const result = spawnSync(process.execPath, ['scripts/import-campaign-industry-commodities.mjs', '--check'], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stdout + result.stderr); assert.equal(Object.keys(R.industries).length, 18); assert.equal(Object.keys(R.conditions).length, 36); assert.equal(Object.keys(R.sources).length, 21);
});
test('population writes native demand/supply, keeps negative amounts and does not clear old organics on becoming habitable', () => {
  let s = run(fresh('population'), 6, { habitable: false });
  for (const [id, expected] of Object.entries({ food: 6, organics: 5, domestic_goods: 5, luxury_goods: 3, drugs: 4, organs: 3, supplies: 3 })) assert.equal(value(s, id), expected);
  for (const [id, expected] of Object.entries({ crew: 3, drugs: 2, organs: 1 })) assert.equal(value(s, id, 'supply'), expected);
  s = run(s, 6, { habitable: true }); assert.equal(value(s, 'organics'), 5);
  const small = run(fresh('population'), 2); assert.equal(value(small, 'organs', 'supply'), -3); assert.equal(value(small, 'crew', 'supply'), -1);
});
test('spaceport/megaport and military tag demand differ, while station demand ignores market size', () => {
  for (const [id, need, crew, marines] of [['spaceport', 4, 5, 0], ['megaport', 6, 7, 0], ['patrolhq', 5, 6, 0], ['militarybase', 7, 6, 6], ['highcommand', 8, 6, 6]]) {
    const s = run(fresh(id)); for (const c of ['fuel', 'supplies', 'ships']) assert.equal(value(s, c), need);
    assert.equal(value(s, 'crew', 'supply'), crew); assert.equal(value(s, 'marines', 'supply'), marines);
  }
  for (const [id, spec] of Object.entries(R.industries).filter(([,s]) => s.className === 'OrbitalStation')) {
    for (const size of [0, 3, 6, 10]) { const s = run(fresh(id), size), expected = spec.tags.includes('battlestation') ? 5 : spec.tags.includes('starfortress') ? 7 : 3;
      assert.equal(value(s, 'crew'), expected); assert.equal(value(s, 'supplies'), expected); }
  }
});
test('ground batteries share commodity formula with ground defenses and military exceptions do not leak to stations', () => {
  for (const id of ['grounddefenses', 'heavybatteries']) {
    const s = run(fresh(id)); assert.equal(value(s, 'supplies'), 6); assert.equal(value(s, 'marines'), 6); assert.equal(value(s, 'hand_weapons'), 4);
    assert.equal(output(s, { commodityId: 'hand_weapons', illegal: true }).demandLegal, true);
  }
  assert.equal(output(run(fresh('militarybase')), { commodityId: 'marines', illegal: true }).supplyLegal, true);
  assert.equal(output(run(fresh('starfortress_mid')), { commodityId: 'supplies', illegal: true }).demandLegal, false);
});
test('alpha production applies to population but not civic facilities; improvements never add their commodity production', () => {
  for (const id of Object.keys(R.industries)) {
    const plain = run(fresh(id)), improved = run(fresh(id), 6, { modifiers: modifiers({ improved: true }) });
    assert.deepEqual(improved, plain, id + ' improvement has no commodity effect');
    const alpha = run(fresh(id), 6, { modifiers: modifiers({ aiCoreId: 'alpha_core' }) });
    assert.equal(value(alpha, 'crew', 'supply'), value(plain, 'crew', 'supply') + (id === 'population' ? 1 : 0), id);
    assert.equal(value(alpha, 'supplies'), value(plain, 'supplies') - 1, id);
  }
});
test('population still produces when disrupted, other facilities clear supply but retain demand; upgrades function', () => {
  for (const id of ['population', 'spaceport', 'militarybase']) {
    const s = run(fresh(id), 6, { operating: operating({ disrupted: true }) });
    assert.equal(value(s, 'crew', 'supply'), id === 'population' ? 3 : 0); assert.ok(value(s, 'supplies') > 0);
    const b = run(fresh(id), 6, { operating: operating({ building: true, upgradeId: 'upgrade_target' }) });
    assert.equal(value(b, 'crew', 'supply'), value(run(fresh(id)), 'crew', 'supply'));
  }
});
test('actual Corvus industry/condition roster now yields all local commodity maxima, including ships/meta', () => {
  const corvus = JSON.parse(readFileSync(new URL('../src/campaign/data/reference-corvus.json', import.meta.url), 'utf8'));
  for (const [id, expected] of [['asharu', { food: [3, 4], crew: [3, 0], ships: [0, 2], supplies: [0, 3] }],
    ['jangala', { food: [6, 6], organics: [8, 0], crew: [6, 7], marines: [6, 6], hand_weapons: [0, 4], supplies: [0, 7], ships: [0, 7] }],
    ['corvus_IIIa', { food: [0, 3], organics: [0, 2], volatiles: [3, 0], crew: [2, 0], supplies: [0, 3], ships: [0, 1] }]]) {
    const m = corvus.markets.find(m => m.id === id), result = pass(input({ marketSize: m.size, freePort: m.freePort, conditions: m.conditions.map(id => condition(id)), industries: m.industries.map(entry) }));
    for (const [c, [supply, demand]] of Object.entries(expected)) { assert.equal(result.commodities[c].maxSupply, supply, id + '/' + c); assert.equal(result.commodities[c].maxDemand, demand, id + '/' + c); }
    assert.deepEqual(result.industries.map(i => i.state.industryId), m.industries);
    assert.equal(result.scope, 'selected-commodity-effects-only'); assert.equal(Object.hasOwn(result, 'asOfTick'), false); assert.equal(Object.hasOwn(result, 'completedTask'), false);
  }
});
test('native industry order controls ties in legality; free port overrides faction illegality, not amounts', () => {
  const request = input({ factionIllegalCommodityIds: ['crew'], industries: [entry('population'), entry('spaceport'), entry('militarybase')] });
  // Captured administrator production puts spaceport exactly level with military supply.
  request.industries[1].modifiers.adminSupplyBonus = 1;
  assert.equal(pass(request).commodities.crew.supplyLegal, false);
  request.industries.reverse(); assert.equal(pass(request).commodities.crew.supplyLegal, true);
  request.industries.reverse(); request.freePort = true; assert.equal(pass(request).commodities.crew.supplyLegal, true);
});
test('resource phase executes before industry phase; surveyed/suppressed filtering does not synthesize unapply cleanup', () => {
  let request = input({ industries: [entry('farming')], conditions: [condition('farmland_adequate')] });
  request.industries[0].modifiers.aiCoreId = 'alpha_core';
  let result = pass(request); assert.equal(result.commodities.food.maxSupply, 6);
  request.industries = result.industries; result = pass(request); assert.equal(result.commodities.food.maxSupply, 7);
  request.industries = result.industries; request.conditions[0].suppressed = true; request.marketSize = 8;
  assert.equal(pass(request).commodities.food.maxSupply, 7); // source's unapply does not remove these supply flats
  request.industries = [entry('farming')]; assert.equal(pass(request).commodities.food.maxSupply, 0);
  request.conditions[0].suppressed = false; request.conditions[0].surveyed = false; assert.equal(pass(request).commodities.food.maxSupply, 0);
});
test('habitable presence is independent of surveyed/suppressed, and commodity aggregation creates native empty stat entries', () => {
  const result = pass(input({ conditions: [condition('habitable', { surveyed: false, suppressed: true })] }));
  assert.equal(result.commodities.organics.maxDemand, 0);
  assert.ok(result.industries[0].state.supply.ships); assert.ok(result.industries[0].state.demand.ships);
});
test('primary meta quantities are now aggregatable but remain blocked by resource pricing; variants still rejected', () => {
  const i = { commodityId: 'ships', industries: [output(run(fresh('spaceport')), { commodityId: 'ships', illegal: false })], previousSupplyLegal: false, previousDemandLegal: false };
  assert.equal(resolveOriginalIndustryCommodityAmounts(i).maxDemand, 4);
  reject(() => resolveOriginalIndustryAmounts(i), 'UNSUPPORTED_ECONOMY_COMMODITY'); reject(() => originalEconomyCommodity('ships'), 'UNSUPPORTED_ECONOMY_COMMODITY');
  reject(() => resolveOriginalIndustryCommodityAmounts({ ...i, commodityId: 'lobster' }));
});
test('pass has immutable JSON replay, leaves input intact and rejects incomplete or unsupported rosters', () => {
  const request = input({ conditions: [condition('habitable')], industries: [entry('population'), entry('spaceport')] }), before = structuredClone(request), first = pass(request);
  assert.deepEqual(request, before); assert.ok(Object.isFrozen(first.industries[0].state.supply.crew));
  assert.deepEqual(pass({ ...request, industries: JSON.parse(JSON.stringify(first.industries)) }), first);
  for (const bad of [{ conditions: [condition('unknown', { suppressed: true })] }, { industries: [entry('population'), entry('population')] }, { commodities: [previous('crew'), previous('crew')] }, { conditions: [condition('habitable'), condition('habitable')] }, { available: {} }]) reject(() => pass({ ...request, ...bad }));
  reject(() => run(fresh('spaceport'), 6, { modifiers: modifiers({ specialItemId: 'coronal_portal' }) }));
  reject(() => fresh('refining')); reject(() => run(fresh('population'), 6, { habitable: undefined }));
  reject(() => pass({ ...request, commodities: [previous('not_native')] }));
});

import { nativeCivicOracle } from './campaign-civic-native-oracle.mjs';
test('original Java commodity blocks and full MutableStat match 792 civic snapshots including effective values and legality', () => {
  const vectors = Object.entries(R.industries).flatMap(([id, spec], n) => Array.from({ length: 11 }, (_, size) => ({ id, ...spec, size, seed: n * 11 + size, core: [null, 'alpha_core', 'beta_core', 'gamma_core'][(n + size) % 4], improved: size % 2 === 0, habitable: size % 3 === 0 })));
  const results = nativeCivicOracle(vectors); assert.equal(results.length, 792);
  vectors.forEach((v, i) => {
    let s = structuredClone(fresh(v.id)); const op = operating(); let habitable = v.habitable;
    const m = modifiers({ aiCoreId: v.core, improved: v.improved, adminSupplyBonus: (v.seed % 5 - 2) * 0.5, adminDemandReduction: (v.seed % 3 - 1) * 0.5 });
    const mod = (id, value) => ({ id, value });
    if (v.seed % 2 === 0) { m.supplyBonusFromOther.modifiers.flat = [mod('ind_' + v.id + '_0', 2), mod('extra', -0.5)]; m.supplyBonusFromOther.modifiers.mult = [mod('mult', 0.5)]; }
    if (v.seed % 3 === 0) { m.demandReductionFromOther.modifiers.flat = [mod('extra', 1.5)]; m.demandReductionFromOther.modifiers.percent = [mod('percent', 25)]; }
    if (v.seed % 4 === 0) { s.demand.supplies = stat(); s.demand.supplies.modifiers.mult = [mod('half', 0.5)]; }
    if (v.seed % 5 === 0) { s.supply.food = stat(); s.supply.food.base = 1; }
    for (let step = 0; step < 4; step++) {
      if (step === 1) { habitable = !habitable; m.aiCoreId = null; m.improved = !m.improved; }
      if (step === 2) op.disrupted = true;
      if (step === 3) { op.disrupted = false; op.building = true; op.upgradeId = 'next_industry'; }
      s = structuredClone(run(s, v.size, { habitable, operating: op, modifiers: m })); const result = results[i * 4 + step];
      for (const id of ['crew', 'supplies', 'ships', 'marines', 'hand_weapons']) { s.supply[id] ??= stat(); s.demand[id] ??= stat(); }
      for (const [commodityId, amount] of Object.entries(result.aggregates)) {
        assert.deepEqual(resolveOriginalIndustryCommodityAmounts({ ...previous(commodityId), industries: [output(s, { commodityId, illegal: true })] }), amount, 'native aggregate ' + commodityId);
      }
      assert.deepEqual(s, result.state, v.id + '/' + v.size + '/' + step);
      for (const [id, qty] of Object.entries(result.effectiveSupply)) assert.equal(value(s, id, 'supply'), qty, 'supply ' + id);
      for (const [id, qty] of Object.entries(result.effectiveDemand)) assert.equal(value(s, id), qty, 'demand ' + id);
      const legality = output(s, { commodityId: 'crew', illegal: true }); assert.equal(legality.supplyLegal, result.supplyLegal); assert.equal(legality.demandLegal, result.demandLegal);
    }
  });
});

test('inherited object property names cannot masquerade as native industries, conditions or commodities', () => {
  for (const id of ['toString', 'hasOwnProperty', 'valueOf']) {
    reject(() => fresh(id), 'UNSUPPORTED_CIVIC_INDUSTRY');
    reject(() => originalEconomyCommodity(id), 'UNSUPPORTED_ECONOMY_COMMODITY');
    reject(() => resolveOriginalIndustryCommodityAmounts({ ...previous(id), industries: [] }), 'UNSUPPORTED_ECONOMY_COMMODITY');
    reject(() => applyOriginalResourceDeposit({ conditionId: id, modId: 'condition', marketSize: 6, industries: [] }), 'UNSUPPORTED_RESOURCE_CONDITION');
  }
});
