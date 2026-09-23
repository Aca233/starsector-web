import test from 'node:test';
import assert from 'node:assert/strict';
import { CampaignError } from '../src/campaign/core/Values.mjs';
import { restoreOriginalIndustryStorage as restore, originalIndustrySavedClass } from '../src/campaign/rules/OriginalIndustryRestore.mjs';
import { ORIGINAL_IMMIGRATION } from '../src/campaign/rules/OriginalColonyEnvironment.mjs';
import { reapplyOriginalIndustryCommodityPass } from '../src/campaign/rules/OriginalIndustryCommodityPass.mjs';
import { extractNativeSaveEconomy } from './lib/campaign-native-save.mjs';
import { prepareNativeIndustryStorage } from './lib/campaign-native-industry-storage.mjs';
import { nativeSaveFixture } from './campaign-native-save-fixtures.mjs';
import { nativeIndustryStorageSnapshots } from './campaign-industry-storage-native-oracle.mjs';
import { stat, mod, condition, financialInput } from './campaign-immigration-fixtures.mjs';
const rejects = fn => assert.throws(fn, e => e instanceof CampaignError);
function input(id = 'farming') {
    return { industryId: id, classAlias: originalIndustrySavedClass(id), buildTime: 1, supplyBonus: stat(0, [mod('saved_bonus', 3)]), demandReduction: stat(0, [mod('saved_reduction', 2)]), supply: null, demand: null, income: null, upkeep: null };
}
function capture() { const fixture = nativeSaveFixture(); return extractNativeSaveEconomy(fixture.campaign, fixture.descriptor); }
function restoredView(r) {
    return { ...r.readResolved, buildTime: r.buildTime, supply: r.state.supply, demand: r.state.demand, supplyBonus: r.state.supplyBonus, demandReduction: r.state.demandReduction, income: r.finances.income, upkeep: r.finances.upkeep };
}
test('readResolve fills null bonus stats, clamps buildTime and computes native modifier identities', () => {
    const p = input(); p.supplyBonus = p.demandReduction = null; p.buildTime = -2;
    const r = restore(p);
    assert.equal(r.buildTime, 1); assert.deepEqual(r.state.supplyBonus, stat()); assert.deepEqual(r.state.demandReduction, stat());
    assert.equal(r.modId, 'ind_farming'); assert.deepEqual(r.indexedModIds, Array.from({ length: 10 }, (_, n) => 'ind_farming_' + n));
    assert.equal(r.readyForAuthority, false); assert.equal(r.inventories, undefined);
});
test('readResolve removes only ind_sb/ind_dr flat, then postSave unconditionally replaces four storage containers', () => {
    const p = input();
    p.supply = { food: stat(5, [mod('ind_sb', 3), mod('external', 2)], [mod('ind_sb', 40)], [mod('ind_sb', 2)]) };
    p.demand = { heavy_machinery: stat(4, [mod('ind_dr', -2), mod('external', -1)], [mod('ind_dr', 25)]) };
    p.income = stat(1200, [mod('income', 50)]); p.upkeep = stat(300); p.buildTime = 15;
    const before = structuredClone(p), r = restore(p);
    assert.deepEqual(r.readResolved.supply.food.modifiers.flat, [mod('external', 2)]);
    assert.deepEqual(r.readResolved.supply.food.modifiers.percent, [mod('ind_sb', 40)]);
    assert.deepEqual(r.readResolved.supply.food.modifiers.mult, [mod('ind_sb', 2)]);
    assert.deepEqual(r.readResolved.demand.heavy_machinery.modifiers.flat, [mod('external', -1)]);
    assert.deepEqual(r.readResolved.demand.heavy_machinery.modifiers.percent, [mod('ind_dr', 25)]);
    assert.deepEqual(r.state.supply, {}); assert.deepEqual(r.state.demand, {});
    assert.deepEqual(r.finances.income, stat()); assert.deepEqual(r.finances.upkeep, stat());
    assert.deepEqual(r.state.supplyBonus, p.supplyBonus); assert.deepEqual(r.state.demandReduction, p.demandReduction);
    assert.deepEqual(p, before); assert.ok(Object.isFrozen(r.state.supplyBonus.modifiers.flat));
});
test('saved supplyBonus survives initialization and really affects the first resource-condition/industry pass', () => {
    const p = financialInput(['farming']).commodityPass; p.marketSize = 6; p.conditions = [condition('farmland_rich')];
    p.industries[0].state = restore(input()).state;
    const kept = reapplyOriginalIndustryCommodityPass(p);
    const noBonus = structuredClone(p); noBonus.industries[0].state.supplyBonus = stat();
    const reset = reapplyOriginalIndustryCommodityPass(noBonus);
    assert.equal(kept.commodities.food.maxSupply - reset.commodities.food.maxSupply, 3);
});
test('class binding is exact, including commerce saved alias, and unsupported/invalid storage fails closed', () => {
    assert.equal(originalIndustrySavedClass('commerce'), 'TradeCenter2');
    for (const mutate of [p => p.classAlias = 'TradeCenter', p => p.industryId = 'unknown', p => p.buildTime = NaN, p => p.supplyBonus = undefined, p => p.supply = [], p => p.supply = { unknown: stat() }, p => p.demandReduction = { base: 0 }, p => p.extra = true]) {
        const p = input('commerce'); mutate(p); rejects(() => restore(p));
    }
});
test('capture adapter prepares all storage in captured order, retains identities and provenance, and keeps market reapplication pending', () => {
    const p = capture(), before = structuredClone(p), r = prepareNativeIndustryStorage(p);
    assert.deepEqual(r.marketRoster, ['b', 'a']); assert.equal(r.initializedIndustryCount, 2); assert.equal(r.pendingMarketReapplications, 2);
    assert.equal(r.readyForAuthority, false); assert.equal(r.scope, 'native-economy-industry-storage-draft-only');
    assert.deepEqual(r.source, p.source);
    for (let n = 0; n < p.markets.length; n++) {
        const actual = r.markets[n].industries[0], source = p.markets[n].industries[0];
        assert.equal(actual.objectRef, source.objectRef); assert.equal(actual.improvedGetter, source.improved === true);
        assert.deepEqual(actual.storage.state.supplyBonus, source.supplyBonus.state);
        assert.equal(actual.unresolved.includes('current-disruption-memory-getter'), false);
        assert.equal(actual.runtimeReadback.operating.disrupted, false);
        assert.equal(actual.disrupted, undefined); // Never substitute saved wasDisrupted for the current memory getter.
    }
    assert.deepEqual(p, before); assert.ok(Object.isFrozen(r.markets));
});
test('capture adapter refuses unsupported storage, missing/duplicate rosters or plugins and does not certify readiness', () => {
    for (const mutate of [p => p.reconstruction.readyForAuthority = true, p => p.marketRoster.reverse(), p => p.markets[1].marketId = p.markets[0].marketId, p => p.markets[1].industries[0].objectRef = p.markets[0].industries[0].objectRef, p => p.markets[0].industries[0].cleanupFields.s = 'serialized-requires-decoder', p => p.markets[0].industries[0].classAlias = 'UnknownPlugin', p => p.markets[0].industries[0].improved = 'yes', p => delete p.markets[0].industries[0].supplyBonus, p => p.markets[0].industries[0].supplyBonus.temporary.push({ id: 'event', timeRemaining: 1 }), p => p.source.campaignSha256 = 'unknown']) {
        const p = capture(); mutate(p); rejects(() => prepareNativeIndustryStorage(p));
    }
});
test('original BaseIndustry readResolve and postSaveRestore: 120 snapshots covering all 30 supported industry IDs', () => {
    const cases = [];
    for (const id of Object.keys(ORIGINAL_IMMIGRATION.industries)) for (let n = 0; n < 4; n++) {
        const p = input(id); p.buildTime = [-2, 0.5, 1, 7.25][n];
        if (n % 2) {
            p.supplyBonus = stat(1, [mod('saved', 2)], [mod('pct', 50)], [mod('mult', 0.5)]);
            p.supply = { food: stat(6, [mod('old', 2), mod('ind_sb', 3)], [mod('ind_sb', 50)]) };
            p.demand = { heavy_machinery: stat(4, [mod('ind_dr', -2), mod('outside', -1)], [], [mod('ind_dr', 2)]) };
            p.income = stat(5000); p.upkeep = stat(1500, [mod('upkeep', 250)]);
        } else p.supplyBonus = p.demandReduction = null;
        cases.push(p);
    }
    const native = nativeIndustryStorageSnapshots(cases); assert.equal(native.length, 120);
    cases.forEach((p, i) => { const r = restore(p); assert.deepEqual(r.readResolved, native[i].readResolved, 'native readResolve ' + i); assert.deepEqual(restoredView(r), native[i].restored, 'native postSave ' + i); assert.equal(native[i].freshStorage, true); });
});
