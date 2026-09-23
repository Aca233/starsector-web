import { ORIGINAL_SPECIAL_INDUSTRIES, newOriginalSpecialIndustry } from '../src/campaign/rules/OriginalSpecialIndustries.mjs';
import { ORIGINAL_PRODUCTION_INDUSTRIES, newOriginalProductionIndustry } from '../src/campaign/rules/OriginalProductionIndustries.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { CampaignError, identifier } from '../src/campaign/core/Values.mjs';
import { ORIGINAL_MARKET_STABILITY as R, reapplyOriginalMarketStability as run, originalMarketStabilityValue as stabilityValue, originalFreeMarketStabilityPenalty as freePenalty, originalMismanagementPenalty as management } from '../src/campaign/rules/OriginalMarketStability.mjs';
import { newOriginalCivicIndustry } from '../src/campaign/rules/OriginalCivicIndustries.mjs';
import { newOriginalResourceIndustry } from '../src/campaign/rules/OriginalResourceIndustries.mjs';
import { resolveOriginalEconomyMutable } from '../src/campaign/rules/OriginalMarketEconomy.mjs';
const f = Math.fround, mod = (id, value) => ({ id, value: f(value) });
const stat = (base = 0, flat = [], percent = [], mult = []) => ({ base, modifiers: { flat, percent, mult } });
const condition = (id, extra = {}) => ({ id, modId: id, surveyed: true, suppressed: false, ...extra });
const resource = id => ['farming', 'aquaculture', 'mining'].includes(id);
const industry = id => ({ state: resource(id) ? newOriginalResourceIndustry(id) : Object.hasOwn(ORIGINAL_PRODUCTION_INDUSTRIES.industries,id) ? newOriginalProductionIndustry(id) : Object.hasOwn(ORIGINAL_SPECIAL_INDUSTRIES.industries,id) ? newOriginalSpecialIndustry(id) : newOriginalCivicIndustry(id), operating: { disrupted: false, building: false, upgradeId: null }, modifiers: { aiCoreId: null, improved: false, adminSupplyBonus: 0, adminDemandReduction: 0, supplyBonusFromOther: stat(), demandReductionFromOther: stat(), specialItemId: null } });
const commodityIds = ['food', 'organics', 'domestic_goods', 'luxury_goods', 'drugs', 'organs', 'supplies', 'fuel', 'ships', 'crew', 'marines', 'hand_weapons', 'heavy_machinery', 'ore', 'rare_ore', 'metals', 'rare_metals', 'volatiles'];
function input(ids = ['population']) { return { commodityPass: { marketSize: 6, freePort: false, factionIllegalCommodityIds: [], conditions: [condition('habitable')], industries: ids.map(industry), available: { heavy_machinery: 20 }, commodities: commodityIds.map(commodityId => ({ commodityId, previousSupplyLegal: true, previousDemandLegal: true })) }, stability: stat(), incomeMult: stat(1), upkeepMult: stat(1), maxIndustries: stat().modifiers, previousStability: 4, hazard: f(1.25), governance: { marketId: 'm', markets: [{ marketId: 'm', playerOwned: false, adminIsPlayer: false }], maxOutposts: 2 }, constructionQueue: [], conditionStateByModId: {}, marketCommodities: commodityIds.map(commodityId => ({ commodityId, maxDemand: 0, maxSupply: 0, available: 20, shippingFaction: 0, maxExportFaction: 0 })) }; }
const flat = (r, id) => r.stability.modifiers.flat.find(m => m.id === id)?.value;
const com = (p, id) => p.marketCommodities.find(c => c.commodityId === id);
const next = (p, r) => ({ ...p, commodityPass: { ...p.commodityPass, industries: r.commodityEffects.industries, ...(r.commodityEffects.production ? { production: r.commodityEffects.production } : {}), ...(r.commodityEffects.special ? {special:r.commodityEffects.special} : {}) }, stability: r.stability, incomeMult: r.incomeMult, upkeepMult: r.upkeepMult, maxIndustries: r.maxIndustries });
const rejects = fn => assert.throws(fn, e => e instanceof CampaignError);

