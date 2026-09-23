import { ORIGINAL_SPECIAL_INDUSTRIES } from '../src/campaign/rules/OriginalSpecialIndustries.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { CampaignError } from '../src/campaign/core/Values.mjs';
import { ORIGINAL_MARKET_FINANCE as R, newOriginalIndustryFinances as fresh, updateOriginalIndustryFinances as update, reapplyOriginalColonyFinancialPass as local, summarizeOriginalMarketFinances as summarize } from '../src/campaign/rules/OriginalMarketFinance.mjs';
import { resolveOriginalCommodityFinance as group } from '../src/campaign/rules/OriginalCommodityFinance.mjs';
import { newOriginalCivicIndustry } from '../src/campaign/rules/OriginalCivicIndustries.mjs';
import { newOriginalResourceIndustry } from '../src/campaign/rules/OriginalResourceIndustries.mjs';
const f = Math.fround, mod = (id, value) => ({ id, value: f(value) }), stat = (base = 0, flat = [], percent = [], mult = []) => ({ base, modifiers: { flat, percent, mult } });
function request(industryId = 'population') { return { ...(Object.hasOwn(ORIGINAL_SPECIAL_INDUSTRIES.industries,industryId)?{specialContext:{factionId:'sindrian_diktat',conditionIds:[]}}:{}), state: fresh(industryId), marketSize: 6, phase: 'industry-apply', marketIncomeMult: f(0.8), marketUpkeepMult: f(1.5), operating: { disrupted: false, building: false, upgradeId: null }, aiCoreId: null, specialItemId: null, portInputs: R.industries[industryId].className === 'Spaceport' ? { demand: { fuel: stat(4), supplies: stat(4), ships: stat(4) }, available: { fuel: 4, supplies: 4, ships: 4 } } : null }; }
const find = (s, channel, id) => s.modifiers[channel].find(m => m.id === id)?.value;
const rejects = fn => assert.throws(fn, e => e instanceof CampaignError);
function networkInput(n = 3, commodityId = 'food') {
  const markets = Array.from({ length: n }, (_, i) => ({ marketId: 'm' + i, factionId: 'f', size: 4, location: { x: 0, y: 0 }, hidden: false, accessibility: { flat: [mod('core_base', 0.5), mod('port', 0.5)], percent: [], mult: [] }, amounts: { maxSupply: 5, maxDemand: 5, supplyLegal: true, demandLegal: true }, availableBeforeCore: 5, otherAvailableFlat: 0, eventModBeforeCore: 0, tradeMod: { both: 0, plus: 0, minus: 0 } }));
  return { network: { commodityId, econGroup: null, roster: markets.map(m => ({ marketId: m.marketId, econGroup: null })), markets, hostility: n ? { f: {} } : {} }, financialMarkets: markets.map(m => ({ marketId: m.marketId, playerOwned: false, incomeMult: stat(1), playerCommodityExportMult: null })) };
}
function localInput(ids) {
  const commodities = ['food', 'organics', 'domestic_goods', 'luxury_goods', 'drugs', 'organs', 'supplies', 'fuel', 'ships', 'crew', 'marines', 'hand_weapons', 'heavy_machinery'];
  const industries = ids.map(industryId => ({ state: ['mining', 'farming', 'aquaculture'].includes(industryId) ? newOriginalResourceIndustry(industryId) : newOriginalCivicIndustry(industryId), operating: { disrupted: false, building: false, upgradeId: null }, modifiers: { aiCoreId: null, improved: false, adminSupplyBonus: 0, adminDemandReduction: 0, supplyBonusFromOther: stat(), demandReductionFromOther: stat(), specialItemId: null } }));
  return { local: { commodityPass: { marketSize: 6, freePort: false, factionIllegalCommodityIds: [], conditions: [{ id: 'habitable', modId: 'habitable', surveyed: true, suppressed: false }], industries, available: { heavy_machinery: 20 }, commodities: commodities.map(commodityId => ({ commodityId, previousSupplyLegal: true, previousDemandLegal: true })) }, stability: stat(), incomeMult: stat(1), upkeepMult: stat(1, [], [], [mod('upkeep_hazard_mod', 2)]), maxIndustries: stat().modifiers, previousStability: 4, hazard: 1, governance: { marketId: 'm', markets: [{ marketId: 'm', playerOwned: false, adminIsPlayer: false }], maxOutposts: 2 }, constructionQueue: [], conditionStateByModId: {}, marketCommodities: commodities.map(commodityId => ({ commodityId, maxSupply: 4, maxDemand: 4, available: 20, shippingFaction: 4, maxExportFaction: 4 })) }, industryFinances: ids.map(fresh) };
}

