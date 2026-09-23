import type {OriginalPatrolRoute,OriginalRouteSegment} from './OriginalMilitaryPatrols.mjs';
export interface OriginalRouteVector {x:number;y:number}
export interface OriginalRouteLocation {objectRef:string;classAlias:string;positionRef:string|null;position:OriginalRouteVector|null;centerRef:string|null}
export interface OriginalRouteSpatialEntity {nativeFleet?:import('./OriginalCampaignFleet.mjs').OriginalConstructedCampaignFleet;objectRef:string;classAlias:string;positionRef:string|null;position:OriginalRouteVector|null;locationRef:string|null;fleet:{battleRef:string|null;noAutoDespawn:boolean|null;wasMousedOverByPlayer:boolean|null;eventListenerRefs:string[]|null}|null}
export interface OriginalRouteSpace {scope:'native-route-spatial-closure';schemaVersion:1;hyperspaceRef:string|null;playerFleetRef:string|null;entities:OriginalRouteSpatialEntity[];locations:OriginalRouteLocation[];unresolved:string[]}
export function validateOriginalRouteSpace(state:OriginalRouteSpace,options?:{allowUnresolved?:boolean}):OriginalRouteSpace;
export function restoreCapturedOriginalRouteSpace(capture:OriginalRouteSpace):OriginalRouteSpace;
export function originalRouteEntity(state:OriginalRouteSpace,ref:string):OriginalRouteSpatialEntity;
export function originalEntityHyperPosition(state:OriginalRouteSpace,ref:string):OriginalRouteVector;
export function originalRouteProgress(state:OriginalRouteSpace,segment:OriginalRouteSegment,phase?:'overall'|'leave'|'enter'|'transit'):number;
export function originalRouteContainingLocation(state:OriginalRouteSpace,segment:OriginalRouteSegment):string|null;
export function originalRouteHyperPosition(state:OriginalRouteSpace,route:OriginalPatrolRoute):OriginalRouteVector;
export function originalRouteDistanceLY(a:OriginalRouteVector,b:OriginalRouteVector):number;
export function originalRouteShouldSpawn(state:OriginalRouteSpace,route:OriginalPatrolRoute):boolean;
export function originalRouteShouldDespawn(state:OriginalRouteSpace,route:OriginalPatrolRoute):boolean;
export function setOriginalRouteFleetMousedOver(state:OriginalRouteSpace,ref:string,value:boolean|null):void;

export function bindOriginalRouteWorldFleet(state:OriginalRouteSpace,fleet:import('./OriginalCampaignFleet.mjs').OriginalConstructedCampaignFleet):OriginalRouteSpatialEntity;
