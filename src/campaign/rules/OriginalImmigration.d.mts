import type { DeepReadonly } from '../Types.js';
import type { EconomyMutable, EconomyBonus } from './OriginalMarketEconomy.mjs';
import type { OriginalIndustryCommodityEntry } from './OriginalIndustryCommodityPass.mjs';
import type { OriginalEnvironmentCondition, OriginalImmigrationModifierLists } from './OriginalColonyEnvironment.mjs';
export interface OriginalImmigrationInput {
    market: {
        marketId: string;
        factionId: string;
        size: number;
        stability: number;
        hostileToIndependent: boolean;
    };
    hazard: number;
    accessibility: EconomyBonus;
    /** Actual post-commodity demand/supply state, not a new or guessed industry blueprint. */
    industries: OriginalIndustryCommodityEntry[];
    constructionQueue: string[];
    conditions: OriginalEnvironmentCondition[];
    modifiers: OriginalImmigrationModifierLists;
    freeMarketDaysByModId: Record<string, number>;
    /** Required iff a Luddic-majority object exists. Actual market/global getters; registration is not re-evaluated here. */
    luddicMajorityState?: {
        playerOwned: boolean;
        defeatedExpedition: boolean;
    };
    adminAiCoreId: 'alpha_core' | 'beta_core' | 'gamma_core' | null;
    drugsAvailable: number;
    factionIds: string[];
    neighbors: {
        econGroup: string | null;
        roster: {
            marketId: string;
            econGroup: string | null;
        }[];
        markets: {
            marketId: string;
            factionId: string;
            size: number;
            location: {
                x: number;
                y: number;
            };
            hostileToTarget: boolean;
        }[];
    };
    maxMarketSize: EconomyBonus;
    incentives: {
        on: boolean;
        credits: number;
    };
    /** This call's elapsed game days; converted to native days/30 before charging. */
    days: number;
    uiUpdateOnly: boolean;
}
export interface OriginalImmigrationHazardEffects {
    units: number;
    sizeMultiplier: number;
    penalty: number;
    incentivePoints: number;
    incentiveCost: number;
}
export interface OriginalImmigrationResult {
    scope: 'supported-native-incoming-phase-only';
    incoming: {
        composition: {
            factionId: string;
            amount: number;
        }[];
        weight: EconomyMutable;
    };
    weightValue: number;
    positiveWeight: number;
    incentives: {
        on: boolean;
        credits: number;
    };
    incentiveAccrued: number;
    incentiveMonthlyCost: number;
    diagnostics: {
        hazard: OriginalImmigrationHazardEffects;
        numIndustries: number;
        industryNodeCount: number;
        roundedAccess: number;
        accessibilityMod: number;
        maxMarketSize: number;
        biggestNeighborId: string | null;
    };
}
export function originalPopulationWeightForSize(marketSize: number): number;
export function originalImmigrationHazardEffects(input: DeepReadonly<{
    hazard: number;
    marketSize: number;
}>): DeepReadonly<OriginalImmigrationHazardEffects>;
export function computeOriginalIncoming(input: DeepReadonly<OriginalImmigrationInput>): DeepReadonly<OriginalImmigrationResult>;

/** Only stateless resource-condition instances may have different object identities for one logical modifier. */
export interface OriginalImmigrationObjectsInput extends Omit<OriginalImmigrationInput,'modifiers'> {
    modifiers:import('./OriginalColonyEnvironment.mjs').OriginalImmigrationObjectLists;
}
export function computeOriginalIncomingWithObjects(input:DeepReadonly<OriginalImmigrationObjectsInput>):DeepReadonly<OriginalImmigrationResult>;
