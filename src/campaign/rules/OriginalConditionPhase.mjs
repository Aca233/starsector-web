import raw from '../data/reference-condition-phase.json' with { type: 'json' };
import { identifier, integer, finite, isRecord, requireThat, immutableJSON } from '../core/Values.mjs';
import { economyShape } from './OriginalMarketEconomy.mjs';
import { bool, size, stat, put, functional, validateIndustryState } from './OriginalIndustryState.mjs';
import { ORIGINAL_RESOURCE_INDUSTRIES, applyOriginalResourceDeposit } from './OriginalResourceIndustries.mjs';
import { ORIGINAL_ADDITIONAL_CONDITIONS, applyOriginalAdditionalCondition } from './OriginalAdditionalConditions.mjs';
import { reapplyOriginalMarketConditions } from './OriginalMarketConditions.mjs';
export const ORIGINAL_CONDITION_PHASE = immutableJSON(raw);
const R = ORIGINAL_CONDITION_PHASE, f = Math.fround, check = (v, m) => requireThat(v, 'UNSUPPORTED_CONDITION_PHASE', m);
const has = (o, k) => Object.hasOwn(o, k), resource = id => has(ORIGINAL_RESOURCE_INDUSTRIES.conditions, id), additional = id => has(ORIGINAL_ADDITIONAL_CONDITIONS.conditions, id);
const transient = name => ['LCAttractorLow', 'LCAttractorMedium', 'Habitable', 'FreeMarket', 'DecivilizedSubpop', 'Pollution', 'MildClimate', 'LuddicMajority'].includes(name);
function ids(list, label, max = 256) { check(Array.isArray(list) && list.length <= max, 'Expected bounded ' + label); const seen = new Set(); for (const id of list) {
    identifier(id);
    check(!seen.has(id), 'Duplicate ' + label);
    seen.add(id);
} return seen; }
function nativeFloat(v, name, min = 0, max = 2 ** 24) { finite(v, name, min, max); check(v === f(v), 'Expected captured float ' + name); }
function validateContext(c, context) {
    if (additional(c.id))
        return; // The actual unapply validates even suppressed/unexplored plugin contexts.
    if (c.id === 'free_market') {
        economyShape(context, ['daysActive'], 'free market state');
        nativeFloat(context.daysActive, 'free market days');
    }
    else if (c.id === 'recent_unrest') {
        economyShape(context, ['penalty'], 'unrest state');
        integer(context.penalty, 'unrest penalty');
        check(context.penalty <= 65536, 'Unrest penalty out of range');
    }
    else if (c.id === 'comm_relay') {
        economyShape(context, ['hasContainingLocation', 'relays'], 'relay state');
        bool(context.hasContainingLocation, 'containing location');
        check(Array.isArray(context.relays) && context.relays.length <= 4096, 'Expected actual relay roster');
        ids(context.relays.map(r => r.id), 'relay identities', 4096);
        for (const relay of context.relays) {
            economyShape(relay, ['id', 'sameFaction', 'nonFunctional', 'makeshift'], 'relay');
            for (const k of ['sameFaction', 'nonFunctional', 'makeshift'])
                bool(relay[k], k);
        }
    }
    else
        check(context === null, 'Unexpected stateless condition context');
}
function validate(input) {
    economyShape(input, ['marketSize', 'conditions', 'industries', 'state', 'contextByModId'], 'complete local condition phase');
    size(input.marketSize);
    check(Array.isArray(input.conditions) && input.conditions.length <= 128, 'Expected complete condition roster');
    const conditionIds = ids(input.conditions.map(c => c.modId), 'condition identities', 128);
    check(isRecord(input.contextByModId) && Object.keys(input.contextByModId).length === conditionIds.size, 'Expected exact context roster');
    const s = input.state;
    economyShape(s, ['hazard', 'accessibility', 'stability', 'officerMercProbability', 'suppressedConditionIds', 'immigrationModifiers', 'commodities'], 'shared condition state');
    stat(s.hazard);
    stat(s.stability);
    stat({ base: 0, modifiers: s.accessibility });
    stat({ base: 0, modifiers: s.officerMercProbability });
    ids(s.suppressedConditionIds, 'suppression set');
    for (const c of input.conditions) {
        economyShape(c, ['id', 'modId', 'surveyed', 'suppressed'], 'condition object');
        identifier(c.id);
        check(has(R.conditions, c.id), 'Unknown condition callback');
        bool(c.surveyed, 'surveyed');
        bool(c.suppressed, 'suppressed');
        check(c.suppressed === s.suppressedConditionIds.includes(c.id), 'Condition suppression differs from current shared set');
        check(has(input.contextByModId, c.modId), 'Missing condition context');
        validateContext(c, input.contextByModId[c.modId]);
        if (c.id === 'luddic_majority')
            check(input.contextByModId[c.modId]?.habitable === input.conditions.some(x => x.id === 'habitable'), 'Church eligibility must use actual habitable condition presence');
        if (c.id === 'shipping_disruption')
            check(input.contextByModId[c.modId]?.marketSize === input.marketSize, 'Shipping plugin market size differs from owner');
    }
    check(Array.isArray(input.industries) && input.industries.length <= 64, 'Expected complete industry roster');
    const inds = ids(input.industries.map(i => i.state?.industryId), 'industry identities', 64);
    for (const i of input.industries) {
        economyShape(i, ['state', 'operating', 'modifiers'], 'industry entry');
        validateIndustryState(i.state);
        functional(i.operating);
        check(has(ORIGINAL_ADDITIONAL_CONDITIONS.industries, i.state.industryId), 'Unknown industry specification');
        economyShape(i.modifiers, ['aiCoreId', 'improved', 'adminSupplyBonus', 'adminDemandReduction', 'supplyBonusFromOther', 'demandReductionFromOther', 'specialItemId'], 'industry modifiers');
        stat(i.modifiers.supplyBonusFromOther);
        stat(i.modifiers.demandReductionFromOther);
    }
    economyShape(s.immigrationModifiers, ['permanent', 'transient'], 'immigration identity sets');
    const conditions = new Map(input.conditions.map(c => [c.modId, c]));
    for (const list of Object.values(s.immigrationModifiers)) {
        check(Array.isArray(list) && list.length <= 256, 'Expected bounded callback set');
        const seen = new Set();
        for (const m of list) {
            economyShape(m, ['kind', 'id'], 'immigration callback');
            identifier(m.id);
            const key = m.kind + ':' + m.id;
            check(!seen.has(key), 'Duplicate callback identity');
            seen.add(key);
            if (m.kind === 'condition') {
                check(conditions.has(m.id), 'Missing condition callback object');
                const c = conditions.get(m.id);
                check(transient(R.conditions[c.id].className) || resource(c.id), 'Condition has no immigration callback');
            }
            else
                check(m.kind === 'industry' && inds.has(m.id), 'Missing industry callback object');
        }
    }
    check(Array.isArray(s.commodities) && s.commodities.length <= 128, 'Expected complete cached commodity roster');
    ids(s.commodities.map(c => c.commodityId), 'commodity identities', 128);
    for (const c of s.commodities) {
        economyShape(c, ['commodityId', 'maxSupply', 'available'], 'condition commodity cache');
        integer(c.maxSupply, 'cached max supply');
        check(c.maxSupply <= 65536, 'Unsupported max supply');
        stat(c.available);
    }
}
function setCallback(state, list, modId, apply) { const entries = state.immigrationModifiers[list], at = entries.findIndex(m => m.kind === 'condition' && m.id === modId); if (apply && at < 0)
    entries.push({ kind: 'condition', id: modId });
else if (!apply && at >= 0)
    entries.splice(at, 1); }
