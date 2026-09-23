import type { DeepReadonly } from '../Types.js';
import type { OriginalIndustryOperating } from './OriginalResourceIndustries.mjs';
export interface OriginalIndustryRuntimeInput {
    industryId: string; classAlias: string; building: boolean; upgradeId: string | null; improved: boolean | null;
    disruption: { key: string; present: boolean; value: boolean | number | string | null; expires: number[] };
}
export interface OriginalIndustryRuntimeReadback {
    scope: 'native-industry-getters-without-time-advance'; disruptionKey: string;
    operating: OriginalIndustryOperating; improved: boolean; expiresIn: number; disruptedDays: number;
}
export function originalIndustryDisruptionKey(industryId: string): string;
export function readOriginalIndustryRuntime(input: DeepReadonly<OriginalIndustryRuntimeInput>): DeepReadonly<OriginalIndustryRuntimeReadback>;
