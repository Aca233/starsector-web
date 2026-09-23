import type { CampaignRuleProvider, DeepReadonly, Fleet, Member, ReadonlyWorld } from '../Types.js';
import type { EffectiveMemberLogistics, LogisticsInput } from './OriginalLogistics.mjs';
export interface ResolvedMemberLogistics extends EffectiveMemberLogistics {
  id: string; maxBurn: number; minCrew: number; cargoCapacity: number; fuelCapacity: number; personnelCapacity: number;
  crewFraction: number; assignedCrew: number; repairRatePerDay: number; repairRatePerDayAtFullCrew: number; aiCaptain: boolean;
}
export interface ResolvedFleetLogistics extends LogisticsInput { minimumCrew: number; members: ResolvedMemberLogistics[] }
export function needsOriginalRepairs(condition: DeepReadonly<Member['condition']>): boolean;
export function resolveOriginalFleetStats(fleet: DeepReadonly<Fleet>, members: DeepReadonly<Member[]>, options?: { aiMode?: boolean; world?: ReadonlyWorld; includeRepairCompletion?: boolean }): ResolvedFleetLogistics;
export const originalFleetStatsProvider: CampaignRuleProvider & { methods: { resolve: typeof resolveOriginalFleetStats } };
