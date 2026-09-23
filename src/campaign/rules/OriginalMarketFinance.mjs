import { isSupportedOriginalResourceItem } from './OriginalResourceIndustries.mjs';
import {isSupportedOriginalMilitaryItem} from './OriginalMilitaryBases.mjs';
import {isSupportedOriginalGroundDefenseItem} from './OriginalGroundDefenses.mjs';
import { isSupportedOriginalPortItem } from './OriginalPortItems.mjs';
import { ORIGINAL_SPECIAL_INDUSTRIES, originalSpecialIndustryFunctional, originalTechMiningFinancialSize } from './OriginalSpecialIndustries.mjs';
import raw from '../data/reference-market-finance.json' with { type: 'json' };
import { identifier, integer, finite, requireThat, immutableJSON } from '../core/Values.mjs';
import { ORIGINAL_MARKET_ECONOMY, economyShape, resolveOriginalEconomyMutable } from './OriginalMarketEconomy.mjs';
import { blank, bool, functional, stat, put } from './OriginalIndustryState.mjs';
import { reapplyOriginalMarketStability } from './OriginalMarketStability.mjs';
import { ORIGINAL_PRODUCTION_INDUSTRIES } from './OriginalProductionIndustries.mjs';
export const ORIGINAL_MARKET_FINANCE = immutableJSON(raw);
const R = ORIGINAL_MARKET_FINANCE, f = Math.fround;
const check = (v, message) => requireThat(v, 'UNSUPPORTED_MARKET_FINANCE', message);
export function financeFloat(n, name, min = -(2 ** 24), max = 2 ** 24) { finite(n, name, min, max); check(n === f(n), 'Captured ' + name + ' must be a native float'); return n; }
export function financeStat(s) { const result = resolveOriginalEconomyMutable(s); for (const n of [s.base, ...Object.values(s.modifiers).flat().map(m => m.value)])
    financeFloat(n, 'financial stat'); return result; }
export const nativeInt = n => Number.isNaN(n) ? 0 : Math.max(-2147483648, Math.min(2147483647, Math.trunc(n))) || 0;
function spec(id) { identifier(id); check(Object.hasOwn(R.industries, id), 'Industry financial plugin not implemented'); return R.industries[id]; }
function validateState(s) { economyShape(s, ['industryId', 'income', 'upkeep'], 'industry finances'); spec(s.industryId); financeStat(s.income); financeStat(s.upkeep); }
function always(s, channel, id, value) { const mods = s.modifiers[channel], index = mods.findIndex(m => m.id === id), mod = { id, value }; if (index < 0)
    mods.push(mod);
else
    mods[index] = mod; }
