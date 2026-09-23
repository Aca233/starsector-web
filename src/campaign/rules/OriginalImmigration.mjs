import {isSupportedOriginalMilitaryItem} from './OriginalMilitaryBases.mjs';
import {isSupportedOriginalGroundDefenseItem} from './OriginalGroundDefenses.mjs';
import { isSupportedOriginalPortItem } from './OriginalPortItems.mjs';
import { applyOriginalAdditionalIncoming } from './OriginalAdditionalConditions.mjs';
import { ORIGINAL_PRODUCTION_INDUSTRIES } from './OriginalProductionIndustries.mjs';
import { identifier, integer, isRecord, requireThat, immutableJSON } from '../core/Values.mjs';
import { economyShape } from './OriginalMarketEconomy.mjs';
import { blank, bool, size, stat, put, validateIndustryState } from './OriginalIndustryState.mjs';
import { financeFloat, financeStat, nativeInt } from './OriginalMarketFinance.mjs';
import { countOriginalIndustries } from './OriginalMarketStability.mjs';
import { ORIGINAL_IMMIGRATION as R, environmentContext, validateImmigrationModifierLists } from './OriginalColonyEnvironment.mjs';
const S = R.settings, f = Math.fround, check = (v, message) => requireThat(v, 'UNSUPPORTED_IMMIGRATION', message), round = n => nativeInt(Math.floor(n + 0.5));
export function originalPopulationWeightForSize(marketSize) { financeFloat(marketSize, 'population size', 0, 11); return f(300 * Math.pow(2, f(marketSize - 3))); }
export function originalImmigrationHazardEffects(input) {
    economyShape(input, ['hazard', 'marketSize'], 'immigration hazard');
    size(input.marketSize);
    financeFloat(input.hazard, 'hazard');
    const units = Math.max(0, f(round(f(f(input.hazard - 1) / f(S.immigrationPerHazard)))));
    const sizeMultiplier = f(1 + f(f(input.marketSize - 3) * f(S.immigrationHazardMultExtraPerColonySizeAbove3))), penalty = f(-units * sizeMultiplier);
    const incentivePoints = f(-penalty + f(S.immigrationIncentivePointsAboveHazardPenalty)), incentiveCost = f(f(S.immigrationIncentiveCostPerPoint) * incentivePoints);
    return immutableJSON({ units, sizeMultiplier, penalty, incentivePoints, incentiveCost });
}
function validateNeighbors(input, target, factionIds) {
    economyShape(input, ['econGroup', 'roster', 'markets'], 'immigration economy group');
    if (input.econGroup !== null)
        identifier(input.econGroup);
    check(Array.isArray(input.roster) && input.roster.length <= 4096 && Array.isArray(input.markets), 'Expected actual complete economy roster');
    const seen = new Set();
    for (const row of input.roster) {
        economyShape(row, ['marketId', 'econGroup'], 'economy roster row');
        identifier(row.marketId);
        if (row.econGroup !== null)
            identifier(row.econGroup);
        check(!seen.has(row.marketId), 'Duplicate market roster');
        seen.add(row.marketId);
    }
    const selected = input.roster.filter(m => m.econGroup === input.econGroup);
    check(input.markets.length === selected.length, 'Incomplete immigration group');
    let own = null;
    for (let n = 0; n < input.markets.length; n++) {
        const m = input.markets[n];
        economyShape(m, ['marketId', 'factionId', 'size', 'location', 'hostileToTarget'], 'neighbor market');
        check(m.marketId === selected[n].marketId, 'Reordered/mismatched neighbor roster');
        identifier(m.factionId);
        check(factionIds.has(m.factionId), 'Unknown neighbor faction');
        size(m.size);
        bool(m.hostileToTarget, 'directed neighbor hostility');
        economyShape(m.location, ['x', 'y'], 'hyperspace location');
        financeFloat(m.location.x, 'hyperspace x');
        financeFloat(m.location.y, 'hyperspace y');
        if (m.marketId === target.marketId)
            own = m;
    }
    check(own && own.factionId === target.factionId && own.size === target.size, 'Target missing or inconsistent in economy group');
    let best = null;
    for (const m of input.markets) {
        const dx = f(m.location.x - own.location.x), dy = f(m.location.y - own.location.y), distance = f(f(Math.sqrt(f(f(dx * dx) + f(dy * dy)))) / f(S.unitsPerLightYear));
        if (m === own || m.hostileToTarget || !(distance <= 0) || (best && m.size <= best.size))
            continue;
        best = m;
    }
    return best;
}
/** Entire computeIncoming phase for supported native modifiers; does NOT execute population.advance/increaseMarketSize. */
export function computeOriginalIncoming(input) { return computeIncoming(input, 'logical'); }
/** Object identities affect set uniqueness/order; stateless old resource plugins may share a modId. */
export function computeOriginalIncomingWithObjects(input) { return computeIncoming(input, 'object'); }
function computeIncoming(input, identityMode) {
    economyShape(input, ['market', 'hazard', 'accessibility', 'industries', 'constructionQueue', 'conditions', 'modifiers', 'freeMarketDaysByModId', 'adminAiCoreId', 'drugsAvailable', 'factionIds', 'neighbors', 'maxMarketSize', 'incentives', 'days', 'uiUpdateOnly', ...(isRecord(input) && Object.hasOwn(input, 'luddicMajorityState') ? ['luddicMajorityState'] : [])], 'incoming migration inputs');
    economyShape(input.market, ['marketId', 'factionId', 'size', 'stability', 'hostileToIndependent'], 'incoming target market');
    const m = input.market;
    identifier(m.marketId);
    identifier(m.factionId);
    size(m.size);
    integer(m.stability, 'stability');
    check(m.stability <= 10, 'Unclamped stability getter');
    bool(m.hostileToIndependent, 'independent hostility');
    check(Array.isArray(input.industries) && input.industries.length <= 64, 'Expected actual industry roster');
    const industryMap = new Map();
    const cores = [null, 'alpha_core', 'beta_core', 'gamma_core'];
    check(cores.includes(input.adminAiCoreId), 'Unknown administrator AI core');
    for (const e of input.industries) {
        economyShape(e, ['state', 'operating', 'modifiers'], 'incoming industry state');
        validateIndustryState(e.state);
        economyShape(e.modifiers, ['aiCoreId', 'improved', 'adminSupplyBonus', 'adminDemandReduction', 'supplyBonusFromOther', 'demandReductionFromOther', 'specialItemId'], 'captured industry modifiers');
        bool(e.modifiers.improved, 'improved');
        for (const key of ['adminSupplyBonus', 'adminDemandReduction'])
            financeFloat(e.modifiers[key], key, -65536, 65536);
        stat(e.modifiers.supplyBonusFromOther);
        stat(e.modifiers.demandReductionFromOther);
        check(cores.includes(e.modifiers.aiCoreId), 'Unimplemented core immigration');
        const item = e.modifiers.specialItemId;
        if (item !== null) {
            identifier(item);
            const supported = isSupportedOriginalMilitaryItem(e.state.industryId,item) || isSupportedOriginalGroundDefenseItem(e.state.industryId,item) || isSupportedOriginalPortItem(e.state.industryId, item) || Object.hasOwn(ORIGINAL_PRODUCTION_INDUSTRIES.items, item) && ORIGINAL_PRODUCTION_INDUSTRIES.items[item].industryIds.includes(e.state.industryId) || item === 'dealmaker_holosuite' && e.state.industryId === 'commerce';
            check(supported, 'Unknown or incompatible industry item immigration effects');
        }
        industryMap.set(e.state.industryId, e);
    }
    const context = environmentContext(input.conditions, input.industries.map(e => ({ industryId: e.state.industryId, operating: e.operating })), 'incoming');
    validateImmigrationModifierLists(input.modifiers, context, identityMode);
    check(isRecord(input.freeMarketDaysByModId), 'Expected captured free-market ages');
    const freeIds = input.conditions.filter(c => c.id === 'free_market').map(c => c.modId);
    check(Object.keys(input.freeMarketDaysByModId).length === freeIds.length, 'Missing/excess free-market ages');
    for (const id of freeIds) {
        check(Object.hasOwn(input.freeMarketDaysByModId, id), 'Missing free-market age');
        financeFloat(input.freeMarketDaysByModId[id], 'free-market days', 0);
    }
    const hasChurch = input.conditions.some(c => c.id === 'luddic_majority');
    check(hasChurch === Object.hasOwn(input, 'luddicMajorityState'), 'Missing or unexpected Luddic-majority getter state');
    if (hasChurch) {
        economyShape(input.luddicMajorityState, ['playerOwned', 'defeatedExpedition'], 'Luddic-majority incoming getters');
        bool(input.luddicMajorityState.playerOwned, 'Luddic-majority player ownership');
        bool(input.luddicMajorityState.defeatedExpedition, 'defeated Church expedition');
    }
    integer(input.drugsAvailable, 'current drug availability');
    check(input.drugsAvailable <= 65536, 'Unsupported availability');
    check(Array.isArray(input.factionIds) && input.factionIds.length <= 4096, 'Expected actual faction roster');
    const factions = new Set();
    for (const id of input.factionIds) {
        identifier(id);
        check(!factions.has(id), 'Duplicate faction');
        factions.add(id);
    }
    check(factions.has(m.factionId), 'Target faction does not exist');
    const best = validateNeighbors(input.neighbors, m, factions), hazard = originalImmigrationHazardEffects({ hazard: input.hazard, marketSize: m.size }), access = financeStat({ base: 0, modifiers: input.accessibility });
    const maxSize = round(financeStat({ base: f(S.maxColonySize), modifiers: input.maxMarketSize }));
    economyShape(input.incentives, ['on', 'credits'], 'incentive state');
    bool(input.incentives.on, 'incentives');
    financeFloat(input.incentives.credits, 'accumulated incentive credits');
    financeFloat(input.days, 'elapsed game days', 0, 31);
    bool(input.uiUpdateOnly, 'UI update');
    let on = input.incentives.on, credits = input.incentives.credits;
    let weight = blank(), composition = [];
    const add = (id, n) => { const row = composition.find(r => r.factionId === id); if (row)
        row.amount = f(row.amount + n);
    else
        composition.push({ factionId: id, amount: f(n) }); };
    const flat = (id, n) => put(weight, 'flat', id, f(n));
    if (m.stability < 5)
        flat('inc_st', m.stability - 5);
    const numIndustries = countOriginalIndustries(input.industries.map(e => ({ industryId: e.state.industryId, operating: e.operating })), input.constructionQueue);
    if (numIndustries <= 0 && S.GROWTH_NO_INDUSTRIES !== 0 && m.size > 3)
        flat('inc_noInd', -round(f(originalPopulationWeightForSize(m.size) * f(S.GROWTH_NO_INDUSTRIES))));
    const roundedAccess = f(f(round(f(access * 100))) / 100), accessibilityMod = nativeInt(f(roundedAccess / f(S.accessibilityPerUnitShipping)));
    flat('inc_access', accessibilityMod);
    if (hazard.penalty !== 0)
        flat('inc_hazard', hazard.penalty);
    if (best && best.size > m.size)
        flat('inc_insys', f((best.size - m.size) * 2));
    add('pirates', input.industries.length);
    add('poor', input.industries.length);
    add(m.hostileToIndependent ? m.factionId : 'independent', f(10 * input.industries.length));
    let incentiveAccrued = 0;
    if (on) {
        if (m.size >= maxSize)
            on = false;
        else if (hazard.incentivePoints > 0) {
            flat('inc_incentives', hazard.incentivePoints);
            if (!input.uiUpdateOnly) {
                incentiveAccrued = f(hazard.incentiveCost * f(input.days / 30));
                credits = f(credits + incentiveAccrued);
            }
        }
    }
    const aiImpact = id => id === 'alpha_core' ? 10 : id === 'beta_core' ? 4 : id === 'gamma_core' ? 1 : 0;
    for (const ref of [...input.modifiers.permanent, ...input.modifiers.transient]) {
        if (ref.kind === 'condition') {
            const c = context.conditions.get(ref.id), kind = context.conditionClasses.get(ref.id);
            if (kind === 'MildClimate' || kind === 'LuddicMajority') {
                const updated = applyOriginalAdditionalIncoming({ conditionId: c.id, modId: c.modId, marketSize: m.size, playerOwned: input.luddicMajorityState?.playerOwned ?? false, defeatedExpedition: input.luddicMajorityState?.defeatedExpedition ?? false, incoming: { composition, weight } });
                ({ composition, weight } = structuredClone(updated));
            }
            else if (kind === 'LCAttractorLow')
                add('luddic_church', 10);
            else if (kind === 'LCAttractorMedium')
                add('luddic_church', 20);
            else if (kind === 'Pollution')
                add('luddic_path',10);
            else if (kind === 'Habitable') {
                add('luddic_church', 20);
                flat(c.modId, Math.max(0, m.size - 1));
            }
            else if (kind === 'DecivilizedSubpop') {
                add('poor', 10);
                flat(c.modId, m.size);
            }
            else if (kind === 'FreeMarket') {
                add('pirates', 5);
                add('poor', 5);
                add('independent', 5);
                const days = input.freeMarketDaysByModId[c.modId], growth = f(f(S.MIN_GROWTH) + f(f(days / f(S.MAX_DAYS)) * f(S.MAX_GROWTH - S.MIN_GROWTH)));
                flat(c.modId, Math.max(1, Math.min(S.MAX_GROWTH, round(growth))));
            }
            else if (kind === 'ResourceDepositsCondition') {
                const amount = { farmland_poor: 5, farmland_adequate: 10, farmland_rich: 20, farmland_bountiful: 30, water_surface: 10 }[c.id] ?? 0;
                if (amount > 0)
                    add('luddic_church', amount);
            }
        }
        else {
            const e = industryMap.get(ref.id), kind = R.industries[ref.id].className, key = 'ind_' + ref.id;
            if (kind === 'TradeCenter' || kind === 'TechMining')
                add('tritachyon',10);
            else if (kind === 'Farming')
                add('luddic_church', 10);
            else if (kind === 'Spaceport')
                flat(key, ref.id === 'megaport' ? m.size : 2);
            else if (kind === 'Mining') {
                const shortage = Math.max(0, Math.trunc(stat(e.state.demand.drugs ?? blank())) - input.drugsAvailable);
                if (shortage > 0)
                    flat(key, -shortage);
            }
            else if (kind === 'PopulationAndInfrastructure') {
                let level = 0;
                for (const i of input.industries)
                    level = f(level + aiImpact(i.modifiers.aiCoreId));
                if (input.adminAiCoreId !== null)
                    level = f(level + f(10 * aiImpact(input.adminAiCoreId)));
                for (const id of ['techmining', 'heavyindustry', 'fuelprod', 'starfortress'])
                    if (industryMap.has(id))
                        level = f(level + 10);
                if (level > 0)
                    add('luddic_path', f(level * f(0.2)));
            }
        }
    }
    const kept = composition.filter(row => factions.has(row.factionId));
    const positiveWeight = weight.modifiers.flat.reduce((a, mod) => mod.value > 0 ? f(a + mod.value) : a, 0), total = kept.reduce((a, row) => f(a + row.amount), 0);
    for (const row of kept)
        row.amount = positiveWeight <= 0 || total <= 0 ? 0 : f(f(row.amount * positiveWeight) / total);
    return immutableJSON({ scope: 'supported-native-incoming-phase-only', incoming: { composition: kept, weight }, weightValue: financeStat(weight), positiveWeight, incentives: { on, credits }, incentiveAccrued, incentiveMonthlyCost: hazard.incentiveCost, diagnostics: { hazard, numIndustries, industryNodeCount: input.industries.length, roundedAccess, accessibilityMod, maxMarketSize: maxSize, biggestNeighborId: best?.marketId ?? null } });
}
