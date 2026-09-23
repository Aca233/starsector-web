import type {OriginalFader} from './OriginalFader.mjs';
export interface OriginalCampaignPingSpec {id:string|null;sounds:(string|null)[];color:number[]|null;minRange:number;range:number;duration:number;delay:number;width:number;alphaMult:number;inFraction:number;num:number;invert:boolean;useFactionColor:boolean}
export interface OriginalPingOptions {pingType:string|null;custom:OriginalCampaignPingSpec|null;colorOverride:number[]|null}
export interface OriginalPingFields extends OriginalPingOptions {entity:object;spec:OriginalCampaignPingSpec}
export interface OriginalActionIndicator extends OriginalPingFields {scope:'native-campaign-action-indicator';fader:OriginalFader}
export interface OriginalPingScript extends OriginalPingFields {scope:'native-campaign-ping-script';numLeft:number;timeLeft:number}
export interface OriginalPingSound {kind:'campaign-sound';id:string;position:number[];velocity:number[];pitch:1;volume:1}
export interface OriginalPingServices {readPingSpec?(id:string):OriginalCampaignPingSpec;readLocationEntityState?(entity:object):{position:number[];velocity:number[];containingLocation:object|null};addPingIndicator?(indicator:OriginalActionIndicator):void}
export function originalCampaignPingSpec(id:string):OriginalCampaignPingSpec;
export function validateOriginalPingSpec(spec:OriginalCampaignPingSpec):OriginalCampaignPingSpec;
export function createOriginalActionIndicator(entity:object,options:OriginalPingOptions,services?:OriginalPingServices):OriginalActionIndicator;
export function validateOriginalActionIndicator(state:OriginalActionIndicator):OriginalActionIndicator;
export function advanceOriginalActionIndicator(state:OriginalActionIndicator,seconds:number):void;
export function originalActionIndicatorCanCleanUp(state:OriginalActionIndicator):boolean;
export function createOriginalPingScript(entity:object,options:OriginalPingOptions,context:{currentLocation:object|null},services?:OriginalPingServices):{script:OriginalPingScript;effects:OriginalPingSound[]};
export function validateOriginalPingScript(state:OriginalPingScript):OriginalPingScript;
export function originalPingScriptIsDone(state:OriginalPingScript):boolean;
export function advanceOriginalPingScript(state:OriginalPingScript,seconds:number,context:{currentLocation:object|null},services?:OriginalPingServices):OriginalPingSound[];
