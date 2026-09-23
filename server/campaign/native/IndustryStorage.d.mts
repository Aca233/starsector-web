import type { OriginalIndustryRuntimeReadback } from '../../../src/campaign/rules/OriginalIndustryRuntime.mjs';
import type { DeepReadonly } from '../../../src/campaign/Types.js';
import type { OriginalIndustryStorageRestoreResult } from '../../../src/campaign/rules/OriginalIndustryRestore.mjs';
import type { NativeSaveEconomyCapture } from '../../../scripts/lib/campaign-native-save.mjs';
export function prepareNativeIndustryStorage(capture: DeepReadonly<NativeSaveEconomyCapture>): DeepReadonly<{
    schemaVersion: 1;
    scope: 'native-economy-industry-storage-draft-only';
    source: NativeSaveEconomyCapture['source'];
    marketRoster: string[];
    markets: { marketId: string; objectRef: string; administratorReadback: import('../../../src/campaign/rules/OriginalAdministrator.mjs').OriginalAdministratorReadback|null; characterIndustryStatsDraft:{administrator:import('../../../src/campaign/rules/OriginalCharacterIndustryStats.mjs').OriginalCharacterIndustryStatsDraft|null;player:import('../../../src/campaign/rules/OriginalCharacterIndustryStats.mjs').OriginalCharacterIndustryStatsDraft|null}|null; governedSkillsDraft: import('../../../src/campaign/rules/OriginalGovernedSkills.mjs').OriginalGovernedSkillsCapture|null; planetReadback: import('../../../src/campaign/rules/OriginalMarketPlanet.mjs').OriginalMarketPlanetReadback|null; portItemContext: import('../../../src/campaign/rules/OriginalPortItems.mjs').OriginalPortItemContext|null; unresolved: string[]; industries: { objectRef: string; industryId: string; storage: OriginalIndustryStorageRestoreResult; improvedGetter: boolean; runtimeReadback: OriginalIndustryRuntimeReadback | null; specialItemCaptured: boolean; specialItem: {objectRef: string; id: string; data: string | null} | null; unresolved: string[] }[] }[];
    initializedIndustryCount: number;
    pendingMarketReapplications: number;
    readyForAuthority: false;
}>;
