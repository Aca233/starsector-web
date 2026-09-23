import test from 'node:test';
import assert from 'node:assert/strict';
import { reapplyOriginalEnvironmentalFinancialPass as run } from '../src/campaign/rules/OriginalColonyEnvironment.mjs';
import { newOriginalIndustryFinances as finances, ORIGINAL_MARKET_FINANCE } from '../src/campaign/rules/OriginalMarketFinance.mjs';
import { newOriginalCivicIndustry } from '../src/campaign/rules/OriginalCivicIndustries.mjs';
import { newOriginalResourceIndustry } from '../src/campaign/rules/OriginalResourceIndustries.mjs';
import { newOriginalSpecialIndustry } from '../src/campaign/rules/OriginalSpecialIndustries.mjs';
import { stat, put } from '../src/campaign/rules/OriginalIndustryState.mjs';
import { nativeAdditionalConditionsOracle } from './campaign-additional-conditions-native-oracle.mjs';
import { conditionPhaseOracleVector } from './campaign-condition-phase-native-oracle.mjs';
import { nativeStabilitySnapshots } from './campaign-stability-native-oracle.mjs';
import { nativeFinanceSnapshots } from './campaign-finance-native-oracle.mjs';
const blank = (base = 0) => ({ base, modifiers: { flat: [], percent: [], mult: [] } }), f = Math.fround;
function entry(id) { return { state: ['farming', 'mining', 'aquaculture'].includes(id) ? newOriginalResourceIndustry(id) : ['commerce', 'techmining'].includes(id) ? newOriginalSpecialIndustry(id) : newOriginalCivicIndustry(id), operating: { disrupted: false, building: false, upgradeId: null }, modifiers: { aiCoreId: null, improved: false, adminSupplyBonus: 0, adminDemandReduction: 0, supplyBonusFromOther: blank(), demandReductionFromOther: blank(), specialItemId: null } }; }
function request(ids = ['population', 'spaceport', 'farming'], conditionIds = ['habitable', 'farmland_rich', 'hot', 'solar_array', 'luddic_majority', 'shipping_disruption', 'free_market', 'comm_relay']) {
    const commodityIds = ['food', 'organics', 'domestic_goods', 'luxury_goods', 'drugs', 'organs', 'supplies', 'fuel', 'ships', 'crew', 'marines', 'hand_weapons', 'heavy_machinery'];
    const conditions = conditionIds.map((id, n) => ({ id, modId: id + '_' + n, surveyed: true, suppressed: false }));
    const contextByModId = Object.fromEntries(conditions.map(c => [c.modId, c.id === 'luddic_majority' ? { playerOwned: true, madeChurchDeal: false, habitable: conditionIds.includes('habitable'), adminId: null, defeatedExpedition: false, constructionQueue: [] } : c.id === 'shipping_disruption' ? { marketSize: 6, playerOwned: true, shippingLost: blank(3) } : c.id === 'free_market' ? { daysActive: 365 } : c.id === 'comm_relay' ? { hasContainingLocation: true, relays: [{ id: 'relay', sameFaction: true, nonFunctional: false, makeshift: false }] } : c.id === 'recent_unrest' ? { penalty: 3 } : null]));
    const state = { hazard: blank(1), stability: blank(), accessibility: blank().modifiers, officerMercProbability: blank().modifiers, suppressedConditionIds: [], immigrationModifiers: { permanent: [], transient: [] }, commodities: commodityIds.map(commodityId => ({ commodityId, maxSupply: 6, available: blank(6) })) };
    const industries = ids.map(entry), commodityPass = { marketSize: 6, freePort: false, factionIllegalCommodityIds: [], conditions, industries, available: { heavy_machinery: 6 }, commodities: commodityIds.map(commodityId => ({ commodityId, previousSupplyLegal: true, previousDemandLegal: true })), conditionPhase: { state, contextByModId }, ...(ids.some(id => ['commerce', 'techmining'].includes(id)) ? { special: { factionId: 'independent', techMiningMult: blank(1) } } : {}) };
    const local = { commodityPass, stability: structuredClone(state.stability), incomeMult: blank(1), upkeepMult: blank(1), maxIndustries: blank().modifiers, previousStability: 4, governance: { marketId: 'm', markets: [{ marketId: 'm', playerOwned: true, adminIsPlayer: false }], maxOutposts: 2 }, constructionQueue: [], conditionStateByModId: Object.fromEntries(conditions.filter(c => ['free_market', 'comm_relay', 'recent_unrest'].includes(c.id)).map(c => [c.modId, structuredClone(contextByModId[c.modId])])), marketCommodities: commodityIds.map(commodityId => ({ commodityId, maxSupply: 6, maxDemand: 6, available: 6, shippingFaction: 6, maxExportFaction: 6 })) };
    put(local.upkeepMult, 'mult', 'upkeep_hazard_mod', 2);
    return { hazard: structuredClone(state.hazard), modifiers: structuredClone(state.immigrationModifiers), financial: { local, industryFinances: ids.map(finances) } };
}
function loss(p, id, amount) { const s = p.financial.local.commodityPass.conditionPhase.state.commodities.find(c => c.commodityId === id); put(s.available, 'flat', 'sh_loss_' + id, -amount); p.financial.local.marketCommodities.find(c => c.commodityId === id).available = Math.max(0, Math.floor(stat(s.available) + 0.5)); if (id === 'heavy_machinery')
    p.financial.local.commodityPass.available.heavy_machinery = Math.max(0, Math.floor(stat(s.available) + 0.5)); }