test('financial data pins 54 sources and native CSV credits/multipliers rather than using raw cost units', () => { const r = spawnSync(process.execPath, ['scripts/import-campaign-market-finance.mjs', '--check'], { encoding: 'utf8', windowsHide: true }); assert.equal(r.status, 0, r.stdout + r.stderr); assert.equal(Object.keys(R.sources).length, 54); assert.equal(R.industries.population.income, 10000); assert.equal(R.industries.population.upkeep, 1500); assert.equal(R.commodities.food.exportValue, 1000); });
test('base industry finances retain modifier order, native integer base and raw float totals', () => {
  const p = request(); p.state = { ...p.state, income: stat(1, [mod('external', f(0.4)), mod('ind_base', 3)], [mod('pct', 50)], [mod('external_mult', 1.1)]) };
  const r = update(p); assert.equal(r.diagnostics.baseIncome, 40000); assert.equal(r.diagnostics.baseUpkeep, 6000); assert.equal(find(r.state.income, 'mult', 'ind_stability'), f(0.8)); assert.equal(r.upkeep, 9000); assert.deepEqual(r.state.income.modifiers.flat.map(m => m.id), ['external', 'ind_base']);
});
test('alpha/beta upkeep discount excludes gamma; disruption retains upkeep and external income', () => {
  const p = request(); p.state = { ...p.state, income: stat(0, [mod('external', 17)]) }; p.aiCoreId = 'alpha_core'; assert.equal(update(p).upkeep, 6750); p.aiCoreId = 'beta_core'; assert.equal(update(p).upkeep, 6750); p.aiCoreId = 'gamma_core'; assert.equal(update(p).upkeep, 9000);
  p.operating.disrupted = true; const r = update(p); assert.equal(r.income, 17); assert.equal(r.upkeep, 9000); assert.equal(find(r.state.income, 'flat', 'ind_base'), undefined);
});
test('patrol and station apply sizes differ from direct updateIncomeAndUpkeep', () => {
  for (const [id, applySize] of [['patrolhq', 3], ['orbitalstation', 3], ['battlestation_mid', 5], ['starfortress_high', 7]]) { const p = request(id); p.marketSize = 9; assert.equal(update(p).diagnostics.usedSize, applySize); p.phase = 'income-refresh'; assert.equal(update(p).diagnostics.usedSize, 9); }
});
test('spaceport post-demand shortages multiply upkeep and survive shutdown/unapply, but refresh alone does not replace them', () => {
  const p = request('megaport'); p.portInputs.demand.fuel = stat(f(5.9)); p.portInputs.available.fuel = 1; p.aiCoreId = 'alpha_core'; p.operating.disrupted = true;
  const r = update(p); assert.deepEqual(r.diagnostics.portDeficit, { commodityId: 'fuel', deficit: 4 }); assert.equal(find(r.state.upkeep, 'mult', 'deficit'), f(1.4)); assert.equal(r.upkeep, f(f(r.diagnostics.baseUpkeep * f(f(1.5 * 0.75) * f(1.4)))));
  const refreshed = update({ ...p, state: r.state, phase: 'income-refresh', portInputs: null }); assert.equal(find(refreshed.state.upkeep, 'mult', 'deficit'), f(1.4));
  p.portInputs.available.fuel = 9; const cleared = update({ ...p, state: refreshed.state }); assert.equal(find(cleared.state.upkeep, 'mult', 'deficit'), undefined);
});
test('zero-base industry income removes only native owned modifiers, does not reset external stats', () => {
  const p = request('mining'); p.state = { ...p.state, income: stat(2, [mod('ind_base', 10), mod('grant', 7)], [], [mod('ind_stability', 0.5), mod('external', 2)]) };
  const r = update(p); assert.equal(r.income, 18); assert.equal(find(r.state.income, 'mult', 'ind_stability'), undefined); assert.equal(find(r.state.income, 'flat', 'grant'), 7);
});
test('local financial pass respects pre-population reads and post-loop hazard timing', () => {
  const p = localInput(['spaceport', 'population', 'mining']), r = local(p); const reads = r.localEffects.diagnostics.industryFinancialInputs;
  assert.deepEqual(reads.map(v => v.upkeepMult), [2, 1, 1]); assert.deepEqual(reads.map(v => v.incomeMult), [1, f(0.8), f(0.8)]); assert.equal(r.localEffects.values.upkeepMult, 0.5);
  assert.equal(find(r.industries[0].state.upkeep, 'mult', 'ind_hazard'), 2); assert.equal(find(r.industries[2].state.upkeep, 'mult', 'ind_hazard'), 1);
  const next = local({ ...p, local: { ...p.local, commodityPass: { ...p.local.commodityPass, industries: r.localEffects.commodityEffects.industries }, stability: r.localEffects.stability, incomeMult: r.localEffects.incomeMult, upkeepMult: r.localEffects.upkeepMult, maxIndustries: r.localEffects.maxIndustries }, industryFinances: r.industries.map(i => i.state) }); assert.equal(find(next.industries[0].state.upkeep, 'mult', 'ind_hazard'), 0.5);
});
test('market shares use stable largest remainders, including >100 producers and empty groups', () => {
  const r = group(networkInput()); assert.deepEqual(r.markets.map(m => m.exportSharePercent), [34, 33, 33]); assert.deepEqual(r.markets.map(m => m.marketValuePercent), [34, 33, 33]); assert.deepEqual(r.sortedProducers, ['m0', 'm1', 'm2']);
  const many = group(networkInput(121)); assert.equal(many.markets.filter(m => m.exportSharePercent === 1).length, 100); assert.equal(many.markets.filter(m => m.exportSharePercent === 0).length, 21);
  const empty = group(networkInput(0)); assert.equal(empty.marketValue, 0); assert.deepEqual(empty.sortedConsumers, []);
});
test('weights use before-core shipping but after-core accessibility; hidden/illegal producers remain in denominators', () => {
  const p = networkInput(2); p.network.markets[0].accessibility.flat = [mod('core_base', 0.1)]; p.network.markets[0].hidden = true; p.network.markets[0].amounts.supplyLegal = false; p.network.markets[0].amounts.demandLegal = false;
  const r = group(p); assert.equal(r.markets[0].exportedBeforeCore, r.network.access.markets[0].before.shipping.global); assert.equal(r.markets[0].weight, f(r.markets[0].exportedBeforeCore * r.network.access.markets[0].after.value)); assert.ok(r.markets[0].exportSharePercent > 0); assert.equal(r.markets[0].exportIncome, 0); assert.ok(r.markets[0].demandValue > 0);
});
test('player-faction demand exclusion differs from ownership; consumers still include player demand', () => {
  const p = networkInput(2); p.network.markets[0].factionId = 'player'; p.network.hostility = { player: { f: false }, f: { player: false } }; p.financialMarkets[1].playerOwned = true; p.financialMarkets[1].playerCommodityExportMult = f(1.25);
  const r = group(p); assert.equal(r.rawMarketValue, 10000); assert.equal(r.marketValue, 5000); assert.deepEqual(r.markets.map(m => m.marketValuePercent), [50, 50]); assert.equal(r.markets[0].exportIncome, 2500); assert.equal(r.markets[1].exportIncome, 3125);
});
test('zero export-value commodities still have producer shares but no consumer shares or export credits', () => { const r = group(networkInput(3, 'crew')); assert.equal(r.rawMarketValue, 0); assert.deepEqual(r.markets.map(m => m.marketValuePercent), [0, 0, 0]); assert.deepEqual(r.markets.map(m => m.exportSharePercent), [34, 33, 33]); assert.ok(r.markets.every(m => m.exportIncome === 0)); });
test('market getter projection uses complete ordered raw stat sums and explicit captured optional costs', () => {
  const p = { industries: [update(request()).state], commodities: [{ commodityId: 'food', networkInitialized: true, exportIncome: 1001 }, { commodityId: 'fuel', networkInitialized: false, exportIncome: null }], shortageCountering: { enabled: true, cost: f(2.3) }, immigrationIncentives: { enabled: true, cost: 2000 } };
  const r = summarize(p); assert.equal(r.industryIncome, 32000); assert.equal(r.grossIncome, 33001); assert.equal(r.netIncome, f(f(f(33001 - 9000) - f(2.3)) - 2000)); assert.equal(r.scope, 'market-financial-getter-projection-only');
});
test('unsupported/missing phases, roster data and fabricated optional costs reject without changing inputs', () => {
  const p = request(), before = structuredClone(p), r = update(p); assert.deepEqual(p, before); assert.ok(Object.isFrozen(r.state.income.modifiers.flat));
  for (const mutate of [q => { q.state.industryId = 'toString'; }, q => { q.specialItemId = 'corrupted_nanoforge'; }, q => { q.marketIncomeMult = 0.1; }, q => { q.portInputs = {}; }, q => { q.phase = 'complete'; }]) { const q = structuredClone(p); mutate(q); rejects(() => update(q)); }
  const g = networkInput(); g.financialMarkets.reverse(); rejects(() => group(g)); const owned = networkInput(); owned.financialMarkets[0].playerOwned = true; rejects(() => group(owned));
  rejects(() => local({ ...localInput(['population']), industryFinances: [] })); rejects(() => summarize({ industries: [], commodities: [], shortageCountering: { enabled: true, cost: null }, immigrationIncentives: { enabled: false, cost: null } }));
  for (const key of ['inventory', 'asOfTick', 'completedTask', 'accountBalance']) assert.ok(!(key in r));
});

