import type { DeepReadonly } from '../../../src/campaign/Types.js';
import type { OriginalIndustryCommodityPassInput, reapplyOriginalIndustryCommodityPass } from '../../../src/campaign/rules/OriginalIndustryCommodityPass.mjs';
import type { NativeSavedMarket, NativeSaveEconomyCapture } from '../../../scripts/lib/campaign-native-save.mjs';
import type { prepareNativeIndustryStorage } from './IndustryStorage.mjs';
import type { projectNativeConditionAttachments } from './ConditionRestore.mjs';
type Pending = {status:'pending';unresolved:string[]};
export function prepareNativeIndustryCommodityPass(market:DeepReadonly<NativeSavedMarket>,storage:ReturnType<typeof prepareNativeIndustryStorage>['markets'][number]):DeepReadonly<Pending|{status:'prepared';input:OriginalIndustryCommodityPassInput;deferredCommodityIds:string[]}>;
export interface NativeIndustryCommodityRestoreDraft {
 schemaVersion:1;scope:'offline-native-industry-commodity-effects-draft-only';source:NativeSaveEconomyCapture['source'];storage:ReturnType<typeof prepareNativeIndustryStorage>;
 marketRoster:string[];initializedIndustryCount:number;restoredMarketCount:number;reappliedIndustryCount:number;pendingCommodityMarkets:number;
 markets:({marketId:string;objectRef:string}&(Pending|{status:'commodity-industries-reapplied';effects:Omit<ReturnType<typeof reapplyOriginalIndustryCommodityPass>,'commodities'>;conditionAttachments:ReturnType<typeof projectNativeConditionAttachments>;nextCommodityMaxima:ReturnType<typeof reapplyOriginalIndustryCommodityPass>['commodities'];deferredCommodityIds:string[];unresolved:string[]}))[];
 readyForAuthority:false;
}
export function restoreNativeIndustryCommodityDrafts(capture:DeepReadonly<NativeSaveEconomyCapture>):DeepReadonly<NativeIndustryCommodityRestoreDraft>;
