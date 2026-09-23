import type {OriginalFactionDoctrine,OriginalFactionDoctrines} from './OriginalFactionDoctrine.mjs';
import type {OriginalJavaRandomState} from './OriginalJavaRandom.mjs';
export type OriginalShipPickMode='ALL'|'IMPORTED'|'PRIORITY_ONLY'|'PRIORITY_THEN_ALL';
export interface OriginalShipPickParams {mode:OriginalShipPickMode;maxFP:number;timestamp:string|null;blockFallback:boolean|null}
export interface OriginalShipRolePick {variantId:string;weight:number}
export interface OriginalShipRole {objectRef:string;roleId:string;entries:string[];fallback:{roleId:string;count:number}|null;fallback2:{roleId:string;count:number}|null}
export interface OriginalShipRoleCatalogue {defaults:Record<string,string>;factions:Record<string,Record<string,string>>;byRef:Record<string,OriginalShipRole>;entries:Record<string,{objectRef:string;variantId:string;weight:number}>}
export interface OriginalFactionShipMembership {objectRef:string;factionId:string;knownShips:string[];priorityShips:string[];shipsWhenImporting:string[];restrictToVariants:string[];overriddenHulls:string[];variantOverrides:Record<string,number>;hullFrequency:Record<string,number>;shipTimestamps:Record<string,string>;autoEnableKnownShips:boolean}
export interface OriginalShipSelectionCapture {scope:'native-faction-ship-selection-inputs';entries:OriginalFactionShipMembership[];unresolved:string[]}
export interface OriginalShipSelectionState {scope:'native-current-ship-selection';schemaVersion:1;catalogue:OriginalShipRoleCatalogue;variants:Record<string,{hullId:string;fp:number}>;factions:(OriginalFactionShipMembership&{doctrine:OriginalFactionDoctrine;cache:Record<'normal'|'imported'|'priority',Record<string,{entryRef:string;weight:number}[]>>})[]}
export interface OriginalShipSelectionReference {schemaVersion:1;originalReference:string;scope:string;sources:Record<string,{sha256:string}>;devMode:boolean;roles:OriginalShipRoleCatalogue;variants:OriginalShipSelectionState['variants'];definitions:Record<string,Pick<OriginalFactionShipMembership,'knownShips'|'priorityShips'|'shipsWhenImporting'|'overriddenHulls'|'variantOverrides'|'hullFrequency'>>}
export const ORIGINAL_SHIP_SELECTION:Readonly<OriginalShipSelectionReference>;
export function restoreOriginalShipSelection(capture:OriginalShipSelectionCapture,doctrines:OriginalFactionDoctrines,reference?:OriginalShipSelectionReference):OriginalShipSelectionState;
export function validateOriginalShipSelection(state:OriginalShipSelectionState,doctrines?:OriginalFactionDoctrines|null):OriginalShipSelectionState;
export function clearOriginalShipRoleCache(state:OriginalShipSelectionState,factionId:string):void;
export function originalShipRoleAvailability(state:OriginalShipSelectionState,factionId:string,roleId:string,mode:OriginalShipPickMode):{count:number;weight:number};
export function pickOriginalShipRole(state:OriginalShipSelectionState,factionId:string,roleId:string|null,params:OriginalShipPickParams,random:OriginalJavaRandomState,filter?:((variantId:string)=>boolean)|null):OriginalShipRolePick[];
