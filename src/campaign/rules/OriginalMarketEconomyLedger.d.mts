import type { DeepReadonly } from '../Types.js';
import type { OriginalMarketTradeImpact } from './OriginalMarket.mjs';
export interface NativeTradeModifier { key: string; commodityId: string; channel: 'both' | 'plus' | 'minus'; quantity: number; remainingDays: number | null }
export interface NativeTradeLedger { schemaVersion: 1; semantics: 'java-float-fixed-frame-v1'; atTick: number; ticksPerSecond: number; entries: NativeTradeModifier[]; receipts: Record<string, string> }
export function createOriginalMarketTradeLedger(input: DeepReadonly<Pick<NativeTradeLedger, 'atTick' | 'ticksPerSecond' | 'entries'>>): DeepReadonly<NativeTradeLedger>;
export function ingestOriginalMarketTrade(ledger: DeepReadonly<NativeTradeLedger>, fact: DeepReadonly<OriginalMarketTradeImpact>): DeepReadonly<NativeTradeLedger>;
export function advanceOriginalMarketTradeLedger(ledger: DeepReadonly<NativeTradeLedger>, frames: number): DeepReadonly<{ ledger: NativeTradeLedger; expired: { key: string; atTick: number }[]; daysPerFrame: number }>;
export function originalMarketTradeQuantities(ledger: DeepReadonly<NativeTradeLedger>, commodityId: string): DeepReadonly<{ both: number; plus: number; minus: number }>;

/** Read-only validation hook for the integrating provider. */
export function validateOriginalMarketTradeLedger(ledger: unknown): void;
