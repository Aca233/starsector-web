import { reapplyOriginalGovernedSkills } from './OriginalGovernedSkills.mjs';
import { reapplyOriginalConditionPhase } from './OriginalConditionPhase.mjs';
import { ORIGINAL_SPECIAL_INDUSTRIES, validateOriginalSpecialIndustry, applyOriginalSpecialIndustry, originalSpecialIndustryOutput } from './OriginalSpecialIndustries.mjs';
import { identifier, integer, requireThat, immutableJSON } from '../core/Values.mjs';
import { ORIGINAL_MARKET_ECONOMY, economyShape, resolveOriginalCommodityMaxima } from './OriginalMarketEconomy.mjs';
import { size, bool, functional, get, commodity, stat } from './OriginalIndustryState.mjs';
import { ORIGINAL_RESOURCE_INDUSTRIES, validateOriginalResourceIndustry, applyOriginalResourceDeposit, applyOriginalResourceIndustry, originalResourceIndustryOutput } from './OriginalResourceIndustries.mjs';
import { ORIGINAL_INDUSTRY_COMMODITIES, validateOriginalCivicIndustry, applyOriginalCivicIndustry, originalCivicIndustryOutput } from './OriginalCivicIndustries.mjs';
import { ORIGINAL_PRODUCTION_INDUSTRIES, validateOriginalProductionIndustry, applyOriginalProductionIndustry, unapplyOriginalProductionIndustry, originalProductionIndustryOutput } from './OriginalProductionIndustries.mjs';
const special = id => Object.hasOwn(ORIGINAL_SPECIAL_INDUSTRIES.industries, id);
const specialNeeded = id => id === 'lionsguard' ? ['hand_weapons'] : id === 'cryosanctum' ? ['organics', 'supplies'] : [];
const production = id => Object.hasOwn(ORIGINAL_PRODUCTION_INDUSTRIES.industries, id);
const needed = id => ({ lightindustry: ['organics'], refining: ['heavy_machinery', 'ore', 'rare_ore'], heavyindustry: ['metals', 'rare_metals'], orbitalworks: ['metals', 'rare_metals'], fuelprod: ['volatiles'] })[id];
const resource = id => ['farming', 'aquaculture', 'mining'].includes(id);
/** Ordered getters required by the supported native commodity callbacks; shared with real load adapters. */
export function originalIndustryAvailabilityKeys(industryIds) {
    requireThat(Array.isArray(industryIds) && industryIds.length <= 64 && new Set(industryIds).size === industryIds.length, 'UNSUPPORTED_INDUSTRY_PASS', 'Expected unique ordered industry IDs');
    for (const id of industryIds) {
        identifier(id);
        requireThat(resource(id) || production(id) || special(id) || Object.hasOwn(ORIGINAL_INDUSTRY_COMMODITIES.industries, id), 'UNSUPPORTED_INDUSTRY_PASS', 'Unknown availability dependency plugin');
    }
    return immutableJSON([...new Set(['heavy_machinery', ...industryIds.flatMap(id => production(id) ? needed(id) : special(id) ? specialNeeded(id) : [])])]);
}
/** One native conditions -> industries -> max-amounts sequence, commodity effects ONLY. No task-completion/freshness certificate. */
export function reapplyOriginalIndustryCommodityPass(input) {
    economyShape(input, ['marketSize', 'freePort', 'factionIllegalCommodityIds', 'conditions', 'industries', 'available', 'commodities', ...(Object.hasOwn(input, 'production') ? ['production'] : []), ...(Object.hasOwn(input, 'special') ? ['special'] : []), ...(Object.hasOwn(input, 'conditionPhase') ? ['conditionPhase'] : []), ...(Object.hasOwn(input, 'governedSkills') ? ['governedSkills'] : [])], 'industry commodity pass');
    size(input.marketSize);
    bool(input.freePort, 'current free port state');
    requireThat(Array.isArray(input.factionIllegalCommodityIds) && input.factionIllegalCommodityIds.length <= 128, 'UNSUPPORTED_INDUSTRY_PASS', 'Expected current faction illegal commodity list');
    const illegal = new Set();
    for (const id of input.factionIllegalCommodityIds) {
        commodity(id);
        requireThat(!illegal.has(id), 'UNSUPPORTED_INDUSTRY_PASS', 'Duplicate illegal commodity');
        illegal.add(id);
    }
    requireThat(Array.isArray(input.industries) && input.industries.length <= 64, 'UNSUPPORTED_INDUSTRY_PASS', 'Expected complete ordered industry roster');
    const seen = new Set();
    for (const entry of input.industries) {
        economyShape(entry, ['state', 'operating', 'modifiers'], 'industry pass entry');
        (resource(entry.state?.industryId) ? validateOriginalResourceIndustry : production(entry.state?.industryId) ? validateOriginalProductionIndustry : special(entry.state?.industryId) ? validateOriginalSpecialIndustry : validateOriginalCivicIndustry)(entry.state);
        functional(entry.operating);
        // This detached pass does not run actual resource item/planet callbacks.
        // Its input shape is also used by live loading, but live item admission
        // must not silently enable partial item processing in the offline pass.
        if (resource(entry.state.industryId)) requireThat(entry.modifiers?.specialItemId === null,
            'UNSUPPORTED_INDUSTRY_ITEM', 'Offline resource commodity pass requires specialItemId=null; use the live resource callback');
        requireThat(!seen.has(entry.state.industryId), 'UNSUPPORTED_INDUSTRY_PASS', 'Duplicate industry');
        seen.add(entry.state.industryId);
    }
    const hasProduction = input.industries.some(i => production(i.state.industryId));
    requireThat(hasProduction === Object.hasOwn(input, 'production'), 'UNSUPPORTED_INDUSTRY_PASS', 'Production industries require explicit market quality, previous stability and administrator inputs');
    if (hasProduction)
        economyShape(input.production, ['productionQuality', 'previousStability', 'adminFuelSupplyBonus'], 'production market context');
    const hasSpecial = input.industries.some(i => special(i.state.industryId));
    requireThat(hasSpecial === Object.hasOwn(input, 'special'), 'UNSUPPORTED_INDUSTRY_PASS', 'Special industries require current faction and dynamic tech-mining stat');
    if (hasSpecial)
        economyShape(input.special, ['factionId', 'techMiningMult'], 'special industry market context');
    const availableIds = originalIndustryAvailabilityKeys(input.industries.map(i => i.state.industryId));
    economyShape(input.available, availableIds, 'industry production available');
    for (const value of Object.values(input.available)) {
        integer(value, 'commodity availability', -65536);
        requireThat(value <= 65536, 'UNSUPPORTED_INDUSTRY_PASS', 'Unsupported availability range');
    }
    requireThat(Array.isArray(input.conditions) && input.conditions.length <= 128, 'UNSUPPORTED_INDUSTRY_PASS', 'Expected current market conditions');
    const conditionIds = new Set(), applications = [], ignored = [];
    for (const c of input.conditions) {
        economyShape(c, ['id', 'modId', 'surveyed', 'suppressed'], 'market condition');
        identifier(c.id);
        identifier(c.modId);
        requireThat(!conditionIds.has(c.modId), 'UNSUPPORTED_INDUSTRY_PASS', 'Duplicate condition modification ID');
        conditionIds.add(c.modId);
        bool(c.surveyed, 'condition surveyed state');
        bool(c.suppressed, 'condition suppression state');
        // Unknown unapply effects are also unknown, even when this condition is currently suppressed.
        if (Object.hasOwn(input, 'conditionPhase'))
            continue;
        if (Object.hasOwn(ORIGINAL_RESOURCE_INDUSTRIES.conditions, c.id)) {
            if (c.surveyed && !c.suppressed)
                applications.push(c);
        }
        else {
            requireThat(Object.hasOwn(ORIGINAL_INDUSTRY_COMMODITIES.conditions, c.id), 'UNSUPPORTED_INDUSTRY_CONDITION', 'Unknown condition commodity effects; cannot silently skip');
            ignored.push(c.modId);
        }
    }
    requireThat(Array.isArray(input.commodities) && input.commodities.length > 0 && input.commodities.length <= 128, 'UNSUPPORTED_INDUSTRY_PASS', 'Expected explicitly selected commodity roster');
    const commodityIds = new Set();
    for (const c of input.commodities) {
        economyShape(c, ['commodityId', 'previousSupplyLegal', 'previousDemandLegal'], 'previous commodity legality');
        identifier(c.commodityId);
        requireThat(!commodityIds.has(c.commodityId), 'UNSUPPORTED_INDUSTRY_PASS', 'Duplicate commodity');
        commodityIds.add(c.commodityId);
    }
    let industries = structuredClone(input.industries), available = input.available, conditionPhase = null;
    if (Object.hasOwn(input, 'conditionPhase')) {
        economyShape(input.conditionPhase, ['state', 'contextByModId'], 'shared condition phase');
        const result = reapplyOriginalConditionPhase({ marketSize: input.marketSize, conditions: input.conditions, industries, ...input.conditionPhase });
        const before = new Map(input.conditionPhase.state.commodities.map(c => [c.commodityId, c]));
        for (const id of availableIds)
            requireThat(before.has(id) && Math.max(0, Math.floor(stat(before.get(id).available) + 0.5)) === input.available[id], 'UNSUPPORTED_INDUSTRY_PASS', 'Availability must match the captured pre-condition commodity stat');
        for (const id of commodityIds)
            requireThat(before.has(id), 'UNSUPPORTED_INDUSTRY_PASS', 'Selected commodity absent from condition cache roster');
        industries = structuredClone(result.industries);
        const after = new Map(result.state.commodities.map(c => [c.commodityId, c]));
        available = Object.fromEntries(availableIds.map(id => [id, Math.max(0, Math.floor(stat(after.get(id).available) + 0.5))]));
        conditionPhase = { scope: result.scope, state: result.state, conditions: result.conditions, execution: result.execution };
    }
    let governedSkillsPhase;
    if (Object.hasOwn(input,'governedSkills')) {
        requireThat(conditionPhase,'UNSUPPORTED_INDUSTRY_PASS','Governed skills require a shared condition boundary, not an independent replay');
        economyShape(input.governedSkills,['skills','combatFleetSize','groundDefenses'],'governed skills capture');
        governedSkillsPhase=reapplyOriginalGovernedSkills({skills:input.governedSkills.skills,state:{accessibility:conditionPhase.state.accessibility,stability:conditionPhase.state.stability,combatFleetSize:input.governedSkills.combatFleetSize,groundDefenses:input.governedSkills.groundDefenses}});
    }
    for (const c of applications) {
        const selected = industries.filter(i => resource(i.state.industryId));
        const result = applyOriginalResourceDeposit({ conditionId: c.id, modId: c.modId, marketSize: input.marketSize, industries: selected.map(({ state, operating }) => ({ state, operating })) });
        const changed = new Map(result.industries.map(i => [i.state.industryId, i.state]));
        industries = industries.map(entry => ({ ...entry, state: changed.get(entry.state.industryId) ?? entry.state }));
    }
    const habitable = input.conditions.some(c => c.id === 'habitable');
    let productionQuality = input.production?.productionQuality;
    let techMiningMult = input.special?.techMiningMult;
    industries = industries.map(entry => {
        const id = entry.state.industryId;
        if (special(id)) {
            const result = applyOriginalSpecialIndustry({ ...entry, marketSize: input.marketSize, available: Object.fromEntries(specialNeeded(id).map(c => [c, available[c]])), factionId: input.special.factionId, techMiningMult });
            techMiningMult = result.techMiningMult;
            return { ...entry, state: result.state };
        }
        if (production(id)) {
            const unapplied = unapplyOriginalProductionIndustry({ state: entry.state, productionQuality, specialItemId: entry.modifiers.specialItemId });
            const result = applyOriginalProductionIndustry({ ...entry, state: unapplied.state, marketSize: input.marketSize, available: Object.fromEntries(needed(id).map(c => [c, available[c]])), illegalCommodityIds: input.freePort ? [] : [...illegal], conditionIds: input.conditions.map(c => c.id), ...input.production, productionQuality: unapplied.productionQuality });
            productionQuality = result.productionQuality;
            return { ...entry, state: result.state };
        }
        return { ...entry, state: resource(id) ? applyOriginalResourceIndustry({ ...entry, marketSize: input.marketSize, available: { heavy_machinery: available.heavy_machinery } }) : applyOriginalCivicIndustry({ ...entry, marketSize: input.marketSize, habitable }) };
    });
    industries = structuredClone(industries);
    const commodities = {};
    for (const previous of input.commodities) {
        const context = { commodityId: previous.commodityId, illegal: !input.freePort && (illegal.has(previous.commodityId) || illegal.has(ORIGINAL_MARKET_ECONOMY.commodities[previous.commodityId]?.demandClass)) };
        const outputs = industries.map(({ state }) => {
            // Native CommodityOnMarket reads supply for all commodities, but only reads demand for a primary.
            get(state, 'supply', context.commodityId);
            if (ORIGINAL_MARKET_ECONOMY.commodities[context.commodityId]?.demandClass === context.commodityId)
                get(state, 'demand', context.commodityId);
            return (resource(state.industryId) ? originalResourceIndustryOutput : production(state.industryId) ? originalProductionIndustryOutput : special(state.industryId) ? originalSpecialIndustryOutput : originalCivicIndustryOutput)(state, context);
        });
        commodities[context.commodityId] = resolveOriginalCommodityMaxima({ ...previous, industries: outputs });
    }
    return immutableJSON({ scope: 'selected-commodity-effects-only', industries, commodities, ...(conditionPhase ? { conditionPhase } : {}), ...(governedSkillsPhase ? { governedSkillsPhase } : {}), conditionIdsWithoutDirectCommodityEffects: ignored, ...(hasProduction ? { production: { ...input.production, productionQuality } } : {}), ...(hasSpecial ? { special: { ...input.special, techMiningMult } } : {}) });
}
