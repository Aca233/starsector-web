import type { DeepReadonly } from '../Types.js';
import type { CommodityNetworkInput, resolveOriginalCommodityNetwork } from './OriginalCommodityNetwork.mjs';
import type { EconomyMutable } from './OriginalMarketEconomy.mjs';
export interface CommodityFinancialMarket { marketId: string; playerOwned: boolean; incomeMult: EconomyMutable; playerCommodityExportMult: number | null }
export interface OriginalCommodityFinanceInput { network: CommodityNetworkInput; financialMarkets: CommodityFinancialMarket[] }
export interface OriginalCommodityFinanceResult {
  scope: 'original-single-player-commodity-financial-effects-only'; network: ReturnType<typeof resolveOriginalCommodityNetwork>;
  rawMarketValue: number; marketValue: number; marketValuePerFaction: Record<string, number>; totalWeight: number;
  markets: { marketId: string; factionId: string; exportedBeforeCore: number; weight: number; demandValue: number; exportMarketShare: number; marketValueFraction: number; sourceIsIllegal: boolean; exportSharePercent: number; marketValuePercent: number; exportIncome: number }[];
  /** Native largest-remainder sorting order, not a descending share ranking. */
  sortedProducers: string[]; sortedConsumers: string[];
}
export function resolveOriginalCommodityFinance(input: DeepReadonly<OriginalCommodityFinanceInput>): DeepReadonly<OriginalCommodityFinanceResult>;