function next(p, r) { const q = structuredClone(p), local = q.financial.local, effects = r.financial.localEffects, phase = effects.commodityEffects.conditionPhase; local.commodityPass.conditions = structuredClone(phase.conditions); local.commodityPass.industries = structuredClone(effects.commodityEffects.industries); q.hazard = structuredClone(r.environment.hazard); q.modifiers = structuredClone(r.environment.modifiers); local.stability = structuredClone(effects.stability); local.incomeMult = structuredClone(effects.incomeMult); local.upkeepMult = structuredClone(effects.upkeepMult); local.maxIndustries = structuredClone(effects.maxIndustries); local.marketCommodities = structuredClone(effects.diagnostics.marketCommodities); local.commodityPass.conditionPhase.state = { ...structuredClone(phase.state), hazard: q.hazard, stability: local.stability, immigrationModifiers: q.modifiers }; local.commodityPass.available.heavy_machinery = local.marketCommodities.find(c => c.commodityId === 'heavy_machinery').available; q.financial.industryFinances = r.financial.industries.map(i => structuredClone(i.state)); return q; }
test('shared environmental/financial entry runs conditions once, retaining solar/hot first-pass hazard', () => {
    const p = request(['population', 'spaceport'], ['hot', 'solar_array']), before = structuredClone(p), r = run(p);
    assert.deepEqual(p, before);
    assert.equal(r.environment.hazardValue, 1.25);
    assert.equal(r.financial.localEffects.diagnostics.hazardBeforeConditions, 1);
    assert.equal(r.financial.localEffects.diagnostics.hazardAfterConditions, 1.25);
    assert.equal(r.financial.localEffects.commodityEffects.conditionPhase.execution.visited, 2);
    const second = run(next(p, r));
    assert.equal(second.environment.hazardValue, 1);
    assert.equal(second.financial.localEffects.diagnostics.hazardBeforeConditions, 1.25);
});
test('shipping recovery affects population shortages, local import maintenance credit, and port upkeep together', () => {
    const p = request(['population', 'spaceport'], ['habitable', 'shipping_disruption']);
    for (const id of ['food', 'fuel', 'supplies', 'ships'])
        loss(p, id, 5);
    const healed = run(p), without = structuredClone(p);
    without.financial.local.commodityPass.conditionPhase.contextByModId.shipping_disruption_1.playerOwned = false;
    const shortage = run(without);
    assert.equal(healed.financial.localEffects.values.rawStability - shortage.financial.localEffects.values.rawStability, 5);
    assert.equal(healed.financial.localEffects.diagnostics.inFactionUpkeep.multiplier, 0.5);
    assert.ok(shortage.financial.localEffects.diagnostics.inFactionUpkeep.multiplier > 0.5);
    assert.equal(healed.financial.industries[1].diagnostics.portDeficit.deficit, 0);
    assert.ok(shortage.financial.industries[1].diagnostics.portDeficit.deficit > 0);
    assert.equal(healed.financial.localEffects.diagnostics.marketCommodities.find(c => c.commodityId === 'food').available, 6);
    assert.equal(p.financial.local.marketCommodities[0].available, 1);
});
test('hazard updates after industry refresh while commerce changes only later industry income reads', () => {
    const p = request(['commerce', 'population', 'farming'], ['hot', 'solar_array']);
    const r = run(p), reads = r.financial.localEffects.diagnostics.industryFinancialInputs;
    assert.equal(reads[0].incomeMult, 1);
    assert.equal(reads[1].incomeMult, 1);
    assert.equal(reads[0].upkeepMult, 2);
    assert.equal(reads[1].upkeepMult, 1);
    assert.equal(r.financial.localEffects.values.upkeepMult, f(1.25 * 0.5));
    assert.equal(r.financial.industries[0].state.income.modifiers.mult.find(m => m.id === 'ind_stability')?.value ?? 1, reads[0].incomeMult);
});
test('condition registrations are not replayed and industry registrations keep functional native exceptions', () => {
    const p = request(['farming', 'spaceport', 'population', 'commerce', 'techmining'], ['habitable', 'farmland_rich', 'mild_climate', 'free_market']);
    p.financial.local.commodityPass.industries[1].operating.disrupted = true;
    p.financial.local.commodityPass.industries[3].operating.disrupted = true;
    p.financial.local.commodityPass.industries[4].operating.disrupted = true;
    const r = run(p);
    assert.deepEqual(r.environment.modifiers.permanent, [{ kind: 'condition', id: 'farmland_rich_1' }]);
    assert.deepEqual(r.environment.modifiers.transient.map(m => m.kind + ':' + m.id), ['condition:habitable_0', 'condition:mild_climate_2', 'condition:free_market_3', 'industry:farming', 'industry:population', 'industry:techmining']);
});
test('duplicated financial captures must agree with the shared draft including modifier identity and cache order', () => {
    for (const edit of [p => p.financial.local.stability.base = 1, p => p.hazard.base = 2, p => p.modifiers.transient.push({ kind: 'condition', id: 'habitable_0' }), p => p.financial.local.marketCommodities[0].maxSupply = 9, p => p.financial.local.marketCommodities[0].available = 5, p => p.financial.local.conditionStateByModId.free_market_6.daysActive = 0, p => delete p.financial.local.conditionStateByModId.comm_relay_7]) {
        const p = request();
        edit(p);
        assert.throws(() => run(p), /Conflicting|captures|context|roster/);
    }
    const r = run(request());
    assert.throws(() => r.financial.localEffects.diagnostics.marketCommodities[0].available = 0, TypeError);
    assert.ok(!Object.hasOwn(r, 'readyForAuthority'));
});
test('differential chain: original conditions feed original industry stability and original financial refresh', t => {
    const requests = [], results = [], phaseVectors = [];
    const orders = [['population', 'spaceport', 'farming'], ['farming', 'population', 'megaport'], ['commerce', 'population', 'spaceport'], ['population', 'commerce', 'techmining'], ['orbitalstation', 'population', 'grounddefenses']];
    for (let n = 0; n < 15; n++) {
        let p = request(orders[n % 5]);
        p.financial.local.previousStability = n % 11;
        for (const id of ['food', 'fuel', 'supplies', 'ships', 'heavy_machinery'])
            if (n % 3 !== 0)
                loss(p, id, n % 3 === 1 ? 5 : 2);
        for (const e of p.financial.local.commodityPass.industries) {
            e.modifiers.aiCoreId = n % 3 === 0 ? 'alpha_core' : null;
            e.modifiers.improved = n % 2 === 0;
            e.operating.disrupted = n % 7 === 0;
            if (e.state.industryId === 'commerce' && n % 2 === 0)
                e.modifiers.specialItemId = 'dealmaker_holosuite';
        }
        for (let step = 0; step < 2; step++) {
            const result = run(p), l = p.financial.local;
            requests.push(p);
            results.push(result);
            phaseVectors.push(conditionPhaseOracleVector({ marketSize: l.commodityPass.marketSize, conditions: l.commodityPass.conditions, industries: l.commodityPass.industries, ...l.commodityPass.conditionPhase }));
            p = next(p, result);
        }
    }
    const nativePhases = nativeAdditionalConditionsOracle(phaseVectors), nativeInputs = [];
    for (let n = 0; n < requests.length; n++) {
        const p = structuredClone(requests[n].financial.local), native = nativePhases[n];
        p.hazard = stat(native.state.hazard);
        p.stability = native.state.stability;
        p.commodityPass.conditions = native.conditions;
        p.commodityPass.industries = native.industries;
        const nativeCommodities = new Map(native.state.commodities.map(c => [c.commodityId, c]));
        p.marketCommodities = p.marketCommodities.map(c => ({ ...c, available: Math.max(0, Math.floor(stat(nativeCommodities.get(c.commodityId).available) + 0.5)) }));
        nativeInputs.push({ input: p, commodityEffects: results[n].financial.localEffects.commodityEffects, conditionsAlreadyApplied: true });
    }
    const nativeStability = nativeStabilitySnapshots(nativeInputs), industryCases = [], locations = [];
    for (let n = 0; n < nativeStability.length; n++) {
        const actual = results[n].financial.localEffects, expected = nativeStability[n];
        assert.deepEqual({ ...Object.fromEntries(['stability', 'incomeMult', 'upkeepMult', 'maxIndustries', 'values'].map(k => [k, actual[k]])), industryFinancialInputs: actual.diagnostics.industryFinancialInputs }, expected, 'native financial market ' + n);
        const p = requests[n].financial.local, rows = new Map(nativeInputs[n].input.marketCommodities.map(c => [c.commodityId, c]));
        for (let i = 0; i < p.commodityPass.industries.length; i++) {
            const e = p.commodityPass.industries[i], read = expected.industryFinancialInputs[i], after = actual.commodityEffects.industries[i].state;
            const portInputs = ORIGINAL_MARKET_FINANCE.industries[e.state.industryId].className === 'Spaceport' ? { demand: Object.fromEntries(['fuel', 'supplies', 'ships'].map(id => [id, after.demand[id]])), available: Object.fromEntries(['fuel', 'supplies', 'ships'].map(id => [id, rows.get(id).available])) } : null;
            industryCases.push({ state: requests[n].financial.industryFinances[i], marketSize: p.commodityPass.marketSize, phase: 'industry-apply', marketIncomeMult: read.incomeMult, marketUpkeepMult: read.upkeepMult, operating: e.operating, aiCoreId: e.modifiers.aiCoreId, specialItemId: e.modifiers.specialItemId, portInputs, ...(['commerce', 'techmining'].includes(e.state.industryId) ? { specialContext: { factionId: p.commodityPass.special.factionId, conditionIds: p.commodityPass.conditions.map(c => c.id) } } : {}) });
            locations.push([n, i]);
        }
    }
    const nativeFinance = nativeFinanceSnapshots(industryCases, []);
    for (let j = 0; j < nativeFinance.length; j++) {
        const [n, i] = locations[j], actual = results[n].financial.industries[i];
        assert.deepEqual({ state: actual.state, income: actual.income, upkeep: actual.upkeep }, nativeFinance[j], 'native industry financial ' + n + '/' + i);
    }
    t.diagnostic(nativePhases.length + ' original condition stages -> ' + nativeStability.length + ' original market financial stages -> ' + nativeFinance.length + ' original industry financial refreshes matched');
});


