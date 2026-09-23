import type { DeepReadonly } from '../Types.js';
import type { EconomyMutable, EconomyIndustry } from './OriginalMarketEconomy.mjs';
import type { OriginalResourceIndustryState, OriginalResourceIndustryModifiers, OriginalIndustryOperating } from './OriginalResourceIndustries.mjs';
export type OriginalSpecialIndustryId='commerce'|'techmining'|'lionsguard'|'cryosanctum';
export interface OriginalSpecialIndustryState extends Omit<OriginalResourceIndustryState,'industryId'>{industryId:OriginalSpecialIndustryId}
export interface OriginalSpecialIndustryModifiers extends Omit<OriginalResourceIndustryModifiers,'specialItemId'>{specialItemId:null|'dealmaker_holosuite'}
export interface OriginalSpecialIndustryContext{factionId:string;techMiningMult:EconomyMutable}
export interface OriginalSpecialIndustryInput extends OriginalSpecialIndustryContext{state:OriginalSpecialIndustryState;marketSize:number;operating:OriginalIndustryOperating;modifiers:OriginalSpecialIndustryModifiers;available:Record<string,number>}
export const ORIGINAL_SPECIAL_INDUSTRIES:DeepReadonly<{schemaVersion:1;originalReference:string;scope:string;sources:Record<string,{sha256:string}>;industries:Record<OriginalSpecialIndustryId,{plugin:string;className:string;savedClassAlias:string;tags:string[];image:string}>;constants:Record<string,number>}>;
export function validateOriginalSpecialIndustry(state:unknown):asserts state is DeepReadonly<OriginalSpecialIndustryState>;
export function newOriginalSpecialIndustry(id:OriginalSpecialIndustryId):DeepReadonly<OriginalSpecialIndustryState>;
export function originalSpecialIndustryFunctional(id:OriginalSpecialIndustryId,operating:DeepReadonly<OriginalIndustryOperating>,factionId:string):boolean;
export function originalTechMiningFinancialSize(marketSize:number,conditionIds:readonly string[]):number;
export function applyOriginalSpecialIndustry(input:DeepReadonly<OriginalSpecialIndustryInput>):DeepReadonly<{state:OriginalSpecialIndustryState;techMiningMult:EconomyMutable}>;
export function originalSpecialIndustryOutput(state:DeepReadonly<OriginalSpecialIndustryState>,context:DeepReadonly<{commodityId:string;illegal:boolean}>):DeepReadonly<EconomyIndustry>;
