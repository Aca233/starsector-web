import type {DeepReadonly} from '../Types.js';
import type {EconomyBonus} from './OriginalMarketEconomy.mjs';
import type {OriginalGovernedSkill} from './OriginalGovernedSkills.mjs';
export interface OriginalCharacterIndustryModifiers{supplyBonus:EconomyBonus|null;demandReduction:EconomyBonus|null;fuelSupplyBonus:EconomyBonus|null;customProduction:EconomyBonus|null}
export interface OriginalCharacterIndustryStatsDraft{skills:OriginalGovernedSkill[];modifiers:OriginalCharacterIndustryModifiers}
export interface OriginalAdministratorIndustryInputs{adminSupplyBonus:number;adminDemandReduction:number;adminFuelSupplyBonus:number}
export interface OriginalCharacterIndustryStatsInput extends OriginalCharacterIndustryStatsDraft{skipRefresh:boolean}
export interface OriginalCharacterIndustryStatsResult{scope:'character-industry-stat-projection-only';modifiers:OriginalCharacterIndustryModifiers;industryInputs:OriginalAdministratorIndustryInputs;execution:{skipped:boolean;unapplied:number;applied:string[]};unresolved:string[]}
export const ORIGINAL_CHARACTER_INDUSTRY_STATS:DeepReadonly<{schemaVersion:1;originalReference:string;scope:'character-industry-stat-projection-only';sources:Record<string,{sha256:string}>;knownSkillIds:string[];keys:Record<keyof OriginalCharacterIndustryModifiers,string>;loadedCharacterEffects:{skillId:string;index:number;requiredLevel:number;script:string}[];effects:{skillId:string;index:number;requiredLevel:number;script:string;operation:{target:keyof OriginalCharacterIndustryModifiers;channel:'flat'|'mult';value:number}}[]}>;
export function validateOriginalCharacterIndustryModifiers(input:DeepReadonly<OriginalCharacterIndustryModifiers>):void;
export function readOriginalAdministratorIndustryInputs(input:DeepReadonly<OriginalCharacterIndustryModifiers>):DeepReadonly<OriginalAdministratorIndustryInputs>;
export function reapplyOriginalCharacterIndustryStats(input:DeepReadonly<OriginalCharacterIndustryStatsInput>):DeepReadonly<OriginalCharacterIndustryStatsResult>;
