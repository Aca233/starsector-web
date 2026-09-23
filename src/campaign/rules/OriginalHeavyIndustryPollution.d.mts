import type { DeepReadonly } from '../Types.js';
import type { EconomyMutable } from './OriginalMarketEconomy.mjs';
import type { OriginalImmigrationModifier } from './OriginalColonyEnvironment.mjs';
export interface OriginalHeavyIndustryPollutionState{daysWithNanoforge:number;permaPollution:boolean;addedPollution:boolean}
export interface OriginalHeavyIndustryPollutionInput{state:OriginalHeavyIndustryPollutionState;event:'advance'|'special-item-set'|'update-status';specialItemId:null|'corrupted_nanoforge'|'pristine_nanoforge';days:number|null;habitable:boolean;pollutionPresent:boolean}
export interface OriginalHeavyIndustryPollutionResult{scope:'heavy-industry-pollution-callback-effects-only';state:OriginalHeavyIndustryPollutionState;pollutionPresent:boolean;conditionEffects:{action:'add'|'remove';conditionId:'pollution'}[]}
export function newOriginalHeavyIndustryPollution():DeepReadonly<OriginalHeavyIndustryPollutionState>;
export function updateOriginalHeavyIndustryPollution(input:DeepReadonly<OriginalHeavyIndustryPollutionInput>):DeepReadonly<OriginalHeavyIndustryPollutionResult>;
export function applyOriginalPollutionCondition(input:DeepReadonly<{action:'apply'|'unapply';modId:string;hazard:EconomyMutable;transientModifiers:OriginalImmigrationModifier[]}>):DeepReadonly<{hazard:EconomyMutable;transientModifiers:OriginalImmigrationModifier[]}>;
