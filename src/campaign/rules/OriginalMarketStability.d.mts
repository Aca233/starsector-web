import type { DeepReadonly } from '../Types.js';
import type { EconomyBonus, EconomyMutable } from './OriginalMarketEconomy.mjs';
import type { OriginalIndustryCommodityPassInput, reapplyOriginalIndustryCommodityPass } from './OriginalIndustryCommodityPass.mjs';
export interface NativeGovernanceMarket {
    marketId: string;
    playerOwned: boolean;
    adminIsPlayer: boolean;
}
export interface NativeGovernance {
    markets: NativeGovernanceMarket[];
    maxOutposts: number;
}
export type NativeStabilityConditionState = {
    daysActive: number;
} | {
    penalty: number;
} | {
    hasContainingLocation: boolean;
    relays: {
        id: string;
        sameFaction: boolean;
        nonFunctional: boolean;
        makeshift: boolean;
    }[];
};
export interface OriginalMarketStabilityInput {
    commodityPass: OriginalIndustryCommodityPassInput;
    stability: EconomyMutable;
    incomeMult: EconomyMutable;
    upkeepMult: EconomyMutable;
    maxIndustries: EconomyBonus;
    /** With conditionPhase, stability/hazard/commodity rows are captures BEFORE conditions. */
    previousStability: number;
    hazard: number;
    governance: NativeGovernance & {
        marketId: string;
    };
    constructionQueue: string[];
    conditionStateByModId: Record<string, NativeStabilityConditionState>;
    /** Actual complete ordered market roster. Cached amounts precede this industry pass; availability/network reads are current. */
    marketCommodities: {
        commodityId: string;
        maxDemand: number;
        maxSupply: number;
        available: number;
        shippingFaction: number;
        maxExportFaction: number;
    }[];
}
export interface OriginalMarketStabilityResult {
    scope: 'local-stability-and-population-financial-factors-only';
    commodityEffects: ReturnType<typeof reapplyOriginalIndustryCommodityPass>;
    stability: EconomyMutable;
    incomeMult: EconomyMutable;
    upkeepMult: EconomyMutable;
    maxIndustries: EconomyBonus;
    values: {
        stability: number;
        rawStability: number;
        incomeMult: number;
        upkeepMult: number;
        maxIndustries: number;
    };
    diagnostics: {
        marketCommodities?: OriginalMarketStabilityInput['marketCommodities'];
        hazardBeforeConditions?: number;
        hazardAfterConditions?: number;
        mismanagementPenalty: number;
        industryCount: number;
        industryFinancialInputs: {
            industryId: string;
            incomeMult: number;
            upkeepMult: number;
        }[];
        inFactionUpkeep: {
            totalDemand: number;
            inFactionSupply: number;
            fraction: number | null;
            multiplier: number | null;
        };
        deficitReads: {
            industryId: string;
            phase: 'before-demand' | 'after-demand';
            commodityId: string | null;
            deficit: number;
        }[];
    };
}
export const ORIGINAL_MARKET_STABILITY: DeepReadonly<{
    schemaVersion: 1;
    originalReference: string;
    scope: string;
    sources: Record<string, {
        sha256: string;
    }>;
    settings: Record<string, number>;
    maxIndustries: number[];
    freeMarket: Record<string, number>;
    relay: Record<string, number>;
    population: Record<string, number>;
    station: Record<string, number>;
    decivilized: Record<string, number>;
    industries: Record<string, {
        className: string;
        tags: string[];
        upgrade: string | null;
    }>;
}>;
export function originalMarketStabilityValue(stability: DeepReadonly<EconomyMutable>): number;
export function originalFreeMarketStabilityPenalty(daysActive: number): number;
export function originalMismanagementPenalty(input: DeepReadonly<NativeGovernance>): number;
export function reapplyOriginalMarketStability(input: DeepReadonly<OriginalMarketStabilityInput>): DeepReadonly<OriginalMarketStabilityResult>;
export function countOriginalIndustries(entries: DeepReadonly<{
    industryId: string;
    operating: import('./OriginalResourceIndustries.mjs').OriginalIndustryOperating;
}[]>, constructionQueue: readonly string[]): number;

/** Synchronous native callback runtime. State is a mutable authority/draft transaction, never client input. */
export interface OriginalPopulationStabilityRuntime {
    state: { stability: EconomyMutable; incomeMult: EconomyMutable; upkeepMult: EconomyMutable };
    previousStability: number; playerOwned: boolean; adminIsPlayer: boolean | null; hasCommRelay: boolean; modId: string;
    getCommodityIds(): string[];
    getMaxDemand(commodityId: string): number;
    /** Calls the lazy network getter BEFORE reading these four current values. */
    getAfterNetwork(commodityId: string): { maxSupply: number; available: number; shippingFaction: number; maxExportFaction: number };
    /** Evaluated after lazy network/upkeep reads, and only for player-owned markets. */
    isAdminPlayer?():boolean;
    getMismanagementPenalty(): number;
}
export interface OriginalPopulationStabilityResult {
    scope: 'live-population-financial-factors-only';
    rows: OriginalMarketStabilityInput['marketCommodities'];
    inFactionUpkeep: OriginalMarketStabilityResult['diagnostics']['inFactionUpkeep'];
    mismanagementPenalty: number | null;
}
export function modifyOriginalPopulationStability(runtime: OriginalPopulationStabilityRuntime): DeepReadonly<OriginalPopulationStabilityResult>;
