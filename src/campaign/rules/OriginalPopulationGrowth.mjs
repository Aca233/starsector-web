import { identifier, requireThat, immutableJSON, jsonCopy, isRecord } from '../core/Values.mjs';
import { economyShape } from './OriginalMarketEconomy.mjs';
import { bool } from './OriginalIndustryState.mjs';
import { computeOriginalIncoming } from './OriginalImmigration.mjs';
import { originalPopulationGrowthPlan } from './OriginalPopulation.mjs';
import { environmentContext, reapplyOriginalEnvironmentalFinancialPass } from './OriginalColonyEnvironment.mjs';
import { reapplyOriginalLocalAccessibility, reapplyOriginalIndustryAccessibility } from './OriginalMarketAccessibility.mjs';
const check = (v, message) => requireThat(v, 'UNSUPPORTED_POPULATION_GROWTH', message);
const same = (a, b) => JSON.stringify(jsonCopy(a)) === JSON.stringify(jsonCopy(b));
/** Population conditions have empty apply/unapply. Allocate a NEW identity, never reuse a removed instance. */
export function replaceOriginalPopulationConditions(input) {
    economyShape(input, ['conditions', 'fromSize', 'newModId', 'suppressed'], 'population condition replacement');
    const plan = originalPopulationGrowthPlan(input.fromSize);
    identifier(input.newModId);
    bool(input.suppressed, 'new population suppression');
    environmentContext(input.conditions, [], 'incoming');
    check(!input.conditions.some(c => c.modId === input.newModId), 'New population condition must have a fresh object identity');
    const removed = new Set(plan.removeConditionIds), conditions = input.conditions.filter(c => !removed.has(c.id));
    conditions.push({ id: plan.addConditionId, modId: input.newModId, surveyed: true, suppressed: input.suppressed });
    return immutableJSON(conditions);
}
/**
 * Executes supported LOCAL reapplication after actual condition replacement/size-listener/admin
 * inputs have been resolved. All cross-market getter captures remain explicit; no world task or
 * skill/event refresh is fabricated. This helper can be used by advanceOriginalPopulation's driver.
 */
export function reapplyOriginalPopulationGrowth(input) {
    economyShape(input, ['fromSize', 'immigration', 'environmentalFinancial', 'hasSpaceport', 'firstQueuedIndustryHasSpaceportTag', ...(isRecord(input) && Object.hasOwn(input, 'planetIsGasGiant') ? ['planetIsGasGiant'] : [])], 'population local growth reapplication');
    const plan = originalPopulationGrowthPlan(input.fromSize), p = input.immigration, source = input.environmentalFinancial;
    computeOriginalIncoming({ ...p, uiUpdateOnly: true });
    const hasSpool = p.industries.some(e => e.modifiers.specialItemId === 'fullerene_spool');
    check(hasSpool === Object.hasOwn(input, 'planetIsGasGiant'), 'Missing or unexpected actual planet getter for installed spool');
    if (hasSpool && input.planetIsGasGiant !== null) bool(input.planetIsGasGiant, 'actual planet gas-giant getter');
    check(p.market.size === plan.toSize, 'Reapplication must already observe new size');
    const removed = new Set(plan.removeConditionIds);
    check(p.conditions.filter(c => c.id === plan.addConditionId).length === 1 && !p.conditions.some(c => c.id !== plan.addConditionId && removed.has(c.id)), 'Population conditions have not been replaced');
    const l = source?.financial?.local, commodity = l?.commodityPass;
    check(commodity && commodity.marketSize === p.market.size, 'Financial source is not captured for new size');
    check(l.governance?.marketId === p.market.marketId, 'Financial source belongs to another market');
    for (const [a, b, name] of [[commodity.conditions, p.conditions, 'condition state'], [commodity.industries, p.industries, 'industry state'], [l.constructionQueue, p.constructionQueue, 'construction queue'], [source.modifiers, p.modifiers, 'callback lists']])
        check(same(a, b), 'Conflicting ' + name + ' snapshots');
    const freeState = Object.fromEntries(p.conditions.filter(c => c.id === 'free_market').map(c => [c.modId, l.conditionStateByModId?.[c.modId]?.daysActive]));
    check(same(freeState, p.freeMarketDaysByModId), 'Conflicting free-market ages');
    if (commodity.conditionPhase) {
        check(same(p.accessibility, commodity.conditionPhase.state.accessibility), 'Conflicting shared accessibility capture');
        for (const c of p.conditions.filter(c => c.id === 'luddic_majority')) {
            const church = commodity.conditionPhase.contextByModId[c.modId];
            check(church && church.playerOwned === p.luddicMajorityState.playerOwned && church.defeatedExpedition === p.luddicMajorityState.defeatedExpedition, 'Conflicting shared Church getter state');
            check(l.governance.markets.find(m => m.marketId === p.market.marketId)?.playerOwned === p.luddicMajorityState.playerOwned, 'Conflicting Church and governance ownership');
        }
    }
    const effects = reapplyOriginalEnvironmentalFinancialPass(source), local = effects.financial.localEffects, phase = local.commodityEffects.conditionPhase;
    const accessInput = { accessibility: local.commodityEffects.governedSkillsPhase?.state.accessibility ?? (phase ? phase.state.accessibility : p.accessibility), hasSpaceport: input.hasSpaceport, marketSize: p.market.size, firstQueuedIndustryHasSpaceportTag: input.firstQueuedIndustryHasSpaceportTag, industries: local.commodityEffects.industries.map(e => ({ industryId: e.state.industryId, operating: e.operating, aiCoreId: e.modifiers.aiCoreId, improved: e.modifiers.improved, specialItemId: e.modifiers.specialItemId })) };
    if (hasSpool) accessInput.portItemContext = { planetIsGasGiant: input.planetIsGasGiant, conditionIds: [...new Set((phase?.conditions ?? p.conditions).map(c => c.id))] };
    const access = phase ? reapplyOriginalIndustryAccessibility(accessInput) : reapplyOriginalLocalAccessibility({ ...accessInput, conditions: p.conditions, freeMarketDaysByModId: p.freeMarketDaysByModId });
    const drugs = (local.diagnostics.marketCommodities ?? l.marketCommodities).find(c => c.commodityId === 'drugs');
    check(drugs, 'Missing current drug availability getter');
    const immigration = { ...p, conditions: phase?.conditions ?? p.conditions, hazard: effects.environment.hazardValue, modifiers: effects.environment.modifiers, industries: local.commodityEffects.industries, market: { ...p.market, stability: local.values.stability }, accessibility: access.accessibility, drugsAvailable: drugs.available };
    // Validate the post-apply state without storing or charging a second incoming computation.
    computeOriginalIncoming({ ...immigration, uiUpdateOnly: true });
    return immutableJSON({ scope: 'local-growth-reapplication-only', immigration, environmentalFinancial: effects, accessibility: access });
}
