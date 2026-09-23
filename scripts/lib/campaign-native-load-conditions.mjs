/** Offline-load condition inputs. No Java instantiation, elapsed time or market publication. */
import { ORIGINAL_CONDITION_PHASE } from '../../src/campaign/rules/OriginalConditionPhase.mjs';
import { ORIGINAL_ADDITIONAL_CONDITIONS } from '../../src/campaign/rules/OriginalAdditionalConditions.mjs';
import { readOriginalAdministrator } from '../../src/campaign/rules/OriginalAdministrator.mjs';
const ensure = (v, message) => { if (!v) throw Error('NATIVE_SAVE_CONDITIONS: ' + message); };
const number = (text, label, integer = false) => {
    ensure(typeof text === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text), 'Missing/invalid ' + label);
    const value = integer ? Number(text) : Math.fround(Number(text));
    ensure(Number.isFinite(value) && (!integer || Number.isSafeInteger(value)), 'Invalid ' + label); return value;
};
const boolean = (text, label) => { ensure(text === 'true' || text === 'false', 'Missing/invalid ' + label); return text === 'true'; };
const alias = node => node?.attributes.cl ?? node?.name;
function memoryBoolean(g, r, memory, key) {
    let found = false, value = false;
    for (const e of r.members(g.child(memory, 'd'))) {
        ensure(e.name === 'e' && e.children.length === 2, 'Malformed memory entry');
        const name = g.resolve(e.children[0]), datum = g.resolve(e.children[1]);
        if (name.text !== key) continue;
        ensure(!found && name.name === 'st', 'Duplicate/invalid memory key'); found = true;
        ensure(!datum.children.length && ['st', 'bp', 'fp', 'ip', 'lp'].includes(alias(datum)), 'Unsupported memory boolean source');
        // Memory.getBoolean uses getString/toString, not Java Boolean casting, and does not advance expiry.
        value = datum.text.toLowerCase().trim() === 'true';
    }
    return value;
}
function officerMercBonus(g, r, market) {
    let result = null, found = false;
    for (const e of r.members(g.child(g.child(g.child(market, 'stats'), 'dynamic'), 'mods'))) {
        ensure(e.name === 'e' && e.children.length === 2, 'Malformed dynamic modifiers');
        if (g.resolve(e.children[0]).text.trim() !== 'officer_is_merc_prob') continue;
        ensure(!found && alias(g.resolve(e.children[1])) === 'SBonus', 'Invalid officer probability StatBonus'); found = true;
        result = r.bonus(g.resolve(e.children[1]));
    }
    return result;
}
/** Also needed when a size listener will add a condition not yet present in the save. */
export function captureNativeChurchContext(g, r, market, administratorCapture) {
    const selected = readOriginalAdministrator(administratorCapture.input);
    if (selected.selectedPersonRef === null) return null;
    const person = g.objects.get(selected.selectedPersonRef);
    ensure(person && typeof person.attributes.id === 'string', 'Missing selected administrator id');
    const queue = r.members(g.child(g.child(market, 'constructionQueue'), 'items')).map(item => {
        const industryId = r.value(item, 'id', true);
        ensure(industryId && Object.hasOwn(ORIGINAL_ADDITIONAL_CONDITIONS.industries, industryId), 'Unknown queued industry spec');
        return { industryId, specExists: true };
    });
    const memory = g.child(g.child(g.root, 'characterData'), 'memory');
    return { playerOwned: boolean(r.value(market, 'playerOwned', true), 'player ownership'),
        madeChurchDeal: memoryBoolean(g, r, memory, '$madeImmigrationDealWithLuddicChurch'),
        habitable: r.members(g.child(market, 'conditions', true)).some(n => n.attributes.i === 'habitable'),
        adminId: person.attributes.id, defeatedExpedition: memoryBoolean(g, r, memory, '$defeatedLuddicChurchExpedition'), constructionQueue: queue };
}
export function captureNativeLoadConditions(g, r, market, administratorCapture) {
    const { child } = g, conditionNodes = r.members(child(market, 'conditions', true));
    const contextByModId = {}, pluginState = [], permanentCallbacks = [], unresolved = [];
    const playerMemory = child(child(g.root, 'characterData'), 'memory');
    const playerOwned = boolean(r.value(market, 'playerOwned', true), 'player ownership');
    const size = number(r.value(market, 'size', true), 'market size', true);
    const failContext = (id, reason) => unresolved.push(id + ':' + reason);
    for (const c of conditionNodes) {
        const id = c.attributes.i, modId = id + '_' + c.attributes.u, p = child(c, 'p');
        const spec = Object.hasOwn(ORIGINAL_CONDITION_PHASE.conditions, id) ? ORIGINAL_CONDITION_PHASE.conditions[id] : null;
        let context = null;
        if (!spec) { failContext(id, 'unknown-condition-plugin'); continue; }
        if (p) ensure(child(p, 'm', true) === market && child(p, 'c', true) === c, 'Plugin owner/condition identity differs');
        const plugin = { conditionRef: r.ref(c), modId, pluginRef: p ? r.ref(p) : null, restored: p !== null, shippingLost: null };
        pluginState.push(plugin);
        if (id === 'free_market') {
            ensure(!p || alias(p) === 'FreeMarket', 'Unexpected free market plugin');
            context = { daysActive: p ? number(r.value(p, 'daysActive', true), 'free market days') : 0 };
        } else if (id === 'recent_unrest') {
            ensure(!p || alias(p) === 'RecentUnrest', 'Unexpected unrest plugin');
            context = { penalty: p ? number(r.value(p, 'penalty', true), 'unrest penalty', true) : 0 };
        } else if (id === 'comm_relay') {
            if (p) { failContext(id, 'serialized-relay-plugin-not-supported'); continue; }
            context = { hasContainingLocation: child(child(market, 'primaryEntity'), 'cL') !== null, relays: [] };
        } else if (id === 'pirate_activity') {
            if (!p) { failContext(id, 'missing-pirate-intel'); continue; }
            ensure(alias(p) === 'PirateActivity', 'Unexpected pirate plugin');
            const intel = child(p, 'i', true);
            ensure(['i', 'PirateBaseIntel'].includes(alias(intel)), 'Unexpected pirate intel type');
            const tier = r.attr(intel, 't');
            ensure(Object.hasOwn(ORIGINAL_ADDITIONAL_CONDITIONS.pirateTiers, tier), 'Unknown pirate tier');
            context = { tier };
        } else if (id === 'pather_cells') {
            if (!p) { failContext(id, 'missing-pather-intel'); continue; }
            ensure(alias(p) === 'LuddicPathCells', 'Unexpected pather plugin');
            const intel = child(p, 'i', true), intelMarket = child(intel, 'm', true);
            ensure(['i', 'LuddicPathCellsIntel'].includes(alias(intel)), 'Unexpected pather intel type');
            context = { intelMarketFactionId: r.value(intelMarket, 'factionId', true), savedSleeper: boolean(r.attr(intel, 's'), 'sleeper flag'), playerHasPatherAgreement: memoryBoolean(g, r, playerMemory, '$patherAgreement') || memoryBoolean(g, r, child(g.root, 'memory'), '$patherAgreement') };
        } else if (id === 'shipping_disruption') {
            if (!p) { failContext(id, 'missing-shipping-plugin'); continue; }
            ensure(alias(p) === 'ShippingDisruption', 'Unexpected shipping plugin');
            plugin.shippingLost = r.stat(child(p, 'shippingLost', true));
            context = { marketSize: size, playerOwned, shippingLost: plugin.shippingLost.state };
        } else if (id === 'luddic_majority') {
            context = captureNativeChurchContext(g, r, market, administratorCapture);
            if (context === null) { failContext(id, 'administrator-identity-runtime-required'); continue; }
        } else if (p) {
            const expected = spec.className === 'ResourceDepositsCondition' ? 'ResourceDepositsMC' : spec.className;
            if (alias(p) !== expected) { failContext(id, 'unreviewed-saved-plugin'); continue; }
        }
        contextByModId[modId] = context;
    }
    const industries = r.members(child(market, 'industries', true));
    const seen = new Set();
    for (const callback of r.members(child(market, 'immigrationModifiers'))) {
        const objectRef = r.ref(callback);
        ensure(!seen.has(objectRef), 'Duplicate permanent callback object'); seen.add(objectRef);
        const industry = industries.find(i => i === callback);
        if (industry) { permanentCallbacks.push({ kind: 'industry', id: industry.attributes.id, objectRef, currentPlugin: true }); continue; }
        const c = child(callback, 'c'), spec = c ? ORIGINAL_CONDITION_PHASE.conditions[c.attributes.i] : null;
        if (!spec || !conditionNodes.includes(c) || child(callback, 'm') !== market || alias(callback) !== 'ResourceDepositsMC' || spec.className !== 'ResourceDepositsCondition') {
            unresolved.push('unsupported-permanent-immigration-callback'); continue;
        }
        permanentCallbacks.push({ kind: 'condition', id: c.attributes.i + '_' + c.attributes.u, objectRef, currentPlugin: child(c, 'p') === callback });
    }
    ensure(!child(market, 'transientImmigrationModifiers'), 'Unexpected serialized transient immigration set');
    const stability = r.stat(child(market, 'power'));
    if (!stability) unresolved.push('missing-stability-power');
    return { scope: 'offline-native-condition-load-inputs', stability, officerMercProbability: officerMercBonus(g, r, market), contextByModId, pluginState, permanentCallbacks, unresolved };
}
