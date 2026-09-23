import type { DeepReadonly } from '../Types.js';
import type { EconomyMutable } from './OriginalMarketEconomy.mjs';
import type { OriginalIndustryCommodityEntry } from './OriginalIndustryCommodityPass.mjs';
import type { OriginalIndustryFinances } from './OriginalMarketFinance.mjs';
export interface OriginalSerializedIndustryStorage {
    industryId: string;
    classAlias: string;
    buildTime: number;
    supplyBonus: EconomyMutable | null;
    demandReduction: EconomyMutable | null;
    supply: Record<string, EconomyMutable> | null;
    demand: Record<string, EconomyMutable> | null;
    income: EconomyMutable | null;
    upkeep: EconomyMutable | null;
}
export interface OriginalIndustryStorageRestoreResult {
    scope: 'native-industry-storage-initialized-only';
    readResolved: Omit<OriginalSerializedIndustryStorage, 'supplyBonus' | 'demandReduction'> & { supplyBonus: EconomyMutable; demandReduction: EconomyMutable };
    state: OriginalIndustryCommodityEntry['state'];
    finances: OriginalIndustryFinances;
    buildTime: number;
    modId: string;
    indexedModIds: string[];
    pending: ['conditions-and-industries-reapply'];
    readyForAuthority: false;
}
export function originalIndustrySavedClass(industryId: string): string;
export function restoreOriginalIndustryStorage(input: DeepReadonly<OriginalSerializedIndustryStorage>): DeepReadonly<OriginalIndustryStorageRestoreResult>;
