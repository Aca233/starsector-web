import type { DeepReadonly } from '../Types.js';
import type { OriginalCommoditySpec } from './OriginalMarketPricing.mjs';
export interface OriginalStockingInput { commodityId: string; shippingGlobal: number; available: number; maxSupply: number; maxDemand: number }
export interface OriginalStockpileRefresh { marketId: string; submarketSpecId: string; month: number; stability: number; sinceLastCargoUpdate: number; inventory: Record<string,number>; commodities: OriginalStockingInput[]; illegalCommodityIds: string[] }
export const ORIGINAL_RETAIL_MAX_STACK: 1000000;
export function originalRetailShape(value: unknown, keys: readonly string[], label: string): void;
export function originalRetailFloat(value: number, label: string, maximum?: number): number;
export function originalRetailCommodityInput(input: DeepReadonly<OriginalStockingInput>): DeepReadonly<OriginalCommoditySpec>;
export function originalOpenMarketBaseLimit(input: DeepReadonly<OriginalStockingInput>): number;
export function originalOpenMarketLimit(input: DeepReadonly<OriginalStockingInput>, marketId: string, submarketSpecId: string, month: number, stability: number): number;
export function advanceOriginalRetailTimer(previous: number, ticks: number, ticksPerSecond: number): number;
export function refreshOriginalOpenMarketResources(input: DeepReadonly<OriginalStockpileRefresh>): DeepReadonly<{ inventory: Record<string,number>; sinceLastCargoUpdate: 0; reports: { commodityId: string; before: number; after: number; limit: number; delta: number }[] }>;

export function planOriginalOpenResourceChange(input:{current:number;limit:number;sinceLastCargoUpdate:number;illegal:boolean}):{add:number;remove:number};
