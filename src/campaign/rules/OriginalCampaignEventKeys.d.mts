export interface OriginalCampaignEventTarget {scope:'native-campaign-event-target';custom:unknown;location:object|null;entity:object|null;extra:unknown}
export interface OriginalCampaignEventKey {eventType:string;target:OriginalCampaignEventTarget}
export interface OriginalCampaignEventKeyServices {eventValueHashCode?(value:unknown):number;eventValueEquals?(one:unknown,two:unknown):boolean}
export interface OriginalCampaignEventMap<T=object> {capacity:number;entries:{key:OriginalCampaignEventKey;hash:number;probability:T}[]}
export function originalEventStringHash(value:string):number;
export function createOriginalCampaignEventTarget(input?:{custom?:unknown;location?:object|null;entity?:object|null;extra?:unknown}):OriginalCampaignEventTarget;
export function validateOriginalCampaignEventTarget(target:OriginalCampaignEventTarget):OriginalCampaignEventTarget;
export function originalCampaignEventTargetEquals(one:OriginalCampaignEventTarget|null,two:OriginalCampaignEventTarget|null,services?:OriginalCampaignEventKeyServices):boolean;
export function originalCampaignEventKeyHash(key:OriginalCampaignEventKey,services?:OriginalCampaignEventKeyServices):number;
export function originalCampaignEventMapEntry<T>(map:OriginalCampaignEventMap<T>,key:OriginalCampaignEventKey,services?:OriginalCampaignEventKeyServices):OriginalCampaignEventMap<T>['entries'][number]|null;
export function putOriginalCampaignEventMap<T>(map:OriginalCampaignEventMap<T>,key:OriginalCampaignEventKey,probability:T,services?:OriginalCampaignEventKeyServices):OriginalCampaignEventMap<T>['entries'][number];
export function removeOriginalCampaignEventMap<T>(map:OriginalCampaignEventMap<T>,key:OriginalCampaignEventKey,services?:OriginalCampaignEventKeyServices):boolean;
export function originalCampaignEventMapKeys(map:OriginalCampaignEventMap):OriginalCampaignEventKey[];
export function validateOriginalCampaignEventMap<T>(map:OriginalCampaignEventMap<T>):OriginalCampaignEventMap<T>;
