import test from 'node:test';
import assert from 'node:assert/strict';
import { CampaignError } from '../src/campaign/core/Values.mjs';
import { computeOriginalIncoming } from '../src/campaign/rules/OriginalImmigration.mjs';
import { advanceOriginalPopulation, newOriginalPopulation } from '../src/campaign/rules/OriginalPopulation.mjs';
import { replaceOriginalPopulationConditions, reapplyOriginalPopulationGrowth as reapply } from '../src/campaign/rules/OriginalPopulationGrowth.mjs';
import { reapplyOriginalIndustryAccessibility as access, reapplyOriginalLocalAccessibility } from '../src/campaign/rules/OriginalMarketAccessibility.mjs';
import { newOriginalIndustryFinances } from '../src/campaign/rules/OriginalMarketFinance.mjs';
import { nativeAdditionalConditionsOracle } from './campaign-additional-conditions-native-oracle.mjs';
import { conditionPhaseOracleVector } from './campaign-condition-phase-native-oracle.mjs';
import { nativeAccessibilityOracle } from './campaign-accessibility-native-oracle.mjs';
import { mod, stat, condition, callback, request, financialInput, value } from './campaign-immigration-fixtures.mjs';
const rejects = fn => assert.throws(fn, e => e instanceof CampaignError);
function immigration(size = 5, hotFirst = true) {
    const p = request(['population', 'spaceport', 'farming']);
    p.market.size = p.neighbors.markets[0].size = size;
    p.conditions = ['habitable', 'farmland_rich', 'mild_climate', 'luddic_majority', ...(hotFirst ? ['hot', 'solar_array'] : ['solar_array', 'hot']), 'high_gravity', 'shipping_disruption', 'free_market', 'population_' + size].map(id => condition(id));
    p.luddicMajorityState = { playerOwned: true, defeatedExpedition: true };
    p.freeMarketDaysByModId = { free_market: 100 };
    p.modifiers.transient.push(callback('condition', 'habitable'), callback('condition', 'mild_climate'), callback('condition', 'luddic_majority'));
    p.days = 30;
    return p;
}
function growthInput(p = immigration()) {
    const l = financialInput(p.industries.map(e => e.state.industryId));
    l.commodityPass.marketSize = p.market.size;
    l.commodityPass.conditions = p.conditions; l.commodityPass.industries = p.industries;
    l.governance.markets[0].playerOwned = p.luddicMajorityState.playerOwned;
    l.conditionStateByModId = { free_market: { daysActive: p.freeMarketDaysByModId.free_market } };
    l.constructionQueue = p.constructionQueue;
    const state = { hazard: stat(1), accessibility: p.accessibility, stability: l.stability, officerMercProbability: stat().modifiers, suppressedConditionIds: p.conditions.filter(c => c.suppressed).map(c => c.id), immigrationModifiers: p.modifiers, commodities: l.marketCommodities.map(c => ({ commodityId: c.commodityId, maxSupply: c.maxSupply, available: stat(c.available) })) };
    const drugs = state.commodities.find(c => c.commodityId === 'drugs'); drugs.available.modifiers.flat.push(mod('sh_loss_test', -18));
    l.marketCommodities.find(c => c.commodityId === 'drugs').available = 2;
    const contextByModId = Object.fromEntries(p.conditions.map(c => [c.modId, c.id === 'luddic_majority' ? { ...p.luddicMajorityState, madeChurchDeal: false, habitable: true, adminId: null, constructionQueue: p.constructionQueue } : c.id === 'free_market' ? { daysActive: p.freeMarketDaysByModId[c.modId] } : c.id === 'shipping_disruption' ? { marketSize: p.market.size, playerOwned: true, shippingLost: stat(2) } : null]));
    l.commodityPass.conditionPhase = { state, contextByModId };
    return { fromSize: p.market.size - 1, immigration: p, environmentalFinancial: { hazard: state.hazard, modifiers: state.immigrationModifiers, financial: { local: l, industryFinances: p.industries.map(e => newOriginalIndustryFinances(e.state.industryId)) } }, hasSpaceport: true, firstQueuedIndustryHasSpaceportTag: false };
}
const industryInput = (p, bonus) => ({ accessibility: bonus, hasSpaceport: p.hasSpaceport, marketSize: p.immigration.market.size, firstQueuedIndustryHasSpaceportTag: p.firstQueuedIndustryHasSpaceportTag, industries: p.immigration.industries.map(e => ({ industryId: e.state.industryId, operating: e.operating, aiCoreId: e.modifiers.aiCoreId, improved: e.modifiers.improved, specialItemId: e.modifiers.specialItemId })) });

