import type { DeepReadonly } from '../Types.js';
import type { EconomyMutable, EconomyBonus, EconomyIcons, EconomyPricePass } from './OriginalMarketEconomy.mjs';
import type { OriginalPriceThresholds } from './OriginalMarketPricing.mjs';
export interface OriginalClassPriceCommodity {
  commodityId: string;
  /** Current cached maxima, including a variant's inherited demand before its own constructor. */
  maxSupply: number; maxDemand: number; available: number;
  /** Native float subtraction: current available-stat value minus captured eMod (not recomputing without its modifier). */
  availableWithoutTrade: number;
  shippingGlobal: number; shippingFaction: number;
  /** Only a primary reads its cached network during this price pass. */
  maxExportGlobal: number | null;
  stockpile: number; tradeMod: { both: number; plus: number; minus: number };
  greedStat: EconomyMutable;
  playerModifiers: Record<string, { supply: EconomyBonus; demand: EconomyBonus }>;
}
export interface OriginalClassPricingInput {
  marketId: string; triggerCommodityId: string; month: number; phase: EconomyPricePass['phase'];
  coverage: 'complete-demand-class';
  /** ONE shared MarketDemand mutable stat for every member of this class. */
  demandStat: EconomyMutable;
  /** Complete current instantiated list in native order, not necessarily the full catalogue. */
  commodities: OriginalClassPriceCommodity[];
}
export interface OriginalClassPriceCalculator extends OriginalPriceThresholds { basePrice: number; variability: string; demand: number }
export interface OriginalClassPricingResult {
  scope: 'native-demand-class-stockpile-and-price-effects-only';
  marketId: string; triggerCommodityId: string; demandClass: string; month: number; phase: EconomyPricePass['phase'];
  demandStat: EconomyMutable; demandValue: number;
  commodities: (OriginalClassPriceCommodity & { demandPrice: OriginalClassPriceCalculator; supplyPrice: OriginalClassPriceCalculator; diagnostics: { icons: EconomyIcons; tradeLevel: number } })[];
  diagnostics: { noDemand: boolean; rawDemand: number; random: { seed: number; demandRoll: number; stockpileRoll: number; drawsConsumed: number } };
}
export function updateOriginalCommodityClassPrices(input: DeepReadonly<OriginalClassPricingInput>): DeepReadonly<OriginalClassPricingResult>;

/** Trusted synchronous runtime getter; writes intermediate stats before constructing the primary network, then returns fresh ordered rows. */
export interface OriginalClassPricingRuntime {
 readAfterPrimaryNetwork(state:DeepReadonly<Pick<OriginalClassPricingInput,'demandStat'|'commodities'>>):DeepReadonly<OriginalClassPriceCommodity[]>;
}
export function updateOriginalCommodityClassPricesWithRuntime(input:DeepReadonly<OriginalClassPricingInput>,runtime:OriginalClassPricingRuntime):DeepReadonly<OriginalClassPricingResult>;
export function createOriginalCommodityPriceCalculators(input:DeepReadonly<{commodityId:string;demandStat:EconomyMutable;greedStat:EconomyMutable;fromSaved:boolean}>):DeepReadonly<{demandPrice:OriginalClassPriceCalculator;supplyPrice:OriginalClassPriceCalculator}>;