test('stability import pins native source/CSV bindings and settings', () => { const p = spawnSync(process.execPath, ['scripts/import-campaign-market-stability.mjs', '--check'], { encoding: 'utf8', windowsHide: true }); assert.equal(p.status, 0, p.stdout + p.stderr); assert.equal(Object.keys(R.sources).length, 42); assert.equal(R.settings.stabilityBaseValue, 5); assert.equal(R.industries.patrolhq.upgrade, 'militarybase'); });
test('population needs, no-relay, improvement and previous-stability income follow separate stages', () => {
  const p = input(); p.commodityPass.industries[0].modifiers.improved = true; const r = run(p);
  assert.equal(r.values.stability, 7); assert.equal(r.values.incomeMult, f(0.8)); assert.equal(r.values.upkeepMult, f(1.25)); assert.equal(r.values.maxIndustries, 4); assert.equal(flat(r, 'PAI_improve'), 1); assert.equal(flat(r, 'core_comm_relay'), -1);
  assert.equal(run({ ...p, previousStability: -1 }).values.incomeMult, 0); assert.equal(run({ ...p, previousStability: 10 }).values.incomeMult, 1);
});
test('population luxury threshold and maximum life-support deficit use presence of habitable, not surveyed flag', () => {
  const p = input(); p.commodityPass.conditions = []; com(p, 'food').available = 4; com(p, 'organics').available = 1; com(p, 'domestic_goods').available = 0;
  let r = run(p); assert.equal(flat(r, 'ind_population_2'), -4); assert.equal(flat(r, 'ind_population_0'), undefined);
  p.commodityPass.conditions = [condition('habitable', { surveyed: false, suppressed: true })]; r = run(p); assert.equal(flat(r, 'ind_population_2'), -2);
  p.commodityPass.marketSize = 3; r = run(p); assert.equal(flat(r, 'ind_population_1'), undefined);
});
test('station uses old demand before rewritten demand and AI reduction, not final commodity snapshot', () => {
  let p = input(['orbitalstation']); com(p, 'supplies').available = 0; com(p, 'crew').available = 0;
  let r = run(p); assert.equal(flat(r, 'ind_orbitalstation'), 1); assert.equal(r.diagnostics.deficitReads[0].phase, 'before-demand');
  p = next(p, r); r = run(p); assert.equal(flat(r, 'ind_orbitalstation'), undefined); assert.equal(r.diagnostics.deficitReads[0].deficit, 3);
  p = next(p, r); p.commodityPass.industries = structuredClone(p.commodityPass.industries); p.commodityPass.industries[0].modifiers.aiCoreId = 'alpha_core'; com(p, 'supplies').available = 2; com(p, 'crew').available = 2;
  r = run(p); assert.equal(flat(r, 'ind_orbitalstation'), undefined); r = run(next(p, r)); assert.equal(flat(r, 'ind_orbitalstation'), 1);
});
test('military and ground defenses read new demand, station improvement is independent of supply but removed on disruption', () => {
  const p = input(['militarybase', 'grounddefenses', 'starfortress_high']); com(p, 'supplies').available = 5; p.commodityPass.industries[2].modifiers.improved = true;
  let r = run(p); assert.equal(flat(r, 'ind_militarybase'), undefined); assert.equal(flat(r, 'ind_grounddefenses'), undefined); assert.equal(flat(r, 'ind_starfortress_high'), 3); assert.equal(flat(r, 'orbital_station_improve'), 1);
  p.commodityPass.industries[2].operating.disrupted = true; r = run(p); assert.equal(flat(r, 'orbital_station_improve'), undefined); assert.equal(flat(r, 'ind_starfortress_high'), undefined);
});
test('native deficit truncates quantity while commodity max-demand rounds, with ordered ties', () => {
  const p = input(['battlestation']); p.commodityPass.industries[0].state = structuredClone(p.commodityPass.industries[0].state);
  for (const id of ['supplies', 'crew']) p.commodityPass.industries[0].state.demand[id] = stat(f(1.9)); com(p, 'supplies').available = 0; com(p, 'crew').available = 0;
  const r = run(p); assert.equal(flat(r, 'ind_battlestation'), 1); assert.equal(r.diagnostics.deficitReads[0].commodityId, 'supplies'); assert.equal(r.diagnostics.deficitReads[0].deficit, 1);
});
test('management counts only player-owned/player-administered markets and grants bonus below limit', () => {
  const p = input(); p.governance.markets[0].playerOwned = true; p.governance.markets[0].adminIsPlayer = true;
  p.governance.markets.push({ marketId: 'npc', playerOwned: false, adminIsPlayer: true }, { marketId: 'delegated', playerOwned: true, adminIsPlayer: false });
  assert.equal(management({ markets: p.governance.markets, maxOutposts: 2 }), -2); assert.equal(flat(run(p), '_ind_population_3_mm'), 2);
  p.governance.maxOutposts = 0; assert.equal(flat(run(p), '_ind_population_3_mm'), -2);
  const r = run(p); p.governance.markets[0].adminIsPlayer = false; assert.equal(flat(run(next(p, r)), '_ind_population_3_mm'), undefined);
});
test('industrial cap counts queued industries and structure upgrades, including disrupted ones', () => {
  const p = input(['population', 'patrolhq', 'mining']); p.commodityPass.marketSize = 3; p.commodityPass.industries[1].operating = { disrupted: true, building: true, upgradeId: 'militarybase' }; p.constructionQueue = ['grounddefenses', 'farming'];
  let r = run(p); assert.equal(r.diagnostics.industryCount, 3); assert.equal(flat(r, '_ind_population_3_overmax'), -5);
  p.maxIndustries.flat.push(mod('skill', 2)); r = run(p); assert.equal(r.values.maxIndustries, 3); assert.equal(flat(r, '_ind_population_3_overmax'), undefined);
});
test('free market/unrest/decivilized modifiers unapply correctly without advancing condition lifetime', () => {
  const p = input(); p.commodityPass.conditions.push(condition('free_market'), condition('recent_unrest'), condition('decivilized_subpop')); p.conditionStateByModId = { free_market: { daysActive: 365 }, recent_unrest: { penalty: 4 } };
  p.stability = stat(0, [mod('recent_unrest', -9)], [mod('recent_unrest', 25)], [mod('recent_unrest', 2)]);
  const r = run(p); assert.equal(flat(r, 'free_market'), -3); assert.equal(flat(r, 'recent_unrest'), -4); assert.equal(flat(r, 'decivilized_subpop'), -2); assert.deepEqual(r.stability.modifiers.percent, []); assert.deepEqual(r.stability.modifiers.mult, []);
  p.commodityPass.conditions = p.commodityPass.conditions.map(c => ({ ...c, suppressed: true })); const cleared = run(next(p, r)); for (const id of ['free_market', 'recent_unrest', 'decivilized_subpop']) assert.equal(flat(cleared, id), undefined);
  assert.equal(freePenalty(0), 1); assert.equal(freePenalty(f(91.25)), 2); assert.equal(freePenalty(f(273.75)), 3);
});
test('relay chooses a functional same-faction real relay, and absent vs unusable condition differ', () => {
  const p = input(); p.commodityPass.conditions.push(condition('comm_relay')); const relay = (id, extra = {}) => ({ id, sameFaction: true, nonFunctional: false, makeshift: true, ...extra });
  const s = { hasContainingLocation: true, relays: [relay('enemy', { sameFaction: false, makeshift: false }), relay('a'), relay('b', { nonFunctional: true, makeshift: false }), relay('c', { makeshift: false })] }; p.conditionStateByModId = { comm_relay: s };
  assert.equal(flat(run(p), 'core_comm_relay'), 2); s.relays.pop(); assert.equal(flat(run(p), 'core_comm_relay'), 1); s.relays = []; assert.equal(flat(run(p), 'core_comm_relay'), undefined);
  p.commodityPass.conditions[1].suppressed = true; assert.equal(flat(run(p), 'core_comm_relay'), undefined);
});
test('upkeep in-faction credit is all-or-nothing for imports, uses cached amounts, not new population demands', () => {
  const p = input(); Object.assign(com(p, 'food'), { maxDemand: 6, maxSupply: 2, available: 6, shippingFaction: 5, maxExportFaction: 8 });
  let r = run(p); assert.equal(r.diagnostics.inFactionUpkeep.inFactionSupply, 2); assert.equal(r.diagnostics.inFactionUpkeep.multiplier, f(0.83)); assert.equal(r.commodityEffects.commodities.food.maxDemand, 6);
  com(p, 'food').shippingFaction = 6; r = run(p); assert.equal(r.diagnostics.inFactionUpkeep.multiplier, 0.5);
  com(p, 'food').available = 2; r = run(p); assert.equal(r.diagnostics.inFactionUpkeep.inFactionSupply, 2);
  com(p, 'food').maxDemand = 0; r = run(next(p, r)); assert.equal(r.diagnostics.inFactionUpkeep.multiplier, null); assert.ok(!r.upkeepMult.modifiers.mult.some(m => m.id.endsWith('ifi')));
});
test('stability raw stat stays unclamped, public getter clamps then rounds, external channels survive repeated passes', () => {
  for (const [raw, expected] of [[-1, 0], [f(3.49), 3], [3.5, 4], [11, 10]]) assert.equal(stabilityValue(stat(raw)), expected);
  const p = input(); p.stability = stat(1, [mod('external', 2)], [mod('percent', 50)], [mod('mult', 1.1)]); p.hazard = 0;
  const r = run(p), twice = run(next(p, r)); assert.deepEqual(twice.stability, r.stability); assert.equal(r.stability.modifiers.flat[0].id, 'external'); assert.equal(r.values.upkeepMult, 0.25); assert.equal(r.values.rawStability, resolveOriginalEconomyMutable(r.stability));
});
test('strict complete-roster/unsupported-state checks and immutable outputs keep this below trade-authority scope', () => {
  const p = input(), snapshot = structuredClone(p), r = run(p); assert.deepEqual(p, snapshot); assert.ok(Object.isFrozen(r.stability.modifiers.flat)); for (const k of ['asOfTick', 'inventory', 'completedTask', 'income']) assert.ok(!(k in r));
  for (const mutate of [q => { q.marketCommodities.pop(); }, q => { q.governance.markets = []; }, q => { q.commodityPass.conditions.push(condition('toString')); }, q => { q.commodityPass.industries[0].modifiers.specialItemId = 'corrupted_nanoforge'; }, q => { q.previousStability = 0.1; }, q => { q.constructionQueue = ['unimplemented']; }, q => { q.conditionStateByModId = { stale: { penalty: 2 } }; }, q => { com(q, 'heavy_machinery').available = 4; }]) { const q = structuredClone(p); mutate(q); rejects(() => run(q)); }
});

