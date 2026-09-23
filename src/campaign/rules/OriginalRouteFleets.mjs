/** RouteManager.spawnAndDespawn. Real factory/despawn/sensor hooks are required when reached; never synthesize fleets. */
import {requireThat,immutableJSON} from '../core/Values.mjs';
import {validateOriginalPatrolState} from './OriginalMilitaryPatrols.mjs';
import {validateOriginalRouteSpace,originalRouteEntity,originalRouteShouldSpawn,originalRouteShouldDespawn} from './OriginalRouteSpace.mjs';
const check=(v,m)=>requireThat(v,'UNSUPPORTED_ROUTE_FLEET_LIFECYCLE',m);
function invoke(runtime,name,...args){check(typeof runtime[name]==='function','Actual route fleet service required: '+name);const value=runtime[name](...args);check(!value?.then,'Native route callback must return synchronously: '+name);return value;}
export function expireOriginalRoute(route){if(route.segments.length)route.current=route.segments.at(-1);if(route.current!==null)route.current.elapsed=route.current.daysMax;}
export function nextOriginalRouteSegment(route,from){const index=route.segments.indexOf(route.current),at=route.segments.indexOf(from);if(at<0||at<index)return;if(at<route.segments.length-1)route.current=route.segments[at+1];else{check(route.current!==null,'Native current segment is null');route.current.elapsed=route.current.daysMax;}}
/** Native handler removes only the first match, and keeps the route when PLAYER_FAR_AWAY. */
export function reportOriginalRouteFleetDespawned(state,fleetRef,reason){validateOriginalPatrolState(state);if(reason==='PLAYER_FAR_AWAY')return null;const at=state.routes.findIndex(r=>r.activeFleetRef!==null&&r.activeFleetRef===fleetRef);if(at<0)return null;return state.routes.splice(at,1)[0].objectRef;}
export function advanceOriginalRouteFleetPhase(state,space,runtime={}){
 validateOriginalPatrolState(state);validateOriginalRouteSpace(space);
 const result={scope:'route-manager-spawn-despawn-phase',spawned:[],despawned:[],expired:[],observed:[]};if(space.playerFleetRef===null)return immutableJSON(result);
 const player=originalRouteEntity(space,space.playerFleetRef);
 for(const route of [...state.routes]){
  if(route.activeFleetRef!==null){const e=originalRouteEntity(space,route.activeFleetRef);check(e.fleet,'Actual active fleet state required');if(e.locationRef===player.locationRef){
   const level=invoke(runtime,'visibilityToPlayer',e.objectRef);check(['NONE','SENSOR_CONTACT','COMPOSITION_DETAILS','COMPOSITION_AND_FACTION_DETAILS'].includes(level),'Actual visibility enum required');
   if(['COMPOSITION_DETAILS','COMPOSITION_AND_FACTION_DETAILS'].includes(level)&&e.fleet.wasMousedOverByPlayer!==null){route.daysSinceSeenByPlayer=0;result.observed.push(route.objectRef);}
  }}
  if(originalRouteShouldDespawn(space,route)){
   check(typeof route.spawnerRef==='string','Actual non-null route spawner required');
   if(route.spawnerKind!=='MilitaryBase')invoke(runtime,'reportAboutToBeDespawned',route);
   const ref=route.activeFleetRef;invoke(runtime,'despawnFleet',ref,'PLAYER_FAR_AWAY',null);
   const after=originalRouteEntity(space,route.activeFleetRef);if(after.locationRef!==null)invoke(runtime,'removeEntity',after.locationRef,after.objectRef);
   // BaseLocation.removeObject does NOT clear containingLocation. The actual world/renderer hook owns removal.
   route.activeFleetRef=null;result.despawned.push(ref);continue;
  }
  if(!originalRouteShouldSpawn(space,route))continue;
  check(typeof route.spawnerRef==='string','Actual non-null route spawner required');
  const ref=invoke(runtime,'spawnFleet',route);check(ref===null||typeof ref==='string','Actual created fleet identity or null required');route.activeFleetRef=ref;
  if(ref!==null){const e=originalRouteEntity(space,ref);check(e.fleet,'Factory must register its actual fleet before returning');if(e.nativeFleet||typeof runtime.addFleetEventListener==='function')invoke(runtime,'addFleetEventListener',ref,state);else (e.fleet.eventListenerRefs??=[]).push(state.objectRef);result.spawned.push(ref);}
  else{expireOriginalRoute(route);result.expired.push(route.objectRef);}
 }
 return immutableJSON(result);
}