test('growth consumes one shared condition pass, final suppression, industry accessibility and recovered drug availability', () => {
    for (const hotFirst of [true, false]) {
        const p = growthInput(immigration(5, hotFirst)), before = structuredClone(p), r = reapply(p), incoming = computeOriginalIncoming(r.immigration);
        assert.equal(r.immigration.conditions.find(c => c.id === 'hot').suppressed, true);
        assert.equal(r.immigration.hazard, hotFirst ? 1.25 : 1); // One native ordered pass, not a fixed point.
        assert.equal(r.immigration.drugsAvailable, 20);
        assert.equal(p.environmentalFinancial.financial.local.marketCommodities.find(c => c.commodityId === 'drugs').available, 2);
        assert.equal(value(incoming.incoming.weight, 'luddic_majority'), 50);
        assert.equal(value(incoming.incoming.weight, 'mild_climate'), 5);
        assert.ok(r.immigration.accessibility.flat.some(m => m.id === 'high_gravity'));
        assert.ok(r.immigration.accessibility.flat.some(m => m.id === 'shipping_disruption'));
        assert.ok(r.immigration.accessibility.flat.some(m => m.id === 'ind_population_1'));
        assert.equal(r.accessibility.scope, 'industry-accessibility-effects-only');
        assert.deepEqual(p, before);
        assert.ok(Object.isFrozen(r.immigration.conditions));
    }
});
test('growth rejects conflicting Church/ownership/access captures rather than combining incompatible states', () => {
    for (const mutate of [
        p => p.immigration.accessibility = stat().modifiers,
        p => p.environmentalFinancial.financial.local.commodityPass.conditionPhase.contextByModId.luddic_majority.playerOwned = false,
        p => p.environmentalFinancial.financial.local.commodityPass.conditionPhase.contextByModId.luddic_majority.defeatedExpedition = false,
        p => p.environmentalFinancial.financial.local.governance.markets[0].playerOwned = false,
    ]) { const p = growthInput(); mutate(p); rejects(() => reapply(p)); }
});
test('actual population threshold invokes shared growth reapplication and keeps pre-growth incoming for this advance', () => {
    const p = immigration(4), input = { immigration: p, population: structuredClone(newOriginalPopulation('player', 4)), previousIncoming: { composition: [], weight: stat() }, playerOwned: true, inNewGameAdvance: false };
    input.population.weight.modifiers.flat[0].value = 1199;
    const computed = computeOriginalIncoming(p); let growth;
    const r = advanceOriginalPopulation(input, q => {
        const next = structuredClone(q.immigration);
        next.conditions = replaceOriginalPopulationConditions({ conditions: next.conditions, fromSize: q.plan.fromSize, newModId: 'population_5_new', suppressed: false });
        next.market.size = next.neighbors.markets[0].size = q.plan.toSize;
        growth = reapply(growthInput(next));
        return { immigration: growth.immigration, playerOwned: true, inNewGameAdvance: false, effects: growth };
    });
    assert.equal(r.growths.length, 1);
    assert.equal(r.state.immigration.market.size, 5);
    assert.equal(r.state.immigration.drugsAvailable, 20);
    assert.deepEqual(r.state.previousIncoming, computed.incoming);
    assert.deepEqual(r.notifications, [{ type: 'colony-size-increased', marketId: 'm', size: 5 }]);
    assert.equal(value(computeOriginalIncoming(r.state.immigration).incoming.weight, 'luddic_majority'), 50);
    assert.equal(value(r.state.previousIncoming.weight, 'luddic_majority'), 40);
    assert.equal(growth.environmentalFinancial.financial.localEffects.commodityEffects.conditionPhase.execution.visited, p.conditions.length);
});
test('industry-only accessibility accepts known production/special industries and only supported neutral item bindings', () => {
    const ids = ['population', 'heavyindustry', 'orbitalworks', 'fuelprod', 'refining', 'lightindustry', 'commerce', 'techmining', 'cryosanctum', 'lionsguard'];
    const p = immigration(); p.industries = request(ids).industries;
    const items = [null, 'corrupted_nanoforge', 'pristine_nanoforge', 'synchrotron', 'catalytic_core', 'biofactory_embryo', 'dealmaker_holosuite', null, null, null];
    p.industries.forEach((e, i) => e.modifiers.specialItemId = items[i]);
    const a = industryInput({ immigration: p, hasSpaceport: true, firstQueuedIndustryHasSpaceportTag: false }, p.accessibility);
    const r = access(a), plain = structuredClone(a); plain.industries.forEach(e => e.specialItemId = null);
    assert.deepEqual(access(plain), r);
    const legacy = reapplyOriginalLocalAccessibility({ ...a, conditions: [], freeMarketDaysByModId: {} });
    assert.deepEqual(legacy.accessibility, r.accessibility);
    a.industries[0].specialItemId = 'pristine_nanoforge'; rejects(() => access(a));
    a.industries[0].specialItemId = null; a.industries[1].specialItemId = 'fullerene_spool'; rejects(() => access(a));
});
test('native chain: 12 original condition phases feed original industry accessibility without a second condition loop', () => {
    const inputs = [], results = [], vectors = [];
    for (let n = 0; n < 12; n++) {
        const p = growthInput(immigration(4 + n % 3, n % 2 === 0));
        p.hasSpaceport = n % 3 === 0;
        p.firstQueuedIndustryHasSpaceportTag = n % 4 === 0;
        if (n % 2) { p.immigration.industries.reverse(); p.environmentalFinancial.financial.industryFinances.reverse(); }
        for (const e of p.immigration.industries) { e.modifiers.aiCoreId = n % 2 ? 'alpha_core' : null; e.modifiers.improved = n % 3 === 0; e.operating.disrupted = n % 5 === 0; }
        const cp = p.environmentalFinancial.financial.local.commodityPass;
        inputs.push(p); results.push(reapply(p)); vectors.push(conditionPhaseOracleVector({ marketSize: cp.marketSize, conditions: cp.conditions, industries: cp.industries, ...cp.conditionPhase }));
    }
    const phases = nativeAdditionalConditionsOracle(vectors);
    const native = nativeAccessibilityOracle([], [], inputs.map((p, i) => industryInput(p, phases[i].state.accessibility)));
    assert.equal(native.length, 12);
    results.forEach((r, i) => {
        assert.deepEqual(r.immigration.conditions, phases[i].conditions, 'native suppression ' + i);
        assert.deepEqual({ accessibility: r.accessibility.accessibility, hasSpaceport: r.accessibility.hasSpaceport, value: r.accessibility.value }, native[i], 'native accessibility chain ' + i);
        assert.ok(!Object.hasOwn(r, 'readyForAuthority'));
    });
});


