import type { DeepReadonly } from '../Types.js';
import type { OriginalImmigrationInput } from './OriginalImmigration.mjs';
import type { OriginalEnvironmentCondition, OriginalEnvironmentalFinancialInput, reapplyOriginalEnvironmentalFinancialPass } from './OriginalColonyEnvironment.mjs';
import type { reapplyOriginalLocalAccessibility, reapplyOriginalIndustryAccessibility } from './OriginalMarketAccessibility.mjs';
export function replaceOriginalPopulationConditions(input: DeepReadonly<{
    conditions: OriginalEnvironmentCondition[];
    fromSize: number;
    newModId: string;
    suppressed: boolean;
}>): DeepReadonly<OriginalEnvironmentCondition[]>;
export interface OriginalPopulationLocalGrowthInput {
    fromSize: number;
    immigration: OriginalImmigrationInput;
    environmentalFinancial: OriginalEnvironmentalFinancialInput;
    hasSpaceport: boolean;
    firstQueuedIndustryHasSpaceportTag: boolean;
    /** Required only with fullerene_spool; null explicitly means no PlanetEntity. */
    planetIsGasGiant?: boolean | null;
}
export function reapplyOriginalPopulationGrowth(input: DeepReadonly<OriginalPopulationLocalGrowthInput>): DeepReadonly<{
    scope: 'local-growth-reapplication-only';
    immigration: OriginalImmigrationInput;
    environmentalFinancial: ReturnType<typeof reapplyOriginalEnvironmentalFinancialPass>;
    accessibility: ReturnType<typeof reapplyOriginalLocalAccessibility> | ReturnType<typeof reapplyOriginalIndustryAccessibility>;
}>;