import {nativeGovernedSkillSnapshots} from './campaign-governed-skills-native-oracle.mjs';
test('native chain: eight shared condition -> governed skills -> industry financial stages retain separate snapshots',()=>{
 const inputs=[],results=[],vectors=[];
 for(let n=0;n<8;n++){
  const p=request(['population','spaceport','farming']);const l=p.financial.local,c=l.commodityPass;
  const skills=['hypercognition','planetary_operations','space_operations'].map((skillId,i)=>({skillId,level:n&(1<<i)?1:0}));if(n%2)skills.reverse();
  c.governedSkills={skills,combatFleetSize:null,groundDefenses:null};
  put(l.stability,'flat','hypercognition_GO_3',9);put(c.conditionPhase.state.stability,'flat','hypercognition_GO_3',9);
  put({modifiers:c.conditionPhase.state.accessibility},'flat','space_operations_GO_0',-1);
  inputs.push(p);results.push(run(p));vectors.push(conditionPhaseOracleVector({marketSize:c.marketSize,conditions:c.conditions,industries:c.industries,...c.conditionPhase}));
 }
 const phases=nativeAdditionalConditionsOracle(vectors);
 const governed=nativeGovernedSkillSnapshots(inputs.map((p,i)=>({skills:p.financial.local.commodityPass.governedSkills.skills,state:{accessibility:phases[i].state.accessibility,stability:phases[i].state.stability,combatFleetSize:null,groundDefenses:null}})));
 const nativeInputs=inputs.map((p,i)=>{
  const l=structuredClone(p.financial.local),phase=phases[i];l.hazard=stat(phase.state.hazard);l.stability=governed[i].stability;l.commodityPass.conditions=phase.conditions;l.commodityPass.industries=phase.industries;
  const rows=new Map(phase.state.commodities.map(c=>[c.commodityId,c]));l.marketCommodities=l.marketCommodities.map(c=>({...c,available:Math.max(0,Math.floor(stat(rows.get(c.commodityId).available)+0.5))}));
  return {input:l,commodityEffects:results[i].financial.localEffects.commodityEffects,conditionsAlreadyApplied:true};
 });
 const native=nativeStabilitySnapshots(nativeInputs);
 results.forEach((r,i)=>{
  const local=r.financial.localEffects,c=local.commodityEffects;
  assert.deepEqual(c.conditionPhase.state.stability,phases[i].state.stability);assert.deepEqual(c.conditionPhase.state.accessibility,phases[i].state.accessibility);
  assert.deepEqual(c.governedSkillsPhase.state,governed[i]);assert.equal(c.conditionPhase.execution.visited,inputs[i].financial.local.commodityPass.conditions.length);
  assert.deepEqual({...Object.fromEntries(['stability','incomeMult','upkeepMult','maxIndustries','values'].map(k=>[k,local[k]])),industryFinancialInputs:local.diagnostics.industryFinancialInputs},native[i],'governed financial chain '+i);
 });
});
