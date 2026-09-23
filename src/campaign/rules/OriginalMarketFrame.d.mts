import type {EconomyMutable} from './OriginalMarketEconomy.mjs';
import type {OriginalCampaignMemory} from './OriginalCampaignMemory.mjs';
export interface OriginalMarketFrameState {scope:'native-market-frame';marketRef:string;daysInExistence:number;memory:OriginalCampaignMemory|null;submarkets:{objectRef:string}[]}
export interface OriginalMarketConditionBinding {condition:{id:string;modId:string};pluginState:unknown;objectRef:string}
export interface OriginalMarketFrameServices {
 readConditions?(market:object):OriginalMarketConditionBinding[];conditionRunsWhilePaused?(binding:OriginalMarketConditionBinding):boolean;advanceCondition?(market:object,binding:OriginalMarketConditionBinding,seconds:number):void;removeSpecificCondition?(market:object,binding:OriginalMarketConditionBinding):void;
 reapplyConditions?(market:object):void;reapplyIndustries?(market:object):void;advanceSubmarket?(market:object,submarket:object,seconds:number):void;advanceMarketMemory?(market:object,memory:OriginalCampaignMemory,seconds:number):void;
 readMarketPeople?(market:object):(object|string)[]|null;advanceMarketPerson?(person:object|string,seconds:number):void;readCurrentlyBeingConstructed?(market:object):object|null;buildNextInQueue?(market:object):void;advanceIndustry?(market:object,industry:object,seconds:number):void;
}
export function validateOriginalTemporaryStat(stat:EconomyMutable,temporary:{id:string;timeRemaining:number}[]):{id:string;timeRemaining:number}[];
export function advanceOriginalTemporaryStat(stat:EconomyMutable,temporary:{id:string;timeRemaining:number}[],days:number):void;
export function advanceOriginalMarketCommodity(commodity:object,days:number):void;
export function updateOriginalMarketPriceCalculators(market:object):void;
export function originalMarketConditionRunsWhilePaused(binding:OriginalMarketConditionBinding):boolean;
export function advanceOriginalMarketCondition(market:object,binding:OriginalMarketConditionBinding,seconds:number,days:number,services:OriginalMarketFrameServices):void;
export function createOriginalMarketFrame(market:{objectRef:string},daysInExistence:number,memory:OriginalCampaignMemory|null,submarkets:{objectRef:string}[]):OriginalMarketFrameState;
export function validateOriginalMarketFrame(state:OriginalMarketFrameState,market:{objectRef:string}):OriginalMarketFrameState;
export function advanceOriginalPausedMarketConditions(markets:object[],seconds:number,skipMarketAdvance:boolean,services:OriginalMarketFrameServices):void;
export function advanceOriginalMarketFrame(market:object,state:OriginalMarketFrameState,seconds:number,days:number,services:OriginalMarketFrameServices):void;
