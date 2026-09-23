import type { DeepReadonly } from '../Types.js';
import type { EconomyMutable } from './OriginalMarketEconomy.mjs';
import type { OriginalIndustryOperating } from './OriginalResourceIndustries.mjs';
import type { OriginalMarketStabilityInput } from './OriginalMarketStability.mjs';
import type { OriginalIndustryFinances, reapplyOriginalColonyFinancialPass } from './OriginalMarketFinance.mjs';
export interface OriginalEnvironmentCondition {
    id: string;
    modId: string;
    surveyed: boolean;
    suppressed: boolean;
}
export interface OriginalEnvironmentIndustry {
    industryId: string;
    operating: OriginalIndustryOperating;
}
export interface OriginalImmigrationModifier {
    kind: 'condition' | 'industry';
    id: string;
}
export interface OriginalImmigrationModifierObject extends OriginalImmigrationModifier { objectRef:string }
export interface OriginalImmigrationObjectLists {permanent:OriginalImmigrationModifierObject[];transient:OriginalImmigrationModifierObject[]}
export interface OriginalImmigrationModifierLists {
    permanent: OriginalImmigrationModifier[];
    transient: OriginalImmigrationModifier[];
}
export interface OriginalEnvironmentInput {
    hazard: EconomyMutable;
    modifiers: OriginalImmigrationModifierLists;
    conditions: OriginalEnvironmentCondition[];
    industries: OriginalEnvironmentIndustry[];
}
export interface OriginalEnvironmentResult {
    scope: 'supported-hazard-and-immigration-registration-only';
    hazard: EconomyMutable;
    hazardValue: number;
    modifiers: OriginalImmigrationModifierLists;
}
export interface OriginalEnvironmentalFinancialInput {
    hazard: EconomyMutable;
    modifiers: OriginalImmigrationModifierLists;
    financial: {
        local: Omit<OriginalMarketStabilityInput, 'hazard'>;
        industryFinances: OriginalIndustryFinances[];
    };
}
export const ORIGINAL_IMMIGRATION: DeepReadonly<{
    schemaVersion: 1;
    originalReference: string;
    scope: string;
    sources: Record<string, {
        sha256: string;
    }>;
    settings: Record<string, number>;
    conditions: Record<string, {
        className: string;
        hazardPlugin: boolean;
        hazard: number | null;
    }>;
    industries: Record<string, {
        className: string;
        immigrationPlugin: boolean;
    }>;
}>;
export function environmentContext(conditions: readonly DeepReadonly<OriginalEnvironmentCondition>[], industries: readonly DeepReadonly<OriginalEnvironmentIndustry>[], mode?: 'environment' | 'incoming'): {
    conditions: Map<string, DeepReadonly<OriginalEnvironmentCondition>>;
    conditionClasses: Map<string, string>;
    industries: Map<string, DeepReadonly<OriginalEnvironmentIndustry>>;
};
export function validateImmigrationModifierLists(modifiers: DeepReadonly<OriginalImmigrationModifierLists>, context: ReturnType<typeof environmentContext>, identityMode?:'logical'): void;
export function validateImmigrationModifierLists(modifiers: DeepReadonly<OriginalImmigrationObjectLists>, context: ReturnType<typeof environmentContext>, identityMode:'object'): void;
export function reapplyOriginalIndustryImmigrationObjects(input:DeepReadonly<{modifiers:OriginalImmigrationObjectLists;conditions:OriginalEnvironmentCondition[];industries:(OriginalEnvironmentIndustry & {objectRef:string})[]}>):DeepReadonly<OriginalImmigrationObjectLists>;
export function newOriginalMarketHazard(): DeepReadonly<EconomyMutable>;
export function reapplyOriginalColonyEnvironment(input: DeepReadonly<OriginalEnvironmentInput>): DeepReadonly<OriginalEnvironmentResult>;
export function reapplyOriginalEnvironmentalFinancialPass(input: DeepReadonly<OriginalEnvironmentalFinancialInput>): DeepReadonly<{
    scope: 'environment-and-local-financial-effects-only';
    environment: OriginalEnvironmentResult;
    financial: ReturnType<typeof reapplyOriginalColonyFinancialPass>;
}>;
