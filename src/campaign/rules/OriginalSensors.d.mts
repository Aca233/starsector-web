import type {EconomyBonus} from './OriginalMarketEconomy.mjs';
import type {OriginalFleetStats} from './OriginalNativeFleetStats.mjs';
import type {OriginalRouteSpace,OriginalRouteVector} from './OriginalRouteSpace.mjs';
export type OriginalVisibilityLevel='NONE'|'SENSOR_CONTACT'|'COMPOSITION_DETAILS'|'COMPOSITION_AND_FACTION_DETAILS';
export interface OriginalSensorSettings {sensorRangeMax:number;sensorRangeMaxHyper:number;detectionRangeTransponderMult:number;detectionRangeDetailsMult:number;detectionRangeDetailsAlwaysMult:number;detectionRangeDetailsAlwaysNonFleet:number;detectionRangeDetailsAlwaysMin:number;baseFleetSelectionRadius:number;fleetSelectionRadiusPerUnitSize:number;maxFleetSelectionRadius:number;easySensorBonus:number}
export const ORIGINAL_SENSORS:Readonly<{schemaVersion:1;originalReference:string;scope:string;sources:Record<string,{sha256:string}>;settings:OriginalSensorSettings}>;
export interface OriginalSensorEnvironment {sensorsOn:boolean;difficulty:string;hyperspaceRef:string|null;settings?:OriginalSensorSettings}
export interface OriginalSensorEntity {isFleet:boolean;isPlayerFleet:boolean;locationRef:string|null;position:OriginalRouteVector;radius:number;ghost:boolean;sensorProfile:number|null;sensorStrength:number|null;transponderOn:boolean;extendedDetectedAtRange:number|null;detectionRangeDetailsOverrideMult:number|null;detectedRangeMod:EconomyBonus;sensorRangeMod:EconomyBonus;detectedByPlayerRangeMult:number}
export interface OriginalSensorFleet {objectRef:string;sensorProfile:number|null;sensorStrength:number|null;transponderOn:boolean;counts:{fleetSizeNum:number};stats:OriginalFleetStats|null}
export interface OriginalFleetSensorState {scope:'native-route-fleet-sensors';schemaVersion:1;sensorsOn:boolean;difficulty:string;fleets:{objectRef:string;tags:string[];extendedDetectedAtRange:number|null;fleet:OriginalSensorFleet}[];unresolved:string[]}
export function originalFleetSensorRadius(fleet:Pick<OriginalSensorFleet,'counts'>,settings?:OriginalSensorSettings):number;
export function originalMaxSensorRange(observer:OriginalSensorEntity,target:OriginalSensorEntity,env:OriginalSensorEnvironment):number;
export function originalSensorVisibility(observer:OriginalSensorEntity,target:OriginalSensorEntity,env:OriginalSensorEnvironment):OriginalVisibilityLevel;
export function bindOriginalSensorFleet(state:OriginalFleetSensorState,fleet:OriginalSensorFleet,options?:{checkCaptured?:boolean}):void;
export function restoreCapturedOriginalFleetSensors(capture:OriginalFleetSensorState,playerFleet?:OriginalSensorFleet|null):OriginalFleetSensorState;
export function validateOriginalFleetSensors(state:OriginalFleetSensorState,options?:{allowUnresolved?:boolean;playerFleet?:OriginalSensorFleet|null}):OriginalFleetSensorState;
export function originalFleetSensorEntity(state:OriginalFleetSensorState,space:OriginalRouteSpace,ref:string,settings?:OriginalSensorSettings,playerFleetRef?:string|null):OriginalSensorEntity;
export function originalRouteFleetVisibility(state:OriginalFleetSensorState,space:OriginalRouteSpace,targetRef:string,observerRef?:string|null):OriginalVisibilityLevel;

export function registerOriginalConstructedSensorFleet(state:OriginalFleetSensorState,fleet:import('./OriginalCampaignFleet.mjs').OriginalConstructedCampaignFleet):void;

export function originalRouteFleetVisibilityForPlayer(state:OriginalFleetSensorState,space:OriginalRouteSpace,targetRef:string,playerRef:string,observerRef?:string):OriginalVisibilityLevel;
