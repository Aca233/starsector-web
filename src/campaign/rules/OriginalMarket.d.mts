import type { CampaignRuleProvider, DeepReadonly, EntityExpectation, Principal, ReadonlyWorld } from '../Types.js';
import type { OriginalCommodityMarketState, OriginalCommodityQuote, OriginalPriceModifiers } from './OriginalMarketPricing.mjs';
export { quoteOriginalCommodityTrade, ORIGINAL_MARKET_REFERENCE } from './OriginalMarketPricing.mjs';
export interface OriginalMarketTradePayload { marketId: string; submarketId: string; fleetId: string; accountId: string; commodityId: string; quantity: number }
export interface OriginalMarketTradeRequest extends OriginalMarketTradePayload { side: 'buy' | 'sell' }
export interface OriginalMarketTradeImpact { lineId?: string; requestId: string; playerId: string; submarketId: string; commodityId: string; channel: 'plus'; quantity: number; createdTick: number; expiresAtGameSeconds: number }
export interface OriginalMarketState {
  id: string; version: number; schemaVersion: 1;
  data: { marketId: string; anchorEntityId: string; asOfTick: number; coverage: 'resolved-native-trade-v1'; tariffRate: number;
    admissionByPlayer: Record<string, 'OPEN' | 'SNEAK' | 'NONE'>; illegalCommodityIds: string[];
    commodityOrder: string[]; commodities: Record<string, OriginalCommodityMarketState>;
    marketSupplyMod: OriginalPriceModifiers; marketDemandMod: OriginalPriceModifiers;
    submarkets: Record<string, { plugin: 'open' | 'black'; inventory: Record<string, number> }>;
    tradeImpacts: OriginalMarketTradeImpact[]; };
}
export interface OriginalMarketTradeQuote extends OriginalCommodityQuote {
  marketId: string; submarketId: string; fleetId: string; accountId: string; asOfTick: number; expected: EntityExpectation[];
  available: number; distance: number; contactDistance: number; canAfford: boolean; executable: boolean;
  unavailableReason: 'BLACK_MARKET_CONSEQUENCES_UNIMPLEMENTED' | 'EXOTIC_TRADE_UNIMPLEMENTED' | 'UNSUPPORTED_LOGISTICS_COMMODITY' | 'INSUFFICIENT_CREDITS' | null;
}
export function validateOriginalMarketWorld(world: ReadonlyWorld): void;
export function originalMarketStateId(marketId: string): string;
export function validateOriginalMarketState(world: ReadonlyWorld, marketId: string): DeepReadonly<OriginalMarketState>;
export function quoteOriginalMarketTrade(world: ReadonlyWorld, actor: DeepReadonly<Principal>, input: DeepReadonly<OriginalMarketTradeRequest>): DeepReadonly<OriginalMarketTradeQuote>;
export const originalMarketProvider: CampaignRuleProvider & { methods: { ports: typeof listOriginalMarketPorts; browse: typeof browseOriginalMarket; quoteBasket: typeof quoteOriginalMarketBasket; quote: typeof quoteOriginalMarketTrade; validateState: typeof validateOriginalMarketState; validateWorld: typeof validateOriginalMarketWorld } };

export interface OriginalMarketBasketItem { commodityId: string; side: 'buy' | 'sell'; quantity: number }
export interface OriginalMarketBasketRequest { marketId: string; submarketId: string; fleetId: string; accountId: string; items: OriginalMarketBasketItem[] }
export interface OriginalMarketBasketQuote extends Omit<OriginalMarketTradeQuote, 'commodityId' | 'side' | 'quantity' | 'gross' | 'averageBeforeTariff' | 'pricing' | 'available'> {
  items: (OriginalMarketBasketItem & { rawGross: number; available: number })[];
  buyGross: number; sellGross: number; subtotal: number;
}
export function quoteOriginalMarketBasket(world: ReadonlyWorld, actor: DeepReadonly<Principal>, input: DeepReadonly<OriginalMarketBasketRequest>): DeepReadonly<OriginalMarketBasketQuote>;

export interface OriginalMarketVisitRequest { marketId: string; fleetId: string }
export interface OriginalMarketVisit {
  worldId: string; revision: number; marketId: string; name: string; anchorEntityId: string; asOfTick: number;
  expected: EntityExpectation[];
  fleetId: string; fleetVersion: number; memberVersions: { id: string; version: number }[];
  accounts: { id: string; version: number; balance: number }[];
  submarkets: { id: string; plugin: 'open' | 'black'; inventory: Record<string, number>; tariffRate: number;
    unavailableReason: string | null; commodities: { id: string; unavailableReason: string | null }[] }[];
  distance: number; contactDistance: number;
}
export function browseOriginalMarket(world: ReadonlyWorld, actor: DeepReadonly<Principal>, input: DeepReadonly<OriginalMarketVisitRequest>): DeepReadonly<OriginalMarketVisit>;
export interface OriginalMarketPort { marketId: string; anchorEntityId: string; anchorVersion: number; name: string; locationId: string; position: [number, number] }
export function listOriginalMarketPorts(world: ReadonlyWorld, actor: DeepReadonly<Principal>): DeepReadonly<OriginalMarketPort[]>;
