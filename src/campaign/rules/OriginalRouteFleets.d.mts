import type {DeepReadonly} from '../Types.js';
import type {OriginalPatrolState,OriginalPatrolRoute,OriginalRouteSegment} from './OriginalMilitaryPatrols.mjs';
import type {OriginalRouteSpace} from './OriginalRouteSpace.mjs';
export interface OriginalRouteFleetRuntime {
 /** Required for a bound current world fleet; appends the actual RouteManager listener, not a ref-only projection. */
 addFleetEventListener?(fleetRef:string,state:OriginalPatrolState):void;
 worldServices?:import('./OriginalFleetWorld.mjs').OriginalFleetWorldServices;
 visibilityToPlayer?(fleetRef:string):'NONE'|'SENSOR_CONTACT'|'COMPOSITION_DETAILS'|'COMPOSITION_AND_FACTION_DETAILS';
 reportAboutToBeDespawned?(route:OriginalPatrolRoute):void;
 /** Must build/register a real fleet. Returning null is the native factory failure, not missing service. */
 spawnFleet?(route:OriginalPatrolRoute):string|null;
 /** Must execute actual global/local listeners and native fleet teardown. */
 despawnFleet?(fleetRef:string,reason:'PLAYER_FAR_AWAY',param:null):void;
 /** Must remove world/location/renderer membership; native does not clear containingLocation. */
 removeEntity?(locationRef:string,fleetRef:string):void;
}
export interface OriginalRouteManagerServices extends OriginalRouteFleetRuntime {shouldCancelAfterDelay?(route:OriginalPatrolRoute):boolean;shouldRepeat?(route:OriginalPatrolRoute):boolean}
export interface OriginalRouteFleetPhaseResult {scope:'route-manager-spawn-despawn-phase';spawned:string[];despawned:string[];expired:string[];observed:string[]}
export function expireOriginalRoute(route:OriginalPatrolRoute):void;
export function nextOriginalRouteSegment(route:OriginalPatrolRoute,from:OriginalRouteSegment):void;
export function reportOriginalRouteFleetDespawned(state:OriginalPatrolState,fleetRef:string,reason:string):string|null;
export function advanceOriginalRouteFleetPhase(state:OriginalPatrolState,space:OriginalRouteSpace,runtime?:OriginalRouteFleetRuntime):DeepReadonly<OriginalRouteFleetPhaseResult>;
