import raw from '../data/reference-population.json' with { type: 'json' };
import { identifier, requireThat, immutableJSON, integer } from '../core/Values.mjs';
import { economyShape } from './OriginalMarketEconomy.mjs';
import { blank, bool, put, size } from './OriginalIndustryState.mjs';
import { financeFloat, financeStat, nativeInt } from './OriginalMarketFinance.mjs';
import { computeOriginalIncoming, computeOriginalIncomingWithObjects, originalPopulationWeightForSize } from './OriginalImmigration.mjs';
export const ORIGINAL_POPULATION = immutableJSON(raw);
const f = Math.fround, check = (v, message) => requireThat(v, 'UNSUPPORTED_POPULATION', message);
const maximum = p => nativeInt(Math.floor(financeStat({ base: f(ORIGINAL_POPULATION.settings.maxColonySize), modifiers: p.maxMarketSize }) + 0.5));
export function validateOriginalPopulation(input) {
    economyShape(input, ['composition', 'weight'], 'native population composition');
    check(Array.isArray(input.composition) && input.composition.length <= 4096, 'Expected bounded ordered population factions');
    const seen = new Set();
    for (const row of input.composition) {
        economyShape(row, ['factionId', 'amount'], 'population faction');
        identifier(row.factionId);
        check(!seen.has(row.factionId), 'Duplicate population faction');
        seen.add(row.factionId);
        financeFloat(row.amount, 'population amount');
    }
    financeStat(input.weight);
}
function get(pop, id) { return pop.composition.find(row => row.factionId === id)?.amount ?? 0; }
function add(pop, id, amount) {
    const row = pop.composition.find(row => row.factionId === id);
    if (row)
        row.amount = f(row.amount + amount);
    else
        pop.composition.push({ factionId: id, amount: f(amount) });
}
function setWeight(pop, value) { put(pop.weight, 'flat', 'core_set', f(value)); }
function normalize(pop) {
    const weight = financeStat(pop.weight), total = pop.composition.reduce((sum, row) => f(sum + row.amount), 0);
    for (const row of pop.composition)
        row.amount = weight <= 0 || total <= 0 ? 0 : f(f(row.amount * weight) / total);
}
/** Market.getPopulation's lazy initialization. Does not initialize or replace an existing population. */
export function newOriginalPopulation(factionId, marketSize) {
    identifier(factionId);
    size(marketSize);
    const weight = originalPopulationWeightForSize(marketSize), pop = { composition: [{ factionId, amount: weight }], weight: blank() };
    setWeight(pop, weight);
    return immutableJSON(pop);
}
/** Native removal order includes the duplicate final remove of the old-size condition. */
export function originalPopulationGrowthPlan(marketSize) {
    size(marketSize);
    check(marketSize < 10, 'Growth above supported population/industry catalogue requires another rules provider');
    return immutableJSON({ fromSize: marketSize, toSize: marketSize + 1, removeConditionIds: [...Array.from({ length: 11 }, (_, i) => 'population_' + i), 'population_' + marketSize], addConditionId: 'population_' + (marketSize + 1) });
}
/**
 * Complete native advance loop for supported immigration inputs. A real growth effect driver is
 * mandatory when size changes: it must perform condition replacement, size listeners and reapply
 * before returning current getter inputs. No event-only/deferred growth is treated as completed.
 * The driver is a trusted synchronous rule dependency, never client-supplied executable data.
 */
