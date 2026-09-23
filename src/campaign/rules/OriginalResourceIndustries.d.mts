import type { DeepReadonly } from '../Types.js';
import type { EconomyMutable, EconomyIndustry } from './OriginalMarketEconomy.mjs';
export type OriginalResourceIndustryId = 'farming' | 'aquaculture' | 'mining';
export type OriginalResourceItemId = 'soil_nanites' | 'mantle_bore' | 'plasma_dynamo';
/** Supported industry/item pairing only; no environment reads. Null/unknown/wrong-owner items return false. */
export function isSupportedOriginalResourceItem(industryId: string, itemId: unknown): boolean;
export interface OriginalResourceIndustryState {
  schemaVersion: 1; industryId: OriginalResourceIndustryId;
  supplyBonus: EconomyMutable; demandReduction: EconomyMutable;
  supply: Record<string, EconomyMutable>; demand: Record<string, EconomyMutable>;
}
export interface OriginalIndustryOperating { disrupted: boolean; building: boolean; upgradeId: string | null }
export interface OriginalResourceIndustryModifiers {
  aiCoreId: 'alpha_core' | 'beta_core' | 'gamma_core' | null; improved: boolean;
  adminSupplyBonus: number; adminDemandReduction: number;
  supplyBonusFromOther: EconomyMutable; demandReductionFromOther: EconomyMutable;
  specialItemId: OriginalResourceItemId | null;
}
export interface OriginalResourceIndustryEntry { state: OriginalResourceIndustryState; operating: OriginalIndustryOperating }
export const ORIGINAL_RESOURCE_INDUSTRIES: DeepReadonly<{
  schemaVersion: 1; originalReference: string; scope: string;
  sources: Record<string, { sha256: string }>;
  settings: { SUPPLY_BONUS: number; DEMAND_REDUCTION: number; DEFAULT_IMPROVE_SUPPLY_BONUS: number };
  conditions: Record<string, { commodityId: string; industryId: 'mining' | 'farming'; modifier: number; baseModifier: number; addMarketSize: boolean }>;
}>;
export function validateOriginalResourceIndustry(state: unknown): asserts state is DeepReadonly<OriginalResourceIndustryState>;
export function newOriginalResourceIndustry(industryId: OriginalResourceIndustryId): DeepReadonly<OriginalResourceIndustryState>;
export function applyOriginalResourceDeposit(input: DeepReadonly<{
  conditionId: string; modId: string; marketSize: number; industries: OriginalResourceIndustryEntry[];
}>): DeepReadonly<{ industries: OriginalResourceIndustryEntry[]; targetIndustryId: OriginalResourceIndustryId | null }>;
/** Legacy detached commodity calculation; installed items still require the live callback (specialItemId must be null). */
export function applyOriginalResourceIndustry(input: DeepReadonly<{
  state: OriginalResourceIndustryState; marketSize: number; operating: OriginalIndustryOperating;
  available: { heavy_machinery: number }; modifiers: OriginalResourceIndustryModifiers;
}>): DeepReadonly<OriginalResourceIndustryState>;
export function originalResourceIndustryOutput(state: DeepReadonly<OriginalResourceIndustryState>, context: DeepReadonly<{ commodityId: string; illegal: boolean }>): DeepReadonly<EconomyIndustry>;

/** Current market data, not an economy capture; resource conditions are applied separately. */
export interface OriginalLiveResourceMarket {
  size: number;
  conditions: { id: string }[];
}
export interface OriginalLiveResourceIndustryEntry extends OriginalResourceIndustryEntry {
  modifiers: OriginalResourceIndustryModifiers;
}
export interface OriginalLiveResourceIndustryRuntime {
  /** Must execute synchronously; called after bonus rebuild, before items and new quantities. */
  applyFinances(): object;
  /** Actual BaseIndustry transient registration before item requirements/new demand. */
  registerImmigration(): void;
  /** Actual lazy network getter; called once for heavy_machinery after new demand is written. */
  readCommodityAvailable(commodityId: string): number;
  /** Required only for mantle_bore/plasma_dynamo. null explicitly means no connected planet. */
  readPlanetIsGasGiant?(): boolean | null;
}
/** Mutates entry.state in place; returns a detached frozen snapshot, not the shared instance. */
export function applyOriginalLiveResourceIndustry(
  market: OriginalLiveResourceMarket,
  entry: OriginalLiveResourceIndustryEntry,
  runtime: OriginalLiveResourceIndustryRuntime,
): DeepReadonly<OriginalResourceIndustryState>;
/** Economic unapply only. Does not clear supply/demand or deregister immigration listeners. */
export function unapplyOriginalLiveResourceIndustry(entry: OriginalLiveResourceIndustryEntry): void;
/** Mutates only the old installed item's economic effects; does not install the replacement. */
export function unapplyOriginalResourceItem(state: OriginalResourceIndustryState, specialItemId: OriginalResourceItemId | null): void;