import { ORIGINAL_SPECIAL_INDUSTRIES, originalSpecialIndustryFunctional } from './OriginalSpecialIndustries.mjs';
import raw from '../data/reference-market-stability.json' with { type: 'json' };
import { identifier, integer, isRecord, requireThat, immutableJSON, canonicalJSON } from '../core/Values.mjs';
import { ORIGINAL_MARKET_ECONOMY, economyShape, economyFloat } from './OriginalMarketEconomy.mjs';
import { reapplyOriginalIndustryCommodityPass } from './OriginalIndustryCommodityPass.mjs';
import { blank, bool, functional, stat, put } from './OriginalIndustryState.mjs';
export const ORIGINAL_MARKET_STABILITY = immutableJSON(raw);
const R = ORIGINAL_MARKET_STABILITY, S = R.settings, f = Math.fround;
const requireInput = (ok, message) => requireThat(ok, 'UNSUPPORTED_MARKET_STABILITY', message);
const nativeFloat = (n, name, min = -65536, max = 65536) => { economyFloat(n, name, min, max); requireInput(n === f(n), 'Captured ' + name + ' must retain native float precision'); return n; };
const count = (n, name, min = 0) => { integer(n, name, min); requireInput(n <= 65536, 'Unsupported ' + name); return n; };
const erase = (s, channel, id) => put(s, channel, id, 0, true);
function eraseAll(s, id) { for (const channel of ['flat', 'percent', 'mult'])
    erase(s, channel, id); }
function always(s, channel, id, value) { const mods = s.modifiers[channel], index = mods.findIndex(m => m.id === id), mod = { id, value }; if (index < 0)
    mods.push(mod);
else
    mods[index] = mod; }
export function originalMarketStabilityValue(stability) { return Math.floor(Math.max(0, Math.min(10, stat(stability))) + 0.5); }
export function originalFreeMarketStabilityPenalty(daysActive) {
    nativeFloat(daysActive, 'free-market days', 0, 2 ** 24);
    const c = R.freeMarket;
    return Math.max(1, Math.min(c.MAX_STABILITY_PENALTY, Math.floor(f(f(c.MIN_STABILITY_PENALTY) + f(f(daysActive / f(c.MAX_DAYS)) * f(c.MAX_STABILITY_PENALTY - c.MIN_STABILITY_PENALTY))) + 0.5)));
}
/** A single native player's complete economy roster, not a global multiplayer ownership policy. */
export function originalMismanagementPenalty(input) {
    economyShape(input, ['markets', 'maxOutposts'], 'native player governance');
    count(input.maxOutposts, 'modified outpost limit', -65536);
    requireInput(Array.isArray(input.markets) && input.markets.length <= 4096, 'Expected complete current economy governance roster');
    const ids = new Set();
    let owned = 0;
    for (const m of input.markets) {
        economyShape(m, ['marketId', 'playerOwned', 'adminIsPlayer'], 'governance roster market');
        identifier(m.marketId);
        bool(m.playerOwned, 'player ownership');
        bool(m.adminIsPlayer, 'player administrator');
        requireInput(!ids.has(m.marketId), 'Duplicate governance market');
        ids.add(m.marketId);
        if (m.playerOwned && m.adminIsPlayer)
            owned++;
    }
    return Math.trunc(f((owned - input.maxOutposts) * f(S.colonyOverMaxPenalty)));
}
function definition(id) { requireInput(Object.hasOwn(R.industries, id), 'Unsupported industry stability/counting plugin'); return R.industries[id]; }
export function countOriginalIndustries(entries, queue) {
    requireInput(Array.isArray(entries) && entries.length <= 64, 'Expected complete industry roster');
    const seen = new Set();
    let result = 0;
    for (const e of entries) {
        economyShape(e, ['industryId', 'operating'], 'industry count entry');
        identifier(e.industryId);
        functional(e.operating);
        requireInput(!seen.has(e.industryId), 'Duplicate industry');
        seen.add(e.industryId);
        const spec = definition(e.industryId);
        if (spec.tags.includes('industry'))
            result++;
        else if (e.operating.building && e.operating.upgradeId !== null && spec.upgrade !== null && definition(spec.upgrade).tags.includes('industry'))
            result++;
    }
    requireInput(Array.isArray(queue) && queue.length <= 128, 'Expected actual construction queue');
    for (const id of queue) {
        identifier(id);
        if (definition(id).tags.includes('industry'))
            result++;
    }
    return result;
}
function commodityRows(rows, selected) {
    requireInput(Array.isArray(rows) && rows.length <= 128 && rows.length === selected.length, 'Expected complete ordered captured market commodity roster');
    const map = new Map();
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        economyShape(row, ['commodityId', 'maxDemand', 'maxSupply', 'available', 'shippingFaction', 'maxExportFaction'], 'pre-industry commodity capture');
        requireInput(row.commodityId === selected[i].commodityId && !map.has(row.commodityId), 'Captured commodity roster differs from industry pass');
        const c = ORIGINAL_MARKET_ECONOMY.commodities[row.commodityId];
        requireInput(Object.hasOwn(ORIGINAL_MARKET_ECONOMY.commodities, row.commodityId) && Object.hasOwn(ORIGINAL_MARKET_ECONOMY.commodities, c.demandClass) && !c.plugin, 'Unsupported commodity class/plugin');
        for (const name of ['maxDemand', 'maxSupply', 'available', 'shippingFaction', 'maxExportFaction'])
            count(row[name], name);
        map.set(row.commodityId, row);
    }
    return map;
}
function inFactionUpkeep(rows) {
    let totalDemand = 0, inFactionSupply = 0;
    for (const row of rows) {
        if (ORIGINAL_MARKET_ECONOMY.commodities[row.commodityId].tags.includes('nonecon') || row.maxDemand <= 0)
            continue;
        totalDemand = f(totalDemand + row.maxDemand);
        let amount = Math.max(Math.min(row.maxSupply, row.available), Math.min(row.shippingFaction, row.maxExportFaction));
        if (amount > row.maxDemand)
            amount = row.maxDemand;
        if (amount < row.maxDemand)
            amount = Math.max(Math.min(row.maxSupply, row.available), 0);
        inFactionSupply = f(inFactionSupply + Math.max(0, Math.min(amount, row.available)));
    }
    const fraction = totalDemand > 0 ? Math.max(0, Math.min(1, f(inFactionSupply / totalDemand))) : null;
    const multiplier = fraction === null ? null : fraction <= 0 ? 1 : f(Math.floor(f(100 - f(f(fraction * f(S.upkeepReductionFromInFactionImports)) * 100)) + 0.5) / 100);
    return { totalDemand, inFactionSupply, fraction, multiplier };
}
/** Native modifyStability callback on a trusted mutable transaction, not the whole industry apply.
 * Commodity getters may initialize a shared network and mutate this and other markets.
 */