test('original Java stability blocks match ordered modifiers and population financial factors over 216 sequential-input snapshots', async () => {
  const { nativeStabilitySnapshots } = await import('./campaign-stability-native-oracle.mjs'), cases = [], expected = [];
  const ids = Object.keys(R.industries).filter(id => !resource(id));
  for (let seed = 0; seed < 72; seed++) {
    let p = input([...new Set(['population', ids[seed % ids.length], ids[(seed + 7) % ids.length]])]);
    p.commodityPass.marketSize = 1 + seed % 10; p.previousStability = seed % 12 - 1; p.hazard = f((seed % 8) * 0.3);
    p.governance.markets[0].playerOwned = seed % 2 === 0; p.governance.markets[0].adminIsPlayer = seed % 3 !== 0; p.governance.maxOutposts = seed % 4;
    for (let i = 0; i < seed % 5; i++) p.governance.markets.push({ marketId: 'other' + i, playerOwned: i % 2 === 0, adminIsPlayer: true });
    if (seed % 3 === 0) p.constructionQueue = ['mining', 'militarybase'];
    p.stability = stat(f((seed % 3) * 0.2), [mod('external', seed % 5 - 2), mod('_ind_population_3_ms', 8), mod('ind_population_0', 2)], [mod('external_percent', 13)], [mod('external_mult', 1.1)]);
    p.incomeMult = stat(1, [mod('external', f(0.2))], [mod('pct', -10)], [mod('external_mult', 1.2)]); p.upkeepMult = stat(1, [], [], [mod('external_mult', 1.1)]);
    p.maxIndustries.flat.push(mod('skill', seed % 3));
    p.commodityPass.conditions = seed % 2 ? [] : [condition('habitable', { surveyed: seed % 4 === 0 })];
    p.commodityPass.conditions.push(condition('free_market', { suppressed: seed % 4 === 0 }), condition('recent_unrest', { surveyed: seed % 3 !== 0 }), condition('decivilized_subpop', { suppressed: seed % 2 === 0 }));
    p.conditionStateByModId = { free_market: { daysActive: f(seed * 7.3) }, recent_unrest: { penalty: seed % 4 } };
    if (seed % 3 !== 0) { p.commodityPass.conditions.push(condition('comm_relay', { suppressed: seed % 7 === 0 })); p.conditionStateByModId.comm_relay = { hasContainingLocation: seed % 5 !== 0, relays: [{ id: 'one', sameFaction: seed % 4 !== 0, nonFunctional: seed % 6 === 0, makeshift: true }, { id: 'two', sameFaction: seed % 4 === 0, nonFunctional: seed % 5 === 0, makeshift: false }] }; }
    p.commodityPass.industries.forEach((e, i) => { e.modifiers.aiCoreId = [null, 'alpha_core', 'beta_core'][seed % 3]; e.modifiers.improved = (seed + i) % 2 === 0; e.operating.disrupted = (seed + i) % 7 === 0; e.operating.building = seed % 5 === 0; e.operating.upgradeId = seed % 10 === 0 ? R.industries[e.state.industryId].upgrade : null; if (R.industries[e.state.industryId].className === 'OrbitalStation') { e.state = structuredClone(e.state); e.state.demand.supplies = stat(f((seed % 7) + 0.9)); e.state.demand.crew = stat(f((seed % 4) + 0.2)); } });
    p.marketCommodities.forEach((c, i) => { c.available = (seed + i) % 11; c.maxDemand = (seed * 3 + i) % 9; c.maxSupply = (seed + i * 2) % 7; c.shippingFaction = seed % 10; c.maxExportFaction = (seed * 2 + i) % 8; });
    p.commodityPass.available.heavy_machinery = com(p, 'heavy_machinery').available;
    const required = { lightindustry: ['organics'], refining: ['heavy_machinery', 'ore', 'rare_ore'], heavyindustry: ['metals', 'rare_metals'], orbitalworks: ['metals', 'rare_metals'], fuelprod: ['volatiles'] };
    if (p.commodityPass.industries.some(e=>Object.hasOwn(required,e.state.industryId))) {
      for (const e of p.commodityPass.industries) for (const id of required[e.state.industryId] ?? []) p.commodityPass.available[id]=com(p,id).available;
      p.commodityPass.production={productionQuality:stat().modifiers,previousStability:p.previousStability,adminFuelSupplyBonus:0};
    }
    if(p.commodityPass.industries.some(e=>Object.hasOwn(ORIGINAL_SPECIAL_INDUSTRIES.industries,e.state.industryId))){
      for(const e of p.commodityPass.industries)for(const id of e.state.industryId==='lionsguard'?['hand_weapons']:e.state.industryId==='cryosanctum'?['supplies','organics']:[])p.commodityPass.available[id]=com(p,id).available;
      p.commodityPass.special={factionId:seed%2?'independent':'sindrian_diktat',techMiningMult:stat(1)};
    }
    for (let iteration = 0; iteration < 3; iteration++) { const r = run(p); cases.push({ input: p, commodityEffects: r.commodityEffects }); expected.push({ ...Object.fromEntries(['stability', 'incomeMult', 'upkeepMult', 'maxIndustries', 'values'].map(k => [k, r[k]])), industryFinancialInputs: r.diagnostics.industryFinancialInputs }); p = next(p, r); }
  }
  const actual = nativeStabilitySnapshots(cases); assert.equal(actual.length, 216); for (let i = 0; i < actual.length; i++) assert.deepEqual(actual[i], expected[i], 'native snapshot ' + i);
});


test('native underscore-prefixed modifier IDs do not weaken world entity identifier validation', () => {
  assert.equal(stabilityValue(stat(0, [mod('_ind_population_3_ms', 5)])), 5);
  rejects(() => identifier('_ind_population_3_ms'));
  for (const id of ['__proto__', 'constructor', 'prototype', 'x y']) rejects(() => stabilityValue(stat(0, [mod(id, 1)])));
});