const erase = (s, channel, id) => put(s, channel, id, 0, true);
/** Only for actual creation; never replaces a captured pre-existing industry. */
export function newOriginalIndustryFinances(industryId) { spec(industryId); return immutableJSON({ industryId, income: blank(), upkeep: blank() }); }
/** Actual apply uses patrol/station overrides and port shortages. A direct income refresh does neither. */
export function updateOriginalIndustryFinances(input) {
    economyShape(input, ['state', 'marketSize', 'phase', 'marketIncomeMult', 'marketUpkeepMult', 'operating', 'aiCoreId', 'specialItemId', 'portInputs', ...(Object.hasOwn(input, 'specialContext') ? ['specialContext'] : [])], 'industry financial update');
    validateState(input.state);
    integer(input.marketSize, 'market size');
    check(input.marketSize <= 10, 'Unsupported market size');
    check(['industry-apply', 'income-refresh'].includes(input.phase), 'Unknown income update phase');
    financeFloat(input.marketIncomeMult, 'market income multiplier');
    financeFloat(input.marketUpkeepMult, 'market upkeep multiplier');
    check([null, 'alpha_core', 'beta_core', 'gamma_core'].includes(input.aiCoreId), 'Unknown AI core');
    // ItemEffectsRepo resource effects only touch supply; BaseIndustry updates finances BEFORE their requirements.
    check(input.specialItemId === null || isSupportedOriginalResourceItem(input.state.industryId, input.specialItemId) || isSupportedOriginalMilitaryItem(input.state.industryId,input.specialItemId) || isSupportedOriginalGroundDefenseItem(input.state.industryId,input.specialItemId) || isSupportedOriginalPortItem(input.state.industryId, input.specialItemId) || (input.state.industryId === 'commerce' && input.specialItemId === 'dealmaker_holosuite') || (Object.hasOwn(ORIGINAL_PRODUCTION_INDUSTRIES.items, input.specialItemId) && ORIGINAL_PRODUCTION_INDUSTRIES.items[input.specialItemId].industryIds.includes(input.state.industryId)), 'Industry item finances not implemented for this plugin');
    const state = structuredClone(input.state), d = spec(state.industryId), apply = input.phase === 'industry-apply', special = Object.hasOwn(ORIGINAL_SPECIAL_INDUSTRIES.industries, state.industryId);
    check(special === Object.hasOwn(input, 'specialContext'), 'Special industry finances require actual faction and condition identities');
    if (special) {
        economyShape(input.specialContext, ['factionId', 'conditionIds'], 'special financial context');
        identifier(input.specialContext.factionId);
        originalTechMiningFinancialSize(input.marketSize, input.specialContext.conditionIds);
    }
    const active = special ? originalSpecialIndustryFunctional(state.industryId, input.operating, input.specialContext.factionId) : functional(input.operating);
    let usedSize = input.marketSize;
    if (apply && d.className === 'OrbitalStation')
        usedSize = d.tags.includes('battlestation') ? 5 : d.tags.includes('starfortress') ? 7 : 3;
    else if (apply && d.className === 'MilitaryBase' && d.tags.includes('patrol'))
        usedSize = 3;
    else if (apply && d.className === 'Cryosanctum')
        usedSize = 6;
    else if (apply && d.className === 'TechMining')
        usedSize = originalTechMiningFinancialSize(input.marketSize, input.specialContext.conditionIds);
    const sizeMultiplier = Math.max(1, f((usedSize <= 0 ? 0 : usedSize) - 2));
    const baseIncome = nativeInt(f(d.income * sizeMultiplier)), baseUpkeep = nativeInt(f(d.upkeep * sizeMultiplier));
    for (const [key, amount, multId, mult] of [['income', baseIncome, 'ind_stability', input.marketIncomeMult], ['upkeep', baseUpkeep, 'ind_hazard', input.marketUpkeepMult]]) {
        if (amount !== 0) {
            always(state[key], 'flat', 'ind_base', f(amount));
            always(state[key], 'mult', multId, mult);
        }
        else {
            erase(state[key], 'flat', 'ind_base');
            erase(state[key], 'mult', multId);
        }
    }
    if (input.aiCoreId === 'alpha_core' || input.aiCoreId === 'beta_core')
        put(state.upkeep, 'mult', 'ind_core', f(R.settings.UPKEEP_MULT));
    else
        erase(state.upkeep, 'mult', 'ind_core');
    if (!active) {
        erase(state.income, 'flat', 'ind_base');
        erase(state.income, 'mult', 'ind_stability');
    }
    let portDeficit = null;
    if (apply && d.className === 'Spaceport') {
        economyShape(input.portInputs, ['demand', 'available'], 'spaceport shortage inputs');
        for (const key of ['demand', 'available'])
            economyShape(input.portInputs[key], ['fuel', 'supplies', 'ships'], 'port ' + key);
        portDeficit = { commodityId: null, deficit: 0 };
        for (const id of ['fuel', 'supplies', 'ships']) {
            const available = input.portInputs.available[id];
            integer(available, 'port availability');
            check(available <= 65536, 'Unsupported availability');
            const deficit = Math.max(Math.trunc(stat(input.portInputs.demand[id])) - available, 0);
            if (deficit > portDeficit.deficit)
                portDeficit = { commodityId: id, deficit };
        }
        if (portDeficit.deficit > 0)
            put(state.upkeep, 'mult', 'deficit', f(1 + f(portDeficit.deficit * f(R.settings.UPKEEP_MULT_PER_DEFICIT))));
        else
            erase(state.upkeep, 'mult', 'deficit');
        // Spaceport.unapply does not erase its upkeep deficit, including after disruption.
    }
    else
        check(input.portInputs === null, 'Port shortage writes do not occur in this phase/plugin');
    return immutableJSON({ scope: 'industry-financial-effects-only', state, income: financeStat(state.income), upkeep: financeStat(state.upkeep), diagnostics: { usedSize, sizeMultiplier, baseIncome, baseUpkeep, portDeficit } });
}
/** Composes source-backed local phases without rewriting all industry incomes using final market multipliers. */
export function reapplyOriginalColonyFinancialPass(input) {
    economyShape(input, ['local', 'industryFinances'], 'colony financial pass');
    const localEffects = reapplyOriginalMarketStability(input.local), entries = input.local.commodityPass.industries;
    check(Array.isArray(input.industryFinances) && input.industryFinances.length === entries.length, 'Expected complete ordered financial industry roster');
    const rows = new Map((localEffects.diagnostics.marketCommodities ?? input.local.marketCommodities).map(row => [row.commodityId, row]));
    const industries = entries.map((e, i) => {
        const state = input.industryFinances[i];
        validateState(state);
        check(state.industryId === e.state.industryId, 'Financial industry order differs');
        const read = localEffects.diagnostics.industryFinancialInputs[i];
        let portInputs = null;
        if (spec(state.industryId).className === 'Spaceport') {
            const demand = {}, available = {};
            for (const id of ['fuel', 'supplies', 'ships']) {
                check(rows.has(id), 'Missing port commodity capture');
                demand[id] = localEffects.commodityEffects.industries[i].state.demand[id] ?? blank();
                available[id] = rows.get(id).available;
            }
            portInputs = { demand, available };
        }
        return updateOriginalIndustryFinances({ state, marketSize: input.local.commodityPass.marketSize, phase: 'industry-apply', marketIncomeMult: read.incomeMult, marketUpkeepMult: read.upkeepMult, operating: e.operating, aiCoreId: e.modifiers.aiCoreId, specialItemId: e.modifiers.specialItemId, portInputs, ...(Object.hasOwn(ORIGINAL_SPECIAL_INDUSTRIES.industries, state.industryId) ? { specialContext: { factionId: input.local.commodityPass.special.factionId, conditionIds: input.local.commodityPass.conditions.map(c => c.id) } } : {}) });
    });
    const industryIncome = industries.reduce((a, i) => f(a + i.income), 0), industryUpkeep = industries.reduce((a, i) => f(a + i.upkeep), 0);
    return immutableJSON({ scope: 'local-colony-financial-effects-only', localEffects, industries, industryIncome, industryUpkeep });
}
/** Native getter projection only. Complete roster and actual optional cost getters must come from authoritative state. */
export function summarizeOriginalMarketFinances(input) {
    economyShape(input, ['industries', 'commodities', 'shortageCountering', 'immigrationIncentives'], 'market financial projection');
    check(Array.isArray(input.industries) && input.industries.length <= 64 && Array.isArray(input.commodities) && input.commodities.length <= 128, 'Expected complete actual market rosters');
    const seen = new Set();
    let industryIncome = 0, industryUpkeep = 0, exportIncome = 0;
    for (const s of input.industries) {
        validateState(s);
        check(!seen.has(s.industryId), 'Duplicate industry');
        seen.add(s.industryId);
        industryIncome = f(industryIncome + financeStat(s.income));
        industryUpkeep = f(industryUpkeep + financeStat(s.upkeep));
    }
    const commodityIds = new Set();
    for (const c of input.commodities) {
        economyShape(c, ['commodityId', 'networkInitialized', 'exportIncome'], 'commodity export getter');
        identifier(c.commodityId);
        check(Object.hasOwn(ORIGINAL_MARKET_ECONOMY.commodities, c.commodityId) && !commodityIds.has(c.commodityId), 'Unknown/duplicate commodity');
        commodityIds.add(c.commodityId);
        bool(c.networkInitialized, 'commodity network initialization');
        if (!c.networkInitialized)
            check(c.exportIncome === null, 'No cached network means no captured export income');
        else {
            integer(c.exportIncome, 'native export income', -2147483648);
            check(c.exportIncome <= 2147483647, 'Export income exceeds native int');
            exportIncome = f(exportIncome + f(c.exportIncome));
        }
    }
    const costs = {};
    for (const key of ['shortageCountering', 'immigrationIncentives']) {
        const c = input[key];
        economyShape(c, ['enabled', 'cost'], key);
        bool(c.enabled, key + ' enabled');
        if (c.enabled)
            costs[key] = financeFloat(c.cost, key + ' native cost');
        else {
            check(c.cost === null, 'Disabled cost getter must not be fabricated/evaluated');
            costs[key] = 0;
        }
    }
    const grossIncome = f(industryIncome + exportIncome), netIncome = f(f(f(grossIncome - industryUpkeep) - costs.shortageCountering) - costs.immigrationIncentives);
    return immutableJSON({ scope: 'market-financial-getter-projection-only', industryIncome, industryUpkeep, exportIncome, grossIncome, netIncome, costs });
}
