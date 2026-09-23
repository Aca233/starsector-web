import type {EconomyBonus} from './OriginalMarketEconomy.mjs';
import type {OriginalNativeFleet} from './OriginalFleetData.mjs';
export interface OriginalTopographyEvent {scope:'native-hyperspace-topography-effects';objectRef:string;progress:number;stages:{objectRef:string;id:string|null;progress:number}[]}
export interface OriginalSensorArray {objectRef:string;tags:string[];factionRef:string|null;factionId:string|null}
export interface OriginalTopographySystem {objectRef:string;location:{x:number;y:number};sensorArrays:OriginalSensorArray[]}
export interface OriginalTopographyLocation {currentLocationRef:string;hyperspaceRef:string}
export interface OriginalTopographyWorld {scope:'native-topography-world-inputs';location:OriginalTopographyLocation|null;systems:OriginalTopographySystem[]|null;unresolved:string[]}
export interface OriginalSlipstreamDetection {scope:'native-slipstream-detection-stat';statsRef:string;bonus:{objectRef:string;kind:'bonus';value:EconomyBonus;temporary:[];descriptions:Record<'flat'|'percent'|'mult',Record<string,string|null>>}|null}
export interface OriginalTopographyMarket {hidden:boolean;playerOwned:boolean;size:number;location:{x:number;y:number};industries:{state:{industryId:string};operating:{disrupted:boolean;building:boolean;upgradeId:string|null}}[];slipstreamDetection?:OriginalSlipstreamDetection|null}
export function originalTopographyStageActive(event:OriginalTopographyEvent,stage:string):boolean;
export function originalSensorArrayBonus(market:Pick<OriginalTopographyMarket,'location'>,systems:OriginalTopographySystem[],range?:number):number;
export function updateOriginalTopographyMarketRanges(event:OriginalTopographyEvent,markets:OriginalTopographyMarket[],systems:OriginalTopographySystem[]):{visited:number;modified:number};
export function applyOriginalTopographyFleetEffects(event:OriginalTopographyEvent,fleet:OriginalNativeFleet,location:OriginalTopographyLocation):{slipstream:boolean;burnBonus:boolean};
export function refreshOriginalHyperspaceTopography(event:OriginalTopographyEvent,runtime:{markets:OriginalTopographyMarket[];systems:OriginalTopographySystem[];playerFleet:OriginalNativeFleet;location:OriginalTopographyLocation}):{market:{visited:number;modified:number};fleet:{slipstream:boolean;burnBonus:boolean}};
export function restoreOriginalTopographyWorld(world:OriginalTopographyWorld):OriginalTopographyWorld;
