import test from 'node:test';
import assert from 'node:assert/strict';
import { CampaignError } from '../src/campaign/core/Values.mjs';
import { ORIGINAL_ADDITIONAL_CONDITIONS as ADD } from '../src/campaign/rules/OriginalAdditionalConditions.mjs';
import { computeOriginalIncoming as incoming } from '../src/campaign/rules/OriginalImmigration.mjs';
import { reapplyOriginalColonyEnvironment, reapplyOriginalEnvironmentalFinancialPass } from '../src/campaign/rules/OriginalColonyEnvironment.mjs';
import { newOriginalIndustryFinances } from '../src/campaign/rules/OriginalMarketFinance.mjs';
import { advanceOriginalPopulation as advance, newOriginalPopulation } from '../src/campaign/rules/OriginalPopulation.mjs';
import { replaceOriginalPopulationConditions } from '../src/campaign/rules/OriginalPopulationGrowth.mjs';
import { nativeImmigrationSnapshots } from './campaign-immigration-native-oracle.mjs';
import { nativePopulationSnapshots } from './campaign-population-native-oracle.mjs';
import { f, mod, stat, condition, callback, value, request, financialInput } from './campaign-immigration-fixtures.mjs';
const rejects = fn => assert.throws(fn, e => e instanceof CampaignError);
function extended(size = 4, playerOwned = true, defeatedExpedition = false) {
    const p = request(['population', 'spaceport', 'farming']);
    p.market.size = size;
    p.neighbors.markets[0].size = size;
    p.conditions = [condition('mild_climate', 'mild_1'), condition('luddic_majority', 'church_1')];
    p.luddicMajorityState = { playerOwned, defeatedExpedition };
    p.modifiers.transient.push(callback('condition', 'mild_1'), callback('condition', 'church_1'));
    return p;
}
function resultView(r) { return { incoming: r.incoming, weightValue: r.weightValue, positiveWeight: r.positiveWeight, incentives: r.incentives, incentiveMonthlyCost: r.incentiveMonthlyCost }; }
function populationView(r) {
    const s = r.state;
    return { population: s.population, incoming: s.previousIncoming, size: s.immigration.market.size, stability: s.immigration.market.stability, incentives: s.immigration.incentives, playerOwned: s.playerOwned, inNewGameAdvance: s.inNewGameAdvance, calls: [], conditions: s.immigration.conditions.map(c => c.id), notifications: r.notifications.length };
}

