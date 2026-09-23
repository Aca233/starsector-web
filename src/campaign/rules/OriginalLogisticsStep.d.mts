import type { DeepReadonly, Fleet, Member } from '../Types.js';
import type { resolveOriginalFleetStats } from './OriginalFleetStats.mjs';
export const LOGISTICS_TICKS_PER_SECOND: 60;
export const LOGISTICS_MAX_TICKS: 600;
export interface FleetAdvanceInput {
  fleet: DeepReadonly<Fleet>; members: DeepReadonly<Member[]>; ticks: number; aiMode: boolean;
  motion: { inHyperspace: boolean; speed: number; hyperFuelMultiplier: number; normalFuelMultiplier: number; hiddenFuelMultiplier: number };
}
export interface FleetAdvanceResult {
  fleet: Fleet; members: Member[]; suppliesConsumed: number; fuelConsumed: number; elapsedGameSeconds: number;
  memberReports: Record<string, { shortageCRLoss: number; losingCR: boolean; repairsCompleted: boolean }>;
}
export function advanceOriginalFleet(input: FleetAdvanceInput, resolveStats?: typeof resolveOriginalFleetStats): FleetAdvanceResult;
