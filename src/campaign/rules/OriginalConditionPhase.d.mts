import type { DeepReadonly } from '../Types.js';
import type { EconomyMutable, EconomyBonus } from './OriginalMarketEconomy.mjs';
import type { OriginalIndustryCommodityEntry, OriginalIndustryCommodityPassInput } from './OriginalIndustryCommodityPass.mjs';
import type { OriginalAdditionalConditionInput, OriginalConditionLocalState } from './OriginalAdditionalConditions.mjs';
export interface OriginalConditionPhaseState {
    hazard: EconomyMutable;
    accessibility: EconomyBonus;
    stability: EconomyMutable;
    officerMercProbability: EconomyBonus;
    suppressedConditionIds: string[];
    immigrationModifiers: {
        permanent: {
            kind: 'condition' | 'industry';
            id: string;
        }[];
        transient: {
            kind: 'condition' | 'industry';
            id: string;
        }[];
    };
    commodities: OriginalConditionLocalState['commodities'];
}
export type OriginalConditionPhaseContext = OriginalAdditionalConditionInput['context'] | {
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
export interface OriginalConditionPhaseCapture {
    state: OriginalConditionPhaseState;
    contextByModId: Record<string, OriginalConditionPhaseContext>;
}
export interface OriginalConditionPhaseResult {
    scope: 'ordered-condition-local-effects-only';
    state: OriginalConditionPhaseState;
    conditions: OriginalIndustryCommodityPassInput['conditions'];
    industries: OriginalIndustryCommodityEntry[];
    execution: {
        scope: 'native-ordered-condition-callbacks-only';
        visited: number;
        applied: number;
    };
}
export const ORIGINAL_CONDITION_PHASE: DeepReadonly<{
    schemaVersion: 1;
    originalReference: string;
    scope: string;
    sources: Record<string, {
        sha256: string;
    }>;
    conditions: Record<string, {
        className: string;
        hazardPlugin: boolean;
        hazard: number | null;
    }>;
    freeMarket: Record<string, number>;
    decivilized: {
        STABILITY_PENALTY: number;
    };
    relay: Record<string, number>;
}>;
export function reapplyOriginalConditionPhase(input: DeepReadonly<OriginalConditionPhaseCapture & {
    marketSize: number;
    conditions: OriginalIndustryCommodityPassInput['conditions'];
    industries: OriginalIndustryCommodityEntry[];
}>): DeepReadonly<OriginalConditionPhaseResult>;

/** Direct plugin callback; caller owns add/remove and survey/suppression lifecycle ordering. */
export function applyOriginalConditionCallback(input:Parameters<typeof reapplyOriginalConditionPhase>[0],modId:string,action:'apply'|'unapply'):DeepReadonly<OriginalConditionPhaseResult>;
