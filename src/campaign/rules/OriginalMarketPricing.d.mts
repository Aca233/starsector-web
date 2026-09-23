import type { DeepReadonly } from '../Types.js';
export interface OriginalPriceModifiers { flat: number; percent: number; mult: number }
export interface OriginalPriceThresholds { highThreshold: number; highMult: number; lowThreshold: number; lowMult: number }
export interface OriginalCommoditySpec { id: string; name: string; demandClass: string; basePrice: number; basePriceSource: string; variability: string; utility: number; econUnit: number; stackSize: number; cargoSpace: number; origin: string | null; tags: string[]; plugin: string | null; icon: string }
export interface OriginalCommodityMarketState {
  stockpile: number; demandValue: number; greed: number; utilityOnMarket: number; availableWithoutTrade: number;
  tradeMod: { both: number; plus: number; minus: number };
  supplyPrice: OriginalPriceThresholds; demandPrice: OriginalPriceThresholds;
  playerSupplyModsByPlayer: Record<string, OriginalPriceModifiers>; playerDemandModsByPlayer: Record<string, OriginalPriceModifiers>;
}
export interface OriginalCommodityTradeInput {
  commodityId: string; side: 'buy' | 'sell'; quantity: number; submarketKind: 'open' | 'black'; tariffRate: number;
  stockpileUtility: number; demandValue: number; greed: number; utilityOnMarket: number;
  thresholds: OriginalPriceThresholds; marketMod: OriginalPriceModifiers; playerMod: OriginalPriceModifiers;
}
export interface OriginalCommodityQuote {
  commodityId: string; side: 'buy' | 'sell'; quantity: number; gross: number; tariffRate: number; tariff: number;
  creditsDelta: number; averageBeforeTariff: number; pricing: 'native-fixed-resource' | 'native-stockpile-integral';
}
export const ORIGINAL_MARKET_REFERENCE: DeepReadonly<{ schemaVersion: 1; originalReference: string; provenance: { scope: string; sources: Record<string, { sha256: string; scope: string }> }; settings: Record<string, number>; priceVariability: Record<string, number>; commodities: Record<string, OriginalCommoditySpec> }>;
export const ORIGINAL_MARKET_NUMERIC_LIMIT: number;
export function originalMarketCommodity(id: string): DeepReadonly<OriginalCommoditySpec>;
export function validateOriginalPriceModifiers(v: unknown): OriginalPriceModifiers;
export function validateOriginalPriceThresholds(v: unknown): OriginalPriceThresholds;
export function originalMarketPriceIntegral(input: DeepReadonly<{ basePrice: number; demand: number; variability: string; stockpile: number; quantity: number; side: 'buy' | 'sell'; thresholds: OriginalPriceThresholds }>): number;
export function originalTradeStockpileContribution(row: DeepReadonly<OriginalCommodityMarketState>, spec: DeepReadonly<OriginalCommoditySpec>): number;
export function originalMarketStockpileUtility(commodityOrder: readonly string[], commodities: DeepReadonly<Record<string, OriginalCommodityMarketState>>, commodityId: string): number;
export function quoteOriginalCommodityTrade(input: DeepReadonly<OriginalCommodityTradeInput>): DeepReadonly<OriginalCommodityQuote>;

export function originalCommodityTradeGross(input: DeepReadonly<OriginalCommodityTradeInput>): number;
