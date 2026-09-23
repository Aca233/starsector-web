/** Shared load preparation; the restore draft below executes only legacy offline commodity callbacks. */
import { immutableJSON, requireThat, canonicalJSON } from '../../../src/campaign/core/Values.mjs';
import { stat } from '../../../src/campaign/rules/OriginalIndustryState.mjs';
import { ORIGINAL_MARKET_ECONOMY } from '../../../src/campaign/rules/OriginalMarketEconomy.mjs';
import { ORIGINAL_PRODUCTION_INDUSTRIES } from '../../../src/campaign/rules/OriginalProductionIndustries.mjs';
import { ORIGINAL_SPECIAL_INDUSTRIES } from '../../../src/campaign/rules/OriginalSpecialIndustries.mjs';
import { isSupportedOriginalResourceItem } from '../../../src/campaign/rules/OriginalResourceIndustries.mjs';
import { readOriginalAdministratorIndustryInputs } from '../../../src/campaign/rules/OriginalCharacterIndustryStats.mjs';
import { originalIndustryAvailabilityKeys, reapplyOriginalIndustryCommodityPass } from '../../../src/campaign/rules/OriginalIndustryCommodityPass.mjs';
import { prepareNativeIndustryStorage } from './IndustryStorage.mjs';
import { prepareNativeConditionPhase, projectNativeConditionAttachments } from './ConditionRestore.mjs';
const check = (v, message) => requireThat(v, 'UNSUPPORTED_NATIVE_INDUSTRY_RESTORE', message);
const emptyBonus = () => ({ flat: [], percent: [], mult: [] });
export function prepareNativeIndustryCommodityPass(market, storage) {
    const phase = prepareNativeConditionPhase(market, storage), captured = market.industryInputCapture;
    const unresolved = phase.status === 'pending' ? [...phase.unresolved] : [];
    if (!captured) unresolved.push('industry-getter-capture-required');
    else {
        check(captured.scope === 'native-industry-commodity-getter-inputs', 'Unexpected industry capture scope');
        unresolved.push(...captured.unresolved);
        if (!captured.faction) unresolved.push('registered-faction-legality');
        if (captured.previousStability === null) unresolved.push('previous-stability');
    }
    if (!storage.governedSkillsDraft) unresolved.push('governed-skills-capture');
    if (unresolved.length) return immutableJSON({ status: 'pending', unresolved: [...new Set(unresolved)] });
    check(captured.faction.factionId === market.factionId, 'Saved faction differs from market owner');
    const industries = phase.input.industries;
    // Shared by actual live loading and the legacy offline draft: retain installed
    // resource items, but admit only implemented CSV-compatible industry/item pairs.
    // Environmental requirements run later in the LIVE Base.apply item phase, not
    // here; unmet requirements do not mean the saved item has been uninstalled.
    for (const entry of industries) if (['farming', 'aquaculture', 'mining'].includes(entry.state.industryId)) {
        check(entry.modifiers.specialItemId === null || isSupportedOriginalResourceItem(entry.state.industryId, entry.modifiers.specialItemId),
            'Unknown or incompatible installed resource item in industry load');
    }
    const availableRows = new Map(phase.input.state.commodities.map(c => [c.commodityId, c]));
    const available = Object.fromEntries(originalIndustryAvailabilityKeys(industries.map(i => i.state.industryId)).map(id => {
        check(availableRows.has(id), 'Missing pre-condition availability');
        return [id, Math.max(0, Math.floor(stat(availableRows.get(id).available) + 0.5))];
    }));
    const previous = new Map(market.commodities.map(c => [c.commodityId, c]));
    const definitions = Object.values(ORIGINAL_MARKET_ECONOMY.commodities);
    check(!definitions.some(c => c.plugin && !c.tags.includes('nonecon')), 'Custom economic commodity requires its own callback implementation');
    const commodities = definitions.filter(c => !c.tags.includes('nonecon')).map(c => ({ commodityId: c.id, previousSupplyLegal: previous.get(c.id)?.supplyLegal ?? true, previousDemandLegal: previous.get(c.id)?.demandLegal ?? true }));
    const input = { marketSize: market.size, freePort: market.isFreePort, factionIllegalCommodityIds: [...captured.faction.illegalCommodityIds],
        industries, conditions: phase.input.conditions, conditionPhase: { state: phase.input.state, contextByModId: phase.input.contextByModId },
        governedSkills: storage.governedSkillsDraft, available, commodities,
    };
    if (industries.some(i => Object.hasOwn(ORIGINAL_PRODUCTION_INDUSTRIES.industries, i.state.industryId))) {
        const admin = readOriginalAdministratorIndustryInputs(storage.characterIndustryStatsDraft.administrator.modifiers);
        input.production = { productionQuality: captured.productionQuality ?? emptyBonus(), previousStability: captured.previousStability, adminFuelSupplyBonus: admin.adminFuelSupplyBonus };
    }
    if (industries.some(i => Object.hasOwn(ORIGINAL_SPECIAL_INDUSTRIES.industries, i.state.industryId))) {
        // DynamicStats.getStat lazily creates base ONE; this is not an arbitrary missing-value zero.
        check(!captured.techMiningMult || captured.techMiningMult.temporary.length === 0, 'Expected untimed tech mining stat');
        input.special = { factionId: market.factionId, techMiningMult: captured.techMiningMult?.state ?? { base: 1, modifiers: emptyBonus() } };
    }
    return immutableJSON({ status: 'prepared', input, deferredCommodityIds: definitions.filter(c => c.tags.includes('nonecon')).map(c => c.id) });
}
export function restoreNativeIndustryCommodityDrafts(capture) {
    const storage = prepareNativeIndustryStorage(capture), factionsById = new Map(), factionsByRef = new Map();
    // Shared original faction objects cannot acquire different policy snapshots at different markets.
    for (const market of capture.markets) {
        const faction = market.industryInputCapture?.faction;
        if (!faction) continue;
        const signature = canonicalJSON(faction);
        check(faction.factionId === market.factionId && typeof faction.objectRef === 'string' && faction.objectRef.length > 0, 'Invalid shared faction identity');
        check(!factionsById.has(faction.factionId) || factionsById.get(faction.factionId) === signature, 'Conflicting shared faction policy');
        check(!factionsByRef.has(faction.objectRef) || factionsByRef.get(faction.objectRef) === signature, 'Conflicting shared faction object');
        factionsById.set(faction.factionId, signature); factionsByRef.set(faction.objectRef, signature);
    }
    let restoredMarketCount = 0, reappliedIndustryCount = 0;
    const markets = capture.markets.map((market, n) => {
        const prepared = prepareNativeIndustryCommodityPass(market, storage.markets[n]);
        if (prepared.status === 'pending') return { marketId: market.marketId, objectRef: market.objectRef, ...prepared };
        // Do not call restoreNativeConditionDrafts here: the combined pass executes each condition exactly once.
        // Preparation admits known resource items for LIVE load. This offline pass
        // deliberately remains null-only for resource items and will reject them.
        const result = reapplyOriginalIndustryCommodityPass(prepared.input);
        const { commodities: nextCommodityMaxima, ...effects } = result;
        restoredMarketCount++; reappliedIndustryCount += result.industries.length;
        return { marketId: market.marketId, objectRef: market.objectRef, status: 'commodity-industries-reapplied', effects,
            conditionAttachments: projectNativeConditionAttachments(market, result.conditionPhase),
            // This COMMODITY-ONLY projection does not run lazy network getters inside financial callbacks.
            // Full econPostSaveRestore can update maxima during Population.modifyStability; see the live draft.
            // Keep these candidates separate; only this restricted projection retains the OLD cached maxima.
            nextCommodityMaxima, deferredCommodityIds: prepared.deferredCommodityIds,
            unresolved: ['industry-financial-and-other-side-effects', 'administrator-and-listener-runtime', 'immigration-callback-runtime', 'scheduled-commodity-cache-refresh', 'commodity-network-construction', 'transient-price-calculators', 'faction-relationships-and-admission', 'retail-inventories-and-market-publication'],
        };
    });
    return immutableJSON({ schemaVersion: 1, scope: 'offline-native-industry-commodity-effects-draft-only', source: structuredClone(capture.source), storage,
        marketRoster: [...capture.marketRoster], initializedIndustryCount: storage.initializedIndustryCount, restoredMarketCount, reappliedIndustryCount,
        pendingCommodityMarkets: markets.length - restoredMarketCount, markets, readyForAuthority: false,
    });
}
