import type {OriginalFader} from './OriginalFader.mjs';
export interface OriginalCampaignMessage {id:string;dataRef:string;text:string;color:number[];icon:string|null;memberRef:string|null;extra:string|null;count:number|null;highlight:string|null;merge:{prefix:string;textPrefix:string;textSuffix:string}|null}
export interface OriginalCampaignMessageRow extends OriginalCampaignMessage {elapsed:number;fader:OriginalFader}
export interface OriginalCampaignMessages {scope:'native-campaign-message-list';rows:OriginalCampaignMessageRow[]}
export const ORIGINAL_CAMPAIGN_MESSAGES:{version:string;layout:{left:number;bottom:number;pad:number;infoWidth:number;iconHeight:number;iconGap:number;rowPadding:number;showDuration:number;fadeIn:number;fadeOut:number;maxFrameSeconds:number};colors:{enemy:number[];highlight:number[]};repairsIcon:string;sound:string};
export function createOriginalCampaignMessages():OriginalCampaignMessages;
export function originalCampaignMessageFromEffect(id:string,dataRef:string,effect:Record<string,unknown>):OriginalCampaignMessage;
export function addOriginalCampaignMessage(list:OriginalCampaignMessages,message:OriginalCampaignMessage):{added:boolean;merged:number;sounds:number};
export function advanceOriginalCampaignMessages(list:OriginalCampaignMessages,seconds:number):OriginalCampaignMessages;
export function hoverOriginalCampaignMessageIcon(list:OriginalCampaignMessages,id:string):void;
