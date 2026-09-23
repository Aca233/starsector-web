/** Local condition effects during OFFLINE native load, never a full economy or retail snapshot. */
import { immutableJSON, requireThat } from '../../../src/campaign/core/Values.mjs';
import { blank, put } from '../../../src/campaign/rules/OriginalIndustryState.mjs';
import { ORIGINAL_MARKET_ECONOMY } from '../../../src/campaign/rules/OriginalMarketEconomy.mjs';
import { readOriginalAdministratorIndustryInputs } from '../../../src/campaign/rules/OriginalCharacterIndustryStats.mjs';
import { reapplyOriginalConditionPhase } from '../../../src/campaign/rules/OriginalConditionPhase.mjs';
import { prepareNativeIndustryStorage } from './IndustryStorage.mjs';
const check = (v, message) => requireThat(v, 'UNSUPPORTED_NATIVE_CONDITION_RESTORE', message);
const emptyBonus = () => ({ flat: [], percent: [], mult: [] });
/** All industries must have their post-save storage before this function can be invoked. */
export function prepareNativeConditionPhase(market, storage) {
    check(storage.marketId === market.marketId && storage.objectRef === market.objectRef, 'Condition/storage market identity differs');
    const c = market.conditionLoadCapture;
    if (!c) return immutableJSON({ status: 'pending', unresolved: ['condition-load-capture-required'] });
    check(c.scope === 'offline-native-condition-load-inputs', 'This initializer is offline-load only');
    const unresolved = [...c.unresolved];
    if (!storage.characterIndustryStatsDraft?.administrator) unresolved.push('selected-administrator-industry-modifiers');
    if (!c.stability) unresolved.push('stability-power');
    if (storage.industries.some(i => !i.runtimeReadback || !i.specialItemCaptured)) unresolved.push('industry-getters-and-special-items');
    if (unresolved.length) return immutableJSON({ status: 'pending', unresolved: [...new Set(unresolved)] });
    const admin = readOriginalAdministratorIndustryInputs(storage.characterIndustryStatsDraft.administrator.modifiers);
    check(storage.industries.length === market.industries.length, 'Industry roster size differs');
    const industries = storage.industries.map((i, n) => {
        const saved = market.industries[n];
        check(i.objectRef === saved.objectRef && i.industryId === saved.industryId, 'Industry roster order/identity differs');
        return { state: structuredClone(i.storage.state), operating: structuredClone(i.runtimeReadback.operating), modifiers: {
            aiCoreId: saved.aiCoreId, improved: i.improvedGetter,
            adminSupplyBonus: admin.adminSupplyBonus, adminDemandReduction: admin.adminDemandReduction,
            // These fields are transient. This default is valid only for an offline load, not a save callback.
            supplyBonusFromOther: blank(), demandReductionFromOther: blank(), specialItemId: i.specialItem?.id ?? null,
        } };
    });
    const hazard = structuredClone(market.hazard.state); put(hazard, 'flat', 'haz_base', 1);
    const commodityIds = new Set(), commodities = market.commodities.map(row => {
        check(Object.hasOwn(ORIGINAL_MARKET_ECONOMY.commodities, row.commodityId) && !commodityIds.has(row.commodityId), 'Unknown/duplicate saved commodity');
        commodityIds.add(row.commodityId);
        return { commodityId: row.commodityId, maxSupply: row.maxSupply, available: structuredClone(row.available?.state ?? blank()) };
    });
    // Market.writeReplace omits zero caches; readResolve/getAllCommodities recreates them.
    // These are production/availability caches, NOT cargo stock or submarket inventories.
    for (const id of Object.keys(ORIGINAL_MARKET_ECONOMY.commodities)) if (!commodityIds.has(id)) commodities.push({ commodityId: id, maxSupply: 0, available: blank() });
    const conditions = market.conditions.map(({ id, modId, surveyed, suppressed }) => ({ id, modId, surveyed, suppressed }));
    const byMod = new Map(market.conditions.map(row => [row.modId, row])), industryById = new Map(market.industries.map(row => [row.industryId, row]));
    const callbackRefs = new Set();
    for (const row of c.permanentCallbacks) {
        check(typeof row.objectRef === 'string' && !callbackRefs.has(row.objectRef), 'Duplicate callback identity'); callbackRefs.add(row.objectRef);
        if (row.kind === 'condition') {
            const condition = byMod.get(row.id);
            check(condition && row.currentPlugin === (condition.pluginRef === row.objectRef), 'Callback/plugin identity differs');
        } else check(row.kind === 'industry' && row.currentPlugin === true && industryById.get(row.id)?.objectRef === row.objectRef, 'Foreign industry callback');
    }
    check(c.pluginState.length === market.conditions.length, 'Incomplete plugin identity roster');
    for (let n = 0; n < market.conditions.length; n++) {
        const plugin = c.pluginState[n], condition = market.conditions[n];
        check(plugin.conditionRef === condition.objectRef && plugin.modId === condition.modId && plugin.pluginRef === condition.pluginRef && plugin.restored === (condition.pluginRef !== null), 'Plugin capture identity differs');
    }
    return immutableJSON({ status: 'prepared', input: { marketSize: market.size, conditions, industries, contextByModId: structuredClone(c.contextByModId), state: {
        hazard, accessibility: structuredClone(market.accessibility), stability: structuredClone(c.stability.state),
        officerMercProbability: structuredClone(c.officerMercProbability ?? emptyBonus()),
        suppressedConditionIds: [...market.suppressedConditions],
        immigrationModifiers: { permanent: c.permanentCallbacks.filter(row => row.currentPlugin).map(({kind, id}) => ({kind, id})), transient: [] }, commodities,
    } } });
}
/** Preserve objects and timers at the CONDITION boundary, before industry-side registrations. */
export function projectNativeConditionAttachments(market, result) {
    const c = market.conditionLoadCapture;
    check(c?.scope === 'offline-native-condition-load-inputs', 'Missing condition attachment capture');
    const identity = row => {
        if (row.kind === 'industry') {
            const industry = market.industries.find(i => i.industryId === row.id);
            check(industry, 'Missing registered industry');
            return { ...row, objectRef: industry.objectRef, currentPlugin: true };
        }
        const plugin = c.pluginState.find(p => p.modId === row.id);
        check(row.kind === 'condition' && plugin, 'Missing registered plugin');
        return { ...row, objectRef: plugin.pluginRef ?? 'loaded-condition:' + plugin.conditionRef, currentPlugin: true };
    };
    // Every live condition is unapplied first. Old distinct plugin objects are not removed by that call.
    // Original industry/orphan callbacks survive in original order; newly applied conditions append.
    const permanentCallbacks = [
        ...c.permanentCallbacks.filter(row => !row.currentPlugin || row.kind === 'industry'),
        ...result.state.immigrationModifiers.permanent.filter(row => row.kind === 'condition').map(identity),
    ];
    return immutableJSON({
        callbackObjects: { permanent: permanentCallbacks, transient: result.state.immigrationModifiers.transient.map(identity) },
        // Callback unmodifyFlat leaves MutableStatWithTempMods timers intact; no time advance here.
        temporaryModifiers: {
            stability: c.stability.temporary,
            commodityAvailable: market.commodities.filter(row => row.available).map(row => ({ commodityId: row.commodityId, temporary: row.available.temporary })),
            shippingLost: c.pluginState.filter(p => p.shippingLost).map(p => ({ modId: p.modId, temporary: p.shippingLost.temporary })),
        },
    });
}
export function restoreNativeConditionDrafts(capture) {
    // Do not interleave industry storage initialization with callbacks.
    const storage = prepareNativeIndustryStorage(capture);
    let restoredMarketCount = 0;
    const markets = capture.markets.map((market, n) => {
        const prepared = prepareNativeConditionPhase(market, storage.markets[n]);
        if (prepared.status === 'pending') return { marketId: market.marketId, objectRef: market.objectRef, ...prepared };
        const result = reapplyOriginalConditionPhase(prepared.input);
        restoredMarketCount++;
        return { marketId: market.marketId, objectRef: market.objectRef, status: 'conditions-reapplied', result,
            ...projectNativeConditionAttachments(market, result),
            unresolved: ['industry-and-governed-skills-reapplication', 'administrator-and-listener-runtime', 'immigration-callback-runtime', 'commodity-network-construction', 'transient-price-calculators', 'faction-relationships-and-admission', 'retail-inventories-and-market-publication'],
        };
    });
    return immutableJSON({ schemaVersion: 1, scope: 'offline-native-condition-effects-draft-only', storage, source: structuredClone(capture.source), marketRoster: [...capture.marketRoster], initializedIndustryCount: storage.initializedIndustryCount, restoredMarketCount, pendingConditionMarkets: markets.length - restoredMarketCount, markets, readyForAuthority: false });
}
