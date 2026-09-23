import type { CargoTransferState } from './CargoTransfer.mjs';
import type { OriginalMarketBasketItem } from '../rules/OriginalMarket.mjs';
export interface MarketTransferState extends CargoTransferState { marketBaseline: Record<string, number> }
export function createMarketTransfer(cargo: Record<string, number> | undefined, inventory: Record<string, number>): MarketTransferState;
export function marketTransferMatches(state: MarketTransferState, cargo: Record<string, number> | undefined, inventory: Record<string, number>): boolean;
export function marketTransferItems(state: MarketTransferState): OriginalMarketBasketItem[] | null;
export function marketTransferPending(state: MarketTransferState): boolean;
export function cancelMarketTransfer(state: MarketTransferState): MarketTransferState;
