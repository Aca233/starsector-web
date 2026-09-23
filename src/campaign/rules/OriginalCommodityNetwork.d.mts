import type { DeepReadonly } from '../Types.js';
import type { EconomyIndustryAmounts, EconomyNetwork, EconomyAvailability, EconomyBonus } from './OriginalMarketEconomy.mjs';
import type { GroupAccessibilityInput, GroupAccessibilityMarket, GroupAccessibilityResult } from './OriginalMarketAccessibility.mjs';
export interface CommodityNetworkMarket extends GroupAccessibilityMarket {
  hidden: boolean; amounts: EconomyIndustryAmounts; availableBeforeCore: number; otherAvailableFlat: number; eventModBeforeCore: number; tradeMod: { both: number; plus: number; minus: number };
}
export interface CommodityNetworkInput extends Omit<GroupAccessibilityInput, 'markets'> { commodityId: string; markets: CommodityNetworkMarket[] }
export function resolveOriginalCommodityNetwork(input: DeepReadonly<CommodityNetworkInput>): DeepReadonly<{
  scope: 'commodity-network-effects-only'; commodityId: string; econGroup: string | null; access: GroupAccessibilityResult;
  exports: { maxExportGlobal: number; maxExportPerFaction: Record<string, number> };
  markets: { marketId: string; accessibility: EconomyBonus; network: EconomyNetwork; availability: EconomyAvailability; availableStatValue: number; available: number; appliedEventMod: number; tradeLevel: number }[];
}>;
