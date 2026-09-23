import type { DeepReadonly } from '../Types.js';
import type { EconomyMutable, EconomyBonus } from './OriginalMarketEconomy.mjs';
import type { OriginalCommodityFinanceInput, OriginalCommodityFinanceResult } from './OriginalCommodityFinance.mjs';
export interface OriginalCachedCommodityIncomeInputs { incomeMult: EconomyMutable; playerOwned: boolean; playerCommodityExportMult: number | null }
export interface OriginalCommodityCacheEntry { scope: 'native-commodity-cache-object'; serial: number; data: OriginalCommodityFinanceResult }
/** Market handles identify the same market object for this cache lifetime; never recycle one for a replacement object. */
export interface OriginalCommodityCacheRuntime {
  capture(commodityId: string, econGroup: string | null): DeepReadonly<OriginalCommodityFinanceInput>;
  /** Apply to the same transaction draft; links already exist when called. No independent commits. */
  apply(input: DeepReadonly<OriginalCommodityFinanceInput>, entry: DeepReadonly<OriginalCommodityCacheEntry>): void;
  /** Native primary constructor copies demand/legality to every same-class variant, without binding its network reference. */
  setDemandFromPrimary(marketId: string, variantId: string, maxDemand: number, demandLegal: boolean): void;
  getEconGroup(marketId: string): string | null;
  getIncomeInputs(marketId: string, commodityId: string): DeepReadonly<OriginalCachedCommodityIncomeInputs>;
  getAccessibility(marketId: string): DeepReadonly<EconomyBonus>;
}
export function originalCachedCommodityExportIncome(input: DeepReadonly<OriginalCachedCommodityIncomeInputs & { sourceIsIllegal: boolean; exportMarketShare: number; marketValue: number }>): number;
export interface OriginalCommodityCacheCheckpoint {scope:'web-commodity-cache-checkpoint';schemaVersion:1;serial:number;entries:OriginalCommodityCacheEntry[];bindings:[string,string,number][]}
export class OriginalCommodityNetworkCache {
  static fromCheckpoint(runtime:OriginalCommodityCacheRuntime,checkpoint:unknown):OriginalCommodityNetworkCache;
  checkpoint():DeepReadonly<OriginalCommodityCacheCheckpoint>;
  constructor(runtime: OriginalCommodityCacheRuntime);
  peek(marketId: string, commodityId: string): DeepReadonly<OriginalCommodityCacheEntry> | null;
  get(marketId: string, commodityId: string): DeepReadonly<OriginalCommodityCacheEntry>;
  rebuild(commodityId: string, econGroup: string | null): DeepReadonly<OriginalCommodityCacheEntry>;
  getExportIncome(marketId: string, commodityId: string): number;
  getShipping(marketId: string): DeepReadonly<{ global: number; inFaction: number }>;
}
