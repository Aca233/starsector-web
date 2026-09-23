import raw from '../data/reference-immigration.json' with { type: 'json' };
import { identifier, requireThat, immutableJSON, canonicalJSON } from '../core/Values.mjs';
import { economyShape } from './OriginalMarketEconomy.mjs';
import { bool, functional, put } from './OriginalIndustryState.mjs';
import { financeStat, reapplyOriginalColonyFinancialPass } from './OriginalMarketFinance.mjs';
import { ORIGINAL_ADDITIONAL_CONDITIONS } from './OriginalAdditionalConditions.mjs';
import { ORIGINAL_RESOURCE_INDUSTRIES } from './OriginalResourceIndustries.mjs';
export const ORIGINAL_IMMIGRATION = immutableJSON(raw);
const R = ORIGINAL_IMMIGRATION;
const check = (v, message) => requireThat(v, 'UNSUPPORTED_COLONY_ENVIRONMENT', message);
/** Internal shared validation: actual condition and industry identities, not inferred from UI/state counts. */
export function environmentContext(conditions, industries, mode = 'environment') {
    check(['environment', 'incoming'].includes(mode), 'Unknown condition validation mode');
    check(Array.isArray(conditions) && conditions.length <= 128 && Array.isArray(industries) && industries.length <= 64, 'Expected complete ordered local rosters');
    const cs = new Map(), ins = new Map(), conditionClasses = new Map();
    for (const c of conditions) {
        economyShape(c, ['id', 'modId', 'surveyed', 'suppressed'], 'environment condition');
        identifier(c.id);
        identifier(c.modId);
        bool(c.surveyed, 'surveyed');
        bool(c.suppressed, 'suppressed');
        const spec = Object.hasOwn(R.conditions, c.id) ? R.conditions[c.id] : mode === 'incoming' && Object.hasOwn(ORIGINAL_ADDITIONAL_CONDITIONS.conditions, c.id) ? ORIGINAL_ADDITIONAL_CONDITIONS.conditions[c.id] : null;
        check(spec && !cs.has(c.modId), 'Unknown/duplicate condition');
        cs.set(c.modId, c);
        conditionClasses.set(c.modId, spec.className);
    }
    for (const i of industries) {
        economyShape(i, ['industryId', 'operating'], 'environment industry');
        identifier(i.industryId);
        functional(i.operating);
        check(Object.hasOwn(R.industries, i.industryId) && !ins.has(i.industryId), 'Unknown/duplicate industry');
        ins.set(i.industryId, i);
    }
    return { conditions: cs, industries: ins, conditionClasses };
}
const transientClass = name => ['LCAttractorLow', 'LCAttractorMedium', 'Habitable', 'FreeMarket', 'DecivilizedSubpop', 'Pollution'].includes(name);
export function validateImmigrationModifierLists(modifiers, context, identityMode = 'logical') {
    check(identityMode === 'logical' || identityMode === 'object', 'Unknown immigration identity mode');
    const objectBindings = new Map(), logicalObjects = new Map();
    economyShape(modifiers, ['permanent', 'transient'], 'immigration modifier sets');
    for (const list of [modifiers.permanent, modifiers.transient]) {
        check(Array.isArray(list) && list.length <= 256, 'Expected bounded native modifier set');
        const seen = new Set();
        for (const m of list) {
            economyShape(m, ['kind', 'id', ...(identityMode === 'object' ? ['objectRef'] : [])], 'immigration callback identity');
            identifier(m.id);
            check(['condition', 'industry'].includes(m.kind), 'Unknown immigration callback kind');
            const logical = m.kind + ':' + m.id, key = identityMode === 'object' ? m.objectRef : logical;
            if (identityMode === 'object') {
                check(typeof key === 'string' && key.length > 0 && key.length <= 512, 'Missing callback object identity');
                check(!objectBindings.has(key) || objectBindings.get(key) === logical, 'Same callback object has conflicting targets');
                objectBindings.set(key, logical);
                if (logicalObjects.has(logical) && logicalObjects.get(logical) !== key)
                    check(m.kind === 'condition' && context.conditionClasses.get(m.id) === 'ResourceDepositsCondition', 'Distinct stateful callbacks require per-object getter state');
                logicalObjects.set(logical, key);
            }
            check(!seen.has(key), 'Duplicate callback within native set');
            seen.add(key);
            if (m.kind === 'condition') {
                check(context.conditions.has(m.id), 'Missing condition callback object');
                const klass = context.conditionClasses.get(m.id);
                check(transientClass(klass) || ['ResourceDepositsCondition', 'MildClimate', 'LuddicMajority'].includes(klass), 'Condition has no immigration callback');
            }
            else
                check(context.industries.has(m.id) && R.industries[m.id].immigrationPlugin, 'Industry has no supported immigration callback');
        }
    }
}
/** Industry-only callback sequence: never replays a condition or changes its collection order. */
function reapplyIndustryRegistrations(modifiers, industries) {
    const remove = id => { modifiers.transient = modifiers.transient.filter(m => m.kind !== 'industry' || m.id !== id); };
    for (const i of industries) {
        identifier(i.industryId);
        functional(i.operating);
        check(Object.hasOwn(R.industries, i.industryId), 'Unknown industry immigration plugin');
        const spec = R.industries[i.industryId];
        if (!spec.immigrationPlugin)
            continue;
        remove(i.industryId);
        modifiers.transient.push({ kind: 'industry', id: i.industryId });
        // Resource industries clear supply, not registration. Inactive ports and commerce unapply again.
        if (['Spaceport', 'TradeCenter'].includes(spec.className) && !functional(i.operating))
            remove(i.industryId);
    }
    check(modifiers.transient.length <= 256, 'Industry registration exceeds native callback bound');
}
/** Native construction/readResolve default only. Never use this to replace an existing captured hazard stat. */
export function newOriginalMarketHazard() { return immutableJSON({ base: 0, modifiers: { flat: [{ id: 'haz_base', value: 1 }], percent: [], mult: [] } }); }
/** Supported condition/industry callbacks only. Does NOT advance days, conditions, skills, population or an economy task. */
export function reapplyOriginalColonyEnvironment(input) {
    economyShape(input, ['hazard', 'modifiers', 'conditions', 'industries'], 'colony environment reapplication');
    const context = environmentContext(input.conditions, input.industries);
    validateImmigrationModifierLists(input.modifiers, context);
    financeStat(input.hazard);
    const hazard = structuredClone(input.hazard), modifiers = structuredClone(input.modifiers);
    const remove = (list, kind, id) => { modifiers[list] = modifiers[list].filter(m => m.kind !== kind || m.id !== id); };
    const add = (list, kind, id) => {
        if (!modifiers[list].some(m => m.kind === kind && m.id === id))
            modifiers[list].push({ kind, id });
    };
    for (const c of input.conditions) {
        const spec = R.conditions[c.id], active = c.surveyed && !c.suppressed;
        if (spec.hazardPlugin) {
            put(hazard, 'flat', c.modId, 0, true);
            if (active && spec.hazard !== null && spec.hazard !== 0)
                put(hazard, 'flat', c.modId, spec.hazard);
        }
        if (transientClass(spec.className)) {
            remove('transient', 'condition', c.modId);
            if (active)
                add('transient', 'condition', c.modId);
        }
        if (spec.className === 'ResourceDepositsCondition') {
            remove('permanent', 'condition', c.modId);
            const resource = ORIGINAL_RESOURCE_INDUSTRIES.conditions[c.id];
            if (active && resource.commodityId === 'food' && (context.industries.has('farming') || context.industries.has('aquaculture')))
                add('permanent', 'condition', c.modId);
        }
    }
    reapplyIndustryRegistrations(modifiers, input.industries);
    return immutableJSON({ scope: 'supported-hazard-and-immigration-registration-only', hazard, hazardValue: financeStat(hazard), modifiers });
}
/** Removes the hand-entered hazard scalar from the local financial pipeline; external skill/event stat sources remain explicit. */
export function reapplyOriginalEnvironmentalFinancialPass(input) {
    economyShape(input, ['hazard', 'modifiers', 'financial'], 'environmental financial pass');
    economyShape(input.financial, ['local', 'industryFinances'], 'financial pass');
    const l = input.financial.local;
    economyShape(l, ['commodityPass', 'stability', 'incomeMult', 'upkeepMult', 'maxIndustries', 'previousStability', 'governance', 'constructionQueue', 'conditionStateByModId', 'marketCommodities'], 'local financial inputs without guessed hazard');
    check(Array.isArray(l.commodityPass?.industries) && l.commodityPass.industries.every(e => e?.state), 'Expected complete financial industry roster');
    if (Object.hasOwn(l.commodityPass, 'conditionPhase')) {
        const captured = l.commodityPass.conditionPhase.state;
        check(canonicalJSON(input.hazard) === canonicalJSON(captured.hazard), 'Conflicting shared hazard capture');
        check(canonicalJSON(input.modifiers) === canonicalJSON(captured.immigrationModifiers), 'Conflicting shared immigration capture');
        const financial = reapplyOriginalColonyFinancialPass({ ...input.financial, local: { ...l, hazard: financeStat(input.hazard) } });
        const phase = financial.localEffects.commodityEffects.conditionPhase;
        const modifiers = structuredClone(phase.state.immigrationModifiers);
        reapplyIndustryRegistrations(modifiers, l.commodityPass.industries.map(e => ({ industryId: e.state.industryId, operating: e.operating })));
        const environment = { scope: 'supported-hazard-and-immigration-registration-only', hazard: phase.state.hazard, hazardValue: financeStat(phase.state.hazard), modifiers };
        return immutableJSON({ scope: 'environment-and-local-financial-effects-only', environment, financial });
    }
    const environment = reapplyOriginalColonyEnvironment({ hazard: input.hazard, modifiers: input.modifiers, conditions: l.commodityPass.conditions, industries: l.commodityPass.industries.map(e => ({ industryId: e.state.industryId, operating: e.operating })) });
    const financial = reapplyOriginalColonyFinancialPass({ ...input.financial, local: { ...l, hazard: environment.hazardValue } });
    return immutableJSON({ scope: 'environment-and-local-financial-effects-only', environment, financial });
}