test('installed spool participates in legacy and shared growth only with an explicit actual planet getter', () => {
    rejects(()=>reapply(null));
    for (const shared of [false,true]) for (const gas of [null,false,true]) for (const blocked of [false,true]) {
        const p = shared ? immigration() : request(['population','spaceport']);
        p.market.size = p.neighbors.markets[0].size = 5;
        if (!shared) p.conditions = [condition('habitable'),condition('population_5')];
        if (blocked) p.conditions.push({...condition('extreme_weather'),surveyed:false,suppressed:true});
        p.industries.find(e=>e.state.industryId==='spaceport').modifiers.specialItemId='fullerene_spool';
        let q;
        if(shared) q=growthInput(p);
        else {
            const l=financialInput(['population','spaceport']);
            l.commodityPass.conditions=p.conditions;l.commodityPass.industries=p.industries;l.constructionQueue=p.constructionQueue;
            q={fromSize:4,immigration:p,environmentalFinancial:{hazard:stat(1),modifiers:p.modifiers,financial:{local:l,industryFinances:p.industries.map(e=>newOriginalIndustryFinances(e.state.industryId))}},hasSpaceport:true,firstQueuedIndustryHasSpaceportTag:false};
        }
        rejects(()=>reapply(q));
        q.planetIsGasGiant=gas;
        const before=structuredClone(q),r=reapply(q);
        assert.deepEqual(q,before);
        assert.equal(r.accessibility.scope,shared?'industry-accessibility-effects-only':'local-accessibility-effects-only');
        assert.equal(r.immigration.accessibility.flat.find(m=>m.id==='fullerene_spool')?.value,gas===true||blocked?undefined:Math.fround(0.3));
        assert.equal(r.immigration.industries.find(e=>e.state.industryId==='spaceport').modifiers.specialItemId,'fullerene_spool');
        assert.doesNotThrow(()=>computeOriginalIncoming(r.immigration));
        if(blocked) assert.ok(r.immigration.conditions.find(c=>c.id==='extreme_weather').suppressed);
        q.planetIsGasGiant=undefined;rejects(()=>reapply(q));
    }
    const noItem=growthInput();noItem.planetIsGasGiant=false;rejects(()=>reapply(noItem));
});