test('MildClimate and LuddicMajority enter the real incoming phase and retain immutable native results', () => {
    for (const owned of [false, true]) for (const defeated of [false, true]) {
        const p = extended(4, owned, defeated), before = structuredClone(p), r = incoming(p);
        assert.equal(value(r.incoming.weight, 'mild_1'), 4);
        assert.equal(value(r.incoming.weight, 'church_1'), owned && defeated ? 40 : 20);
        assert.deepEqual(p, before);
        assert.ok(Object.isFrozen(r.incoming.weight.modifiers.flat));
        assert.equal(r.readyForAuthority, undefined);
    }
});
test('incoming dispatch uses the actual registered object sets, not survey/suppression or Church eligibility', () => {
    const p = extended(4, true, true);
    for (const c of p.conditions) { c.surveyed = false; c.suppressed = true; }
    const expected = incoming(p);
    assert.equal(value(expected.incoming.weight, 'church_1'), 40); // No habitable condition: do not recheck registration eligibility here.
    p.modifiers.permanent = [callback('condition', 'church_1'), callback('condition', 'mild_1')];
    const twice = incoming(p);
    assert.equal(value(twice.incoming.weight, 'church_1'), 40);
    assert.equal(value(twice.incoming.weight, 'mild_1'), 4);
    assert.ok(twice.incoming.composition.find(c => c.factionId === 'luddic_church').amount > expected.incoming.composition.find(c => c.factionId === 'luddic_church').amount);
    p.modifiers = { permanent: [], transient: [] };
    const absent = incoming(p);
    assert.equal(value(absent.incoming.weight, 'church_1'), undefined);
    assert.equal(value(absent.incoming.weight, 'mild_1'), undefined);
});
test('zero size does not add Church-majority growth; nonexistent factions are filtered only after callbacks', () => {
    const p = extended(0, true, true), zero = incoming(p);
    assert.equal(value(zero.incoming.weight, 'church_1'), undefined);
    assert.equal(value(zero.incoming.weight, 'mild_1'), undefined);
    p.market.size = p.neighbors.markets[0].size = 4;
    p.factionIds = p.factionIds.filter(id => id !== 'luddic_church');
    const r = incoming(p);
    assert.equal(value(r.incoming.weight, 'church_1'), 40);
    assert.equal(r.incoming.composition.some(row => row.factionId === 'luddic_church'), false);
});
test('all twelve new conditions may be present, but non-immigration plugins cannot masquerade as callbacks', () => {
    const p = extended();
    for (const id of Object.keys(ADD.conditions)) if (!p.conditions.some(c => c.id === id)) p.conditions.push(condition(id));
    incoming(p);
    for (const c of p.conditions.filter(c => !['mild_climate', 'luddic_majority'].includes(c.id))) {
        const q = structuredClone(p); q.modifiers.transient.push(callback('condition', c.modId)); rejects(() => incoming(q));
    }
    rejects(() => reapplyOriginalColonyEnvironment({ hazard: stat(1), modifiers: p.modifiers, conditions: p.conditions, industries: p.industries.map(e => ({ industryId: e.state.industryId, operating: e.operating })) }));
});
test('Church state is exact, explicit, market-scoped, and required even if the callback is not registered', () => {
    for (const mutate of [p => delete p.luddicMajorityState, p => p.luddicMajorityState = null, p => p.luddicMajorityState.playerOwned = 1, p => delete p.luddicMajorityState.defeatedExpedition, p => p.luddicMajorityState.extra = false]) {
        const p = extended(); mutate(p); rejects(() => incoming(p));
    }
    const absent = request(); absent.luddicMajorityState = { playerOwned: false, defeatedExpedition: false }; rejects(() => incoming(absent));
    const unregistered = extended(); unregistered.modifiers = { permanent: [], transient: [] }; delete unregistered.luddicMajorityState; rejects(() => incoming(unregistered));
    const multiple = extended(4, true, true); multiple.conditions.push(condition('luddic_majority', 'church_2')); multiple.modifiers.transient.push(callback('condition', 'church_2'));
    assert.equal(value(incoming(multiple).incoming.weight, 'church_2'), 40);
});
const itemBindings = [['corrupted_nanoforge', 'heavyindustry'], ['pristine_nanoforge', 'orbitalworks'], ['synchrotron', 'fuelprod'], ['catalytic_core', 'refining'], ['biofactory_embryo', 'lightindustry'], ['dealmaker_holosuite', 'commerce']];
test('only the six verified installed-item/industry bindings pass incoming validation; effects already in demand are not replayed', () => {
    for (const [item, id] of itemBindings) {
        const p = request(['population', id]), expected = incoming(p);
        p.industries[1].modifiers.specialItemId = item;
        assert.deepEqual(incoming(p), expected, item);
        p.industries[0].modifiers.specialItemId = item;
        rejects(() => incoming(p));
    }
    const p = request(['population', 'commerce']); p.industries[1].modifiers.specialItemId = 'unknown_item'; rejects(() => incoming(p));
});
test('shared conditions and financial registration flow into incoming without rerunning old environment conditions', () => {
    const p = extended(5, true, true);
    p.conditions.push(condition('habitable'), condition('farmland_rich'), condition('solar_array'), condition('hot'));
    const l = financialInput(['population', 'spaceport', 'farming']);
    l.commodityPass.conditions = p.conditions; l.commodityPass.industries = p.industries;
    l.governance.markets[0].playerOwned = true;
    const state = { hazard: stat(1), stability: l.stability, accessibility: p.accessibility, officerMercProbability: stat().modifiers, suppressedConditionIds: [], immigrationModifiers: { permanent: [], transient: [] }, commodities: l.marketCommodities.map(c => ({ commodityId: c.commodityId, maxSupply: c.maxSupply, available: stat(c.available) })) };
    l.commodityPass.conditionPhase = { state, contextByModId: Object.fromEntries(p.conditions.map(c => [c.modId, c.id === 'luddic_majority' ? { playerOwned: true, defeatedExpedition: true, madeChurchDeal: false, habitable: true, adminId: null, constructionQueue: [] } : null])) };
    const effects = reapplyOriginalEnvironmentalFinancialPass({ hazard: state.hazard, modifiers: state.immigrationModifiers, financial: { local: l, industryFinances: p.industries.map(e => newOriginalIndustryFinances(e.state.industryId)) } });
    p.modifiers = effects.environment.modifiers; p.hazard = effects.environment.hazardValue; p.industries = effects.financial.localEffects.commodityEffects.industries; p.market.stability = effects.financial.localEffects.values.stability;
    assert.ok(p.modifiers.transient.some(r => r.id === 'church_1'));
    assert.ok(p.modifiers.permanent.some(r => r.id === 'farmland_rich'));
    const r = incoming(p);
    assert.equal(value(r.incoming.weight, 'church_1'), 50);
    assert.equal(value(r.incoming.weight, 'mild_1'), 5);
    assert.equal(value(r.incoming.weight, 'habitable'), 4);
    assert.equal(p.hazard, 0.5); // solar precedes hot, both climate/habitable hazard -0.25.
});
test('population ownership agrees with Church getters initially and after a trusted growth driver', () => {
    const immigration = extended(4, true, false);
    immigration.days = 30;
    immigration.conditions.push(condition('population_4', 'old_population'));
    const p = { immigration, population: structuredClone(newOriginalPopulation('player', 4)), previousIncoming: { composition: [], weight: stat() }, playerOwned: true, inNewGameAdvance: false };
    p.population.weight.modifiers.flat[0].value = 1199;
    const before = structuredClone(p), current = incoming(immigration);
    rejects(() => advance({ ...p, playerOwned: false }));
    const grow = q => {
        const next = structuredClone(q.immigration);
        next.conditions = replaceOriginalPopulationConditions({ conditions: next.conditions, fromSize: q.plan.fromSize, newModId: 'new_population', suppressed: false });
        next.market.size = next.neighbors.markets[0].size = q.plan.toSize;
        next.luddicMajorityState.playerOwned = false;
        return { immigration: next, playerOwned: false, inNewGameAdvance: false, effects: { trustedDriver: true } };
    };
    const r = advance(p, grow);
    assert.equal(r.state.immigration.market.size, 5);
    assert.equal(r.state.playerOwned, false);
    assert.deepEqual(r.state.previousIncoming, current.incoming); // native incoming remains from pre-growth size 4.
    assert.equal(r.state.immigration.conditions.some(c => c.id === 'mild_climate'), true);
    assert.equal(r.state.immigration.conditions.some(c => c.id === 'population_4'), false);
    rejects(() => advance(p, q => { const r = grow(q); r.playerOwned = true; return r; }));
    assert.deepEqual(p, before);
});
test('original Java differential: 132 extended incoming phases plus 6 installed-item snapshots', () => {
    const cases = [];
    for (let size = 0; size <= 10; size++) for (let flags = 0; flags < 4; flags++) for (let mode = 0; mode < 3; mode++) {
        const p = extended(size, !!(flags & 1), !!(flags & 2));
        p.market.stability = (size + flags) % 11;
        p.hazard = f([0.75, 1, 2.5][mode]);
        p.incentives = { on: true, credits: f(12.3) }; p.days = f([0.1, 1, 30][mode]); p.uiUpdateOnly = mode === 1;
        for (const c of p.conditions) { c.suppressed = mode === 1; c.surveyed = mode !== 1; }
        if (mode === 1) { p.modifiers.permanent = [callback('condition', 'church_1'), callback('condition', 'mild_1')]; p.factionIds = p.factionIds.filter(id => id !== 'luddic_church'); }
        if (mode === 2) p.modifiers.transient = p.modifiers.transient.filter(r => r.kind !== 'condition');
        cases.push(p);
    }
    for (const [item, id] of itemBindings) { const p = request(['population', id]); p.industries[1].modifiers.specialItemId = item; cases.push(p); }
    const native = nativeImmigrationSnapshots(cases);
    assert.equal(native.length, 138);
    cases.forEach((p, i) => assert.deepEqual(resultView(incoming(p)), native[i], 'native incoming ' + i));
});
test('original Java population advance: 32 new-condition states including first-time and UI-only, without faked growth reapplication', () => {
    const cases = [];
    for (let i = 0; i < 32; i++) {
        const p = extended(4 + i % 3, !!(i & 1), !!(i & 2));
        p.maxMarketSize = stat(0, [mod('test_cap', -6)]).modifiers; // No unsupported Church registration stub runs on growth.
        p.market.stability = i % 11; p.uiUpdateOnly = i % 5 === 0; p.incentives.on = i % 3 === 0; p.days = f([0.1, 1, 15, 30][i % 4]);
        if (i % 4 === 0) p.modifiers.permanent.push(callback('condition', 'mild_1'));
        const state = { immigration: p, population: i % 3 === 0 ? null : newOriginalPopulation('player', p.market.size), previousIncoming: i % 2 === 0 ? null : { composition: [], weight: stat() }, playerOwned: p.luddicMajorityState.playerOwned, inNewGameAdvance: i % 7 === 0 };
        cases.push({ state, growthReads: {} });
    }
    const native = nativePopulationSnapshots(cases);
    assert.equal(native.length, 32);
    cases.forEach((c, i) => assert.deepEqual(populationView(advance(c.state)), native[i], 'native extended population ' + i));
});
