import type {OriginalFactionDoctrine} from './OriginalFactionDoctrine.mjs';
import type {OriginalJavaRandomState} from './OriginalJavaRandom.mjs';
import type {OriginalShipPickMode,OriginalShipPickParams,OriginalShipRolePick} from './OriginalShipSelection.mjs';
export interface OriginalFleetCompositionState {scope:'native-fleet-composition-runtime';sizeOverride:number}
export interface OriginalFleetCompositionParams {
 combatPts:number;freighterPts:number;tankerPts:number;transportPts:number;linerPts:number;utilityPts:number;
 minShipSize:number;maxShipSize:number;doctrineOverride:OriginalFactionDoctrine|null;
 ignoreMarketFleetSizeMult:boolean|null;onlyApplyFleetSizeToCombatShips:boolean|null;forceAllowPhaseShipsEtc:boolean|null;
 treatCombatFreighterSettingAsFraction:boolean|null;doNotPrune:boolean|null;doNotAddShipsBeforePruning:boolean|null;
 maxNumShips:number|null;addShips:string[]|null;timestamp:string|null;blockFallback:boolean|null;
 mode:OriginalShipPickMode;banPhaseShipsEtc:boolean;
}
export interface OriginalFleetCompositionReference {
 schemaVersion:1;originalReference:string;scope:string;sources:Record<string,{sha256:string}>;
 constants:{BASE_COUNTS_WITH_4:readonly (readonly number[])[];MAX_EXTRA_WITH_4:readonly (readonly number[])[];BASE_COUNTS_WITH_3:readonly (readonly number[])[];MAX_EXTRA_WITH_3:readonly (readonly number[])[];FLEET_POINTS_THRESHOLD_FOR_ANNOYING_SHIPS:number;MIN_NUM_SHIPS_DEFICIT_MULT:number;BASE_QUALITY_WHEN_NO_MARKET:number};
 settings:{maxShipsInAIFleet:number};
}
/** Bind these to actual FleetData/FleetMember behavior, including naming RNG and mutation listeners. */
export interface OriginalFleetCompositionServices<Member extends object=object> {
 doctrine():OriginalFactionDoctrine;isPlayerFaction():boolean;marketSizeMult():number;
 roleAvailability(role:string,mode:OriginalShipPickMode):{count:number;weight:number};
 pickShipsForRole(role:string,params:OriginalShipPickParams,random:OriginalJavaRandomState):OriginalShipRolePick[];
 createMember(variantId:string):Member;pickShipName(member:Member,random:OriginalJavaRandomState):string;
 setShipName(member:Member,name:string):void;addMember(member:Member):void;removeMember(member:Member):void;
 membersCopy():Member[];numMembers():number;sortFleet():void;
 memberFP(member:Member):number;memberCivilian(member:Member):boolean;
 /** Native HullSize ordinal: DEFAULT 0, FIGHTER 1, FRIGATE 2, DESTROYER 3, CRUISER 4, CAPITAL_SHIP 5. */
 memberHullSize(member:Member):number;memberHints(member:Member):readonly string[];
}
export interface OriginalFleetCompositionContext<Member extends object=object> {
 state:OriginalFleetCompositionState;params:OriginalFleetCompositionParams;random:OriginalJavaRandomState;
 services:Partial<OriginalFleetCompositionServices<Member>>;reference?:OriginalFleetCompositionReference;
}
export type OriginalFleetSizeFilter='NONE'|'SMALL_IS_FRIGATE'|'SMALL_IS_DESTROYER';
export const ORIGINAL_FLEET_COMPOSITION:Readonly<OriginalFleetCompositionReference>;
export function createOriginalFleetCompositionState():OriginalFleetCompositionState;
export function validateOriginalFleetCompositionState(state:OriginalFleetCompositionState):OriginalFleetCompositionState;
export function createOriginalFleetCompositionParams(input:Partial<OriginalFleetCompositionParams>&{mode:OriginalShipPickMode}):OriginalFleetCompositionParams;
export function composeOriginalFleetRoster<Member extends object>(ctx:OriginalFleetCompositionContext<Member>):void;
export function originalCompositionFleetFP<Member extends object>(ctx:OriginalFleetCompositionContext<Member>):number;
export function addOriginalFleetPoints<Member extends object>(ctx:OriginalFleetCompositionContext<Member>,fp:number,sizeFilter:OriginalFleetSizeFilter,roles:readonly [string,string,string]):number;
export function addOriginalPriorityFleetPoints<Member extends object>(ctx:OriginalFleetCompositionContext<Member>,fp:number,sizeFilter:OriginalFleetSizeFilter,roles:readonly [string,string,string]):number;
export function addOriginalCombatFleetPoints<Member extends object>(ctx:OriginalFleetCompositionContext<Member>,warshipFP:number,carrierFP:number,phaseFP:number):void;
export function pruneOriginalFleet<Member extends object>(ctx:OriginalFleetCompositionContext<Member>,maxShips:number,targetFP:number):void;