/** Industry registration on actual object sets, AFTER conditions. No logical-ID collapse of old resource plugins. */
export function reapplyOriginalIndustryImmigrationObjects(input) {
    economyShape(input, ['modifiers','conditions','industries'], 'live immigration registrations');
    const industryRefs = new Set();
    const industries = input.industries.map(i => {
        economyShape(i, ['industryId','objectRef','operating'], 'live immigration industry');
        check(typeof i.objectRef === 'string' && i.objectRef.length > 0 && i.objectRef.length <= 512 && !industryRefs.has(i.objectRef), 'Duplicate/missing industry object');
        industryRefs.add(i.objectRef); return {industryId:i.industryId,operating:i.operating};
    });
    const context = environmentContext(input.conditions, industries, 'incoming');
    validateImmigrationModifierLists(input.modifiers, context, 'object');
    const modifiers = structuredClone(input.modifiers);
    for (const list of Object.values(modifiers)) for (const ref of list) if (ref.kind === 'industry')
        check(input.industries.some(i=>i.industryId === ref.id && i.objectRef === ref.objectRef), 'Foreign industry callback identity');
    for (const i of input.industries) {
        const spec = R.industries[i.industryId]; if (!spec.immigrationPlugin) continue;
        modifiers.transient = modifiers.transient.filter(ref=>ref.objectRef !== i.objectRef);
        modifiers.transient.push({kind:'industry',id:i.industryId,objectRef:i.objectRef});
        if (['Spaceport','TradeCenter'].includes(spec.className) && !functional(i.operating))
            modifiers.transient = modifiers.transient.filter(ref=>ref.objectRef !== i.objectRef);
    }
    validateImmigrationModifierLists(modifiers, context, 'object');
    return immutableJSON(modifiers);
}
