/**
 * PopulationAndInfrastructure.java:120–151,196–213 only.
 * These callbacks mutate the authority's shared EconomyBonus objects in place.
 * They are NOT a replacement for Population/Base.apply, stability, or immigration.
 * See docs/campaign-population-live-source-notes-2026-09-22.md before integration.
 */
import stabilityReference from '../data/reference-market-stability.json' with {type: 'json'};
import fleetReference from '../data/reference-fleet-composition.json' with {type: 'json'};
import {immutableJSON, requireThat} from '../core/Values.mjs';

const f = Math.fround;
const check = (value, message) => requireThat(value, 'UNSUPPORTED_POPULATION_INDUSTRY_EFFECTS', message);
const MOD = 'ind_population'; // BaseIndustry.java:149–154: "ind_" + industry id.

export const ORIGINAL_POPULATION_INDUSTRY_EFFECTS = immutableJSON({
    schemaVersion: 1,
    originalReference: stabilityReference.originalReference,
    scope: 'population-shared-dynamic-stat-effects-only',
    settings: {
        // Extracted from local starsector-core/data/config/settings.json:711.
        // Existing fleet-composition reference does not yet contain this setting.
        maxDoctrineNumShipsMult: f(1.5),
        // settings.json:772–777, read by PopulationAndInfrastructure.java:48–53.
        officerBaseProb: f(0.1),
        officerProbPerColonySize: f(0.05),
        officerAdditionalBaseProb: f(0.1),
        officerBaseMercProb: f(0.25),
        adminBaseProb: f(0.05),
        adminProbPerColonySize: f(0.05),
    },
    constants: {
        // PopulationAndInfrastructure.java:55. False also controls exact unapply.
        HAZARD_INCREASES_DEFENSE: false,
        // FleetFactoryV3.java:56; use the existing extracted original reference.
        MIN_NUM_SHIPS_DEFICIT_MULT: f(fleetReference.constants.MIN_NUM_SHIPS_DEFICIT_MULT),
    },
    // settings.json:286; PopulationAndInfrastructure.getMaxIndustries:503–524.
    maxIndustries: stabilityReference.maxIndustries,
});
const R = ORIGINAL_POPULATION_INDUSTRY_EFFECTS, S = R.settings;

function javaFloat(value, name) {
    check(typeof value === 'number' && Number.isFinite(value) && Number.isFinite(f(value)),
        'Actual synchronous finite Java float required: ' + name);
    return f(value);
}
function javaInt(value, name, minimum = -2147483648) {
    check(Number.isInteger(value) && value >= minimum && value <= 2147483647,
        'Actual synchronous Java int required: ' + name);
    return value;
}
function read(runtime, name) {
    check(runtime && typeof runtime[name] === 'function', 'Missing population live getter: ' + name);
    // Preserve the service receiver. Do not call getters during validation/preflight.
    return runtime[name]();
}
function marketSize(runtime) {
    return javaInt(read(runtime, 'readMarketSize'), 'market.getSize');
}
function bonus(market, statId) {
    let result;
    if (statId === 'ground_defenses_mod' || statId === 'max_industries') {
        result = statId === 'ground_defenses_mod' ? market.groundDefenses : market.maxIndustries;
        const alias = market.economyBonuses?.[statId];
        check(alias === undefined || alias === result, 'Detached population shared stat alias: ' + statId);
    } else {
        result = market.economyBonuses?.[statId];
    }
    check(result && ['flat', 'percent', 'mult'].every(channel => Array.isArray(result[channel])),
        'Actual shared population bonus required: ' + statId);
    return result;
}
function modify(market, statId, channel, id, value, always = false) {
    const list = bonus(market, statId)[channel], index = list.findIndex(row => row.id === id);
    value = javaFloat(value, statId + ':' + id);
    // StatBonus.java:149–160,191–214. Ordinary writes keep an EXISTING neutral
    // entry; Always additionally creates one when no such source exists.
    if (index < 0) {
        if (always || value !== (channel === 'mult' ? 1 : 0)) list.push({id, value});
    } else if (always || list[index].value !== value) {
        list[index] = {id, value};
    }
}
function erase(market, statId, channel, id) {
    const list = bonus(market, statId)[channel], index = list.findIndex(row => row.id === id);
    if (index >= 0) list.splice(index, 1);
}

