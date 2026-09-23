import type { DeepReadonly } from '../Types.js';
import type { EconomyMutable, EconomyBonus } from './OriginalMarketEconomy.mjs';
import type { OriginalImmigrationResult } from './OriginalImmigration.mjs';
export type AdditionalConditionId = 'arid' | 'barren_marginal' | 'ice' | 'tundra' | 'high_gravity' | 'low_gravity' | 'mild_climate' | 'solar_array' | 'luddic_majority' | 'pirate_activity' | 'pather_cells' | 'shipping_disruption';
export type OriginalPirateTier = 'TIER_1_1MODULE' | 'TIER_2_1MODULE' | 'TIER_3_2MODULE' | 'TIER_4_3MODULE' | 'TIER_5_3MODULE';
export interface OriginalConditionIndustry {
    industryId: string;
    supplyBonusFromOther: EconomyMutable;
}
export interface OriginalConditionLocalState {
    hazard: EconomyMutable;
    accessibility: EconomyBonus;
    stability: EconomyMutable;
    industries: OriginalConditionIndustry[];
    suppressedConditionIds: string[];
    transientModifiers: {
        kind: 'condition' | 'industry';
        id: string;
    }[];
    /** Caller-resolved ordered getters; timer maps are intentionally not replaced by this local state. */
    commodities: {
        commodityId: string;
        maxSupply: number;
        available: EconomyMutable;
    }[];
}
export interface OriginalChurchContext {
    playerOwned: boolean;
    madeChurchDeal: boolean;
    habitable: boolean;
    adminId: string | null;
    defeatedExpedition: boolean;
    constructionQueue: {
        industryId: string;
        specExists: boolean;
    }[] | null;
}
export type OriginalAdditionalConditionInput = {
    action: 'apply' | 'unapply';
    modId: string;
    state: OriginalConditionLocalState;
} & ({
    conditionId: Exclude<AdditionalConditionId, 'luddic_majority' | 'pirate_activity' | 'pather_cells' | 'shipping_disruption'>;
    context: null;
} | {
    conditionId: 'luddic_majority';
    context: OriginalChurchContext;
} | {
    conditionId: 'pirate_activity';
    context: {
        tier: OriginalPirateTier;
    };
} | {
    conditionId: 'pather_cells';
    context: {
        intelMarketFactionId: string;
        savedSleeper: boolean;
        playerHasPatherAgreement: boolean;
    };
} | {
    conditionId: 'shipping_disruption';
    context: {
        marketSize: number;
        playerOwned: boolean;
        shippingLost: EconomyMutable;
    };
});
export const ORIGINAL_ADDITIONAL_CONDITIONS: DeepReadonly<{
    schemaVersion: 1;
    originalReference: string;
    scope: 'additional-condition-local-callbacks-not-restored-market';
    sources: Record<string, {
        sha256: string;
    }>;
    conditions: Record<AdditionalConditionId, {
        plugin: string;
        className: string;
        hazard: number | null;
    }>;
    industries: Record<string, {
        tags: string[];
    }>;
    constants: Record<string, number>;
    suppressedConditions: string[];
    productionOverrides: Record<string, number>;
    pirateTiers: Record<OriginalPirateTier, {
        accessibility: number;
        stability: number;
    }>;
}>;
export function matchesOriginalLuddicMajority(industries: DeepReadonly<OriginalConditionIndustry[]>, context: DeepReadonly<OriginalChurchContext>): boolean;
export function originalShippingLossPenalty(marketSize: number, unitsLost: number): number;
export function applyOriginalAdditionalCondition(input: DeepReadonly<OriginalAdditionalConditionInput>): DeepReadonly<{
    scope: 'additional-condition-local-effects-only';
    state: OriginalConditionLocalState;
}>;
export function applyOriginalAdditionalIncoming(input: DeepReadonly<{
    conditionId: 'mild_climate' | 'luddic_majority';
    modId: string;
    marketSize: number;
    playerOwned: boolean;
    defeatedExpedition: boolean;
    incoming: OriginalImmigrationResult['incoming'];
}>): DeepReadonly<OriginalImmigrationResult['incoming']>;
