import type {DeepReadonly} from '../Types.js';
import type {EconomyBonus} from './OriginalMarketEconomy.mjs';

export const ORIGINAL_POPULATION_INDUSTRY_EFFECTS: DeepReadonly<{
    schemaVersion: 1;
    originalReference: string;
    scope: 'population-shared-dynamic-stat-effects-only';
    settings: {
        maxDoctrineNumShipsMult: number;
        officerBaseProb: number;
        officerProbPerColonySize: number;
        officerAdditionalBaseProb: number;
        officerBaseMercProb: number;
        adminBaseProb: number;
        adminProbPerColonySize: number;
    };
    constants: {HAZARD_INCREASES_DEFENSE: false; MIN_NUM_SHIPS_DEFICIT_MULT: number};
    maxIndustries: number[];
}>;

/**
 * Authority/draft references, never immutable captures. Each callback mutates
 * these actual objects and their channel arrays in place. If economyBonuses
 * also has ground_defenses_mod/max_industries aliases, they MUST be identical
 * to groundDefenses/maxIndustries respectively, not equal-but-detached copies.
 */
export interface OriginalPopulationIndustryEffectsMarket {
    groundDefenses: EconomyBonus;
    maxIndustries: EconomyBonus;
    /** Required at point of use; null is rejected for all other dynamic stats. */
    economyBonuses: Record<string, EconomyBonus> | null;
}

/**
 * A live commodity handle, acquired once. Neither value may be precomputed in
 * getCommodityData; getters must retain the runtime's real lazy side effects.
 */
export interface OriginalPopulationShipsCommodity {
    /** Native CommodityOnMarket.getAvailable(), a non-negative Java int. */
    getAvailable(): number;
    /** Native cached getMaxDemand(), NOT a new industry/network scan. */
    getMaxDemand(): number;
}

/** All services are synchronous and refer to the current shared market/faction. */
export interface OriginalPopulationIndustryEffectsRuntime {
    /** Actual market.getPrevStability(), not today's computed stability or 0. */
    readPreviousStability(): number;
    readMarketSize(): number;
    /** Actual doctrine contribution including any native adjustments. */
    readDoctrineShipQualityContribution(): number;
    readDoctrineNumShips(): number;
    /** Native lazy lookup/creation only; no eager availability/max-demand DTO. */
    getCommodityData(commodityId: 'ships'): OriginalPopulationShipsCommodity;
}

/** Java:120–131. Returns the single prevStability read to pass to fleet size. */
export function applyOriginalPopulationQualityAndDefenseEffects(
    market: OriginalPopulationIndustryEffectsMarket,
    runtime: Pick<OriginalPopulationIndustryEffectsRuntime,
        'readPreviousStability' | 'readMarketSize' | 'readDoctrineShipQualityContribution'>,
): number;

/** Java:132, after quality/defense and before reading ships. */
export function applyOriginalPopulationMaxIndustriesEffects(
    market: OriginalPopulationIndustryEffectsMarket,
    runtime: Pick<OriginalPopulationIndustryEffectsRuntime, 'readMarketSize'>,
): void;

/** Java:133–145. Does not read prevStability again. */
export function applyOriginalPopulationFleetSizeEffects(
    market: OriginalPopulationIndustryEffectsMarket,
    runtime: Pick<OriginalPopulationIndustryEffectsRuntime,
        'readDoctrineNumShips' | 'readMarketSize' | 'getCommodityData'>,
    previousStability: number,
): void;

/** Java:146–151, after fleet size, before modifyStability2/immigration. */
export function applyOriginalPopulationRecruitmentEffects(
    market: OriginalPopulationIndustryEffectsMarket,
    runtime: Pick<OriginalPopulationIndustryEffectsRuntime, 'readMarketSize'>,
): void;

/**
 * Runs those four contiguous phases in order. Insert after population's own
 * accessibility writes and before modifyStability2/immigration. This is not
 * full Population.apply, and does not implicitly unapply previous modifiers.
 */
export function applyOriginalPopulationDynamicEffects(
    market: OriginalPopulationIndustryEffectsMarket,
    runtime: OriginalPopulationIndustryEffectsRuntime,
): void;

/**
 * Java:196–213, exact owned channel/id cleanup only. Insert after Base/stability/
 * accessibility unapply and before unmodifyStability/immigration removal.
 */
export function unapplyOriginalPopulationDynamicEffects(
    market: OriginalPopulationIndustryEffectsMarket,
): void;