/**
 * After population's accessibility writes (Java:120–131).
 * Returns the one prevStability read, which MUST be reused by fleet-size effects.
 */
export function applyOriginalPopulationQualityAndDefenseEffects(market, runtime) {
    const stability = javaFloat(read(runtime, 'readPreviousStability'), 'market.getPrevStability');
    // FleetFactoryV3.java:117–118; these are Java float literals, not settings.
    const stabilityQuality = f(f(stability - 5) * f(0.05));
    const doctrineQuality = javaFloat(read(runtime, 'readDoctrineShipQualityContribution'),
        'faction.doctrine.getShipQualityContribution');
    modify(market, 'fleet_quality_mod', 'flat', MOD + '_0', stabilityQuality, true);
    modify(market, 'fleet_quality_mod', 'flat', MOD + '_1', doctrineQuality, true);
    const stabilityDefense = f(f(0.25) + f(f(stability / 10) * f(0.75)));
    modify(market, 'ground_defenses_mod', 'mult', MOD, stabilityDefense, true);
    // PopulationAndInfrastructure.getBaseGroundDefenses:175–185. Math.imul
    // retains the original int expression before the method returns a float.
    const size = marketSize(runtime);
    const baseDefense = size <= 1 ? 10 : size <= 2 ? 20 : size <= 3 ? 50 : Math.imul((size - 3) | 0, 100);
    modify(market, 'ground_defenses_mod', 'flat', MOD, f(baseDefense), true);
    // Original HAZARD_INCREASES_DEFENSE=false: no hazard read or '_1' write.
    // Java's extra size/prefix reads for StatMod.desc are outside EconomyBonus.
    return stability;
}

/** Java:132. Before any ships commodity read; before external modifyStability2. */
export function applyOriginalPopulationMaxIndustriesEffects(market, runtime) {
    const index = Math.max(0, Math.min(9, (marketSize(runtime) - 1) | 0));
    modify(market, 'max_industries', 'flat', MOD, f(R.maxIndustries[index]));
}

/** FleetFactoryV3.java:125–155, including its >10 fallback and float argument. */
function marketSizeShipsMult(size) {
    const value = Math.max(3, f(size));
    const index = Math.trunc(value) - 3;
    const multipliers = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5];
    return index < multipliers.length ? f(multipliers[index]) : f(value / 6);
}

/**
 * Java:133–145. Call after max_industries, using the earlier stability return.
 * Acquire ships ONCE; call its available getter BEFORE its max-demand getter.
 * All four fleet-stat writes occur only AFTER both actual commodity reads.
 */
export function applyOriginalPopulationFleetSizeEffects(market, runtime, previousStability) {
    const stability = javaFloat(previousStability, 'earlier population prevStability');
    const numShips = javaInt(read(runtime, 'readDoctrineNumShips'), 'faction.doctrine.getNumShips');
    // FleetFactoryV3.java:158–160. Round each Java float operation separately.
    const doctrineShips = f(1 + f(f(f(f(numShips) - 1) * f(S.maxDoctrineNumShipsMult - 1)) / 4));
    const sizeShips = marketSizeShipsMult(marketSize(runtime));

    check(runtime && typeof runtime.getCommodityData === 'function', 'Missing population live commodity getter');
    const ships = runtime.getCommodityData('ships');
    check(ships && typeof ships.getAvailable === 'function' && typeof ships.getMaxDemand === 'function',
        'Actual synchronous ships commodity handle required, not a value snapshot');
    const available = f(javaInt(ships.getAvailable(), 'ships.getAvailable', 0));
    const demand = f(javaInt(ships.getMaxDemand(), 'ships.getMaxDemand', 0));
    // FleetFactoryV3.java:1478–1496. Even zero demand must not skip available.
    let deficitShips = f(1);
    if (demand > 0) {
        let ratio = f(available / demand);
        if (ratio < R.constants.MIN_NUM_SHIPS_DEFICIT_MULT) ratio = R.constants.MIN_NUM_SHIPS_DEFICIT_MULT;
        deficitShips = f(deficitShips * ratio);
    }
    if (deficitShips < 0) deficitShips = f(0);
    if (deficitShips > 1) deficitShips = f(1);
    // FleetFactoryV3.java:121–122, using the saved (not re-read) stability.
    const stabilityShips = f(1 + f(f(stability - 5) * f(0.05)));
    modify(market, 'combat_fleet_size_mult', 'flat', MOD + '_0', sizeShips, true);
    modify(market, 'combat_fleet_size_mult', 'mult', MOD + '_1', doctrineShips, true);
    modify(market, 'combat_fleet_size_mult', 'mult', MOD + '_2', deficitShips, deficitShips === 1);
    modify(market, 'combat_fleet_size_mult', 'mult', MOD + '_3', stabilityShips, true);
}

