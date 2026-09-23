import type { LogisticsInput } from './OriginalLogistics.mjs';
import type { CampaignRuleProvider, CampaignEvent, DeepReadonly, Fleet, Member, ReadonlyWorld } from '../Types.js';
import type { resolveOriginalFleetStats } from './OriginalFleetStats.mjs';
import type { FleetAdvanceInput } from './OriginalLogisticsStep.mjs';
export interface TravelStats { minBurn: number; burnLevel: number; maxSpeed: number; acceleration: number }
export interface TravelDescription { world: ReadonlyWorld; members: DeepReadonly<Member[]>; stats: TravelStats | null; motion: FleetAdvanceInput['motion'] }
export function resolveOriginalTravelStats(fleet: DeepReadonly<Fleet>, members: readonly { readonly id: string; readonly maxBurn: number }[], cargo: LogisticsInput['cargo']): TravelStats;
export interface TravelMethods {
  describe(world: ReadonlyWorld, fleet: DeepReadonly<Fleet>, members: DeepReadonly<Member[]>, resolveStats: typeof resolveOriginalFleetStats): TravelDescription;
  advance(fleet: DeepReadonly<Fleet>, description: TravelDescription, seconds: number): { fleet: DeepReadonly<Fleet>; events: CampaignEvent[] };
}
export const originalTravelProvider: CampaignRuleProvider & { methods: TravelMethods };
