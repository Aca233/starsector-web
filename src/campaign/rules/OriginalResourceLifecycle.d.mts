import type { DeepReadonly } from '../Types.js';
import type { NativeSavedMarket } from '../../../scripts/lib/campaign-native-save.mjs';
import type { OriginalIndustryCommodityEntry } from './OriginalIndustryCommodityPass.mjs';
import type { OriginalIndustryFinances } from './OriginalMarketFinance.mjs';
import type { OriginalCampaignMemory, OriginalCampaignMemoryServices } from './OriginalCampaignMemory.mjs';
import type { OriginalLiveResourceIndustryEntry, OriginalResourceIndustryId, OriginalResourceItemId } from './OriginalResourceIndustries.mjs';

export interface OriginalResourceSpecialItem { objectRef: string; id: OriginalResourceItemId; data: string | null }
export interface OriginalResourceLifecycleRow {
  objectRef: string; active: boolean;
  entry: OriginalLiveResourceIndustryEntry;
  finances: OriginalIndustryFinances;
  buildProgress: number; buildTime: number; buildCostOverride: number | null; wasDisrupted: boolean;
  special: OriginalResourceSpecialItem | null;
  /** Native historical boolean for Mining; null for Farming, never inferred from special. */
  shownPlasmaNetVisuals: boolean | null;
}
export interface OriginalResourceLifecycleState {
  scope: 'native-resource-industry-lifecycle'; nextObjectId: number;
  memory: OriginalCampaignMemory | null;
  disruptions: { key: string; present: boolean; value: unknown; expires: number[] }[] | null;
  messages: { marketId: string; industryId: string; industryRef: string; kind: 'started' | 'finished' | 'cancelled'; cost?: number | null; timestamp: string; clickAction: 'COLONY_INFO' }[];
  industries: OriginalResourceLifecycleRow[];
}
export interface OriginalResourceLifecycleMarket {
  objectRef: string; marketId: string; playerOwned: boolean;
  conditions: { id: string }[];
  resourceLifecycle: OriginalResourceLifecycleState | null;
  industries: OriginalIndustryCommodityEntry[];
  finances: OriginalIndustryFinances[];
}
export interface OriginalResourceAvailabilityServices {
  /** Required for farming/aquaculture after the BaseIndustry gate succeeds. null = no planet. */
  readPlanetType?(): string | null;
}
export interface OriginalResourceVisualServices {
  /** Returns the actual current planet instance, not its spec snapshot. null = no planet. */
  readPlanet?(): object | null;
  /** Must change shieldTexture2/thickness2/color2 and perform native applySpecChanges, synchronously. */
  setMiningPlasmaVisuals?(planet: object, enabled: boolean, row: OriginalResourceLifecycleRow): void;
}
export interface OriginalResourceLifecycleRuntime extends OriginalResourceVisualServices {
  memoryServices?: OriginalCampaignMemoryServices;
  timestamp(): string;
  /** Full synchronous apply, including current admin/finance/lazy availability and transient registration. */
  apply(row: OriginalResourceLifecycleRow): unknown;
  /** Remove this exact instance's native transient immigration registration. Must be synchronous. */
  unregisterImmigration(row: OriginalResourceLifecycleRow): void;
  /** Execute the real shared queue, with native eligibility/count/refund behavior; no shadow queue. */
  buildNextInQueue(): unknown;
  /** Required for non-upgrade LOCAL/REMOTE removal with a core/item; execute actual cargo returns. */
  notifyBeingRemoved?(row: OriginalResourceLifecycleRow, mode: 'LOCAL' | 'REMOTE', forUpgrade: boolean): void;
}
export function hasOriginalResourceFrame(id: string): id is OriginalResourceIndustryId;
/** Does not assign market.resourceLifecycle. Older incomplete captures return null; conflicts throw. */
export function restoreOriginalResourceLifecycle(
  saved: DeepReadonly<NativeSavedMarket>, market: OriginalResourceLifecycleMarket,
  shareSpecial?: (special: OriginalResourceSpecialItem) => OriginalResourceSpecialItem,
): OriginalResourceLifecycleState | null;
export function validateOriginalResourceLifecycle(market: OriginalResourceLifecycleMarket): OriginalResourceLifecycleState;
export function bindOriginalResourceMemory(market: OriginalResourceLifecycleMarket, memory: OriginalCampaignMemory): void;
export function syncOriginalResourceDisruption(market: OriginalResourceLifecycleMarket, services?: OriginalCampaignMemoryServices): void;
export function setOriginalResourceDisrupted(market: OriginalResourceLifecycleMarket, id: OriginalResourceIndustryId, days: number, useMax?: boolean, services?: OriginalCampaignMemoryServices): boolean;
/** isAvailableToBuild only, not queue count limits, credits, duplicate filtering or user-command permissions. */
export function isOriginalResourceIndustryAvailableToBuild(
  market: Pick<OriginalResourceLifecycleMarket, 'industries' | 'conditions'> & { tags: string[] },
  id: OriginalResourceIndustryId, services?: OriginalResourceAvailabilityServices,
): boolean;
/** Detached instance: no apply or registry insertion; default field values, not a migrated capture. */
export function instantiateOriginalResourceIndustry(market: OriginalResourceLifecycleMarket, id: OriginalResourceIndustryId): OriginalResourceLifecycleRow;
/** Market.addIndustry: register first, then actual apply. Does not impose an isAvailableToBuild gate. */
export function addOriginalResourceIndustry(market: OriginalResourceLifecycleMarket, id: OriginalResourceIndustryId, runtime: OriginalResourceLifecycleRuntime): OriginalResourceLifecycleRow;
export function unapplyOriginalResourceRow(market: OriginalResourceLifecycleMarket, row: OriginalResourceLifecycleRow, runtime: Pick<OriginalResourceLifecycleRuntime, 'unregisterImmigration'>): void;
export function startBuildingOriginalResourceIndustry(market: OriginalResourceLifecycleMarket, row: OriginalResourceLifecycleRow, runtime: Pick<OriginalResourceLifecycleRuntime, 'unregisterImmigration'>): void;
/** Base setter + Mining visuals. Caller owns cargo transfer and installation eligibility. */
export function setOriginalResourceSpecialItem(market: OriginalResourceLifecycleMarket, row: OriginalResourceLifecycleRow, special: OriginalResourceSpecialItem | null, runtime?: OriginalResourceVisualServices): void;
export function removeOriginalResourceIndustry(
  market: OriginalResourceLifecycleMarket, id: OriginalResourceIndustryId,
  runtime: Pick<OriginalResourceLifecycleRuntime, 'unregisterImmigration' | 'notifyBeingRemoved'>,
  options?: { mode?: 'LOCAL' | 'REMOTE' | null; forUpgrade?: boolean },
): OriginalResourceLifecycleRow;
/** Calls default Base.advance only; days are already clock-converted native float days. */
export function advanceOriginalResourceIndustryFrame(
  market: OriginalResourceLifecycleMarket, row: OriginalResourceLifecycleRow, days: number,
  runtime: OriginalResourceLifecycleRuntime, options?: { colonyDebug?: boolean },
): { scope: 'native-resource-industry-frame'; industryRef: string; finishedRef: string | null };
