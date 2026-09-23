/** Original candidate getCurrentImage overrides, not availability or special-item effect admission. */
import directory from '../data/reference-colony-construction.json' with {type: 'json'};
import {identifier, immutableJSON, requireThat} from '../core/Values.mjs';

const specs = immutableJSON(directory.industries);
const check = (ok, message) => requireThat(ok, 'UNSUPPORTED_COLONY_CANDIDATE_IMAGE', message);
// BaseIndustry.java:53-54. Native getCurrentImage compares float market size to these int thresholds.
const SMALL = 3, LARGE = 6;
// Exact settings.json:1435-1453 sprites.industry entries (0.98a-RC8 installed reference).
const sprites = Object.freeze({
    pop_low: 'graphics/icons/industry/population_low.png',
    pop_high: 'graphics/icons/industry/population_high.png',
    mining_low: 'graphics/icons/industry/mining_low.png',
    mining_gas_giant: 'graphics/icons/industry/gas_giant_mining.png',
    light_industry_low: 'graphics/icons/industry/light_industry_low.png',
    light_industry_high: 'graphics/icons/industry/light_industry_high.png',
    light_industry_orbital: 'graphics/icons/industry/light_industry_orbital.png',
    light_industry_orbital_low: 'graphics/icons/industry/light_industry_orbital_low.png',
    light_industry_orbital_high: 'graphics/icons/industry/light_industry_orbital_high.png',
    heavy_batteries_orbital: 'graphics/icons/industry/heavy_batteries_orbital.png',
    military_base_orbital: 'graphics/icons/industry/military_base_orbital.png',
    farming_low: 'graphics/icons/industry/farming_low.png',
    farming_med: 'graphics/icons/industry/farming_med.png',
    farming_high: 'graphics/icons/industry/farming_high.png',
    commerce_low: 'graphics/icons/industry/commerce_low.png',
    commerce_high: 'graphics/icons/industry/commerce_high.png',
    advanced_fuel_prod: 'graphics/icons/industry/advanced_fuel_production.png',
});
const noFields = Object.freeze([]);
const sizeFields = Object.freeze(['size']);
const planetFields = Object.freeze(['planetType', 'gasGiant']);
const sizePlanetFields = Object.freeze(['size', 'planetType', 'gasGiant']);
const itemFields = Object.freeze(['specialItemId']);
function spec(industryId) {
    identifier(industryId);
    check(Object.hasOwn(specs, industryId), 'Actual original industry directory ID required');
    return specs[industryId];
}
/** Possible reads, in native order. gasGiant is short-circuited when planetType is null. */
export function originalColonyCandidateImageNeeded(industryId) {
    spec(industryId);
    if (['farming', 'population', 'commerce'].includes(industryId)) return sizeFields;
    if (['mining', 'lightindustry'].includes(industryId)) return sizePlanetFields;
    if (['militarybase', 'heavybatteries'].includes(industryId)) return planetFields;
    if (industryId === 'fuelprod') return itemFields;
    return noFields;
}
function sizeOf(inputs) {
    const size = inputs.size;
    check(Number.isInteger(size) && size >= 0 && size <= 2147483647, 'Actual nonnegative Java int market size required');
    return Math.fround(size);
}
function planetOf(inputs) {
    const planetType = inputs.planetType;
    check(planetType === null || typeof planetType === 'string', 'Actual planetType or explicit null (no planet) required');
    if (planetType === null) return null;
    identifier(planetType, 'planet type');
    const gasGiant = inputs.gasGiant;
    check(typeof gasGiant === 'boolean', 'Actual planet isGasGiant boolean required; never inferred from type name');
    return {gasGiant};
}
/** No hidden getter reads or guessed defaults: only the selected original branch's inputs are accessed. */
export function originalColonyCandidateImage(industryId, inputs) {
    const base = spec(industryId).imageName;
    check(inputs !== null && typeof inputs === 'object' && !Array.isArray(inputs), 'Explicit candidate image inputs required ({} for Base-only images)');
    if (industryId === 'farming') {
        const size = sizeOf(inputs);
        return size <= SMALL ? sprites.farming_low : size >= LARGE ? sprites.farming_high : sprites.farming_med;
    }
    if (industryId === 'mining') {
        // Native Mining reads size even if its gas-giant branch subsequently wins.
        const size = sizeOf(inputs), planet = planetOf(inputs);
        if (planet !== null && planet.gasGiant) return sprites.mining_gas_giant;
        return size <= SMALL ? sprites.mining_low : base;
    }
    if (industryId === 'population' || industryId === 'commerce') {
        const size = sizeOf(inputs), prefix = industryId === 'population' ? 'pop' : 'commerce';
        return size <= SMALL ? sprites[`${prefix}_low`] : size >= LARGE ? sprites[`${prefix}_high`] : base;
    }
    if (industryId === 'lightindustry') {
        const size = sizeOf(inputs), planet = planetOf(inputs);
        if (planet === null || planet.gasGiant) {
            return size <= SMALL ? sprites.light_industry_orbital_low : size >= LARGE ? sprites.light_industry_orbital_high : sprites.light_industry_orbital;
        }
        return size <= SMALL ? sprites.light_industry_low : size >= LARGE ? sprites.light_industry_high : base;
    }
    if (industryId === 'fuelprod') {
        const itemId = inputs.specialItemId;
        check(itemId === null || typeof itemId === 'string', 'Actual specialItemId or explicit null required');
        if (itemId === null) return base;
        identifier(itemId, 'special item');
        // FuelProduction.java checks getSpecialItem()!=null, NOT a particular item ID.
        return sprites.advanced_fuel_prod;
    }
    if (industryId === 'militarybase' || industryId === 'heavybatteries') {
        const planet = planetOf(inputs);
        if (planet === null || planet.gasGiant) return industryId === 'militarybase' ? sprites.military_base_orbital : sprites.heavy_batteries_orbital;
    }
    // Includes aquaculture, patrolhq, highcommand, grounddefenses and LionsGuardHQ's Base-only override.
    return base;
}
