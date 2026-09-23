import type { CampaignRuleProvider, ReadonlyWorld, DeepReadonly, Fleet } from '../Types.js';
import type { resolveOriginalFleetStats } from './OriginalFleetStats.mjs';
export interface CargoQuickRequest { side: 'hold' | 'discard'; id: string; quantity: number }
export function quoteOriginalQuickTransfer(world: ReadonlyWorld, fleet: DeepReadonly<Fleet>, request: CargoQuickRequest, resolveStats: typeof resolveOriginalFleetStats): number;
export const originalCargoGesturesProvider: CampaignRuleProvider & { methods: { quoteQuickTransfer: typeof quoteOriginalQuickTransfer } };
