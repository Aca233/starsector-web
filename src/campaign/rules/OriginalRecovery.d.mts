import type { DeepReadonly, MemberCondition } from '../Types.js';
import type { ResolvedMemberLogistics } from './OriginalFleetStats.mjs';
export interface RecoveryResult {
  condition: MemberCondition; losingCR: boolean; shortageCRLoss: number; repairsCompleted: boolean;
}
export function advanceOriginalRecovery(condition: DeepReadonly<MemberCondition>, stats: DeepReadonly<ResolvedMemberLogistics>, days: number, hasSupplies: boolean): RecoveryResult;
