import type {OriginalBaseCampaignEntity,OriginalFleetConstructionFaction,OriginalCampaignResources} from './OriginalCampaignFleet.mjs';
import type {OriginalPlayerEconomyState,OriginalPlayerCargo} from './OriginalPlayerEconomy.mjs';
import type {OriginalNativeFleet} from './OriginalFleetData.mjs';
import type {OriginalJavaRandomState} from './OriginalJavaRandom.mjs';
export interface OriginalCargoPods {scope:'native-custom-campaign-entity';objectRef:string;id:string;type:'cargo_pods';entity:OriginalBaseCampaignEntity;position:[number,number];faction:OriginalFleetConstructionFaction;cargo:OriginalPlayerCargo;spec:object;width:number;height:number;radius:number;sheetCellX:number;sheetCellY:number;sprite:null;shadowMask:null;layers:string[];firstLayer:string|null;fleetForVisual:null;worldRegistered:boolean;plugin:{scope:'native-cargo-pods-plugin';entity:OriginalCargoPods;elapsed:number;maxDays:number;extraDays:number;neverExpire:boolean|null;manager:{scope:'native-generic-field-item-manager';entity:OriginalCargoPods;items:OriginalCargoPodFieldItem[]|null;inited:boolean;numPieces:number;category:string;key:string;cellSize:number;minSize:number;maxSize:number}}}
export interface OriginalCargoPodsConstructionServices {resources:OriginalCampaignResources;createCargo(objectRef:string):OriginalPlayerCargo;createMothballedShips(prefix:string|null,factionId:string):OriginalNativeFleet}
export function isOriginalCargoPods(object:unknown):object is OriginalCargoPods;
export function createOriginalCargoPods(player:OriginalPlayerEconomyState,faction:OriginalFleetConstructionFaction,lightSource:object|null,services:OriginalCargoPodsConstructionServices):OriginalCargoPods;
export function initializeOriginalCargoPodsDrift(pod:OriginalCargoPods,position:[number,number],mathRandom:OriginalJavaRandomState):OriginalCargoPods;
export function updateOriginalCargoPodsSize(pod:OriginalCargoPods):void;
export function validateOriginalCargoPods(pod:OriginalCargoPods):OriginalCargoPods;

export interface OriginalCargoPodFieldItem {scope:'native-generic-field-item';entity:OriginalCargoPods;width:number;height:number;cellX:number;cellY:number;loc:[number,number];vel:[number,number];timeLeft:number;facing:number;angVel:number;fader:import('./OriginalFader.mjs').OriginalFader}

export type OriginalCargoPodsFieldManager=OriginalCargoPods['plugin']['manager'];
export function validateOriginalCargoPodsField(pod:OriginalCargoPods,manager:OriginalCargoPodsFieldManager):OriginalCargoPodsFieldManager;
