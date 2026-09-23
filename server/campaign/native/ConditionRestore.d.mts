import type { DeepReadonly } from '../../../src/campaign/Types.js';
import type { OriginalConditionPhaseCapture, OriginalConditionPhaseResult } from '../../../src/campaign/rules/OriginalConditionPhase.mjs';
import type { OriginalIndustryCommodityEntry, OriginalIndustryCommodityPassInput } from '../../../src/campaign/rules/OriginalIndustryCommodityPass.mjs';
import type { NativeSavedMarket, NativeSaveEconomyCapture, NativeConditionCallbackObject, NativeSavedStat } from '../../../scripts/lib/campaign-native-save.mjs';
import type { prepareNativeIndustryStorage } from './IndustryStorage.mjs';
type Pending = {status:'pending';unresolved:string[]};
type PhaseInput = OriginalConditionPhaseCapture & {marketSize:number;conditions:OriginalIndustryCommodityPassInput['conditions'];industries:OriginalIndustryCommodityEntry[]};
export function prepareNativeConditionPhase(market:DeepReadonly<NativeSavedMarket>,storage:ReturnType<typeof prepareNativeIndustryStorage>['markets'][number]):DeepReadonly<Pending | {status:'prepared';input:PhaseInput}>;
export interface NativeConditionRestoreDraft {
 schemaVersion:1; scope:'offline-native-condition-effects-draft-only'; source:NativeSaveEconomyCapture['source'];
 storage:ReturnType<typeof prepareNativeIndustryStorage>;
 marketRoster:string[]; initializedIndustryCount:number; restoredMarketCount:number; pendingConditionMarkets:number;
 markets: ({marketId:string;objectRef:string} & (Pending | {
  status:'conditions-reapplied';result:OriginalConditionPhaseResult;
  callbackObjects:{permanent:NativeConditionCallbackObject[];transient:NativeConditionCallbackObject[]};
  temporaryModifiers:{stability:NativeSavedStat['temporary'];commodityAvailable:{commodityId:string;temporary:NativeSavedStat['temporary']}[];shippingLost:{modId:string;temporary:NativeSavedStat['temporary']}[]};
  unresolved:string[];
 }))[]; readyForAuthority:false;
}
export function restoreNativeConditionDrafts(capture:DeepReadonly<NativeSaveEconomyCapture>):DeepReadonly<NativeConditionRestoreDraft>;

export function projectNativeConditionAttachments(market:DeepReadonly<NativeSavedMarket>, result:DeepReadonly<Pick<OriginalConditionPhaseResult,'state'>>):DeepReadonly<{callbackObjects:{permanent:NativeConditionCallbackObject[];transient:NativeConditionCallbackObject[]};temporaryModifiers:{stability:NativeSavedStat['temporary'];commodityAvailable:{commodityId:string;temporary:NativeSavedStat['temporary']}[];shippingLost:{modId:string;temporary:NativeSavedStat['temporary']}[]}}>;
