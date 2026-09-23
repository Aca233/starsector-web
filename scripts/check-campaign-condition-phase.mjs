import { nativeAdditionalConditionsOracle } from './campaign-additional-conditions-native-oracle.mjs';
import { conditionPhaseOracleVector } from './campaign-condition-phase-native-oracle.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { reapplyOriginalConditionPhase as phase, ORIGINAL_CONDITION_PHASE as R } from '../src/campaign/rules/OriginalConditionPhase.mjs';
import { reapplyOriginalIndustryCommodityPass as pass } from '../src/campaign/rules/OriginalIndustryCommodityPass.mjs';
import { newOriginalResourceIndustry } from '../src/campaign/rules/OriginalResourceIndustries.mjs';
import { newOriginalProductionIndustry } from '../src/campaign/rules/OriginalProductionIndustries.mjs';
import { newOriginalCivicIndustry } from '../src/campaign/rules/OriginalCivicIndustries.mjs';
import { stat, put } from '../src/campaign/rules/OriginalIndustryState.mjs';
const blank = (base = 0) => ({ base, modifiers: { flat: [], percent: [], mult: [] } }), f = Math.fround;
function industry(id) { return { state: ['farming', 'aquaculture', 'mining'].includes(id) ? newOriginalResourceIndustry(id) : id === 'lightindustry' ? newOriginalProductionIndustry(id) : newOriginalCivicIndustry(id), operating: { disrupted: false, building: false, upgradeId: null }, modifiers: { aiCoreId: null, improved: false, adminSupplyBonus: 0, adminDemandReduction: 0, supplyBonusFromOther: blank(), demandReductionFromOther: blank(), specialItemId: null } }; }
function capture(ids = ['habitable', 'farmland_rich', 'solar_array', 'luddic_majority']) {
    const conditions = ids.map((id, n) => ({ id, modId: id + '_' + n, surveyed: true, suppressed: false }));
    const industries = [industry('farming')], state = { hazard: blank(1), accessibility: blank().modifiers, stability: blank(5), officerMercProbability: blank().modifiers, suppressedConditionIds: [], immigrationModifiers: { permanent: [], transient: [] }, commodities: ['heavy_machinery', 'food', 'organics'].map(commodityId => ({ commodityId, maxSupply: 10, available: blank(10) })) };
    const contextByModId = Object.fromEntries(conditions.map(c => [c.modId, c.id === 'luddic_majority' ? { playerOwned: true, madeChurchDeal: false, habitable: ids.includes('habitable'), adminId: null, defeatedExpedition: false, constructionQueue: [] } : c.id === 'free_market' ? { daysActive: 365 } : c.id === 'recent_unrest' ? { penalty: 3 } : c.id === 'comm_relay' ? { hasContainingLocation: true, relays: [{ id: 'relay', sameFaction: true, nonFunctional: false, makeshift: false }] } : c.id === 'pirate_activity' ? { tier: 'TIER_3_2MODULE' } : c.id === 'pather_cells' ? { intelMarketFactionId: 'independent', savedSleeper: false, playerHasPatherAgreement: false } : c.id === 'shipping_disruption' ? { marketSize: 6, playerOwned: true, shippingLost: blank(3) } : null]));
    return { marketSize: 6, conditions, industries, state, contextByModId };
}
function commodityPass(input) { return pass({ marketSize: input.marketSize, freePort: false, factionIllegalCommodityIds: [], conditions: input.conditions, industries: input.industries, available: Object.fromEntries((input.industries.some(i => i.state.industryId === 'lightindustry') ? ['heavy_machinery', 'organics'] : ['heavy_machinery']).map(id => [id, Math.max(0, Math.floor(stat(input.state.commodities.find(c => c.commodityId === id).available) + 0.5))])), commodities: [{ commodityId: 'food', previousSupplyLegal: true, previousDemandLegal: true }], conditionPhase: { state: input.state, contextByModId: input.contextByModId }, ...(input.industries.some(i => i.state.industryId === 'lightindustry') ? { production: { productionQuality: blank().modifiers, previousStability: 5, adminFuelSupplyBonus: 0 } } : {}) }); }
test('combined source catalogue checks all 72 original bindings', () => { const r = spawnSync('node', ['scripts/import-campaign-condition-phase.mjs', '--check'], { cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8', windowsHide: true, timeout: 10000 }); assert.equal(r.status, 0, r.stderr); assert.equal(Object.keys(R.conditions).length, 72); });
test('new condition modifiers reach industry apply without retroactively refreshing resource supply', () => {
    const input = capture(), before = structuredClone(input), first = commodityPass(input);
    assert.equal(first.commodities.food.maxSupply, 7);
    assert.equal(stat(first.industries[0].modifiers.supplyBonusFromOther), 3);
    assert.equal(stat(first.industries[0].state.supplyBonus), 3);
    assert.deepEqual(input, before);
    const second = commodityPass({ ...input, industries: first.industries, conditions: first.conditionPhase.conditions, state: first.conditionPhase.state });
    assert.equal(second.commodities.food.maxSupply, 10);
    assert.equal(second.conditionPhase.execution.visited, 4);
    assert.equal(second.conditionPhase.state.immigrationModifiers.permanent[0].id, 'farmland_rich_1');
});
test('same draft preserves solar/hot ordering and updates returned suppression flags', () => {
    const a = phase(capture(['hot', 'solar_array'])), b = phase(capture(['solar_array', 'hot']));
    assert.equal(stat(a.state.hazard), 1.25);
    assert.equal(stat(b.state.hazard), 1);
    assert.ok(a.conditions[0].suppressed && b.conditions[1].suppressed);
    assert.equal(a.execution.applied, 2);
    assert.equal(b.execution.applied, 1);
});
test('free port replays stability, access, immigration and mercenary-officer probability together', () => {
    const input = capture(['free_market']), out = phase(input);
    assert.equal(out.state.accessibility.flat[0].value, 0.25);
    assert.equal(stat(out.state.stability), 2);
    assert.deepEqual(out.state.officerMercProbability.flat, [{ id: 'free_market_0', value: 0.25 }]);
    const next = structuredClone({ ...input, industries: out.industries, state: out.state, conditions: out.conditions });
    next.conditions[0].surveyed = false;
    const inactive = phase(next);
    assert.equal(inactive.state.officerMercProbability.flat.length, 0);
    assert.equal(inactive.state.immigrationModifiers.transient.length, 0);
    assert.equal(stat(inactive.state.stability), 5);
});
test('resource permanent callbacks and transient conditions retain native collection order', () => {
    const input = capture(['mild_climate', 'farmland_rich', 'habitable', 'free_market']);
    input.state.immigrationModifiers.permanent = [{ kind: 'condition', id: 'farmland_rich_1' }];
    input.state.immigrationModifiers.transient = [{ kind: 'condition', id: 'free_market_3' }, { kind: 'condition', id: 'mild_climate_0' }, { kind: 'condition', id: 'habitable_2' }];
    input.industries[0].operating.disrupted = true;
    const out = phase(input);
    assert.deepEqual(out.state.immigrationModifiers.permanent, [{ kind: 'condition', id: 'farmland_rich_1' }]);
    assert.deepEqual(out.state.immigrationModifiers.transient.map(m => m.id), ['mild_climate_0', 'habitable_2', 'free_market_3']);
});
test('suppressed resource unapply does not erase prior supply and no split second pass reapplies it', () => {
    const input = capture(['farmland_rich']), first = commodityPass(input);
    const next = structuredClone({ ...input, industries: first.industries, state: first.conditionPhase.state, conditions: first.conditionPhase.conditions });
    next.state.suppressedConditionIds.push('farmland_rich');
    next.conditions[0].suppressed = true;
    const second = commodityPass(next);
    assert.equal(second.commodities.food.maxSupply, 7);
    assert.deepEqual(second.conditionPhase.state.immigrationModifiers.permanent, []);
});
test('shipping recovery changes availability read by the following industry, without recomputing maxSupply', () => {
    const input = capture(['farmland_rich', 'shipping_disruption']);
    const com = input.state.commodities.find(c => c.commodityId === 'heavy_machinery');
    com.available = blank(5);
    put(com.available, 'flat', 'sh_loss_example', -4);
    const output = commodityPass(input);
    assert.equal(output.commodities.food.maxSupply, 7);
    assert.equal(stat(output.conditionPhase.state.commodities[0].available), 5);
    assert.equal(output.conditionPhase.state.commodities[0].maxSupply, 10);
    const noRecovery = structuredClone(input);
    noRecovery.contextByModId.shipping_disruption_1.playerOwned = false;
    assert.equal(commodityPass(noRecovery).commodities.food.maxSupply, 5);
});
test('current production industries consume church bonus immediately, unlike resource condition supply', () => {
    const input = capture(['habitable', 'luddic_majority']);
    input.industries = [industry('lightindustry')];
    const result = commodityPass(input);
    assert.equal(stat(result.industries[0].state.supply.domestic_goods), 7);
    assert.equal(stat(result.industries[0].state.supply.luxury_goods), 5);
});
test('unknown conditions, inconsistent cache/context/suppression and unbound immigration identities reject', () => {
    for (const edit of [x => x.conditions[0].id = 'unknown', x => delete x.contextByModId[x.conditions[0].modId], x => x.state.suppressedConditionIds.push('habitable'), x => x.contextByModId.luddic_majority_3.habitable = false, x => x.state.immigrationModifiers.permanent.push({ kind: 'condition', id: 'lost' })]) {
        const input = capture();
        edit(input);
        assert.throws(() => phase(input));
    }
    const input = capture();
    assert.throws(() => pass({ marketSize: 6, freePort: false, factionIllegalCommodityIds: [], conditions: input.conditions, industries: input.industries, available: { heavy_machinery: 10 }, commodities: [{ commodityId: 'food', previousSupplyLegal: true, previousDemandLegal: true }] }), /Unknown condition/);
    const output = phase(capture());
    assert.throws(() => output.state.suppressedConditionIds.push('x'), TypeError);
});
test('all supported source bindings execute one shared phase with explicit plugin state', () => {
    for (const id of Object.keys(R.conditions)) {
        const input = capture([id]);
        const out = phase(input);
        assert.equal(out.execution.visited, 1, id);
        assert.equal(out.execution.applied, 1, id);
    }
});
test('differential: shared legacy/additional/resource condition phase uses actual original callbacks', t => {
    const cases = [], expected = [];
    const patterns = [['habitable', 'farmland_rich', 'solar_array', 'luddic_majority'], ['solar_array', 'hot', 'poor_light', 'farmland_poor', 'free_market'], ['hot', 'solar_array', 'farmland_bountiful', 'mild_climate', 'decivilized_subpop', 'recent_unrest'], ['free_market', 'comm_relay', 'water_surface', 'low_gravity', 'pather_cells', 'shipping_disruption'], ['ore_rich', 'rare_ore_abundant', 'volatiles_diffuse', 'pollution', 'pirate_activity'], ['habitable', 'luddic_majority', 'farmland_adequate', 'solar_array', 'high_gravity']];
    for (let n = 0; n < 60; n++) {
        let input = capture(patterns[n % patterns.length]);
        input.industries = [['farming'], ['aquaculture'], ['farming', 'aquaculture'], ['mining'], ['farming', 'mining'], ['lightindustry']][n % 6].map(industry);
        for (const i of input.industries) {
            i.state = structuredClone(i.state);
            put(i.state.supplyBonus, 'flat', 'previous', n % 3);
            put(i.modifiers.supplyBonusFromOther, 'percent', 'old', n % 2 ? 10 : 0);
            i.operating.disrupted = n % 7 === 0;
        }
        for (let k = 0; k < input.conditions.length; k++) {
            const c = input.conditions[k];
            c.surveyed = n % 5 !== 0 || k % 2 === 0;
            if (n % 4 === 0) {
                input.state.suppressedConditionIds.push(c.id);
                c.suppressed = true;
            }
            if (c.id === 'free_market')
                input.contextByModId[c.modId].daysActive = Math.fround(n * 17.5);
            if (c.id === 'luddic_majority') {
                const ctx = input.contextByModId[c.modId];
                ctx.defeatedExpedition = n % 3 === 0;
                ctx.madeChurchDeal = n % 5 === 0;
                ctx.constructionQueue = n % 2 ? [{ industryId: 'lightindustry', specExists: true }, { industryId: 'heavyindustry', specExists: true }] : [];
            }
            if (c.id === 'comm_relay') {
                const ctx = input.contextByModId[c.modId];
                ctx.hasContainingLocation = n % 2 === 0;
                ctx.relays.push({ id: 'relay2', sameFaction: true, nonFunctional: false, makeshift: true });
            }
            put(input.state.stability, 'percent', c.modId, 5);
        }
        for (const com of input.state.commodities) {
            put(com.available, 'flat', 'sh_loss_test', -4);
            put(com.available, 'flat', 'sh_loss_low', f(-0.49));
        }
        for (let step = 0; step < 3; step++) {
            const out = phase(input);
            cases.push(conditionPhaseOracleVector(input));
            expected.push({ state: out.state, industries: out.industries, conditions: out.conditions });
            input = { ...input, state: out.state, industries: out.industries, conditions: out.conditions };
        }
    }
    for (const id of Object.keys(R.conditions)) {
        const input = capture([id]);
        put(input.state.hazard, 'flat', input.conditions[0].modId, 0.5);
        put(input.state.stability, 'mult', input.conditions[0].modId, 2);
        const out = phase(input);
        cases.push(conditionPhaseOracleVector(input));
        expected.push({ state: out.state, industries: out.industries, conditions: out.conditions });
    }
    const actual = nativeAdditionalConditionsOracle(cases);
    assert.equal(actual.length, expected.length);
    for (let n = 0; n < actual.length; n++)
        assert.deepEqual(actual[n], expected[n], 'native shared condition phase ' + n);
    t.diagnostic(actual.length + ' original Java shared-condition phase snapshots matched');
});
