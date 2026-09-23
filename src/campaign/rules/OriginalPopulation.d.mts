import type { DeepReadonly, JsonValue } from '../Types.js';
import type { EconomyMutable } from './OriginalMarketEconomy.mjs';
import type { OriginalImmigrationInput, OriginalImmigrationObjectsInput } from './OriginalImmigration.mjs';
export interface OriginalPopulationComposition {
    composition: {
        factionId: string;
        amount: number;
    }[];
    weight: EconomyMutable;
}
export interface OriginalPopulationState {
    immigration: OriginalImmigrationInput;
    population: OriginalPopulationComposition | null;
    previousIncoming: OriginalPopulationComposition | null;
    playerOwned: boolean;
    inNewGameAdvance: boolean;
}
export interface OriginalPopulationGrowthPlan {
    fromSize: number;
    toSize: number;
    removeConditionIds: string[];
    addConditionId: string;
}
export interface OriginalPopulationGrowthRequest {
    plan: OriginalPopulationGrowthPlan;
    iteration: number;
    immigration: OriginalImmigrationInput;
    population: OriginalPopulationComposition;
    incoming: OriginalPopulationComposition;
    playerOwned: boolean;
    inNewGameAdvance: boolean;
}
export interface OriginalPopulationGrowthResponse {
    immigration: OriginalImmigrationInput;
    playerOwned: boolean;
    inNewGameAdvance: boolean;
    effects: JsonValue;
}
/** Trusted synchronous rules dependency; must execute reapplication before returning new getter state. */
export type OriginalPopulationGrowthDriver = (request: DeepReadonly<OriginalPopulationGrowthRequest>) => DeepReadonly<OriginalPopulationGrowthResponse>;
export interface OriginalPopulationResult {
    scope: 'native-population-advance-with-explicit-growth-effects';
    state: OriginalPopulationState;
    iterations: number;
    firstTime: boolean;
    incentiveAccrued: number;
    growths: {
        plan: OriginalPopulationGrowthPlan;
        iteration: number;
        effects: JsonValue;
    }[];
    notifications: {
        type: 'colony-size-increased';
        marketId: string;
        size: number;
    }[];
}
export const ORIGINAL_POPULATION: DeepReadonly<{
    schemaVersion: 1;
    originalReference: string;
    scope: string;
    sources: Record<string, {
        sha256: string;
    }>;
    settings: Record<string, number>;
}>;
export function validateOriginalPopulation(input: unknown): asserts input is DeepReadonly<OriginalPopulationComposition>;
export function newOriginalPopulation(factionId: string, marketSize: number): DeepReadonly<OriginalPopulationComposition>;
export function originalPopulationGrowthPlan(marketSize: number): DeepReadonly<OriginalPopulationGrowthPlan>;
export function advanceOriginalPopulation(input: DeepReadonly<OriginalPopulationState>, grow?: OriginalPopulationGrowthDriver | null): DeepReadonly<OriginalPopulationResult>;

export interface OriginalPopulationObjectsState extends Omit<OriginalPopulationState,'immigration'> { immigration:OriginalImmigrationObjectsInput }
export interface OriginalPopulationObjectsGrowthRequest extends Omit<OriginalPopulationGrowthRequest,'immigration'> { immigration:OriginalImmigrationObjectsInput }
export interface OriginalPopulationObjectsGrowthResponse extends Omit<OriginalPopulationGrowthResponse,'immigration'> { immigration:OriginalImmigrationObjectsInput }
export type OriginalPopulationObjectsGrowthDriver = (request:DeepReadonly<OriginalPopulationObjectsGrowthRequest>) => DeepReadonly<OriginalPopulationObjectsGrowthResponse>;
export interface OriginalPopulationObjectsResult extends Omit<OriginalPopulationResult,'state'> { state:OriginalPopulationObjectsState }
export function advanceOriginalPopulationWithObjects(input:DeepReadonly<OriginalPopulationObjectsState>,grow?:OriginalPopulationObjectsGrowthDriver|null):DeepReadonly<OriginalPopulationObjectsResult>;
