import type {OriginalCampaignEventTarget} from './OriginalCampaignEventKeys.mjs';
export interface OriginalBaseCampaignEvent {scope:'native-base-campaign-event';kind:'base-campaign-event';objectRef:string;id:string;eventType:string|null;eventTarget:OriginalCampaignEventTarget|null;market:object|null;entity:object|null;faction:object|null;statModId:string|null;started:boolean;memory:object|null;startProbability:number}
export interface OriginalBaseCampaignEventServices {nextBaseEventUID?():string;readBaseEventEntityMarket?(entity:object):object|null;readBaseEventEntityFaction?(entity:object):object|null;readBaseEventMarketId?(market:object):string;addBaseEventListener?(event:OriginalBaseCampaignEvent):void;removeBaseEventListener?(event:OriginalBaseCampaignEvent):void}
export function createOriginalBaseCampaignEvent(objectRef:string,id:string):OriginalBaseCampaignEvent;
export function validateOriginalBaseCampaignEvent(event:OriginalBaseCampaignEvent):OriginalBaseCampaignEvent;
export function setOriginalBaseCampaignEventTarget(event:OriginalBaseCampaignEvent,target:OriginalCampaignEventTarget,services:OriginalBaseCampaignEventServices):void;
export function initializeOriginalBaseCampaignEvent(event:OriginalBaseCampaignEvent,type:string,target:OriginalCampaignEventTarget,services:OriginalBaseCampaignEventServices,addListener?:boolean):void;
export function startOriginalBaseCampaignEvent(event:OriginalBaseCampaignEvent,services:OriginalBaseCampaignEventServices,addListener?:boolean):void;
export function cleanupOriginalBaseCampaignEvent(event:OriginalBaseCampaignEvent,services:OriginalBaseCampaignEventServices):void;
