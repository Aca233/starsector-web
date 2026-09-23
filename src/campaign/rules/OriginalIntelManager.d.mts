export interface OriginalIntelPlugin {objectRef:string}
export interface OriginalIntelMessageIntent {scope:'native-intel-message-intent';sequence:string;item:OriginalIntelPlugin;action:'INTEL_TAB';target:OriginalIntelPlugin|'New'}
export interface OriginalIntelManager {scope:'native-intel-manager';commQueue:OriginalIntelPlugin[];intel:OriginalIntelPlugin[];messageIntents:OriginalIntelMessageIntent[];nextMessageSequence:string;nextSummaryIdentity:string}
export interface OriginalIntelManagerContext {paused:boolean;playerFleet:object|null}
export interface OriginalIntelManagerServices {
 isIntelEnded?(item:OriginalIntelPlugin):boolean;setIntelTimestamp?(item:OriginalIntelPlugin,timestamp:string):void;readIntelClockTimestamp?():string;
 reportIntelMadeVisible?(item:OriginalIntelPlugin):void;reportIntelRemoved?(item:OriginalIntelPlugin):void;notifyIntelScreenOpening?(item:OriginalIntelPlugin):void;
 autoAddIntelCampaignMessage?(item:OriginalIntelPlugin):boolean;addIntelCampaignMessage?(item:OriginalIntelPlugin,target:OriginalIntelPlugin|'New'):void;addIntelToTextPanel?(item:OriginalIntelPlugin,textPanel:object):void;
 shouldRemoveIntel?(item:OriginalIntelPlugin):boolean;isPlayerInIntelRelayRange?(player:object):boolean;canMakeIntelVisible?(item:OriginalIntelPlugin,inRelay:boolean):boolean;forceAddIntelNextFrame?(item:OriginalIntelPlugin):boolean;setIntelForceAddNextFrame?(item:OriginalIntelPlugin,value:boolean):void;createNewMessagesIntel?(num:number):OriginalIntelPlugin;
}
export function createOriginalIntelManager():OriginalIntelManager;
export function validateOriginalIntelManager(state:OriginalIntelManager,related?:OriginalIntelPlugin[]):OriginalIntelManager;
export function enqueueOriginalIntelMessageIntent(state:OriginalIntelManager,item:OriginalIntelPlugin,target:OriginalIntelPlugin|'New'):OriginalIntelMessageIntent;
export function queueOriginalIntel(state:OriginalIntelManager,item:OriginalIntelPlugin,delay?:number):void;
export function unqueueOriginalIntel(state:OriginalIntelManager,item:OriginalIntelPlugin):boolean;
export function addOriginalIntel(state:OriginalIntelManager,item:OriginalIntelPlugin,silent:boolean,textPanel:object|null,services:OriginalIntelManagerServices):void;
export function removeOriginalIntel(state:OriginalIntelManager,item:OriginalIntelPlugin,services:OriginalIntelManagerServices):void;
export function clearOriginalIntelManager(state:OriginalIntelManager):void;
export function notifyOriginalIntelScreenOpening(state:OriginalIntelManager,services:OriginalIntelManagerServices):void;
export function removeOriginalExpiredIntel(state:OriginalIntelManager,services:OriginalIntelManagerServices):void;
export function advanceOriginalIntelManager(state:OriginalIntelManager,seconds:number,context:OriginalIntelManagerContext,services:OriginalIntelManagerServices):void;
