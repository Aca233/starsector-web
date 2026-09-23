import type {DeepReadonly} from '../Types.js';
import type {OriginalIndustryCommodityEntry} from './OriginalIndustryCommodityPass.mjs';
import type {OriginalIndustryFinances} from './OriginalMarketFinance.mjs';
import type {OriginalCampaignMemory,OriginalCampaignMemoryServices} from './OriginalCampaignMemory.mjs';
import type {OriginalProductionContext} from './OriginalProductionIndustries.mjs';
export interface OriginalProductionLifecycleRow {objectRef:string;active:boolean;entry:OriginalIndustryCommodityEntry;finances:OriginalIndustryFinances;buildProgress:number;buildTime:number;buildCostOverride:number|null;wasDisrupted:boolean;special:{objectRef:string;id:string;data:string|null}|null;pollution:{daysWithNanoforge:number;permaPollution:boolean;addedPollution:boolean}|null}
export interface OriginalProductionLifecycleState {scope:'native-production-industry-lifecycle';nextObjectId:number;memory:OriginalCampaignMemory|null;disruptions:{key:string;present:boolean;value:unknown;expires:number[]}[]|null;messages:{marketId:string;industryId:string;industryRef:string;kind:'started'|'finished'|'cancelled';cost?:number|null;timestamp:string;clickAction:'COLONY_INFO'}[];industries:OriginalProductionLifecycleRow[]}
export interface OriginalProductionLifecycleMarket {objectRef:string;marketId:string;playerOwned:boolean;conditions:{id:string}[];production:OriginalProductionContext|null;productionLifecycle:OriginalProductionLifecycleState|null;industries:OriginalIndustryCommodityEntry[];finances:OriginalIndustryFinances[]}
export interface OriginalProductionLifecycleRuntime {memoryServices?:OriginalCampaignMemoryServices;timestamp():string;apply(row:OriginalProductionLifecycleRow):unknown;addPollution():void;removePollution():void;buildNextInQueue():unknown}
export function restoreOriginalProductionLifecycle(saved:DeepReadonly<import('../../../scripts/lib/campaign-native-save.mjs').NativeSavedMarket>,market:OriginalProductionLifecycleMarket,shareSpecial?:(special:NonNullable<OriginalProductionLifecycleRow['special']>)=>NonNullable<OriginalProductionLifecycleRow['special']>):OriginalProductionLifecycleState|null;
export function validateOriginalProductionLifecycle(market:OriginalProductionLifecycleMarket):OriginalProductionLifecycleState;
export function bindOriginalProductionMemory(market:OriginalProductionLifecycleMarket,memory:OriginalCampaignMemory):void;
export function syncOriginalProductionDisruption(market:OriginalProductionLifecycleMarket,services?:OriginalCampaignMemoryServices):void;
export function setOriginalProductionDisrupted(market:OriginalProductionLifecycleMarket,industryId:string,days:number,useMax?:boolean,services?:OriginalCampaignMemoryServices):boolean;
export function unapplyOriginalProductionRow(market:OriginalProductionLifecycleMarket,row:OriginalProductionLifecycleRow):void;
export function setOriginalProductionSpecialItem(market:OriginalProductionLifecycleMarket,row:OriginalProductionLifecycleRow,special:OriginalProductionLifecycleRow['special'],runtime:OriginalProductionLifecycleRuntime):void;
export function startOriginalProductionUpgrade(market:OriginalProductionLifecycleMarket,industryId:string):void;
export function cancelOriginalProductionUpgrade(market:OriginalProductionLifecycleMarket,industryId:string):void;
export function advanceOriginalProductionIndustryFrame(market:OriginalProductionLifecycleMarket,row:OriginalProductionLifecycleRow,days:number,runtime:OriginalProductionLifecycleRuntime,options?:{colonyDebug?:boolean}):{scope:'native-production-industry-frame';industryRef:string;finishedRef:string|null};

export function instantiateOriginalProductionIndustry(m:OriginalProductionLifecycleMarket,id:string):OriginalProductionLifecycleRow;
export function addOriginalProductionIndustry(m:OriginalProductionLifecycleMarket,id:string,runtime:OriginalProductionLifecycleRuntime):OriginalProductionLifecycleRow;
export function startBuildingOriginalProductionIndustry(m:OriginalProductionLifecycleMarket,row:OriginalProductionLifecycleRow):void;
