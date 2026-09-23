import raw from '../data/reference-additional-conditions.json' with { type: 'json' };
import { identifier, integer, finite, requireThat, immutableJSON } from '../core/Values.mjs';
import { economyShape } from './OriginalMarketEconomy.mjs';
import { bool, stat, size, put } from './OriginalIndustryState.mjs';
export const ORIGINAL_ADDITIONAL_CONDITIONS = immutableJSON(raw);
const R = ORIGINAL_ADDITIONAL_CONDITIONS, C = R.constants, f = Math.fround;
const check = (v, m) => requireThat(v, 'UNSUPPORTED_ADDITIONAL_CONDITION', m);
const nativeInt = n => Number.isNaN(n) ? 0 : Math.max(-2147483648, Math.min(2147483647, Math.trunc(n))) || 0;
const round = n => nativeInt(Math.floor(n + 0.5));
function conditionFloat(n, name, min = -(2 ** 24), max = 2 ** 24) { finite(n, name, min, max); check(n === f(n), 'Captured ' + name + ' must be a native float'); return n; }
function ids(values, label, limit = 256) {
    check(Array.isArray(values) && values.length <= limit, 'Expected bounded ' + label);
    const seen = new Set();
    for (const id of values) {
        identifier(id);
        check(!seen.has(id), 'Duplicate ' + label);
        seen.add(id);
    }
}
function industrySpec(id) { identifier(id); check(Object.hasOwn(R.industries, id), 'Unknown native industry spec'); return R.industries[id]; }
function bonus(value) { stat({ base: 0, modifiers: value }); }
function validateState(s) {
    economyShape(s, ['hazard', 'accessibility', 'stability', 'industries', 'suppressedConditionIds', 'transientModifiers', 'commodities'], 'condition local state');
    stat(s.hazard);
    bonus(s.accessibility);
    stat(s.stability);
    ids(s.suppressedConditionIds, 'suppressed condition set');
    check(Array.isArray(s.industries) && s.industries.length <= 64, 'Expected native industry roster');
    const inds = new Set();
    for (const i of s.industries) {
        economyShape(i, ['industryId', 'supplyBonusFromOther'], 'condition industry');
        industrySpec(i.industryId);
        check(!inds.has(i.industryId), 'Duplicate industry');
        inds.add(i.industryId);
        stat(i.supplyBonusFromOther);
    }
    check(Array.isArray(s.transientModifiers) && s.transientModifiers.length <= 256, 'Expected transient immigration set');
    const callbacks = new Set();
    for (const m of s.transientModifiers) {
        economyShape(m, ['kind', 'id'], 'transient callback');
        identifier(m.id);
        check(['condition', 'industry'].includes(m.kind), 'Unknown callback kind');
        const key = m.kind + ':' + m.id;
        check(!callbacks.has(key), 'Duplicate callback');
        callbacks.add(key);
    }
    check(Array.isArray(s.commodities) && s.commodities.length <= 128, 'Expected captured commodity roster');
    const commodities = new Set();
    for (const c of s.commodities) {
        economyShape(c, ['commodityId', 'maxSupply', 'available'], 'resolved commodity local state');
        identifier(c.commodityId);
        check(!commodities.has(c.commodityId), 'Duplicate commodity');
        commodities.add(c.commodityId);
        integer(c.maxSupply, 'max supply');
        check(c.maxSupply <= 65536, 'Unsupported max supply');
        stat(c.available);
    }
}
function validateChurch(c) {
    economyShape(c, ['playerOwned', 'madeChurchDeal', 'habitable', 'adminId', 'defeatedExpedition', 'constructionQueue'], 'church eligibility context');
    for (const k of ['playerOwned', 'madeChurchDeal', 'habitable', 'defeatedExpedition'])
        bool(c[k], k);
    if (c.adminId !== null)
        identifier(c.adminId);
    check(c.constructionQueue === null || Array.isArray(c.constructionQueue) && c.constructionQueue.length <= 128, 'Expected actual nullable construction queue');
    for (const q of c.constructionQueue ?? []) {
        economyShape(q, ['industryId', 'specExists'], 'queued industry');
        identifier(q.industryId);
        bool(q.specExists, 'resolved queued spec existence');
        if (q.specExists)
            industrySpec(q.industryId);
    }
}
const blockedTags = tags => tags.some(t => ['industrial', 'military', 'command'].includes(t));
function churchMatches(industries, c) {
    if (c.playerOwned && c.madeChurchDeal || !c.habitable || c.adminId === 'dardan_kato')
        return false;
    let rural = false;
    for (const i of industries) {
        const tags = industrySpec(i.industryId).tags;
        if (blockedTags(tags))
            return false;
        rural ||= tags.includes('rural');
    }
    const first = c.constructionQueue?.[0];
    if (first?.specExists && blockedTags(industrySpec(first.industryId).tags))
        return false;
    return rural;
}
const churchMult = c => c.playerOwned && c.defeatedExpedition ? C['LuddicMajority.BONUS_MULT_DEFEATED_EXPEDITION'] : 1;
export function matchesOriginalLuddicMajority(industries, context) {
    validateChurch(context);
    check(Array.isArray(industries) && industries.length <= 64, 'Expected native industry roster');
    ids(industries.map(i => i.industryId), 'industry roster', 64);
    for (const i of industries) {
        economyShape(i, ['industryId', 'supplyBonusFromOther'], 'condition industry');
        industrySpec(i.industryId);
        stat(i.supplyBonusFromOther);
    }
    return churchMatches(industries, context);
}
export function originalShippingLossPenalty(marketSize, unitsLost) {
    conditionFloat(marketSize, 'market size', 0, 10);
    conditionFloat(unitsLost, 'shipping lost', -65536, 65536);
    // Size zero and 0/0 retain Java Math.round's saturation/NaN semantics, not JS Infinity.
    const result = f(f(round(f(f(f(unitsLost / marketSize) * C['ShippingDisruption.ACCESS_PER_UNITS_LOST']) * 100))) / 100);
    return result === 0 ? f(0.01) : result;
}
function transient(s, id, apply) {
    const n = s.transientModifiers.findIndex(m => m.kind === 'condition' && m.id === id);
    if (apply && n < 0)
        s.transientModifiers.push({ kind: 'condition', id });
    else if (!apply && n >= 0)
        s.transientModifiers.splice(n, 1);
}
const ruralOrOverride = i => industrySpec(i.industryId).tags.includes('rural') || Object.hasOwn(R.productionOverrides, i.industryId);
function removeChurch(s, id) {
    transient(s, id, false);
    for (const channel of ['flat', 'percent', 'mult'])
        put(s.stability, channel, id, 0, true);
    for (const i of s.industries)
        if (ruralOrOverride(i))
            put(i.supplyBonusFromOther, 'flat', id, 0, true);
}
/** One original apply OR unapply, never implicit reapply. No clock, cache, intel, or condition lifetime advancement.
 * Shipping commodities contain getters resolved in native order by the caller. Returned available stats do not
 * replace MutableStatWithTempMods timer maps; callers retain those maps and all non-local host state unchanged.
 */
