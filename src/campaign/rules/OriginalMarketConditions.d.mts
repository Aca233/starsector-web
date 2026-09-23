import type { DeepReadonly } from '../Types.js';
/** All callbacks must be synchronous, operate on the same transactional draft and preserve live condition identity. */
export interface OriginalConditionRuntime<Condition> {
    listConditions(): readonly Condition[];
    getSpecificCondition(modId: string): Condition | null;
    getConditionId(condition: Condition): string;
    getModId(condition: Condition): string;
    isSurveyed(condition: Condition): boolean;
    isSuppressed(conditionId: string): boolean;
    apply(condition: Condition, modId: string): undefined;
    unapply(condition: Condition, modId: string): undefined;
}
export function reapplyOriginalMarketConditions<Condition>(runtime: OriginalConditionRuntime<Condition>, specificModId?: string | null): DeepReadonly<{
    scope: 'native-ordered-condition-callbacks-only';
    visited: number;
    applied: number;
}>;
