import type {OriginalIntelSpatialServices} from './OriginalIntelCommunications.mjs';
export interface OriginalBaseIntelFields {scope:'native-base-intel-plugin';objectRef:string;classId:string;important:boolean|null;timestamp:string|null;neverClicked:boolean|null;listInfoParam:unknown;ended:boolean|null;ending:boolean|null;endingTimeRemaining:number|null;postingLocation:object|null;postingRangeLY:number|null;tagsForSort:string[]|null;hidden:boolean|null;forceAdd:boolean|null}
export interface OriginalBaseIntel extends OriginalBaseIntelFields {classId:'base'|'new-messages';num?:number}
export function validateOriginalBaseIntelFields<T extends OriginalBaseIntelFields>(item:T):T;
export interface OriginalBaseIntelServices {convertIntelSecondsToDays?(seconds:number):number;notifyIntelEnding?(item:OriginalBaseIntelFields):void;notifyIntelEnded?(item:OriginalBaseIntelFields):void;advanceIntelImpl?(item:OriginalBaseIntelFields,seconds:number):void}
export function createOriginalBaseIntel(objectRef:string):OriginalBaseIntel;
export function createOriginalNewMessagesIntel(objectRef:string,num:number):OriginalBaseIntel;
export function validateOriginalBaseIntel(item:OriginalBaseIntel):OriginalBaseIntel;
export function originalIntelEnded(item:OriginalBaseIntelFields):boolean;
export function originalIntelEnding(item:OriginalBaseIntelFields):boolean;
export function originalIntelShouldRemove(item:OriginalBaseIntelFields):boolean;
export function originalIntelHidden(item:OriginalBaseIntelFields,tutorial:boolean):boolean;
export function setOriginalIntelForceAdd(item:OriginalBaseIntelFields,value:boolean):void;
export function endOriginalBaseIntel(item:OriginalBaseIntelFields,days?:number,services?:OriginalBaseIntelServices):void;
export function advanceOriginalBaseIntel(item:OriginalBaseIntelFields,seconds:number,services:OriginalBaseIntelServices):void;
export function originalBaseIntelCanMakeVisible(item:OriginalBaseIntelFields,inRelay:boolean,context:{location:object|null;hyperPosition:[number,number];commSniffer:boolean},services:OriginalIntelSpatialServices):boolean;
