import type {JsonValue} from '../Types.js';
export type OriginalCampaignPickPriority='CORE_GENERAL'|'MOD_GENERAL'|'CORE_SET'|'MOD_SET'|'CORE_SPECIFIC'|'MOD_SPECIFIC'|'HIGHEST';
export type OriginalCampaignPickHook='navigation'|'assignment'|'strategic'|'tactical'|'fleetInflater';
export const ORIGINAL_CAMPAIGN_PICK_PRIORITIES:readonly OriginalCampaignPickPriority[];
export interface OriginalCampaignPluginDescriptor {objectRef:string;classId:string;id:string|null;transient:boolean;data:JsonValue}
export interface OriginalCampaignPluginRegistry {scope:'native-campaign-plugin-registry';plugins:OriginalCampaignPluginDescriptor[];revision:number}
export interface OriginalCampaignPickServices<T=object> {readCampaignPluginPick?(plugin:OriginalCampaignPluginDescriptor,hook:OriginalCampaignPickHook,args:{fleet:object;ai?:object;params?:object}):{plugin:T|null;priority:OriginalCampaignPickPriority|null}|null;createCampaignDefaultInflater?(fleet:object,params:object):T|null}
export function createOriginalCampaignPluginRegistry():OriginalCampaignPluginRegistry;
export function validateOriginalCampaignPluginRegistry(state:OriginalCampaignPluginRegistry):OriginalCampaignPluginRegistry;
export function createOriginalCoreCampaignPlugin(objectRef:string):OriginalCampaignPluginDescriptor;
export function addOriginalCampaignPlugin(state:OriginalCampaignPluginRegistry,plugin:OriginalCampaignPluginDescriptor):void;
export function removeOriginalCampaignPlugin(state:OriginalCampaignPluginRegistry,id:string|null):void;
export function pickOriginalCampaignPlugin<T=object>(state:OriginalCampaignPluginRegistry,hook:OriginalCampaignPickHook,args:{fleet:object;ai?:object;params?:object},services?:OriginalCampaignPickServices<T>):T|null;