/** Java:146–151. Before external modifyStability2 and immigration registration. */
export function applyOriginalPopulationRecruitmentEffects(market, runtime) {
    modify(market, 'officer_prob', 'flat', MOD + '_0', S.officerBaseProb);
    modify(market, 'officer_prob', 'flat', MOD + '_1',
        f(S.officerProbPerColonySize * f(Math.max(0, (marketSize(runtime) - 3) | 0))));
    modify(market, 'additional_officer_prob_mult', 'flat', MOD + '_0', S.officerAdditionalBaseProb);
    modify(market, 'officer_is_merc_prob', 'flat', MOD + '_0', S.officerBaseMercProb);
    modify(market, 'admin_prob', 'flat', MOD + '_0', S.adminBaseProb);
    modify(market, 'admin_prob', 'flat', MOD + '_1',
        f(S.adminProbPerColonySize * f(Math.max(0, (marketSize(runtime) - 3) | 0))));
}

/** Contiguous Java:120–151 ONLY. No unapply, base callback or stability pass. */
export function applyOriginalPopulationDynamicEffects(market, runtime) {
    const stability = applyOriginalPopulationQualityAndDefenseEffects(market, runtime);
    applyOriginalPopulationMaxIndustriesEffects(market, runtime);
    applyOriginalPopulationFleetSizeEffects(market, runtime, stability);
    applyOriginalPopulationRecruitmentEffects(market, runtime);
}

/**
 * Contiguous Java:196–213 ONLY, in original order. Insert after Base/stability/
 * accessibility cleanup, before unmodifyStability and transient immigration.
 * Never clear the bonus, replace its arrays, or remove by source prefix.
 */
export function unapplyOriginalPopulationDynamicEffects(market) {
    erase(market, 'fleet_quality_mod', 'flat', MOD + '_0');
    erase(market, 'fleet_quality_mod', 'flat', MOD + '_1');
    erase(market, 'ground_defenses_mod', 'flat', MOD);
    erase(market, 'ground_defenses_mod', 'mult', MOD);
    // HAZARD_INCREASES_DEFENSE=false: preserve ground defense mult '_1'.
    erase(market, 'max_industries', 'flat', MOD);
    erase(market, 'combat_fleet_size_mult', 'flat', MOD + '_0');
    erase(market, 'combat_fleet_size_mult', 'mult', MOD + '_1');
    erase(market, 'combat_fleet_size_mult', 'mult', MOD + '_2');
    erase(market, 'combat_fleet_size_mult', 'mult', MOD + '_3');
    erase(market, 'officer_prob', 'flat', MOD + '_0');
    erase(market, 'officer_prob', 'flat', MOD + '_1');
    erase(market, 'additional_officer_prob_mult', 'flat', MOD + '_0');
    erase(market, 'officer_is_merc_prob', 'flat', MOD + '_0');
    erase(market, 'admin_prob', 'flat', MOD + '_0');
    erase(market, 'admin_prob', 'flat', MOD + '_1');
}
