import type {DeepReadonly} from '../Types.js';
import type {EconomyBonus} from './OriginalMarketEconomy.mjs';
import type {OriginalIndustryCommodityEntry} from './OriginalIndustryCommodityPass.mjs';
import type {OriginalIndustryFinances} from './OriginalMarketFinance.mjs';
import type {OriginalMilitaryMarket} from './OriginalMilitaryBases.mjs';
import type {OriginalPatrolState,advanceOriginalMilitaryPatrolAfterBase} from './OriginalMilitaryPatrols.mjs';
export interface OriginalMilitaryLifecycleIndustry {objectRef:string;active:boolean;entry:OriginalIndustryCommodityEntry;finances:OriginalIndustryFinances;patrol:OriginalPatrolState['industries'][number];buildProgress:number;buildTime:number;wasDisrupted:boolean;buildCostOverride:number|null;special:{objectRef:string;id:string;data:string|null}|null}
export interface OriginalMilitaryLifecycleState {scope:'native-military-industry-lifecycle';nextObjectId:number;queue:{objectRef:string;items:{objectRef:string;industryId:string;cost:number}[]};messages:{marketId:string;industryId:string;industryRef:string;kind:'started'|'finished'|'cancelled';cost:number|null;timestamp:string;clickAction:'COLONY_INFO'}[];industries:OriginalMilitaryLifecycleIndustry[]}
export interface OriginalMilitaryLifecycleMarket extends OriginalMilitaryMarket {constructionQueueState?:OriginalMilitaryLifecycleState['queue']|null;marketId:string;objectRef:string;playerOwned:boolean;industryLifecycle:OriginalMilitaryLifecycleState|null;industries:OriginalIndustryCommodityEntry[];finances:OriginalIndustryFinances[];constructionQueue:string[];maxIndustries:EconomyBonus}
export interface OriginalMilitaryLifecycleRuntime {buildNextInQueue?():unknown;randomDouble():number;timestamp():string;apply(industry:OriginalMilitaryLifecycleIndustry):unknown;refundCredits(cost:number):void;advancePatrol(industry:OriginalMilitaryLifecycleIndustry):ReturnType<typeof advanceOriginalMilitaryPatrolAfterBase>}
export const MILITARY_DISRUPTION_KEY:'$core_disrupted_MilitaryBase';
export function restoreOriginalMilitaryLifecycle(saved:DeepReadonly<import('../../../scripts/lib/campaign-native-save.mjs').NativeSavedMarket>,market:OriginalMilitaryLifecycleMarket,patrols:OriginalPatrolState|null,shareSpecial?:(value:NonNullable<OriginalMilitaryLifecycleIndustry['special']>)=>NonNullable<OriginalMilitaryLifecycleIndustry['special']>):OriginalMilitaryLifecycleState|null;
export function validateOriginalMilitaryLifecycle(market:OriginalMilitaryLifecycleMarket,patrols:OriginalPatrolState|null):OriginalMilitaryLifecycleState;
export function syncOriginalMilitaryDisruption(market:OriginalMilitaryLifecycleMarket):boolean;
export function setOriginalMilitaryDisrupted(market:OriginalMilitaryLifecycleMarket,industryId:string,days:number,useMax?:boolean):boolean;
export function startOriginalMilitaryUpgrade(market:OriginalMilitaryLifecycleMarket,industryId:string):void;
export function cancelOriginalMilitaryUpgrade(market:OriginalMilitaryLifecycleMarket,industryId:string):void;
export function buildNextOriginalMilitaryQueue(market:OriginalMilitaryLifecycleMarket,patrols:OriginalPatrolState,runtime:OriginalMilitaryLifecycleRuntime):string|null;
export function advanceOriginalMilitaryIndustry(market:OriginalMilitaryLifecycleMarket,patrols:OriginalPatrolState,industryId:string,days:number,runtime:OriginalMilitaryLifecycleRuntime,options?:{colonyDebug?:boolean}):DeepReadonly<{scope:'military-base-and-patrol-industry-phase';industryRef:string;finishedRef:string|null;patrol:ReturnType<typeof advanceOriginalMilitaryPatrolAfterBase>}>;

export function instantiateOriginalMilitaryIndustry(m:OriginalMilitaryLifecycleMarket,id:string,runtime:OriginalMilitaryLifecycleRuntime):OriginalMilitaryLifecycleIndustry;
export function addOriginalMilitaryIndustry(m:OriginalMilitaryLifecycleMarket,patrols:OriginalPatrolState,id:string,runtime:OriginalMilitaryLifecycleRuntime):OriginalMilitaryLifecycleIndustry;
export function startBuildingOriginalMilitaryIndustry(m:OriginalMilitaryLifecycleMarket,row:OriginalMilitaryLifecycleIndustry):void;
