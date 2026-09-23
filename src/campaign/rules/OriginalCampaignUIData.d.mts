import type {OriginalCampaignInterval} from './OriginalCampaignInterval.mjs';
/** Only the fields consumed by CampaignUIPersistentData.advance. */
export interface OriginalCampaignUIDataFrame {scope:'native-campaign-ui-data-frame';musicSuppressor:{maxLevel:number;currLevel:number};cleanupTracker:OriginalCampaignInterval}
export interface OriginalCampaignUIDataServices {convertUISecondsToDays?(seconds:number):number;randomDouble?():number;cleanupIntelData?():void}
export function createOriginalCampaignUIDataFrame(randomDouble:()=>number):OriginalCampaignUIDataFrame;
export function validateOriginalCampaignUIDataFrame(state:OriginalCampaignUIDataFrame):OriginalCampaignUIDataFrame;
export function suppressOriginalCampaignMusic(state:OriginalCampaignUIDataFrame,level:number):void;
export function cleanupOriginalIntelTabData():void;
export function advanceOriginalCampaignUIDataFrame(state:OriginalCampaignUIDataFrame,seconds:number,context:{paused:boolean},services:OriginalCampaignUIDataServices):void;
