import type { OriginalConditionPhaseCapture, OriginalConditionPhaseResult } from './OriginalConditionPhase.mjs';
import type { OriginalSpecialIndustryState, OriginalSpecialIndustryModifiers, OriginalSpecialIndustryContext } from './OriginalSpecialIndustries.mjs';
import type { DeepReadonly } from '../Types.js';
import type { EconomyIndustryAmounts } from './OriginalMarketEconomy.mjs';
import type { OriginalResourceIndustryState, OriginalResourceIndustryModifiers, OriginalIndustryOperating } from './OriginalResourceIndustries.mjs';
import type { OriginalCivicIndustryState, OriginalCivicIndustryModifiers } from './OriginalCivicIndustries.mjs';
import type { OriginalProductionIndustryState, OriginalProductionIndustryModifiers, OriginalProductionContext } from './OriginalProductionIndustries.mjs';
export interface OriginalIndustryCommodityEntry {
    state: OriginalResourceIndustryState | OriginalCivicIndustryState | OriginalProductionIndustryState | OriginalSpecialIndustryState;
    operating: OriginalIndustryOperating;
    modifiers: OriginalResourceIndustryModifiers | OriginalCivicIndustryModifiers | OriginalProductionIndustryModifiers | OriginalSpecialIndustryModifiers;
}
/** Shared preparation shape. Live loading may carry resource items; the offline reapply below may not. */
export interface OriginalIndustryCommodityPassInput {
    /** Optional actual administrator capture; requires conditionPhase to preserve native ordering. */
    governedSkills?: import('./OriginalGovernedSkills.mjs').OriginalGovernedSkillsCapture;
    conditionPhase?: OriginalConditionPhaseCapture;
    marketSize: number;
    freePort: boolean;
    factionIllegalCommodityIds: string[];
    conditions: {
        id: string;
        modId: string;
        surveyed: boolean;
        suppressed: boolean;
    }[];
    industries: OriginalIndustryCommodityEntry[];
    available: {
        heavy_machinery: number;
    } & Record<string, number>;
    production?: OriginalProductionContext;
    special?: OriginalSpecialIndustryContext;
    commodities: {
        commodityId: string;
        previousSupplyLegal: boolean;
        previousDemandLegal: boolean;
    }[];
}
/** Legacy detached pass: all resource entries MUST have specialItemId=null, even for supported live items. */
export function reapplyOriginalIndustryCommodityPass(input: DeepReadonly<OriginalIndustryCommodityPassInput>): DeepReadonly<{
    scope: 'selected-commodity-effects-only';
    conditionPhase?: Omit<OriginalConditionPhaseResult, 'industries'>;
    governedSkillsPhase?: import('./OriginalGovernedSkills.mjs').OriginalGovernedSkillsResult;
    industries: OriginalIndustryCommodityEntry[];
    commodities: Record<string, EconomyIndustryAmounts>;
    conditionIdsWithoutDirectCommodityEffects: string[];
    production?: OriginalProductionContext;
    special?: OriginalSpecialIndustryContext;
}>;

export function originalIndustryAvailabilityKeys(industryIds:readonly string[]):readonly string[];