export function modifyOriginalPopulationStability(runtime) {
    const { state, previousStability, playerOwned, adminIsPlayer, hasCommRelay, modId } = runtime;
    identifier(modId);
    for (const key of ['stability', 'incomeMult', 'upkeepMult']) stat(state[key]);
    nativeFloat(previousStability, 'previous stability', -1, 10);
    bool(playerOwned, 'player ownership'); bool(hasCommRelay, 'comm relay condition');
    if (playerOwned && !runtime.isAdminPlayer) bool(adminIsPlayer, 'player administrator');
    if (runtime.isAdminPlayer !== undefined) requireInput(typeof runtime.isAdminPlayer === 'function', 'Expected live administrator getter');
    for (const key of ['getCommodityIds', 'getMaxDemand', 'getAfterNetwork', 'getMismanagementPenalty'])
        requireInput(typeof runtime[key] === 'function', 'Missing live population getter ' + key);
    const call = (method, ...args) => {
        const result = runtime[method](...args);
        requireInput(!result || typeof result.then !== 'function', 'Population getters must be synchronous');
        return result;
    };
    always(state.incomeMult, 'mult', modId, previousStability <= 5 ? Math.max(0, f(previousStability / 5)) : 1);
    put(state.stability, 'flat', '_' + modId + '_ms', S.stabilityBaseValue);
    const ids = call('getCommodityIds');
    requireInput(Array.isArray(ids) && ids.length <= 128 && new Set(ids).size === ids.length, 'Expected complete ordered live commodity copy');
    const rows = [];
    for (const commodityId of ids) {
        identifier(commodityId);
        const spec = ORIGINAL_MARKET_ECONOMY.commodities[commodityId];
        requireInput(spec, 'Unknown live population commodity');
        if (spec.tags.includes('nonecon')) continue;
        requireInput(!spec.plugin, 'Unsupported live population commodity plugin');
        // Do not snapshot all demands in advance: a primary constructor changes later variants.
        const maxDemand = call('getMaxDemand', commodityId);
        count(maxDemand, 'live commodity demand');
        if (maxDemand <= 0) continue;
        const after = call('getAfterNetwork', commodityId);
        economyShape(after, ['maxSupply', 'available', 'shippingFaction', 'maxExportFaction'], 'post-network population getters');
        for (const key of Object.keys(after)) count(after[key], key);
        rows.push({ commodityId, maxDemand, ...after });
    }
    const upkeep = inFactionUpkeep(rows);
    if (upkeep.multiplier !== null) always(state.upkeepMult, 'mult', modId + 'ifi', upkeep.multiplier);
    let penalty = null;
    const currentAdminIsPlayer=playerOwned&&runtime.isAdminPlayer?call('isAdminPlayer'):adminIsPlayer;
    if(playerOwned)bool(currentAdminIsPlayer,'current player administrator');
    if (playerOwned && currentAdminIsPlayer) {
        penalty = call('getMismanagementPenalty'); count(penalty, 'live mismanagement penalty', -65536);
        if (penalty !== 0) put(state.stability, 'flat', '_' + modId + '_mm', -penalty);
        else erase(state.stability, 'flat', '_' + modId + '_mm');
    } else erase(state.stability, 'flat', modId + '_mm'); // Native intentionally lacks leading underscore here.
    if (!hasCommRelay) put(state.stability, 'flat', 'core_comm_relay', R.relay.NO_RELAY_PENALTY);
    return immutableJSON({ scope: 'live-population-financial-factors-only', rows, inFactionUpkeep: upkeep, mismanagementPenalty: penalty });
}
function conditionEffects(conditions, states, stability) {
    requireInput(isRecord(states), 'Expected native condition states keyed by modification ID');
    const consumed = new Set();
    for (const c of conditions) {
        const active = c.surveyed && !c.suppressed;
        if (['free_market', 'recent_unrest', 'comm_relay'].includes(c.id)) {
            requireInput(Object.hasOwn(states, c.modId), 'Missing captured condition state');
            consumed.add(c.modId);
        }
        if (c.id === 'free_market') {
            economyShape(states[c.modId], ['daysActive'], 'free market state');
            const penalty = originalFreeMarketStabilityPenalty(states[c.modId].daysActive);
            erase(stability, 'flat', c.modId);
            if (active)
                put(stability, 'flat', c.modId, -penalty);
        }
        else if (c.id === 'recent_unrest') {
            economyShape(states[c.modId], ['penalty'], 'recent unrest state');
            count(states[c.modId].penalty, 'unrest penalty');
            eraseAll(stability, c.modId);
            if (active)
                put(stability, 'flat', c.modId, -states[c.modId].penalty);
        }
        else if (c.id === 'decivilized_subpop') {
            eraseAll(stability, c.modId);
            if (active)
                put(stability, 'flat', c.modId, -R.decivilized.STABILITY_PENALTY);
        }
        else if (c.id === 'comm_relay') {
            const state = states[c.modId];
            economyShape(state, ['hasContainingLocation', 'relays'], 'comm relay condition state');
            bool(state.hasContainingLocation, 'market containing location');
            requireInput(Array.isArray(state.relays) && state.relays.length <= 4096, 'Expected current native relay roster');
            const ids = new Set();
            let best = null;
            for (const relay of state.relays) {
                economyShape(relay, ['id', 'sameFaction', 'nonFunctional', 'makeshift'], 'relay state');
                identifier(relay.id);
                requireInput(!ids.has(relay.id), 'Duplicate relay');
                ids.add(relay.id);
                for (const name of ['sameFaction', 'nonFunctional', 'makeshift'])
                    bool(relay[name], name);
                // getBestRelay does NOT prune dead/moved members; advance owns that lifecycle.
                if (relay.nonFunctional || !relay.sameFaction || (best !== null && (!best.makeshift || relay.makeshift)))
                    continue;
                best = relay;
            }
            erase(stability, 'flat', 'core_comm_relay');
            if (active && state.hasContainingLocation && best)
                put(stability, 'flat', 'core_comm_relay', best.makeshift ? R.relay.MAKESHIFT_COMM_RELAY_BONUS : R.relay.COMM_RELAY_BONUS);
        }
    }
    requireInput(Object.keys(states).length === consumed.size, 'Unexpected condition state entries');
}
/** Source-backed conditions/commodity/stability subset; NOT a whole reapply, income settlement or completed economy task. */
export function reapplyOriginalMarketStability(input) {
    economyShape(input, ['commodityPass', 'stability', 'incomeMult', 'upkeepMult', 'maxIndustries', 'previousStability', 'hazard', 'governance', 'constructionQueue', 'conditionStateByModId', 'marketCommodities'], 'local market stability pass');
    const p = input.commodityPass;
    const commodityEffects = reapplyOriginalIndustryCommodityPass(p);
    const shared = commodityEffects.conditionPhase;
    const stability = structuredClone(commodityEffects.governedSkillsPhase?.state.stability ?? (shared ? shared.state.stability : input.stability)), incomeMult = structuredClone(input.incomeMult), upkeepMult = structuredClone(input.upkeepMult), maxIndustries = { base: 0, modifiers: structuredClone(input.maxIndustries) };
    for (const value of [stability, incomeMult, upkeepMult, maxIndustries])
        stat(value);
    nativeFloat(input.previousStability, 'previous stability', -1, 10);
    nativeFloat(input.hazard, 'hazard');
    economyShape(input.governance, ['marketId', 'markets', 'maxOutposts'], 'market governance');
    identifier(input.governance.marketId);
    const penalty = originalMismanagementPenalty({ markets: input.governance.markets, maxOutposts: input.governance.maxOutposts }), governed = input.governance.markets.find(m => m.marketId === input.governance.marketId);
    requireInput(governed, 'Current market missing from governance roster');
    const capturedRows = commodityRows(input.marketCommodities, p.commodities);
    let currentCommodities = input.marketCommodities, hazard = input.hazard;
    if (shared) {
        stat(input.stability);
        requireInput(canonicalJSON(input.stability) === canonicalJSON(p.conditionPhase.state.stability), 'Conflicting pre-condition stability captures');
        requireInput(input.hazard === stat(p.conditionPhase.state.hazard), 'Conflicting pre-condition hazard captures');
        const legacy = p.conditions.filter(c => ['free_market', 'recent_unrest', 'comm_relay'].includes(c.id));
        requireInput(isRecord(input.conditionStateByModId) && Object.keys(input.conditionStateByModId).length === legacy.length, 'Legacy condition captures do not match shared phase');
        for (const c of legacy)
            requireInput(Object.hasOwn(input.conditionStateByModId, c.modId) && canonicalJSON(input.conditionStateByModId[c.modId]) === canonicalJSON(p.conditionPhase.contextByModId[c.modId]), 'Conflicting condition context: ' + c.modId);
        const before = p.conditionPhase.state.commodities, after = shared.state.commodities;
        requireInput(before.length === input.marketCommodities.length && after.length === before.length, 'Shared condition commodity roster must equal complete financial roster');
        currentCommodities = input.marketCommodities.map((row, i) => {
            requireInput(before[i].commodityId === row.commodityId && after[i].commodityId === row.commodityId, 'Shared condition commodity order differs from finance');
            requireInput(before[i].maxSupply === row.maxSupply && Math.max(0, Math.floor(stat(before[i].available) + 0.5)) === row.available, 'Conflicting pre-condition commodity cache: ' + row.commodityId);
            return { ...row, available: Math.max(0, Math.floor(stat(after[i].available) + 0.5)) };
        });
        hazard = stat(shared.state.hazard);
    }
    const rows = commodityRows(currentCommodities, p.commodities), upkeep = inFactionUpkeep(currentCommodities);
    if (p.production) {
        requireInput(p.production.previousStability === input.previousStability, 'Conflicting previous stability captures');
        for (const [id, available] of Object.entries(p.available))
            requireInput(capturedRows.has(id) && capturedRows.get(id).available === available, 'Missing/conflicting production commodity availability: ' + id);
    }
    if (p.special)
        for (const [id, available] of Object.entries(p.available))
            requireInput(capturedRows.has(id) && capturedRows.get(id).available === available, 'Missing/conflicting special commodity availability: ' + id);
    if (capturedRows.has('heavy_machinery'))
        requireInput(capturedRows.get('heavy_machinery').available === p.available.heavy_machinery, 'Conflicting heavy machinery capture');
    if (p.industries.some(i => ['farming', 'aquaculture', 'mining'].includes(i.state.industryId)))
        requireInput(rows.has('heavy_machinery'), 'Missing resource-production availability');
    const industryCount = countOriginalIndustries(p.industries.map(e => ({ industryId: e.state.industryId, operating: e.operating })), input.constructionQueue), deficitReads = [], industryFinancialInputs = [];
    if (!shared)
        conditionEffects(p.conditions, input.conditionStateByModId, stability);
    const maxDeficit = (state, ids, phase) => {
        let deficit = 0, commodityId = null;
        for (const id of ids) {
            requireInput(rows.has(id), 'Missing required availability: ' + id);
            const demand = Math.trunc(stat(state.demand[id] ?? blank())), value = Math.max(0, demand - rows.get(id).available);
            if (value > deficit) {
                deficit = value;
                commodityId = id;
            }
        }
        const result = { industryId: state.industryId, phase, commodityId, deficit };
        deficitReads.push(result);
        return deficit;
    };
    for (let i = 0; i < p.industries.length; i++) {
        const entry = p.industries[i], before = entry.state, after = commodityEffects.industries[i].state, d = definition(before.industryId), kind = d.className, prefix = 'ind_' + before.industryId;
        let incomeAtRefresh = null;
        if (kind === 'TradeCenter') {
            const C = ORIGINAL_SPECIAL_INDUSTRIES.constants;
            erase(stability, 'flat', prefix);
            for (const n of [0, 1, 2])
                erase(incomeMult, 'percent', prefix + '_' + n);
            if (entry.modifiers.specialItemId === 'dealmaker_holosuite')
                erase(incomeMult, 'percent', 'dealmaker_holosuite');
            incomeAtRefresh = stat(incomeMult); // Base.apply(true) updates finances BEFORE adding these callbacks.
            if (entry.modifiers.aiCoreId === 'alpha_core')
                put(incomeMult, 'percent', prefix + '_1', C.ALPHA_CORE_BONUS);
            if (entry.modifiers.improved)
                put(incomeMult, 'percent', prefix + '_2', C.IMPROVE_BONUS);
            if (entry.modifiers.specialItemId === 'dealmaker_holosuite')
                put(incomeMult, 'percent', 'dealmaker_holosuite', C.DEALMAKER_INCOME_PERCENT_BONUS);
            put(stability, 'flat', prefix, -C.STABILITY_PENALTY);
            put(incomeMult, 'percent', prefix + '_0', C.BASE_BONUS);
            if (!functional(entry.operating)) {
                erase(stability, 'flat', prefix);
                for (const n of [0, 1, 2])
                    erase(incomeMult, 'percent', prefix + '_' + n);
                if (entry.modifiers.specialItemId === 'dealmaker_holosuite')
                    erase(incomeMult, 'percent', 'dealmaker_holosuite');
            }
        }
        else if (kind === 'PopulationAndInfrastructure') {
            // Base.unapply removes improvements, then Population.unapply removes its owned channels.
            erase(stability, 'flat', 'PAI_improve');
            for (const n of [0, 1, 2])
                eraseAll(stability, prefix + '_' + n);
            erase(maxIndustries, 'flat', prefix);
            const modId = prefix + '_3';
            erase(incomeMult, 'mult', modId);
            erase(upkeepMult, 'mult', modId);
            erase(upkeepMult, 'mult', modId + 'ifi');
            for (const id of [modId, '_' + modId + '_mm', '_' + modId + '_ms', '_' + modId + '_overmax'])
                erase(stability, 'flat', id);
            const relayPresent = p.conditions.some(c => c.id === 'comm_relay');
            if (!relayPresent)
                erase(stability, 'flat', 'core_comm_relay');
            const incomeFactor = input.previousStability <= 5 ? Math.max(0, f(input.previousStability / 5)) : 1;
            always(incomeMult, 'mult', modId, incomeFactor);
            put(stability, 'flat', '_' + modId + '_ms', S.stabilityBaseValue);
            if (upkeep.multiplier !== null)
                always(upkeepMult, 'mult', modId + 'ifi', upkeep.multiplier);
            if (governed.playerOwned && governed.adminIsPlayer) {
                if (penalty !== 0)
                    put(stability, 'flat', '_' + modId + '_mm', -penalty);
                else
                    erase(stability, 'flat', '_' + modId + '_mm');
            }
            else
                erase(stability, 'flat', modId + '_mm'); // Native asymmetry; unapply above already cleared the underscored entry.
            if (!relayPresent)
                put(stability, 'flat', 'core_comm_relay', R.relay.NO_RELAY_PENALTY);
            if (entry.modifiers.improved)
                put(stability, 'flat', 'PAI_improve', R.population.IMPROVE_STABILITY_BONUS);
            if (maxDeficit(after, ['domestic_goods'], 'after-demand') <= 0)
                put(stability, 'flat', prefix + '_0', 1);
            if (maxDeficit(after, ['luxury_goods'], 'after-demand') <= 0 && p.marketSize > 3)
                put(stability, 'flat', prefix + '_1', 1);
            const foodDeficit = maxDeficit(after, p.conditions.some(c => c.id === 'habitable') ? ['food'] : ['food', 'organics'], 'after-demand');
            if (foodDeficit > 0)
                put(stability, 'flat', prefix + '_2', -foodDeficit);
            put(maxIndustries, 'flat', prefix, R.maxIndustries[Math.max(0, Math.min(9, p.marketSize - 1))]);
            if (industryCount > Math.floor(stat(maxIndustries) + 0.5))
                put(stability, 'flat', '_' + modId + '_overmax', -S.overMaxIndustriesPenalty);
        }
        else if (['MilitaryBase', 'GroundDefenses', 'OrbitalStation', 'LionsGuardHQ'].includes(kind)) {
            const station = kind === 'OrbitalStation';
            if (station)
                erase(stability, 'flat', 'orbital_station_improve');
            erase(stability, 'flat', prefix);
            if (station && entry.modifiers.improved)
                put(stability, 'flat', 'orbital_station_improve', R.station.IMPROVE_STABILITY_BONUS);
            const base = station ? d.tags.includes('battlestation') ? 2 : d.tags.includes('starfortress') ? 3 : 1 : kind === 'LionsGuardHQ' ? 2 : kind === 'MilitaryBase' ? d.tags.includes('patrol') ? 1 : 2 : 1;
            const ids = station ? ['supplies', 'crew'] : kind === 'LionsGuardHQ' ? ['supplies', 'fuel', 'ships', 'hand_weapons'] : kind === 'MilitaryBase' ? ['supplies', 'fuel', 'ships'] : ['supplies', 'marines', 'hand_weapons'];
            const shortage = maxDeficit(station ? before : after, ids, station ? 'before-demand' : 'after-demand'), bonus = base - Math.min(base, shortage);
            if (bonus > 0)
                put(stability, 'flat', prefix, bonus);
            if (!(kind === 'LionsGuardHQ' ? originalSpecialIndustryFunctional(before.industryId, entry.operating, p.special.factionId) : functional(entry.operating))) {
                if (station)
                    erase(stability, 'flat', 'orbital_station_improve');
                erase(stability, 'flat', prefix);
            }
        }
        // Population and commerce change market multipliers; commerce has an earlier financial refresh.
        // Capture BEFORE the post-loop hazard update, not from the final market values.
        industryFinancialInputs.push({ industryId: before.industryId, incomeMult: incomeAtRefresh ?? stat(incomeMult), upkeepMult: stat(upkeepMult) });
    }
    always(upkeepMult, 'mult', 'upkeep_hazard_mod', Math.max(hazard, f(S.minUpkeepMult)));
    return immutableJSON({ scope: 'local-stability-and-population-financial-factors-only', commodityEffects, stability, incomeMult, upkeepMult, maxIndustries: maxIndustries.modifiers,
        values: { stability: originalMarketStabilityValue(stability), rawStability: stat(stability), incomeMult: stat(incomeMult), upkeepMult: stat(upkeepMult), maxIndustries: Math.floor(stat(maxIndustries) + 0.5) },
        diagnostics: { mismanagementPenalty: penalty, industryCount, inFactionUpkeep: upkeep, deficitReads, industryFinancialInputs, ...(shared ? { marketCommodities: currentCommodities, hazardBeforeConditions: input.hazard, hazardAfterConditions: hazard } : {}) } });
}
