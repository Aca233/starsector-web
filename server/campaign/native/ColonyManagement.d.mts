import type {NativeLiveEconomyDraft} from './NativeCampaignRuntime.mjs';

export interface NativeColonyBlocker {marketId:string|null;field:string;code:string}
export interface NativeColonyAdministrator {personId:string|null;name:string|null;portrait:string|null;aiCoreId:string|null;isPlayer:boolean|null}
export interface NativeColonyFinances {
 /** Current native monthly estimates, not the settled report or player cash balance. */
 industryIncome:number|null;exportIncome:number|null;grossIncome:number|null;
 industryUpkeep:number|null;shortageCost:number|null;incentiveCost:number|null;totalExpenses:number|null;netIncome:number|null;
}
export interface NativeColonyConstruction {progressDays:number;totalDays:number;remainingDays:number;fraction:number}
export interface NativeColonyIndustry {
 industryId:string;objectRef:string|null;index:number;
 /** Original CSV spec labels, not an evaluation of every plugin's current-image/name overrides. */
 title:string|null;icon:string|null;
 building:boolean|null;disrupted:boolean|null;upgradeId:string|null;
 construction:NativeColonyConstruction|null;buildCost:number|null;
 income:number|null;upkeep:number|null;
}
export interface NativeColonyQueueItem {
 objectRef:string|null;industryId:string;index:number;title:string|null;icon:string|null;cost:number|null;buildTimeDays:number|null;
 canCancel:boolean;canSwap:boolean;mutationBlocker:string|null;cancelBlocker:string|null;swapBlocker:string|null;
}
export interface NativeColonyMarketRow {
 marketId:string;objectRef:string|null;name:string|null;factionId:string|null;size:number|null;stability:number|null;
 /** Original modified hazard multiplier (1.5 = 150%), not a made-up environment score. */
 hazard:number|null;
 location:{hyperspace:{x:number;y:number}|null;systemName:string|null;planetType:string|null};
 administrator:NativeColonyAdministrator|null;tech:null;finances:NativeColonyFinances;
 industries:readonly NativeColonyIndustry[]|null;queue:readonly NativeColonyQueueItem[]|null;
 /** Host authorization/finance context only. Never implies a specific industry is available. */
 mutationBlocker:string|null;
 buildOptions:null;buildOptionsBlocker:string;
 blockers:readonly NativeColonyBlocker[];
}
export interface NativeColonyManagementView {schemaVersion:1;scope:'native-colony-management';rows:readonly NativeColonyMarketRow[];blockers:readonly NativeColonyBlocker[]}
/** Queued items only. The host revalidates ownership, payment context and live item identity on every command. */
export type NativeColonyAction=
 | {kind:'cancel-construction';marketId:string;industryId:string}
 | {kind:'swap-construction';marketId:string;industryId:string;otherIndustryId:string};
export interface NativeColonyManagementOptions {
 /** Explicit trusted server-owned binding list; never derived from faction or playerOwned. */
 marketIds:readonly string[];
 /** Pure synchronous host gate. null=authorized context; string=exact blocker code. */
 canConstruct?:(marketId:string)=>string|null;
}
export function projectNativeColonyManagement(runtime:Pick<NativeLiveEconomyDraft,'market'|'peekCommodityData'|'playerEconomyState'|'playerExportModifiers'>,options:NativeColonyManagementOptions):NativeColonyManagementView;
