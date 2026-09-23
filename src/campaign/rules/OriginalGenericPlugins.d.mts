import type {JsonValue} from '../Types.js';
export const ORIGINAL_GENERIC_PLUGIN_TYPE:'com.fs.starfarer.api.campaign.GenericPluginManagerAPI$GenericPlugin';
export const ORIGINAL_GENERIC_PLUGIN_PRIORITIES:Readonly<{CORE_GENERAL:0;MOD_GENERAL:100;CORE_SUBSET:200;MOD_SUBSET:300;CORE_SPECIFIC:400;MOD_SPECIFIC:500;HIGHEST:2147483647}>;
export interface OriginalGenericPluginDescriptor {
 objectRef:string;
 /** Exact native class identity, not a superclass/interface. Distinct class loaders need distinct IDs. */
 classId:string;
 /** Complete class/superclass/interface closure; no guessed subclasses. */
 types:string[];
 data:JsonValue;
}
/** Exact Web checkpoint of BOTH current repositories, not Java's transient-dropping native save format. */
export interface OriginalGenericPluginManager {
 scope:'native-generic-plugin-manager';
 objects:OriginalGenericPluginDescriptor[];
 /** Saved repository insertion order. */plugins:string[];
 /** Current transient repository insertion order; absence means unknown, not empty. */transientPlugins:string[];
}
export interface OriginalGenericPluginServices<Params=unknown> {readGenericPluginPriority?(plugin:OriginalGenericPluginDescriptor,params:Params):number}
export function createOriginalGenericPluginDescriptor(objectRef:string,classId:string,types?:string[],data?:JsonValue):OriginalGenericPluginDescriptor;
export function createOriginalGenericPluginManager():OriginalGenericPluginManager;
export function validateOriginalGenericPluginManager(state:OriginalGenericPluginManager):OriginalGenericPluginManager;
export function addOriginalGenericPlugin(state:OriginalGenericPluginManager,plugin:OriginalGenericPluginDescriptor,isTransient?:boolean):void;
export function removeOriginalGenericPlugin(state:OriginalGenericPluginManager,plugin:OriginalGenericPluginDescriptor):void;
export function originalGenericPluginsOfClass(state:OriginalGenericPluginManager,typeId:string):OriginalGenericPluginDescriptor[];
export function hasOriginalGenericPlugin(state:OriginalGenericPluginManager,classId:string):boolean;
/** Returns the actual selected descriptor or null; reader is mandatory only when candidates exist. */
export function pickOriginalGenericPlugin<Params=unknown>(state:OriginalGenericPluginManager,typeId:string,params:Params,services?:OriginalGenericPluginServices<Params>):OriginalGenericPluginDescriptor|null;
