import type {EconomyBonus} from './OriginalMarketEconomy.mjs';
import type {OriginalIndustryCommodityEntry} from './OriginalIndustryCommodityPass.mjs';
export interface OriginalConstructionQueueState {objectRef:string;items:{objectRef:string;industryId:string;cost:number}[]}
export interface OriginalConstructionQueueMarket {constructionQueueState?:OriginalConstructionQueueState|null;industryLifecycle?:{queue:OriginalConstructionQueueState}|null;constructionQueue:string[];industries:OriginalIndustryCommodityEntry[];maxIndustries:EconomyBonus;playerOwned:boolean}
export interface OriginalConstructionQueueRow {objectRef:string;entry:OriginalIndustryCommodityEntry;buildCostOverride:number|null}
export interface OriginalConstructionQueueRuntime<R extends OriginalConstructionQueueRow> {instantiate(id:string):R;isAvailable(row:R):boolean;add(id:string):R;startBuilding(row:R):void;refundCredits(cost:number):void;message(row:R,kind:'started'|'cancelled',cost:number|null):void}
export function validateOriginalConstructionQueue(m:OriginalConstructionQueueMarket):OriginalConstructionQueueState;
export function originalConstructionIndustryCount<R extends OriginalConstructionQueueRow>(m:OriginalConstructionQueueMarket,runtime:Pick<OriginalConstructionQueueRuntime<R>,'instantiate'>):number;
export function buildNextOriginalConstructionQueue<R extends OriginalConstructionQueueRow>(m:OriginalConstructionQueueMarket,runtime:OriginalConstructionQueueRuntime<R>):string|null;
export function editOriginalConstructionQueue(m:OriginalConstructionQueueMarket,id:string,action:'up'|'down'|'front'|'back'|'remove'):void;
