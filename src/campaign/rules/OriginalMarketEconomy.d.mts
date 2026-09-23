import type { DeepReadonly } from '../Types.js';
import type { OriginalCommodityMarketState, OriginalPriceModifiers } from './OriginalMarketPricing.mjs';
export interface EconomyModifier { id: string; value: number }
export interface EconomyBonus { flat: EconomyModifier[]; percent: EconomyModifier[]; mult: EconomyModifier[] }
export interface EconomyMutable { base: number; modifiers: EconomyBonus }
export interface EconomyIndustry { id: string; supply: number; demand: number; supplyLegal: boolean; demandLegal: boolean }
export interface EconomyIndustryInput { commodityId: string; industries: EconomyIndustry[]; previousSupplyLegal: boolean; previousDemandLegal: boolean }
export interface EconomyIndustryAmounts { maxSupply: number; maxDemand: number; supplyLegal: boolean; demandLegal: boolean }
export interface EconomyNetwork { shippingGlobal: number; shippingFaction: number; maxExportGlobal: number; maxExportFaction: number; hidden: boolean }
export interface EconomyAvailabilityInput extends EconomyIndustryAmounts, EconomyNetwork { otherFlat: number }
export interface EconomyAvailability { availableWithoutTrade: number; reappliesEventMod: boolean; source: 'NONE' | 'LOCAL' | 'IN_FACTION' | 'GLOBAL'; sourceIsIllegal: boolean; core: { local: number; imports: number; shortage: number; lowAccess: number } }
export interface EconomyIcons { available: number; production: number; demand: number; extra: number; deficit: number; imports: number; demandMet: number; demandMetWithLocal: number; nonDemandExport: number; globalExport: number; inFactionOnlyExport: number; canNotExport: number }
export interface EconomyExportRow { marketId: string; factionId: string; maxSupply: number; availableBeforePass: number; shippingGlobalBeforePass: number; shippingFactionBeforePass: number }
export interface EconomyPricePass {
  marketId: string; commodityId: string; month: number; sourceRevision: string;
  phase: 'native-final-iteration' | 'native-force-stockpile-update';
  industry: Omit<EconomyIndustryInput, 'commodityId'>; network: EconomyNetwork;
  otherAvailableFlat: number; eventModBeforePass: number; tradeMod: { both: number; plus: number; minus: number };
  demandStat: EconomyMutable; greedStat: EconomyMutable;
  playerModifiers: Record<string, { supply: EconomyBonus; demand: EconomyBonus }>;
  marketModifiers: { supply: EconomyBonus; demand: EconomyBonus };
}
export interface EconomyPricePassResult {
  sourceRevision: string; phase: EconomyPricePass['phase']; month: number; marketId: string; commodityId: string;
  commodity: OriginalCommodityMarketState; marketSupplyMod: OriginalPriceModifiers; marketDemandMod: OriginalPriceModifiers;
  nativeStats: { demandStat: EconomyMutable; greedStat: EconomyMutable; playerModifiers: EconomyPricePass['playerModifiers'] };
  diagnostics: { amounts: EconomyIndustryAmounts; availability: EconomyAvailability; available: number; appliedEventMod: number; tradeLevel: number; icons: EconomyIcons; noDemand: boolean; random: { seed: number; demandRoll: number; stockpileRoll: number } };
}
export const ORIGINAL_MARKET_ECONOMY: DeepReadonly<{ schemaVersion: 1; originalReference: string; settings: Record<string, number>; sources: Record<string, { sha256: string }>; formulas: { taskOrder: string[] }; commodities: Record<string, { id: string; demandClass: string; econUnit: number; utility: number; origin: string | null; plugin: string | null; tags: string[] }> }>;
export function economyShape(value: unknown, keys: string[], name: string): void;
export function economyFloat(value: unknown, name: string, min?: number, max?: number): number;
export function originalEconomyCommodity(id: string): (typeof ORIGINAL_MARKET_ECONOMY)['commodities'][string];
export function originalJavaStringHash(value: string): number;
export function originalMarketMonthlyRandom(marketId: string, commodityId: string, month: number): DeepReadonly<{ seed: number; demandRoll: number; stockpileRoll: number }>;
export function resolveOriginalEconomyBonus(input: DeepReadonly<EconomyBonus>): DeepReadonly<OriginalPriceModifiers>;
export function resolveOriginalEconomyMutable(input: DeepReadonly<EconomyMutable>): number;
export function resolveOriginalIndustryAmounts(input: DeepReadonly<EconomyIndustryInput>): DeepReadonly<EconomyIndustryAmounts>;
export function originalEconomyShipping(accessibility: number): DeepReadonly<{ global: number; inFaction: number }>;
export function resolveOriginalEconomyExports(input: DeepReadonly<{ coverage: 'complete-econ-group'; econGroup: string | null; rows: EconomyExportRow[] }>): DeepReadonly<{ maxExportGlobal: number; maxExportPerFaction: Record<string, number> }>;
export function resolveOriginalEconomyAvailability(input: DeepReadonly<EconomyAvailabilityInput>): DeepReadonly<EconomyAvailability>;
export function originalEconomyTradeLevel(availableWithoutTrade: number, econUnit: number, tradeMod: DeepReadonly<{ both: number; plus: number; minus: number }>): number;
export function originalCommodityIconCounts(input: DeepReadonly<{ available: number; maxSupply: number; maxDemand: number; shippingGlobal: number; shippingFaction: number }>): DeepReadonly<EconomyIcons>;
export function resolveOriginalMarketEconomyPass(input: DeepReadonly<EconomyPricePass>): DeepReadonly<EconomyPricePassResult>;
/** Primary commodity quantities, including ships/meta. Does not loosen the resource price/stockpile boundary. */
export function resolveOriginalIndustryCommodityAmounts(input: DeepReadonly<EconomyIndustryInput>): DeepReadonly<EconomyIndustryAmounts>;

/** Includes known nonprimary variants, whose own demand update resets to zero without reading industry demand. */
export function resolveOriginalCommodityMaxima(input: DeepReadonly<EconomyIndustryInput>): DeepReadonly<EconomyIndustryAmounts>;