test('native financial methods and largest-remainder sort match 360 industry updates and 122 economy groups', async () => {
  const { nativeFinanceSnapshots } = await import('./campaign-finance-native-oracle.mjs'); const industries = [], groups = [], expected = [];
  for (const id of Object.keys(R.industries)) for (let seed = 0; seed < 12; seed++) {
    const p = request(id); p.marketSize = seed % 10 + 1; p.phase = seed % 2 ? 'income-refresh' : 'industry-apply'; if (p.phase === 'income-refresh') p.portInputs = null;
    p.marketIncomeMult = f((seed % 7) * 0.3); p.marketUpkeepMult = f((seed % 6) * 0.4); p.aiCoreId = [null,'alpha_core','beta_core','gamma_core'][seed % 4]; p.operating = { disrupted: seed % 5 === 0, building: seed % 3 === 0, upgradeId: seed % 6 === 0 ? 'upgrade' : null };
    p.state = { ...p.state, income: stat(f(seed * 0.1), [mod('external', f(2.3)), mod('ind_base', 12)], [mod('pct', 17)], [mod('external_mult', 1.1), mod('ind_stability', 0.5)]), upkeep: stat(1, [mod('ind_base', 100), mod('external', f(0.2))], [], [mod('deficit', 1.2), mod('ind_core', 0.75), mod('external_mult', 1.1)]) };
    if (p.portInputs) for (const [n,k] of ['fuel','supplies','ships'].entries()) { p.portInputs.demand[k] = stat(f(seed + n + 0.9)); p.portInputs.available[k] = (seed + n * 2) % 7; }
    if(p.specialContext){p.specialContext.factionId=seed%2?'independent':'sindrian_diktat';p.specialContext.conditionIds=[[],['ruins_scattered'],['ruins_widespread'],['ruins_extensive'],['ruins_vast']][seed%5];}
    const r = update(p); industries.push(p); expected.push({ state: r.state, income: r.income, upkeep: r.upkeep });
  }
  for (let seed=0;seed<122;seed++) {
    const p = networkInput(seed === 121 ? 121 : seed % 9, ['food','fuel','supplies','crew','ships'][seed % 5]); const factions = new Set();
    p.network.markets.forEach((m,i) => { m.factionId = i % 3 === 0 ? 'player' : 'f' + i % 3; factions.add(m.factionId); m.size = 1 + (seed + i) % 10; m.location = { x: f((i - 3) * seed * 912.3), y: f(seed * i * 17.8) }; m.hidden = i % 3 === 0; m.accessibility.flat = [mod('external', (seed % 7 - 2) * 0.1), mod('core_base', (seed % 5) * 0.2)]; m.accessibility.mult = [mod('mult', 1.1)]; m.amounts = { maxSupply: (seed + i) % 11, maxDemand: (seed * 3 + i * 2) % 12, supplyLegal: (seed + i) % 5 !== 0, demandLegal: (seed + i) % 4 !== 0 }; m.availableBeforeCore = (seed + i * 2) % 9; p.financialMarkets[i].incomeMult = stat(1, [mod('external', f((seed % 3) * 0.2))], [], [mod('income', (seed % 6) * 0.2)]); p.financialMarkets[i].playerOwned = i % 2 === 0; p.financialMarkets[i].playerCommodityExportMult = i % 2 === 0 ? f(1.13) : null; });
    p.network.hostility = Object.fromEntries([...factions].map((a,i) => [a, Object.fromEntries([...factions].filter(b=>b!==a).map((b,n)=>[b,(seed+i+n)%4===0]))]));
    if (seed === 121) { for (const m of p.network.markets) { m.location = { x: 0,y: 0 }; m.accessibility.flat = [mod('external',0.5),mod('core_base',0.5)]; m.amounts.maxSupply = 5; m.availableBeforeCore = 5; } }
    const r = group(p); groups.push({ input: p, network: r.network }); expected.push(Object.fromEntries(['rawMarketValue','marketValue','marketValuePerFaction','totalWeight','markets','sortedProducers','sortedConsumers'].map(k=>[k,r[k]])));
  }
  const actual = nativeFinanceSnapshots(industries, groups); assert.equal(actual.length, 482); for(let i=0;i<actual.length;i++) assert.deepEqual(actual[i],expected[i],'financial native vector '+i);
});

