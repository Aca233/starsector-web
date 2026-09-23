import type { DeepReadonly } from '../Types.js';
import type { EconomyMutable } from './OriginalMarketEconomy.mjs';
import type { OriginalIndustryOperating, OriginalResourceIndustryModifiers, OriginalResourceItemId } from './OriginalResourceIndustries.mjs';
import type { OriginalMarketStabilityInput, OriginalMarketStabilityResult } from './OriginalMarketStability.mjs';
import type { OriginalProductionItemId } from './OriginalProductionIndustries.mjs';
export interface OriginalIndustryFinances { industryId: string; income: EconomyMutable; upkeep: EconomyMutable }
export interface OriginalIndustryFinanceInput {
  state: OriginalIndustryFinances; marketSize: number; phase: 'industry-apply' | 'income-refresh'; marketIncomeMult: number; marketUpkeepMult: number;
  operating: OriginalIndustryOperating; aiCoreId: OriginalResourceIndustryModifiers['aiCoreId']; specialItemId: OriginalProductionItemId | OriginalResourceItemId | 'dealmaker_holosuite' | 'fullerene_spool' | null; specialContext?: {factionId:string;conditionIds:string[]};
  portInputs: { demand: Record<'fuel' | 'supplies' | 'ships', EconomyMutable>; available: Record<'fuel' | 'supplies' | 'ships', number> } | null;
}
export interface OriginalIndustryFinanceResult { scope: 'industry-financial-effects-only'; state: OriginalIndustryFinances; income: number; upkeep: number; diagnostics: { usedSize: number; sizeMultiplier: number; baseIncome: number; baseUpkeep: number; portDeficit: { commodityId: string | null; deficit: number } | null } }
export const ORIGINAL_MARKET_FINANCE: DeepReadonly<{ schemaVersion: 1; originalReference: string; scope: string; sources: Record<string, { sha256: string }>; settings: Record<string, number>; monthlyReportIds:Record<string,string>; monthlyListenerRules:{enableStipend:boolean;academy:{durationDays:number;stipend:number}}; industries: Record<string, { name: string; className: string; tags: string[]; upgrade: string | null; incomeCSV: number; upkeepCSV: number; income: number; upkeep: number }>; commodities: Record<string, { exportValue: number }> }>;
export function financeFloat(value: number, name: string, min?: number, max?: number): number;
export function financeStat(stat: DeepReadonly<EconomyMutable>): number;
export function nativeInt(value: number): number;
export function newOriginalIndustryFinances(industryId: string): DeepReadonly<OriginalIndustryFinances>;
export function updateOriginalIndustryFinances(input: DeepReadonly<OriginalIndustryFinanceInput>): DeepReadonly<OriginalIndustryFinanceResult>;
export function reapplyOriginalColonyFinancialPass(input: DeepReadonly<{ local: OriginalMarketStabilityInput; industryFinances: OriginalIndustryFinances[] }>): DeepReadonly<{ scope: 'local-colony-financial-effects-only'; localEffects: OriginalMarketStabilityResult; industries: OriginalIndustryFinanceResult[]; industryIncome: number; industryUpkeep: number }>;
export interface OriginalMarketFinanceProjectionInput {
  industries: OriginalIndustryFinances[];
  commodities: { commodityId: string; networkInitialized: boolean; exportIncome: number | null }[];
  shortageCountering: { enabled: boolean; cost: number | null }; immigrationIncentives: { enabled: boolean; cost: number | null };
}
export function summarizeOriginalMarketFinances(input: DeepReadonly<OriginalMarketFinanceProjectionInput>): DeepReadonly<{ scope: 'market-financial-getter-projection-only'; industryIncome: number; industryUpkeep: number; exportIncome: number; grossIncome: number; netIncome: number; costs: { shortageCountering: number; immigrationIncentives: number } }>;