function freeEffects(days) { const c = R.freeMarket; const stability = Math.max(1, Math.min(c.MAX_STABILITY_PENALTY, Math.floor(f(f(c.MIN_STABILITY_PENALTY) + f(f(days / f(c.MAX_DAYS)) * f(c.MAX_STABILITY_PENALTY - c.MIN_STABILITY_PENALTY))) + 0.5))); const access = f(f(c.MIN_ACCESS_BONUS) + f(f(days / f(c.MAX_DAYS)) * f(f(c.MAX_ACCESS_BONUS) - f(c.MIN_ACCESS_BONUS)))); return { stability, access: Math.max(f(0.01), Math.min(f(c.MAX_ACCESS_BONUS), f(Math.floor(f(access * 100) + 0.5) / 100))) }; }
function relayBonus(c) { if (!c.hasContainingLocation)
    return null; let best = null; for (const relay of c.relays) {
    if (relay.nonFunctional || !relay.sameFaction || best && (!best.makeshift || relay.makeshift))
        continue;
    best = relay;
} return best ? (best.makeshift ? R.relay.MAKESHIFT_COMM_RELAY_BONUS : R.relay.COMM_RELAY_BONUS) : null; }
/** A single shared, ordered condition phase. No industry reapply, clock advance, network refresh or publication. */
export function reapplyOriginalConditionPhase(input) { return conditionPhase(input, null); }
/** Direct plugin invocation for Market.add/removeCondition; intentionally does not impose surveyed/suppressed gates. */
export function applyOriginalConditionCallback(input, modId, action) {
    identifier(modId);
    check(action === 'apply' || action === 'unapply', 'Unknown condition callback action');
    return conditionPhase(input, {modId, action});
}
function conditionPhase(input, operation) {
    validate(input);
    const conditions = structuredClone(input.conditions);
    let industries = structuredClone(input.industries), state = structuredClone(input.state);
    function callback(c, id, action) {
        const apply = action === 'apply', spec = R.conditions[c.id], context = input.contextByModId[id];
        if (additional(c.id)) {
            const local = { hazard: state.hazard, accessibility: state.accessibility, stability: state.stability, suppressedConditionIds: state.suppressedConditionIds, transientModifiers: state.immigrationModifiers.transient, commodities: state.commodities, industries: industries.map(i => ({ industryId: i.state.industryId, supplyBonusFromOther: i.modifiers.supplyBonusFromOther })) };
            const next = structuredClone(applyOriginalAdditionalCondition({ conditionId: c.id, modId: id, action, state: local, context }).state);
            for (const key of ['hazard', 'accessibility', 'stability', 'suppressedConditionIds', 'commodities'])
                state[key] = next[key];
            state.immigrationModifiers.transient = next.transientModifiers;
            for (let n = 0; n < industries.length; n++)
                industries[n].modifiers.supplyBonusFromOther = next.industries[n].supplyBonusFromOther;
            return;
        }
        if (spec.hazardPlugin) {
            if (!apply || spec.hazard !== null && spec.hazard !== 0)
                put(state.hazard, 'flat', id, spec.hazard ?? 0, !apply);
        }
        if (resource(c.id)) {
            if (!apply)
                setCallback(state, 'permanent', id, false);
            else {
                const selected = industries.filter(i => ['farming', 'aquaculture', 'mining'].includes(i.state.industryId));
                const result = applyOriginalResourceDeposit({ conditionId: c.id, modId: id, marketSize: input.marketSize, industries: selected.map(({ state, operating }) => ({ state, operating })) });
                const changed = new Map(result.industries.map(i => [i.state.industryId, i.state]));
                industries = industries.map(i => ({ ...i, state: changed.get(i.state.industryId) ?? i.state }));
                if (ORIGINAL_RESOURCE_INDUSTRIES.conditions[c.id].commodityId === 'food' && result.targetIndustryId !== null)
                    setCallback(state, 'permanent', id, true);
            }
        }
        else if (transient(spec.className))
            setCallback(state, 'transient', id, apply);
        if (c.id === 'free_market') {
            const values = freeEffects(context.daysActive);
            put(state.stability, 'flat', id, -values.stability, !apply);
            put({ modifiers: state.accessibility }, 'flat', id, values.access, !apply);
            put({ modifiers: state.officerMercProbability }, 'flat', id, R.freeMarket.OFFICER_MERC_PROB_MOD, !apply);
        }
        else if (['recent_unrest', 'decivilized_subpop'].includes(c.id)) {
            if (!apply)
                for (const channel of ['flat', 'percent', 'mult'])
                    put(state.stability, channel, id, 0, true);
            else
                put(state.stability, 'flat', id, -(c.id === 'recent_unrest' ? context.penalty : R.decivilized.STABILITY_PENALTY));
        }
        else if (c.id === 'comm_relay') {
            const value = apply ? relayBonus(context) : null;
            put(state.stability, 'flat', 'core_comm_relay', value ?? 0, value === null);
        }
    }
    let execution;
    if (operation) {
        const c = conditions.find(c => c.modId === operation.modId);
        check(c, 'Unknown condition callback object');
        callback(c, c.modId, operation.action);
        execution = {scope:'native-ordered-condition-callbacks-only',visited:1,applied:operation.action === 'apply' ? 1 : 0};
    } else execution = reapplyOriginalMarketConditions({ listConditions: () => conditions, getSpecificCondition: id => conditions.find(c => c.modId === id) ?? null, getConditionId: c => c.id, getModId: c => c.modId, isSurveyed: c => c.surveyed, isSuppressed: id => state.suppressedConditionIds.includes(id), apply: (c, id) => callback(c, id, 'apply'), unapply: (c, id) => callback(c, id, 'unapply') });
    const current = conditions.map(c => ({ ...c, suppressed: state.suppressedConditionIds.includes(c.id) }));
    validate({ ...input, conditions: current, industries, state });
    return immutableJSON({ scope: 'ordered-condition-local-effects-only', state, conditions: current, industries, execution });
}