export function applyOriginalAdditionalCondition(input) {
    economyShape(input, ['conditionId', 'modId', 'action', 'state', 'context'], 'additional condition callback');
    identifier(input.conditionId);
    identifier(input.modId);
    check(Object.hasOwn(R.conditions, input.conditionId), 'Unknown additional condition');
    check(['apply', 'unapply'].includes(input.action), 'Expected apply or unapply');
    validateState(input.state);
    const id = input.modId, condition = input.conditionId, apply = input.action === 'apply', c = input.context;
    if (condition === 'luddic_majority')
        validateChurch(c);
    else if (condition === 'pirate_activity') {
        economyShape(c, ['tier'], 'pirate intel');
        check(Object.hasOwn(R.pirateTiers, c.tier), 'Unknown pirate intel tier');
    }
    else if (condition === 'pather_cells') {
        economyShape(c, ['intelMarketFactionId', 'savedSleeper', 'playerHasPatherAgreement'], 'pather intel');
        identifier(c.intelMarketFactionId);
        bool(c.savedSleeper, 'saved sleeper');
        bool(c.playerHasPatherAgreement, 'pather agreement');
    }
    else if (condition === 'shipping_disruption') {
        economyShape(c, ['marketSize', 'playerOwned', 'shippingLost'], 'shipping callback context');
        size(c.marketSize);
        bool(c.playerOwned, 'player owned');
        stat(c.shippingLost);
    }
    else
        check(c === null, 'Unexpected context for stateless condition');
    const s = structuredClone(input.state), access = { base: 0, modifiers: s.accessibility };
    if (['high_gravity', 'low_gravity', 'mild_climate'].includes(condition)) {
        const hazard = R.conditions[condition].hazard;
        if (!apply || hazard !== null && hazard !== 0)
            put(s.hazard, 'flat', id, hazard ?? 0, !apply);
        if (condition === 'mild_climate')
            transient(s, id, apply);
        else
            put(access, 'flat', id, condition === 'high_gravity' ? f(-0.1) : f(C['LowGravity.ACCESS_BONUS'] / 100), !apply);
    }
    else if (condition === 'solar_array') {
        for (const cid of R.suppressedConditions) {
            const n = s.suppressedConditionIds.indexOf(cid);
            if (apply && n < 0)
                s.suppressedConditionIds.push(cid);
            else if (!apply && n >= 0)
                s.suppressedConditionIds.splice(n, 1);
        }
        const industry = s.industries.find(i => i.industryId === 'farming') ?? s.industries.find(i => i.industryId === 'aquaculture');
        if (industry)
            put(industry.supplyBonusFromOther, 'flat', id, C['SolarArray.FARMING_BONUS'], !apply);
    }
    else if (condition === 'luddic_majority') {
        if (!apply || !churchMatches(s.industries, c))
            removeChurch(s, id);
        else {
            transient(s, id, true);
            const mult = churchMult(c), stability = round(f(C['LuddicMajority.STABILITY'] * mult));
            if (stability !== 0)
                put(s.stability, 'flat', id, stability);
            for (const i of s.industries)
                if (ruralOrOverride(i)) {
                    const base = R.productionOverrides[i.industryId] ?? C['LuddicMajority.PRODUCTION_BASE_RURAL'], value = round(f(base * mult));
                    if (value !== 0)
                        put(i.supplyBonusFromOther, 'flat', id, value);
                }
        }
    }
    else if (condition === 'pirate_activity') {
        for (const [key, target] of [['accessibility', access], ['stability', s.stability]]) {
            const value = R.pirateTiers[c.tier][key];
            if (!apply || value !== 0)
                put(target, 'flat', id, -value, !apply);
        }
    }
    else if (condition === 'pather_cells') {
        const sleeper = c.savedSleeper || c.intelMarketFactionId === 'player' && c.playerHasPatherAgreement;
        if (!apply || !sleeper && C['LuddicPathCells.STABLITY_PENALTY'] !== 0)
            put(s.stability, 'flat', id, -C['LuddicPathCells.STABLITY_PENALTY'], !apply);
    }
    else if (condition === 'shipping_disruption') {
        put(access, 'flat', id, apply ? -originalShippingLossPenalty(c.marketSize, stat(c.shippingLost)) : 0, !apply);
        if (apply && c.playerOwned)
            for (const com of s.commodities) {
                const available = Math.max(0, round(stat(com.available)));
                if (com.maxSupply >= available + 1)
                    com.available.modifiers.flat = com.available.modifiers.flat.filter(m => !m.id.startsWith('sh_loss') || round(Math.abs(m.value)) === 0);
            }
    }
    // WorldFarming descendants intentionally do nothing, including on unapply.
    validateState(s);
    return immutableJSON({ scope: 'additional-condition-local-effects-only', state: s });
}
/** Called only for already-registered condition objects. Luddic eligibility is NOT rechecked here. */
export function applyOriginalAdditionalIncoming(input) {
    economyShape(input, ['conditionId', 'modId', 'marketSize', 'playerOwned', 'defeatedExpedition', 'incoming'], 'additional incoming callback');
    check(['mild_climate', 'luddic_majority'].includes(input.conditionId), 'Unsupported incoming condition');
    identifier(input.modId);
    size(input.marketSize);
    bool(input.playerOwned, 'player owned');
    bool(input.defeatedExpedition, 'defeated expedition');
    economyShape(input.incoming, ['composition', 'weight'], 'incoming composition');
    stat(input.incoming.weight);
    check(Array.isArray(input.incoming.composition) && input.incoming.composition.length <= 256, 'Expected incoming faction composition');
    ids(input.incoming.composition.map(c => c.factionId), 'composition factions');
    for (const c of input.incoming.composition) {
        economyShape(c, ['factionId', 'amount'], 'composition entry');
        conditionFloat(c.amount, 'composition amount');
    }
    const incoming = structuredClone(input.incoming), mild = input.conditionId === 'mild_climate';
    const growth = mild ? input.marketSize : f(f(C['LuddicMajority.IMMIGRATION_BASE'] * input.marketSize) * churchMult(input));
    if (mild || growth > 0) {
        const amount = mild ? 30 : growth, entry = incoming.composition.find(c => c.factionId === 'luddic_church');
        if (entry)
            entry.amount = f(entry.amount + amount);
        else
            incoming.composition.push({ factionId: 'luddic_church', amount });
        put(incoming.weight, 'flat', input.modId, growth);
    }
    stat(incoming.weight);
    return immutableJSON(incoming);
}