test('native growth chain carries spool through original shared conditions and original industry access', () => {
    const inputs=[],results=[],vectors=[];
    for(const gas of [null,false,true]) for(let mask=0;mask<4;mask++) {
        const p=immigration(5,mask%2===0);
        for(const id of [...(mask&1?['extreme_weather']:[]),...(mask&2?['extreme_tectonic_activity']:[])]) p.conditions.push({...condition(id),surveyed:false,suppressed:true});
        const port=p.industries.find(e=>e.state.industryId==='spaceport');port.modifiers.specialItemId='fullerene_spool';port.modifiers.aiCoreId='alpha_core';port.modifiers.improved=true;
        const q={...growthInput(p),planetIsGasGiant:gas},c=q.environmentalFinancial.financial.local.commodityPass;
        inputs.push(q);results.push(reapply(q));vectors.push(conditionPhaseOracleVector({marketSize:c.marketSize,conditions:c.conditions,industries:c.industries,...c.conditionPhase}));
    }
    const phases=nativeAdditionalConditionsOracle(vectors);
    const native=nativeAccessibilityOracle([],[],inputs.map((p,i)=>({...industryInput(p,phases[i].state.accessibility),portItemContext:{planetIsGasGiant:p.planetIsGasGiant,conditionIds:[...new Set(phases[i].conditions.map(c=>c.id))]}})));
    results.forEach((r,i)=>{
        assert.deepEqual(r.immigration.conditions,phases[i].conditions,'native installed-item condition chain '+i);
        assert.deepEqual({accessibility:r.accessibility.accessibility,hasSpaceport:r.accessibility.hasSpaceport,value:r.accessibility.value},native[i],'native installed-item growth '+i);
    });
});


test('growth consumes governed skill-end access and stability before ports, including spool, without overwriting condition-end state',()=>{
 for(const level of [0,1,2]){
  const p=immigration();p.industries.find(e=>e.state.industryId==='spaceport').modifiers.specialItemId='fullerene_spool';
  const q={...growthInput(p),planetIsGasGiant:false},c=q.environmentalFinancial.financial.local.commodityPass;
  c.governedSkills={skills:[{skillId:'space_operations',level},{skillId:'hypercognition',level}],combatFleetSize:null,groundDefenses:null};
  const before=structuredClone(q),r=reapply(q),effects=r.environmentalFinancial.financial.localEffects,gov=effects.commodityEffects.governedSkillsPhase;
  assert.deepEqual(q,before);assert.ok(gov);assert.equal(gov.execution.applied.length,level>=1?6:0);
  assert.equal(effects.commodityEffects.conditionPhase.state.accessibility.flat.some(m=>m.id==='space_operations_GO_0'),false);
  assert.equal(r.immigration.accessibility.flat.find(m=>m.id==='space_operations_GO_0')?.value,level>=1?Math.fround(0.3):undefined);
  assert.equal(r.immigration.accessibility.flat.find(m=>m.id==='hypercognition_GO_0')?.value,level>=1?Math.fround(0.1):undefined);
  assert.equal(r.immigration.accessibility.flat.find(m=>m.id==='fullerene_spool')?.value,Math.fround(0.3));
  assert.equal(r.immigration.market.stability,effects.values.stability);
  const expected=access({...industryInput(q,gov.state.accessibility),portItemContext:{planetIsGasGiant:false,conditionIds:[...new Set(r.immigration.conditions.map(c=>c.id))]}});
  assert.deepEqual(r.accessibility,expected);assert.doesNotThrow(()=>computeOriginalIncoming(r.immigration));
 }
});