export function advanceOriginalPopulation(input, grow = null) { return advancePopulation(input, grow, computeOriginalIncoming); }
/** Same native loop with actual permanent/transient object identities, including old resource plugins. */
export function advanceOriginalPopulationWithObjects(input, grow = null) { return advancePopulation(input, grow, computeOriginalIncomingWithObjects); }
function advancePopulation(input, grow, computeIncoming) {
    economyShape(input, ['immigration', 'population', 'previousIncoming', 'playerOwned', 'inNewGameAdvance'], 'population advance');
    if (input.population !== null)
        validateOriginalPopulation(input.population);
    if (input.previousIncoming !== null)
        validateOriginalPopulation(input.previousIncoming);
    bool(input.playerOwned, 'native player ownership');
    bool(input.inNewGameAdvance, 'new-game advance');
    check(grow === null || typeof grow === 'function', 'Expected synchronous growth effect driver');
    const firstTime = input.previousIncoming === null, computed = computeIncoming(input.immigration);
    check(input.immigration.luddicMajorityState === undefined || input.immigration.luddicMajorityState.playerOwned === input.playerOwned, 'Conflicting population and Luddic-majority ownership');
    let immigration = structuredClone(input.immigration), population = input.population === null ? null : structuredClone(input.population);
    let playerOwned = input.playerOwned, inNewGameAdvance = input.inNewGameAdvance;
    immigration.incentives = structuredClone(computed.incentives);
    const incoming = computed.incoming, growths = [], notifications = [];
    const iterations = immigration.uiUpdateOnly ? 0 : firstTime ? 100 : 1;
    const daysFraction = f(immigration.days / 30);
    for (let iteration = 0; iteration < iterations; iteration++) {
        const fraction = iterations > 1 ? f((iterations - iteration) * f(0.1)) : daysFraction;
        if (population === null)
            population = structuredClone(newOriginalPopulation(immigration.market.factionId, immigration.market.size));
        for (const row of incoming.composition)
            add(population, row.factionId, f(row.amount * fraction));
        const min = originalPopulationWeightForSize(immigration.market.size), max = originalPopulationWeightForSize(immigration.market.size + 1);
        let weight = f(financeStat(population.weight) + f(computed.weightValue * fraction));
        if (weight < min || inNewGameAdvance)
            weight = min;
        if (weight > max) {
            if (immigration.market.size >= maximum(immigration) || !playerOwned) {
                // Native increaseMarketSize performs this normalization BEFORE advance overwrites with max.
                setWeight(population, min);
                normalize(population);
            }
            else {
                const plan = originalPopulationGrowthPlan(immigration.market.size);
                check(grow !== null, 'Population crossed a growth threshold without a synchronous reapplication driver');
                const request = immutableJSON({ plan, iteration, immigration, population, incoming, playerOwned, inNewGameAdvance });
                const response = grow(request);
                economyShape(response, ['immigration', 'playerOwned', 'inNewGameAdvance', 'effects'], 'growth driver response');
                bool(response.playerOwned, 'post-growth ownership');
                bool(response.inNewGameAdvance, 'post-growth new-game advance');
                // Pure input validation only; this preview result is discarded, NEVER stored or billed.
                computeIncoming({ ...response.immigration, uiUpdateOnly: true });
                check(response.immigration.luddicMajorityState === undefined || response.immigration.luddicMajorityState.playerOwned === response.playerOwned, 'Growth driver returned conflicting Luddic-majority ownership');
                check(response.immigration.market.marketId === immigration.market.marketId && response.immigration.market.size === plan.toSize, 'Growth driver returned another market or wrong size');
                const nextConditions = response.immigration.conditions, added = nextConditions.filter(c => c.id === plan.addConditionId);
                check(added.length === 1 && !immigration.conditions.some(c => c.modId === added[0].modId) && !nextConditions.some(c => c.id !== plan.addConditionId && plan.removeConditionIds.includes(c.id)), 'Growth driver did not replace population conditions with a fresh instance');
                check(response.immigration.days === immigration.days && response.immigration.uiUpdateOnly === immigration.uiUpdateOnly, 'Growth driver changed the active time slice');
                check(response.immigration.incentives.credits === immigration.incentives.credits, 'Growth driver charged incentives a second time');
                immigration = structuredClone(response.immigration);
                playerOwned = response.playerOwned;
                inNewGameAdvance = response.inNewGameAdvance;
                if (immigration.market.size >= maximum(immigration))
                    immigration.incentives.on = false;
                growths.push({ plan, iteration, effects: response.effects });
                if (playerOwned)
                    notifications.push({ type: 'colony-size-increased', marketId: immigration.market.marketId, size: immigration.market.size });
            }
            weight = max;
        }
        setWeight(population, weight);
        normalize(population);
        const conversion = f(f(f(f(0.05) * immigration.market.stability) / 10) * fraction);
        if (conversion > 0)
            add(population, immigration.market.factionId, f(f(financeStat(population.weight) - get(population, immigration.market.factionId)) * conversion));
        const pirateFraction = f(f(f(0.01) * Math.max(0, f(f(5 - immigration.market.stability) / 5))) * fraction);
        if (pirateFraction > 0) {
            add(population, 'pirates', f(financeStat(population.weight) * pirateFraction));
            add(population, 'poor', f(financeStat(population.weight) * pirateFraction));
        }
        const factions = new Set(immigration.factionIds);
        population.composition = population.composition.filter(row => factions.has(row.factionId));
        normalize(population);
    }
    if (population !== null)
        validateOriginalPopulation(population);
    integer(iterations, 'population iterations');
    return immutableJSON({ scope: 'native-population-advance-with-explicit-growth-effects', state: { immigration, population, previousIncoming: incoming, playerOwned, inNewGameAdvance }, iterations, firstTime, incentiveAccrued: computed.incentiveAccrued, growths, notifications });
}
