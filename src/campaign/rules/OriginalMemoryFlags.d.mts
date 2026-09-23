import type {OriginalCampaignMemory,OriginalCampaignMemoryServices} from './OriginalCampaignMemory.mjs';
export interface OriginalMemoryFlagClosure {scope:'native-memory-flag-closure';objectRef:string;roots:string[];keys:string[];data:{key:string;value:{type:string;text:string}}[];requirements:{objectRef:string;key:string;requiredKeys:string[]}[];requiredFor:{key:string;parentKey:string}[];expires:{objectRef:string;key:string;timeLeft:number}[];nextObjectId:number;unresolved:string[]}
export interface OriginalMemoryFlagView {scope:'native-memory-flag-view';objectRef:string;roots:string[];keys:string[];unresolved:string[];memory:OriginalCampaignMemory}
export type OriginalMemoryFlags=OriginalMemoryFlagClosure|OriginalMemoryFlagView;
export function bindOriginalMemoryFlags(memory:OriginalMemoryFlags,complete:OriginalCampaignMemory):OriginalMemoryFlagView;
export function validateOriginalMemoryFlags(memory:OriginalMemoryFlags):OriginalMemoryFlags;
export function setOriginalMemoryFlagWithReason(memory:OriginalMemoryFlags,flagKey:string,reason:string,value:boolean,expiry?:number,services?:OriginalCampaignMemoryServices):boolean;
export function originalMemoryFlagPresent(memory:OriginalMemoryFlags,key:string,services?:OriginalCampaignMemoryServices):boolean;
export function originalMemoryFlagBoolean(memory:OriginalMemoryFlags,key:string,services?:OriginalCampaignMemoryServices):boolean;
export function originalMemoryFlagExpire(memory:OriginalMemoryFlags,key:string):number;
export function setOriginalMemoryTrue(memory:OriginalMemoryFlags,key:string,expiry:number):void;
export function unsetOriginalMemoryFlag(memory:OriginalMemoryFlags,key:string,services?:OriginalCampaignMemoryServices):void;
export function advanceOriginalMemoryFlags(memory:OriginalMemoryFlags,days:number,paused?:boolean):string[];
