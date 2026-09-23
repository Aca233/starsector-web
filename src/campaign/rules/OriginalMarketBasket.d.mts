import type { DeepReadonly } from '../Types.js';
export interface OriginalMarketBasketTotals { buyGross: number; sellGross: number; subtotal: number; tariffRate: number; tariff: number; creditsDelta: number }
export function originalMarketBasketTotals(lines: readonly { side: 'buy' | 'sell'; rawGross: number }[], tariffRate: number): DeepReadonly<OriginalMarketBasketTotals>;
