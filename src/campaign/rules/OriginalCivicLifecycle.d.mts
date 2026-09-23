import type {DeepReadonly} from '../Types.js';
import type {OriginalIndustryCommodityEntry} from './OriginalIndustryCommodityPass.mjs';
import type {OriginalIndustryFinances} from './OriginalMarketFinance.mjs';
import type {OriginalCampaignMemory,OriginalCampaignMemoryServices} from './OriginalCampaignMemory.mjs';
import type {OriginalCivicEffectsMarket,OriginalCivicEffectsResult} from './OriginalCivicIndustryEffects.mjs';
/** Ordinary population is supported only with special=null; buildTime may be 0 after startBuilding or cancellation (native spec). */
export interface OriginalCivicLifecycleRow {objectRef:string;active:boolean;entry:OriginalIndustryCommodityEntry;finances:OriginalIndustryFinances;buildProgress:number;buildTime:number;buildCostOverride:number|null;wasDisrupted:boolean;special:{objectRef:string;id:string;data:string|null}|null}
export interface OriginalCivicLifecycleState {scope:'native-civic-industry-lifecycle';nextObjectId:number;memory:OriginalCampaignMemory|null;disruptions:{key:string;present:boolean;value:unknown;expires:number[]}[]|null;messages:{marketId:string;industryId:string;industryRef:string;kind:'started'|'finished'|'cancelled';cost?:number|null;timestamp:string;clickAction:'COLONY_INFO'}[];industries:OriginalCivicLifecycleRow[]}
export interface OriginalCivicLifecycleMarket extends OriginalCivicEffectsMarket {objectRef:string;marketId:string;playerOwned:boolean;civicLifecycle:OriginalCivicLifecycleState|null;industries:OriginalIndustryCommodityEntry[];finances:OriginalIndustryFinances[]}
/** apply must bind OriginalCivicIndustryEffectsRuntime.population when the row is population. */
export interface OriginalCivicLifecycleRuntime {memoryServices?:OriginalCampaignMemoryServices;timestamp():string;apply(row:OriginalCivicLifecycleRow):OriginalCivicEffectsResult;buildNextInQueue():unknown}
/** Rejects captured population special items/lamp before sharing their object identities. */
export function restoreOriginalCivicLifecycle(saved:DeepReadonly<import('../../../scripts/lib/campaign-native-save.mjs').NativeSavedMarket>,m:OriginalCivicLifecycleMarket,share?:(special:NonNullable<OriginalCivicLifecycleRow['special']>)=>NonNullable<OriginalCivicLifecycleRow['special']>):OriginalCivicLifecycleState|null;
export function validateOriginalCivicLifecycle(m:OriginalCivicLifecycleMarket):OriginalCivicLifecycleState;
export function bindOriginalCivicMemory(m:OriginalCivicLifecycleMarket,mem:OriginalCampaignMemory):void;
export function syncOriginalCivicDisruption(m:OriginalCivicLifecycleMarket,services?:OriginalCampaignMemoryServices):void;
export function setOriginalCivicDisrupted(m:OriginalCivicLifecycleMarket,id:string,days:number,useMax?:boolean,services?:OriginalCampaignMemoryServices):boolean;
export function instantiateOriginalCivicIndustry(m:OriginalCivicLifecycleMarket,id:string):OriginalCivicLifecycleRow;
export function addOriginalCivicIndustry(m:OriginalCivicLifecycleMarket,id:string,runtime:OriginalCivicLifecycleRuntime):OriginalCivicLifecycleRow;
/** Calls native unapply; retains population's literal zero-day buildTime instead of clamping it. */
export function startBuildingOriginalCivicIndustry(m:OriginalCivicLifecycleMarket,row:OriginalCivicLifecycleRow):void;
export function startOriginalCivicUpgrade(m:OriginalCivicLifecycleMarket,id:string):void;
export function cancelOriginalCivicUpgrade(m:OriginalCivicLifecycleMarket,id:string):void;
/** Population accepts null->null only; unsupported lamp effects cannot be installed or silently removed. */
export function setOriginalCivicSpecialItem(m:OriginalCivicLifecycleMarket,row:OriginalCivicLifecycleRow,special:OriginalCivicLifecycleRow['special']):void;
export function advanceOriginalCivicIndustryFrame(m:OriginalCivicLifecycleMarket,row:OriginalCivicLifecycleRow,days:number,runtime:OriginalCivicLifecycleRuntime,options?:{colonyDebug?:boolean}):{scope:'native-civic-industry-frame';industryRef:string;finishedRef:string|null};
