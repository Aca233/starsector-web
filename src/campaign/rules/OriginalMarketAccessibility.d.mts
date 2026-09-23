import type { OriginalPortItemContext } from './OriginalPortItems.mjs';
import type { DeepReadonly } from '../Types.js';
import type { EconomyBonus } from './OriginalMarketEconomy.mjs';
import type { OriginalIndustryOperating, OriginalResourceIndustryModifiers } from './OriginalResourceIndustries.mjs';
export const ORIGINAL_MARKET_ACCESSIBILITY: DeepReadonly<{ schemaVersion: 1; originalReference: string; scope: string; sources: Record<string, { sha256: string }>; settings: Record<string, number>; portSettings: Record<string, number>; freeMarketSettings: Record<string, number>; populationSizeBonus: number[] }>;
export interface AccessibilityIndustry { industryId: string; operating: OriginalIndustryOperating; aiCoreId: OriginalResourceIndustryModifiers['aiCoreId']; improved: boolean; specialItemId: 'corrupted_nanoforge' | 'pristine_nanoforge' | 'synchrotron' | 'catalytic_core' | 'biofactory_embryo' | 'dealmaker_holosuite' | 'fullerene_spool' | null }
export interface LocalAccessibilityInput {
  /** Required exactly when a supported port item is installed; planet null means no PlanetEntity. */
  portItemContext?: OriginalPortItemContext;
  accessibility: EconomyBonus; hasSpaceport: boolean; marketSize: number; firstQueuedIndustryHasSpaceportTag: boolean;
  conditions: { id: string; modId: string; surveyed: boolean; suppressed: boolean }[];
  freeMarketDaysByModId: Record<string, number>; industries: AccessibilityIndustry[];
}
export interface GroupAccessibilityMarket { marketId: string; factionId: string; size: number; location: { x: number; y: number }; accessibility: EconomyBonus }
export interface GroupAccessibilityInput { econGroup: string | null; roster: { marketId: string; econGroup: string | null }[]; markets: GroupAccessibilityMarket[]; hostility: Record<string, Record<string, boolean>> }
export interface GroupAccessibilityResult {
  scope: 'group-core-accessibility-only'; econGroup: string | null; center: { x: number; y: number }; factionWeights: Record<string, number>; hostileWeights: Record<string, number>; totalHostilityWeight: number;
  markets: { marketId: string; accessibility: EconomyBonus; distanceLY: number; base: number; hostilityPenalty: number; before: { value: number; shipping: { global: number; inFaction: number } }; after: { value: number; shipping: { global: number; inFaction: number } } }[];
}
export function originalFreeMarketAccessBonus(daysActive: number): number;
export function reapplyOriginalLocalAccessibility(input: DeepReadonly<LocalAccessibilityInput>): DeepReadonly<{ scope: 'local-accessibility-effects-only'; accessibility: EconomyBonus; hasSpaceport: boolean; value: number }>;
/** Only the industry phase; consumes condition-end accessibility without replaying condition callbacks. */
export function reapplyOriginalIndustryAccessibility(input: DeepReadonly<Omit<LocalAccessibilityInput, 'conditions' | 'freeMarketDaysByModId'>>): DeepReadonly<{ scope: 'industry-accessibility-effects-only'; accessibility: EconomyBonus; hasSpaceport: boolean; value: number }>;
export function computeOriginalGroupAccessibility(input: DeepReadonly<GroupAccessibilityInput>): DeepReadonly<GroupAccessibilityResult>;
