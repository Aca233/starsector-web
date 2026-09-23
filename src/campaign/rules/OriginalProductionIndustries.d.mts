import type { DeepReadonly } from '../Types.js';
import type { EconomyBonus, EconomyMutable, EconomyIndustry } from './OriginalMarketEconomy.mjs';
import type { OriginalIndustryOperating, OriginalResourceIndustryModifiers } from './OriginalResourceIndustries.mjs';
export type OriginalProductionIndustryId = 'lightindustry' | 'refining' | 'heavyindustry' | 'orbitalworks' | 'fuelprod';
export type OriginalProductionItemId = 'biofactory_embryo' | 'catalytic_core' | 'synchrotron' | 'corrupted_nanoforge' | 'pristine_nanoforge';
export interface OriginalProductionIndustryState { schemaVersion: 1; industryId: OriginalProductionIndustryId; supplyBonus: EconomyMutable; demandReduction: EconomyMutable; supply: Record<string, EconomyMutable>; demand: Record<string, EconomyMutable> }
export interface OriginalProductionIndustryModifiers extends Omit<OriginalResourceIndustryModifiers, 'specialItemId'> { specialItemId: OriginalProductionItemId | null }
export interface OriginalProductionContext { productionQuality: EconomyBonus; previousStability: number; adminFuelSupplyBonus: number }
export interface OriginalProductionIndustryInput extends OriginalProductionContext { state: OriginalProductionIndustryState; marketSize: number; operating: OriginalIndustryOperating; modifiers: OriginalProductionIndustryModifiers; available: Record<string, number>; illegalCommodityIds: string[]; conditionIds: string[] }
export interface OriginalProductionIndustryResult { state: OriginalProductionIndustryState; productionQuality: EconomyBonus }
export const ORIGINAL_PRODUCTION_INDUSTRIES: DeepReadonly<{ schemaVersion: 1; originalReference: string; scope: string; sources: Record<string, { sha256: string }>; industries: Record<OriginalProductionIndustryId, { plugin: string; className: string; tags: string[]; image: string }>; items: Record<OriginalProductionItemId, { industryIds: OriginalProductionIndustryId[]; supplyBonus: number; requiredCondition: string | null; qualityBonus: number | null }>; orbitalWorksQualityBonus: number; pollution: {daysBeforePollution:number;daysBeforePermanent:number} }>;
export function validateOriginalProductionIndustry(state: unknown): asserts state is DeepReadonly<OriginalProductionIndustryState>;
export function newOriginalProductionIndustry(id: OriginalProductionIndustryId): DeepReadonly<OriginalProductionIndustryState>;
export function applyOriginalProductionIndustry(input: DeepReadonly<OriginalProductionIndustryInput>): DeepReadonly<OriginalProductionIndustryResult>;
export function unapplyOriginalProductionIndustry(input: DeepReadonly<{ state: OriginalProductionIndustryState; productionQuality: EconomyBonus; specialItemId: OriginalProductionItemId | null }>): DeepReadonly<OriginalProductionIndustryResult>;
export function originalProductionIndustryOutput(state: DeepReadonly<OriginalProductionIndustryState>, context: DeepReadonly<{ commodityId: string; illegal: boolean }>): DeepReadonly<EconomyIndustry>;

export function applyOriginalLiveProductionIndustry(market:{size:number;freePort:boolean;factionIllegalCommodityIds:string[];conditions:{id:string}[];previousStability:number;production:OriginalProductionContext},entry:{state:OriginalProductionIndustryState;operating:OriginalIndustryOperating;modifiers:OriginalProductionIndustryModifiers},runtime:{readCommodityAvailable(id:string):number;applyFinances():object}):DeepReadonly<OriginalProductionIndustryResult>;
export function unapplyOriginalProductionItem(state:OriginalProductionIndustryState,productionQuality:EconomyBonus,specialItemId:OriginalProductionItemId|null):void;