test('export credits use Java float-to-int saturation and truncate negative sub-credit results to positive zero', () => {
  const p = networkInput(1); p.financialMarkets[0].incomeMult = stat(2 ** 24); assert.equal(group(p).markets[0].exportIncome, 2147483647);
  p.financialMarkets[0].incomeMult = stat(-(2 ** 24)); assert.equal(group(p).markets[0].exportIncome, -2147483648);
  p.financialMarkets[0].incomeMult = stat(f(-0.00001)); assert.equal(group(p).markets[0].exportIncome, 0);
});


import {originalCoreEconomyTick,originalCoreEconomyMonthEnd,newOriginalMonthlyReport,originalMonthlyNode,computeOriginalMonthlyTotals,ORIGINAL_MONTHLY_REPORT_IDS as ReportIds} from '../src/campaign/rules/OriginalMonthlyReport.mjs';
test('core monthly accounting retains ordered float totals, real payroll and colony rows, then rolls credits and debt after production',()=>{
 const f=Math.fround,state={scope:'native-core-monthly-accounts',schemaVersion:1,serial:0,current:null,previous:null,credits:{objectRef:'credits',value:10.75},messages:[]};
 state.current=newOriginalMonthlyReport(state);state.previous=newOriginalMonthlyReport(state);state.previous.debt=100;
 const get=(root,...path)=>path.reduce((n,key)=>n.children.find(row=>row[0]===key)[1],root);
 let incentive=123.75,newIncentive=7,productionCalls=0;
 const markets={colony:{objectRef:'colony-ref',name:'Colony',size:4,playerOwned:true,primaryEntity:null},storage:{objectRef:'storage-ref',name:'Storage',size:4,playerOwned:false,primaryEntity:null}};
 const runtime={isTutorialInProgress:()=>false,readFleetPayroll:()=>({crew:3,marines:2,officers:[{id:'merc',objectRef:'merc-ref',name:'Merc',level:2,mercenary:true},{id:'officer',objectRef:'officer-ref',name:'Officer',level:0,mercenary:false}]}),
  marketIds:()=>['storage','colony'],market:id=>markets[id],hasStorageAccess:id=>id==='storage',readStorageValues:()=>({cargo:f(199.9),ships:f(300.9)}),
  readIndustryFinances:()=>[{id:'population',objectRef:'industry-ref',name:'Population',income:1001,upkeep:203}],commodities:()=>[{id:'food',objectRef:'food-ref',name:'Food'}],getExportIncome:()=>301,
  readAdministrators:()=>[{id:'idle',objectRef:'idle-ref',name:'Idle',tier:0,marketName:null},{id:'active',objectRef:'active-ref',name:'Active',tier:1,marketName:'Colony'}],
  getIncentiveCredits:id=>id==='new'?newIncentive:incentive,setIncentiveCredits:(id,v)=>{if(id==='new')newIncentive=v;else incentive=v;},timestamp:()=>123456789,
  doCustomProduction:s=>{productionCalls++;assert.equal(s,state);assert.equal(incentive,0);assert.equal(newIncentive,0);assert.equal(get(s.current.root,ReportIds.LAST_MONTH_DEBT).upkeep,100);originalMonthlyNode(s,s.current.root,ReportIds.PRODUCTION).upkeep=42.25;},
 };
 originalCoreEconomyTick(state,runtime);const root=state.current.root;
 assert.equal(get(root,ReportIds.FLEET,ReportIds.CREW).upkeep,3);assert.equal(get(root,ReportIds.FLEET,ReportIds.MARINES).upkeep,4);
 assert.equal(get(root,ReportIds.FLEET,ReportIds.OFFICERS,'merc').upkeep,260);assert.equal(get(root,ReportIds.FLEET,ReportIds.OFFICERS,'officer').upkeep,50);
 assert.equal(get(root,ReportIds.STORAGE,'storage').upkeep,f(0.4));assert.equal(get(root,ReportIds.OUTPOSTS,ReportIds.ADMIN,'idle').upkeep,25);assert.equal(get(root,ReportIds.OUTPOSTS,ReportIds.ADMIN,'active').upkeep,2000);
 assert.equal(get(root,ReportIds.OUTPOSTS,'colony','industries','population').income,f(100.1));assert.equal(get(root,ReportIds.OUTPOSTS,'colony','exports','food').income,f(30.1));
 assert.equal(root.totalIncome,0); // tick does not opportunistically recompute cached report totals.
 const oldCurrent=state.current,oldPrevious=state.previous,creditsHandle=state.credits;
 markets.new={...markets.colony,objectRef:'new-ref'};runtime.marketIds=()=>['storage','colony','new'];
 const settled=originalCoreEconomyMonthEnd(state,runtime);
 assert.equal(productionCalls,1);assert.equal(state.previous,oldCurrent);assert.notEqual(state.current,oldCurrent);assert.equal(state.credits,creditsHandle);assert.equal(state.previous.previousDebt,oldPrevious.debt);
 assert.equal(settled.total,-2498);assert.equal(settled.creditsBefore,10);assert.equal(settled.debt,2488);assert.equal(state.credits.value,0);assert.equal(state.current.root.children,null);assert.equal(state.messages.length,1);
 assert.equal(get(state.previous.root,ReportIds.OUTPOSTS,'new').children,null); // unbilled new node still has its incentives cleared, as native.
 const snapshot=structuredClone(state);originalCoreEconomyMonthEnd(state,{isTutorialInProgress:()=>true});assert.deepEqual(state,snapshot);
 const ordered=newOriginalMonthlyReport(state);for(const [id,value]of [['b',16777216],['c',1],['a',-16777216]])originalMonthlyNode(state,ordered.root,id).income=value;
 assert.equal(computeOriginalMonthlyTotals(ordered).income,0);
});
